package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
		adminEmail = envStr("KALLIA_ADMIN_EMAIL", "")
	}
	if adminPass == "" {
		adminPass = envStr("KALLIA_ADMIN_PASSWORD", "")
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

// --- PROJETOS (WORKSPACES) ---

func (c *PocketBaseClient) ListProjectsPB(ctx context.Context) ([]projectRow, error) {
	resp, err := c.doAdminRequest(ctx, "GET", "/api/collections/projects/records?perPage=500&sort=created", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase projetos erro %d: %s", resp.StatusCode, string(body))
	}

	var pbRes PBListResponse[struct {
		ID           string `json:"id"`
		Name         string `json:"name"`
		Plan         string `json:"plan"`
		PlanStatus   string `json:"plan_status"`
		PlanStartsAt string `json:"plan_starts_at"`
		PlanEndsAt   string `json:"plan_ends_at"`
		Created      string `json:"created"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []projectRow
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

		list = append(list, projectRow{
			ID:           item.ID,
			Name:         item.Name,
			Plan:         item.Plan,
			PlanStatus:   item.PlanStatus,
			PlanStartsAt: startsAt,
			PlanEndsAt:   endsAt,
			CreatedAt:    createdTime,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) UpsertProjectPB(ctx context.Context, id, name, plan, planStatus string, start time.Time, end *time.Time) error {
	data := map[string]any{
		"name":           name,
		"plan":           plan,
		"plan_status":    planStatus,
		"plan_starts_at": start.Format(time.RFC3339),
	}
	if end != nil {
		data["plan_ends_at"] = end.Format(time.RFC3339)
	}
	if len(id) == 15 {
		data["id"] = id
	}

	// 1. Tenta POST
	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/projects/records", data)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
			return nil
		}
	}

	// 2. Se já existe, tenta PATCH
	if id != "" {
		patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/projects/records/"+id, data)
		if patchErr == nil {
			defer patchResp.Body.Close()
			if patchResp.StatusCode == http.StatusOK {
				return nil
			}
		}
	}

	return err
}

func (c *PocketBaseClient) DeleteProjectPB(ctx context.Context, id string) error {
	resp, err := c.doAdminRequest(ctx, "DELETE", "/api/collections/projects/records/"+id, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
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
		ID        string `json:"id"`
		SID       string `json:"sid"`
		Name      string `json:"name"`
		JID       string `json:"jid"`
		Webhook   string `json:"webhook"`
		Chatwoot  any    `json:"chatwoot"`
		AIConfig  any    `json:"ai_config"`
		ProjectID string `json:"project_id"`
		APIKey    string `json:"api_key"`
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

		var cwStr string
		if item.Chatwoot != nil {
			if s, ok := item.Chatwoot.(string); ok {
				cwStr = s
			} else {
				b, _ := json.Marshal(item.Chatwoot)
				cwStr = string(b)
			}
		}

		var aiStr string
		if item.AIConfig != nil {
			if s, ok := item.AIConfig.(string); ok {
				aiStr = s
			} else {
				b, _ := json.Marshal(item.AIConfig)
				aiStr = string(b)
			}
		}

		list = append(list, sessionRow{
			ID:        sid,
			Name:      item.Name,
			JID:       item.JID,
			Webhook:   item.Webhook,
			Chatwoot:  cwStr,
			AIConfig:  aiStr,
			ProjectID: item.ProjectID,
			APIKey:    item.APIKey,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) UpsertSessionPB(ctx context.Context, id, name, jid, webhook, chatwoot, aiConfig, projectID, apiKey string) error {
	var cwObj any = map[string]any{}
	if chatwoot != "" {
		_ = json.Unmarshal([]byte(chatwoot), &cwObj)
	}
	var aiObj any = map[string]any{}
	if aiConfig != "" {
		_ = json.Unmarshal([]byte(aiConfig), &aiObj)
	}

	data := map[string]any{
		"sid":        id,
		"name":       name,
		"jid":        jid,
		"chatwoot":   cwObj,
		"ai_config":  aiObj,
		"project_id": projectID,
		"api_key":    apiKey,
	}
	if strings.HasPrefix(webhook, "http://") || strings.HasPrefix(webhook, "https://") {
		data["webhook"] = webhook
	}
	if len(id) == 15 {
		data["id"] = id
	}

	// 1. Tenta POST
	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/sessions/records", data)
	if err == nil {
		defer resp.Body.Close()
		if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
			return nil
		}
	}

	// 2. Se já existe, tenta PATCH
	if id != "" {
		patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/sessions/records/"+id, data)
		if patchErr == nil {
			defer patchResp.Body.Close()
			if patchResp.StatusCode == http.StatusOK {
				return nil
			}
		}
	}

	return err
}

func (c *PocketBaseClient) DeleteSessionPB(ctx context.Context, id string) error {
	resp, err := c.doAdminRequest(ctx, "DELETE", "/api/collections/sessions/records/"+id, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// --- AGENTES ESPECIALISTAS ---

func (c *PocketBaseClient) ListAgentsPB(ctx context.Context, sessionID string) ([]agentRow, error) {
	reqPath := "/api/collections/agents/records?perPage=500&sort=-created"
	if sessionID != "" {
		reqPath = fmt.Sprintf("/api/collections/agents/records?filter=(session_id='%s')&perPage=100&sort=-created", url.QueryEscape(sessionID))
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
		SessionID   string `json:"session_id"`
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
		var cfgStr string
		if item.AIConfig != nil {
			if str, ok := item.AIConfig.(string); ok {
				cfgStr = str
			} else {
				b, _ := json.Marshal(item.AIConfig)
				cfgStr = string(b)
			}
		}

		createdTime, _ := time.Parse(time.RFC3339, item.Created)
		if createdTime.IsZero() {
			createdTime, _ = time.Parse("2006-01-02 15:04:05.000Z", item.Created)
		}

		rows = append(rows, agentRow{
			ID:          item.ID,
			SessionID:   item.SessionID,
			Name:        item.Name,
			Description: item.Description,
			AIConfig:    cfgStr,
			Inbound:     item.Inbound,
			Outbound:    item.Outbound,
			CreatedAt:   createdTime,
		})
	}

	return rows, nil
}

func (c *PocketBaseClient) CreateAgentPB(ctx context.Context, id, sessionID, name, description, aiConfig string, inbound, outbound bool) (string, error) {
	var parsedConfig any = map[string]any{}
	if aiConfig != "" {
		_ = json.Unmarshal([]byte(aiConfig), &parsedConfig)
	}

	data := map[string]any{
		"session_id":  sessionID,
		"name":        name,
		"description": description,
		"ai_config":   parsedConfig,
		"inbound":     inbound,
		"outbound":    outbound,
	}
	if len(id) == 15 {
		data["id"] = id
	}

	resp, err := c.doAdminRequest(ctx, "POST", "/api/collections/agents/records", data)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var res struct {
		ID      string `json:"id"`
		Message string `json:"message"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&res)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("pocketbase criar agente erro %d: %s", resp.StatusCode, res.Message)
	}

	return res.ID, nil
}

func (c *PocketBaseClient) UpdateAgentPB(ctx context.Context, id, name, description, aiConfig string, inbound, outbound bool) error {
	var parsedConfig any = map[string]any{}
	if aiConfig != "" {
		_ = json.Unmarshal([]byte(aiConfig), &parsedConfig)
	}

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
		ProjectID       string `json:"project_id"`
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
		var optStr string
		if item.OptionsJSON != nil {
			if s, ok := item.OptionsJSON.(string); ok {
				optStr = s
			} else {
				b, _ := json.Marshal(item.OptionsJSON)
				optStr = string(b)
			}
		}
		if optStr == "" {
			optStr = "{}"
		}

		list = append(list, aiProviderRow{
			ProjectID:       item.ProjectID,
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
		"project_id":        r.ProjectID,
		"provider":          r.Provider,
		"encrypted_api_key": r.EncryptedAPIKey,
		"enabled":           r.Enabled,
		"default_model":     r.DefaultModel,
		"options_json":      optObj,
	}

	// 1. Tentar localizar por filter se já existe
	filter := fmt.Sprintf(`project_id="%s" && provider="%s"`, r.ProjectID, r.Provider)
	searchURL := fmt.Sprintf("/api/collections/ai_providers/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err == nil {
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
	if createErr == nil {
		defer createResp.Body.Close()
	}
	return createErr
}

// --- CONTATOS DO CRM ---

func (c *PocketBaseClient) ListContactsPB(ctx context.Context, sessionID, q string) ([]ContactRecord, error) {
	reqPath := "/api/collections/contacts/records?perPage=500&sort=-created"
	if sessionID != "" && q != "" {
		filter := fmt.Sprintf(`session_id="%s" && (name ~ "%s" || phone ~ "%s" || email ~ "%s" || company ~ "%s")`, sessionID, q, q, q, q)
		reqPath = fmt.Sprintf("/api/collections/contacts/records?filter=(%s)&perPage=500&sort=-created", url.QueryEscape(filter))
	} else if sessionID != "" {
		filter := fmt.Sprintf(`session_id="%s"`, sessionID)
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
		ID        string `json:"id"`
		SessionID string `json:"session_id"`
		Phone     string `json:"phone"`
		Name      string `json:"name"`
		Email     string `json:"email"`
		Company   string `json:"company"`
		Notes     string `json:"notes"`
		Tags      any    `json:"tags"`
		AvatarURL string `json:"avatar_url"`
		LID       string `json:"lid"`
		JID       string `json:"jid"`
	}]

	if err := json.NewDecoder(resp.Body).Decode(&pbRes); err != nil {
		return nil, err
	}

	var list []ContactRecord
	for idx, item := range pbRes.Items {
		var tagsStr string
		if item.Tags != nil {
			if s, ok := item.Tags.(string); ok {
				tagsStr = s
			} else {
				b, _ := json.Marshal(item.Tags)
				tagsStr = string(b)
			}
		}

		list = append(list, ContactRecord{
			ID:        int64(idx + 1),
			SessionID: item.SessionID,
			Phone:     item.Phone,
			Name:      item.Name,
			Email:     item.Email,
			Company:   item.Company,
			Notes:     item.Notes,
			Tags:      tagsStr,
			AvatarURL: item.AvatarURL,
			LID:       item.LID,
			JID:       item.JID,
		})
	}

	return list, nil
}

func (c *PocketBaseClient) UpsertContactPB(ctx context.Context, rec ContactRecord) error {
	var tagsObj any = []string{}
	if rec.Tags != "" {
		_ = json.Unmarshal([]byte(rec.Tags), &tagsObj)
	}

	data := map[string]any{
		"session_id":  rec.SessionID,
		"phone":       rec.Phone,
		"name":        rec.Name,
		"company":     rec.Company,
		"notes":       rec.Notes,
		"tags":        tagsObj,
		"avatar_url":  rec.AvatarURL,
		"lid":         rec.LID,
		"jid":         rec.JID,
	}
	if strings.Contains(rec.Email, "@") {
		data["email"] = rec.Email
	}

	// 1. Verificar se já existe por session_id e phone
	filter := fmt.Sprintf(`session_id="%s" && phone="%s"`, rec.SessionID, rec.Phone)
	searchURL := fmt.Sprintf("/api/collections/contacts/records?filter=(%s)&perPage=1", url.QueryEscape(filter))
	resp, err := c.doAdminRequest(ctx, "GET", searchURL, nil)
	if err == nil {
		defer resp.Body.Close()
		var res PBListResponse[struct {
			ID string `json:"id"`
		}]
		if json.NewDecoder(resp.Body).Decode(&res) == nil && len(res.Items) > 0 {
			patchResp, patchErr := c.doAdminRequest(ctx, "PATCH", "/api/collections/contacts/records/"+res.Items[0].ID, data)
			if patchErr == nil {
				defer patchResp.Body.Close()
				return nil
			}
		}
	}

	// 2. Se não encontrou, tenta criar
	createResp, createErr := c.doAdminRequest(ctx, "POST", "/api/collections/contacts/records", data)
	if createErr == nil {
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
