package main

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/types"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type server struct {
	db        *dbProvider
	mainDB    *sql.DB
	pg        *pgPool
	hub       *RealtimeHub
	broker    *Broker
	sessions  *SessionManager
	scheduler *AIScheduler
	queue     *QueueManager
	log       *slog.Logger
	staticDir string
	tickets   *ticketStore
	debounce  *ChatDebounceManager
	startedAt time.Time
}

// newServer monta o provedor de banco SQLite e whatsmeow, inicializa o Redis Queue,
// abre a base local, conecta o PostgreSQL (se configurado) e inicia o gerenciador de sessões.
func newServer(ctx context.Context, storageDir, redisURL, pgURL, staticDir string, maxCalls int, log *slog.Logger) (*server, error) {
	store.SetOSInfo("Kallia Call", [3]uint32{1, 0, 0})
	waLogger := waLog.Noop
	if log.Enabled(ctx, slog.LevelDebug) {
		waLogger = waLog.Stdout("WA", "DEBUG", true)
	}

	provider, err := newDBProvider(ctx, storageDir, waLogger, log)
	if err != nil {
		return nil, err
	}

	mainDB, err := provider.openMainDB(ctx)
	if err != nil {
		provider.close()
		return nil, err
	}
	sStore, err := newSessionStore(ctx, mainDB)
	if err != nil {
		mainDB.Close()
		provider.close()
		return nil, err
	}

	// PostgreSQL (módulo omnichannel) — opcional, nil se não configurado
	pg, err := newPGPool(ctx, pgURL, log)
	if err != nil {
		log.Error("falha ao conectar PostgreSQL — módulo omnichannel indisponível", "err", err)
		// Não é fatal: o sistema continua funcionando sem o módulo omnichannel
		pg = nil
	}

	// Executa migração automática dos contatos legados para o PostgreSQL
	if pg != nil && pg.DB() != nil {
		go pgMigrateLegacyContacts(ctx, pg.DB(), sStore, log)
	}

	queue := NewQueueManager(ctx, redisURL, log)

	var rdb *redis.Client
	if queue != nil && !queue.inMemory {
		rdb = queue.rdb
	}
	hub := NewRealtimeHub(ctx, rdb, log)

	broker := NewBroker()
	mgr := newSessionManager(ctx, provider, broker, sStore, waLogger, log, maxCalls)
	mgr.Queue = queue
	mgr.PG = pg
	mgr.Hub = hub
	broker.SnapshotFn = mgr.snapshotEvents
	broker.History = &pgHistoryPersister{store: sStore, log: log}
	scheduler := NewAIScheduler(mgr, log)
	mgr.Scheduler = scheduler
	getSession := func(sessionID string) *Session {
		s, _ := mgr.Get(sessionID)
		return s
	}
	mgr.nps = newNPSEngine(log, sStore, getSession)
	mgr.followup = newFollowupEngine(log, getSession)

	// Motor de Debounce e Humanização do Agente de Chat (WhatsApp)
	mgr.Debounce = newChatDebounceManager(3*time.Second, func(ctx context.Context, wid, convID, sid, phone string, msgs []QueuedChatMessage) {
		if pg == nil || pg.DB() == nil {
			return
		}
		goSafe(log, func() {
			if err := executeChatAgentTurn(ctx, pg.DB(), hub, mgr, wid, convID, sid, phone, msgs); err != nil {
				log.Error("falha ao processar resposta do agente de chat", "err", err, "conv_id", convID, "workspace_id", wid)
			}
		})
	})

	hub.OnPresenceUpdate = func(workspaceID, convID, state, mediaType string) {
		if pg == nil || pg.DB() == nil {
			return
		}
		var phone, sessionID string
		err := pg.DB().QueryRow(
			`SELECT COALESCE(ct.phone, ''), COALESCE(inb.session_id, '')
			 FROM conversations c
			 LEFT JOIN contacts ct ON ct.id = c.contact_id
			 LEFT JOIN inboxes inb ON inb.id = c.inbox_id
			 WHERE c.id = $1 AND c.workspace_id = $2`,
			convID, workspaceID,
		).Scan(&phone, &sessionID)
		if err != nil || phone == "" {
			return
		}

		var sess *Session
		if sessionID != "" {
			sess, _ = mgr.Get(sessionID)
		}
		if sess == nil || sess.getClient() == nil {
			for _, info := range mgr.infos() {
				if info.WorkspaceID == workspaceID && info.State == "open" {
					sess, _ = mgr.Get(info.ID)
					break
				}
			}
		}
		if sess == nil || sess.getClient() == nil {
			return
		}

		chatJID, err := resolveRecipient(phone)
		if err != nil {
			return
		}

		presence := types.ChatPresencePaused
		if state == "composing" {
			presence = types.ChatPresenceComposing
		}
		media := types.ChatPresenceMediaText
		if mediaType == "audio" {
			media = types.ChatPresenceMediaAudio
		}

		_ = sess.getClient().SendChatPresence(ctx, chatJID, presence, media)
	}

	return &server{
		db:        provider,
		mainDB:    mainDB,
		pg:        pg,
		hub:       hub,
		broker:    broker,
		sessions:  mgr,
		scheduler: scheduler,
		queue:     queue,
		log:       log,
		staticDir: staticDir,
		tickets:   newTicketStore(),
		debounce:  mgr.Debounce,
		startedAt: time.Now(),
	}, nil
}

func (s *server) Close() {
	if s.hub != nil {
		s.hub.Close()
	}
	if s.queue != nil {
		s.queue.Close()
	}
	if s.pg != nil {
		s.pg.Close()
	}
	if s.mainDB != nil {
		_ = s.mainDB.Close()
	}
	if s.db != nil {
		s.db.close()
	}
}

// hydrateHistory carrega o histórico de chamadas persistido para o cache em memória do broker.
func (s *server) hydrateHistory(ctx context.Context) {
	loaded := 0
	for _, info := range s.sessions.infos() {
		recs, err := s.sessions.store.listCallHistory(ctx, info.ID, 100)
		if err != nil {
			s.log.Warn("falha ao hidratar histórico de chamadas", "session", info.ID, "err", err)
			continue
		}
		if len(recs) > 0 {
			s.broker.loadHistory(recs)
			loaded += len(recs)
		}
	}
	if loaded > 0 {
		s.log.Info("histórico de chamadas hidratado", "registros", loaded)
	}
}
