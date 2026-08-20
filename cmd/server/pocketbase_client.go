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
	"time"
)

// pbClient centraliza as operações HTTP de leitura e escrita com o PocketBase
type PocketBaseClient struct {
	baseURL    string
	httpClient *http.Client
}

var pbClient = &PocketBaseClient{
	httpClient: &http.Client{Timeout: 5 * time.Second},
}

func (c *PocketBaseClient) getBaseURL() string {
	if c.baseURL != "" {
		return c.baseURL
	}
	u := envStr("POCKETBASE_URL", "http://pocketbase:8090")
	return strings.TrimRight(u, "/")
}

// PBListResponse representa a resposta padrão de listagem paginada do PocketBase
type PBListResponse[T any] struct {
	Page       int `json:"page"`
	PerPage    int `json:"perPage"`
	TotalItems int `json:"totalItems"`
	TotalPages int `json:"totalPages"`
	Items      []T `json:"items"`
}

// ListAgentsPB busca agentes diretamente da collection 'agents' do PocketBase
func (c *PocketBaseClient) ListAgentsPB(ctx context.Context, sessionID string) ([]agentRow, error) {
	base := c.getBaseURL()
	if base == "" {
		return nil, fmt.Errorf("pocketbase url não definida")
	}

	filter := fmt.Sprintf(`session_id="%s"`, url.QueryEscape(sessionID))
	reqURL := fmt.Sprintf("%s/api/collections/agents/records?filter=(session_id='%s')&perPage=100&sort=-created", base, sessionID)

	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase erro %d: %s (url: %s, filter: %s)", resp.StatusCode, string(body), reqURL, filter)
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

		createdTime, _ := time.Parse("2006-01-02 15:04:05.000Z", item.Created)
		if createdTime.IsZero() {
			createdTime, _ = time.Parse(time.RFC3339, item.Created)
		}
		updatedTime, _ := time.Parse("2006-01-02 15:04:05.000Z", item.Updated)
		if updatedTime.IsZero() {
			updatedTime, _ = time.Parse(time.RFC3339, item.Updated)
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

// CreateAgentPB cria um agente diretamente na collection 'agents' do PocketBase
func (c *PocketBaseClient) CreateAgentPB(ctx context.Context, id, sessionID, name, description, aiConfig string, inbound, outbound bool) (string, error) {
	base := c.getBaseURL()
	if base == "" {
		return "", fmt.Errorf("pocketbase url não definida")
	}

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

	payload, err := json.Marshal(data)
	if err != nil {
		return "", err
	}

	reqURL := fmt.Sprintf("%s/api/collections/agents/records", base)
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
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
		return "", fmt.Errorf("pocketbase erro %d: %s", resp.StatusCode, res.Message)
	}

	return res.ID, nil
}

// UpdateAgentPB atualiza um agente diretamente no PocketBase
func (c *PocketBaseClient) UpdateAgentPB(ctx context.Context, id, name, description, aiConfig string, inbound, outbound bool) error {
	base := c.getBaseURL()
	if base == "" {
		return fmt.Errorf("pocketbase url não definida")
	}

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

	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("%s/api/collections/agents/records/%s", base, id)
	req, err := http.NewRequestWithContext(ctx, "PATCH", reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pocketbase erro %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// DeleteAgentPB remove um agente diretamente do PocketBase
func (c *PocketBaseClient) DeleteAgentPB(ctx context.Context, id string) error {
	base := c.getBaseURL()
	if base == "" {
		return fmt.Errorf("pocketbase url não definida")
	}

	reqURL := fmt.Sprintf("%s/api/collections/agents/records/%s", base, id)
	req, err := http.NewRequestWithContext(ctx, "DELETE", reqURL, nil)
	if err != nil {
		return err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("pocketbase erro %d: %s", resp.StatusCode, string(body))
	}

	return nil
}

// ListContactsPB busca contatos da collection 'contacts' do PocketBase
func (c *PocketBaseClient) ListContactsPB(ctx context.Context, sessionID, q string) ([]ContactRecord, error) {
	base := c.getBaseURL()
	if base == "" {
		return nil, fmt.Errorf("pocketbase url não definida")
	}

	filter := fmt.Sprintf(`session_id="%s"`, sessionID)
	if q != "" {
		filter = fmt.Sprintf(`session_id="%s" && (name ~ "%s" || phone ~ "%s" || email ~ "%s" || company ~ "%s")`, sessionID, q, q, q, q)
	}

	reqURL := fmt.Sprintf("%s/api/collections/contacts/records?filter=(%s)&perPage=200&sort=-created", base, url.QueryEscape(filter))
	req, err := http.NewRequestWithContext(ctx, "GET", reqURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("pocketbase erro %d: %s", resp.StatusCode, string(body))
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
		})
	}

	return list, nil
}

// UpsertContactPB salva ou atualiza um contato no PocketBase
func (c *PocketBaseClient) UpsertContactPB(ctx context.Context, rec ContactRecord) error {
	base := c.getBaseURL()
	if base == "" {
		return fmt.Errorf("pocketbase url não definida")
	}

	var tagsObj any = []string{}
	if rec.Tags != "" {
		_ = json.Unmarshal([]byte(rec.Tags), &tagsObj)
	}

	data := map[string]any{
		"session_id": rec.SessionID,
		"phone":      rec.Phone,
		"name":       rec.Name,
		"email":      rec.Email,
		"company":    rec.Company,
		"notes":      rec.Notes,
		"tags":       tagsObj,
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}

	reqURL := fmt.Sprintf("%s/api/collections/contacts/records", base)
	req, err := http.NewRequestWithContext(ctx, "POST", reqURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	return nil
}

