package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

type ToolParam struct {
	Name        string `json:"name"`
	Type        string `json:"type"`
	Description string `json:"description"`
	Required    bool   `json:"required"`
}

type CustomTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	WebhookURL  string      `json:"webhookUrl"`
	Parameters  []ToolParam `json:"parameters"`
}

type PostCallActions struct {
	SummaryEnabled bool   `json:"summaryEnabled"`
	SendAdmin      bool   `json:"sendAdmin"`
	AdminNumber    string `json:"adminNumber"`
	SendClient     bool   `json:"sendClient"`
	WebhookEnabled bool   `json:"webhookEnabled"`
	WebhookURL     string `json:"webhookUrl"`
}

type NPSConfig struct {
	Enabled         bool   `json:"enabled"`
	DelaySec        int    `json:"delaySec"`
	MinCallDuration int    `json:"minCallDuration"`
	SupervisorPhone string `json:"supervisorPhone"`
	MessageTemplate string `json:"messageTemplate"`
}

type MissedFollowupConfig struct {
	Enabled         bool   `json:"enabled"`
	DelaySec        int    `json:"delaySec"`
	MessageTemplate string `json:"messageTemplate"`
}

type TransferRule struct {
	TargetAgentID   string `json:"targetAgentId"`
	TargetAgentName string `json:"targetAgentName"`
	Condition       string `json:"condition"`
}

var DefaultToolPrompts = map[string]string{
	"hangup":         "* Ferramenta hangup (Desligar Chamada): Use esta ferramenta APENAS E EXCLUSIVAMENTE quando o cliente disser explicitamente que não precisa de mais nada, se despedir ou confirmar que o atendimento está encerrado. NUNCA chame esta ferramenta automaticamente após executar outras ferramentas (como enviar mensagem no WhatsApp, agendar ligação ou pesquisar na web). Sempre pergunte ao cliente se ele precisa de algo mais antes de despedir-se.",
	"open_ticket":    "* Ferramenta open_ticket (Abrir Chamado): Use esta ferramenta quando o cliente solicitar falar com um atendente humano, suporte ou precisar de ajuda especializada que a IA não consiga resolver. Informe ao cliente que o chamado foi aberto e PERGUNTE se ele precisa de ajuda com mais alguma coisa. Não desligue a chamada após usar esta ferramenta.",
	"send_message":   "* Ferramenta send_message (Enviar WhatsApp): Use esta ferramenta quando o cliente solicitar que você envie informações por escrito no WhatsApp (ex: chave Pix, links, endereços, confirmações). Diga ao cliente: \"Estou te enviando esses dados agora mesmo no seu WhatsApp\", execute a ferramenta e PERGUNTE educadamente se ele precisa de mais alguma coisa. JAMAIS se despeça ou chame a ferramenta hangup imediatamente após enviar a mensagem.",
	"schedule_call":  "* Ferramenta schedule_call (Reagendar/Agendar Ligação): Se o cliente disser que não pode falar no momento ou solicitar um lembrete, pergunte pela data e hora desejada e execute a ferramenta. Confirme o agendamento e PERGUNTE se há algo mais em que você possa ajudar antes de encerrar.",
	"transfer_agent": "* Ferramenta transfer_agent (Transferir para Agente Especialista): Use esta ferramenta quando o cliente solicitar ou se enquadrar em uma das regras de transferência. Diga verbalmente: \"Vou te transferir para o especialista, só um instante por favor...\" e execute a ferramenta fornecendo o 'target_agent_id'. APÓS EXECUTAR A FERRAMENTA, PERMANEÇA EM SILÊNCIO E NÃO DIGA MAIS NADA.",
}

type AIConfig struct {
	ServerSideAI      bool                 `json:"serverSideAI"`
	Provider          string               `json:"provider"`  // "gemini", "grok", "openai"
	ModelName         string               `json:"modelName"` // ex: "grok-voice-latest", "gemini-2.5-flash"
	GeminiAPIKey      string               `json:"geminiApiKey"`
	VoiceName         string               `json:"voiceName"`
	LanguageCode      string               `json:"languageCode"`
	SystemInstruction string               `json:"systemInstruction"`
	AutoAnswer        bool                 `json:"autoAnswer"`
	AutoAnswerDelay   int                  `json:"autoAnswerDelay"`
	Temperature       float64              `json:"temperature"`
	MaxDurationMin    int                  `json:"maxDurationMin"`
	SilenceOperator   bool                 `json:"silenceOperator"`
	TranscribeAudio   bool                 `json:"transcribeAudio"`
	ScheduledCalls    string               `json:"scheduledCalls"` // Array JSON de agendamentos
	FirstUtterance    string               `json:"firstUtterance"`
	ToolsEnabled      bool                 `json:"toolsEnabled"`
	PredefinedTools   []string             `json:"predefinedTools"`
	ToolPrompts       map[string]string    `json:"toolPrompts"`
	CustomTools       []CustomTool         `json:"customTools"`
	PostCall          PostCallActions      `json:"postCall"`
	NPS               NPSConfig            `json:"nps"`
	MissedFollowup    MissedFollowupConfig `json:"missedFollowup"`
	CustomFields             string               `json:"customFields"`
	TransferRules            []TransferRule       `json:"transferRules"`
	EnableSpecialistTransfer bool                 `json:"enableSpecialistTransfer"`
	AllowedSpecialistIDs     []string             `json:"allowedSpecialistIds"`
	ChatwootEnabled          bool                 `json:"chatwootEnabled"`
	EnableGrokWebSearch      bool                 `json:"enableGrokWebSearch"`
	EnableGrokXSearch        bool                 `json:"enableGrokXSearch"`
	GrokReasoningEffort      string               `json:"grokReasoningEffort"` // "high", "none"
	GrokOutputSpeed          float64              `json:"grokOutputSpeed"`     // 0.7–1.5, padrão 1.0
}

func (s *server) handleSetAIConfig(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}

	var cfg AIConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	existing := sess.getAIConfig()
	if strings.Contains(cfg.GeminiAPIKey, "•••••") {
		cfg.GeminiAPIKey = existing.GeminiAPIKey
	}

	sess.setAIConfig(cfg)
	b, _ := json.Marshal(cfg)

	wsID := sess.projectID
	if wsID == "" {
		wsID = "default"
	}

	// Persistir no PocketBase (SSOT): Coleção sessions e Coleção agents
	_ = pbClient.UpdateSessionAIConfigPB(r.Context(), sess.id, string(b))
	_ = pbClient.UpsertMasterAgentPB(r.Context(), wsID, "Agente Principal", "Agente de Atendimento Principal", string(b), true, true)

	// Persistir no SQLite local
	if err := sess.mgr.store.setAIConfig(r.Context(), sess.id, string(b)); err != nil {
		sess.log.Error("falha ao persistir ai-config", "session", sess.id, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "falha ao salvar configuração no banco"})
		return
	}

	if sess.mgr.Scheduler != nil {
		sess.mgr.Scheduler.RecalculateActiveCount()
	}

	writeJSON(w, http.StatusOK, map[string]any{"aiConfig": cfg})
}

func (s *server) handleGetAIConfig(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}

	cfg := sess.getAIConfig()
	prov := cfg.Provider
	if prov == "" {
		prov = "gemini"
	}

	// Resolve se há chave configurada no PocketBase, SQLite ou .env para o provedor selecionado
	key := resolveAIProviderKey(r.Context(), s.sessions.store, sess.projectID, prov)
	if key == "" {
		key = resolveAIProviderKey(r.Context(), s.sessions.store, sess.projectID, "gemini")
	}
	if key == "" && cfg.GeminiAPIKey != "" && !containsBullet(cfg.GeminiAPIKey) {
		key = cfg.GeminiAPIKey
	}

	hasKey := key != ""

	if hasKey {
		if len(key) > 6 {
			cfg.GeminiAPIKey = key[:3] + "•••••" + key[len(key)-3:]
		} else {
			cfg.GeminiAPIKey = "•••••"
		}
	} else {
		cfg.GeminiAPIKey = ""
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"aiConfig":    cfg,
		"enabled":     hasKey,
		"geminiProxy": true,
	})
}

func (s *server) handleDeleteAIConfig(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}

	sess.setAIConfig(AIConfig{})
	_ = pbClient.UpdateSessionAIConfigPB(r.Context(), sess.id, "")
	if err := sess.mgr.store.setAIConfig(r.Context(), sess.id, ""); err != nil {
		sess.log.Error("falha ao remover ai-config", "session", sess.id, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "falha ao remover configuração no banco"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
