package main

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"go.mau.fi/whatsmeow/store"
	waLog "go.mau.fi/whatsmeow/util/log"
)

type server struct {
	db        *dbProvider
	mainDB    *sql.DB
	broker    *Broker
	sessions  *SessionManager
	scheduler *AIScheduler
	queue     *QueueManager
	log       *slog.Logger
	staticDir string
	tickets   *ticketStore
	startedAt time.Time
}

// newServer monta o provedor de banco SQLite e whatsmeow, inicializa o Redis Queue,
// abre a base local e inicia o gerenciador de sessões.
func newServer(ctx context.Context, storageDir, redisURL, staticDir string, maxCalls int, log *slog.Logger) (*server, error) {
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

	queue := NewQueueManager(ctx, redisURL, log)
	broker := NewBroker()
	mgr := newSessionManager(ctx, provider, broker, sStore, waLogger, log, maxCalls)
	mgr.Queue = queue
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

	return &server{
		db:        provider,
		mainDB:    mainDB,
		broker:    broker,
		sessions:  mgr,
		scheduler: scheduler,
		queue:     queue,
		log:       log,
		staticDir: staticDir,
		tickets:   newTicketStore(),
		startedAt: time.Now(),
	}, nil
}

func (s *server) Close() {
	if s.queue != nil {
		s.queue.Close()
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
