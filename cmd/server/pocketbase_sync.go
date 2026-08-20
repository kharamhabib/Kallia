package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// pbClient é o cliente HTTP reutilizável para sincronização assíncrona com o PocketBase
var pbHttpClient = &http.Client{Timeout: 5 * time.Second}

func getPocketBaseInternalURL() string {
	u := envStr("POCKETBASE_URL", "http://pocketbase:8090")
	return strings.TrimRight(u, "/")
}

// pbPostOrPatch envia um registro para a collection do PocketBase (tenta POST; se já existir, faz PATCH)
func pbPostOrPatch(ctx context.Context, collection, recordID string, data map[string]any) error {
	base := getPocketBaseInternalURL()
	if base == "" {
		return nil
	}

	payload, err := json.Marshal(data)
	if err != nil {
		return err
	}

	// 1. Tentar criar novo registro
	createURL := fmt.Sprintf("%s/api/collections/%s/records", base, collection)
	req, err := http.NewRequestWithContext(ctx, "POST", createURL, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := pbHttpClient.Do(req)
	if err != nil {
		fmt.Printf("[PocketBase Sync] Falha ao conectar em %s: %v\n", createURL, err)
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusCreated {
		fmt.Printf("[PocketBase Sync] Registro criado com sucesso na collection %s\n", collection)
		return nil
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	fmt.Printf("[PocketBase Sync] POST em %s retornou %d: %s\n", createURL, resp.StatusCode, string(bodyBytes))

	// 2. Se falhar (ex: registro já existente), tentar atualizar via PATCH
	if recordID != "" {
		patchURL := fmt.Sprintf("%s/api/collections/%s/records/%s", base, collection, recordID)
		patchReq, err := http.NewRequestWithContext(ctx, "PATCH", patchURL, bytes.NewReader(payload))
		if err == nil {
			patchReq.Header.Set("Content-Type", "application/json")
			patchResp, err := pbHttpClient.Do(patchReq)
			if err == nil {
				defer patchResp.Body.Close()
			}
		}
	}

	return nil
}

// syncProjectToPB sincroniza um projeto com a collection 'projects' do PocketBase
func syncProjectToPB(id, name, plan, planStatus string, start time.Time, end *time.Time) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		data := map[string]any{
			"name":           name,
			"plan":           plan,
			"plan_status":    planStatus,
			"plan_starts_at": start.Format(time.RFC3339),
		}
		if end != nil {
			data["plan_ends_at"] = end.Format(time.RFC3339)
		}

		_ = pbPostOrPatch(ctx, "projects", id, data)
	}()
}

// syncSessionToPB sincroniza uma sessão do WhatsApp com a collection 'sessions' do PocketBase
func syncSessionToPB(id, name, jid, webhook, projectID, apiKey string) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		data := map[string]any{
			"sid":        id,
			"name":       name,
			"jid":        jid,
			"webhook":    webhook,
			"project_id": projectID,
			"api_key":    apiKey,
		}

		_ = pbPostOrPatch(ctx, "sessions", id, data)
	}()
}

// syncAgentToPB sincroniza um agente de IA com a collection 'agents' do PocketBase
func syncAgentToPB(id, sessionID, name, description, aiConfig string, inbound, outbound bool) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

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

		_ = pbPostOrPatch(ctx, "agents", id, data)
	}()
}

// syncAllToPocketBase percorre os dados locais do SQLite no boot e popula as coleções do PocketBase
func syncAllToPocketBase(ctx context.Context, store *sessionStore) {
	if store == nil || store.db == nil {
		return
	}

	go func() {
		time.Sleep(3 * time.Second) // Aguardar PocketBase inicializar
		syncCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		// 1. Sincronizar Projetos
		rows, err := store.db.QueryContext(syncCtx, `SELECT id, name, plan, plan_status, plan_starts_at, plan_ends_at FROM projects`)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id, name, plan, planStatus string
				var startStr string
				var endStr *string
				if err := rows.Scan(&id, &name, &plan, &planStatus, &startStr, &endStr); err == nil {
					start, _ := time.Parse(time.RFC3339, startStr)
					if start.IsZero() {
						start = time.Now()
					}
					var end *time.Time
					if endStr != nil {
						if t, err := time.Parse(time.RFC3339, *endStr); err == nil {
							end = &t
						}
					}
					syncProjectToPB(id, name, plan, planStatus, start, end)
				}
			}
		}

		// 2. Sincronizar Sessões
		sRows, err := store.db.QueryContext(syncCtx, `SELECT id, name, jid, webhook, project_id, api_key FROM sessions`)
		if err == nil {
			defer sRows.Close()
			for sRows.Next() {
				var id, name, jid, webhook, projectID, apiKey string
				if err := sRows.Scan(&id, &name, &jid, &webhook, &projectID, &apiKey); err == nil {
					syncSessionToPB(id, name, jid, webhook, projectID, apiKey)
				}
			}
		}
	}()
}
