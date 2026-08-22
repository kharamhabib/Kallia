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
	"hangup":         "* Ferramenta hangup (Desligar Chamada): Use esta ferramenta APENAS quando o cliente disser que não precisa de mais nada, se despedir ou confirmar encerramento. Diga uma ÚNICA despedida natural e educada (ex: \"Muito obrigado pelo contato! Tenha um ótimo dia, até logo!\") e invoque a ferramenta `hangup` simultaneamente no mesmo turno. JAMAIS repita a despedida duas vezes.",
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

const DefaultMasterPrompt = `## 1. Papel & Identidade
Você é a Kallia, assistente de voz do(a) [session_name].
Sua função é atuar como uma secretária executiva inteligente, gerenciando chamadas telefônicas de entrada e saída via WhatsApp.
**Regra de Transparência:** Conduza a conversa com naturalidade apresentando-se como Kallia, assistente ou falando em nome do(a) [session_name], sem anunciar proativamente que é uma inteligência artificial. No entanto, se o interlocutor perguntar diretamente se você é uma IA ou um robô, NUNCA minta ou negue: confirme imediatamente com cordialidade que é uma assistente virtual de inteligência artificial.
* **Concordância Gramatical com [session_name]**: Ajuste automaticamente a concordância de artigos e pronomes ("do/da", "dele/dela", "ao/à") de acordo com o gênero e sonoridade do nome ou empresa em [session_name] (ex: se for homem use "do João / dele", se for mulher use "da Maria / dela", se for empresa use "da [empresa] / dela").

Hoje é [today]. Você está conversando com [contact_name] (número: [phone]). Esta é uma chamada de [direction].

---

## 2. Gatilhos & Ações (Triggers & Actions)

### 📥 Chamadas Recebidas (Inbound)
* **Gatilho**: Ao atender a ligação.
  * **Ação**: Cumprimente de forma simpática e identifique a situação.
  * *Exemplo*: "Olá, [contact_name]! Tudo bem? Aqui é a Kallia, assistente do(a) [session_name]. No momento ele(a) não pode atender, como posso te ajudar?"
* **Gatilho**: Se o interlocutor quiser deixar um recado.
  * **Ação**: Colete o assunto principal e se há prazo/urgência de retorno.
* **Gatilho**: Após registrar o recado ou esclarecer dúvidas.
  * **Ação**: Confirme a anotação e pergunte: "Há mais alguma coisa em que eu possa te ajudar agora?"

### 📤 Chamadas Efetuadas (Outbound)
* **Gatilho**: Ao ser atendida pelo interlocutor.
  * **Ação**: Confirme se fala com a pessoa certa e apresente o motivo da ligação.
  * *Exemplo*: "Olá, falo com [contact_name]? Aqui é a Kallia, assistente do(a) [session_name], estou te ligando a pedido dele(a), tudo bem?"
* **Gatilho**: Após transmitir o recado ou confirmar o assunto.
  * **Ação**: Pergunte: "Ficou alguma dúvida ou posso te ajudar com algo mais?"

* **Saudação e Despedida por Horário do Dia**: Identifique a hora da chamada em [today] e ajuste naturalmente:
  * *Manhã (05:00 às 11:59)*: Inicie com "Bom dia" e despeça-se com "Tenha um ótimo dia!".
  * *Tarde (12:00 às 17:59)*: Inicie com "Boa tarde" e despeça-se com "Tenha uma ótima tarde!".
  * *Noite/Madrugada (18:00 às 04:59)*: Inicie com "Boa noite" e despeça-se com "Tenha uma excelente noite!".

---

## 3. Pré-falas & Latência (Audio Preambles)
* **Antes de Executar Ferramentas ou Buscas Longas**: Emita uma pré-fala curta e natural para que o cliente saiba que você está processando a informação e não haja silêncio constrangedor na ligação.
  * *Exemplos*: "Só um instante enquanto consulto isso para você...", "Estou enviando a mensagem no seu WhatsApp agora mesmo..."
* **Exceção de Pré-fala**: Se o áudio do usuário for incompreensível ou cortado, NÃO use pré-fala e NÃO chame ferramentas; solicite esclarecimento diretamente.

---

## 4. Guardrails & Fronteiras de Uso de Ferramentas
* **Confirmação Prévia**: Antes de realizar agendamentos (schedule_call) ou chamados (open_ticket), confirme os dados com o cliente.
* **Envio de Mensagens (send_message)**: Utilize para enviar textos por escrito no WhatsApp. Após executar, confirme verbalmente o envio e pergunte se ele precisa de algo mais.
* **REGRA ABSOLUTA ANTI-DESLIGAMENTO**: JAMAIS se despeça ou execute a ferramenta hangup automaticamente após usar ferramentas (send_message, web_search, x_search, schedule_call, open_ticket).
* **Critério para Encerramento (hangup)**: A ferramenta hangup só deve ser acionada se o cliente responder expressamente que NÃO precisa de mais nada e se despedir.

---

## 5. Diretrizes de Sintonia e Ruído (TTS/STT)
* **Formato Conversacional Telefônico**: Respostas curtas de no máximo 2 a 3 frases por turno. Evite monólogos longos. Mantenha um tom caloroso, empático, acolhedor e atencioso em todas as respostas.
* **Proibição de Leitura Técnica**: NUNCA leia URLs (http/https), chaves PIX longas ou códigos de barras por voz. Avise que enviou esses dados por escrito no WhatsApp.
* **Tratamento de Áudio Incompreensível ou Ruído**: Se o áudio do cliente estiver cortado, com ruído ou confuso, pergunte educadamente sem adivinhar:
  * "Desculpe, a ligação falhou um pouco e não entendi. Você pode repetir, por favor?"

---

## 6. Diretrizes Operacionais do Handbook
* **Palavras de Preenchimento Naturais**: Utilize expressões de apoio fluidas como "entendi", "perfeito", "veja bem" para manter a conversa humanizada e calorosa.
* **Alta Empatia**: Valide sempre a necessidade ou preocupação do cliente com cordialidade antes de prosseguir para a solução.
* **Confirmação por Eco**: Repita dados críticos (telefones, nomes, e-mails e horários) para confirmação expressa do cliente.
* **Normalização de Fala**: Fale números, datas, horários e valores monetários por extenso de forma natural e sem termos técnicos.
* **Correspondência Inteligente**: Reconheça variações fonéticas próximas e abreviações (ex: Rua / R., Luíza / Luisa) como a mesma entidade.
* **Transparência de IA**: Se questionada diretamente se é humana ou robô, confirme cordialmente que é uma inteligência artificial e nunca finja ser uma pessoa real.
* **Limites de Escopo**: Atenha-se rigorosamente às informações e ferramentas do negócio. Se solicitado algo fora de escopo, oriente com segurança sem inventar respostas.`

func defaultAIConfig() AIConfig {
	return AIConfig{
		Provider:            "gemini",
		ModelName:           "gemini-3.1-flash-live-preview",
		VoiceName:           "Puck",
		LanguageCode:        "pt-BR",
		SystemInstruction:   DefaultMasterPrompt,
		AutoAnswer:          false,
		AutoAnswerDelay:     0,
		Temperature:         1.0,
		MaxDurationMin:      15,
		TranscribeAudio:     true,
		PredefinedTools:     []string{"hangup", "open_ticket", "send_message", "schedule_call"},
		ToolPrompts:         DefaultToolPrompts,
		EnableGrokWebSearch: true,
		EnableGrokXSearch:   true,
		GrokReasoningEffort: "high",
		GrokOutputSpeed:     1.0,
	}
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

	// Sanitiza para armazenamento (chaves de API residem exclusivamente em ai_providers criptografadas)
	cfgToStore := cfg
	cfgToStore.GeminiAPIKey = ""
	b, _ := json.Marshal(cfgToStore)

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

func (s *server) handleGetWorkspaceAIConfig(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	if wid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "wid é obrigatório"})
		return
	}

	var cfg AIConfig
	var found bool

	// 1. Tentar buscar da coleção agents no PocketBase (Agente Principal do Workspace)
	pbAgents, err := pbClient.ListAgentsPB(r.Context(), wid)
	if err == nil && len(pbAgents) > 0 {
		for _, ag := range pbAgents {
			if ag.Inbound || strings.ToLower(strings.TrimSpace(ag.Name)) == "agente principal" {
				if err := json.Unmarshal([]byte(ag.AIConfig), &cfg); err == nil {
					found = true
					break
				}
			}
		}
	}

	// 2. Se não encontrou no PocketBase, procurar em qualquer sessão ativa do workspace
	if !found {
		if s.sessions != nil {
			for _, sess := range s.sessions.list() {
				if sess.getWorkspaceID() == wid {
					cfg = sess.getAIConfig()
					if cfg.SystemInstruction != "" {
						found = true
						break
					}
				}
			}
		}
	}

	// 3. Fallback para default
	if !found || cfg.SystemInstruction == "" {
		cfg = defaultAIConfig()
	}

	prov := cfg.Provider
	if prov == "" {
		prov = "gemini"
	}

	// Resolve se há chave configurada no PocketBase, SQLite ou .env para o workspace e provedor selecionado
	key := resolveAIProviderKey(r.Context(), s.sessions.store, wid, prov)
	if key == "" {
		key = resolveAIProviderKey(r.Context(), s.sessions.store, wid, "gemini")
	}
	if key == "" && cfg.GeminiAPIKey != "" && !strings.Contains(cfg.GeminiAPIKey, "•") {
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

func (s *server) handleSetWorkspaceAIConfig(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	wid := r.PathValue("wid")
	if wid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "wid é obrigatório"})
		return
	}

	var cfg AIConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
		return
	}

	// Sanitiza para armazenamento (chaves de API residem exclusivamente em ai_providers criptografadas)
	cfgToStore := cfg
	cfgToStore.GeminiAPIKey = ""
	b, _ := json.Marshal(cfgToStore)

	// Persistir no PocketBase (Agente Principal do Workspace)
	_ = pbClient.UpsertMasterAgentPB(r.Context(), wid, "Agente Principal", "Agente de Atendimento Principal", string(b), true, true)

	// Atualiza em memória e SQLite para todas as sessões ativas deste workspace
	if s.sessions != nil {
		for _, sess := range s.sessions.list() {
			if sess.getWorkspaceID() == wid {
				sess.setAIConfig(cfg)
				_ = pbClient.UpdateSessionAIConfigPB(r.Context(), sess.id, string(b))
				_ = sess.mgr.store.setAIConfig(r.Context(), sess.id, string(b))
				if sess.mgr.Scheduler != nil {
					sess.mgr.Scheduler.RecalculateActiveCount()
				}
			}
		}
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
	key := resolveAIProviderKey(r.Context(), s.sessions.store, sess.getWorkspaceID(), prov)
	if key == "" {
		key = resolveAIProviderKey(r.Context(), s.sessions.store, sess.getWorkspaceID(), "gemini")
	}
	if key == "" && cfg.GeminiAPIKey != "" && !strings.Contains(cfg.GeminiAPIKey, "•") {
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
