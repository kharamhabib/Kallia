package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (s *server) listAgentsForWorkspace(w http.ResponseWriter, r *http.Request, wsID string) {
	if wsID == "" {
		writeJSON(w, http.StatusOK, map[string]any{"agents": []agentRow{}})
		return
	}

	includeAll := r.URL.Query().Get("all") == "true"

	// 1. Carregar diretamente do PocketBase (fonte primária central)
	pbAgents, err := pbClient.ListAgentsPB(r.Context(), wsID)
	if err == nil && len(pbAgents) > 0 {
		if !includeAll {
			var filtered []agentRow
			for _, ag := range pbAgents {
				if !ag.Inbound && strings.ToLower(strings.TrimSpace(ag.Name)) != "agente principal" {
					filtered = append(filtered, ag)
				}
			}
			pbAgents = filtered
		}
		writeJSON(w, http.StatusOK, map[string]any{"agents": pbAgents})
		return
	}

	// 2. Fallback para cache local no SQLite
	agents, err := s.sessions.store.listAgents(r.Context(), wsID)
	if err == nil && len(agents) > 0 {
		var filtered []agentRow
		for _, ag := range agents {
			if includeAll || (!ag.Inbound && strings.ToLower(strings.TrimSpace(ag.Name)) != "agente principal") {
				filtered = append(filtered, ag)
			}
			_, _ = pbClient.CreateAgentPB(r.Context(), ag.ID, wsID, ag.Name, ag.Description, ag.AIConfig, ag.Inbound, ag.Outbound)
		}
		writeJSON(w, http.StatusOK, map[string]any{"agents": filtered})
		return
	}

	if pbAgents == nil {
		pbAgents = []agentRow{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"agents": pbAgents})
}

func (s *server) handleListAgents(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}

	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		wsID = sess.getWorkspaceID()
	}

	s.listAgentsForWorkspace(w, r, wsID)
}

func (s *server) handleListWorkspaceAgents(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	s.listAgentsForWorkspace(w, r, wid)
}

func (s *server) createAgentForWorkspace(w http.ResponseWriter, r *http.Request, wsID string) {
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

func (s *server) handleCreateAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}

	wsID := r.URL.Query().Get("workspace_id")
	if wsID == "" {
		wsID = sess.getWorkspaceID()
	}

	s.createAgentForWorkspace(w, r, wsID)
}

func (s *server) handleCreateWorkspaceAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	wid := r.PathValue("wid")
	s.createAgentForWorkspace(w, r, wid)
}

func (s *server) handleUpdateAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
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
	if agent == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "agente não encontrado"})
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
