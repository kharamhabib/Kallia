package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// ChatAgent representa uma persona especialista para atendimento automatizado em texto (WhatsApp/Omnichannel).
type ChatAgent struct {
	ID              string          `json:"id"`
	WorkspaceID     string          `json:"workspace_id"`
	Name            string          `json:"name"`
	AvatarURL       string          `json:"avatar_url"`
	Provider        string          `json:"provider"`   // "gemini", "openai", "grok"
	ModelName       string          `json:"model_name"` // "gemini-2.5-flash", "gemini-2.0-flash", etc.
	SystemPrompt    string          `json:"system_prompt"`
	Temperature     float32         `json:"temperature"`
	MaxTokens       int             `json:"max_tokens"`
	TypingDelaySec  int             `json:"typing_delay_sec"`
	AudioReplyMode  string          `json:"audio_reply_mode"` // "text", "mirror", "audio"
	MaxBubbles      int             `json:"max_bubbles"`
	IsDefault       bool            `json:"is_default"`
	ToolsEnabled    bool            `json:"tools_enabled"`
	PredefinedTools json.RawMessage `json:"predefined_tools"`
	CustomTools     json.RawMessage `json:"custom_tools"`
	RAGEnabled      bool            `json:"rag_enabled"`
	RAGSources      json.RawMessage `json:"rag_sources"`
	HandoffEnabled  bool            `json:"handoff_enabled"`
	HandoffKeywords json.RawMessage `json:"handoff_keywords"`
	Active          bool            `json:"active"`
	CreatedAt       time.Time       `json:"created_at"`
}

// ── Banco de Dados (PostgreSQL) ─────────────────────────────────────────

func pgListChatAgents(db *sql.DB, wid string) ([]ChatAgent, error) {
	if db == nil {
		return []ChatAgent{}, nil
	}

	query := `
		SELECT id, workspace_id, name, COALESCE(avatar_url, ''), COALESCE(provider, 'gemini'),
		       COALESCE(model_name, 'gemini-2.5-flash'), COALESCE(system_prompt, ''),
		       COALESCE(temperature, 0.7), COALESCE(max_tokens, 2048),
		       COALESCE(typing_delay_sec, 3), COALESCE(audio_reply_mode, 'text'), COALESCE(max_bubbles, 3),
		       COALESCE(is_default, false), COALESCE(tools_enabled, true),
		       COALESCE(predefined_tools, '[]'::jsonb), COALESCE(custom_tools, '[]'::jsonb),
		       COALESCE(rag_enabled, false), COALESCE(rag_sources, '[]'::jsonb),
		       COALESCE(handoff_enabled, true), COALESCE(handoff_keywords, '["atendente", "humano", "falar com alguém"]'::jsonb),
		       COALESCE(active, true), created_at
		FROM chat_agents
		WHERE workspace_id = $1
		ORDER BY created_at DESC
	`
	rows, err := db.Query(query, wid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []ChatAgent
	for rows.Next() {
		var a ChatAgent
		if err := rows.Scan(
			&a.ID, &a.WorkspaceID, &a.Name, &a.AvatarURL, &a.Provider,
			&a.ModelName, &a.SystemPrompt, &a.Temperature, &a.MaxTokens,
			&a.TypingDelaySec, &a.AudioReplyMode, &a.MaxBubbles,
			&a.IsDefault, &a.ToolsEnabled,
			&a.PredefinedTools, &a.CustomTools,
			&a.RAGEnabled, &a.RAGSources,
			&a.HandoffEnabled, &a.HandoffKeywords,
			&a.Active, &a.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, a)
	}
	if list == nil {
		list = []ChatAgent{}
	}
	return list, nil
}

func pgGetChatAgent(db *sql.DB, wid, id string) (*ChatAgent, error) {
	if db == nil {
		return nil, fmt.Errorf("postgres não disponível")
	}

	var a ChatAgent
	query := `
		SELECT id, workspace_id, name, COALESCE(avatar_url, ''), COALESCE(provider, 'gemini'),
		       COALESCE(model_name, 'gemini-2.5-flash'), COALESCE(system_prompt, ''),
		       COALESCE(temperature, 0.7), COALESCE(max_tokens, 2048),
		       COALESCE(typing_delay_sec, 3), COALESCE(audio_reply_mode, 'text'), COALESCE(max_bubbles, 3),
		       COALESCE(is_default, false), COALESCE(tools_enabled, true),
		       COALESCE(predefined_tools, '[]'::jsonb), COALESCE(custom_tools, '[]'::jsonb),
		       COALESCE(rag_enabled, false), COALESCE(rag_sources, '[]'::jsonb),
		       COALESCE(handoff_enabled, true), COALESCE(handoff_keywords, '["atendente", "humano", "falar com alguém"]'::jsonb),
		       COALESCE(active, true), created_at
		FROM chat_agents
		WHERE id = $1 AND workspace_id = $2
	`
	err := db.QueryRow(query, id, wid).Scan(
		&a.ID, &a.WorkspaceID, &a.Name, &a.AvatarURL, &a.Provider,
		&a.ModelName, &a.SystemPrompt, &a.Temperature, &a.MaxTokens,
		&a.TypingDelaySec, &a.AudioReplyMode, &a.MaxBubbles,
		&a.IsDefault, &a.ToolsEnabled,
		&a.PredefinedTools, &a.CustomTools,
		&a.RAGEnabled, &a.RAGSources,
		&a.HandoffEnabled, &a.HandoffKeywords,
		&a.Active, &a.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func pgGetDefaultChatAgent(db *sql.DB, wid string) (*ChatAgent, error) {
	if db == nil {
		return nil, fmt.Errorf("postgres não disponível")
	}

	var a ChatAgent
	query := `
		SELECT id, workspace_id, name, COALESCE(avatar_url, ''), COALESCE(provider, 'gemini'),
		       COALESCE(model_name, 'gemini-2.5-flash'), COALESCE(system_prompt, ''),
		       COALESCE(temperature, 0.7), COALESCE(max_tokens, 2048),
		       COALESCE(typing_delay_sec, 3), COALESCE(audio_reply_mode, 'text'), COALESCE(max_bubbles, 3),
		       COALESCE(is_default, false), COALESCE(tools_enabled, true),
		       COALESCE(predefined_tools, '[]'::jsonb), COALESCE(custom_tools, '[]'::jsonb),
		       COALESCE(rag_enabled, false), COALESCE(rag_sources, '[]'::jsonb),
		       COALESCE(handoff_enabled, true), COALESCE(handoff_keywords, '["atendente", "humano", "falar com alguém"]'::jsonb),
		       COALESCE(active, true), created_at
		FROM chat_agents
		WHERE workspace_id = $1 AND active = true
		ORDER BY is_default DESC, created_at ASC
		LIMIT 1
	`
	err := db.QueryRow(query, wid).Scan(
		&a.ID, &a.WorkspaceID, &a.Name, &a.AvatarURL, &a.Provider,
		&a.ModelName, &a.SystemPrompt, &a.Temperature, &a.MaxTokens,
		&a.TypingDelaySec, &a.AudioReplyMode, &a.MaxBubbles,
		&a.IsDefault, &a.ToolsEnabled,
		&a.PredefinedTools, &a.CustomTools,
		&a.RAGEnabled, &a.RAGSources,
		&a.HandoffEnabled, &a.HandoffKeywords,
		&a.Active, &a.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func pgSaveChatAgent(db *sql.DB, a *ChatAgent) error {
	if db == nil {
		return fmt.Errorf("postgres não disponível")
	}

	if a.Provider == "" {
		a.Provider = "gemini"
	}
	if a.ModelName == "" {
		a.ModelName = "gemini-2.5-flash"
	}
	if a.TypingDelaySec <= 0 {
		a.TypingDelaySec = 3
	}
	if a.MaxBubbles <= 0 {
		a.MaxBubbles = 3
	}
	if a.AudioReplyMode == "" {
		a.AudioReplyMode = "text"
	}
	if len(a.PredefinedTools) == 0 {
		a.PredefinedTools = json.RawMessage(`["transfer_to_human", "update_contact", "add_tag"]`)
	}
	if len(a.CustomTools) == 0 {
		a.CustomTools = json.RawMessage(`[]`)
	}
	if len(a.RAGSources) == 0 {
		a.RAGSources = json.RawMessage(`[]`)
	}
	if len(a.HandoffKeywords) == 0 {
		a.HandoffKeywords = json.RawMessage(`["atendente", "humano", "falar com alguém"]`)
	}

	// Se marcado como padrão, desmarca outros do mesmo workspace
	if a.IsDefault {
		_, _ = db.Exec("UPDATE chat_agents SET is_default = false WHERE workspace_id = $1", a.WorkspaceID)
	}

	if a.ID == "" {
		query := `
			INSERT INTO chat_agents (
				workspace_id, name, avatar_url, provider, model_name, system_prompt,
				temperature, max_tokens, typing_delay_sec, audio_reply_mode, max_bubbles,
				is_default, tools_enabled, predefined_tools, custom_tools,
				rag_enabled, rag_sources, handoff_enabled, handoff_keywords, active, created_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now()
			) RETURNING id, created_at
		`
		return db.QueryRow(query,
			a.WorkspaceID, a.Name, a.AvatarURL, a.Provider, a.ModelName, a.SystemPrompt,
			a.Temperature, a.MaxTokens, a.TypingDelaySec, a.AudioReplyMode, a.MaxBubbles,
			a.IsDefault, a.ToolsEnabled, string(a.PredefinedTools), string(a.CustomTools),
			a.RAGEnabled, string(a.RAGSources), a.HandoffEnabled, string(a.HandoffKeywords), a.Active,
		).Scan(&a.ID, &a.CreatedAt)
	}

	query := `
		UPDATE chat_agents SET
			name = $1, avatar_url = $2, provider = $3, model_name = $4, system_prompt = $5,
			temperature = $6, max_tokens = $7, typing_delay_sec = $8, audio_reply_mode = $9, max_bubbles = $10,
			is_default = $11, tools_enabled = $12, predefined_tools = $13, custom_tools = $14,
			rag_enabled = $15, rag_sources = $16, handoff_enabled = $17, handoff_keywords = $18, active = $19
		WHERE id = $20 AND workspace_id = $21
	`
	_, err := db.Exec(query,
		a.Name, a.AvatarURL, a.Provider, a.ModelName, a.SystemPrompt,
		a.Temperature, a.MaxTokens, a.TypingDelaySec, a.AudioReplyMode, a.MaxBubbles,
		a.IsDefault, a.ToolsEnabled, string(a.PredefinedTools), string(a.CustomTools),
		a.RAGEnabled, string(a.RAGSources), a.HandoffEnabled, string(a.HandoffKeywords), a.Active,
		a.ID, a.WorkspaceID,
	)
	return err
}

func pgDeleteChatAgent(db *sql.DB, wid, id string) error {
	if db == nil {
		return fmt.Errorf("postgres não disponível")
	}
	_, err := db.Exec("DELETE FROM chat_agents WHERE id = $1 AND workspace_id = $2", id, wid)
	return err
}

// ── HTTP Handlers ───────────────────────────────────────────────────────

func (s *server) handleListChatAgents(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusOK, []ChatAgent{})
		return
	}

	agents, err := pgListChatAgents(db, wid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, agents)
}

func (s *server) handleCreateChatAgent(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	var a ChatAgent
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}
	if strings.TrimSpace(a.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Nome do agente é obrigatório"})
		return
	}

	a.WorkspaceID = wid
	if err := pgSaveChatAgent(db, &a); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *server) handleGetChatAgent(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Agente não encontrado"})
		return
	}

	agent, err := pgGetChatAgent(db, wid, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Agente não encontrado"})
		return
	}
	writeJSON(w, http.StatusOK, agent)
}

func (s *server) handleUpdateChatAgent(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	var a ChatAgent
	if err := json.NewDecoder(r.Body).Decode(&a); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	a.ID = id
	a.WorkspaceID = wid
	if err := pgSaveChatAgent(db, &a); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *server) handleDeleteChatAgent(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	if err := pgDeleteChatAgent(db, wid, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleTestChatAgent executa uma simulação rápida de diálogo no Sandbox.
func (s *server) handleTestChatAgent(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	var req struct {
		Message string `json:"message"`
		History []struct {
			Sender  string `json:"sender"`
			Content string `json:"content"`
		} `json:"history"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if strings.TrimSpace(req.Message) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Mensagem é obrigatória"})
		return
	}

	agent, err := pgGetChatAgent(db, wid, id)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Agente não encontrado"})
		return
	}

	apiKey := resolveAIProviderKey(r.Context(), s.sessions.store, wid, agent.Provider)
	if apiKey == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("Chave do provedor '%s' não configurada neste workspace", agent.Provider)})
		return
	}

	// Executa geração simulada
	bubbles, err := simulateChatAgentTurn(r.Context(), db, s.sessions.store, agent, apiKey, req.Message, req.History)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"bubbles": bubbles,
	})
}
