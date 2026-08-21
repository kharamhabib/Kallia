package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type SessionManager struct {
	appCtx   context.Context
	db       *dbProvider
	broker   *Broker
	store    *sessionStore
	waLogger waLog.Logger
	log      *slog.Logger
	maxCalls int
	Scheduler *AIScheduler
	Queue     *QueueManager
	nps       *NPSEngine
	followup  *FollowupEngine

	mu       sync.RWMutex
	sessions map[string]*Session
	order    []string
}

func newSessionManager(ctx context.Context, db *dbProvider, broker *Broker, store *sessionStore, waLogger waLog.Logger, log *slog.Logger, maxCalls int) *SessionManager {
	return &SessionManager{
		appCtx:   ctx,
		db:       db,
		broker:   broker,
		store:    store,
		waLogger: waLogger,
		log:      log,
		maxCalls: maxCalls,
		sessions: map[string]*Session{},
	}
}

func (m *SessionManager) register(s *Session) {
	m.mu.Lock()
	m.sessions[s.id] = s
	m.order = append(m.order, s.id)
	m.mu.Unlock()
}

func (m *SessionManager) unregister(id string) {
	m.mu.Lock()
	delete(m.sessions, id)
	for i, x := range m.order {
		if x == id {
			m.order = append(m.order[:i], m.order[i+1:]...)
			break
		}
	}
	m.mu.Unlock()
}

func (m *SessionManager) sessionForChatwootAccount(accountID int) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, s := range m.sessions {
		if c := s.getChatwoot(); c.valid() && c.AccountID == accountID {
			return s
		}
	}
	return nil
}

// sessionForChatwootInbox: sessão amarrada à conta E à caixa (inbox) específica.
// Usada para que o widget só apareça/ligue na caixa que tem WhatsApp conectado.
func (m *SessionManager) sessionForChatwootInbox(accountID, inboxID int) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, s := range m.sessions {
		if c := s.getChatwoot(); c.valid() && c.AccountID == accountID && c.InboxID == inboxID {
			return s
		}
	}
	return nil
}

func (m *SessionManager) Get(id string) (*Session, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	return s, ok
}

func (m *SessionManager) infos() []SessionInfo {
	m.mu.RLock()
	ordered := make([]*Session, 0, len(m.order))
	for _, id := range m.order {
		if s, ok := m.sessions[id]; ok {
			ordered = append(ordered, s)
		}
	}
	m.mu.RUnlock()
	out := make([]SessionInfo, 0, len(ordered))
	for _, s := range ordered {
		out = append(out, s.info())
	}
	return out
}

func (m *SessionManager) snapshotEvents() []any {
	return []any{map[string]any{"type": "session-list", "sessions": m.infos()}}
}

func (m *SessionManager) Restore(ctx context.Context) error {
	rows, err := m.store.listAll(ctx)
	if err != nil || len(rows) == 0 {
		pbSessions, pbErr := pbClient.ListSessionsPB(ctx)
		if pbErr == nil && len(pbSessions) > 0 {
			for _, ps := range pbSessions {
				_ = m.store.insert(ctx, ps.ID, ps.Name, ps.ProjectID, ps.APIKey)
				if ps.Webhook != "" {
					_ = m.store.setWebhook(ctx, ps.ID, ps.Webhook)
				}
				if ps.Chatwoot != "" {
					_ = m.store.setChatwoot(ctx, ps.ID, ps.Chatwoot)
				}
				if ps.AIConfig != "" {
					_ = m.store.setAIConfig(ctx, ps.ID, ps.AIConfig)
				}
			}
			rows, _ = m.store.listAll(ctx)
		}
	}
	for _, row := range rows {
		var client *whatsmeow.Client
		var container *sqlstore.Container
		var db *sql.DB

		if row.JID != "" {
			if _, err := types.ParseJID(row.JID); err == nil {
				c, d, err := m.db.openSessionContainer(ctx, row.ID)
				if err == nil {
					container = c
					db = d
					device, err := container.GetFirstDevice(ctx)
					if err == nil && device != nil && device.ID != nil {
						client = whatsmeow.NewClient(device, m.waLogger)
						client.ManualHistorySyncDownload = true
					}
				}
			}
		}

		s := newSession(m, row.ID, row.Name, row.ProjectID, row.APIKey, client)
		s.waContainer = container
		s.waDB = db
		s.setWebhook(row.Webhook)
		if row.Chatwoot != "" {
			var cfg ChatwootConfig
			if json.Unmarshal([]byte(row.Chatwoot), &cfg) == nil {
				s.setChatwoot(cfg)
			}
		}
		if row.AIConfig != "" {
			var cfg AIConfig
			if json.Unmarshal([]byte(row.AIConfig), &cfg) == nil {
				s.setAIConfig(cfg)
			}
		}
		m.register(s)

		if client != nil {
			if err := s.connect(ctx); err != nil {
				m.log.Warn("session connect failed", "session", row.ID, "err", err)
			}
		} else {
			s.setAuth(AuthSnapshot{State: "disconnected"})
		}
	}
	m.broker.emitSessionList(m.infos())
	m.log.Info("sessions restored", "count", len(m.infos()))
	return nil
}

func (m *SessionManager) Create(name, projectID string) (string, string, error) {
	id := newSessionID()
	// Gerar chave de API específica da conexão
	apiKeyBytes := make([]byte, 16)
	_, _ = rand.Read(apiKeyBytes)
	apiKey := "kc_" + hex.EncodeToString(apiKeyBytes)

	if err := m.store.insert(m.appCtx, id, name, projectID, apiKey); err != nil {
		return "", "", err
	}

	container, db, err := m.db.openSessionContainer(m.appCtx, id)
	if err != nil {
		_ = m.store.delete(m.appCtx, id)
		_ = m.db.dropSessionDB(m.appCtx, id)
		return "", "", fmt.Errorf("create session store: %w", err)
	}
	device := container.NewDevice()
	client := whatsmeow.NewClient(device, m.waLogger)
	client.ManualHistorySyncDownload = true
	s := newSession(m, id, name, projectID, apiKey, client)
	s.waContainer = container
	s.waDB = db
	m.register(s)
	m.broker.emitSessionList(m.infos())
	if err := s.startPairing(m.appCtx); err != nil {
		m.log.Error("start pairing failed", "session", id, "err", err)
		return "", "", fmt.Errorf("start pairing: %w", err)
	}
	m.log.Info("session created", "session", id, "name", name)
	return id, apiKey, nil
}

func (m *SessionManager) Rename(ctx context.Context, id, name string) error {
	s, ok := m.Get(id)
	if !ok {
		return fmt.Errorf("no session %s", id)
	}
	if err := m.store.setName(ctx, id, name); err != nil {
		return err
	}
	s.mu.Lock()
	s.name = name
	projectID := s.projectID
	apiKey := s.apiKey
	webhook := s.webhook
	jid := ""
	if client := s.getClient(); client != nil && client.Store != nil && client.Store.ID != nil {
		jid = client.Store.ID.String()
	}
	s.mu.Unlock()

	syncSessionToPB(id, name, jid, webhook, "", "", projectID, apiKey)
	m.broker.emitSessionList(m.infos())
	return nil
}

func (m *SessionManager) RotateAPIKey(ctx context.Context, id, customKey string) (string, error) {
	s, ok := m.Get(id)
	if !ok {
		return "", fmt.Errorf("no session %s", id)
	}
	newKey := strings.TrimSpace(customKey)
	if newKey == "" {
		newKey = "kc_" + newSessionID()
	}
	if err := m.store.setAPIKey(ctx, id, newKey); err != nil {
		return "", fmt.Errorf("salvar nova chave de api: %w", err)
	}
	s.setAPIKey(newKey)
	m.broker.emitSessionList(m.infos())
	m.log.Info("session api key rotated", "session", id)
	return newKey, nil
}

func (m *SessionManager) Delete(ctx context.Context, id string) error {
	s, ok := m.Get(id)
	if ok {
		if client := s.getClient(); client != nil {
			if client.Store != nil && client.Store.ID != nil {
				if err := client.Logout(ctx); err != nil {
					m.log.Warn("logout failed; deleting locally", "session", id, "err", err)
				}
			}
			client.Disconnect()
		}
		s.teardownAllCalls()
		// o store da sessão é um banco inteiro só dela: fecha a conexão e derruba.
		if s.waDB != nil {
			_ = s.waDB.Close()
		}
		if err := m.db.dropSessionDB(ctx, id); err != nil {
			m.log.Warn("drop session database failed", "session", id, "err", err)
		}
		m.unregister(id)
	}

	// Deleta incondicionalmente dos dois bancos de dados (SQLite e PocketBase)
	_ = m.store.delete(ctx, id)
	syncDeleteSessionToPB(id)
	m.broker.emitSessionList(m.infos())
	m.log.Info("session deleted across sqlite and pocketbase", "session", id)
	return nil
}

func (m *SessionManager) Logout(ctx context.Context, id string) error {
	s, ok := m.Get(id)
	if !ok {
		return fmt.Errorf("no session %s", id)
	}
	if client := s.getClient(); client != nil {
		if client.Store != nil && client.Store.ID != nil {
			if err := client.Logout(ctx); err != nil {
				m.log.Warn("logout failed", "session", id, "err", err)
			}
		}
	}
	if s.waContainer != nil {
		cli := whatsmeow.NewClient(s.waContainer.NewDevice(), m.waLogger)
		cli.ManualHistorySyncDownload = true
		s.replaceClient(cli)
	}
	s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
	_ = m.store.setJID(ctx, id, "")
	s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
	m.log.Info("session disconnected", "session", id)
	return nil
}

func (m *SessionManager) Pair(id string) error {
	s, ok := m.Get(id)
	if !ok {
		return fmt.Errorf("no session %s", id)
	}
	if s.getClient().Store.ID != nil {
		return fmt.Errorf("session already paired")
	}
	cli := whatsmeow.NewClient(s.waContainer.NewDevice(), m.waLogger)
	cli.ManualHistorySyncDownload = true
	s.replaceClient(cli)
	if err := s.startPairing(m.appCtx); err != nil {
		return fmt.Errorf("start pairing: %w", err)
	}
	m.broker.emitSessionList(m.infos())
	m.log.Info("session re-pairing", "session", id)
	return nil
}

func (m *SessionManager) disconnectAll() {
	m.mu.RLock()
	all := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		all = append(all, s)
	}
	m.mu.RUnlock()
	for _, s := range all {
		s.shutdown()
	}
}
