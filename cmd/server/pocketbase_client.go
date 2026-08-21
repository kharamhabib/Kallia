package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

// PocketBaseClient centraliza as operações HTTP autenticadas de leitura e escrita com o PocketBase
type PocketBaseClient struct {
	baseURL        string
	httpClient     *http.Client
	adminToken     string
	tokenExpiresAt time.Time
	mu             sync.RWMutex
}

var pbClient = &PocketBaseClient{
	httpClient: &http.Client{Timeout: 10 * time.Second},
}

func (c *PocketBaseClient) getBaseURL() string {
	if c.baseURL != "" {
		return c.baseURL
	}
	u := envStr("POCKETBASE_URL", "http://pocketbase:8090")
	return strings.TrimRight(u, "/")
}
func jsonFieldToString(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	return string(b)
}

func sanitizeAIConfigMap(m any) any {
	if m == nil {
		return map[string]any{}
	}
	if asMap, ok := m.(map[string]any); ok {
		clean := make(map[string]any)
		for k, v := range asMap {
			lk := strings.ToLower(k)
			if strings.Contains(lk, "key") || strings.Contains(lk, "secret") || strings.Contains(lk, "token") {
				continue
			}
			clean[k] = v
		}
		return clean
	}
	return m
}

func parseAndSanitizeAIConfig(rawJSON string) any {
	if strings.TrimSpace(rawJSON) == "" {
		return map[string]any{}
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(rawJSON), &m); err != nil {
		return map[string]any{}
	}
	return sanitizeAIConfigMap(m)
}

func (c *PocketBaseClient) authAdmin(ctx context.Context) (string, error) {
	c.mu.RLock()
	if c.adminToken != "" && time.Now().Before(c.tokenExpiresAt.Add(-2*time.Minute)) {
		token := c.adminToken
		c.mu.RUnlock()
		return token, nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()

	// Double check após adquirir lock
	if c.adminToken != "" && time.Now().Before(c.tokenExpiresAt.Add(-2*time.Minute)) {
		return c.adminToken, nil
	}

	base := c.getBaseURL()
	if base == "" {
		return "", fmt.Errorf("pocketbase url não definida")
	}

	adminEmail := envStr("POCKETBASE_ADMIN_EMAIL", "")
	adminPass := envStr("POCKETBASE_ADMIN_PASSWORD", "")
	if adminEmail == "" {
		adminEmail = envStr("KALLIA_ADMIN_EMAIL", "admin@kallia.app")
	}
	if adminPass == "" {
		adminPass = envStr("KALLIA_ADMIN_PASSWORD", "KalliaAdmin2026!")
	}
	if adminEmail == "" || adminPass == "" {
		return "", nil
	}

	payload, err := json.Marshal(map[string]string{
		"identity": adminEmail,
		"password": adminPass,
	})
	if err != nil {
		return "", err
	}

	endpoints := []string{
		fmt.Sprintf("%s/api/collections/_superusers/auth-with-password", base),
		fmt.Sprintf("%s/api/admins/auth-with-password", base),
	}

	var lastErr error
	for _, ep := range endpoints {
		req, err := http.NewRequestWithContext(ctx, "POST", ep, bytes.NewReader(payload))
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()

		if resp.StatusCode == http.StatusOK {
			var res struct {
				Token string `json:"token"`
			}
			if err := json.NewDecoder(resp.Body).Decode(&res); err == nil && res.Token != "" {
				c.adminToken = res.Token
				c.tokenExpiresAt = time.Now().Add(12 * time.Hour)
				return c.adminToken, nil
			}
		}
		body, _ := io.ReadAll(resp.Body)
		lastErr = fmt.Errorf("pocketbase auth status %d: %s", resp.StatusCode, string(body))
	}

	return "", fmt.Errorf("falha ao autenticar admin no pocketbase: %w", lastErr)
}

func (c *PocketBaseClient) doAdminRequest(ctx context.Context, method, path string, bodyData any) (*http.Response, error) {
	base := c.getBaseURL()
	if base == "" {
		return nil, fmt.Errorf("pocketbase url não definida")
	}

	token, _ := c.authAdmin(ctx)

	var reader io.Reader
	if bodyData != nil {
		b, err := json.Marshal(bodyData)
		if err != nil {
			return nil, err
		}
		reader = bytes.NewReader(b)
	}

	reqURL := fmt.Sprintf("%s%s", base, path)
	req, err := http.NewRequestWithContext(ctx, method, reqURL, reader)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/json")
	if bodyData != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}

	// Se receber 401/403, pode ter expirado o token. Tentar reautenticar uma vez.
	if (resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden) && token != "" {
		resp.Body.Close()
		c.mu.Lock()
		c.adminToken = ""
		c.mu.Unlock()

		newToken, err := c.authAdmin(ctx)
		if err == nil && newToken != "" {
			if bodyData != nil {
				b, _ := json.Marshal(bodyData)
				reader = bytes.NewReader(b)
			}
			req2, err := http.NewRequestWithContext(ctx, method, reqURL, reader)
			if err == nil {
				req2.Header.Set("Accept", "application/json")
				if bodyData != nil {
					req2.Header.Set("Content-Type", "application/json")
				}
				req2.Header.Set("Authorization", "Bearer "+newToken)
				return c.httpClient.Do(req2)
			}
		}
	}

	return resp, nil
}

// PBListResponse representa a resposta padrão de listagem paginada do PocketBase
type PBListResponse[T any] struct {
	Page       int `json:"page"`
	PerPage    int `json:"perPage"`
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
	Items      []T `json:"items"`
}

type WorkspaceRow struct {
	ID                 string     `json:"id"`
	Name               string     `json:"name"`
	Plan               string     `json:"plan"`
	PlanStatus         string     `json:"plan_status"`
	MaxConnections     int        `json:"max_connections"`
	MaxConcurrentCalls int        `json:"max_concurrent_calls"`
	MaxAgents          int        `json:"max_agents"`
	PlanStartsAt       time.Time  `json:"plan_starts_at"`
	PlanEndsAt         *time.Time `json:"plan_ends_at"`
	CreatedAt          time.Time  `json:"created"`
}

type WorkspaceMemberRow struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	UserID      string    `json:"user_id"`
	Role        string    `json:"role"`
	CreatedAt   time.Time `json:"created"`
}

func (c *PocketBaseClient) ListWorkspacesPB(ctx context.Context) ([]WorkspaceRow, error) {
	resp, err := c.doAdminRequest(ctx, "GET", "/api/collections/workspaces/records?perPage=500&sort=created", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}

	var pbRes PBListResponse[struct {
		ID                 string `json:"id"`
		Name               string `json:"name"`
		Plan               string `json:"plan"`
		PlanStatus         string `json:"plan_status"`
		MaxConnections     int    `json:"max_connections"`
		MaxConcurrentCalls int    `json:"max_concurrent_calls"`
		MaxAgents          int    `json:"max_agents"`
		PlanStartsAt       string `json:"plan_starts_at"`
		PlanEndsAt         string `json:"plan_ends_at"`
		Created            string `json:"created"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []WorkspaceRow
	for _, item := range pbRes.Items {
		startsAt, _ := time.Parse(time.RFC3339, item.PlanStartsAt)
		if startsAt.IsZero() {
			startsAt, _ = time.Parse("2006-01-02 15:04:05.000Z", item.PlanStartsAt)
		}
		var endsAt *time.Time
		if item.PlanEndsAt != "" {
			if t, err := time.Parse(time.RFC3339, item.PlanEndsAt); err == nil {
				endsAt = &t
			} else if t, err := time.Parse("2006-01-02 15:04:05.000Z", item.PlanEndsAt); err == nil {
				endsAt = &t
			}
		}
		createdTime, _ := time.Parse(time.RFC3339, item.Created)
		if createdTime.IsZero() {
			createdTime, _ = time.Parse("2006-01-02 15:04:05.000Z", item.Created)
		}

		maxConn := item.MaxConnections
		if maxConn <= 0 {
			switch item.Plan {
			case "expert":
				maxConn = 10
			case "pro":
				maxConn = 3
			case "enterprise":
				maxConn = 100
			default:
				maxConn = 1
			}
		}

		maxCalls := item.MaxConcurrentCalls
		if maxCalls <= 0 {
			switch item.Plan {
			case "expert":
				maxCalls = 15
			case "pro":
				maxCalls = 5
			case "enterprise":
				maxCalls = 100
			default:
				maxCalls = 1
			}
		}

		maxAgents := item.MaxAgents
		if maxAgents <= 0 {
			switch item.Plan {
			case "expert":
				maxAgents = 50
			case "pro":
				maxAgents = 15
			case "enterprise":
				maxAgents = 500
			default:
				maxAgents = 2
			}
		}

		list = append(list, WorkspaceRow{
			ID:                 item.ID,
			Name:               item.Name,
			Plan:               item.Plan,
			PlanStatus:         item.PlanStatus,
			MaxConnections:     maxConn,
			MaxConcurrentCalls: maxCalls,
			MaxAgents:          maxAgents,
			PlanStartsAt:       startsAt,
			PlanEndsAt:         endsAt,
			CreatedAt:          createdTime,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) GetWorkspacePB(ctx context.Context, id string) (*WorkspaceRow, error) {
	resp, err := c.doAdminRequest(ctx, "GET", "/api/collections/workspaces/records/"+id, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase workspace erro %d: %s", resp.StatusCode, string(body))
	}

	var item struct {
		ID                 string `json:"id"`
		Name               string `json:"name"`
		Plan               string `json:"plan"`
		PlanStatus         string `json:"plan_status"`
		MaxConnections     int    `json:"max_connections"`
		MaxConcurrentCalls int    `json:"max_concurrent_calls"`
		MaxAgents          int    `json:"max_agents"`
		PlanStartsAt       string `json:"plan_starts_at"`
		PlanEndsAt         string `json:"plan_ends_at"`
		Created            string `json:"created"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return nil, err
	}

	startsAt, _ := time.Parse(time.RFC3339, item.PlanStartsAt)
	var endsAt *time.Time
	if item.PlanEndsAt != "" {
		if t, err := time.Parse(time.RFC3339, item.PlanEndsAt); err == nil {
			endsAt = &t
		}
	}
	createdTime, _ := time.Parse(time.RFC3339, item.Created)

	maxConn := item.MaxConnections
	if maxConn <= 0 {
		maxConn = 1
	}

	return &WorkspaceRow{
		ID:                 item.ID,
		Name:               item.Name,
		Plan:               item.Plan,
		PlanStatus:         item.PlanStatus,
		MaxConnections:     maxConn,
		MaxConcurrentCalls: item.MaxConcurrentCalls,
		MaxAgents:          item.MaxAgents,
		PlanStartsAt:       startsAt,
		PlanEndsAt:         endsAt,
		CreatedAt:          createdTime,
	}, nil
}

func (c *PocketBaseClient) CreateWorkspacePB(ctx context.Context, name, plan, planStatus string, maxConn, maxCalls, maxAgents int) (*WorkspaceRow, error) {
	if plan == "" {
		plan = "trial"
	}
	if planStatus == "" {
		planStatus = "active"
	}
	if maxConn <= 0 {
		maxConn = 1
	}
	if maxCalls <= 0 {
		maxCalls = 1
	}
	if maxAgents <= 0 {
		maxAgents = 2
	}

	startsAt := time.Now().UTC()
	endsAt := startsAt.Add(30 * 24 * time.Hour)

	data := map[string]any{
		"name":                 name,
		"plan":                 plan,
		"plan_status":          planStatus,
		"max_connections":      maxConn,
		"max_concurrent_calls": maxCalls,
		"max_agents":           maxAgents,
		"plan_starts_at":       startsAt.Format(time.RFC3339),
		"plan_ends_at":         endsAt.Format(time.RFC3339),
	}

	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/workspaces/records", data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		// Fallback resiliente: tenta criar apenas com os campos essenciais se campos secundários falharem
		minimalData := map[string]any{
			"name":        name,
			"plan":        plan,
			"plan_status": planStatus,
		}
		respMin, errMin := c.doAdminRequest(ctx, "POST", "/api/collections/workspaces/records", minimalData)
		if errMin == nil {
			defer respMin.Body.Close()
			if respMin.StatusCode == http.StatusOK || respMin.StatusCode == http.StatusCreated {
				var resMin struct {
					ID   string `json:"id"`
					Name string `json:"name"`
				}
				_ = json.NewDecoder(respMin.Body).Decode(&resMin)
				return &WorkspaceRow{
					ID:                 resMin.ID,
					Name:               name,
					Plan:               plan,
					PlanStatus:         planStatus,
					MaxConnections:     maxConn,
					MaxConcurrentCalls: maxCalls,
					MaxAgents:          maxAgents,
					PlanStartsAt:       startsAt,
					PlanEndsAt:         &endsAt,
					CreatedAt:          time.Now(),
				}, nil
			}
		}
		return nil, fmt.Errorf("pocketbase criar workspace erro %d: %s", resp.StatusCode, string(body))
	}

	var res struct {
		ID      string `json:"id"`
		Name    string `json:"name"`
		Created string `json:"created"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&res)

	return &WorkspaceRow{
		ID:                 res.ID,
		Name:               name,
		Plan:               plan,
		PlanStatus:         planStatus,
		MaxConnections:     maxConn,
		MaxConcurrentCalls: maxCalls,
		MaxAgents:          maxAgents,
		PlanStartsAt:       startsAt,
		PlanEndsAt:         &endsAt,
		CreatedAt:          time.Now(),
	}, nil
}

func (c *PocketBaseClient) UpdateWorkspacePB(ctx context.Context, id string, data map[string]any) error {
	resp, err := c.doAdminRequest(ctx, "PATCH", "/api/collections/workspaces/records/"+id, data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pocketbase atualizar workspace erro %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (c *PocketBaseClient) DeleteWorkspacePB(ctx context.Context, id string) error {
	resp, err := c.doAdminRequest(ctx, "DELETE", "/api/collections/workspaces/records/"+id, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pocketbase deletar workspace erro %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (c *PocketBaseClient) ListWorkspaceMembersPB(ctx context.Context, workspaceID string) ([]WorkspaceMemberRow, error) {
	filter := fmt.Sprintf(`workspace_id="%s"`, workspaceID)
	reqURL := fmt.Sprintf("/api/collections/workspace_members/records?filter=(%s)&perPage=200", url.QueryEscape(filter))

	resp, err := c.doAdminRequest(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, nil
	}

	var pbRes PBListResponse[struct {
		ID          string `json:"id"`
		WorkspaceID string `json:"workspace_id"`
		UserID      string `json:"user_id"`
		Role        string `json:"role"`
		Created     string `json:"created"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []WorkspaceMemberRow
	for _, item := range pbRes.Items {
		createdTime, _ := time.Parse(time.RFC3339, item.Created)
		list = append(list, WorkspaceMemberRow{
			ID:          item.ID,
			WorkspaceID: item.WorkspaceID,
			UserID:      item.UserID,
			Role:        item.Role,
			CreatedAt:   createdTime,
		})
	}
	return list, nil
}

func (c *PocketBaseClient) AddWorkspaceMemberPB(ctx context.Context, workspaceID, userID, role string) error {
	data := map[string]any{
		"workspace_id": workspaceID,
		"user_id":      userID,
		"role":         role,
	}
	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/workspace_members/records", data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (c *PocketBaseClient) RemoveWorkspaceMemberPB(ctx context.Context, memberID string) error {
	resp, err := c.doAdminRequest(ctx, "DELETE", "/api/collections/workspace_members/records/"+memberID, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (c *PocketBaseClient) GetUserPB(ctx context.Context, userID string) (*struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	Role        string `json:"role"`
	WorkspaceID string `json:"workspace_id"`
}, error) {
	resp, err := c.doAdminRequest(ctx, "GET", "/api/collections/users/records/"+userID, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("user not found")
	}
	var res struct {
		ID          string `json:"id"`
		Email       string `json:"email"`
		Role        string `json:"role"`
		WorkspaceID string `json:"workspace_id"`
		ProjectID   string `json:"project_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}
	if res.WorkspaceID == "" {
		res.WorkspaceID = res.ProjectID
	}
	return &struct {
		ID          string `json:"id"`
		Email       string `json:"email"`
		Role        string `json:"role"`
		WorkspaceID string `json:"workspace_id"`
	}{
		ID:          res.ID,
		Email:       res.Email,
		Role:        res.Role,
		WorkspaceID: res.WorkspaceID,
	}, nil
}

func (c *PocketBaseClient) ListWorkspacesForUserPB(ctx context.Context, userID string) ([]WorkspaceRow, error) {
	wsMap := make(map[string]WorkspaceRow)

	// 1. Buscar no workspace_members
	if userID != "" {
		filter := fmt.Sprintf(`user_id="%s"`, userID)
		reqURL := fmt.Sprintf("/api/collections/workspace_members/records?filter=(%s)&perPage=100", url.QueryEscape(filter))

		resp, err := c.doAdminRequest(ctx, "GET", reqURL, nil)
		if err == nil {
			defer resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				var pbRes PBListResponse[struct {
					WorkspaceID string `json:"workspace_id"`
					Role        string `json:"role"`
				}]
				if json.NewDecoder(resp.Body).Decode(&pbRes) == nil {
					for _, m := range pbRes.Items {
						if ws, err := c.GetWorkspacePB(ctx, m.WorkspaceID); err == nil && ws != nil {
							wsMap[ws.ID] = *ws
						}
					}
				}
			}
		}

		// 2. Verificar se o registro do usuário em users possui um workspace_id direto
		if u, err := c.GetUserPB(ctx, userID); err == nil && u != nil && u.WorkspaceID != "" {
			if _, exists := wsMap[u.WorkspaceID]; !exists {
				if ws, err := c.GetWorkspacePB(ctx, u.WorkspaceID); err == nil && ws != nil {
					wsMap[ws.ID] = *ws
					// Auto-vincular a workspace_members para consistência
					_ = c.AddWorkspaceMemberPB(ctx, ws.ID, userID, "owner")
				}
			}
		}
	}

	// 3. Se ainda não encontrou nenhum workspace vinculado a este usuário, buscar todos do PocketBase
	if len(wsMap) == 0 {
		all, _ := c.ListWorkspacesPB(ctx)
		for _, ws := range all {
			wsMap[ws.ID] = ws
			if userID != "" {
				_ = c.AddWorkspaceMemberPB(ctx, ws.ID, userID, "owner")
			}
		}
	}

	var list []WorkspaceRow
	for _, ws := range wsMap {
		list = append(list, ws)
	}

	sort.Slice(list, func(i, j int) bool {
		return list[i].CreatedAt.Before(list[j].CreatedAt)
	})

	return list, nil
}

func (c *PocketBaseClient) RequestPasswordResetPB(ctx context.Context, email string) error {
	data := map[string]string{"email": email}
	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/users/request-password-reset", data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (c *PocketBaseClient) ConfirmPasswordResetPB(ctx context.Context, token, password, passwordConfirm string) error {
	data := map[string]string{
		"token":           token,
		"password":        password,
		"passwordConfirm": passwordConfirm,
	}
	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/users/confirm-password-reset", data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pocketbase erro ao redefinir senha (%d): %s", resp.StatusCode, string(body))
	}
	return nil
}

// --- SESSÕES (CONEXÕES WHATSAPP) ---

func (c *PocketBaseClient) ListSessionsPB(ctx context.Context) ([]sessionRow, error) {
	resp, err := c.doAdminRequest(ctx, "GET", "/api/collections/sessions/records?perPage=500&sort=created", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase sessões erro %d: %s", resp.StatusCode, string(body))
	}

	var pbRes PBListResponse[struct {
		ID          string `json:"id"`
		SID         string `json:"sid"`
		Name        string `json:"name"`
		JID         string `json:"jid"`
		Webhook     string `json:"webhook"`
		Chatwoot    any    `json:"chatwoot"`
		AIConfig    any    `json:"ai_config"`
		WorkspaceID string `json:"workspace_id"`
		APIKey      string `json:"api_key"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []sessionRow
	for _, item := range pbRes.Items {
		sid := item.SID
		if sid == "" {
			sid = item.ID
		}

		list = append(list, sessionRow{
			ID:        sid,
			Name:      item.Name,
			JID:       item.JID,
			Webhook:   item.Webhook,
			Chatwoot:  jsonFieldToString(item.Chatwoot),
			AIConfig:  jsonFieldToString(item.AIConfig),
			ProjectID: item.WorkspaceID,
			APIKey:    item.APIKey,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) UpsertSessionPB(ctx context.Context, id, name, jid, webhook, chatwoot, aiConfig, workspaceID, apiKey string) error {
	return c.UpsertSessionFullPB(ctx, id, name, jid, "", "", webhook, chatwoot, aiConfig, workspaceID, apiKey, "")
}

func (c *PocketBaseClient) UpsertSessionFullPB(ctx context.Context, id, name, jid, phoneNumber, status, webhook, chatwoot, aiConfig, workspaceID, apiKey, defaultAgentID string) error {
	var cwObj any = map[string]any{}
	if chatwoot != "" {
		_ = json.Unmarshal([]byte(chatwoot), &cwObj)
	}
	parsedAIConfig := parseAndSanitizeAIConfig(aiConfig)

	// Extrai número de telefone se não fornecido
	if phoneNumber == "" && jid != "" {
		if atIdx := strings.Index(jid, "@"); atIdx > 0 {
			userPart := jid[:atIdx]
			if colonIdx := strings.Index(userPart, ":"); colonIdx > 0 {
				userPart = userPart[:colonIdx]
			}
			phoneNumber = userPart
		}
	}

	data := map[string]any{
		"sid":          id,
		"name":         name,
		"jid":          jid,
		"phone_number": phoneNumber,
		"chatwoot":     cwObj,
		"ai_config":    parsedAIConfig,
		"workspace_id": workspaceID,
		"api_key":      apiKey,
	}

	if status != "" {
		data["status"] = status
	}
	if defaultAgentID != "" {
		data["default_agent_id"] = defaultAgentID
	}
	if strings.HasPrefix(webhook, "http://") || strings.HasPrefix(webhook, "https://") {
		data["webhook"] = webhook
	} else if webhook == "" {
		data["webhook"] = ""
	}

	// 1. Procurar se já existe registro com este sid ou id no PocketBase
	filter := fmt.Sprintf(`sid="%s" || id="%s"`, id, id)
	searchURL := fmt.Sprintf("/api/collections/sessions/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	searchResp, searchErr := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if searchErr == nil && searchResp != nil {
		defer searchResp.Body.Close()
		if searchResp.StatusCode == http.StatusOK {
			var res PBListResponse[struct {
				ID string `json:"id"`
			}]
			if json.NewDecoder(searchResp.Body).Decode(&res) == nil && len(res.Items) > 0 {
				existingPBID := res.Items[0].ID
				patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/sessions/records/"+existingPBID, data)
				if patchErr == nil {
					defer patchResp.Body.Close()
					if patchResp.StatusCode == http.StatusOK {
						return nil
					}
				}
			}
		}
	}

	// 2. Se não encontrou, cria novo
	if len(id) == 15 {
		data["id"] = id
	}
	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/sessions/records", data)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
			return nil
		}
	}

	return err
}

func (c *PocketBaseClient) DeleteSessionPB(ctx context.Context, id string) error {
	// 1. Tentar deletar diretamente caso seja o ID de 15 caracteres do PocketBase
	resp, err := c.doAdminRequest(ctx, "DELETE", "/api/collections/sessions/records/"+id, nil)
	if err == nil {
		resp.Body.Close()
	}

	// 2. Buscar por sid ou id e deletar a sessão encontrada no PocketBase
	filter := fmt.Sprintf(`sid="%s" || id="%s"`, id, id)
	searchURL := fmt.Sprintf("/api/collections/sessions/records?filter=(%s)&perPage=50", url.QueryEscape(filter))
	searchResp, searchErr := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if searchErr == nil {
		defer searchResp.Body.Close()
		var res PBListResponse[struct {
			ID string `json:"id"`
		}]
		if json.NewDecoder(searchResp.Body).Decode(&res) == nil {
			for _, item := range res.Items {
				delResp, _ := c.doAdminRequest(ctx, "DELETE", "/api/collections/sessions/records/"+item.ID, nil)
				if delResp != nil {
					delResp.Body.Close()
				}
			}
		}
	}
	return nil
}

// --- AGENTES ESPECIALISTAS (AGENTS) ---

func (c *PocketBaseClient) ListAgentsPB(ctx context.Context, targetID string) ([]agentRow, error) {
	reqPath := "/api/collections/agents/records?perPage=500&sort=-created"
	if targetID != "" && targetID != "default" {
		filter := fmt.Sprintf(`workspace_id="%s"`, targetID)
		reqPath = fmt.Sprintf("/api/collections/agents/records?filter=(%s)&perPage=200&sort=-created", url.QueryEscape(filter))
	}

	resp, err := c.doAdminRequest(ctx, "GET", reqPath, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase agentes erro %d: %s", resp.StatusCode, string(body))
	}

	var pbRes PBListResponse[struct {
		ID          string `json:"id"`
		WorkspaceID string `json:"workspace_id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		AIConfig    any    `json:"ai_config"`
		Inbound     bool   `json:"inbound"`
		Outbound    bool   `json:"outbound"`
		Created     string `json:"created"`
		Updated     string `json:"updated"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var rows []agentRow
	for _, item := range pbRes.Items {
		createdTime, _ := time.Parse(time.RFC3339, item.Created)
		if createdTime.IsZero() {
			createdTime, _ = time.Parse("2006-01-02 15:04:05.000Z", item.Created)
		}

		rows = append(rows, agentRow{
			ID:          item.ID,
			SessionID:   item.WorkspaceID,
			Name:        item.Name,
			Description: item.Description,
			AIConfig:    jsonFieldToString(item.AIConfig),
			Inbound:     item.Inbound,
			Outbound:    item.Outbound,
			CreatedAt:   createdTime,
		})
	}

	return rows, nil
}

func (c *PocketBaseClient) CreateAgentPB(ctx context.Context, id, workspaceID, name, description, aiConfig string, inbound, outbound bool) (string, error) {
	parsedConfig := parseAndSanitizeAIConfig(aiConfig)

	if workspaceID == "" {
		workspaceID = "default"
	}

	data := map[string]any{
		"workspace_id": workspaceID,
		"name":         name,
		"description":  description,
		"ai_config":    parsedConfig,
		"inbound":      inbound,
		"outbound":     outbound,
	}
	if len(id) == 15 {
		data["id"] = id
	}

	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/agents/records", data)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("pocketbase criar agente erro %d: %s", resp.StatusCode, string(body))
	}

	var res struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&res)
	return res.ID, nil
}

func (c *PocketBaseClient) UpdateAgentPB(ctx context.Context, id, name, description, aiConfig string, inbound, outbound bool) error {
	parsedConfig := parseAndSanitizeAIConfig(aiConfig)

	data := map[string]any{
		"name":        name,
		"description": description,
		"ai_config":   parsedConfig,
		"inbound":     inbound,
		"outbound":    outbound,
	}

	resp, err := c.doAdminRequest(ctx, "PATCH", "/api/collections/agents/records/"+id, data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pocketbase atualizar agente erro %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func (c *PocketBaseClient) DeleteAgentPB(ctx context.Context, id string) error {
	resp, err := c.doAdminRequest(ctx, "DELETE", "/api/collections/agents/records/"+id, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pocketbase deletar agente erro %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

func (c *PocketBaseClient) UpsertMasterAgentPB(ctx context.Context, workspaceID string, name, description, aiConfig string, inbound, outbound bool) error {
	if workspaceID == "" {
		workspaceID = "default"
	}

	parsedConfig := parseAndSanitizeAIConfig(aiConfig)

	data := map[string]any{
		"workspace_id": workspaceID,
		"name":         name,
		"description":  description,
		"ai_config":    parsedConfig,
		"inbound":      inbound,
		"outbound":     outbound,
	}

	// 1. Tentar localizar por workspace_id e inbound=true ou name
	filter := fmt.Sprintf(`workspace_id="%s" && (inbound=true || name="%s")`, workspaceID, name)
	searchURL := fmt.Sprintf("/api/collections/agents/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var pbRes PBListResponse[struct {
			ID string `json:"id"`
		}]
		if json.NewDecoder(resp.Body).Decode(&pbRes) == nil && len(pbRes.Items) > 0 {
			patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/agents/records/"+pbRes.Items[0].ID, data)
			if patchErr == nil && patchResp != nil {
				defer patchResp.Body.Close()
				return nil
			}
		}
	}

	// 2. Se não existir, criar novo registro na coleção agents
	createResp, createErr := c.doAdminRequest(ctx, "POST", "/api/collections/agents/records", data)
	if createErr != nil {
		return createErr
	}
	defer createResp.Body.Close()
	return nil
}

// --- HISTÓRICO DE CHAMADAS & TRANSCRIÇÕES (CALL_HISTORY) ---

func (c *PocketBaseClient) SaveCallHistoryPB(ctx context.Context, workspaceID, sessionID, callID, peer, direction string, startedAt, endedAt int64, summary, recordingURL, transcriptJSON, agentID string) error {
	if workspaceID == "" {
		workspaceID = "default"
	}

	var parsedTranscript any
	if transcriptJSON != "" {
		_ = json.Unmarshal([]byte(transcriptJSON), &parsedTranscript)
	}
	if parsedTranscript == nil {
		parsedTranscript = []any{}
	}

	data := map[string]any{
		"workspace_id":  workspaceID,
		"session_id":    sessionID,
		"call_id":       callID,
		"peer":          peer,
		"direction":     direction,
		"started_at":    startedAt,
		"ended_at":      endedAt,
		"summary":       summary,
		"recording_url": recordingURL,
		"transcript":    parsedTranscript,
		"agent_id":      agentID,
	}

	// 1. Tentar localizar por call_id para fazer PATCH
	filter := fmt.Sprintf(`call_id="%s"`, callID)
	searchURL := fmt.Sprintf("/api/collections/call_history/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var pbRes PBListResponse[struct {
			ID string `json:"id"`
		}]
		if json.NewDecoder(resp.Body).Decode(&pbRes) == nil && len(pbRes.Items) > 0 {
			patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/call_history/records/"+pbRes.Items[0].ID, data)
			if patchErr == nil && patchResp != nil {
				defer patchResp.Body.Close()
				return nil
			}
		}
	}

	// 2. Se não existir, criar novo registro
	createResp, createErr := c.doAdminRequest(ctx, "POST", "/api/collections/call_history/records", data)
	if createErr != nil {
		return createErr
	}
	defer createResp.Body.Close()
	return nil
}

func (c *PocketBaseClient) UpdateCallSummaryPB(ctx context.Context, callID, summary string) error {
	filter := fmt.Sprintf(`call_id="%s"`, callID)
	searchURL := fmt.Sprintf("/api/collections/call_history/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err != nil || resp == nil {
		return err
	}
	defer resp.Body.Close()

	var pbRes PBListResponse[struct {
		ID string `json:"id"`
	}]
	if json.NewDecoder(resp.Body).Decode(&pbRes) != nil || len(pbRes.Items) == 0 {
		return nil
	}

	patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/call_history/records/"+pbRes.Items[0].ID, map[string]any{
		"summary": summary,
	})
	if patchErr != nil {
		return patchErr
	}
	defer patchResp.Body.Close()
	return nil
}

func (c *PocketBaseClient) UpdateCallRecordingURLPB(ctx context.Context, callID, recordingURL string) error {
	filter := fmt.Sprintf(`call_id="%s"`, callID)
	searchURL := fmt.Sprintf("/api/collections/call_history/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err != nil || resp == nil {
		return err
	}
	defer resp.Body.Close()

	var pbRes PBListResponse[struct {
		ID string `json:"id"`
	}]
	if json.NewDecoder(resp.Body).Decode(&pbRes) != nil || len(pbRes.Items) == 0 {
		return nil
	}

	patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/call_history/records/"+pbRes.Items[0].ID, map[string]any{
		"recording_url": recordingURL,
	})
	if patchErr != nil {
		return patchErr
	}
	defer patchResp.Body.Close()
	return nil
}

func (c *PocketBaseClient) UpdateCallTranscriptPB(ctx context.Context, callID string, transcript any) error {
	filter := fmt.Sprintf(`call_id="%s"`, callID)
	searchURL := fmt.Sprintf("/api/collections/call_history/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err != nil || resp == nil {
		return err
	}
	defer resp.Body.Close()

	var pbRes PBListResponse[struct {
		ID string `json:"id"`
	}]
	if json.NewDecoder(resp.Body).Decode(&pbRes) != nil || len(pbRes.Items) == 0 {
		return nil
	}

	patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/call_history/records/"+pbRes.Items[0].ID, map[string]any{
		"transcript": transcript,
	})
	if patchErr != nil {
		return patchErr
	}
	defer patchResp.Body.Close()
	return nil
}

func (c *PocketBaseClient) ListCallHistoryPB(ctx context.Context, workspaceID, sessionID string, limit int) ([]CallRecord, error) {
	if limit <= 0 {
		limit = 100
	}
	var filter string
	if sessionID != "" && workspaceID != "" && workspaceID != "default" {
		filter = fmt.Sprintf(`session_id="%s" || workspace_id="%s"`, sessionID, workspaceID)
	} else if sessionID != "" {
		filter = fmt.Sprintf(`session_id="%s"`, sessionID)
	} else if workspaceID != "" && workspaceID != "default" {
		filter = fmt.Sprintf(`workspace_id="%s"`, workspaceID)
	}

	reqPath := fmt.Sprintf("/api/collections/call_history/records?perPage=%d&sort=-started_at", limit)
	if filter != "" {
		reqPath = fmt.Sprintf("/api/collections/call_history/records?filter=(%s)&perPage=%d&sort=-started_at", url.QueryEscape(filter), limit)
	}

	resp, err := c.doAdminRequest(ctx, "GET", reqPath, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase call_history erro %d: %s", resp.StatusCode, string(body))
	}

	var pbRes PBListResponse[struct {
		ID           string `json:"id"`
		WorkspaceID  string `json:"workspace_id"`
		SessionID    string `json:"session_id"`
		CallID       string `json:"call_id"`
		Peer         string `json:"peer"`
		Direction    string `json:"direction"`
		StartedAt    int64  `json:"started_at"`
		EndedAt      int64  `json:"ended_at"`
		Summary      string `json:"summary"`
		RecordingURL string `json:"recording_url"`
		Transcript   any    `json:"transcript"`
		AgentID      string `json:"agent_id"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []CallRecord
	for _, item := range pbRes.Items {
		var endedAt *int64
		if item.EndedAt > 0 {
			endedVal := item.EndedAt
			endedAt = &endedVal
		}
		rec := CallRecord{
			SessionID:    item.SessionID,
			CallID:       item.CallID,
			Peer:         item.Peer,
			Direction:    item.Direction,
			StartedAt:    item.StartedAt,
			EndedAt:      endedAt,
			Status:       StatusEnded,
			Summary:      item.Summary,
			RecordingURL: item.RecordingURL,
		}
		list = append(list, rec)
	}

	return list, nil
}

func (c *PocketBaseClient) UpdateSessionAIConfigPB(ctx context.Context, sessionID, aiConfigJSON string) error {
	parsedConfig := parseAndSanitizeAIConfig(aiConfigJSON)

	data := map[string]any{
		"ai_config": parsedConfig,
	}

	// 1. Tentar patch pelo ID direto
	resp, err := c.doAdminRequest(ctx, "PATCH", "/api/collections/sessions/records/"+sessionID, data)
	if err == nil && (resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusNoContent) {
		resp.Body.Close()
		return nil
	}
	if resp != nil {
		resp.Body.Close()
	}

	// 2. Se falhar pelo ID, buscar por filter (sid ou id)
	filter := fmt.Sprintf(`sid="%s" || id="%s"`, sessionID, sessionID)
	searchURL := fmt.Sprintf("/api/collections/sessions/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	sResp, sErr := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if sErr == nil && sResp != nil {
		defer sResp.Body.Close()
		var pbRes PBListResponse[struct {
			ID string `json:"id"`
		}]
		if json.NewDecoder(sResp.Body).Decode(&pbRes) == nil && len(pbRes.Items) > 0 {
			pResp, pErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/sessions/records/"+pbRes.Items[0].ID, data)
			if pErr == nil && pResp != nil {
				pResp.Body.Close()
				return nil
			}
		}
	}
	return nil
}

// --- NPS & RATINGS (CALL_RATINGS) ---

func (c *PocketBaseClient) SaveCallRatingPB(ctx context.Context, workspaceID, sessionID, callID, peer string, rating int, comment string) error {
	if workspaceID == "" {
		workspaceID = "default"
	}
	data := map[string]any{
		"workspace_id": workspaceID,
		"session_id":   sessionID,
		"call_id":      callID,
		"peer":         peer,
		"rating":       rating,
		"comment":      comment,
	}

	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/call_ratings/records", data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

func (c *PocketBaseClient) ListCallRatingsPB(ctx context.Context, workspaceID, sessionID string) ([]CallRating, error) {
	var filter string
	if sessionID != "" && workspaceID != "" && workspaceID != "default" {
		filter = fmt.Sprintf(`session_id="%s" || workspace_id="%s"`, sessionID, workspaceID)
	} else if sessionID != "" {
		filter = fmt.Sprintf(`session_id="%s"`, sessionID)
	} else if workspaceID != "" && workspaceID != "default" {
		filter = fmt.Sprintf(`workspace_id="%s"`, workspaceID)
	}

	reqPath := "/api/collections/call_ratings/records?perPage=500&sort=-created"
	if filter != "" {
		reqPath = fmt.Sprintf("/api/collections/call_ratings/records?filter=(%s)&perPage=500&sort=-created", url.QueryEscape(filter))
	}

	resp, err := c.doAdminRequest(ctx, "GET", reqPath, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase call_ratings erro %d: %s", resp.StatusCode, string(body))
	}

	var pbRes PBListResponse[struct {
		ID          string `json:"id"`
		WorkspaceID string `json:"workspace_id"`
		SessionID   string `json:"session_id"`
		CallID      string `json:"call_id"`
		Peer        string `json:"peer"`
		Rating      int    `json:"rating"`
		Comment     string `json:"comment"`
		Created     string `json:"created"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []CallRating
	for _, item := range pbRes.Items {
		createdTime, _ := time.Parse(time.RFC3339, item.Created)
		list = append(list, CallRating{
			ID:        0,
			SessionID: item.SessionID,
			CallID:    item.CallID,
			Phone:     item.Peer,
			Score:     item.Rating,
			Comment:   item.Comment,
			CreatedAt: createdTime,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) DeleteCallHistoryPB(ctx context.Context, callID string) error {
	filter := fmt.Sprintf(`call_id="%s"`, callID)
	searchURL := fmt.Sprintf("/api/collections/call_history/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err != nil || resp == nil {
		return err
	}
	defer resp.Body.Close()

	var pbRes PBListResponse[struct {
		ID string `json:"id"`
	}]
	if json.NewDecoder(resp.Body).Decode(&pbRes) != nil || len(pbRes.Items) == 0 {
		return nil
	}

	delResp, delErr := c.doAdminRequest(ctx, "DELETE", "/api/collections/call_history/records/"+pbRes.Items[0].ID, nil)
	if delErr != nil {
		return delErr
	}
	defer delResp.Body.Close()
	return nil
}

func (c *PocketBaseClient) GetCallTranscriptPB(ctx context.Context, callID string) ([]TranscriptLine, error) {
	filter := fmt.Sprintf(`call_id="%s"`, callID)
	searchURL := fmt.Sprintf("/api/collections/call_history/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err != nil || resp == nil {
		return nil, err
	}
	defer resp.Body.Close()

	var pbRes PBListResponse[struct {
		Transcript any `json:"transcript"`
	}]
	if json.NewDecoder(resp.Body).Decode(&pbRes) != nil || len(pbRes.Items) == 0 || pbRes.Items[0].Transcript == nil {
		return nil, nil
	}

	b, err := json.Marshal(pbRes.Items[0].Transcript)
	if err != nil {
		return nil, err
	}

	var lines []TranscriptLine
	if err := json.Unmarshal(b, &lines); err != nil {
		return nil, err
	}
	return lines, nil
}

// --- PROVEDORES DE IA (AI_PROVIDERS) ---

func (c *PocketBaseClient) ListAIProvidersPB(ctx context.Context) ([]aiProviderRow, error) {
	resp, err := c.doAdminRequest(ctx, "GET", "/api/collections/ai_providers/records?perPage=200", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase ai_providers erro %d: %s", resp.StatusCode, string(body))
	}

	var pbRes PBListResponse[struct {
		ID              string `json:"id"`
		WorkspaceID     string `json:"workspace_id"`
		Provider        string `json:"provider"`
		EncryptedAPIKey string `json:"encrypted_api_key"`
		Enabled         bool   `json:"enabled"`
		DefaultModel    string `json:"default_model"`
		OptionsJSON     any    `json:"options_json"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []aiProviderRow
	for _, item := range pbRes.Items {
		optStr := jsonFieldToString(item.OptionsJSON)
		if optStr == "" {
			optStr = "{}"
		}

		list = append(list, aiProviderRow{
			ProjectID:       item.WorkspaceID,
			Provider:        item.Provider,
			EncryptedAPIKey: item.EncryptedAPIKey,
			Enabled:         item.Enabled,
			DefaultModel:    item.DefaultModel,
			OptionsJSON:     optStr,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) UpsertAIProviderPB(ctx context.Context, r aiProviderRow) error {
	var optObj any = map[string]any{}
	if r.OptionsJSON != "" {
		_ = json.Unmarshal([]byte(r.OptionsJSON), &optObj)
	}

	data := map[string]any{
		"workspace_id":      r.ProjectID,
		"provider":          r.Provider,
		"encrypted_api_key": r.EncryptedAPIKey,
		"enabled":           r.Enabled,
		"default_model":     r.DefaultModel,
		"options_json":      optObj,
	}

	// 1. Tentar localizar por filter se já existe
	filter := fmt.Sprintf(`workspace_id="%s" && provider="%s"`, r.ProjectID, r.Provider)
	searchURL := fmt.Sprintf("/api/collections/ai_providers/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var res PBListResponse[struct {
			ID string `json:"id"`
		}]
		if json.NewDecoder(resp.Body).Decode(&res) == nil && len(res.Items) > 0 {
			patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/ai_providers/records/"+res.Items[0].ID, data)
			if patchErr == nil {
				defer patchResp.Body.Close()
				return nil
			}
		}
	}

	// 2. Se não encontrou, faz POST
	createResp, createErr := c.doAdminRequest(ctx, "POST", "/api/collections/ai_providers/records", data)
	if createErr == nil && createResp != nil {
		defer createResp.Body.Close()
	}
	return createErr
}

// --- CONTATOS DO CRM ---

func (c *PocketBaseClient) ListContactsPB(ctx context.Context, targetID, q string) ([]ContactRecord, error) {
	reqPath := "/api/collections/contacts/records?perPage=500&sort=-created"
	if targetID != "" && q != "" {
		filter := fmt.Sprintf(`(workspace_id="%s" || session_id="%s") && (name ~ "%s" || phone ~ "%s" || email ~ "%s" || company ~ "%s")`, targetID, targetID, q, q, q, q)
		reqPath = fmt.Sprintf("/api/collections/contacts/records?filter=(%s)&perPage=500&sort=-created", url.QueryEscape(filter))
	} else if targetID != "" {
		filter := fmt.Sprintf(`workspace_id="%s" || session_id="%s"`, targetID, targetID)
		reqPath = fmt.Sprintf("/api/collections/contacts/records?filter=(%s)&perPage=500&sort=-created", url.QueryEscape(filter))
	}

	resp, err := c.doAdminRequest(ctx, "GET", reqPath, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase contatos erro %d: %s", resp.StatusCode, string(body))
	}

	var pbRes PBListResponse[struct {
		ID          string `json:"id"`
		WorkspaceID string `json:"workspace_id"`
		SessionID   string `json:"session_id"`
		Phone       string `json:"phone"`
		Name        string `json:"name"`
		Username    string `json:"username"`
		Email       string `json:"email"`
		Company     string `json:"company"`
		Notes       string `json:"notes"`
		Tags        any    `json:"tags"`
		AvatarURL   string `json:"avatar_url"`
		LID         string `json:"lid"`
		JID         string `json:"jid"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []ContactRecord
	for idx, item := range pbRes.Items {
		sessOrWs := item.WorkspaceID
		if sessOrWs == "" {
			sessOrWs = item.SessionID
		}

		list = append(list, ContactRecord{
			ID:        int64(idx + 1),
			SessionID: sessOrWs,
			Phone:     item.Phone,
			Name:      item.Name,
			Username:  item.Username,
			Email:     item.Email,
			Company:   item.Company,
			Notes:     item.Notes,
			Tags:      jsonFieldToString(item.Tags),
			AvatarURL: item.AvatarURL,
			LID:       item.LID,
			JID:       item.JID,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) UpsertContactPB(ctx context.Context, wsID, sessionID string, rec ContactRecord) error {
	var tagsObj any = []string{}
	if rec.Tags != "" {
		_ = json.Unmarshal([]byte(rec.Tags), &tagsObj)
	}

	if wsID == "" {
		wsID = "default"
	}

	data := map[string]any{
		"workspace_id": wsID,
		"session_id":   sessionID,
		"phone":        rec.Phone,
		"name":         rec.Name,
		"company":      rec.Company,
		"notes":        rec.Notes,
		"tags":         tagsObj,
		"avatar_url":   rec.AvatarURL,
		"lid":          rec.LID,
		"jid":          rec.JID,
	}
	if rec.Username != "" {
		data["username"] = rec.Username
	}
	if strings.Contains(rec.Email, "@") {
		data["email"] = rec.Email
	} else {
		data["email"] = ""
	}

	// 1. Verificar se já existe por workspace_id/session_id e (phone ou lid)
	var filter string
	if rec.LID != "" {
		filter = fmt.Sprintf(`(workspace_id="%s" || session_id="%s") && (phone="%s" || (lid != "" && lid="%s"))`, wsID, sessionID, rec.Phone, rec.LID)
	} else {
		filter = fmt.Sprintf(`(workspace_id="%s" || session_id="%s") && phone="%s"`, wsID, sessionID, rec.Phone)
	}
	searchURL := fmt.Sprintf("/api/collections/contacts/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var res PBListResponse[struct {
			ID string `json:"id"`
		}]
		if json.NewDecoder(resp.Body).Decode(&res) == nil && len(res.Items) > 0 {
			patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/contacts/records/"+res.Items[0].ID, data)
			if patchErr == nil && patchResp != nil {
				defer patchResp.Body.Close()
				return nil
			}
		}
	}

	// 2. Se não existe, cria novo
	createResp, createErr := c.doAdminRequest(ctx, "POST", "/api/collections/contacts/records", data)
	if createErr == nil && createResp != nil {
		defer createResp.Body.Close()
	}
	return createErr
}

func (c *PocketBaseClient) DeleteContactPB(ctx context.Context, id string) error {
	resp, err := c.doAdminRequest(ctx, "DELETE", "/api/collections/contacts/records/"+id, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
