package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (s *server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}

	wsID := sess.projectID
	if wsID == "" {
		wsID = "default"
	}

	// 1. Carregar diretamente do PocketBase (fonte primária central)
	pbAgents, err := pbClient.ListAgentsPB(r.Context(), wsID)
	if err == nil && len(pbAgents) > 0 {
		writeJSON(w, http.StatusOK, map[string]any{"agents": pbAgents})
		return
	}

	// 2. Fallback para cache local no SQLite
	agents, err := s.sessions.store.listAgents(r.Context(), wsID)
	if err == nil && len(agents) > 0 {
		for _, ag := range agents {
			_, _ = pbClient.CreateAgentPB(r.Context(), ag.ID, wsID, ag.Name, ag.Description, ag.AIConfig, ag.Inbound, ag.Outbound)
		}
		writeJSON(w, http.StatusOK, map[string]any{"agents": agents})
		return
	}

	// 3. Se houver configuração na sessão, bootstrap do Agente Principal no PocketBase
	if cfg := sess.getAIConfig(); cfg.SystemInstruction != "" {
		b, _ := json.Marshal(cfg)
		_ = pbClient.UpsertMasterAgentPB(r.Context(), wsID, "Agente Principal", "Agente de Atendimento Principal", string(b), true, true)
		if refreshed, err := pbClient.ListAgentsPB(r.Context(), wsID); err == nil && len(refreshed) > 0 {
			writeJSON(w, http.StatusOK, map[string]any{"agents": refreshed})
			return
		}
	}

	if pbAgents == nil {
		pbAgents = []agentRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": pbAgents})
}

func (s *server) handleCreateAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}

	wsID := sess.projectID
	if wsID == "" {
		wsID = "default"
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AIConfig    string `json:"aiConfig"` // JSON string representation of AIConfig
		Inbound     bool   `json:"inbound"`
		Outbound    bool   `json:"outbound"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "o nome do agente é obrigatório"})
		return
	}

	agentID := newSessionID()
	// Criar diretamente no PocketBase
	pbID, err := pbClient.CreateAgentPB(r.Context(), agentID, wsID, name, body.Description, body.AIConfig, body.Inbound, body.Outbound)
	if err != nil {
		s.log.Warn("erro ao criar agente no PocketBase", "err", err)
	}
	if pbID != "" {
		agentID = pbID
	}

	// Sincronizar cache local SQLite
	_ = s.sessions.store.createAgent(r.Context(), agentID, wsID, name, body.Description, body.AIConfig, body.Inbound, body.Outbound)

	writeJSON(w, http.StatusCreated, map[string]any{"id": agentID})
}

func (s *server) handleUpdateAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}
	agentID := r.PathValue("agentId")
	if agentID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agentId é obrigatório"})
		return
	}

	var body struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		AIConfig    string `json:"aiConfig"`
		Inbound     bool   `json:"inbound"`
		Outbound    bool   `json:"outbound"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "o nome do agente é obrigatório"})
		return
	}

	// Atualizar no PocketBase e no SQLite
	_ = pbClient.UpdateAgentPB(r.Context(), agentID, name, body.Description, body.AIConfig, body.Inbound, body.Outbound)
	_ = s.sessions.store.updateAgent(r.Context(), agentID, name, body.Description, body.AIConfig, body.Inbound, body.Outbound)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleDeleteAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}
	agentID := r.PathValue("agentId")
	if agentID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agentId é obrigatório"})
		return
	}

	// Deletar no PocketBase e no SQLite
	_ = pbClient.DeleteAgentPB(r.Context(), agentID)
	_ = s.sessions.store.deleteAgent(r.Context(), agentID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleSetActiveAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}
	agentID := r.PathValue("agentId")
	if agentID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agentId é obrigatório"})
		return
	}

	var body struct {
		Direction string `json:"direction"` // "inbound" or "outbound"
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	dir := strings.ToLower(strings.TrimSpace(body.Direction))
	if dir != "inbound" && dir != "outbound" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "direção inválida. Use 'inbound' ou 'outbound'"})
		return
	}

	agent, err := s.sessions.store.getAgent(r.Context(), agentID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if agent == nil || agent.SessionID != sid {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "agente não encontrado nesta sessão"})
		return
	}

	inbound := agent.Inbound
	outbound := agent.Outbound
	if dir == "inbound" {
		inbound = true
	} else {
		outbound = true
	}

	err = s.sessions.store.updateAgent(r.Context(), agentID, agent.Name, agent.Description, agent.AIConfig, inbound, outbound)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
