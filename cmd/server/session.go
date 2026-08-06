package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"kallia/internal/voip/call"
	"kallia/internal/voip/core"
	"kallia/internal/voip/media"
	"kallia/internal/voip/signaling"
	"kallia/internal/voip/wanode"
	"kallia/internal/wa"

	"database/sql"
	"encoding/hex"

	"github.com/mdp/qrterminal/v3"
	"go.mau.fi/whatsmeow"
	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"
)

type Session struct {
	id        string
	name      string
	mgr       *SessionManager
	log       *slog.Logger
	projectID string
	apiKey    string

	// client é atômico: replaceClient (logout/pair) troca a instância enquanto
	// handlers HTTP e eventos a leem — sem lock isso era um data race.
	client atomic.Pointer[whatsmeow.Client]
	reg    *callRegistry

	// store próprio desta sessão (1 banco por sessão, estilo WAHA)
	waContainer *sqlstore.Container
	waDB        *sql.DB

	mu       sync.Mutex
	auth     AuthSnapshot
	webhook  string
	chatwoot ChatwootConfig
	aiConfig AIConfig
}

// getClient devolve o cliente whatsmeow atual (seguro para leitura concorrente).
func (s *Session) getClient() *whatsmeow.Client {
	return s.client.Load()
}

func (s *Session) setWebhook(url string) {
	s.mu.Lock()
	s.webhook = url
	s.mu.Unlock()
}

func (s *Session) getWebhook() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.webhook
}

func (s *Session) setChatwoot(c ChatwootConfig) {
	s.mu.Lock()
	s.chatwoot = c
	s.mu.Unlock()
}

func (s *Session) getChatwoot() ChatwootConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.chatwoot
}

func (s *Session) setAIConfig(c AIConfig) {
	s.mu.Lock()
	s.aiConfig = c
	s.mu.Unlock()
}

func (s *Session) getAIConfig() AIConfig {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.aiConfig
}

func newSession(mgr *SessionManager, id, name, projectID, apiKey string, client *whatsmeow.Client) *Session {
	s := &Session{
		id:        id,
		name:      name,
		mgr:       mgr,
		log:       mgr.log.With("session", id),
		projectID: projectID,
		apiKey:    apiKey,
		auth:      AuthSnapshot{State: "connecting"},
		reg:       newCallRegistry(),
	}
	s.client.Store(client)
	client.AddEventHandler(s.handleEvent)
	return s
}

func (s *Session) createCall(callID string) *call.CallManager {
	cm := call.NewCallManager(wa.NewSocket(s.getClient()), s.log)
	s.wireCall(cm, callID)
	s.reg.add(callID, &activeCall{cm: cm})
	return cm
}

func (s *Session) wireCall(cm *call.CallManager, callID string) {
	callStartTime := time.Now()
	peerInfo := ""
	if existing, _ := s.mgr.broker.getCall(callID); existing != nil {
		peerInfo = existing.Peer
	}
	rec, err := NewServerAudioRecorder(filepath.Join("storage", "recordings"), callID, peerInfo)
	if err != nil {
		s.log.Error("falha ao criar gravador de áudio no servidor", "callId", callID, "err", err)
	}

	cm.SetOnIncoming(func(c *call.CallInfo) {
		s.mgr.broker.upsertCall(CallRecord{
			SessionID: s.id, CallID: c.CallID, Direction: "inbound", Peer: c.PeerJid,
			StartedAt: time.Now().UnixMilli(), Status: StatusRinging,
		})
		s.mgr.broker.emitIncoming(s.id, c.CallID, c.PeerJid)
	})
	cm.AddStateListener(func(c *call.CallInfo) {
		if c.IsEnded() {
			s.removeCall(c.CallID)
			s.mgr.broker.endCall(c.CallID, string(c.StateData.EndReason))
			return
		}
		dir := "outbound"
		if c.Direction == core.CallDirectionIncoming {
			dir = "inbound"
		}
		peerPhone := c.PeerJid
		if c.CallerPn != "" {
			peerPhone = c.CallerPn
		}
		if idx := strings.Index(peerPhone, "@"); idx >= 0 {
			peerPhone = peerPhone[:idx]
		}
		// Se peerPhone for LID (>13 dígitos), tenta resolver para telefone real
		if len(peerPhone) > 13 {
			if real := s.realPhone(types.NewJID(peerPhone, "lid")); real != "" && real != peerPhone {
				peerPhone = real
			}
		}
		existing, _ := s.mgr.broker.getCall(c.CallID)
		recRecord := CallRecord{
			SessionID: s.id, CallID: c.CallID, Direction: dir, Peer: peerPhone,
			StartedAt: time.Now().UnixMilli(), Status: mapStatus(c.StateData.State),
		}
		if existing != nil {
			recRecord.Owner = existing.Owner
			recRecord.StartedAt = existing.StartedAt
			if existing.Peer != "" && len(peerPhone) > 13 {
				recRecord.Peer = existing.Peer
			}
		}
		s.mgr.broker.upsertCall(recRecord)
	})
	cm.SetOnEnded(func(c *call.CallInfo) {
		if rec != nil {
			rec.Close()
			recURL := fmt.Sprintf("/api/sessions/%s/recordings/%s", s.id, c.CallID)
			_ = s.mgr.store.updateCallRecording(context.Background(), s.id, c.CallID, recURL)
		}

		s.removeCall(c.CallID)
		s.mgr.broker.endCall(c.CallID, string(c.StateData.EndReason))
		if s.mgr.Scheduler != nil {
			s.mgr.Scheduler.CleanupAgent(c.CallID)
		}

		// Disparo de automações NPS e Missed Follow-up
		cfg := s.getAIConfig()
		durationSec := int(time.Since(callStartTime).Seconds())
		peerPhone := c.PeerJid
		if c.CallerPn != "" {
			peerPhone = c.CallerPn
		}
		if c.StateData.State == core.CallStateActive || durationSec > 5 {
			if s.mgr.nps != nil {
				s.mgr.nps.ScheduleNPS(s.id, c.CallID, peerPhone, durationSec, cfg.NPS)
			}
		} else {
			if s.mgr.followup != nil {
				s.mgr.followup.ScheduleFollowup(s.id, c.CallID, peerPhone, cfg.MissedFollowup)
			}
		}
	})

	if rec != nil {
		cm.AddPeerAudioListener(rec.WriteInbound)
		cm.AddOutgoingAudioListener(rec.WriteOutbound)
	}

	cm.SetOnPeerAudio(func(pcm16 []float32) {
		bridge, browserOpus, ok := s.reg.getBridge(callID)
		if !ok || bridge == nil || browserOpus == nil {
			return
		}
		// O browserOpus agora opera a 16kHz, evitando crash no resampler SILK da lib opus_mlow.
		// Fatiamos em chunks de 320 amostras (20ms a 16kHz) para codificação segura.
		fs := browserOpus.FrameSize() // fs = 320
		for off := 0; off+fs <= len(pcm16); off += fs {
			opus, err := browserOpus.Encode(pcm16[off : off+fs])
			if err != nil {
				s.log.Error("OnPeerAudio: Encode failed", "err", err)
				continue
			}
			if len(opus) == 0 {
				continue
			}
			// Envia cada chunk de 20ms
			err = bridge.WriteOpus(opus, 20*time.Millisecond)
			if err != nil {
				s.log.Error("OnPeerAudio: WriteOpus failed", "err", err)
			}
		}
	})
}

// attachServerAI registra um listener que acopla um ServerAIAgent assim que a
// chamada ficar ativa (uma única vez, mesmo se o estado Active for emitido mais
// de uma vez). peerFn resolve o telefone do peer no momento do acoplamento.
// Substitui o antigo padrão "ler → embrulhar → reatribuir OnStateChange",
// que tinha data race e podia perder wrappers concorrentes.
func (s *Session) attachServerAI(cm *call.CallManager, callID, direction string, cfg AIConfig, peerFn func(info *call.CallInfo) string) {
	var once sync.Once
	cm.AddStateListener(func(info *call.CallInfo) {
		if info.IsEnded() || info.StateData.State != core.CallStateActive {
			return
		}
		once.Do(func() {
			goSafe(s.log, func() {
				peer := ""
				if peerFn != nil {
					peer = peerFn(info)
				}
				agent := NewServerAIAgent(s, callID, peer, direction, cm, cfg, s.log)
				if err := agent.Start(s.mgr.appCtx); err != nil {
					s.log.Error("[ServerAI] Erro ao iniciar agente", "err", err, "callId", callID, "direction", direction)
					return
				}
				if s.mgr.Scheduler != nil {
					s.mgr.Scheduler.RegisterAgent(callID, agent)
				}
				s.log.Info("[ServerAI] Agente IA acoplado à chamada", "callId", callID, "direction", direction)
			})
		})
	})
}

func (s *Session) startOutgoing(ctx context.Context, peer types.JID, isVideo bool) (string, error) {
	callID := signaling.GenerateCallID()
	cm := s.createCall(callID)
	if err := cm.StartCall(ctx, callID, peer, isVideo); err != nil {
		s.removeCall(callID)
		return "", err
	}
	return callID, nil
}

func (s *Session) callForEvent(from types.JID, data *waBinary.Node) (*activeCall, bool) {
	node := wrapCall(from, data)
	callID := callIDFromNode(node)
	if callID != "" {
		if ac, ok := s.reg.get(callID); ok {
			return ac, true
		}
	}
	if data != nil {
		if cid := wanode.AttrString(data.Attrs, "call-id"); cid != "" {
			if ac, ok := s.reg.get(cid); ok {
				return ac, true
			}
		}
	}

	// Fallback 1: se houver apenas 1 chamada ativa nesta sessão, vincula ao evento recebido
	s.reg.mu.Lock()
	defer s.reg.mu.Unlock()
	if len(s.reg.calls) == 1 {
		for _, ac := range s.reg.calls {
			return ac, true
		}
	}

	// Fallback 2: se houver múltiplas chamadas, tenta casar por JID/LID/User
	fromUser := from.User
	for _, ac := range s.reg.calls {
		curr := ac.cm.CurrentCall()
		if curr != nil {
			if strings.Contains(curr.PeerJid, fromUser) || strings.Contains(curr.CallerPn, fromUser) {
				return ac, true
			}
		}
	}

	return nil, false
}

func (s *Session) onIncomingOffer(ctx context.Context, evt *events.CallOffer) {
	node := wrapCall(evt.From, evt.Data)
	callID := callIDFromNode(node)
	if callID == "" {
		return
	}

	// Salva o nome de contato do WhatsApp (push name) trazido no offer, se presente
	if evt.Data != nil {
		if notify, ok := evt.Data.Attrs["notify"].(string); ok && notify != "" {
			cli := s.getClient()
			if cli != nil && cli.Store != nil && cli.Store.Contacts != nil {
				_, _, _ = cli.Store.Contacts.PutPushName(ctx, evt.From.ToNonAD(), notify)
			}
		}
	}

	// Auto-upsert no banco de dados do CRM (executado de forma assíncrona em background para não atrasar a sinalização)
	if s.mgr != nil && s.mgr.store != nil {
		goSafe(s.log, func() {
			phone := s.realPhone(evt.From)
			name := ""
			if evt.Data != nil {
				if notify, ok := evt.Data.Attrs["notify"].(string); ok {
					name = notify
				}
			}
			lid := ""
			if evt.From.Server == types.HiddenUserServer {
				lid = evt.From.User
			}
			c := ContactRecord{
				SessionID: s.id,
				Phone:     phone,
				Name:      name,
				LID:       lid,
				JID:       evt.From.String(),
			}
			if cli := s.getClient(); cli != nil && cli.Store != nil && cli.Store.Contacts != nil {
				if contact, err := cli.Store.Contacts.GetContact(context.Background(), evt.From.ToNonAD()); err == nil && contact.Found {
					if c.Name == "" {
						if contact.FullName != "" {
							c.Name = contact.FullName
						} else if contact.BusinessName != "" {
							c.Name = contact.BusinessName
						} else if contact.PushName != "" {
							c.Name = contact.PushName
						}
					}
				}
			}
			_, _ = s.mgr.store.upsertContact(context.Background(), c)
			s.enrichSingleContactAsync(phone)
		})
	}

	// Filtrar chamadas antigas (sincronização de histórico/offline)
	callTime := evt.Timestamp
	if callTime.IsZero() {
		// Fallback para ler o atributo 't' (timestamp) do XML do CallOffer
		info := signaling.ExtractNodeInfo(node)
		if info != nil && info.Timestamp != "" {
			if tSec, err := strconv.ParseInt(info.Timestamp, 10, 64); err == nil {
				callTime = time.Unix(tSec, 0)
			}
		}
	}

	if !callTime.IsZero() && time.Since(callTime) > 1*time.Minute {
		s.log.Info("ignoring old incoming call offer (history/offline sync)", "callId", callID, "timestamp", callTime, "age", time.Since(callTime))
		return
	}

	// Detectar se a chamada provém de outro servidor / companion (dispositivo > 0)
	isServerCall := false
	if i := strings.Index(evt.From.String(), ":"); i >= 0 {
		if at := strings.Index(evt.From.String(), "@"); at > i {
			dev := evt.From.String()[i+1 : at]
			if dev != "0" && dev != "" {
				isServerCall = true
			}
		}
	}

	if isServerCall {
		s.log.Info("Incoming call detected from another server/companion device", "peerJid", evt.From.String())
		if envStr("KALLIA_REJECT_COMPANION_CALLS", "WACALLS_REJECT_COMPANION_CALLS", "") == "true" {
			s.log.Info("Rejecting server call due to KALLIA_REJECT_COMPANION_CALLS=true", "callId", callID)
			info := signaling.ExtractNodeInfo(node)
			if info != nil {
				creator := wanode.AttrString(info.InnerNode.Attrs, "call-creator")
				if creator == "" {
					creator = evt.From.String()
				}
				reject := signaling.BuildRejectStanza(evt.From, info.CallID, wanode.MustJID(creator))
				_ = wa.NewSocket(s.getClient()).SendNode(ctx, reject)
				s.log.Info("inbound call rejected: server/companion call block active", "call_id", info.CallID)
			}
			return
		}
	}

	if max := s.mgr.maxCalls; max > 0 && s.reg.count() >= max {
		s.rejectOffer(ctx, node, evt.From)
		return
	}
	cm := s.createCall(callID)
	cm.HandleCallOffer(ctx, node, evt.From)

	// Se a chave E2E não pôde ser decriptada (sessão Signal corrompida),
	// envia mensagem protocolar ao LID do peer para forçar re-estabelecimento.
	// DecryptCallKey já deletou nossa sessão; agora forçamos o PEER a atualizar
	// enviando um pkmsg (pre-key message) que substitui a sessão dele.
	if info := cm.CurrentCall(); info != nil && info.EncryptionKey == nil {
		go func() {
			client := s.getClient()
			if client == nil {
				return
			}
			lid := evt.From.ToNonAD()
			s.log.Warn("E2E key decrypt failed — forcing LID session re-establishment", "lid", lid.String())
			_, err := client.SendMessage(context.Background(), lid, &waE2E.Message{
				ProtocolMessage: &waE2E.ProtocolMessage{
					Type: waE2E.ProtocolMessage_INITIAL_SECURITY_NOTIFICATION_SETTING_SYNC.Enum(),
				},
			})
			if err != nil {
				s.log.Error("session reset send failed", "lid", lid.String(), "err", err)
			} else {
				s.log.Info("session reset message sent — next call from this peer should work", "lid", lid.String())
			}
		}()
	}

	// Resolve o telefone real APÓS o offer para não atrasar a sinalização
	callerPn := evt.From.User
	if evt.From.Server != types.DefaultUserServer {
		if evt.CallCreatorAlt.Server == types.DefaultUserServer && evt.CallCreatorAlt.User != "" {
			callerPn = evt.CallCreatorAlt.User
		} else {
			callerPn = s.realPhone(evt.From)
		}
	}
	if info := cm.CurrentCall(); info != nil {
		info.CallerPn = callerPn
	}
	if callerPn != "" {
		s.mgr.broker.updateCall(callID, func(rec *CallRecord) {
			rec.Peer = callerPn
		})
	}

	// Auto-atendimento server-side: aceita e acopla IA automaticamente
	config := s.getAIConfig()
	if config.ServerSideAI && config.AutoAnswer && config.GeminiAPIKey != "" {
		s.log.Info("[ServerAI] Agendando auto-atendimento", "callId", callID, "peer", evt.From.String(), "delay", config.AutoAnswerDelay)

		// Aceita a chamada com delay opcional
		goSafe(s.log, func() {
			if config.AutoAnswerDelay > 0 {
				time.Sleep(time.Duration(config.AutoAnswerDelay) * time.Second)

				// Verifica se a chamada ainda existe no registro
				ac, ok := s.reg.get(callID)
				if !ok {
					s.log.Info("[ServerAI] Chamada não encontrada após delay, abortando auto-atendimento", "callId", callID)
					return
				}

				// Verifica se a chamada ainda está tocando e não foi atendida ou cancelada
				callInfo := ac.cm.CurrentCall()
				if callInfo == nil || callInfo.IsEnded() || callInfo.StateData.State != core.CallStateIncomingRinging {
					s.log.Info("[ServerAI] Chamada não está mais tocando após delay, abortando", "callId", callID)
					return
				}

				// Verifica se algum operador já assumiu a chamada no broker
				existingRecord, _ := s.mgr.broker.getCall(callID)
				if existingRecord != nil && existingRecord.Owner != nil && *existingRecord.Owner != "" && *existingRecord.Owner != serverOwnerID {
					s.log.Info("[ServerAI] Chamada já foi assumida por operador humano, abortando", "callId", callID, "owner", *existingRecord.Owner)
					return
				}
			}

			s.log.Info("[ServerAI] Auto-atendendo chamada recebida", "callId", callID, "peer", evt.From.String())

			// Marca owner como servidor
			s.mgr.broker.setOwner(callID, serverOwnerID)
			s.mgr.broker.emitIncomingClaimed(s.id, callID, serverOwnerID)

			if err := cm.AcceptCall(ctx, callID); err != nil {
				s.log.Error("[ServerAI] Erro ao aceitar chamada", "err", err, "callId", callID)
				return
			}

			// Acopla o agente assim que a chamada ficar ativa
			s.attachServerAI(cm, callID, "inbound", config, func(info *call.CallInfo) string {
				if callerPn != "" {
					return callerPn
				}
				return info.PeerJid
			})
		})
	}
}

func (s *Session) rejectOffer(ctx context.Context, node *waBinary.Node, from types.JID) {
	info := signaling.ExtractNodeInfo(node)
	if info == nil {
		return
	}
	creator := wanode.AttrString(info.InnerNode.Attrs, "call-creator")
	if creator == "" {
		creator = from.String()
	}
	reject := signaling.BuildRejectStanza(from, info.CallID, wanode.MustJID(creator))
	_ = wa.NewSocket(s.getClient()).SendNode(ctx, reject)
	s.log.Info("inbound call rejected: session at capacity", "call_id", info.CallID)
}

func (s *Session) handleEvent(rawEvt any) {
	ctx := context.Background()
	switch evt := rawEvt.(type) {
	case *events.Connected:
		if id := s.getClient().Store.ID; id != nil {
			_ = s.mgr.store.setJID(s.mgr.appCtx, s.id, id.String())
		}
		s.setAuth(AuthSnapshot{State: "open", Paired: true})
	case *events.LoggedOut:
		s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
	case *events.Message:
		if !evt.Info.Timestamp.IsZero() && time.Since(evt.Info.Timestamp) > 1*time.Hour {
			break
		}
		sender := evt.Info.Sender.String()
		if s.mgr.followup != nil {
			s.mgr.followup.CancelFollowup(sender)
		}
		if evt.Message.GetPollUpdateMessage() != nil {
			go s.handlePollVote(ctx, evt)
			break
		}
		text := evt.Message.GetConversation()
		if text == "" && evt.Message.ExtendedTextMessage != nil {
			text = evt.Message.ExtendedTextMessage.GetText()
		}
		if s.mgr.nps != nil && text != "" {
			if s.mgr.nps.HandleIncomingMessage(s.id, sender, text) {
				s.log.Info("resposta de NPS capturada com sucesso", "sender", sender)
			}
		}
		s.dispatchWebhook("message", summarizeMessage(evt))
		go s.chatwootPushIncoming(evt)
	case *events.Receipt:
		if !evt.Timestamp.IsZero() && time.Since(evt.Timestamp) > 1*time.Hour {
			break
		}
		s.dispatchWebhook("receipt", map[string]any{
			"chat": evt.Chat.String(), "sender": evt.Sender.String(),
			"type": string(evt.Type), "ids": evt.MessageIDs,
			"timestamp": evt.Timestamp.UnixMilli(),
		})
	case *events.CallOffer:
		s.onIncomingOffer(ctx, evt)
	case *events.CallAccept:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			if currCall := ac.cm.CurrentCall(); currCall != nil {
				if currCall.Direction == core.CallDirectionOutgoing {
					ac.cm.HandleCallAccept(ctx, wrapCall(evt.From, evt.Data), evt.From)
				} else if currCall.Direction == core.CallDirectionIncoming {
					s.log.Info("incoming call accepted elsewhere (via CallAccept event)", "call_id", currCall.CallID)
					termNode := wrapCall(evt.From, &waBinary.Node{
						Tag:   "terminate",
						Attrs: waBinary.Attrs{"call-id": currCall.CallID, "reason": "accepted_elsewhere"},
					})
					ac.cm.HandleCallTerminate(termNode)
				}
			}
		}
	case *events.CallTransport:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			ac.cm.HandleCallTransport(ctx, wrapCall(evt.From, evt.Data), evt.From)
		}
	case *events.CallTerminate:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			ac.cm.HandleCallTerminate(wrapCall(evt.From, evt.Data))
		}
	case *events.CallReject:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			ac.cm.HandleCallTerminate(wrapCall(evt.From, evt.Data))
		}
	}
}

func (s *Session) connect(ctx context.Context) error {
	if s.getClient().Store.ID != nil {
		return s.getClient().Connect()
	}
	return s.startPairing(ctx)
}

func (s *Session) startPairing(ctx context.Context) error {
	osName := "Kallia"
	if s.name != "" {
		osName = "Kallia (" + s.name + ")"
	}
	store.SetOSInfo(osName, [3]uint32{1, 0, 0})
	qrChan, err := s.getClient().GetQRChannel(ctx)
	if err != nil {
		return err
	}
	if err := s.getClient().Connect(); err != nil {
		return err
	}
	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				s.log.Info("scan the QR code to pair this session")
				qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
				s.setAuth(AuthSnapshot{State: "qr", QR: evt.Code})
				s.mgr.broker.emitSessionQR(s.id, evt.Code)
			case "success":
				if id := s.getClient().Store.ID; id != nil {
					_ = s.mgr.store.setJID(s.mgr.appCtx, s.id, id.String())
				}
				s.setAuth(AuthSnapshot{State: "open", Paired: true})
			case "timeout":
				s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
			}
		}
	}()
	return nil
}

func (s *Session) setAuth(a AuthSnapshot) {
	s.mu.Lock()
	s.auth = a
	s.mu.Unlock()
	s.mgr.broker.emitAuthState(s.id, a)
	s.mgr.broker.emitSessionList(s.mgr.infos())
}

func (s *Session) info() SessionInfo {
	s.mu.Lock()
	a := s.auth
	s.mu.Unlock()
	jid := ""
	if id := s.getClient().Store.ID; id != nil {
		jid = id.String()
	}
	return SessionInfo{
		ID:        s.id,
		Name:      s.name,
		JID:       jid,
		State:     a.State,
		Paired:    a.Paired || jid != "",
		ProjectID: s.projectID,
		APIKey:    s.apiKey,
	}
}

func (s *Session) IsPaired() bool {
	client := s.getClient()
	return client != nil && client.Store != nil && client.Store.ID != nil
}

func (s *Session) SendMessage(ctx context.Context, to types.JID, text string) (whatsmeow.SendResponse, error) {
	client := s.getClient()
	if client == nil {
		return whatsmeow.SendResponse{}, fmt.Errorf("cliente whatsmeow indisponível")
	}
	return client.SendMessage(ctx, to, &waE2E.Message{
		Conversation: proto.String(text),
	})
}

func (s *Session) setBridge(callID string, b *Bridge, oc media.Codec) {
	oldB, oldOC, found := s.reg.setBridge(callID, b, oc)
	if !found {
		b.Close()
		if oc != nil {
			oc.Close()
		}
		return
	}
	if oldB != nil {
		oldB.Close()
	}
	if oldOC != nil {
		oldOC.Close()
	}
}

func (s *Session) removeCall(callID string) {
	ac, ok := s.reg.remove(callID)
	if !ok {
		return
	}
	if ac.bridge != nil {
		ac.bridge.Close()
	}
	if ac.browserOpus != nil {
		ac.browserOpus.Close()
	}
}

func (s *Session) terminateCall(callID string, reason core.EndCallReason) {
	ac, ok := s.reg.get(callID)
	if !ok {
		return
	}
	_ = ac.cm.EndCall(context.Background(), reason)
}

func (s *Session) teardownAllCalls() {
	for _, ac := range s.reg.drain() {
		_ = ac.cm.EndCall(context.Background(), core.EndCallReasonUserEnded)
		if ac.bridge != nil {
			ac.bridge.Close()
		}
		if ac.browserOpus != nil {
			ac.browserOpus.Close()
		}
	}
}

func (s *Session) replaceClient(client *whatsmeow.Client) {
	s.teardownAllCalls()
	s.getClient().Disconnect()
	s.client.Store(client)
	client.AddEventHandler(s.handleEvent)
}

func (s *Session) shutdown() {
	s.teardownAllCalls()
	s.getClient().Disconnect()
	if s.waDB != nil {
		_ = s.waDB.Close()
	}
}

func mapStatus(state core.CallState) CallStatus {
	switch state {
	case core.CallStateActive:
		return StatusConnected
	case core.CallStateEnded:
		return StatusEnded
	case core.CallStateInitiating:
		return StatusStarting
	default:
		return StatusRinging
	}
}

func (s *Session) handlePollVote(ctx context.Context, evt *events.Message) {
	pollUpdate := evt.Message.GetPollUpdateMessage()
	if pollUpdate == nil {
		return
	}
	pollID := pollUpdate.GetPollCreationMessageKey().GetID()
	pollVote, err := s.getClient().DecryptPollVote(ctx, evt)
	if err != nil {
		s.log.Error("falha ao descriptografar voto de enquete", "poll_id", pollID, "err", err)
		return
	}

	type voteOption struct {
		Hash string `json:"hash"`
		Text string `json:"text,omitempty"`
	}

	votes := make([]voteOption, 0, len(pollVote.GetSelectedOptions()))
	for _, optHashBytes := range pollVote.GetSelectedOptions() {
		hashHex := hex.EncodeToString(optHashBytes)
		text, err := s.mgr.store.resolvePollOption(ctx, s.id, pollID, hashHex)
		if err != nil {
			s.log.Warn("falha ao resolver hash de opcao da enquete", "hash", hashHex, "err", err)
		}
		votes = append(votes, voteOption{
			Hash: hashHex,
			Text: text,
		})
	}

	s.dispatchWebhook("poll_vote", map[string]any{
		"poll_id":   pollID,
		"sender":    evt.Info.Sender.String(),
		"chat":      evt.Info.Chat.String(),
		"timestamp": evt.Info.Timestamp.UnixMilli(),
		"votes":     votes,
	})
}

// enrichSingleContactAsync enriquece um único contato quando disparado por evento
// (ao ligar, receber ligação ou enviar/receber mensagem), respeitando a trava de 24h
// e a data de enriched_at no banco de dados.
func (s *Session) enrichSingleContactAsync(phone string) {
	if s == nil || phone == "" || s.mgr == nil || s.mgr.store == nil {
		return
	}

	goSafe(s.log, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		info := s.enrichContactInfo(ctx, phone)
		if info.Phone == "" {
			return
		}

		existing, _ := s.mgr.store.getContactByPhone(ctx, s.id, info.Phone)
		if existing == nil && info.LID != "" {
			existing, _ = s.mgr.store.getContactByPhone(ctx, s.id, info.LID)
		}

		now := time.Now()

		// Se o contato foi enriquecido nas últimas 24 horas e já tem nome e foto, pula
		if existing != nil && existing.EnrichedAt != nil && time.Since(*existing.EnrichedAt) < 24*time.Hour {
			if existing.Name != "" && existing.Name != existing.Phone && existing.AvatarURL != "" {
				return
			}
		}

		rec := ContactRecord{
			SessionID:  s.id,
			Phone:      info.Phone,
			Name:       info.Name,
			Email:      info.Email,
			Company:    info.Company,
			Notes:      info.Notes,
			AvatarURL:  info.AvatarURL,
			LID:        info.LID,
			JID:        info.JID,
			Tags:       info.Tags,
			EnrichedAt: &now,
		}

		if existing != nil {
			rec.ID = existing.ID
			if rec.Name == "" {
				rec.Name = existing.Name
			}
			if rec.AvatarURL == "" {
				rec.AvatarURL = existing.AvatarURL
			}
			if rec.Email == "" {
				rec.Email = existing.Email
			}
			if rec.Company == "" {
				rec.Company = existing.Company
			}
			if rec.Notes == "" {
				rec.Notes = existing.Notes
			}
			if rec.LID == "" {
				rec.LID = existing.LID
			}
			if rec.JID == "" {
				rec.JID = existing.JID
			}
			if rec.Tags == "" {
				rec.Tags = existing.Tags
			}
		}

		_, err := s.mgr.store.upsertContact(context.Background(), rec)
		if err != nil {
			s.log.Warn("falha ao salvar contato enriquecido", "phone", info.Phone, "err", err)
		} else {
			s.log.Info("contato enriquecido com sucesso", "phone", info.Phone, "name", info.Name, "avatar", info.AvatarURL != "")
		}
	})
}

type ContactEnrichmentResult struct {
	Phone     string
	Name      string
	AvatarURL string
	Company   string
	Email     string
	Notes     string
	LID       string
	JID       string
	Tags      string
}

func (s *Session) enrichContactInfo(ctx context.Context, peerStr string) ContactEnrichmentResult {
	res := ContactEnrichmentResult{}
	cli := s.getClient()
	if cli == nil {
		return res
	}

	var origJid types.JID
	if strings.Contains(peerStr, "@") {
		origJid, _ = types.ParseJID(peerStr)
	} else {
		clean := normalizePhone(peerStr)
		if len(clean) > 13 {
			origJid = types.NewJID(clean, types.HiddenUserServer)
		} else {
			origJid = types.NewJID(clean, types.DefaultUserServer)
		}
	}

	var pnJID types.JID
	var lidJID types.JID

	if origJid.Server == types.HiddenUserServer || len(origJid.User) > 13 {
		lidJID = origJid
		if origJid.Server != types.HiddenUserServer {
			lidJID = types.NewJID(origJid.User, types.HiddenUserServer)
		}
		realPn := s.realPhone(lidJID)
		if realPn != "" && realPn != lidJID.User && len(realPn) <= 13 {
			pnJID = types.NewJID(realPn, types.DefaultUserServer)
		} else {
			pnJID = types.NewJID(lidJID.User, types.DefaultUserServer)
		}
	} else {
		pnJID = origJid
		if origJid.Server != types.DefaultUserServer {
			pnJID = types.NewJID(origJid.User, types.DefaultUserServer)
		}
		if cli.Store != nil && cli.Store.LIDs != nil {
			if lid, err := cli.Store.LIDs.GetLIDForPN(ctx, pnJID); err == nil && !lid.IsEmpty() {
				lidJID = lid
			}
		}
	}

	res.Phone = pnJID.User
	res.JID = pnJID.String()
	if !lidJID.IsEmpty() {
		res.LID = lidJID.User
	}

	jidsToTry := make([]types.JID, 0, 2)
	if !pnJID.IsEmpty() {
		jidsToTry = append(jidsToTry, pnJID)
	}
	if !lidJID.IsEmpty() {
		jidsToTry = append(jidsToTry, lidJID)
	}

	// 1. Extração do Nome (Store local e GetUserInfo)
	if cli.Store != nil && cli.Store.Contacts != nil {
		for _, jid := range jidsToTry {
			if contact, err := cli.Store.Contacts.GetContact(ctx, jid); err == nil && contact.Found {
				if contact.FullName != "" {
					res.Name = contact.FullName
					break
				} else if contact.BusinessName != "" {
					res.Name = contact.BusinessName
					break
				} else if contact.FirstName != "" {
					res.Name = contact.FirstName
					break
				} else if contact.PushName != "" {
					res.Name = contact.PushName
					break
				}
			}
		}
	}

	if uinfo, err := cli.GetUserInfo(ctx, jidsToTry); err == nil && uinfo != nil {
		for _, jid := range jidsToTry {
			if user, ok := uinfo[jid]; ok {
				if res.Notes == "" && user.Status != "" {
					res.Notes = user.Status
				}
				if res.Name == "" && user.VerifiedName != nil && user.VerifiedName.Details != nil && user.VerifiedName.Details.GetVerifiedName() != "" {
					res.Name = user.VerifiedName.Details.GetVerifiedName()
				}
			}
		}
	}

	// 2. Extração da Foto de Perfil HD
	pfpCtx, pfpCancel := context.WithTimeout(ctx, 4*time.Second)
	defer pfpCancel()

	for _, jid := range jidsToTry {
		// Tenta imagem em alta resolução (Preview: false)
		pfp, err := cli.GetProfilePictureInfo(pfpCtx, jid, &whatsmeow.GetProfilePictureParams{
			Preview: false,
		})
		if err == nil && pfp != nil && pfp.URL != "" {
			res.AvatarURL = pfp.URL
			break
		}
		// Fallback para preview
		pfpPrev, errPrev := cli.GetProfilePictureInfo(pfpCtx, jid, &whatsmeow.GetProfilePictureParams{
			Preview: true,
		})
		if errPrev == nil && pfpPrev != nil && pfpPrev.URL != "" {
			res.AvatarURL = pfpPrev.URL
			break
		}
	}

	// 3. Extração do Perfil Comercial (Empresa / E-mail / Categoria)
	bizCtx, bizCancel := context.WithTimeout(ctx, 3*time.Second)
	defer bizCancel()
	if bizInfo, err := cli.GetBusinessProfile(bizCtx, pnJID); err == nil && bizInfo != nil {
		if len(bizInfo.Categories) > 0 && bizInfo.Categories[0].Name != "" {
			res.Company = bizInfo.Categories[0].Name
		} else if bizInfo.Address != "" {
			res.Company = bizInfo.Address
		}
		if bizInfo.Email != "" {
			res.Email = bizInfo.Email
		}
		res.Tags = "WhatsApp Business"
	}

	return res
}
