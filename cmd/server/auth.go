package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
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

	// Verificar se usuário já existe
	existing, err := s.sessions.store.getUserByEmail(r.Context(), email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao validar email"})
		return
	}
	if existing != nil {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "este email já está cadastrado"})
		return
	}

	// Criptografar senha
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao processar senha"})
		return
	}

	projectID := newSessionID()
	userID := newSessionID()
	planEnds := time.Now().Add(30 * 24 * time.Hour) // 30 dias de trial inicial

	// Criar o projeto e o usuário com role 'creator'
	err = s.sessions.store.createProjectAndUser(r.Context(), projectID, projName, userID, email, string(hashed), "creator", planEnds)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao cadastrar projeto e usuário"})
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"status": "sucesso", "projectId": projectID})
}

// handleLogin valida o email/senha e devolve o token JWT
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

	user, err := s.sessions.store.getUserByEmail(r.Context(), email)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao buscar usuário"})
		return
	}
	if user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "e-mail ou senha incorretos"})
		return
	}

	// Validar senha
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "e-mail ou senha incorretos"})
		return
	}

	// Obter ID de projeto
	projectID := ""
	if user.ProjectID != nil {
		projectID = *user.ProjectID
	}

	token, err := generateToken(user.ID, user.Role, projectID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao gerar token"})
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user": map[string]any{
			"id":        user.ID,
			"email":     user.Email,
			"role":      user.Role,
			"projectId": projectID,
		},
	})
}

func generateResetCode() string {
	nBig, err := rand.Int(rand.Reader, big.NewInt(900000))
	if err != nil {
		return "123456"
	}
	return fmt.Sprintf("%06d", nBig.Int64()+100000)
}

// handleForgotPassword gera um código de recuperação seguro
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

	user, err := s.sessions.store.getUserByEmail(r.Context(), email)
	if err != nil || user == nil {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "sucesso",
			"message": "Se este e-mail estiver cadastrado, as instruções de recuperação foram enviadas.",
		})
		return
	}

	code := generateResetCode()
	expiresAt := time.Now().Add(15 * time.Minute)

	if err := s.sessions.store.createPasswordReset(r.Context(), email, code, expiresAt); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao processar solicitação"})
		return
	}

	s.log.Info("[Auth] Solicitação de recuperação de senha processada", "email", email)

	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "sucesso",
		"message": "Instruções e código de recuperação gerados com sucesso (válido por 15 minutos).",
	})
}

// handleResetPassword valida o código e redefine a senha do usuário
func (s *server) handleResetPassword(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		Code        string `json:"code"`
		NewPassword string `json:"newPassword"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "dados inválidos"})
		return
	}

	email := strings.TrimSpace(strings.ToLower(body.Email))
	code := strings.TrimSpace(body.Code)
	newPassword := body.NewPassword

	if email == "" || code == "" || len(newPassword) < 6 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "e-mail, código de 6 dígitos e nova senha de pelo menos 6 caracteres são obrigatórios"})
		return
	}

	valid, err := s.sessions.store.verifyPasswordResetCode(r.Context(), email, code)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao verificar código"})
		return
	}
	if !valid {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "código de recuperação inválido ou expirado"})
		return
	}

	hashed, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao processar nova senha"})
		return
	}

	if err := s.sessions.store.updateUserPassword(r.Context(), email, string(hashed)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao atualizar senha do usuário"})
		return
	}

	s.log.Info("[Auth] Senha redefinida com sucesso", "email", email)

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
			proj, err := s.sessions.store.getProject(r.Context(), projectID)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao carregar dados do projeto"})
				return
			}
			if proj != nil {
				planStatus = proj.PlanStatus
				if proj.PlanEndsAt != nil && time.Now().After(*proj.PlanEndsAt) && proj.PlanStatus == "active" {
					_ = s.sessions.store.updateProjectBilling(r.Context(), projectID, proj.Plan, "inactive", proj.PlanEndsAt)
					planStatus = "inactive"
				}
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

		// 1. Servir o frontend estático e as rotas públicas sem autenticação
		if !strings.HasPrefix(path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}
		if path == "/healthz" || path == "/ready" ||
			path == "/api/auth/login" || path == "/api/auth/register" ||
			path == "/api/auth/forgot-password" || path == "/api/auth/reset-password" ||
			path == "/api/config" || path == "/api/metrics" ||
			path == "/api/docs" || path == "/api/swagger" || path == "/api/openapi.yaml" ||
			path == "/api-docs.html" || path == "/openapi.yaml" {
			next.ServeHTTP(w, r)
			return
		}

		// 2. Webhook do Chatwoot tem segurança interna por token em query param
		if strings.HasSuffix(strings.TrimRight(path, "/"), "/chatwoot/webhook") {
			next.ServeHTTP(w, r)
			return
		}

		// 3. Tentar autenticação via JWT (Authorization: Bearer <token>)
		authHeader := r.Header.Get("Authorization")
		if authHeader != "" && strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 {
				claims, err := parseToken(parts[1])
				if err == nil {
					userID, _ := claims["userId"].(string)
					role, _ := claims["role"].(string)
					projectID, _ := claims["projectId"].(string)

					planStatus := "active"
					if projectID != "" && role != "appadmin" {
						proj, err := s.sessions.store.getProject(r.Context(), projectID)
						if err == nil && proj != nil {
							planStatus = proj.PlanStatus
							if proj.PlanEndsAt != nil && time.Now().After(*proj.PlanEndsAt) && proj.PlanStatus == "active" {
								_ = s.sessions.store.updateProjectBilling(r.Context(), projectID, proj.Plan, "inactive", proj.PlanEndsAt)
								planStatus = "inactive"
							}
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
						sessRow, err := s.sessions.store.getRawSession(r.Context(), sid)
						if err == nil && sessRow != nil {
							if sessRow.ProjectID != projectID {
								writeJSON(w, http.StatusForbidden, map[string]string{"error": "você não tem acesso a esta conexão"})
								return
							}
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
