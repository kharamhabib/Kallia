package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const grokVoiceWSBase = "wss://api.x.ai/v1/realtime"

type GrokLiveClient struct {
	mu                 sync.Mutex
	ws                 *websocket.Conn
	config             AIConfig
	apiKey             string
	log                *slog.Logger
	transcript         []TranscriptLine
	lastUserCumulative string
	onAudio            func(base64Audio string)
	onTranscript       func(speaker string, text string)
	onToolCall         func(callID, name, argsJSON string)
	onInterruption     func()
	onClose            func(err error)
}

func NewGrokLiveClient(apiKey string, config AIConfig, log *slog.Logger) *GrokLiveClient {
	if log == nil {
		log = slog.Default()
	}
	return &GrokLiveClient{
		apiKey: apiKey,
		config: config,
		log:    log.With("subsystem", "grok_live"),
	}
}

func (g *GrokLiveClient) Connect(
	ctx context.Context,
	onAudio func(base64Audio string),
	onTranscript func(speaker string, text string),
	onToolCall func(callID, name, argsJSON string),
	onInterruption func(),
	onClose func(err error),
) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	g.onAudio = onAudio
	g.onTranscript = onTranscript
	g.onToolCall = onToolCall
	g.onInterruption = onInterruption
	g.onClose = onClose

	if g.apiKey == "" {
		return fmt.Errorf("grok api key não configurada")
	}

	model := g.config.ModelName
	if model == "" || !grokIsModel(model) {
		model = "grok-voice-latest"
	}

	effort := g.config.GrokReasoningEffort
	if effort == "" {
		effort = "high"
	}

	u, err := url.Parse(grokVoiceWSBase)
	if err != nil {
		return err
	}
	q := u.Query()
	q.Set("model", model)
	q.Set("reasoning.effort", effort)
	u.RawQuery = q.Encode()

	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+g.apiKey)

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, resp, err := dialer.DialContext(ctx, u.String(), headers)
	if err != nil {
		if resp != nil {
			return fmt.Errorf("falha ao conectar no grok live (status %d): %w", resp.StatusCode, err)
		}
		return fmt.Errorf("falha ao conectar no grok live: %w", err)
	}

	g.ws = conn
	g.log.Info("conectado ao grok live", "model", model, "reasoningEffort", effort)

	// Envia configuração inicial da sessão (session.update)
	voice := "eve"
	if g.config.VoiceName != "" && grokIsVoice(g.config.VoiceName) {
		voice = g.config.VoiceName
	}

	temp := g.config.Temperature
	if temp <= 0 {
		temp = 0.7
	}

	lang := g.config.LanguageCode
	if lang == "" {
		lang = "pt-BR"
	}

	// Injeta diretiva de idioma nas instruções do Grok (não possui campo language nativo no session.update)
	instructions := g.config.SystemInstruction
	langDirective := grokLanguageDirective(lang)
	if langDirective != "" {
		instructions = langDirective + "\n\n" + instructions
	}

	// Transcrição com language_hint (BCP-47) para melhorar acurácia do ASR
	transcriptionCfg := map[string]any{
		"model":         "grok-transcribe",
		"language_hint": lang,
	}

	// Velocidade de saída da voz (0.7–1.5, padrão 1.0)
	outputSpeed := g.config.GrokOutputSpeed
	if outputSpeed < 0.7 || outputSpeed > 1.5 {
		outputSpeed = 1.0
	}

	sessionMap := map[string]any{
		"voice":        voice,
		"instructions": instructions,
		"temperature":  temp,
		"turn_detection": map[string]any{
			"type":                "server_vad",
			"threshold":           0.5,
			"prefix_padding_ms":   300,
			"silence_duration_ms": 500,
		},
		"audio": map[string]any{
			"input": map[string]any{
				"format":        map[string]any{"type": "audio/pcm", "rate": 24000},
				"transcription": transcriptionCfg,
			},
			"output": map[string]any{
				"format": map[string]any{"type": "audio/pcm", "rate": 24000},
				"speed":  outputSpeed,
			},
		},
	}

	g.log.Info("sessão grok configurada", "voice", voice, "language", lang, "reasoningEffort", effort)

	grokTools := g.buildGrokTools()
	if len(grokTools) > 0 {
		sessionMap["tools"] = grokTools
		g.log.Info("ferramentas registradas na sessão do Grok", "count", len(grokTools))
	}

	sessionUpdate := map[string]any{
		"type":    "session.update",
		"session": sessionMap,
	}

	if err := conn.WriteJSON(sessionUpdate); err != nil {
		conn.Close()
		g.ws = nil
		return fmt.Errorf("falha ao enviar session.update para o grok: %w", err)
	}

	go g.readLoop()
	return nil
}

func grokIsModel(name string) bool {
	return name == "grok-voice-latest" || name == "grok-voice-think-fast-2.0" || name == "grok-voice-think-fast-1.0"
}

// grokLanguageDirective retorna uma diretiva textual de idioma para ser injetada nas instructions do Grok.
// O Realtime API do Grok não possui campo "language" nativo no session.update, então
// o idioma é controlado via instrução explícita no prompt do sistema.
func grokLanguageDirective(lang string) string {
	switch strings.ToLower(lang) {
	case "pt-br":
		return "[IDIOMA OBRIGATÓRIO: Português Brasileiro (pt-BR). Você DEVE falar, responder e transcrever EXCLUSIVAMENTE em Português do Brasil. Não use inglês, espanhol ou qualquer outro idioma, a menos que o cliente solicite explicitamente.]"
	case "pt-pt":
		return "[IDIOMA OBRIGATÓRIO: Português Europeu (pt-PT). Você DEVE falar e responder EXCLUSIVAMENTE em Português de Portugal.]"
	case "en-us", "en":
		return "[MANDATORY LANGUAGE: American English (en-US). You MUST speak and respond EXCLUSIVELY in American English.]"
	case "es-es", "es":
		return "[IDIOMA OBLIGATORIO: Español (es-ES). Debes hablar y responder EXCLUSIVAMENTE en Español.]"
	case "es-mx":
		return "[IDIOMA OBLIGATORIO: Español Mexicano (es-MX). Debes hablar y responder EXCLUSIVAMENTE en Español de México.]"
	case "fr":
		return "[LANGUE OBLIGATOIRE: Français (fr). Vous DEVEZ parler et répondre EXCLUSIVEMENT en Français.]"
	case "de":
		return "[PFLICHTSPRACHE: Deutsch (de). Sie MÜSSEN ausschließlich auf Deutsch sprechen und antworten.]"
	case "it":
		return "[LINGUA OBBLIGATORIA: Italiano (it). DEVI parlare e rispondere ESCLUSIVAMENTE in Italiano.]"
	case "ja":
		return "[必須言語: 日本語 (ja)。日本語のみで話し、応答してください。]"
	case "ko":
		return "[필수 언어: 한국어 (ko). 한국어로만 말하고 응답하세요.]"
	case "zh":
		return "[必须语言: 中文 (zh)。请只用中文说话和回答。]"
	case "auto":
		return "" // Detecção automática — sem diretiva
	default:
		return ""
	}
}

func grokIsVoice(name string) bool {
	switch strings.ToLower(name) {
	case "eve", "ara", "carina", "zagan", "helix", "orion", "luna", "iris", "altair", "zenith",
		"perseus", "helios", "lux", "kepler", "rigel", "cosmo", "celeste", "ursa", "sirius", "lumen",
		"castor", "naksh", "atlas", "leo", "rex", "sal":
		return true
	default:
		return false
	}
}

func (g *GrokLiveClient) readLoop() {
	defer func() {
		g.mu.Lock()
		if g.ws != nil {
			g.ws.Close()
			g.ws = nil
		}
		g.mu.Unlock()
	}()

	for {
		g.mu.Lock()
		ws := g.ws
		g.mu.Unlock()

		if ws == nil {
			return
		}

		_, message, err := ws.ReadMessage()
		if err != nil {
			g.log.Debug("grok ws encerrado", "err", err)
			if g.onClose != nil {
				g.onClose(err)
			}
			return
		}

		var event map[string]any
		if err := json.Unmarshal(message, &event); err != nil {
			continue
		}

		evtType, _ := event["type"].(string)
		switch evtType {
		case "response.output_audio.delta", "response.audio.delta":
			if delta, ok := event["delta"].(string); ok && delta != "" && g.onAudio != nil {
				g.onAudio(delta)
			}

		// Transcrição streaming da fala da IA
		case "response.output_audio_transcript.delta":
			if delta, ok := event["delta"].(string); ok && delta != "" {
				g.mu.Lock()
				g.lastUserCumulative = "" // Reset do turno do usuário quando a IA fala
				g.mu.Unlock()
				g.appendTranscript("ai", delta)
				if g.onTranscript != nil {
					g.onTranscript("ai", delta)
				}
			}

		// Transcrição final da fala da IA
		case "response.output_audio_transcript.done":
			if transcript, ok := event["transcript"].(string); ok && transcript != "" {
				g.log.Debug("grok transcrição IA completa", "text", transcript)
			}

		// Transcrição streaming parcial e final do usuário (Grok envia texto acumulativo de turnos)
		case "conversation.item.input_audio_transcription.updated", "conversation.item.input_audio_transcription.completed":
			if transcript, ok := event["transcript"].(string); ok && transcript != "" {
				g.handleUserTranscript(transcript)
			}

		case "input_audio_buffer.speech_started":
			g.mu.Lock()
			g.lastUserCumulative = "" // Novo turno de fala do usuário
			g.mu.Unlock()
			g.log.Debug("grok VAD detectou fala do usuário (interrupção)")
			if g.onInterruption != nil {
				g.onInterruption()
			}

		case "response.function_call_arguments.done":
			name, _ := event["name"].(string)
			callID, _ := event["call_id"].(string)
			args, _ := event["arguments"].(string)
			if name != "" && g.onToolCall != nil {
				g.onToolCall(callID, name, args)
			}

		case "error":
			errMsg, _ := event["message"].(string)
			errCode, _ := event["code"].(string)
			g.log.Error("grok realtime error", "code", errCode, "message", errMsg)
		}
	}
}

// handleUserTranscript realiza o cálculo de diferença (diff) entre transcrições acumulativas do Grok ASR,
// emitindo apenas as palavras novas (deltas) para o frontend para evitar qualquer duplicação.
func (g *GrokLiveClient) handleUserTranscript(fullTranscript string) {
	g.mu.Lock()
	defer g.mu.Unlock()

	fullTranscript = strings.TrimSpace(fullTranscript)
	if fullTranscript == "" {
		return
	}

	// Se o texto for idêntico ao já processado nesta frase, ignora
	if fullTranscript == g.lastUserCumulative {
		return
	}

	var delta string
	if g.lastUserCumulative != "" && strings.HasPrefix(fullTranscript, g.lastUserCumulative) {
		// Pega apenas a parte nova adicionada à frase
		delta = fullTranscript[len(g.lastUserCumulative):]
	} else {
		// Nova frase ou ajuste do ASR
		delta = fullTranscript
	}

	g.lastUserCumulative = fullTranscript

	if strings.TrimSpace(delta) == "" {
		return
	}

	// Atualiza transcrição acumulada da sessão
	if len(g.transcript) > 0 && g.transcript[len(g.transcript)-1].Speaker == "user" {
		if !strings.HasPrefix(fullTranscript, delta) {
			g.transcript[len(g.transcript)-1].Text = fullTranscript
		} else {
			g.transcript[len(g.transcript)-1].Text += delta
		}
	} else {
		g.transcript = append(g.transcript, TranscriptLine{
			Speaker: "user",
			Text:    fullTranscript,
			At:      time.Now().UnixMilli(),
		})
	}

	if g.onTranscript != nil {
		g.onTranscript("user", delta)
	}
}

func (g *GrokLiveClient) appendTranscript(speaker, text string) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if len(g.transcript) > 0 && g.transcript[len(g.transcript)-1].Speaker == speaker {
		g.transcript[len(g.transcript)-1].Text += text
	} else {
		g.transcript = append(g.transcript, TranscriptLine{
			Speaker: speaker,
			Text:    text,
			At:      time.Now().UnixMilli(),
		})
	}
}

func (g *GrokLiveClient) Transcript() []TranscriptLine {
	g.mu.Lock()
	defer g.mu.Unlock()
	out := make([]TranscriptLine, len(g.transcript))
	copy(out, g.transcript)
	return out
}

func (g *GrokLiveClient) SendAudio(pcm16 []float32) {
	pcm24 := Upsample16to24(pcm16)
	buf := make([]byte, len(pcm24)*2)
	for i, s := range pcm24 {
		if s > 1.0 {
			s = 1.0
		}
		if s < -1.0 {
			s = -1.0
		}
		val := int16(s * 32767.0)
		buf[i*2] = byte(val)
		buf[i*2+1] = byte(val >> 8)
	}
	b64 := base64.StdEncoding.EncodeToString(buf)
	_ = g.SendAudioChunk(b64)
}

func (g *GrokLiveClient) SendText(text string) {
	g.mu.Lock()
	ws := g.ws
	g.mu.Unlock()

	if ws == nil || text == "" {
		return
	}

	msg := map[string]any{
		"type": "conversation.item.create",
		"item": map[string]any{
			"type": "message",
			"role": "user",
			"content": []map[string]any{
				{
					"type": "input_text",
					"text": text,
				},
			},
		},
	}
	_ = ws.WriteJSON(msg)

	respMsg := map[string]any{
		"type": "response.create",
	}
	_ = ws.WriteJSON(respMsg)
}

func (g *GrokLiveClient) SendAudioChunk(base64PCM string) error {
	g.mu.Lock()
	ws := g.ws
	g.mu.Unlock()

	if ws == nil {
		return fmt.Errorf("grok live não está conectado")
	}

	msg := map[string]any{
		"type":  "input_audio_buffer.append",
		"audio": base64PCM,
	}
	return ws.WriteJSON(msg)
}

func (g *GrokLiveClient) SendToolResult(callID string, output string) error {
	g.mu.Lock()
	ws := g.ws
	g.mu.Unlock()

	if ws == nil {
		return fmt.Errorf("grok live não está conectado")
	}

	itemMsg := map[string]any{
		"type": "conversation.item.create",
		"item": map[string]any{
			"type":    "function_call_output",
			"call_id": callID,
			"output":  output,
		},
	}
	if err := ws.WriteJSON(itemMsg); err != nil {
		return err
	}

	respMsg := map[string]any{
		"type": "response.create",
	}
	return ws.WriteJSON(respMsg)
}

func (g *GrokLiveClient) Close() {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.ws != nil {
		g.ws.Close()
		g.ws = nil
	}
}

// buildGrokTools constrói a lista de ferramentas registradas no formato OpenAI/Grok Realtime,
// incluindo as ferramentas nativas do Grok (Web Search e X Search).
func (g *GrokLiveClient) buildGrokTools() []map[string]any {
	var tools []map[string]any

	// Ferramentas nativas do Grok (Web Search e X Search)
	if g.config.EnableGrokWebSearch {
		tools = append(tools, map[string]any{
			"type": "web_search",
		})
	}
	if g.config.EnableGrokXSearch {
		tools = append(tools, map[string]any{
			"type": "x_search",
		})
	}

	if g.config.ToolsEnabled {
		for _, name := range g.config.PredefinedTools {
			switch name {
			case "hangup":
				tools = append(tools, map[string]any{
					"type":        "function",
					"name":        "hangup",
					"description": "Termina a chamada de voz imediatamente e desliga o telefone do cliente.",
					"parameters": map[string]any{
						"type":       "object",
						"properties": map[string]any{},
					},
				})
			case "open_ticket":
				tools = append(tools, map[string]any{
					"type":        "function",
					"name":        "open_ticket",
					"description": "Abre um chamado de suporte ou contato para que um atendente humano retorne por chat ou ligação.",
					"parameters": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"reason": map[string]any{"type": "string", "description": "O motivo do chamado ou solicitação do cliente."},
						},
					},
				})
			case "send_message":
				tools = append(tools, map[string]any{
					"type":        "function",
					"name":        "send_message",
					"description": "Envia uma mensagem de texto via WhatsApp para o cliente.",
					"parameters": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"message": map[string]any{"type": "string", "description": "O conteúdo da mensagem a ser enviada."},
							"to":      map[string]any{"type": "string", "description": "Número do destinatário com DDI. Se vazio, envia para o cliente atual."},
						},
						"required": []string{"message"},
					},
				})
			case "schedule_call":
				tools = append(tools, map[string]any{
					"type":        "function",
					"name":        "schedule_call",
					"description": "Agenda uma ligação telefônica da IA para este cliente.",
					"parameters": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"datetime": map[string]any{"type": "string", "description": "Data e Hora do agendamento em ISO 8601 UTC."},
							"prompt":   map[string]any{"type": "string", "description": "Instruções para a IA na próxima chamada."},
						},
						"required": []string{"datetime"},
					},
				})
			case "transfer_agent", "transfer_to_agent":
				tools = append(tools, map[string]any{
					"type":        "function",
					"name":        "transfer_agent",
					"description": "Transfere a chamada de voz para outro atendente ou especialista. Informe o ID do agente de destino.",
					"parameters": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"target_agent_id": map[string]any{"type": "string", "description": "O ID do agente especialista destino."},
						},
						"required": []string{"target_agent_id"},
					},
				})
			}
		}

		if g.config.ChatwootEnabled {
			tools = append(tools, map[string]any{
				"type":        "function",
				"name":        "fetch_chatwoot_history",
				"description": "Busca o histórico recente de conversas por texto do Chatwoot para obter contexto do atendimento.",
				"parameters": map[string]any{
					"type":       "object",
					"properties": map[string]any{},
				},
			})
		}

		for _, ct := range g.config.CustomTools {
			props := map[string]any{}
			var required []string
			for _, p := range ct.Parameters {
				pType := strings.ToLower(p.Type)
				if pType == "" || pType == "string" {
					pType = "string"
				}
				props[p.Name] = map[string]any{
					"type":        pType,
					"description": p.Description,
				}
				if p.Required {
					required = append(required, p.Name)
				}
			}
			tools = append(tools, map[string]any{
				"type":        "function",
				"name":        ct.Name,
				"description": ct.Description,
				"parameters": map[string]any{
					"type":       "object",
					"properties": props,
					"required":   required,
				},
			})
		}
	}

	return tools
}
