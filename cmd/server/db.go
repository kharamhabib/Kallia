package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"sync"

	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
	_ "modernc.org/sqlite" // driver "sqlite"
)

// dbProvider gerencia o storage das sessões do whatsmeow em SQLite puro isolado por sessão
// em `./storage/whatsapp/<id>.db` e a base local `./storage/kallia_main.db`.
type dbProvider struct {
	storageDir string
	waLogger   waLog.Logger
	log        *slog.Logger
	mu         sync.Mutex
}

// newDBProvider inicializa o diretório de armazenamento e valida permissões de escrita.
func newDBProvider(ctx context.Context, storageDir string, waLogger waLog.Logger, log *slog.Logger) (*dbProvider, error) {
	if storageDir == "" {
		storageDir = "./storage"
	}
	waDir := filepath.Join(storageDir, "whatsapp")
	if err := os.MkdirAll(waDir, 0755); err != nil {
		return nil, fmt.Errorf("criar diretório de storage whatsapp (%s): %w", waDir, err)
	}

	recordingsDir := filepath.Join(storageDir, "recordings")
	if err := os.MkdirAll(recordingsDir, 0755); err != nil {
		return nil, fmt.Errorf("criar diretório de gravações (%s): %w", recordingsDir, err)
	}

	p := &dbProvider{
		storageDir: storageDir,
		waLogger:   waLogger,
		log:        log,
	}
	return p, nil
}

func (p *dbProvider) sessionDBPath(id string) string {
	return filepath.Join(p.storageDir, "whatsapp", id+".db")
}

func (p *dbProvider) mainDBPath() string {
	return filepath.Join(p.storageDir, "kallia_main.db")
}

// openMainDB abre o banco principal local em SQLite com WAL mode ativo.
func (p *dbProvider) openMainDB(ctx context.Context) (*sql.DB, error) {
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)", p.mainDBPath())
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("abrir banco principal SQLite: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping banco principal SQLite: %w", err)
	}
	return db, nil
}

// openSessionContainer inicializa ou abre o banco SQLite da sessão whatsmeow.
func (p *dbProvider) openSessionContainer(ctx context.Context, id string) (*sqlstore.Container, *sql.DB, error) {
	p.mu.Lock()
	defer p.mu.Unlock()

	dbPath := p.sessionDBPath(id)
	dsn := fmt.Sprintf("file:%s?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)", dbPath)

	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, nil, fmt.Errorf("abrir banco whatsmeow SQLite: %w", err)
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, nil, fmt.Errorf("ping banco whatsmeow SQLite: %w", err)
	}

	container := sqlstore.NewWithDB(db, "sqlite", p.waLogger)
	if err := container.Upgrade(ctx); err != nil {
		_ = db.Close()
		return nil, nil, fmt.Errorf("migrar schema whatsmeow da sessão %s: %w", id, err)
	}

	return container, db, nil
}

// dropSessionDB remove o arquivo SQLite da sessão e seus arquivos temporários de log WAL.
func (p *dbProvider) dropSessionDB(ctx context.Context, id string) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	base := p.sessionDBPath(id)
	_ = os.Remove(base)
	_ = os.Remove(base + "-wal")
	_ = os.Remove(base + "-shm")
	p.log.Info("banco SQLite de sessão removido", "session", id)
	return nil
}

func (p *dbProvider) close() {}
