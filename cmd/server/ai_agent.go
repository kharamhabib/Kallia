package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"kallia/internal/voip/call"
	"kallia/internal/voip/core"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

const serverOwnerID = "__server__"
const maxAudioQueueSamples = 800000 // ~50 segundos a 16kHz

// toolWebhookClient executa webhooks de tools customizadas (timeout fixo, SSRF protegido).
var toolWebhookClient = safeHTTPClient(10*time.Second, false)

// geminiRestClient chama a API REST do Gemini (resumo pós-chamada) com timeout —
// antes era http.Post sem timeout, que podia pendurar a goroutine para sempre.
var geminiRestClient = &http.Client{Timeout: 60 * time.Second}

// ServerAIAgent orquestra a ponte de áudio entre o WhatsApp e o Gemini Live no servidor.
type ServerAIAgent struct {
	gemini       *GeminiLiveClient
	grok         *GrokLiveClient
	provider     string
	cm           *call.CallManager
	sess         *Session
	callID       string
	peer         string
	direction    string
	log          *slog.Logger
	config       AIConfig

	mu           sync.Mutex
	detached     bool
	transferring bool
	maxTimer     *time.Timer

	// Buffer de áudio para pacing (evitar choppy audio)
	audioQueue []float32
	queueMu    sync.Mutex
	pacedStop  chan struct{}

	// Buffer de áudio de entrada para pacer (evitar latência de VAD e eco)
	inboundQueue []float32
	inboundMu    sync.Mutex
	inboundStop  chan struct{}

	// Histórico acumulado de transcrição da chamada (persistente mesmo após fechar provedor)
	transcriptLines []TranscriptLine
	transcriptMu    sync.Mutex
}

// NewServerAIAgent cria e acopla um agente de IA ao CallManager.
func NewServerAIAgent(sess *Session, callID, peer, direction string, cm *call.CallManager, config AIConfig, log *slog.Logger) *ServerAIAgent {
	resolveAIConfigKeys(context.Background(), sess.mgr.store, sess.projectID, &config)
	config.ChatwootEnabled = sess.getChatwoot().valid()
	if config.Provider == "" {
		config.Provider = "gemini"
	}
	agent := &ServerAIAgent{
		sess:        sess,
		callID:      callID,
		peer:        peer,
		direction:   direction,
		cm:          cm,
		provider:    config.Provider,
		config:      config,
		log:         log.With("agent_call", callID, "provider", config.Provider),
		pacedStop:   make(chan struct{}),
		inboundStop: make(chan struct{}),
	}

	// Concatena os prompts das ferramentas habilitadas (modularidade de prompt)
	if config.ToolsEnabled {
		var toolRules []string
		for _, name := range config.PredefinedTools {
			promptText := config.ToolPrompts[name]
			if promptText == "" {
				promptText = DefaultToolPrompts[name]
			}
			if promptText != "" {
				toolRules = append(toolRules, promptText)
			}
		}
		if len(toolRules) > 0 {
			config.SystemInstruction += "\n\n### REGRAS OBRIGATÓRIAS DE FINALIZAÇÃO, DESPEDIDA E MANUTENÇÃO DA CHAMADA:\n" +
				"1. OBRIGAÇÃO DE DESPEDIDA POR VOZ (FERRAMENTA HANGUP): Você NUNCA deve chamar a ferramenta `hangup` silenciosamente ou sem falar. Antes de executar `hangup`, você DEVE SEMPRE falar em voz alta uma despedida completa, calorosa e educada (ex: \"Muito obrigado pelo contato! Qualquer dúvida estamos à disposição. Tenha um excelente dia, tchau tchau!\"). Fale primeiro a despedida e somente então chame a ferramenta `hangup`.\n" +
				"2. REGRA ABSOLUTA: JAMAIS se despeça ou execute a ferramenta `hangup` automaticamente logo após executar ferramentas intermediárias (como `send_message`, `web_search`, `x_search`, `schedule_call` ou `open_ticket`).\n" +
				"3. FLUXO OBRIGATÓRIO APÓS FERRAMENTAS: Assim que qualquer ferramenta for executada, informe verbalmente a confirmação para o cliente e PERGUNTE SEMPRE: \"Há mais alguma coisa em que eu possa te ajudar?\".\n" +
				"4. USO DA FERRAMENTA HANGUP: A ferramenta `hangup` deve ser chamada APENAS E EXCLUSIVAMENTE quando o cliente responder que NÃO precisa de mais nada, agradecer no encerramento ou se despedir expressamente.\n" +
				"5. PARÂMETROS TÉCNICOS: Extraia os argumentos naturalmente da fala do usuário sem soletrar termos de código ou nomes de parâmetros.\n\n" +
				strings.Join(toolRules, "\n")
		}
	} else if config.EnableGrokWebSearch || config.EnableGrokXSearch {
		config.SystemInstruction += "\n\n### REGRAS OBRIGATÓRIAS PARA PESQUISAS NA INTERNET/X:\n" +
			"1. Após realizar uma busca na web ou no X (web_search / x_search), transmita a resposta ao cliente e PERGUNTE SEMPRE: \"Há mais alguma informação que você gostaria de saber?\".\n" +
			"2. NUNCA se despeça ou desligue a chamada imediatamente após responder aos resultados da pesquisa."
	}

	// Injetar a lista de especialistas disponíveis para transferência se houver
	ctxTimeout, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	agents, err := sess.mgr.store.listAgents(ctxTimeout, sess.id)
	if err == nil && len(agents) > 0 {
		var agentHelp []string
		for _, ag := range agents {
			agentHelp = append(agentHelp, fmt.Sprintf("- ID: %s | Nome: %s | Especialidade: %s", ag.ID, ag.Name, ag.Description))
		}
		config.SystemInstruction += "\n\n### TRANSFERÊNCIA DE CHAMADA PARA ESPECIALISTAS:\nVocê tem a capacidade de transferir a chamada para outros especialistas da equipe se o cliente pedir para falar com outro setor ou se você não souber responder. Chame a ferramenta `transfer_to_agent` passando o ID do especialista correspondente:\n" + strings.Join(agentHelp, "\n")
		config.PredefinedTools = append(config.PredefinedTools, "transfer_to_agent")
	}

	// Se a instrução de sistema não contiver o histórico do Chatwoot, resolve o histórico no backend
	cleanPhone := agent.resolveContactPhone()
	if cleanPhone != "" && !strings.Contains(config.SystemInstruction, "CONTEXTO DA CONVERSA ANTERIOR NO CHATWOOT:") {
		if history := sess.fetchChatwootContext(cleanPhone); history != "" {
			config.SystemInstruction += "\n\n" + history
		}
	}

	// Resolve o nome do contato de forma robusta a partir do banco de dados do WhatsApp
	originalJidStr := peer
	if cm != nil {
		if info := cm.CurrentCall(); info != nil {
			if info.PeerJid != "" {
				originalJidStr = info.PeerJid
			}
		}
	}

	var jidsToTry []types.JID

	// 1. Tenta o JID original da chamada (pode ser LID ou PN)
	if jid, err := types.ParseJID(originalJidStr); err == nil {
		jidsToTry = append(jidsToTry, jid)
	}

	// 2. Tenta o JID resoluto de telefone (PN JID)
	if cleanPhone != "" {
		if jid, err := types.ParseJID(cleanPhone + "@" + types.DefaultUserServer); err == nil {
			jidsToTry = append(jidsToTry, jid)
		}
	}

	// 3. Tenta o JID a partir do peer caso ele já tenha um JID válido
	if jid, err := types.ParseJID(peer); err == nil {
		jidsToTry = append(jidsToTry, jid)
	}

	// 4. Se o peer for só números, tenta como PN JID
	if cleanPeer := digitsOnly(peer); cleanPeer != "" {
		if jid, err := types.ParseJID(cleanPeer + "@" + types.DefaultUserServer); err == nil {
			jidsToTry = append(jidsToTry, jid)
		}
	}

	contactName := "Cliente"
	for _, jid := range jidsToTry {
		if contact, err := sess.getClient().Store.Contacts.GetContact(context.Background(), jid); err == nil && contact.Found {
			if contact.FullName != "" {
				contactName = contact.FullName
				break
			} else if contact.FirstName != "" {
				contactName = contact.FirstName
				break
			} else if contact.PushName != "" {
				contactName = contact.PushName
				break
			}
		}
	}

	if c := sess.getChatwoot(); c.valid() {
		config.SystemInstruction += "\n\n* Ferramenta fetch_chatwoot_history (Buscar histórico do Chatwoot): Use esta ferramenta para carregar o histórico recente de conversas por texto do cliente caso ele faça perguntas sobre o que foi falado no chat de texto anteriormente, ou se você precisar recuperar o contexto de interações passadas. Chame esta ferramenta se o cliente perguntar se você se lembra dele, se tem acesso ao chat, ou se pedir para retomar a conversa anterior."
	}

	// Processa tags dinâmicas no prompt (mesmo comportamento do frontend)
	now := time.Now().In(configuredLocation())

	localTime := now.Format("02/01/2006 15:04")
	_, offset := now.Zone()
	tzH := offset / 3600
	tzM := (offset % 3600) / 60
	tzSign := "+"
	if tzH < 0 {
		tzSign = "-"
		tzH = -tzH
	}
	tzStr := fmt.Sprintf("UTC%s%02d:%02d", tzSign, tzH, tzM)
	utcTime := now.UTC().Format(time.RFC3339)
	nowStr := fmt.Sprintf("%s (%s) / %s (UTC)", localTime, tzStr, utcTime)

	dir := "saída (efetuada)"
	if direction == "inbound" {
		dir = "entrada (recebida)"
	}

	processed := config.SystemInstruction
	processed = strings.ReplaceAll(processed, "[today]", nowStr)
	processed = strings.ReplaceAll(processed, "[phone]", cleanPhone)
	processed = strings.ReplaceAll(processed, "[direction]", dir)
	processed = strings.ReplaceAll(processed, "[session_name]", sess.name)
	processed = strings.ReplaceAll(processed, "[contact_name]", contactName)
	processed = strings.ReplaceAll(processed, "[name]", contactName)
	processed = strings.ReplaceAll(processed, "[Nome da Pessoa]", contactName)
	if config.CustomFields != "" {
		processed = strings.ReplaceAll(processed, "[custom_fields]", config.CustomFields)
	} else {
		processed = strings.ReplaceAll(processed, "[custom_fields]", "")
	}
	config.SystemInstruction = processed

	// Injeção automática dos Agentes Especialistas selecionados na conexão
	if config.EnableSpecialistTransfer {
		agents, err := sess.mgr.store.listAgents(context.Background(), sess.id)
		if err == nil && len(agents) > 0 {
			var specHelp []string
			for _, ag := range agents {
				if !ag.Inbound && !ag.Outbound {
					// Se o usuário especificou allowedSpecialistIds, apenas inclui os agentes permitidos
					if len(config.AllowedSpecialistIDs) > 0 {
						allowed := false
						for _, allowedID := range config.AllowedSpecialistIDs {
							if allowedID == ag.ID {
								allowed = true
								break
							}
						}
						if !allowed {
							continue
						}
					}
					desc := strings.TrimSpace(ag.Description)
					if desc == "" {
						desc = "Agente Especialista para auxílio nesta área."
					}
					specHelp = append(specHelp, fmt.Sprintf("- ID: '%s' | Nome: '%s' | Quando transferir: %s", ag.ID, ag.Name, desc))
				}
			}
			if len(specHelp) > 0 {
				config.SystemInstruction += "\n\n### AGENTES ESPECIALISTAS DISPONÍVEIS PARA TRANSFERÊNCIA AUTOMÁTICA:\nSe o cliente solicitar ou precisar de atendimento em uma das áreas abaixo, utilize a ferramenta `transfer_agent` informando o `target_agent_id` correspondente:\n" + strings.Join(specHelp, "\n") + "\n\nIMPORTANTE: Diga brevemente ao cliente que vai transferi-lo para o especialista e execute a ferramenta `transfer_agent`. Após a execução, não diga mais nada."
				config.ToolsEnabled = true
				hasTool := false
				for _, t := range config.PredefinedTools {
					if t == "transfer_agent" || t == "transfer_to_agent" {
						hasTool = true
						break
					}
				}
				if !hasTool {
					config.PredefinedTools = append(config.PredefinedTools, "transfer_agent")
				}
			}
		}
	}

	if config.Provider == "grok" {
		if !config.EnableGrokWebSearch && !config.EnableGrokXSearch {
			config.EnableGrokWebSearch = true
			config.EnableGrokXSearch = true
		}
		agent.grok = NewGrokLiveClient(config.GeminiAPIKey, config, log)
	} else {
		agent.gemini = NewGeminiLiveClient(config, log)
	}
	return agent
}

func (a *ServerAIAgent) connectGrok(ctx context.Context) error {
	return a.grok.Connect(
		ctx,
		func(b64 string) {
			data, err := base64.StdEncoding.DecodeString(b64)
			if err == nil && len(data) >= 2 {
				pcm24k := make([]float32, len(data)/2)
				for i := 0; i < len(pcm24k); i++ {
					sample := int16(data[i*2]) | (int16(data[i*2+1]) << 8)
					pcm24k[i] = float32(sample) / 32768.0
				}
				pcm16k := Downsample24to16(pcm24k)
				if len(pcm16k) > 0 {
					a.queueMu.Lock()
					a.audioQueue = append(a.audioQueue, pcm16k...)
					if len(a.audioQueue) > maxAudioQueueSamples {
						a.audioQueue = a.audioQueue[len(a.audioQueue)-maxAudioQueueSamples:]
						a.log.Warn("[ServerAIAgent] Audio queue truncada (excedeu cap)")
					}
					a.queueMu.Unlock()
				}
			}
		},
		func(speaker, text string) {
			prefix := "🎤 Cliente disse:"
			if speaker == "ai" {
				prefix = "📝 IA disse:"
			}
			a.log.Info("[ServerAI] transcrição", "origem", prefix, "texto", text)

			a.transcriptMu.Lock()
			if len(a.transcriptLines) > 0 && a.transcriptLines[len(a.transcriptLines)-1].Speaker == speaker {
				a.transcriptLines[len(a.transcriptLines)-1].Text += " " + text
			} else {
				a.transcriptLines = append(a.transcriptLines, TranscriptLine{
					Speaker: speaker,
					Text:    text,
					At:      time.Now().UnixMilli(),
				})
			}
			a.transcriptMu.Unlock()

			a.sess.mgr.broker.broadcast(map[string]any{
				"type":      "ai-transcript",
				"sessionId": a.sess.id,
				"callId":    a.callID,
				"speaker":   speaker,
				"text":      text,
			})
		},
		func(callID, name, argsJSON string) {
			var args map[string]any
			json.Unmarshal([]byte(argsJSON), &args)
			res := a.handleToolCall(ctx, name, args)
			resBytes, _ := json.Marshal(res)
			_ = a.grok.SendToolResult(callID, string(resBytes))
		},
		func() {
			a.queueMu.Lock()
			a.audioQueue = nil
			a.queueMu.Unlock()
			a.log.Info("[ServerAIAgent] Interrupção detectada no Grok: descartando áudio pendente da IA")
		},
		func(err error) {
			a.log.Warn("[ServerAIAgent] Sessão Grok fechou inesperadamente", "err", err)
			a.Detach()
		},
	)
}

func (a *ServerAIAgent) connectGemini(ctx context.Context) error {
	return a.gemini.Connect(
		func(pcm24k []float32) {
			pcm16k := Downsample24to16(pcm24k)
			if len(pcm16k) == 0 {
				return
			}
			a.queueMu.Lock()
			a.audioQueue = append(a.audioQueue, pcm16k...)
			if len(a.audioQueue) > maxAudioQueueSamples {
				a.audioQueue = a.audioQueue[len(a.audioQueue)-maxAudioQueueSamples:]
				a.log.Warn("[ServerAIAgent] Audio queue truncada (excedeu cap)")
			}
			a.queueMu.Unlock()
		},
		func(speaker, text string) {
			prefix := "🎤 Cliente disse:"
			if speaker == "ai" {
				prefix = "📝 IA disse:"
			}
			a.log.Info("[ServerAI] transcrição", "origem", prefix, "texto", text)

			a.transcriptMu.Lock()
			if len(a.transcriptLines) > 0 && a.transcriptLines[len(a.transcriptLines)-1].Speaker == speaker {
				a.transcriptLines[len(a.transcriptLines)-1].Text += " " + text
			} else {
				a.transcriptLines = append(a.transcriptLines, TranscriptLine{
					Speaker: speaker,
					Text:    text,
					At:      time.Now().UnixMilli(),
				})
			}
			a.transcriptMu.Unlock()

			a.sess.mgr.broker.broadcast(map[string]any{
				"type":      "ai-transcript",
				"sessionId": a.sess.id,
				"callId":    a.callID,
				"speaker":   speaker,
				"text":      text,
			})
		},
		func(name string, args map[string]any) map[string]any {
			return a.handleToolCall(ctx, name, args)
		},
		func() {
			a.log.Warn("[ServerAIAgent] Sessão Gemini fechou inesperadamente")
			a.Detach()
		},
		func() {
			a.mu.Lock()
			transferring := a.transferring
			a.mu.Unlock()
			if transferring {
				return
			}
			a.queueMu.Lock()
			a.audioQueue = nil
			a.queueMu.Unlock()
			a.log.Info("[ServerAIAgent] Fila de áudio de saída limpa devido a interrupção")
		},
	)
}

// Start conecta ao provedor configurado, acopla o pipeline de áudio e inicia o agente.
func (a *ServerAIAgent) Start(ctx context.Context) error {
	a.log.Info("[ServerAIAgent] Iniciando agente de voz server-side", "provider", a.provider)

	var err error
	if a.provider == "grok" && a.grok != nil {
		err = a.connectGrok(ctx)
	} else if a.gemini != nil {
		err = a.connectGemini(ctx)
	}
	if err != nil {
		return fmt.Errorf("provider connect (%s): %w", a.provider, err)
	}

	// Inicia os pacers para reprodução e captura estáveis
	go a.startPacedSender(ctx)
	go a.startInboundPacer(ctx)

	// Acopla o callback de áudio do peer (WhatsApp → AI) com fila e contador para monitorar se estamos ouvindo o cliente
	var peerPackets uint64
	a.cm.SetOnPeerAudio(func(pcm16 []float32) {
		a.mu.Lock()
		detached := a.detached
		a.mu.Unlock()
		if detached {
			return
		}

		count := atomic.AddUint64(&peerPackets, 1)
		if count%50 == 1 {
			a.log.Info("[ServerAIAgent] Recebendo áudio do cliente", "samples", len(pcm16), "packetCount", count)
		}

		// Apenas enfileira para processamento ritmado
		a.inboundMu.Lock()
		a.inboundQueue = append(a.inboundQueue, pcm16...)
		if len(a.inboundQueue) > maxAudioQueueSamples {
			a.inboundQueue = a.inboundQueue[len(a.inboundQueue)-maxAudioQueueSamples:]
			a.log.Warn("[ServerAIAgent] Inbound queue truncada (excedeu cap)")
		}
		a.inboundMu.Unlock()
	})

	// Emite evento SSE para que o frontend saiba que o servidor gerencia esta chamada
	a.sess.mgr.broker.broadcast(map[string]any{
		"type":      "ai-agent-active",
		"sessionId": a.sess.id,
		"callId":    a.callID,
		"server":    true,
	})

	// Primeira fala (saudação)
	if a.config.FirstUtterance != "" {
		a.sendTextToAI(a.config.FirstUtterance)
	}

	// Timer de duração máxima
	if a.config.MaxDurationMin > 0 {
		dur := time.Duration(a.config.MaxDurationMin) * time.Minute
		a.maxTimer = time.AfterFunc(dur, func() {
			a.log.Info("[ServerAIAgent] Duração máxima atingida, encerrando")
			a.Detach()
			a.sess.terminateCall(a.callID, core.EndCallReasonUserEnded)
			a.sess.removeCall(a.callID)
			a.sess.mgr.broker.endCall(a.callID, string(core.EndCallReasonUserEnded))
		})
	}

	a.log.Info("[ServerAIAgent] Agente de voz IA ativo para a chamada")
	return nil
}

// startPacedSender envia áudio PCM para o CallManager em intervalos de 20ms (frame nativo do Opus).
func (a *ServerAIAgent) startPacedSender(ctx context.Context) {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()

	frameSize := 320 // 20ms de áudio a 16kHz
	idleTicks := 0

	for {
		select {
		case <-a.pacedStop:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.queueMu.Lock()
			qLen := len(a.audioQueue)
			if qLen == 0 {
				idleTicks = 0
				a.queueMu.Unlock()
				continue
			}

			// Se a fila tiver menos que 20ms e ainda não acumulou o suficiente, aguarda até 3 ticks (60ms) sem descartar nem preencher com silêncio prematuro
			if qLen < frameSize && idleTicks < 3 {
				idleTicks++
				a.queueMu.Unlock()
				continue
			}

			idleTicks = 0
			var frame []float32
			if qLen >= frameSize {
				frame = a.audioQueue[:frameSize]
				a.audioQueue = a.audioQueue[frameSize:]
			} else {
				frame = make([]float32, frameSize)
				copy(frame, a.audioQueue)
				a.audioQueue = nil
			}
			a.queueMu.Unlock()

			// Envia o frame ritmado de 20ms para o WhatsApp e gravador de áudio
			a.cm.FeedCapturedPCM(frame)
		}
	}
}

// startInboundPacer envia áudio contínuo para o Gemini para manter a VAD (detecção de fala) ativa e sem perdas de pacotes.
func (a *ServerAIAgent) startInboundPacer(ctx context.Context) {
	ticker := time.NewTicker(20 * time.Millisecond)
	defer ticker.Stop()

	frameSize := 320 // 20ms de áudio a 16kHz
	silenceFrame := make([]float32, frameSize)
	idleTicks := 0

	for {
		select {
		case <-a.inboundStop:
			return
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.inboundMu.Lock()
			qLen := len(a.inboundQueue)

			var frame []float32
			if qLen >= frameSize {
				idleTicks = 0
				frame = a.inboundQueue[:frameSize]
				a.inboundQueue = a.inboundQueue[frameSize:]
				a.inboundMu.Unlock()
			} else if qLen > 0 && idleTicks < 3 {
				// Aguarda pacotes de entrada acumularem sem descartar
				idleTicks++
				a.inboundMu.Unlock()
				continue
			} else {
				idleTicks = 0
				if qLen > 0 {
					frame = make([]float32, frameSize)
					copy(frame, a.inboundQueue)
					a.inboundQueue = nil
				} else {
					frame = silenceFrame
				}
				a.inboundMu.Unlock()
			}

			// Cancelamento de Eco Acústico básico: se a IA estiver falando, enviamos silêncio ao Gemini
			a.queueMu.Lock()
			aiSpeaking := len(a.audioQueue) > 0
			a.queueMu.Unlock()

			if aiSpeaking {
				a.sendAudioToAI(silenceFrame)
			} else {
				a.sendAudioToAI(frame)
			}
		}
	}
}

// Detach desacopla o agente, fecha a conexão com a IA e executa post-call actions.
func (a *ServerAIAgent) Detach() {
	a.mu.Lock()
	if a.detached {
		a.mu.Unlock()
		return
	}
	a.detached = true
	a.mu.Unlock()

	// Encerra os pacers
	close(a.pacedStop)
	close(a.inboundStop)

	if a.maxTimer != nil {
		a.maxTimer.Stop()
	}

	// Limpa callback de áudio
	a.cm.SetOnPeerAudio(nil)

	// Captura a transcrição antes de fechar o provedor
	transcript := a.getTranscriptLines()

	a.closeCurrentProvider()

	// Post-call actions em background
	go a.executePostCallActions(transcript)
}

// handleToolCall processa tool calls do Gemini.
func (a *ServerAIAgent) handleToolCall(ctx context.Context, name string, args map[string]any) map[string]any {
	switch name {
	case "transfer_agent", "transfer_to_agent":
		a.log.Info("[ServerAIAgent] Tool de transferência de agente disparada", "name", name, "args", args)
		target, _ := args["target_agent_id"].(string)
		if target == "" {
			target, _ = args["agent_id"].(string)
		}
		if target == "" {
			target, _ = args["target_agent"].(string)
		}
		if target == "" {
			target, _ = args["agentId"].(string)
		}
		if target == "" {
			return map[string]any{"error": "parâmetro de ID do agente é obrigatório"}
		}
		goSafe(a.log, func() {
			if err := a.SwitchToAgent(target); err != nil {
				a.log.Error("[ServerAIAgent] Falha ao transferir agente", "err", err, "target", target)
			}
		})
		return map[string]any{"status": "silence", "action": "transferring_now"}

	case "hangup":
		a.log.Info("[ServerAIAgent] Tool hangup disparada")
		// Aguarda ativamente o término da fala/áudio da despedida antes de encerrar
		goSafe(a.log, func() {
			time.Sleep(1200 * time.Millisecond)
			a.waitForAudioFinish(context.Background())
			time.Sleep(400 * time.Millisecond)
			a.Detach()
			a.sess.terminateCall(a.callID, core.EndCallReasonUserEnded)
			a.sess.removeCall(a.callID)
			a.sess.mgr.broker.endCall(a.callID, string(core.EndCallReasonUserEnded))
		})
		return map[string]any{"status": "chamada sendo encerrada"}

	case "open_ticket":
		a.log.Info("[ServerAIAgent] Tool open_ticket disparada", "args", args)
		reason, _ := args["reason"].(string)

		// Sinaliza no broker que a chamada teve um chamado aberto (atômico + persistido)
		a.sess.mgr.broker.openTicket(a.callID, reason)

		// Envia a notificação do chamado pelo WhatsApp para o admin se configurado
		config := a.sess.getAIConfig()
		if config.PostCall.SendAdmin && config.PostCall.AdminNumber != "" {
			goSafe(a.log, func() {
				adminJid, err := resolveRecipient(config.PostCall.AdminNumber)
				if err == nil {
					contactName := a.resolveContactPhone()
					msg := fmt.Sprintf("⚠️ *Novo Chamado Aberto pela IA*\n\n• *Cliente:* %s\n• *Sessão:* %s\n• *Motivo:* %s\n• *ID Chamada:* %s", contactName, a.sess.name, reason, a.callID)
					_, _ = a.sess.getClient().SendMessage(context.Background(), adminJid, &waE2E.Message{
						Conversation: proto.String(msg),
					})
				}
			})
		}

		return map[string]any{"status": "chamado aberto com sucesso"}

	case "fetch_chatwoot_history":
		a.log.Info("[ServerAIAgent] Tool fetch_chatwoot_history disparada")
		cleanPhone := a.resolveContactPhone()
		if history := a.sess.fetchChatwootContext(cleanPhone); history != "" {
			return map[string]any{"history": history}
		}
		return map[string]any{"error": "histórico do Chatwoot não pôde ser recuperado ou não está configurado"}

	case "send_message":
		return a.toolSendMessage(ctx, args)

	case "schedule_call":
		return a.toolScheduleCall(ctx, args)

	default:
		return a.toolCustomWebhook(ctx, name, args)
	}
}

// SwitchToAgent transfere o atendimento em tempo real para outro agente de IA (agente especialista).
func (a *ServerAIAgent) SwitchToAgent(target string) error {
	a.mu.Lock()
	if a.transferring {
		a.mu.Unlock()
		return fmt.Errorf("transferência já em andamento")
	}
	a.transferring = true
	a.mu.Unlock()

	defer func() {
		a.mu.Lock()
		a.transferring = false
		a.mu.Unlock()
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	agents, err := pbClient.ListAgentsPB(ctx, a.sess.id)
	if err != nil || len(agents) == 0 {
		agents, err = a.sess.mgr.store.listAgents(ctx, a.sess.id)
		if err != nil {
			return fmt.Errorf("listar agentes: %w", err)
		}
	}

	var targetRow *agentRow
	for i := range agents {
		if agents[i].ID == target || strings.EqualFold(agents[i].Name, target) || strings.Contains(strings.ToLower(agents[i].Name), strings.ToLower(target)) {
			targetRow = &agents[i]
			break
		}
	}

	if targetRow == nil {
		return fmt.Errorf("agente especialista '%s' não encontrado", target)
	}

	var newCfg AIConfig
	if err := json.Unmarshal([]byte(targetRow.AIConfig), &newCfg); err != nil {
		return fmt.Errorf("deserializar ai_config do agente: %w", err)
	}

	masterCfg := a.sess.getAIConfig()
	if newCfg.Provider == "" {
		newCfg.Provider = masterCfg.Provider
	}
	if newCfg.ModelName == "" {
		newCfg.ModelName = masterCfg.ModelName
	}
	resolveAIConfigKeys(context.Background(), a.sess.mgr.store, a.sess.projectID, &newCfg)

	// Combinar Instruções Globais do Agente Principal + Instruções Específicas do Agente Especialista
	if masterCfg.SystemInstruction != "" {
		specInstruction := newCfg.SystemInstruction
		newCfg.SystemInstruction = masterCfg.SystemInstruction + "\n\n### REGRAS E INSTRUÇÕES ESPECÍFICAS DO ESPECIALISTA (" + targetRow.Name + "):\n" + specInstruction
	}
	newCfg.ChatwootEnabled = a.sess.getChatwoot().valid()

	// Habilita todas as ferramentas no especialista (inclusive transfer_agent)
	newCfg.ToolsEnabled = true
	newCfg.PredefinedTools = []string{"hangup", "open_ticket", "send_message", "schedule_call", "transfer_agent"}

	// Adiciona o contexto completo do atendimento anterior + opções de transferência de volta/outros agentes
	lines := a.getTranscriptLines()
	var extraContext strings.Builder

	if len(lines) > 0 {
		extraContext.WriteString("\n\n### CONTEXTO COMPLETO DA CONVERSA COM O AGENTE ANTERIOR (TRANSFERÊNCIA DE CHAMADA):\n")
		extraContext.WriteString("Esta chamada foi transferida para você. Veja tudo o que o cliente já conversou com a IA de recepção até este momento:\n")
		for _, l := range lines {
			speakerName := "Cliente"
			if l.Speaker == "ai" {
				speakerName = "Agente Anterior (IA)"
			}
			extraContext.WriteString(fmt.Sprintf("- %s: %s\n", speakerName, l.Text))
		}
		extraContext.WriteString("\n⚠️ INSTRUÇÃO IMPORTANTE SOBRE O HISTÓRICO: Você já tem todo o contexto do problema do cliente no histórico acima. Demonstre imediatamente que já sabe o motivo do contato e responda de forma direta e atenciosa, sem perguntar o que o cliente já explicou!\n")
	}

	var agentHelp []string
	for _, ag := range agents {
		if ag.ID != targetRow.ID {
			roleLabel := "Agente Especialista"
			if ag.Inbound || ag.Outbound {
				roleLabel = "Agente Principal (Recepção)"
			}
			agentHelp = append(agentHelp, fmt.Sprintf("- ID: '%s' | Nome: '%s' (%s)", ag.ID, ag.Name, roleLabel))
		}
	}

	if len(agentHelp) > 0 {
		extraContext.WriteString("\n\n### OPÇÕES DE TRANSFERÊNCIA PARA OUTROS AGENTES:\nSe o cliente precisar de outro setor ou solicitar voltar para a recepção principal, use a ferramenta `transfer_agent` passando o ID do agente:\n")
		extraContext.WriteString(strings.Join(agentHelp, "\n"))
		extraContext.WriteString("\n")
	}

	newCfg.SystemInstruction += extraContext.String()

	a.log.Info("[ServerAIAgent] Transferindo chamada para novo agente especialista", "target_id", targetRow.ID, "target_name", targetRow.Name, "new_provider", newCfg.Provider)

	// 1. Aguarda a fala atual da IA terminar 100% de ser reproduzida no WhatsApp antes de trocar
	waitCtx, waitCancel := context.WithTimeout(context.Background(), 10*time.Second)
	a.waitForAudioFinish(waitCtx)
	waitCancel()

	// 2. Injeta o efeito sonoro de tom de transferência telefônica PABX na fila de áudio
	chimePCM := generateTransferChimePCM()
	a.queueMu.Lock()
	a.audioQueue = append(a.audioQueue, chimePCM...)
	a.queueMu.Unlock()

	// 3. Enquanto o toque de transferência toca para o cliente (2.2s), reconecta o provedor com o especialista em paralelo
	a.closeCurrentProvider()
	a.config = newCfg
	a.provider = newCfg.Provider

	var reconnectErr error
	if a.provider == "grok" {
		a.grok = NewGrokLiveClient(newCfg.GeminiAPIKey, newCfg, a.log)
		reconnectErr = a.connectGrok(context.Background())
	} else {
		a.gemini = NewGeminiLiveClient(newCfg, a.log)
		reconnectErr = a.connectGemini(context.Background())
	}
	if reconnectErr != nil {
		return reconnectErr
	}

	// 4. Garante que o Agente Especialista FALA IMEDIATAMENTE ao assumir a chamada
	greeting := newCfg.FirstUtterance
	if greeting == "" {
		greeting = fmt.Sprintf("Olá! Sou o especialista em %s. Vi aqui no histórico o seu pedido, como posso te ajudar?", targetRow.Name)
	}
	a.sendTextToAI(greeting)

	// 5. Aguarda a conclusão do toque de transferência para a fala do especialista ser transmitida sem cortes
	chimeCtx, chimeCancel := context.WithTimeout(context.Background(), 5*time.Second)
	a.waitForAudioFinish(chimeCtx)
	chimeCancel()

	return nil
}

// generateTransferChimePCM gera um efeito sonoro de tom de transferência telefônica PABX em 16kHz float32.
func generateTransferChimePCM() []float32 {
	sampleRate := 16000
	totalSamples := int(2.2 * float64(sampleRate))
	pcm := make([]float32, totalSamples)

	notes := []struct {
		freq     float64
		startSec float64
		durSec   float64
	}{
		{freq: 440.0, startSec: 0.0, durSec: 0.35},
		{freq: 554.37, startSec: 0.45, durSec: 0.35},
		{freq: 659.25, startSec: 0.90, durSec: 0.50},
		{freq: 880.0, startSec: 1.50, durSec: 0.40},
	}

	for _, note := range notes {
		startSample := int(note.startSec * float64(sampleRate))
		numSamples := int(note.durSec * float64(sampleRate))
		for i := 0; i < numSamples; i++ {
			idx := startSample + i
			if idx >= totalSamples {
				break
			}
			t := float64(i) / float64(sampleRate)
			gain := 0.22
			if i < 160 {
				gain *= float64(i) / 160.0
			} else if i > numSamples-480 {
				gain *= float64(numSamples-i) / 480.0
			}
			sample := gain * (0.7*math.Sin(2.0*math.Pi*note.freq*t) + 0.3*math.Sin(2.0*math.Pi*(note.freq*1.5)*t))
			pcm[idx] = float32(sample)
		}
	}
	return pcm
}

// waitForAudioFinish aguarda até que a fila de áudio de saída seja totalmente drenada.
func (a *ServerAIAgent) waitForAudioFinish(ctx context.Context) {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			a.queueMu.Lock()
			qLen := len(a.audioQueue)
			a.queueMu.Unlock()
			if qLen == 0 {
				return
			}
		}
	}
}

// toolSendMessage envia uma mensagem de texto WhatsApp pelo backend.
func (a *ServerAIAgent) toolSendMessage(ctx context.Context, args map[string]any) map[string]any {
	message, _ := args["message"].(string)
	to, _ := args["to"].(string)
	if message == "" {
		return map[string]any{"error": "mensagem vazia"}
	}
	if to == "" {
		to = a.peer
	}

	jid, err := resolveRecipient(to)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}

	_, err = a.sess.getClient().SendMessage(ctx, jid, &waE2E.Message{
		Conversation: proto.String(message),
	})
	if err != nil {
		a.log.Error("[ServerAIAgent] Erro ao enviar mensagem", "err", err)
		return map[string]any{"error": err.Error()}
	}
	a.log.Info("[ServerAIAgent] Mensagem enviada", "to", jid.String())
	return map[string]any{"status": "mensagem enviada com sucesso"}
}

// resolveContactPhone resolve o JID do peer para retornar o número de telefone (PN) real, convertendo de LID se necessário.
func (a *ServerAIAgent) resolveContactPhone() string {
	raw := a.peer
	if !strings.Contains(raw, "@") {
		if a.cm != nil {
			if info := a.cm.CurrentCall(); info != nil {
				if info.CallerPn != "" {
					return info.CallerPn
				}
				if info.PeerJid != "" && strings.Contains(info.PeerJid, "@") {
					raw = info.PeerJid
				}
			}
		}
	}

	jid, err := types.ParseJID(raw)
	if err != nil {
		return digitsOnly(raw)
	}

	if jid.Server == "lid" {
		if pn := a.sess.realPhone(jid); pn != "" && pn != jid.User {
			return pn
		}
	}
	return jid.User
}

// toolScheduleCall agenda uma ligação futura.
func (a *ServerAIAgent) toolScheduleCall(ctx context.Context, args map[string]any) map[string]any {
	datetimeStr, _ := args["datetime"].(string)
	prompt, _ := args["prompt"].(string)
	if datetimeStr == "" {
		return map[string]any{"error": "datetime obrigatório"}
	}

	scheduledDate, err := time.Parse(time.RFC3339, datetimeStr)
	if err != nil {
		// Tenta formatos alternativos
		scheduledDate, err = time.Parse("2006-01-02T15:04:05Z", datetimeStr)
		if err != nil {
			return map[string]any{"error": "formato de datetime inválido"}
		}
	}

	config := a.sess.getAIConfig()
	var schedules []map[string]any
	_ = json.Unmarshal([]byte(config.ScheduledCalls), &schedules)

	newCall := map[string]any{
		"id":     fmt.Sprintf("srv_%d", time.Now().UnixNano()),
		"phone":  normalizePhone(a.resolveContactPhone()),
		"time":   scheduledDate.Format(time.RFC3339),
		"active": true,
	}
	if prompt != "" {
		newCall["prompt"] = prompt
	}
	schedules = append(schedules, newCall)

	b, _ := json.Marshal(schedules)
	config.ScheduledCalls = string(b)
	a.sess.setAIConfig(config)
	cfgJSON, _ := json.Marshal(config)
	if err := a.sess.mgr.store.setAIConfig(ctx, a.sess.id, string(cfgJSON)); err != nil {
		a.log.Error("[ServerAIAgent] Falha ao persistir agendamento", "err", err)
		return map[string]any{"error": "falha ao salvar o agendamento no banco"}
	}

	if a.sess.mgr.Scheduler != nil {
		a.sess.mgr.Scheduler.RecalculateActiveCount()
	}

	a.log.Info("[ServerAIAgent] Ligação agendada", "time", scheduledDate.Format(time.RFC3339))
	return map[string]any{"status": "ligação agendada com sucesso", "time": scheduledDate.Format(time.RFC3339)}
}

func (a *ServerAIAgent) sendAudioToAI(pcm16 []float32) {
	if a.grok != nil {
		a.grok.SendAudio(pcm16)
	} else if a.gemini != nil {
		a.gemini.SendAudio(pcm16)
	}
}

func (a *ServerAIAgent) sendTextToAI(text string) {
	if text == "" {
		return
	}
	if a.grok != nil {
		a.grok.SendText(text)
	} else if a.gemini != nil {
		a.gemini.SendText(text)
	}
}

func (a *ServerAIAgent) getTranscriptLines() []TranscriptLine {
	a.transcriptMu.Lock()
	if len(a.transcriptLines) > 0 {
		out := make([]TranscriptLine, len(a.transcriptLines))
		copy(out, a.transcriptLines)
		a.transcriptMu.Unlock()
		return out
	}
	a.transcriptMu.Unlock()

	if a.grok != nil {
		return a.grok.Transcript()
	}
	if a.gemini != nil {
		return a.gemini.Transcript()
	}
	return nil
}

func (a *ServerAIAgent) closeCurrentProvider() {
	if a.gemini != nil {
		a.gemini.Close()
		a.gemini = nil
	}
	if a.grok != nil {
		a.grok.Close()
		a.grok = nil
	}
}

// toolCustomWebhook executa uma tool customizada via webhook proxy.
func (a *ServerAIAgent) toolCustomWebhook(ctx context.Context, name string, args map[string]any) map[string]any {
	var tool *CustomTool
	for i := range a.config.CustomTools {
		if a.config.CustomTools[i].Name == name {
			tool = &a.config.CustomTools[i]
			break
		}
	}
	if tool == nil {
		return map[string]any{"error": fmt.Sprintf("ferramenta %s não encontrada", name)}
	}
	// Webhooks de tools customizadas são configurados pelo operador — apenas o
	// esquema é validado (URLs de LAN são legítimas aqui).
	if _, err := parseHTTPURL(tool.WebhookURL); err != nil {
		return map[string]any{"error": "webhookUrl inválida: " + err.Error()}
	}

	jsonBytes, _ := json.Marshal(args)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tool.WebhookURL, bytes.NewBuffer(jsonBytes))
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := toolWebhookClient.Do(req)
	if err != nil {
		return map[string]any{"error": err.Error()}
	}
	defer resp.Body.Close()

	var result map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return map[string]any{"output": "ok"}
	}
	return result
}

// executePostCallActions gera o resumo e executa ações pós-chamada.
func (a *ServerAIAgent) executePostCallActions(transcript []TranscriptLine) {
	if len(transcript) == 0 {
		transcript = a.getTranscriptLines()
	}
	if len(transcript) == 0 {
		a.log.Info("[ServerAIAgent] Sem transcrição para processar pós-chamada")
		return
	}

	// Salva a transcrição no banco de dados principal (PocketBase SSOT + SQLite)
	if a.sess.mgr != nil && a.sess.mgr.store != nil {
		goSafe(a.log, func() {
			if pbErr := pbClient.UpdateCallTranscriptPB(context.Background(), a.callID, transcript); pbErr != nil {
				a.log.Error("[ServerAIAgent] Erro ao salvar transcrição no PocketBase", "err", pbErr)
			} else {
				a.log.Info("[ServerAIAgent] Transcrição salva no PocketBase com sucesso")
			}
			err := a.sess.mgr.store.saveTranscript(context.Background(), a.sess.id, a.callID, transcript)
			if err != nil {
				a.log.Error("[ServerAIAgent] Erro ao salvar transcrição no SQLite", "err", err)
			} else {
				a.log.Info("[ServerAIAgent] Transcrição salva no SQLite com sucesso")
			}
		})
	}

	config := a.config
	if !config.PostCall.SummaryEnabled {
		return
	}

	// Monta o texto da transcrição
	var sb strings.Builder
	for _, line := range transcript {
		speaker := "IA"
		if line.Speaker == "client" {
			speaker = "Cliente"
		}
		sb.WriteString(fmt.Sprintf("%s: %s\n", speaker, line.Text))
	}
	transcriptText := sb.String()

	// Busca info do contato
	contactInfo := a.peer
	if a.sess.getClient() != nil {
		jid, err := types.ParseJID(a.peer)
		if err == nil {
			phone := jid.User
			if jid.Server == "lid" && a.sess.getClient().Store.LIDs != nil {
				if pn, e := a.sess.getClient().Store.LIDs.GetPNForLID(context.Background(), jid); e == nil && !pn.IsEmpty() {
					phone = pn.User
					jid = pn
				}
			}
			name := ""
			if contact, e := a.sess.getClient().Store.Contacts.GetContact(context.Background(), jid); e == nil && contact.Found {
				if contact.FullName != "" {
					name = contact.FullName
				} else if contact.PushName != "" {
					name = contact.PushName
				}
			}
			if name != "" {
				contactInfo = fmt.Sprintf("%s (%s)", name, phone)
			} else {
				contactInfo = phone
			}
		}
	}

	now := time.Now().In(configuredLocation())
	// Horário real de início da chamada (histórico do broker); fallback: agora.
	startTime := now
	if hCall, ok := a.sess.mgr.broker.findHistoryCall(a.callID); ok && hCall.StartedAt > 0 {
		startTime = time.UnixMilli(hCall.StartedAt).In(configuredLocation())
	}
	formattedDate := startTime.Format("02/01/2006 15:04")
	dir := "Recebida"
	if a.direction != "inbound" {
		dir = "Efetuada"
	}

	prompt := fmt.Sprintf(`Analise a transcrição abaixo e gere um resumo muito objetivo e formatado para WhatsApp (use *negrito* nos títulos e emojis). Seja extremamente conciso.

📞 *RESUMO DE ATENDIMENTO*
• *Contato*: %s
• *Horário*: %s
• *Sentido*: %s

🎯 *Assunto principal*: (máximo 1 frase)
📝 *Pontos tratados*: (máximo 3 tópicos rápidos)
🤝 *Ações/Decisões*: (máximo 2 tópicos rápidos ou "Nenhuma")

Não crie introduções ou conclusões. Resuma diretamente nos tópicos acima.

Transcrição:
%s`, contactInfo, formattedDate, dir, transcriptText)

	// Chama a API REST do Gemini com lista resiliente de modelos
	modelList := []string{"gemini-2.5-flash", "gemini-1.5-flash", "gemini-2.0-flash", "gemini-3.6-flash"}
	if config.ModelName != "" && !strings.Contains(config.ModelName, "live") {
		modelList = append([]string{config.ModelName}, modelList...)
	}

	var summary string
	body := map[string]any{
		"contents": []map[string]any{{
			"parts": []map[string]any{{"text": prompt}},
		}},
	}
	jsonBody, _ := json.Marshal(body)

	for _, model := range modelList {
		geminiURL := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, config.GeminiAPIKey)
		resp, err := geminiRestClient.Post(geminiURL, "application/json", bytes.NewBuffer(jsonBody))
		if err != nil {
			continue
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			continue
		}
		var data map[string]any
		if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
			resp.Body.Close()
			summary = extractSummaryText(data)
			if summary != "" {
				break
			}
		} else {
			resp.Body.Close()
		}
	}

	if summary == "" {
		a.log.Warn("[ServerAIAgent] Resumo vazio após tentar modelos Gemini")
		return
	}

	a.log.Info("[ServerAIAgent] Resumo gerado com sucesso")

	// Salva no histórico do broker
	a.sess.mgr.broker.saveSummary(a.sess.id, a.callID, summary)

	ctx := context.Background()

	// Envia para o admin
	if config.PostCall.SendAdmin && config.PostCall.AdminNumber != "" {
		adminJID, err := resolveRecipient(config.PostCall.AdminNumber)
		if err == nil {
			_, _ = a.sess.getClient().SendMessage(ctx, adminJID, &waE2E.Message{
				Conversation: proto.String(summary),
			})
			a.log.Info("[ServerAIAgent] Resumo enviado para admin")
		}
	}

	// Envia para o cliente
	if config.PostCall.SendClient {
		clientJID, err := resolveRecipient(a.peer)
		if err == nil {
			// Se for LID, tenta buscar o número de telefone (PN) real para envio correto do WhatsApp
			if clientJID.Server == "lid" && a.sess.getClient() != nil && a.sess.getClient().Store.LIDs != nil {
				if pn, e := a.sess.getClient().Store.LIDs.GetPNForLID(ctx, clientJID); e == nil && !pn.IsEmpty() {
					clientJID = pn
				}
			}
			respSend, errSend := a.sess.getClient().SendMessage(ctx, clientJID, &waE2E.Message{
				Conversation: proto.String(summary),
			})
			if errSend != nil {
				a.log.Error("[ServerAIAgent] Erro ao enviar resumo para cliente", "to", clientJID.String(), "err", errSend)
			} else {
				a.log.Info("[ServerAIAgent] Resumo enviado para cliente com sucesso", "to", clientJID.String(), "msgID", respSend.ID)
			}
		} else {
			a.log.Error("[ServerAIAgent] Falha ao resolver JID do cliente para envio de resumo", "peer", a.peer, "err", err)
		}
	}

	// Webhook pós-chamada
	if config.PostCall.WebhookEnabled && config.PostCall.WebhookURL != "" {
		var duration int64
		var ticketOpened bool
		var ticketReason string
		var startedAtVal, endedAtVal int64

		if hCall, ok := a.sess.mgr.broker.findHistoryCall(a.callID); ok {
			startedAtVal = hCall.StartedAt
			if hCall.EndedAt != nil {
				endedAtVal = *hCall.EndedAt
				duration = (endedAtVal - startedAtVal) / 1000
			}
			ticketOpened = hCall.TicketOpened
			ticketReason = hCall.TicketReason
		}

		transcript := a.getTranscriptLines()

		webhookBody, _ := json.Marshal(map[string]any{
			"sessionId":    a.sess.id,
			"callId":       a.callID,
			"peer":         a.peer,
			"direction":    a.direction,
			"summary":      summary,
			"duration":     duration,
			"ticketOpened": ticketOpened,
			"ticketReason": ticketReason,
			"startedAt":    startedAtVal,
			"endedAt":      endedAtVal,
			"transcript":   transcript,
		})
		webhookURL := config.PostCall.WebhookURL
		goSafe(a.log, func() {
			resp, err := doWithRetry(webhookClient, func() (*http.Request, error) {
				req, err := http.NewRequest(http.MethodPost, webhookURL, bytes.NewReader(webhookBody))
				if err != nil {
					return nil, err
				}
				req.Header.Set("Content-Type", "application/json")
				return req, nil
			}, 3, a.log, "post-call-webhook")
			if err != nil {
				a.log.Error("[ServerAIAgent] Webhook pós-chamada falhou após retries", "err", err)
				return
			}
			_ = resp.Body.Close()
		})
	}
}

// extractSummaryText extrai o texto do resumo da resposta do Gemini REST.
func extractSummaryText(data map[string]any) string {
	candidates, _ := data["candidates"].([]any)
	if len(candidates) == 0 {
		return ""
	}
	c0, _ := candidates[0].(map[string]any)
	if c0 == nil {
		return ""
	}
	content, _ := c0["content"].(map[string]any)
	if content == nil {
		return ""
	}
	parts, _ := content["parts"].([]any)
	if len(parts) == 0 {
		return ""
	}
	p0, _ := parts[0].(map[string]any)
	if p0 == nil {
		return ""
	}
	text, _ := p0["text"].(string)
	return text
}

// TransferTo alias para SwitchToAgent (compatibilidade).
func (a *ServerAIAgent) TransferTo(ctx context.Context, targetAgentID string) error {
	return a.SwitchToAgent(targetAgentID)
}
