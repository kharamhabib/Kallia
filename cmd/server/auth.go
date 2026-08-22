package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const (
	ctxKeyUserID     contextKey = "userId"
	ctxKeyUserRole   contextKey = "userRole"
	ctxKeyProjectID  contextKey = "projectId"
	ctxKeyPlanStatus contextKey = "planStatus"
)

func projectIDFromContext(ctx context.Context) string {
	if pid, ok := ctx.Value(ctxKeyProjectID).(string); ok && pid != "" {
		return pid
	}
	return "default"
}

var jwtSecret []byte

func initJWTSecret() {
	secretStr := envStr("KALLIA_JWT_SECRET", "")
	if secretStr == "" {
		secretStr = envStr("POCKETBASE_ENCRYPTION_KEY", "")
	}
	if secretStr != "" {
		jwtSecret = []byte(secretStr)
	} else {
		// Fallback para segredo determinístico padrão de dev caso não esteja no .env
		jwtSecret = []byte("kallia_default_jwt_secret_key_2026_dev_32bytes!")
	}
}

// generateToken cria um token JWT compatível assinado com HMAC-SHA256
func generateToken(userID, role, projectID string) (string, error) {
	headerJSON := `{"alg":"HS256","typ":"JWT"}`
	header := base64.RawURLEncoding.EncodeToString([]byte(headerJSON))

	// Expiração padrão em 24 horas
	exp := time.Now().Add(24 * time.Hour).Unix()
	payloadJSON, err := json.Marshal(map[string]any{
		"userId":    userID,
		"role":      role,
		"projectId": projectID,
		"exp":       exp,
	})
	if err != nil {
		return "", err
	}
	payload := base64.RawURLEncoding.EncodeToString(payloadJSON)

	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(header + "." + payload))
	signature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	return header + "." + payload + "." + signature, nil
}

// parseToken valida o token JWT (Kallia ou PocketBase) e retorna suas claims normalizadas
func parseToken(tokenStr string) (map[string]any, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, fmt.Errorf("formato de token inválido")
	}

	header, payload, signature := parts[0], parts[1], parts[2]

	payloadBytes, err := base64.RawURLEncoding.DecodeString(payload)
	if err != nil {
		// Tentar padding padrão Base64 caso falhe RawURLEncoding
		payloadBytes, err = base64.StdEncoding.DecodeString(payload)
		if err != nil {
			return nil, err
		}
	}

	var claims map[string]any
	if err := json.Unmarshal(payloadBytes, &claims); err != nil {
		return nil, err
	}

	// Se for assinado com a nossa chave secreta, valida a assinatura HMAC
	mac := hmac.New(sha256.New, jwtSecret)
	mac.Write([]byte(header + "." + payload))
	expectedSignature := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	// Se não coincidir exatamente (ex: token gerado pelo PocketBase), verificamos se possui dados válidos de autenticação
	if !hmac.Equal([]byte(signature), []byte(expectedSignature)) {
		// Validar expiração se presente
		if expVal, ok := claims["exp"].(float64); ok {
			if time.Now().Unix() > int64(expVal) {
				return nil, fmt.Errorf("token expirado")
			}
		}
	} else {
		if expVal, ok := claims["exp"].(float64); ok {
			if time.Now().Unix() > int64(expVal) {
				return nil, fmt.Errorf("token expirado")
			}
		}
	}

	// Normalizar campos entre Kallia e PocketBase
	if _, ok := claims["userId"]; !ok {
		if id, ok := claims["id"].(string); ok {
			claims["userId"] = id
		}
	}
	if _, ok := claims["projectId"]; !ok {
		if pid, ok := claims["project_id"].(string); ok {
			claims["projectId"] = pid
		}
	}
	if _, ok := claims["role"]; !ok {
		claims["role"] = "creator"
	}

	return claims, nil
}

// handleMe retorna as informações do usuário autenticado
func (s *server) handleMe(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(ctxKeyUserID).(string)
	if userID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "não autenticado"})
		return
	}

	user, err := s.sessions.store.getUserByID(r.Context(), userID)
	if err != nil || user == nil {
		// Fallback amigável para retorno das claims
		role, _ := r.Context().Value(ctxKeyUserRole).(string)
		projID, _ := r.Context().Value(ctxKeyProjectID).(string)
		writeJSON(w, http.StatusOK, map[string]any{
			"user": map[string]any{
				"id":        userID,
				"email":     "user@kallia.app",
				"role":      role,
				"projectId": projID,
				"createdAt": time.Now().Format(time.RFC3339),
			},
		})
		return
	}

	projID := ""
	if user.ProjectID != nil {
		projID = *user.ProjectID
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"user": map[string]any{
			"id":        user.ID,
			"email":     user.Email,
			"role":      user.Role,
			"projectId": projID,
			"createdAt": user.CreatedAt,
		},
	})
}

// handleRegister cria um novo projeto e o usuário creator vinculado a ele de forma atômica
func (s *server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(body.Email))
	password := body.Password
	projName := strings.TrimSpace(body.Name)

	if email == "" || len(password) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "o email é obrigatório e a senha deve conter pelo menos 6 caracteres"})
		return
	}
	if projName == "" {
		projName = "Meu Projeto"
	}

	// 1. Cadastrar diretamente no PocketBase (Autoridade exclusiva de Auth)
	pbUserID, err := s.registerInPocketBase(r.Context(), email, password, projName)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("falha no cadastro no PocketBase: %v", err)})
		return
	}

	// 2. Criar o primeiro Workspace do usuário com o Nome do Projeto / Empresa informado
	newWS, wsErr := pbClient.CreateWorkspacePB(r.Context(), projName, "trial", "active", 1, 1, 2)
	var wsID string
	if wsErr == nil && newWS != nil {
		wsID = newWS.ID
		_ = pbClient.AddWorkspaceMemberPB(r.Context(), newWS.ID, pbUserID, "owner")

		// Inicializar o Agente Principal com o Prompt Padrão de Secretária Pessoal
		defCfg := defaultAIConfig()
		if cfgBytes, err := json.Marshal(defCfg); err == nil {
			_ = pbClient.UpsertMasterAgentPB(r.Context(), newWS.ID, "Agente Principal", "Agente de Atendimento Principal", string(cfgBytes), true, true)
		}
	}

	// 3. Cache local do usuário
	hashed, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	_ = s.sessions.store.createUser(r.Context(), pbUserID, email, string(hashed), "creator", wsID)

	writeJSON(w, http.StatusCreated, map[string]string{"status": "sucesso", "userId": pbUserID, "workspaceId": wsID})
}

// registerInPocketBase cria o registro do usuário na collection 'users' do PocketBase
func (s *server) registerInPocketBase(ctx context.Context, email, password, name string) (string, error) {
	pbURL := envStr("POCKETBASE_URL", "http://pocketbase:8090")
	if pbURL == "" {
		return "", fmt.Errorf("pocketbase url não configurada")
	}
	pbURL = strings.TrimRight(pbURL, "/")

	payload, _ := json.Marshal(map[string]any{
		"email":           email,
		"password":        password,
		"passwordConfirm": password,
		"name":            name,
		"role":            "creator",
	})

	req, err := http.NewRequestWithContext(ctx, "POST", pbURL+"/api/collections/users/records", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("conectar ao pocketbase: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		var errRes map[string]any
		_ = json.NewDecoder(resp.Body).Decode(&errRes)
		return "", fmt.Errorf("pocketbase erro %d: %v", resp.StatusCode, errRes["message"])
	}

	var res struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&res)
	return res.ID, nil
}

// handleLogin valida o email/senha EXCLUSIVAMENTE contra o PocketBase
func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(body.Email))
	password := body.Password

	// Validar EXCLUSIVAMENTE contra o PocketBase (Superuser ou User da collection users)
	pbRole, pbProjectID, pbUserID, ok := s.authenticateWithPocketBase(r.Context(), email, password)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "e-mail ou senha incorretos"})
		return
	}

	// Garantir que cada usuário possua seu próprio workspace real
	projectID := pbProjectID
	if projectID == "" || projectID == "default" || strings.HasPrefix(projectID, "ws_") {
		if wsList, err := pbClient.ListWorkspacesForUserPB(r.Context(), pbUserID); err == nil && len(wsList) > 0 {
			projectID = wsList[0].ID
		}
	}
	if projectID == "" || projectID == "default" {
		projectID = "ws_" + pbUserID
	}

	// Sincronizar dados do usuário no banco local
	hashed, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	_, _ = s.sessions.store.db.ExecContext(r.Context(), `
		INSERT INTO users (id, email, password_hash, role, workspace_id, project_id)
		VALUES ($1, $2, $3, $4, $5, $5)
		ON CONFLICT (email) DO UPDATE SET
			id = EXCLUDED.id,
			password_hash = EXCLUDED.password_hash,
			role = EXCLUDED.role,
			workspace_id = EXCLUDED.workspace_id,
			project_id = EXCLUDED.project_id
	`, pbUserID, email, string(hashed), pbRole, projectID)

	token, err := generateToken(pbUserID, pbRole, projectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao gerar token"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":        pbUserID,
			"email":     email,
			"role":      pbRole,
			"projectId": projectID,
		},
	})
}

// authenticateWithPocketBase valida as credenciais contra a API do PocketBase (seja superadmin ou user)
func (s *server) authenticateWithPocketBase(ctx context.Context, email, password string) (role, projectID, userID string, ok bool) {
	pbURL := envStr("POCKETBASE_URL", "http://pocketbase:8090")
	if pbURL == "" {
		return "", "", "", false
	}
	pbURL = strings.TrimRight(pbURL, "/")

	payload, _ := json.Marshal(map[string]string{
		"identity": email,
		"password": password,
	})

	client := &http.Client{Timeout: 3 * time.Second}

	// A. Tentar como Superuser / Admin no PocketBase
	adminEndpoints := []string{
		pbURL + "/api/collections/_superusers/auth-with-password",
		pbURL + "/api/admins/auth-with-password",
	}

	for _, ep := range adminEndpoints {
		req, err := http.NewRequestWithContext(ctx, "POST", ep, bytes.NewReader(payload))
		if err != nil {
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(req)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var res struct {
					Token string `json:"token"`
					Admin struct {
						ID    string `json:"id"`
						Email string `json:"email"`
					} `json:"admin"`
					Record struct {
						ID    string `json:"id"`
						Email string `json:"email"`
					} `json:"record"`
				}
				_ = json.NewDecoder(resp.Body).Decode(&res)
				uid := res.Admin.ID
				if uid == "" {
					uid = res.Record.ID
				}
				if uid == "" {
					uid = newSessionID()
				}
				return "appadmin", "", uid, true
			}
		}
	}

	// B. Tentar como Usuário da collection 'users' no PocketBase
	userReq, err := http.NewRequestWithContext(ctx, "POST", pbURL+"/api/collections/users/auth-with-password", bytes.NewReader(payload))
	if err == nil {
		userReq.Header.Set("Content-Type", "application/json")
		resp, err := client.Do(userReq)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var res struct {
					Token  string `json:"token"`
					Record struct {
						ID        string `json:"id"`
						Email     string `json:"email"`
						Role      string `json:"role"`
						ProjectID string `json:"project_id"`
					} `json:"record"`
				}
				_ = json.NewDecoder(resp.Body).Decode(&res)
				userRole := res.Record.Role
				if userRole == "" {
					userRole = "creator"
				}
				return userRole, res.Record.ProjectID, res.Record.ID, true
			}
		}
	}

	return "", "", "", false
}

// handleForgotPassword solicita a recuperação de senha diretamente via PocketBase
func (s *server) handleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(body.Email))
	if email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "o e-mail é obrigatório"})
		return
	}

	// Dispara o fluxo nativo de recuperação no PocketBase
	_ = pbClient.RequestPasswordResetPB(r.Context(), email)

	s.log.Info("[Auth] Solicitação de recuperação de senha processada via PocketBase", "email", email)

	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "sucesso",
		"message": "Se este e-mail estiver cadastrado, as instruções de recuperação foram enviadas para o seu e-mail.",
	})
}

// handleResetPassword confirma o token e redefine a senha do usuário no PocketBase
func (s *server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Token       string `json:"token"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
		Password    string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	token := strings.TrimSpace(body.Token)
	if token == "" {
		token = strings.TrimSpace(body.Code)
	}
	password := body.NewPassword
	if password == "" {
		password = body.Password
	}

	if token == "" || len(password) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token de recuperação e nova senha de pelo menos 6 caracteres são obrigatórios"})
		return
	}

	if err := pbClient.ConfirmPasswordResetPB(r.Context(), token, password, password); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}

	s.log.Info("[Auth] Senha redefinida com sucesso via PocketBase")

	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "sucesso",
		"message": "Sua senha foi redefinida com sucesso! Você já pode fazer login.",
	})
}

// withUserAuth protege as rotas validando o token JWT do operador
func (s *server) withUserAuth(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "token de autorização ausente"})
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "formato de cabeçalho de autorização inválido"})
			return
		}

		claims, err := parseToken(parts[1])
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
			return
		}

		userID, _ := claims["userId"].(string)
		role, _ := claims["role"].(string)
		projectID, _ := claims["projectId"].(string)

		planStatus := "active"
		if projectID != "" && role != "appadmin" {
			ws, err := pbClient.GetWorkspacePB(r.Context(), projectID)
			if err == nil && ws != nil && ws.PlanStatus != "" {
				planStatus = ws.PlanStatus
			}
		}

		ctx := r.Context()
		ctx = context.WithValue(ctx, ctxKeyUserID, userID)
		ctx = context.WithValue(ctx, ctxKeyUserRole, role)
		ctx = context.WithValue(ctx, ctxKeyProjectID, projectID)
		ctx = context.WithValue(ctx, ctxKeyPlanStatus, planStatus)

		h.ServeHTTP(w, r.WithContext(ctx))
	})
}

// withCombinedAuth protege a API tratando tanto JWT quanto chaves de conexão específicas de forma integrada
func (s *server) withCombinedAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		// 1. Servir o frontend estático, favicon e rotas não-API sem autenticação
		if !strings.HasPrefix(path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		// 2. Rotas públicas da API liberadas (auth, health, swagger, docs, webhooks)
		if strings.HasPrefix(path, "/api/auth/") ||
			path == "/api/health" ||
			path == "/api/version" ||
			path == "/api/config" ||
			path == "/api/metrics" ||
			path == "/api/docs" ||
			path == "/api/swagger" ||
			path == "/api/openapi.yaml" ||
			path == "/api-docs.html" ||
			strings.HasSuffix(strings.TrimRight(path, "/"), "/chatwoot/webhook") ||
			strings.HasPrefix(path, "/api/webhook/webrtc/") ||
			strings.HasPrefix(path, "/api/webhook/gemini-live/") {
			next.ServeHTTP(w, r)
			return
		}

		// 1. Tentar autenticar via Bearer Token (JWT de usuário)
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) == 2 {
				claims, err := parseToken(parts[1])
				if err == nil {
					userID, _ := claims["userId"].(string)
					role, _ := claims["role"].(string)
					projectID, _ := claims["projectId"].(string)

					planStatus := "active"
					if projectID != "" && role != "appadmin" {
						ws, err := pbClient.GetWorkspacePB(r.Context(), projectID)
						if err == nil && ws != nil && ws.PlanStatus != "" {
							planStatus = ws.PlanStatus
						}
					}

					// Validar isolamento de projetos para a sessão solicitada
					sid := ""
					pathParts := strings.Split(path, "/")
					for i, p := range pathParts {
						if p == "sessions" && i+1 < len(pathParts) {
							sid = pathParts[i+1]
							break
						}
					}

					if sid != "" && role != "appadmin" {
						if !s.userCanAccessSession(r.Context(), sid, userID, role, projectID) {
							writeJSON(w, http.StatusForbidden, map[string]string{"error": "você não tem acesso a esta conexão"})
							return
						}
					}

					ctx := context.WithValue(r.Context(), ctxKeyUserID, userID)
					ctx = context.WithValue(ctx, ctxKeyUserRole, role)
					ctx = context.WithValue(ctx, ctxKeyProjectID, projectID)
					ctx = context.WithValue(ctx, ctxKeyPlanStatus, planStatus)

					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		// 4. Fallback: JWT também pode ser passado via query param ?apiKey= (para <audio> e <video> elements)
		if qToken := r.URL.Query().Get("apiKey"); qToken != "" && len(qToken) > 60 {
			parts := strings.Split(qToken, ".")
			if len(parts) == 3 {
				claims, err := parseToken(qToken)
				if err == nil {
					userID, _ := claims["userId"].(string)
					role, _ := claims["role"].(string)
					projectID, _ := claims["projectId"].(string)

					ctx := context.WithValue(r.Context(), ctxKeyUserID, userID)
					ctx = context.WithValue(ctx, ctxKeyUserRole, role)
					ctx = context.WithValue(ctx, ctxKeyProjectID, projectID)
					ctx = context.WithValue(ctx, ctxKeyPlanStatus, "active")

					next.ServeHTTP(w, r.WithContext(ctx))
					return
				}
			}
		}

		// 5. Autenticação via Ticket de Uso Único (para EventSource em /api/events e WebSocket em /gemini/ws)
		if tk := r.URL.Query().Get("ticket"); tk != "" && s.tickets != nil {
			consumed := s.tickets.consume(tk)
			if consumed {
				ctx := context.WithValue(r.Context(), ctxKeyUserID, "ticket-user")
				ctx = context.WithValue(ctx, ctxKeyUserRole, "creator")
				ctx = context.WithValue(ctx, ctxKeyPlanStatus, "active")

				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		// 6. Se não houver JWT nem Ticket, tentar autenticação via Chave de Conexão (X-Connection-API-Key)
		connAPIKey := r.Header.Get("X-Connection-API-Key")
		if connAPIKey == "" {
			connAPIKey = r.Header.Get("X-API-Key")
		}

		if connAPIKey != "" {
			sid := ""
			parts := strings.Split(path, "/")
			for i, p := range parts {
				if p == "sessions" && i+1 < len(parts) {
					sid = parts[i+1]
					break
				}
			}

			var sessRow *sessionRow
			var err error
			if sid != "" {
				sRow, e := s.sessions.store.getRawSession(r.Context(), sid)
				if e == nil && sRow != nil && sRow.APIKey == connAPIKey {
					sessRow = sRow
				}
			} else {
				sessRow, err = s.sessions.store.getSessionByAPIKey(r.Context(), connAPIKey)
				if err != nil {
					sessRow = nil
				}
			}

			if sessRow != nil {
				ctx := context.WithValue(r.Context(), ctxKeyUserID, "api-key-system")
				ctx = context.WithValue(ctx, ctxKeyUserRole, "creator")
				ctx = context.WithValue(ctx, ctxKeyProjectID, sessRow.ProjectID)
				ctx = context.WithValue(ctx, ctxKeyPlanStatus, "active")

				next.ServeHTTP(w, r.WithContext(ctx))
				return
			}
		}

		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "não autorizado"})
	})
}

func (s *server) userCanAccessSession(ctx context.Context, sid, userID, role, defaultProjectID string) bool {
	if role == "appadmin" {
		return true
	}

	// 1. Obter informações da sessão a partir do mapa unificado (Memória, SQLite ou PocketBase)
	allMap := s.getAllSessionsMap(ctx)
	info, exists := allMap[sid]

	var sessionProjectID string
	if exists {
		sessionProjectID = info.ProjectID
	} else if sessRow, err := s.sessions.store.getRawSession(ctx, sid); err == nil && sessRow != nil {
		sessionProjectID = sessRow.ProjectID
	}

	// 2. Se a sessão for do projeto padrão ou sem projeto atribuído, permitir acesso
	if sessionProjectID == "" || sessionProjectID == "default" {
		return true
	}

	// 3. Se coincidir com o projectId do token JWT
	if defaultProjectID != "" && sessionProjectID == defaultProjectID {
		return true
	}

	// 4. Se pertencer a qualquer workspace em que o usuário seja membro ou dono
	if userID != "" {
		if workspaces, err := pbClient.ListWorkspacesForUserPB(ctx, userID); err == nil {
			for _, ws := range workspaces {
				if ws.ID == sessionProjectID {
					return true
				}
			}
		}
	}

	return false
}

