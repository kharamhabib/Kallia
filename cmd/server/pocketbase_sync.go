package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// --- SYNC METHODS (PUSH DE SESSÕES PARA POCKETBASE) ---

func syncSessionToPB(id, name, jid, webhook, chatwoot, aiConfig, workspaceID, apiKey string) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := pbClient.UpsertSessionPB(ctx, id, name, jid, webhook, chatwoot, aiConfig, workspaceID, apiKey); err != nil {
			slog.Warn("[PocketBase Sync] Falha ao sincronizar sessão", "id", id, "err", err)
		}
	})
}

func syncDeleteSessionToPB(id string) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = pbClient.DeleteSessionPB(ctx, id)
	})
}

// --- REALTIME LISTENER (SSE /api/realtime) ---

type pbRealtimeMessage struct {
	Action string         `json:"action"`
	Record map[string]any `json:"record"`
}

// startPocketBaseRealtimeListener conecta via SSE ao PocketBase para reagir a alterações em tempo real
func startPocketBaseRealtimeListener(appCtx context.Context, store *sessionStore, broker *Broker, sessionMgr *SessionManager) {
	log := slog.Default().With("module", "PocketBaseRealtime")

	goSafe(log, func() {
		for {
			select {
			case <-appCtx.Done():
				return
			default:
			}

			baseURL := pbClient.getBaseURL()
			if baseURL == "" {
				time.Sleep(10 * time.Second)
				continue
			}

			log.Info("conectando ao PocketBase Realtime SSE...", "url", baseURL+"/api/realtime")
			token, _ := pbClient.authAdmin(appCtx)

			req, err := http.NewRequestWithContext(appCtx, "GET", baseURL+"/api/realtime", nil)
			if err != nil {
				time.Sleep(5 * time.Second)
				continue
			}
			req.Header.Set("Accept", "text/event-stream")
			if token != "" {
				req.Header.Set("Authorization", "Bearer "+token)
			}

			resp, err := http.DefaultClient.Do(req)
			if err != nil {
				log.Warn("erro na conexão SSE com PocketBase", "err", err)
				time.Sleep(5 * time.Second)
				continue
			}

			if resp.StatusCode != http.StatusOK {
				resp.Body.Close()
				log.Warn("conexão SSE recusada pelo PocketBase", "status", resp.StatusCode)
				time.Sleep(5 * time.Second)
				continue
			}

			reader := bufio.NewReader(resp.Body)
			var clientID string
			var currentEvent string

			for {
				line, err := reader.ReadString('\n')
				if err != nil {
					if errors.Is(err, io.EOF) || strings.Contains(err.Error(), "EOF") {
						log.Debug("leitura SSE encerrada por inatividade (EOF), reconectando...")
					} else {
						log.Warn("leitura SSE interrompida, reconectando...", "err", err)
					}
					resp.Body.Close()
					break
				}

				line = strings.TrimSpace(line)
				if line == "" {
					continue
				}

				if strings.HasPrefix(line, "event:") {
					currentEvent = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
					continue
				}

				if strings.HasPrefix(line, "data:") {
					dataStr := strings.TrimSpace(strings.TrimPrefix(line, "data:"))

					if currentEvent == "PB_CONNECT" {
						var connectData struct {
							ClientID string `json:"clientId"`
						}
						if json.Unmarshal([]byte(dataStr), &connectData) == nil && connectData.ClientID != "" {
							clientID = connectData.ClientID
							log.Info("conectado ao PocketBase Realtime!", "clientId", clientID)

							// Enviar subscrição para as coleções do Kallia 2.0
							subPayload, _ := json.Marshal(map[string]any{
								"clientId": clientID,
								"subscriptions": []string{
									"workspaces/*",
									"workspace_members/*",
									"sessions/*",
									"agents/*",
									"ai_providers/*",
									"contacts/*",
								},
							})

							subReq, subErr := http.NewRequestWithContext(appCtx, "POST", baseURL+"/api/realtime", bytes.NewReader(subPayload))
							if subErr == nil {
								subReq.Header.Set("Content-Type", "application/json")
								if token != "" {
									subReq.Header.Set("Authorization", "Bearer "+token)
								}
								subResp, subErr := http.DefaultClient.Do(subReq)
								if subErr == nil {
									subResp.Body.Close()
									log.Info("inscrições em tempo real registradas no PocketBase com sucesso")
								}
							}
						}
						continue
					}

					// Processamento de eventos em tempo real
					var msg pbRealtimeMessage
					if json.Unmarshal([]byte(dataStr), &msg) == nil && msg.Record != nil {
						handleRealtimeRecord(appCtx, store, broker, sessionMgr, currentEvent, msg)
					}
				}
			}

			time.Sleep(3 * time.Second)
		}
	})
}

func handleRealtimeRecord(ctx context.Context, store *sessionStore, broker *Broker, sessionMgr *SessionManager, eventName string, msg pbRealtimeMessage) {
	log := slog.Default().With("module", "PocketBaseSync", "event", eventName, "action", msg.Action)

	// Extrair o nome da coleção (ex: "sessions/xyz" -> "sessions")
	collection := eventName
	if idx := strings.Index(collection, "/"); idx != -1 {
		collection = collection[:idx]
	}

	recordID, _ := msg.Record["id"].(string)

	switch collection {
	case "workspaces", "workspace_members":
		log.Info("evento em tempo real de workspace", "workspaceId", recordID, "action", msg.Action)

	case "sessions":
		sid, _ := msg.Record["sid"].(string)
		if sid == "" {
			sid = recordID
		}

		if msg.Action == "delete" {
			if store != nil && store.db != nil {
				_, _ = store.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = $1`, sid)
			}
			if sessionMgr != nil {
				_ = sessionMgr.Delete(ctx, sid)
			}
		} else {
			name, _ := msg.Record["name"].(string)
			jid, _ := msg.Record["jid"].(string)
			webhook, _ := msg.Record["webhook"].(string)
			chatwoot, _ := msg.Record["chatwoot"].(string)
			aiConfig, _ := msg.Record["ai_config"].(string)
			workspaceID, _ := msg.Record["workspace_id"].(string)
			if workspaceID == "" {
				workspaceID, _ = msg.Record["project_id"].(string)
			}
			apiKey, _ := msg.Record["api_key"].(string)

			if store != nil && store.db != nil {
				_, _ = store.db.ExecContext(ctx, `
					INSERT INTO sessions (id, name, jid, webhook, chatwoot, ai_config, workspace_id, api_key)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
					ON CONFLICT (id) DO UPDATE SET
						name = excluded.name,
						jid = excluded.jid,
						webhook = excluded.webhook,
						chatwoot = excluded.chatwoot,
						ai_config = excluded.ai_config,
						workspace_id = excluded.workspace_id,
						api_key = excluded.api_key
				`, sid, name, jid, webhook, chatwoot, aiConfig, workspaceID, apiKey)
			}

			if sessionMgr != nil {
				sess, exists := sessionMgr.Get(sid)
				if !exists {
					sess = newSession(sessionMgr, sid, name, workspaceID, apiKey, nil)
					sessionMgr.register(sess)
				}
				sess.setName(name)
				sess.setWebhook(webhook)
				if chatwoot != "" {
					var cw ChatwootConfig
					if json.Unmarshal([]byte(chatwoot), &cw) == nil {
						sess.setChatwoot(cw)
					}
				}
				if aiConfig != "" {
					var aiCfg AIConfig
					if json.Unmarshal([]byte(aiConfig), &aiCfg) == nil {
						sess.setAIConfig(aiCfg)
					}
				}
				sessionMgr.broker.emitSessionList(sessionMgr.infos())
			}
		}

	case "agents", "ai_providers", "contacts":
		// As coleções são consultadas diretamente no PocketBase (SSOT).
		// Notifica o frontend via broker para reatividade imediata.
		log.Debug("evento em tempo real recebido", "collection", collection, "recordId", recordID, "action", msg.Action)
	}

	if broker != nil {
		broker.broadcast(map[string]any{
			"type":       "pocketbase-sync",
			"collection": collection,
			"action":     msg.Action,
			"recordId":   recordID,
		})
	}
}
