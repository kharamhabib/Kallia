package main

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// --- SYNC METHODS (PUSH PARA POCKETBASE) ---

func syncProjectToPB(id, name, plan, planStatus string, start time.Time, end *time.Time) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := pbClient.UpsertProjectPB(ctx, id, name, plan, planStatus, start, end); err != nil {
			slog.Warn("[PocketBase Sync] Falha ao sincronizar projeto", "id", id, "err", err)
		}
	})
}

func syncSessionToPB(id, name, jid, webhook, chatwoot, aiConfig, projectID, apiKey string) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := pbClient.UpsertSessionPB(ctx, id, name, jid, webhook, chatwoot, aiConfig, projectID, apiKey); err != nil {
			slog.Warn("[PocketBase Sync] Falha ao sincronizar sessão", "id", id, "err", err)
		}
	})
}

func syncAgentToPB(id, sessionID, name, description, aiConfig string, inbound, outbound bool) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if _, err := pbClient.CreateAgentPB(ctx, id, sessionID, name, description, aiConfig, inbound, outbound); err != nil {
			// Se falhar a criação por já existir, tenta atualizar
			_ = pbClient.UpdateAgentPB(ctx, id, name, description, aiConfig, inbound, outbound)
		}
	})
}

func syncDeleteAgentToPB(id string) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = pbClient.DeleteAgentPB(ctx, id)
	})
}

func syncDeleteSessionToPB(id string) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = pbClient.DeleteSessionPB(ctx, id)
	})
}

func syncAIProviderToPB(r aiProviderRow) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := pbClient.UpsertAIProviderPB(ctx, r); err != nil {
			slog.Warn("[PocketBase Sync] Falha ao sincronizar ai_provider", "provider", r.Provider, "err", err)
		}
	})
}

func syncContactToPB(rec ContactRecord) {
	goSafe(slog.Default(), func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := pbClient.UpsertContactPB(ctx, rec); err != nil {
			slog.Warn("[PocketBase Sync] Falha ao sincronizar contato", "phone", rec.Phone, "err", err)
		}
	})
}

// --- HIDRATAÇÃO INICIAL (PULL DO POCKETBASE NO BOOT) ---

func hydrateFromPocketBase(ctx context.Context, store *sessionStore, sessionMgr *SessionManager) {
	if store == nil || store.db == nil {
		return
	}

	log := slog.Default().With("module", "PocketBaseHydrate")
	log.Info("iniciando hidratação de metadados do PocketBase...")

	syncCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	// 1. Hidratar Projetos
	projects, err := pbClient.ListProjectsPB(syncCtx)
	if err != nil {
		log.Warn("não foi possível obter projetos do PocketBase", "err", err)
	} else {
		for _, p := range projects {
			_, _ = store.db.ExecContext(syncCtx, `
				INSERT INTO projects (id, name, plan, plan_status, plan_starts_at, plan_ends_at)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (id) DO UPDATE SET
					name = excluded.name,
					plan = excluded.plan,
					plan_status = excluded.plan_status,
					plan_starts_at = excluded.plan_starts_at,
					plan_ends_at = excluded.plan_ends_at
			`, p.ID, p.Name, p.Plan, p.PlanStatus, p.PlanStartsAt, p.PlanEndsAt)
		}
		log.Info("projetos hidratados do PocketBase", "count", len(projects))
	}

	// 2. Hidratar Sessões (Conexões)
	sessions, err := pbClient.ListSessionsPB(syncCtx)
	if err != nil {
		log.Warn("não foi possível obter sessões do PocketBase", "err", err)
	} else {
		for _, s := range sessions {
			_, _ = store.db.ExecContext(syncCtx, `
				INSERT INTO sessions (id, name, jid, webhook, chatwoot, ai_config, project_id, api_key)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT (id) DO UPDATE SET
					name = excluded.name,
					jid = excluded.jid,
					webhook = excluded.webhook,
					chatwoot = excluded.chatwoot,
					ai_config = excluded.ai_config,
					project_id = excluded.project_id,
					api_key = excluded.api_key
			`, s.ID, s.Name, s.JID, s.Webhook, s.Chatwoot, s.AIConfig, s.ProjectID, s.APIKey)

			if sessionMgr != nil {
				// Se a sessão ainda não estiver no gerenciador de memória, adiciona em modo Standby
				if _, exists := sessionMgr.Get(s.ID); !exists {
					sess := newSession(sessionMgr, s.ID, s.Name, s.ProjectID, s.APIKey, nil)
					sess.setWebhook(s.Webhook)
					if s.Chatwoot != "" {
						var cw ChatwootConfig
						if json.Unmarshal([]byte(s.Chatwoot), &cw) == nil {
							sess.setChatwoot(cw)
						}
					}
					if s.AIConfig != "" {
						var aiCfg AIConfig
						if json.Unmarshal([]byte(s.AIConfig), &aiCfg) == nil {
							sess.setAIConfig(aiCfg)
						}
					}
					sessionMgr.register(sess)
				}
			}
		}
		if sessionMgr != nil {
			sessionMgr.broker.emitSessionList(sessionMgr.infos())
		}
		log.Info("sessões hidratadas do PocketBase", "count", len(sessions))
	}

	// 3. Hidratar Agentes Especialistas
	agents, err := pbClient.ListAgentsPB(syncCtx, "")
	if err != nil {
		log.Warn("não foi possível obter agentes do PocketBase", "err", err)
	} else {
		for _, a := range agents {
			_, _ = store.db.ExecContext(syncCtx, `
				INSERT INTO agents (id, session_id, name, description, ai_config, inbound, outbound)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT (id) DO UPDATE SET
					session_id = excluded.session_id,
					name = excluded.name,
					description = excluded.description,
					ai_config = excluded.ai_config,
					inbound = excluded.inbound,
					outbound = excluded.outbound
			`, a.ID, a.SessionID, a.Name, a.Description, a.AIConfig, a.Inbound, a.Outbound)
		}
		log.Info("agentes especialistas hidratados do PocketBase", "count", len(agents))
	}

	// 4. Hidratar Provedores de IA
	providers, err := pbClient.ListAIProvidersPB(syncCtx)
	if err != nil {
		log.Warn("não foi possível obter ai_providers do PocketBase", "err", err)
	} else {
		for _, p := range providers {
			_ = store.upsertAIProvider(syncCtx, p)
		}
		log.Info("provedores de IA hidratados do PocketBase", "count", len(providers))
	}

	// 5. Hidratar Contatos do CRM
	contacts, err := pbClient.ListContactsPB(syncCtx, "", "")
	if err != nil {
		log.Warn("não foi possível obter contatos do PocketBase", "err", err)
	} else {
		for _, c := range contacts {
			_, _ = store.db.ExecContext(syncCtx, `
				INSERT INTO contacts (session_id, phone, name, email, company, notes, avatar_url, lid, jid, tags, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
				ON CONFLICT (session_id, phone) DO UPDATE SET
					name = excluded.name,
					email = excluded.email,
					company = excluded.company,
					notes = excluded.notes,
					avatar_url = excluded.avatar_url,
					lid = excluded.lid,
					jid = excluded.jid,
					tags = excluded.tags,
					updated_at = CURRENT_TIMESTAMP
			`, c.SessionID, c.Phone, c.Name, c.Email, c.Company, c.Notes, c.AvatarURL, c.LID, c.JID, c.Tags)
		}
		log.Info("contatos do CRM hidratados do PocketBase", "count", len(contacts))
	}

	log.Info("hidratação do PocketBase concluída com sucesso!")
}

// pushAllLocalToPocketBase envia todos os dados presentes no SQLite local para o PocketBase
// Usado na inicialização e via endpoint manual para migrar dados pré-existentes da VPS para o PocketBase
func pushAllLocalToPocketBase(ctx context.Context, store *sessionStore) {
	if store == nil || store.db == nil {
		return
	}
	log := slog.Default().With("module", "PocketBasePush")

	goSafe(log, func() {
		time.Sleep(2 * time.Second) // Aguarda PocketBase inicializar
		pushCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// 1. Push Projetos locais
		pRows, err := store.db.QueryContext(pushCtx, `SELECT id, name, plan, plan_status, plan_starts_at, plan_ends_at FROM projects`)
		if err == nil {
			defer pRows.Close()
			for pRows.Next() {
				var id, name, plan, planStatus string
				var startStr string
				var endStr *string
				if err := pRows.Scan(&id, &name, &plan, &planStatus, &startStr, &endStr); err == nil {
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
					_ = pbClient.UpsertProjectPB(pushCtx, id, name, plan, planStatus, start, end)
				}
			}
		}

		// 2. Push Sessões locais (Conexões)
		sRows, err := store.db.QueryContext(pushCtx, `SELECT id, name, COALESCE(jid,''), COALESCE(webhook,''), COALESCE(chatwoot,''), COALESCE(ai_config,''), COALESCE(project_id,'default'), COALESCE(api_key,'') FROM sessions`)
		if err == nil {
			defer sRows.Close()
			for sRows.Next() {
				var id, name, jid, webhook, chatwoot, aiConfig, projectID, apiKey string
				if err := sRows.Scan(&id, &name, &jid, &webhook, &chatwoot, &aiConfig, &projectID, &apiKey); err == nil {
					_ = pbClient.UpsertSessionPB(pushCtx, id, name, jid, webhook, chatwoot, aiConfig, projectID, apiKey)
				}
			}
		}

		// 3. Push Agentes locais
		aRows, err := store.db.QueryContext(pushCtx, `SELECT id, session_id, name, COALESCE(description,''), ai_config, inbound, outbound FROM agents`)
		if err == nil {
			defer aRows.Close()
			for aRows.Next() {
				var id, sessionID, name, description, aiConfig string
				var inbound, outbound bool
				if err := aRows.Scan(&id, &sessionID, &name, &description, &aiConfig, &inbound, &outbound); err == nil {
					if _, err := pbClient.CreateAgentPB(pushCtx, id, sessionID, name, description, aiConfig, inbound, outbound); err != nil {
						_ = pbClient.UpdateAgentPB(pushCtx, id, name, description, aiConfig, inbound, outbound)
					}
				}
			}
		}

		// 4. Push Provedores de IA locais
		providers, err := store.listAIProviders(pushCtx, "")
		if err == nil {
			for _, p := range providers {
				_ = pbClient.UpsertAIProviderPB(pushCtx, p)
			}
		}

		// 5. Push Contatos do CRM locais
		cRows, err := store.db.QueryContext(pushCtx, `SELECT id, session_id, phone, name, email, company, notes, avatar_url, lid, jid, tags FROM contacts`)
		if err == nil {
			defer cRows.Close()
			for cRows.Next() {
				var rec ContactRecord
				if err := cRows.Scan(&rec.ID, &rec.SessionID, &rec.Phone, &rec.Name, &rec.Email, &rec.Company, &rec.Notes, &rec.AvatarURL, &rec.LID, &rec.JID, &rec.Tags); err == nil {
					_ = pbClient.UpsertContactPB(pushCtx, rec)
				}
			}
		}

		log.Info("sincronização de dados locais para o PocketBase concluída")
	})
}

// --- REALTIME LISTENER (SSE /api/realtime) ---

type pbRealtimeMessage struct {
	Action string         `json:"action"`
	Record map[string]any `json:"record"`
}

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
					log.Warn("leitura SSE interrompida, reconectando...", "err", err)
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

							// Enviar subscrição para as coleções desejadas
							subPayload, _ := json.Marshal(map[string]any{
								"clientId": clientID,
								"subscriptions": []string{
									"projects/*",
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

					// Processamento de eventos das coleções
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
	if store == nil || store.db == nil {
		return
	}

	log := slog.Default().With("module", "PocketBaseSync", "event", eventName, "action", msg.Action)

	// Extrair o nome da coleção a partir do eventName (ex: "agents/xyz" -> "agents" ou "agents")
	collection := eventName
	if idx := strings.Index(collection, "/"); idx != -1 {
		collection = collection[:idx]
	}

	recordID, _ := msg.Record["id"].(string)

	switch collection {
	case "projects":
		if msg.Action == "delete" {
			_, _ = store.db.ExecContext(ctx, `DELETE FROM projects WHERE id = $1`, recordID)
		} else {
			name, _ := msg.Record["name"].(string)
			plan, _ := msg.Record["plan"].(string)
			planStatus, _ := msg.Record["plan_status"].(string)
			startStr, _ := msg.Record["plan_starts_at"].(string)
			endStr, _ := msg.Record["plan_ends_at"].(string)

			startsAt, _ := time.Parse(time.RFC3339, startStr)
			if startsAt.IsZero() {
				startsAt = time.Now()
			}
			var endsAt *time.Time
			if endStr != "" {
				if t, err := time.Parse(time.RFC3339, endStr); err == nil {
					endsAt = &t
				}
			}

			_, _ = store.db.ExecContext(ctx, `
				INSERT INTO projects (id, name, plan, plan_status, plan_starts_at, plan_ends_at)
				VALUES ($1, $2, $3, $4, $5, $6)
				ON CONFLICT (id) DO UPDATE SET
					name = excluded.name,
					plan = excluded.plan,
					plan_status = excluded.plan_status,
					plan_starts_at = excluded.plan_starts_at,
					plan_ends_at = excluded.plan_ends_at
			`, recordID, name, plan, planStatus, startsAt, endsAt)
		}

	case "sessions":
		sid, _ := msg.Record["sid"].(string)
		if sid == "" {
			sid = recordID
		}

		if msg.Action == "delete" {
			_, _ = store.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = $1`, sid)
			if sessionMgr != nil {
				_ = sessionMgr.Delete(ctx, sid)
			}
		} else {
			name, _ := msg.Record["name"].(string)
			jid, _ := msg.Record["jid"].(string)
			webhook, _ := msg.Record["webhook"].(string)
			projectID, _ := msg.Record["project_id"].(string)
			apiKey, _ := msg.Record["api_key"].(string)

			var cwStr, aiStr string
			if cw := msg.Record["chatwoot"]; cw != nil {
				if s, ok := cw.(string); ok {
					cwStr = s
				} else {
					b, _ := json.Marshal(cw)
					cwStr = string(b)
				}
			}
			if ai := msg.Record["ai_config"]; ai != nil {
				if s, ok := ai.(string); ok {
					aiStr = s
				} else {
					b, _ := json.Marshal(ai)
					aiStr = string(b)
				}
			}

			_, _ = store.db.ExecContext(ctx, `
				INSERT INTO sessions (id, name, jid, webhook, chatwoot, ai_config, project_id, api_key)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				ON CONFLICT (id) DO UPDATE SET
					name = excluded.name,
					jid = excluded.jid,
					webhook = excluded.webhook,
					chatwoot = excluded.chatwoot,
					ai_config = excluded.ai_config,
					project_id = excluded.project_id,
					api_key = excluded.api_key
			`, sid, name, jid, webhook, cwStr, aiStr, projectID, apiKey)

			if sessionMgr != nil {
				if sess, exists := sessionMgr.Get(sid); exists {
					sess.mu.Lock()
					sess.name = name
					sess.projectID = projectID
					sess.apiKey = apiKey
					sess.webhook = webhook
					if cwStr != "" {
						var cw ChatwootConfig
						_ = json.Unmarshal([]byte(cwStr), &cw)
						sess.chatwoot = cw
					}
					if aiStr != "" {
						var aiCfg AIConfig
						_ = json.Unmarshal([]byte(aiStr), &aiCfg)
						sess.aiConfig = aiCfg
					}
					sess.mu.Unlock()
				} else {
					sess := newSession(sessionMgr, sid, name, projectID, apiKey, nil)
					sess.setWebhook(webhook)
					if cwStr != "" {
						var cw ChatwootConfig
						if json.Unmarshal([]byte(cwStr), &cw) == nil {
							sess.setChatwoot(cw)
						}
					}
					if aiStr != "" {
						var aiCfg AIConfig
						if json.Unmarshal([]byte(aiStr), &aiCfg) == nil {
							sess.setAIConfig(aiCfg)
						}
					}
					sessionMgr.register(sess)
				}
				sessionMgr.broker.emitSessionList(sessionMgr.infos())
			}
		}

	case "agents":
		if msg.Action == "delete" {
			_, _ = store.db.ExecContext(ctx, `DELETE FROM agents WHERE id = $1`, recordID)
		} else {
			sessionID, _ := msg.Record["session_id"].(string)
			name, _ := msg.Record["name"].(string)
			desc, _ := msg.Record["description"].(string)
			inbound, _ := msg.Record["inbound"].(bool)
			outbound, _ := msg.Record["outbound"].(bool)

			var aiStr string
			if ai := msg.Record["ai_config"]; ai != nil {
				if s, ok := ai.(string); ok {
					aiStr = s
				} else {
					b, _ := json.Marshal(ai)
					aiStr = string(b)
				}
			}

			_, _ = store.db.ExecContext(ctx, `
				INSERT INTO agents (id, session_id, name, description, ai_config, inbound, outbound)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				ON CONFLICT (id) DO UPDATE SET
					session_id = excluded.session_id,
					name = excluded.name,
					description = excluded.description,
					ai_config = excluded.ai_config,
					inbound = excluded.inbound,
					outbound = excluded.outbound
			`, recordID, sessionID, name, desc, aiStr, inbound, outbound)
		}

	case "ai_providers":
		projectID, _ := msg.Record["project_id"].(string)
		provider, _ := msg.Record["provider"].(string)
		encryptedKey, _ := msg.Record["encrypted_api_key"].(string)
		enabled, _ := msg.Record["enabled"].(bool)
		defaultModel, _ := msg.Record["default_model"].(string)

		var optStr string
		if opt := msg.Record["options_json"]; opt != nil {
			if s, ok := opt.(string); ok {
				optStr = s
			} else {
				b, _ := json.Marshal(opt)
				optStr = string(b)
			}
		}
		if optStr == "" {
			optStr = "{}"
		}

		_ = store.upsertAIProvider(ctx, aiProviderRow{
			ProjectID:       projectID,
			Provider:        provider,
			EncryptedAPIKey: encryptedKey,
			Enabled:         enabled,
			DefaultModel:    defaultModel,
			OptionsJSON:     optStr,
		})

	case "contacts":
		if msg.Action == "delete" {
			phone, _ := msg.Record["phone"].(string)
			sessionID, _ := msg.Record["session_id"].(string)
			if phone != "" && sessionID != "" {
				_, _ = store.db.ExecContext(ctx, `DELETE FROM contacts WHERE session_id = $1 AND phone = $2`, sessionID, phone)
			}
		} else {
			sessionID, _ := msg.Record["session_id"].(string)
			phone, _ := msg.Record["phone"].(string)
			name, _ := msg.Record["name"].(string)
			email, _ := msg.Record["email"].(string)
			company, _ := msg.Record["company"].(string)
			notes, _ := msg.Record["notes"].(string)
			avatarURL, _ := msg.Record["avatar_url"].(string)
			lid, _ := msg.Record["lid"].(string)
			jid, _ := msg.Record["jid"].(string)

			var tagsStr string
			if t := msg.Record["tags"]; t != nil {
				if s, ok := t.(string); ok {
					tagsStr = s
				} else {
					b, _ := json.Marshal(t)
					tagsStr = string(b)
				}
			}

			_, _ = store.db.ExecContext(ctx, `
				INSERT INTO contacts (session_id, phone, name, email, company, notes, avatar_url, lid, jid, tags, updated_at)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
				ON CONFLICT (session_id, phone) DO UPDATE SET
					name = excluded.name,
					email = excluded.email,
					company = excluded.company,
					notes = excluded.notes,
					avatar_url = excluded.avatar_url,
					lid = excluded.lid,
					jid = excluded.jid,
					tags = excluded.tags,
					updated_at = CURRENT_TIMESTAMP
			`, sessionID, phone, name, email, company, notes, avatarURL, lid, jid, tagsStr)
		}
	}

	if broker != nil {
		broker.broadcast(map[string]any{
			"type":       "pocketbase-sync",
			"collection": collection,
			"action":     msg.Action,
			"recordId":   recordID,
		})
	}
	log.Debug("registro sincronizado com SQLite local via SSE", "collection", collection, "recordId", recordID)
}
