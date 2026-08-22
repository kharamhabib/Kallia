package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"kallia/internal/voip/call"
	"kallia/internal/voip/core"
	"kallia/internal/voip/media"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"golang.org/x/time/rate"
	"google.golang.org/protobuf/proto"
)

func (s *server) routes() http.Handler {
	mux := http.NewServeMux()

	// Health/liveness (fora de /api, sem auth — usado por Docker/Swarm/Traefik)
	mux.HandleFunc("GET /healthz", s.handleHealthz)
	mux.HandleFunc("GET /ready", s.handleReady)

	mux.HandleFunc("GET /api/config", s.handleConfig)
	mux.HandleFunc("GET /api/metrics", s.handleMetrics)
	mux.HandleFunc("GET /api/sessions", s.handleSessionList)
	mux.HandleFunc("POST /api/sessions", s.handleSessionCreate)
	mux.HandleFunc("POST /api/sessions/{sid}/rename", s.handleSessionRename)
	mux.HandleFunc("POST /api/sessions/{sid}/rotate-key", s.handleRotateSessionAPIKey)
	mux.HandleFunc("GET /api/sessions/{sid}/calls", s.handleSessionCalls)
	mux.HandleFunc("DELETE /api/sessions/{sid}", s.handleSessionDelete)
	mux.HandleFunc("POST /api/sessions/{sid}/logout", s.handleSessionLogout)
	mux.HandleFunc("POST /api/sessions/{sid}/pair", s.handleSessionPair)
	mux.HandleFunc("POST /api/sessions/{sid}/calls", s.handleStartCall)
	mux.HandleFunc("POST /api/sessions/{sid}/calls/{id}/webrtc", s.handleWebRTC)
	mux.HandleFunc("POST /api/sessions/{sid}/calls/{id}/accept", s.handleAccept)
	mux.HandleFunc("POST /api/sessions/{sid}/calls/{id}/reject", s.handleReject)
	mux.HandleFunc("DELETE /api/sessions/{sid}/calls/{id}", s.handleEndCall)
	mux.HandleFunc("GET /api/sessions/{sid}/history", s.handleHistory)
	mux.HandleFunc("DELETE /api/sessions/{sid}/history/{callId}", s.handleDeleteHistoryCall)
	mux.HandleFunc("POST /api/sessions/{sid}/history/{callId}/summary", s.handleSaveCallSummary)
	mux.HandleFunc("POST /api/sessions/{sid}/history/{callId}/ticket", s.handleOpenTicket)
	mux.HandleFunc("GET /api/sessions/{sid}/history/{callId}/transcript", s.handleGetCallTranscript)

	// Contatos / CRM
	mux.HandleFunc("GET /api/sessions/{sid}/crm-contacts", s.handleListCRMContacts)
	mux.HandleFunc("POST /api/sessions/{sid}/crm-contacts", s.handleCreateCRMContact)
	mux.HandleFunc("PUT /api/sessions/{sid}/crm-contacts/{id}", s.handleUpdateCRMContact)
	mux.HandleFunc("DELETE /api/sessions/{sid}/crm-contacts/{id}", s.handleDeleteCRMContact)

	// Mensageria (whatsmeow)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/text", s.handleSendText)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/image", s.handleSendImage)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/audio", s.handleSendAudio)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/video", s.handleSendVideo)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/document", s.handleSendDocument)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/poll", s.handleSendPoll)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/interactive", s.handleSendInteractive)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/list", s.handleSendList)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/carousel", s.handleSendCarousel)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/contact", s.handleSendContact)
	mux.HandleFunc("POST /api/sessions/{sid}/messages/location", s.handleSendLocation)

	// Webhook por sessão (recebimento -> Chatwoot etc.)
	mux.HandleFunc("POST /api/sessions/{sid}/webhook", s.handleSetWebhook)
	mux.HandleFunc("GET /api/sessions/{sid}/webhook", s.handleGetWebhook)
	mux.HandleFunc("DELETE /api/sessions/{sid}/webhook", s.handleDeleteWebhook)

	// Integração Chatwoot por sessão
	mux.HandleFunc("POST /api/sessions/{sid}/chatwoot", s.handleSetChatwoot)
	mux.HandleFunc("GET /api/sessions/{sid}/chatwoot", s.handleGetChatwoot)
	mux.HandleFunc("DELETE /api/sessions/{sid}/chatwoot", s.handleDeleteChatwoot)
	mux.HandleFunc("POST /api/sessions/{sid}/chatwoot/webhook", s.handleChatwootWebhook)
	mux.HandleFunc("GET /api/chatwoot/resolve", s.handleChatwootResolve)
	mux.HandleFunc("GET /api/sessions/{sid}/chatwoot-history", s.handleGetChatwootHistory)

	// Configurações de IA por sessão
	mux.HandleFunc("POST /api/sessions/{sid}/ai-config", s.handleSetAIConfig)
	mux.HandleFunc("GET /api/sessions/{sid}/ai-config", s.handleGetAIConfig)
	mux.HandleFunc("DELETE /api/sessions/{sid}/ai-config", s.handleDeleteAIConfig)
	mux.HandleFunc("POST /api/sessions/{sid}/tool-proxy", s.handleToolProxy)

	// Agentes (Personas) por sessão
	mux.HandleFunc("GET /api/sessions/{sid}/agents", s.handleListAgents)
	mux.HandleFunc("POST /api/sessions/{sid}/agents", s.handleCreateAgent)
	mux.HandleFunc("PUT /api/sessions/{sid}/agents/{agentId}", s.handleUpdateAgent)
	mux.HandleFunc("DELETE /api/sessions/{sid}/agents/{agentId}", s.handleDeleteAgent)
	mux.HandleFunc("POST /api/sessions/{sid}/agents/{agentId}/set-active", s.handleSetActiveAgent)
	mux.HandleFunc("POST /api/sessions/{sid}/calls/{callId}/transfer-agent", s.handleTransferCallAgent)

	// Configurações Globais de Provedores de IA (Gemini, Grok xAI, OpenAI GPT)
	mux.HandleFunc("GET /api/ai-providers", s.handleListAIProviders)
	mux.HandleFunc("POST /api/ai-providers/{provider}", s.handleUpdateAIProvider)

	// Proxy do Gemini e do Grok (as API keys nunca saem do servidor)
	mux.HandleFunc("GET /api/sessions/{sid}/gemini/ws", s.handleGeminiWS)
	mux.HandleFunc("POST /api/sessions/{sid}/gemini/generateContent", s.handleGeminiGenerateContent)
	mux.HandleFunc("GET /api/sessions/{sid}/grok/ws", s.handleGrokWS)

	// Gravações de áudio e NPS
	mux.HandleFunc("GET /api/sessions/{sid}/recordings/{callId}", s.handleGetCallRecording)
	mux.HandleFunc("GET /api/sessions/{sid}/nps", s.handleListNPS)
	mux.HandleFunc("GET /api/sessions/{sid}/nps/summary", s.handleNPSSummary)

	mux.HandleFunc("GET /api/sessions/{sid}/contacts/{jid}", s.handleGetContactInfo)

	mux.HandleFunc("POST /api/events/ticket", s.handleEventTicket)
	mux.HandleFunc("GET /api/events", s.handleEvents)

	// Rotas de Workspaces (Kallia 2.0)
	mux.HandleFunc("GET /api/workspaces", s.handleListWorkspaces)
	mux.HandleFunc("POST /api/workspaces", s.handleCreateWorkspace)
	mux.HandleFunc("GET /api/workspaces/{wid}", s.handleGetWorkspace)
	mux.HandleFunc("PATCH /api/workspaces/{wid}", s.handleUpdateWorkspace)
	mux.HandleFunc("DELETE /api/workspaces/{wid}", s.handleDeleteWorkspace)
	mux.HandleFunc("GET /api/workspaces/{wid}/connections", s.handleListWorkspaceConnections)
	mux.HandleFunc("POST /api/workspaces/{wid}/connections", s.handleCreateWorkspaceConnection)
	mux.HandleFunc("GET /api/workspaces/{wid}/members", s.handleListWorkspaceMembers)
	mux.HandleFunc("POST /api/workspaces/{wid}/members", s.handleAddWorkspaceMember)
	mux.HandleFunc("DELETE /api/workspaces/{wid}/members/{mid}", s.handleRemoveWorkspaceMember)

	// Rotas de Autenticação do Usuário
	mux.HandleFunc("GET /api/auth/me", s.handleMe)
	mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/forgot-password", s.handleForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", s.handleResetPassword)

	// Rotas do Superadmin SaaS (Painel Global)
	mux.HandleFunc("GET /api/admin/overview", s.handleAdminOverview)
	mux.HandleFunc("GET /api/admin/users", s.handleAdminListUsers)
	mux.HandleFunc("PATCH /api/admin/users/{uid}/role", s.handleAdminUpdateUserRole)
	mux.HandleFunc("GET /api/admin/workspaces", s.handleAdminListWorkspaces)
	mux.HandleFunc("PATCH /api/admin/workspaces/{wid}", s.handleAdminUpdateWorkspace)


	// Rotas Públicas de Documentação de API (Swagger / OpenAPI)
	mux.HandleFunc("GET /api/docs", s.handleAPIDocs)
	mux.HandleFunc("GET /api/swagger", s.handleAPIDocs)
	mux.HandleFunc("GET /api/openapi.yaml", s.handleOpenAPISpec)
	mux.HandleFunc("GET /api-docs.html", s.handleAPIDocsFile)
	mux.HandleFunc("GET /openapi.yaml", s.handleOpenAPISpec)

	// Favicon para evitar erros 404 no navegador
	mux.HandleFunc("GET /favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/x-icon")
		w.WriteHeader(http.StatusOK)
	})

	if s.staticDir != "" {
		if _, err := os.Stat(s.staticDir); err == nil {
			fileServer := http.FileServer(http.Dir(s.staticDir))
			mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
				if strings.HasPrefix(r.URL.Path, "/api/") {
					http.NotFound(w, r)
					return
				}
				cleanPath := filepath.Clean(r.URL.Path)
				fullPath := filepath.Join(s.staticDir, cleanPath)
				if fi, err := os.Stat(fullPath); err == nil && !fi.IsDir() {
					fileServer.ServeHTTP(w, r)
					return
				}
				indexPath := filepath.Join(s.staticDir, "index.html")
				if _, err := os.Stat(indexPath); err == nil {
					http.ServeFile(w, r, indexPath)
					return
				}
				fileServer.ServeHTTP(w, r)
			})
		}
	}
	var handler http.Handler = s.withCombinedAuth(mux)

	limiters := &apiLimiters{
		global:   NewRateLimiter(rate.Limit(10), 30),
		sessions: NewRateLimiter(rate.Every(time.Minute), 1),
		calls:    NewRateLimiter(rate.Every(12*time.Second), 5),
	}
	handler = s.withRateLimit(handler, limiters)
	handler = withBodyLimit(handler)
	handler = withRequestLog(handler, s.log)

	return withCORS(handler, s.log)
}

// withCORS aplica a política de origens. KALLIA_CORS_ORIGINS (lista separada
// por vírgula) restringe as origens permitidas; sem ela, mantém "*" (necessário
// para o widget do Chatwoot em domínio diverso), com aviso se houver API key.
func withCORS(h http.Handler, log *slog.Logger) http.Handler {
	allowed := parseCSVEnv("KALLIA_CORS_ORIGINS")
	if len(allowed) == 0 {
		log.Warn("KALLIA_CORS_ORIGINS não definida — CORS aberto (*). Restrinja para os domínios do painel/Chatwoot em produção.")
	}
	allowedSet := map[string]bool{}
	for _, o := range allowed {
		allowedSet[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if len(allowedSet) == 0 {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else if origin != "" && allowedSet[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Client-Id, X-API-Key")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

func parseCSVEnv(key string) []string {
	v := strings.TrimSpace(envStr(key, ""))
	if v == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

// withAuth protege as rotas /api/* com uma API key (header X-API-Key).
// Alternativas de autenticação:
//   - ?ticket= (uso único, 30s) para /api/events e /gemini/ws — fluxo preferido
//     para clientes que não enviam headers (EventSource/WebSocket do navegador);
//   - ?apiKey= (DEPRECADO: vaza em logs/histórico — mantido por compatibilidade).
//
// Exceções: o webhook do Chatwoot (autenticado por token próprio no handler)
// e os arquivos estáticos do painel (precisam carregar a tela de login).
func withAuth(h http.Handler, key string, tickets *ticketStore, log *slog.Logger) http.Handler {
	var warnedQueryKey atomic.Bool
	keyBytes := []byte(key)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		guarded := strings.HasPrefix(p, "/api/") && !strings.HasSuffix(p, "/chatwoot/webhook")
		if guarded {
			got := r.Header.Get("X-API-Key")
			if got == "" {
				got = r.URL.Query().Get("apiKey")
				if got != "" && warnedQueryKey.CompareAndSwap(false, true) {
					log.Warn("autenticação via ?apiKey= em query string está DEPRECADA (vaza em logs de proxy e histórico). Migre para X-API-Key ou POST /api/events/ticket.")
				}
			}
			authorized := subtle.ConstantTimeCompare([]byte(got), keyBytes) == 1
			if !authorized {
				// Ticket de uso único para conexões sem header (SSE / WebSocket)
				tk := r.URL.Query().Get("ticket")
				if tk != "" && (p == "/api/events" || strings.HasSuffix(p, "/gemini/ws")) && tickets.consume(tk) {
					authorized = true
				}
			}
			if !authorized {
				writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
				return
			}
		}
		h.ServeHTTP(w, r)
	})
}

// withBodyLimit impõe teto de tamanho aos bodies (DoS por payload gigante).
// Endpoints de mensagens aceitam mídia em base64 (teto maior); demais JSONs, 2MB.
func withBodyLimit(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/api/") {
			limit := int64(2 << 20) // 2 MB
			if strings.Contains(r.URL.Path, "/messages/") {
				limit = 200 << 20 // 200 MB (mídia em base64)
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
		}
		h.ServeHTTP(w, r)
	})
}

// statusRecorder registra o status HTTP preservando http.Flusher (SSE).
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

func (sr *statusRecorder) Flush() {
	if f, ok := sr.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// withRequestLog loga método, path, status e duração de cada requisição.
// 5xx → Warn; demais → Debug (SSE de longa duração só aparece ao encerrar).
func withRequestLog(h http.Handler, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sr := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		h.ServeHTTP(sr, r)
		dur := time.Since(start)
		if sr.status >= 500 {
			log.Warn("http request", "method", r.Method, "path", r.URL.Path, "status", sr.status, "dur", dur)
		} else {
			log.Debug("http request", "method", r.Method, "path", r.URL.Path, "status", sr.status, "dur", dur)
		}
	})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func clientID(r *http.Request) string {
	if id := r.Header.Get("X-Client-Id"); id != "" {
		return id
	}
	return r.URL.Query().Get("clientId")
}

func (s *server) sessionByID(w http.ResponseWriter, sid string) *Session {
	sess, ok := s.sessions.Get(sid)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such session"})
		return nil
	}
	return sess
}

func (s *server) handleEvents(w http.ResponseWriter, r *http.Request) {
	s.broker.serveSSE(w, r, clientID(r))
}

// handleEventTicket emite um ticket de uso único (30s) para autenticar a
// conexão SSE/WebSocket sem expor a API key na URL.
func (s *server) handleEventTicket(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ticket": s.tickets.issue(), "ttl": 30})
}

// handleHealthz: liveness simples (processo no ar).
func (s *server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// handleReady: readiness — verifica conectividade com o Postgres principal.
func (s *server) handleReady(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.mainDB.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not ready"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

// handleMetrics: telemetria operacional básica (autenticada).
func (s *server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	infos := s.sessions.infos()
	paired := 0
	for _, i := range infos {
		if i.Paired {
			paired++
		}
	}
	activeCalls := 0
	s.sessions.mu.RLock()
	for _, sess := range s.sessions.sessions {
		activeCalls += sess.reg.count()
	}
	s.sessions.mu.RUnlock()

	s.scheduler.mu.Lock()
	activeAgents := len(s.scheduler.agents)
	s.scheduler.mu.Unlock()

	dbStats := s.mainDB.Stats()
	writeJSON(w, http.StatusOK, map[string]any{
		"uptimeSeconds":    int64(time.Since(s.startedAt).Seconds()),
		"sessions":         len(infos),
		"sessionsPaired":   paired,
		"activeCalls":      activeCalls,
		"activeAIAgents":   activeAgents,
		"goroutines":       runtime.NumGoroutine(),
		"scheduledPending": atomic.LoadInt64(&s.scheduler.activeCount),
		"db": map[string]any{
			"openConnections": dbStats.OpenConnections,
			"inUse":           dbStats.InUse,
			"idle":            dbStats.Idle,
			"waitCount":       dbStats.WaitCount,
		},
	})
}

func (s *server) handleConfig(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"maxCallsPerSession": s.sessions.maxCalls,
	})
}

func (s *server) getAllSessionsMap(ctx context.Context) map[string]SessionInfo {
	// 1. Obter todas as sessões registradas em memória (com live state do whatsmeow)
	memInfos := s.sessions.infos()
	sessionMap := make(map[string]SessionInfo)
	for _, info := range memInfos {
		sessionMap[info.ID] = info
	}

	// 2. Obter todas as sessões do SQLite local
	if localRows, err := s.sessions.store.listAll(ctx); err == nil {
		for _, row := range localRows {
			wsID := row.WorkspaceID
			if wsID == "" {
				wsID = row.ProjectID
			}
			if existing, exists := sessionMap[row.ID]; !exists {
				sessionMap[row.ID] = SessionInfo{
					ID:          row.ID,
					Name:        row.Name,
					State:       "disconnected",
					JID:         row.JID,
					WorkspaceID: wsID,
					ProjectID:   wsID,
					APIKey:      row.APIKey,
				}
			} else {
				if existing.WorkspaceID == "" || existing.WorkspaceID == "default" {
					existing.WorkspaceID = wsID
					existing.ProjectID = wsID
					sessionMap[row.ID] = existing
				}
			}
		}
	}

	// 3. Obter todas as sessões do PocketBase
	if pbSessions, err := pbClient.ListSessionsPB(ctx); err == nil {
		for _, pb := range pbSessions {
			wsID := pb.WorkspaceID
			if wsID == "" {
				wsID = pb.ProjectID
			}
			existing, exists := sessionMap[pb.ID]
			if !exists {
				sessionMap[pb.ID] = SessionInfo{
					ID:          pb.ID,
					Name:        pb.Name,
					State:       "disconnected",
					JID:         pb.JID,
					WorkspaceID: wsID,
					ProjectID:   wsID,
					APIKey:      pb.APIKey,
				}
			} else {
				if existing.Name == "" {
					existing.Name = pb.Name
				}
				if existing.WorkspaceID == "" || existing.WorkspaceID == "default" {
					existing.WorkspaceID = wsID
					existing.ProjectID = wsID
				}
				sessionMap[pb.ID] = existing
			}
		}
	}

	return sessionMap
}

func (s *server) handleSessionList(w http.ResponseWriter, r *http.Request) {
	projectID, _ := r.Context().Value(ctxKeyProjectID).(string)
	role, _ := r.Context().Value(ctxKeyUserRole).(string)
	userID, _ := r.Context().Value(ctxKeyUserID).(string)

	sessionMap := s.getAllSessionsMap(r.Context())

	// Buscar workspaces que o usuário tem acesso
	allowedWorkspaces := map[string]bool{}
	if projectID != "" {
		allowedWorkspaces[projectID] = true
	}
	if userID != "" && role != "appadmin" {
		if userWorkspaces, err := pbClient.ListWorkspacesForUserPB(r.Context(), userID); err == nil {
			for _, ws := range userWorkspaces {
				allowedWorkspaces[ws.ID] = true
			}
		}
	}

	filtered := []SessionInfo{}
	for _, info := range sessionMap {
		if role == "appadmin" || allowedWorkspaces[info.ProjectID] || (len(allowedWorkspaces) == 0 && (info.ProjectID == "" || info.ProjectID == "default")) {
			if role == "appadmin" {
				var ownerEmail, ownerName string
				_ = s.sessions.store.db.QueryRowContext(r.Context(),
					`SELECT email, COALESCE(name, email) FROM users WHERE project_id = $1 LIMIT 1`,
					info.ProjectID).Scan(&ownerEmail, &ownerName)
				if ownerEmail == "" && strings.HasPrefix(info.ProjectID, "prj_") {
					uID := strings.TrimPrefix(info.ProjectID, "prj_")
					_ = s.sessions.store.db.QueryRowContext(r.Context(),
						`SELECT email, COALESCE(name, email) FROM users WHERE id = $1 LIMIT 1`,
						uID).Scan(&ownerEmail, &ownerName)
				}
				if ownerEmail != "" {
					info.OwnerEmail = ownerEmail
					info.OwnerName = ownerName
				}
			}
			filtered = append(filtered, info)
		}
	}

	sort.Slice(filtered, func(i, j int) bool {
		return strings.ToLower(filtered[i].Name) < strings.ToLower(filtered[j].Name)
	})

	writeJSON(w, http.StatusOK, map[string]any{"sessions": filtered})
}

func (s *server) handleSessionCalls(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"active":             sess.reg.count(),
		"maxCallsPerSession": s.sessions.maxCalls,
	})
}

func (s *server) handleSessionCreate(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}

	projectID, _ := r.Context().Value(ctxKeyProjectID).(string)
	planStatus, _ := r.Context().Value(ctxKeyPlanStatus).(string)
	role, _ := r.Context().Value(ctxKeyUserRole).(string)

	// Se for appadmin, permite bypass de restrições do projeto
	if role != "appadmin" {
		if projectID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "usuário não está associado a nenhum projeto"})
			return
		}
		if planStatus != "active" {
			writeJSON(w, http.StatusPaymentRequired, map[string]string{"error": "o plano deste projeto está inativo. Regularize o faturamento para gerenciar conexões."})
			return
		}

		// Contar conexões atuais do projeto
		var count int
		err := s.sessions.store.db.QueryRowContext(r.Context(), `SELECT COUNT(*) FROM sessions WHERE project_id = $1`, projectID).Scan(&count)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao checar limite de conexões"})
			return
		}

		// Obter limite do workspace no PocketBase
		ws, err := pbClient.GetWorkspacePB(r.Context(), projectID)
		limit := 1
		planName := "trial"
		if err == nil && ws != nil {
			planName = ws.Plan
			if ws.MaxConnections > 0 {
				limit = ws.MaxConnections
			}
		}

		if count >= limit {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": fmt.Sprintf("limite de conexões do plano %s atingido (%d/%d)", planName, count, limit)})
			return
		}
	}

	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Session"
	}

	// Se o projeto for vazio (como no caso de appadmin sem projeto específico), atribuir "default"
	targetProjectID := projectID
	if targetProjectID == "" {
		targetProjectID = "default"
	}

	id, apiKey, err := s.sessions.Create(name, targetProjectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": id, "apiKey": apiKey})
}

func (s *server) handleSessionDelete(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	if err := s.sessions.Delete(r.Context(), r.PathValue("sid")); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleSessionRename(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name required"})
		return
	}
	sid := r.PathValue("sid")
	if err := s.sessions.Rename(r.Context(), sid, name); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleRotateSessionAPIKey(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sid := r.PathValue("sid")
	var body struct {
		APIKey string `json:"apiKey"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	newKey, err := s.sessions.RotateAPIKey(r.Context(), sid, body.APIKey)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"apiKey": newKey, "sessionId": sid})
}

func (s *server) handleSessionLogout(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	if err := s.sessions.Logout(r.Context(), r.PathValue("sid")); err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleSessionPair(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	if err := s.sessions.Pair(r.PathValue("sid")); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleStartCall(w http.ResponseWriter, r *http.Request) {
	planStatus, _ := r.Context().Value(ctxKeyPlanStatus).(string)
	if planStatus != "active" {
		writeJSON(w, http.StatusPaymentRequired, map[string]string{"error": "o plano deste projeto está inativo. Regularize o faturamento para realizar ou receber chamadas."})
		return
	}
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doStartCall(sess, w, r)
	}
}

func (s *server) handleWebRTC(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doWebRTC(sess, w, r)
	}
}

func (s *server) handleAccept(w http.ResponseWriter, r *http.Request) {
	planStatus, _ := r.Context().Value(ctxKeyPlanStatus).(string)
	if planStatus != "active" {
		writeJSON(w, http.StatusPaymentRequired, map[string]string{"error": "o plano deste projeto está inativo. Regularize o faturamento para realizar ou receber chamadas."})
		return
	}
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doAccept(sess, w, r)
	}
}

func (s *server) handleReject(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doReject(sess, w, r)
	}
}

func (s *server) handleEndCall(w http.ResponseWriter, r *http.Request) {
	if sess := s.sessionByID(w, r.PathValue("sid")); sess != nil {
		s.doEndCall(sess, w, r)
	}
}

func (s *server) handleTransferCallAgent(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sid := r.PathValue("sid")
	callID := r.PathValue("callId")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}

	var body struct {
		AgentID string `json:"agentId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.AgentID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "agentId é obrigatório"})
		return
	}

	if s.scheduler == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduler indisponível"})
		return
	}

	agent := s.scheduler.GetAgent(callID)
	if agent == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "chamada ou agente de IA não encontrado para esta ligação"})
		return
	}

	if err := agent.SwitchToAgent(body.AgentID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleHistory(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	rawRows := s.broker.historyRows(sess.id, 50)
	
	// Se memória/SQLite local estiver vazio, buscar do PocketBase (SSOT)
	if len(rawRows) == 0 {
		wsID := sess.projectID
		if wsID == "" {
			wsID = "default"
		}
		if pbRows, err := pbClient.ListCallHistoryPB(r.Context(), wsID, sess.id, 50); err == nil && len(pbRows) > 0 {
			rawRows = append(rawRows, pbRows...)
		}
	}
	
	type ExtendedRow struct {
		CallID       string `json:"callId"`
		Peer         string `json:"peer"`
		Phone        string `json:"phone"`
		Name         string `json:"name,omitempty"`
		Direction    string `json:"direction"`
		StartedAt    int64  `json:"startedAt"`
		EndedAt      *int64 `json:"endedAt,omitempty"`
		EndReason    string `json:"endReason,omitempty"`
		Summary      string `json:"summary,omitempty"`
		TicketOpened bool   `json:"ticketOpened,omitempty"`
		TicketReason string `json:"ticketReason,omitempty"`
		RecordingURL string `json:"recordingUrl,omitempty"`
	}
	
	rows := make([]ExtendedRow, 0, len(rawRows))
	for _, row := range rawRows {
		phone, name := s.resolveContactName(r.Context(), sess, row.Peer)
		
		recURL := row.RecordingURL
		if recURL == "" {
			if path := findRecordingPath(row.CallID); path != "" {
				recURL = fmt.Sprintf("/api/sessions/%s/recordings/%s", sess.id, row.CallID)
			}
		}

		rows = append(rows, ExtendedRow{
			CallID:       row.CallID,
			Peer:         row.Peer,
			Phone:        phone,
			Name:         name,
			Direction:    row.Direction,
			StartedAt:    row.StartedAt,
			EndedAt:      row.EndedAt,
			EndReason:    row.EndReason,
			Summary:      row.Summary,
			TicketOpened: row.TicketOpened,
			TicketReason: row.TicketReason,
			RecordingURL: recURL,
		})
	}
	
	writeJSON(w, http.StatusOK, map[string]any{"rows": rows})
}

func (s *server) handleDeleteHistoryCall(w http.ResponseWriter, r *http.Request) {
	if !s.checkWritePermission(w, r) {
		return
	}
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	callID := r.PathValue("callId")
	if callID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "callId required"})
		return
	}

	// 1. Delete recording file if it exists on disk
	if filePath := findRecordingPath(callID); filePath != "" {
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			s.log.Warn("falha ao remover gravacao do disco", "call_id", callID, "path", filePath, "err", err)
		} else {
			s.log.Info("gravacao removida do disco", "call_id", callID, "path", filePath)
		}
	}

	// 2. Delete from PocketBase & SQLite database history tables
	_ = pbClient.DeleteCallHistoryPB(r.Context(), callID)
	if err := s.sessions.store.deleteCall(r.Context(), sess.id, callID); err != nil {
		s.log.Error("falha ao deletar chamada do banco", "session", sess.id, "call_id", callID, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// 3. Remove from broker memory cache
	s.broker.removeCall(sess.id, callID)

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *server) handleSaveCallSummary(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	callID := r.PathValue("callId")
	var body struct {
		Summary string `json:"summary"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	
	s.broker.saveSummary(sess.id, callID, body.Summary)
	writeJSON(w, http.StatusOK, map[string]string{"status": "summary saved"})
}

func (s *server) handleOpenTicket(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	callID := r.PathValue("callId")
	var body struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	
	rec, ok := s.broker.openTicket(callID, body.Reason)

	// Notifica via WhatsApp admin se configurado
	config := sess.getAIConfig()
	if config.PostCall.SendAdmin && config.PostCall.AdminNumber != "" {
		goSafe(s.log, func() {
			adminJid, err := resolveRecipient(config.PostCall.AdminNumber)
			if err == nil {
				peer := callID
				if ok && rec.Peer != "" {
					peer = rec.Peer
				}
				contactName := resolveContactPhoneRaw(context.Background(), sess, peer)
				msg := fmt.Sprintf("⚠️ *Novo Chamado Aberto pela IA (Local)*\n\n• *Cliente:* %s\n• *Sessão:* %s\n• *Motivo:* %s\n• *ID Chamada:* %s", contactName, sess.name, body.Reason, callID)
				_, _ = sess.getClient().SendMessage(context.Background(), adminJid, &waE2E.Message{
					Conversation: proto.String(msg),
				})
			}
		})
	}
	
	writeJSON(w, http.StatusOK, map[string]string{"status": "ticket saved"})
}

func (s *server) handleGetCallTranscript(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	callID := r.PathValue("callId")

	lines, err := s.sessions.store.getTranscript(r.Context(), sess.id, callID)
	if err != nil || len(lines) == 0 {
		if pbLines, pbErr := pbClient.GetCallTranscriptPB(r.Context(), callID); pbErr == nil && len(pbLines) > 0 {
			lines = pbLines
		}
	}

	if lines == nil {
		lines = []TranscriptLine{}
	}

	writeJSON(w, http.StatusOK, map[string]any{"transcript": lines})
}

func resolveContactPhoneRaw(ctx context.Context, sess *Session, peer string) string {
	jid, err := types.ParseJID(peer)
	if err != nil {
		return peer
	}
	if jid.Server == "lid" && sess.getClient() != nil && sess.getClient().Store.LIDs != nil {
		if pn, e := sess.getClient().Store.LIDs.GetPNForLID(ctx, jid); e == nil && !pn.IsEmpty() {
			return pn.User
		}
	}
	return jid.User
}

func (s *server) doStartCall(sess *Session, w http.ResponseWriter, r *http.Request) {
	if sess.getClient().Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	var body struct {
		Phone      string `json:"phone"`
		DurationMs int    `json:"duration_ms"`
		Record     bool   `json:"record"`
		AI         bool   `json:"ai"`
		Prompt     string `json:"prompt"`
		Greeting   string `json:"greeting"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Phone) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "phone required"})
		return
	}
	owner := clientID(r)
	config := sess.getAIConfig()
	resolveAIConfigKeys(r.Context(), sess.mgr.store, sess.projectID, &config)
	isServerAI := body.AI && config.ServerSideAI && config.GeminiAPIKey != ""
	if isServerAI {
		owner = serverOwnerID
	}

	// (removido) regra "1 chamada por operador" — agora o mesmo navegador/aba
	// pode disparar várias ligações na mesma sessão (até -max-calls-per-session).
	if max := s.sessions.maxCalls; max > 0 && sess.reg.count() >= max {
		writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "max concurrent calls"})
		return
	}
	peer := types.NewJID(normalizePhone(body.Phone), types.DefaultUserServer)

	callID, err := sess.startOutgoing(r.Context(), peer, false)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sess.enrichSingleContactAsync(body.Phone)

	s.broker.upsertCall(CallRecord{
		SessionID: sess.id, CallID: callID, Owner: &owner, Direction: "outbound", Peer: peer.String(),
		StartedAt: time.Now().UnixMilli(), Status: StatusRinging,
	})

	if isServerAI {
		ac, ok := sess.reg.get(callID)
		if ok {
			agentConfig := config
			if body.Prompt != "" {
				agentConfig.SystemInstruction = config.SystemInstruction + "\n\nInstrução adicional para esta chamada específica: " + body.Prompt
			}
			if body.Greeting != "" {
				agentConfig.FirstUtterance = body.Greeting
			}
			sess.attachServerAI(ac.cm, callID, "outbound", agentConfig, func(info *call.CallInfo) string {
				return body.Phone
			})
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"call": map[string]string{"callId": callID}})
}

func (s *server) doWebRTC(sess *Session, w http.ResponseWriter, r *http.Request) {
	callID := r.PathValue("id")
	ac, ok := sess.reg.get(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such call"})
		return
	}
	var body struct {
		SDPOffer string `json:"sdp_offer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SDPOffer == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sdp_offer required"})
		return
	}
	bridge, answer, err := NewBridge(body.SDPOffer, s.log)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	browserOpus, ocErr := media.NewOpusCodec(16000, 320)
	if ocErr != nil {
		s.log.Warn("browser Opus codec unavailable — call audio disabled", "err", ocErr)
		browserOpus = nil
	}
	bridge.OnBrowserRTP = func(payload []byte) {
		if browserOpus == nil {
			return
		}
		pcm16, err := browserOpus.Decode(payload)
		if err != nil {
			s.log.Error("OnBrowserRTP: Decode failed", "err", err)
			return
		}
		if len(pcm16) == 0 {
			s.log.Warn("OnBrowserRTP: Decode returned 0 samples")
			return
		}
		ac.cm.FeedCapturedPCM(pcm16)
	}
	bridge.OnTerminalICE = func() {
		go sess.terminateCall(callID, core.EndCallReasonUserEnded)
	}
	sess.setBridge(callID, bridge, browserOpus)
	writeJSON(w, http.StatusOK, map[string]string{"sdp_answer": answer})
}

func (s *server) doAccept(sess *Session, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	ac, ok := sess.reg.get(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such call"})
		return
	}

	var body struct {
		AI     bool   `json:"ai"`
		Prompt string `json:"prompt"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	owner := clientID(r)
	config := sess.getAIConfig()
	resolveAIConfigKeys(r.Context(), sess.mgr.store, sess.projectID, &config)
	isServerAI := body.AI && config.ServerSideAI && config.GeminiAPIKey != ""
	if isServerAI {
		owner = serverOwnerID
		if body.Prompt != "" {
			config.SystemInstruction = config.SystemInstruction + "\n\nInstrução adicional para esta chamada específica: " + body.Prompt
		}
	}

	if !isServerAI {
		if other := s.broker.ownerActiveCall(owner); other != "" && other != id {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "operator already on a call"})
			return
		}
	}

	if !s.broker.setOwner(id, owner) {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "claimed by another client"})
		return
	}
	s.broker.emitIncomingClaimed(sess.id, id, owner)

	if isServerAI {
		sess.attachServerAI(ac.cm, id, "inbound", config, func(info *call.CallInfo) string {
			peerPhone := info.PeerJid
			if info.CallerPn != "" {
				peerPhone = info.CallerPn
			} else if jid, err := types.ParseJID(peerPhone); err == nil {
				peerPhone = sess.realPhone(jid)
			}
			return peerPhone
		})
	}

	if err := ac.cm.AcceptCall(r.Context(), id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"call": map[string]string{"callId": id}})
}

func (s *server) doReject(sess *Session, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if ac, ok := sess.reg.get(id); ok {
		_ = ac.cm.RejectCall(r.Context(), id, core.EndCallReasonDeclined)
	}
	sess.removeCall(id)
	s.broker.endCall(id, string(core.EndCallReasonDeclined))
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) doEndCall(sess *Session, w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if ac, ok := sess.reg.get(id); ok {
		_ = ac.cm.EndCall(r.Context(), core.EndCallReasonUserEnded)
	}
	sess.removeCall(id)
	s.broker.endCall(id, string(core.EndCallReasonUserEnded))
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) handleGetContactInfo(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jidStr := r.PathValue("jid")
	info := sess.enrichContactInfo(r.Context(), jidStr)

	writeJSON(w, http.StatusOK, map[string]string{
		"jid":        info.JID,
		"phone":      info.Phone,
		"name":       info.Name,
		"pictureUrl": info.AvatarURL,
		"email":      info.Email,
		"company":    info.Company,
		"notes":      info.Notes,
		"lid":        info.LID,
	})
}

func (s *server) resolveContactName(ctx context.Context, sess *Session, peerStr string) (phone string, name string) {
	if peerStr == "" {
		return "", ""
	}

	origJid, err := types.ParseJID(peerStr)
	if err != nil {
		origJid = types.NewJID(normalizePhone(peerStr), types.DefaultUserServer)
	}
	phone = origJid.User
	name = ""

	wsID := ""
	if sess != nil {
		wsID = sess.projectID
	}

	// 1. Tentar SQLite local
	if sess != nil && s.sessions != nil && s.sessions.store != nil {
		if c, err := s.sessions.store.getContactByPhone(ctx, sess.id, peerStr); err == nil && c != nil {
			if c.Phone != "" {
				phone = c.Phone
			}
			if c.Name != "" && c.Name != c.Phone {
				return phone, c.Name
			}
		}
	}

	// 2. Tentar PocketBase (SSOT)
	if pbC, err := pbClient.GetContactByPhonePB(ctx, wsID, peerStr); err == nil && pbC != nil {
		if pbC.Phone != "" {
			phone = pbC.Phone
		}
		if pbC.Name != "" && pbC.Name != pbC.Phone {
			return phone, pbC.Name
		}
	}

	// 3. Tentar Whatsmeow Store & GetUserInfo
	if sess != nil {
		info := sess.enrichContactInfo(ctx, peerStr)
		if info.Phone != "" {
			phone = info.Phone
		}
		if info.Name != "" && info.Name != info.Phone {
			name = info.Name
			// Auto-sync assíncrono para PocketBase e SQLite
			goSafe(s.log, func() {
				_ = pbClient.UpsertContactPB(context.Background(), wsID, sess.id, ContactRecord{
					Phone:     phone,
					Name:      name,
					AvatarURL: info.AvatarURL,
					LID:       info.LID,
					JID:       info.JID,
					Company:   info.Company,
					Email:     info.Email,
					Notes:     info.Notes,
				})
				if s.sessions != nil && s.sessions.store != nil {
					_, _ = s.sessions.store.upsertContact(context.Background(), ContactRecord{
						SessionID: sess.id,
						Phone:     phone,
						Name:      name,
						AvatarURL: info.AvatarURL,
						LID:       info.LID,
						JID:       info.JID,
						Company:   info.Company,
						Email:     info.Email,
						Notes:     info.Notes,
					})
				}
			})
			return phone, name
		}
	}

	return phone, name
}

func (s *server) enrichContactInfo(ctx context.Context, sess *Session, peerStr string) (name string, pictureURL string) {
	if sess == nil {
		return "", ""
	}
	cli := sess.getClient()
	if cli == nil || cli.Store == nil {
		return "", ""
	}

	origJid, err := types.ParseJID(peerStr)
	if err != nil {
		origJid = types.NewJID(normalizePhone(peerStr), types.DefaultUserServer)
	}

	jidsToTry := []types.JID{origJid}
	if (origJid.Server == types.HiddenUserServer || len(origJid.User) > 13) && cli.Store.LIDs != nil {
		lidJID := origJid
		if lidJID.Server != types.HiddenUserServer {
			lidJID = types.NewJID(origJid.User, types.HiddenUserServer)
		}
		if pn, err := cli.Store.LIDs.GetPNForLID(ctx, lidJID); err == nil && !pn.IsEmpty() {
			jidsToTry = append([]types.JID{pn}, jidsToTry...)
		}
	} else if origJid.Server == types.DefaultUserServer && cli.Store.LIDs != nil {
		if lid, err := cli.Store.LIDs.GetLIDForPN(ctx, origJid); err == nil && !lid.IsEmpty() {
			jidsToTry = append(jidsToTry, lid)
		}
	}

	if cli.Store.Contacts != nil {
		for _, jid := range jidsToTry {
			if contact, err := cli.Store.Contacts.GetContact(ctx, jid); err == nil && contact.Found {
				if contact.FullName != "" {
					name = contact.FullName
					break
				} else if contact.BusinessName != "" {
					name = contact.BusinessName
					break
				} else if contact.FirstName != "" {
					name = contact.FirstName
					break
				} else if contact.PushName != "" {
					name = contact.PushName
					break
				}
			}
		}
	}

	pfpCtx, pfpCancel := context.WithTimeout(ctx, 2*time.Second)
	defer pfpCancel()

	for _, jid := range jidsToTry {
		pfp, err := cli.GetProfilePictureInfo(pfpCtx, jid, &whatsmeow.GetProfilePictureParams{
			Preview: true,
		})
		if err == nil && pfp != nil && pfp.URL != "" {
			pictureURL = pfp.URL
			break
		}
	}

	return name, pictureURL
}

func (s *server) handleListCRMContacts(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if s.sessions == nil || s.sessions.store == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	q := r.URL.Query().Get("q")

	// 1. Tentar buscar diretamente do PocketBase
	pbContacts, err := pbClient.ListContactsPB(r.Context(), sess.id, q)
	if err == nil && len(pbContacts) > 0 {
		writeJSON(w, http.StatusOK, pbContacts)
		return
	}

	// 2. Fallback para cache local no SQLite
	contacts, err := s.sessions.store.listContacts(r.Context(), sess.id, q)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, contacts)
}

// enrichSingleContactAsync enriquece um único contato quando disparado por evento
// (ao ligar, receber ligação ou enviar/receber mensagem), respeitando a trava de 24h
// e a data de enriched_at no banco.
func (s *server) enrichSingleContactAsync(sess *Session, phone string) {
	if sess == nil || phone == "" || s.sessions == nil || s.sessions.store == nil {
		return
	}
	cleanPhone := normalizePhone(phone)
	if cleanPhone == "" {
		return
	}

	goSafe(s.log, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		existing, _ := s.sessions.store.getContactByPhone(ctx, sess.id, cleanPhone)
		now := time.Now()

		// Se o contato foi enriquecido nas últimas 24 horas e tem nome/foto, pula
		if existing != nil && existing.EnrichedAt != nil && time.Since(*existing.EnrichedAt) < 24*time.Hour {
			if existing.Name != "" && existing.Name != existing.Phone && existing.AvatarURL != "" {
				return
			}
		}

		name, pictureURL := s.enrichContactInfo(ctx, sess, cleanPhone)
		rec := ContactRecord{
			SessionID:  sess.id,
			Phone:      cleanPhone,
			Name:       name,
			AvatarURL:  pictureURL,
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
			if existing.LID != "" {
				rec.LID = existing.LID
			}
			if existing.JID != "" {
				rec.JID = existing.JID
			}
		}

		_, _ = s.sessions.store.upsertContact(context.Background(), rec)
	})
}

func (s *server) handleCreateCRMContact(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if s.sessions == nil || s.sessions.store == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not configured"})
		return
	}
	var req ContactRecord
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	req.SessionID = sess.id
	_ = pbClient.UpsertContactPB(r.Context(), sess.projectID, sess.id, req)
	res, err := s.sessions.store.upsertContact(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *server) handleUpdateCRMContact(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if s.sessions == nil || s.sessions.store == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not configured"})
		return
	}
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	var req ContactRecord
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	req.ID = id
	req.SessionID = sess.id
	_ = pbClient.UpsertContactPB(r.Context(), sess.projectID, sess.id, req)
	res, err := s.sessions.store.updateContactManual(r.Context(), req)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *server) handleDeleteCRMContact(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if s.sessions == nil || s.sessions.store == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "store not configured"})
		return
	}
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if err := s.sessions.store.deleteContact(r.Context(), sess.id, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func normalizePhone(p string) string {
	p = strings.TrimSpace(p)
	p = strings.TrimPrefix(p, "+")
	var b strings.Builder
	for _, c := range p {
		if c >= '0' && c <= '9' {
			b.WriteRune(c)
		}
	}
	return b.String()
}

// clientLimiter representa um limiter de IP
type clientLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type RateLimiter struct {
	mu      sync.Mutex
	clients map[string]*clientLimiter
	r       rate.Limit
	b       int
}

func NewRateLimiter(r rate.Limit, b int) *RateLimiter {
	rl := &RateLimiter{
		clients: make(map[string]*clientLimiter),
		r:       r,
		b:       b,
	}
	go rl.cleanupLoop()
	return rl
}

func (rl *RateLimiter) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	for range ticker.C {
		rl.mu.Lock()
		for ip, cl := range rl.clients {
			if time.Since(cl.lastSeen) > 30*time.Minute {
				delete(rl.clients, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *RateLimiter) getLimiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	cl, exists := rl.clients[ip]
	if !exists {
		cl = &clientLimiter{
			limiter: rate.NewLimiter(rl.r, rl.b),
		}
		rl.clients[ip] = cl
	}
	cl.lastSeen = time.Now()
	return cl.limiter
}

// trustedProxies é calculado uma vez a partir de KALLIA_TRUSTED_PROXIES
// (IPs ou CIDRs separados por vírgula). X-Forwarded-For só é honrado quando o
// peer direto é um proxy confiável — caso contrário qualquer cliente poderia
// spoofar o header e bypassar o rate limit.
var (
	trustedProxiesOnce sync.Once
	trustedCIDRs       []*net.IPNet
	trustedIPs         map[string]bool
)

func loadTrustedProxies() {
	trustedProxiesOnce.Do(func() {
		trustedIPs = map[string]bool{}
		trustedCIDRs = nil
		entries := parseCSVEnv("KALLIA_TRUSTED_PROXIES")
		if len(entries) == 0 {
			entries = parseCSVEnv("WACALLS_TRUSTED_PROXIES")
		}
		for _, entry := range entries {
			if _, cidr, err := net.ParseCIDR(entry); err == nil {
				trustedCIDRs = append(trustedCIDRs, cidr)
				continue
			}
			if ip := net.ParseIP(entry); ip != nil {
				trustedIPs[ip.String()] = true
			}
		}
	})
}

func isTrustedProxy(ip string) bool {
	loadTrustedProxies()
	if trustedIPs[ip] {
		return true
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	for _, cidr := range trustedCIDRs {
		if cidr.Contains(parsed) {
			return true
		}
	}
	return false
}

func getClientIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" && isTrustedProxy(ip) {
		parts := strings.Split(xff, ",")
		if first := strings.TrimSpace(parts[0]); first != "" {
			return first
		}
	}
	return ip
}

type apiLimiters struct {
	global   *RateLimiter
	sessions *RateLimiter
	calls    *RateLimiter
}

func (s *server) withRateLimit(next http.Handler, limiters *apiLimiters) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := getClientIP(r)

		var rl *RateLimiter
		var limit int
		var resetSecs int

		p := r.URL.Path
		if r.Method == "POST" && p == "/api/sessions" {
			rl = limiters.sessions
			limit = 1
			resetSecs = 60
		} else if r.Method == "POST" && strings.HasPrefix(p, "/api/sessions/") && strings.HasSuffix(p, "/calls") {
			rl = limiters.calls
			limit = 5
			resetSecs = 60
		} else {
			rl = limiters.global
			limit = 30
			resetSecs = 1
		}

		lim := rl.getLimiter(ip)
		if !lim.Allow() {
			w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", limit))
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetSecs))
			http.Error(w, "Too Many Requests", http.StatusTooManyRequests)
			return
		}

		tokens := lim.Tokens()
		w.Header().Set("X-RateLimit-Limit", fmt.Sprintf("%d", limit))
		w.Header().Set("X-RateLimit-Remaining", fmt.Sprintf("%d", int(tokens)))
		w.Header().Set("X-RateLimit-Reset", fmt.Sprintf("%d", resetSecs))

		next.ServeHTTP(w, r)
	})
}

func (s *server) checkCallSession(ctx context.Context, sessionID, callID string) bool {
	// 1. Check active calls in broker memory
	if rec, ok := s.broker.getCall(callID); ok {
		return rec.SessionID == sessionID
	}
	// 2. Check history in database
	exists, err := s.sessions.store.checkCallSession(ctx, sessionID, callID)
	if err == nil && exists {
		return true
	}
	return false
}

func findRecordingPath(callID string) string {
	// Sanitize callID to prevent path traversal (only allow letters, numbers, underscores, and hyphens)
	for _, r := range callID {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-') {
			return ""
		}
	}

	recordingsDir := filepath.Join("storage", "recordings")
	exactPath := filepath.Join(recordingsDir, fmt.Sprintf("%s.wav", callID))
	if _, err := os.Stat(exactPath); err == nil {
		return exactPath
	}
	entries, err := os.ReadDir(recordingsDir)
	if err == nil {
		for _, entry := range entries {
			if !entry.IsDir() && strings.Contains(entry.Name(), callID) && strings.HasSuffix(entry.Name(), ".wav") {
				return filepath.Join(recordingsDir, entry.Name())
			}
		}
	}
	return ""
}

func (s *server) handleGetCallRecording(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	callID := r.PathValue("callId")
	if sid == "" || callID == "" {
		http.Error(w, "sid and callId required", http.StatusBadRequest)
		return
	}

	// SEC-03: Validar que a chamada pertence a esta sessão antes de servir o áudio
	if !s.checkCallSession(r.Context(), sid, callID) {
		http.Error(w, "unauthorized or recording not found", http.StatusForbidden)
		return
	}

	filePath := findRecordingPath(callID)
	if filePath == "" {
		http.Error(w, "recording not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "audio/wav")
	w.Header().Set("Content-Disposition", fmt.Sprintf("inline; filename=%q", filepath.Base(filePath)))
	http.ServeFile(w, r, filePath)
}

func (s *server) handleListNPS(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}

	wsID := sess.projectID
	if wsID == "" {
		wsID = "default"
	}

	// 1. Tentar buscar do PocketBase (SSOT)
	if pbRatings, err := pbClient.ListCallRatingsPB(r.Context(), wsID, sid); err == nil && len(pbRatings) > 0 {
		writeJSON(w, http.StatusOK, map[string]any{"ratings": pbRatings})
		return
	}

	// 2. Fallback SQLite local
	ratings, err := s.sessions.store.listRatings(r.Context(), sid, 100)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if ratings == nil {
		ratings = []CallRating{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"ratings": ratings})
}

func (s *server) handleNPSSummary(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("sid")
	sess := s.sessionByID(w, sid)
	if sess == nil {
		return
	}

	wsID := sess.projectID
	if wsID == "" {
		wsID = "default"
	}

	// 1. Calcular a partir do PocketBase se disponível
	if pbRatings, err := pbClient.ListCallRatingsPB(r.Context(), wsID, sid); err == nil && len(pbRatings) > 0 {
		var total, sum, promoters, detractors, neutrals int
		for _, r := range pbRatings {
			total++
			sum += r.Score
			if r.Score >= 9 {
				promoters++
			} else if r.Score <= 6 {
				detractors++
			} else {
				neutrals++
			}
		}
		var avg float64
		var score float64
		if total > 0 {
			avg = float64(sum) / float64(total)
			score = (float64(promoters-detractors) / float64(total)) * 100
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"summary": map[string]any{
				"total":      total,
				"average":    avg,
				"npsScore":   score,
				"promoters":  promoters,
				"detractors": detractors,
				"neutrals":   neutrals,
			},
		})
		return
	}

	// 2. Fallback SQLite
	summary, err := s.sessions.store.getNPSSummary(r.Context(), sid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"summary": summary})
}

// checkWritePermission valida se o usuário autenticado possui cargo de admin ou appadmin para ações de alteração
func (s *server) checkWritePermission(w http.ResponseWriter, r *http.Request) bool {
	role, _ := r.Context().Value(ctxKeyUserRole).(string)
	if role == "normal" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "seu usuário não tem permissão para realizar esta operação de escrita"})
		return false
	}
	return true
}

func (s *server) handleAPIDocs(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/api-docs.html", http.StatusFound)
}

func (s *server) handleAPIDocsFile(w http.ResponseWriter, r *http.Request) {
	for _, p := range []string{
		filepath.Join(s.staticDir, "api-docs.html"),
		"client/public/api-docs.html",
		"public/api-docs.html",
	} {
		if _, err := os.Stat(p); err == nil {
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			http.ServeFile(w, r, p)
			return
		}
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(`<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Kallia — API Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
    <style>
      body { margin: 0; background: #fafafa; }
      .topbar { display: none; }
      #header { display: flex; align-items: center; gap: 10px; padding: 12px 20px; background: #111827; color: #fff; font-family: system-ui, sans-serif; }
      #header a { margin-left: auto; color: #93c5fd; text-decoration: none; font-size: 14px; }
    </style>
  </head>
  <body>
    <div id="header">
      <strong>Kallia API</strong>
      <span style="opacity:.6;font-size:13px">documentação interativa</span>
      <a href="/">← voltar ao painel</a>
    </div>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: "/openapi.yaml",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
        });
      };
    </script>
  </body>
</html>`))
}

func (s *server) handleOpenAPISpec(w http.ResponseWriter, r *http.Request) {
	for _, p := range []string{
		filepath.Join(s.staticDir, "openapi.yaml"),
		"client/public/openapi.yaml",
		"public/openapi.yaml",
	} {
		if _, err := os.Stat(p); err == nil {
			w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
			http.ServeFile(w, r, p)
			return
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "especificação OpenAPI não encontrada"})
}

// --- HANDLERS DE WORKSPACES (KALLIA 2.0) ---

func (s *server) handleListWorkspaces(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(ctxKeyUserID).(string)

	var list []WorkspaceRow
	var err error

	if userID != "" {
		list, err = pbClient.ListWorkspacesForUserPB(r.Context(), userID)
	} else {
		list, err = pbClient.ListWorkspacesPB(r.Context())
	}

	if err != nil {
		s.log.Warn("não foi possível obter workspaces do PocketBase, usando fallback", "err", err)
	}

	// Se a lista estiver vazia, cria o Workspace inicial automaticamente no PocketBase
	if len(list) == 0 {
		wsName := "Meu Workspace"
		if userID != "" {
			if u, _ := s.sessions.store.getUserByID(r.Context(), userID); u != nil && u.Email != "" {
				wsName = "Workspace de " + strings.Split(u.Email, "@")[0]
			}
		}
		newWS, createErr := pbClient.CreateWorkspacePB(r.Context(), wsName, "trial", "active", 1, 1, 2)
		if createErr == nil && newWS != nil {
			if userID != "" {
				_ = pbClient.AddWorkspaceMemberPB(r.Context(), newWS.ID, userID, "owner")
			}
			list = append(list, *newWS)
		} else {
			// Fallback temporário caso PocketBase esteja indisponível
			list = []WorkspaceRow{
				{
					ID:                 "default",
					Name:               "Workspace Principal",
					Plan:               "trial",
					PlanStatus:         "active",
					MaxConnections:     1,
					MaxConcurrentCalls: 1,
					MaxAgents:          2,
					PlanStartsAt:       time.Now(),
					CreatedAt:          time.Now(),
				},
			}
		}
	}

	// Anexar contagem de conexões por workspace
	sessions := s.sessions.infos()
	type wsDTO struct {
		WorkspaceRow
		ConnectionsCount int `json:"connections_count"`
		AgentsCount      int `json:"agents_count"`
	}

	var dtos []wsDTO
	for _, item := range list {
		wsID := item.ID
		count := 0
		for _, sess := range sessions {
			if sess.ProjectID == wsID || (wsID == "default" && sess.ProjectID == "") {
				count++
			}
		}
		dto := wsDTO{
			WorkspaceRow:     item,
			ConnectionsCount: count,
			AgentsCount:      0,
		}
		dtos = append(dtos, dto)
	}

	writeJSON(w, http.StatusOK, map[string]any{"workspaces": dtos})
}

func (s *server) handleCreateWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(ctxKeyUserID).(string)
	userRole, _ := r.Context().Value(ctxKeyUserRole).(string)

	// Regra de Negócio: Contas normais (não appadmin) só têm direito a 1 único workspace
	if userRole != "appadmin" && userID != "" {
		userWorkspaces, err := pbClient.ListWorkspacesForUserPB(r.Context(), userID)
		if err == nil && len(userWorkspaces) >= 1 {
			writeJSON(w, http.StatusForbidden, map[string]string{
				"error": "Limite de workspaces atingido. Contas normais podem possuir apenas 1 workspace. Faça upgrade da sua conta para criar múltiplos workspaces.",
			})
			return
		}
	}

	var body struct {
		Name string `json:"name"`
		Plan string `json:"plan"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nome do workspace é obrigatório"})
		return
	}

	plan := body.Plan
	if plan == "" {
		plan = "trial"
	}

	ws, err := pbClient.CreateWorkspacePB(r.Context(), strings.TrimSpace(body.Name), plan, "active", 1, 1, 2)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	if userID != "" {
		_ = pbClient.AddWorkspaceMemberPB(r.Context(), ws.ID, userID, "owner")
	}

	writeJSON(w, http.StatusCreated, map[string]any{"workspace": ws})
}

func (s *server) handleGetWorkspace(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	ws, err := pbClient.GetWorkspacePB(r.Context(), wid)
	if err != nil || ws == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workspace não encontrado"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"workspace": ws})
}

func (s *server) handleUpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	var data map[string]any
	if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "payload inválido"})
		return
	}
	if err := pbClient.UpdateWorkspacePB(r.Context(), wid, data); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	ws, _ := pbClient.GetWorkspacePB(r.Context(), wid)
	writeJSON(w, http.StatusOK, map[string]any{"workspace": ws})
}

func (s *server) handleDeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	if wid == "default" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "não é permitido deletar o workspace default"})
		return
	}
	if err := pbClient.DeleteWorkspacePB(r.Context(), wid); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "workspace deletado"})
}

func (s *server) handleListWorkspaceConnections(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	allMap := s.getAllSessionsMap(r.Context())
	var filtered []SessionInfo
	for _, item := range allMap {
		if item.ProjectID == wid || (wid == "default" && (item.ProjectID == "" || item.ProjectID == "default")) {
			filtered = append(filtered, item)
		}
	}
	writeJSON(w, http.StatusOK, filtered)
}

func (s *server) handleCreateWorkspaceConnection(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	ws, _ := pbClient.GetWorkspacePB(r.Context(), wid)
	maxConn := 1
	if ws != nil && ws.MaxConnections > 0 {
		maxConn = ws.MaxConnections
	}

	allMap := s.getAllSessionsMap(r.Context())
	currentConnCount := 0
	for _, item := range allMap {
		if item.ProjectID == wid || (wid == "default" && (item.ProjectID == "" || item.ProjectID == "default")) {
			currentConnCount++
		}
	}

	if currentConnCount >= maxConn {
		writeJSON(w, http.StatusBadRequest, map[string]string{
			"error": fmt.Sprintf("limite de conexões do plano atingido (%d/%d). Faça upgrade do seu plano para conectar mais WhatsApps.", currentConnCount, maxConn),
		})
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = fmt.Sprintf("WhatsApp %d", currentConnCount+1)
	}

	id, apiKey, err := s.sessions.Create(name, wid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	sess, ok := s.sessions.Get(id)
	if !ok {
		writeJSON(w, http.StatusCreated, map[string]any{"id": id, "name": name, "apiKey": apiKey})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":        id,
		"name":      name,
		"apiKey":    apiKey,
		"projectId": wid,
		"session":   sess.info(),
	})
}

func (s *server) handleListWorkspaceMembers(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	members, err := pbClient.ListWorkspaceMembersPB(r.Context(), wid)
	if err != nil {
		s.log.Warn("erro ao listar membros do workspace", "wid", wid, "err", err)
	}

	type memberDTO struct {
		ID        string    `json:"id"`
		UserID    string    `json:"user_id"`
		Name      string    `json:"name"`
		Email     string    `json:"email"`
		Role      string    `json:"role"`
		CreatedAt time.Time `json:"created"`
	}

	var list []memberDTO
	for _, m := range members {
		email := ""
		name := ""
		if u, err := s.sessions.store.getUserByID(r.Context(), m.UserID); err == nil && u != nil {
			email = u.Email
			name = strings.Split(u.Email, "@")[0]
		}
		if email == "" && strings.Contains(m.UserID, "@") {
			email = m.UserID
		}
		if name == "" && email != "" {
			name = strings.Split(email, "@")[0]
		}
		list = append(list, memberDTO{
			ID:        m.ID,
			UserID:    m.UserID,
			Name:      name,
			Email:     email,
			Role:      m.Role,
			CreatedAt: m.CreatedAt,
		})
	}

	// Se a lista estiver vazia e temos usuário logado no contexto, adiciona o usuário atual como Owner
	if len(list) == 0 {
		userID, _ := r.Context().Value(ctxKeyUserID).(string)
		email := "admin@kallia.com"
		if userID != "" {
			if u, _ := s.sessions.store.getUserByID(r.Context(), userID); u != nil && u.Email != "" {
				email = u.Email
			}
		}
		name := strings.Split(email, "@")[0]
		list = append(list, memberDTO{
			ID:        "owner-current",
			UserID:    userID,
			Name:      name,
			Email:     email,
			Role:      "owner",
			CreatedAt: time.Now(),
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"members": list})
}

func (s *server) handleAddWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	var body struct {
		Email string `json:"email"`
		Role  string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Email) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "e-mail é obrigatório"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(body.Email))
	role := strings.ToLower(strings.TrimSpace(body.Role))
	if role != "admin" && role != "owner" {
		role = "member"
	}

	targetUserID := email
	if u, err := s.sessions.store.getUserByEmail(r.Context(), email); err == nil && u != nil {
		targetUserID = u.ID
	}

	if err := pbClient.AddWorkspaceMemberPB(r.Context(), wid, targetUserID, role); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "membro adicionado"})
}

func (s *server) handleRemoveWorkspaceMember(w http.ResponseWriter, r *http.Request) {
	mid := r.PathValue("mid")
	if mid == "" || mid == "owner-current" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id do membro inválido"})
		return
	}

	if err := pbClient.RemoveWorkspaceMemberPB(r.Context(), mid); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "membro removido"})
}

func (s *server) checkSuperAdmin(w http.ResponseWriter, r *http.Request) bool {
	role, _ := r.Context().Value(ctxKeyUserRole).(string)
	if role != "appadmin" && role != "superadmin" {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "acesso negado: requer privilégios de superadmin"})
		return false
	}
	return true
}

func (s *server) handleAdminOverview(w http.ResponseWriter, r *http.Request) {
	if !s.checkSuperAdmin(w, r) {
		return
	}

	ctx := r.Context()
	users, _ := pbClient.ListAllUsersPB(ctx)
	workspaces, _ := pbClient.ListWorkspacesPB(ctx)
	sessions := s.sessions.infos()

	var totalCalls int
	_ = s.sessions.store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM call_history`).Scan(&totalCalls)

	writeJSON(w, http.StatusOK, map[string]any{
		"totalUsers":      len(users),
		"totalWorkspaces": len(workspaces),
		"activeSessions":  len(sessions),
		"totalCalls":       totalCalls,
	})
}

func (s *server) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	if !s.checkSuperAdmin(w, r) {
		return
	}

	users, err := pbClient.ListAllUsersPB(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (s *server) handleAdminUpdateUserRole(w http.ResponseWriter, r *http.Request) {
	if !s.checkSuperAdmin(w, r) {
		return
	}

	uid := r.PathValue("uid")
	if uid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "uid obrigatório"})
		return
	}

	var body struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Role) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "role inválida"})
		return
	}

	if err := pbClient.UpdateUserRolePB(r.Context(), uid, strings.TrimSpace(body.Role)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "role atualizada"})
}

func (s *server) handleAdminListWorkspaces(w http.ResponseWriter, r *http.Request) {
	if !s.checkSuperAdmin(w, r) {
		return
	}

	workspaces, err := pbClient.ListWorkspacesPB(r.Context())
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	sessions := s.sessions.infos()
	sessionCountMap := make(map[string]int)
	for _, sess := range sessions {
		wsID := sess.ProjectID
		if wsID == "" {
			wsID = "default"
		}
		sessionCountMap[wsID]++
	}

	users, _ := pbClient.ListAllUsersPB(r.Context())
	userMap := make(map[string]UserRecordPB)
	wsOwnerMap := make(map[string]UserRecordPB)
	for _, u := range users {
		userMap[u.ID] = u
		if u.WorkspaceID != "" {
			if _, exists := wsOwnerMap[u.WorkspaceID]; !exists {
				wsOwnerMap[u.WorkspaceID] = u
			}
		}
	}

	var enriched []map[string]any
	for _, ws := range workspaces {
		creatorName := "Administrador"
		creatorEmail := "admin@kallia.com"
		if u, found := wsOwnerMap[ws.ID]; found {
			if u.Name != "" {
				creatorName = u.Name
			} else {
				creatorName = strings.Split(u.Email, "@")[0]
			}
			creatorEmail = u.Email
		} else if members, err := pbClient.ListWorkspaceMembersPB(r.Context(), ws.ID); err == nil && len(members) > 0 {
			for _, m := range members {
				if m.Role == "owner" || m.Role == "creator" || m.Role == "admin" || creatorEmail == "" {
					if u, ok := userMap[m.UserID]; ok {
						if u.Name != "" {
							creatorName = u.Name
						} else {
							creatorName = strings.Split(u.Email, "@")[0]
						}
						creatorEmail = u.Email
						break
					}
				}
			}
		}

		enriched = append(enriched, map[string]any{
			"id":                   ws.ID,
			"name":                 ws.Name,
			"plan":                 ws.Plan,
			"plan_status":          ws.PlanStatus,
			"max_connections":      ws.MaxConnections,
			"max_concurrent_calls": ws.MaxConcurrentCalls,
			"max_agents":           ws.MaxAgents,
			"connections_count":    sessionCountMap[ws.ID],
			"creator_name":         creatorName,
			"creator_email":        creatorEmail,
			"created_at":           ws.CreatedAt,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{"workspaces": enriched})
}

func (s *server) handleAdminUpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	if !s.checkSuperAdmin(w, r) {
		return
	}

	wid := r.PathValue("wid")
	if wid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "wid obrigatório"})
		return
	}

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "payload inválido"})
		return
	}

	if err := pbClient.UpdateWorkspacePB(r.Context(), wid, body); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "message": "workspace atualizado"})
}


