package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq" // driver PostgreSQL
)

// pgPool gerencia a conexão com o PostgreSQL e executa auto-migrations.
type pgPool struct {
	db  *sql.DB
	log *slog.Logger
	mu  sync.RWMutex
}

// newPGPool abre a conexão com o PostgreSQL e executa as migrations.
// Se pgURL estiver vazia, retorna nil (modo sem Postgres — legado).
func newPGPool(ctx context.Context, pgURL string, log *slog.Logger) (*pgPool, error) {
	if pgURL == "" {
		log.Warn("KALLIA_PG_URL não definida — módulo omnichannel desabilitado (sem PostgreSQL)")
		return nil, nil
	}

	db, err := sql.Open("postgres", pgURL)
	if err != nil {
		return nil, fmt.Errorf("abrir conexão PostgreSQL: %w", err)
	}

	// Pool settings adequados para Go + PG
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(2 * time.Minute)

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping PostgreSQL: %w", err)
	}

	p := &pgPool{db: db, log: log}

	if err := p.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("migrations PostgreSQL: %w", err)
	}

	log.Info("PostgreSQL conectado e migrado com sucesso")
	return p, nil
}

// DB retorna a conexão *sql.DB do pool (thread-safe).
func (p *pgPool) DB() *sql.DB {
	if p == nil {
		return nil
	}
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.db
}

// Close encerra o pool de conexão.
func (p *pgPool) Close() {
	if p == nil || p.db == nil {
		return
	}
	_ = p.db.Close()
}

// migrate executa as migrations DDL idempotentes em ordem.
func (p *pgPool) migrate(ctx context.Context) error {
	// Tenta habilitar pgvector — ignora erro se extensão não instalada
	_, _ = p.db.ExecContext(ctx, "CREATE EXTENSION IF NOT EXISTS vector")
	_, _ = p.db.ExecContext(ctx, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)

	for i, ddl := range pgMigrations {
		if _, err := p.db.ExecContext(ctx, ddl); err != nil {
			return fmt.Errorf("migration %d: %w", i, err)
		}
	}

	// Garante partições de mensagens para o mês corrente e o próximo
	if err := p.ensureMessagePartitions(ctx); err != nil {
		p.log.Warn("falha ao criar partições de mensagens", "err", err)
	}

	return nil
}

// ensureMessagePartitions cria partições para o mês atual e o próximo.
func (p *pgPool) ensureMessagePartitions(ctx context.Context) error {
	now := time.Now()
	months := []time.Time{
		time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC),
		time.Date(now.Year(), now.Month()+1, 1, 0, 0, 0, 0, time.UTC),
	}
	for _, m := range months {
		next := m.AddDate(0, 1, 0)
		name := fmt.Sprintf("messages_%d_%02d", m.Year(), m.Month())
		ddl := fmt.Sprintf(
			`CREATE TABLE IF NOT EXISTS %s PARTITION OF messages FOR VALUES FROM ('%s') TO ('%s')`,
			name,
			m.Format("2006-01-02"),
			next.Format("2006-01-02"),
		)
		if _, err := p.db.ExecContext(ctx, ddl); err != nil {
			// Ignora se já existe
			if !strings.Contains(err.Error(), "already exists") {
				return fmt.Errorf("criar partição %s: %w", name, err)
			}
		}
	}
	return nil
}

// pgMigrations contém os DDLs idempotentes executados em ordem na inicialização.
var pgMigrations = []string{
	// ── Inboxes (canais conectados) ────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS inboxes (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id  TEXT NOT NULL,
		channel_type  TEXT NOT NULL,
		name          TEXT NOT NULL,
		channel_config JSONB DEFAULT '{}',
		session_id    TEXT,
		active        BOOLEAN DEFAULT true,
		created_at    TIMESTAMPTZ DEFAULT now()
	)`,

	// ── Contatos unificados cross-canal ────────────────────────────────
	`CREATE TABLE IF NOT EXISTS contacts (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id  TEXT NOT NULL,
		name          TEXT,
		phone         TEXT,
		email         TEXT,
		instagram_id  TEXT,
		telegram_id   TEXT,
		avatar_url    TEXT,
		custom_attrs  JSONB DEFAULT '{}',
		created_at    TIMESTAMPTZ DEFAULT now(),
		updated_at    TIMESTAMPTZ DEFAULT now()
	)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_ws_phone ON contacts(workspace_id, phone) WHERE phone IS NOT NULL AND phone != ''`,
	`CREATE INDEX IF NOT EXISTS idx_contacts_ws ON contacts(workspace_id)`,

	// ── Tags reutilizáveis ─────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS tags (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id  TEXT NOT NULL,
		name          TEXT NOT NULL,
		color         TEXT DEFAULT '#6366f1',
		scope         TEXT NOT NULL DEFAULT 'both',
		created_at    TIMESTAMPTZ DEFAULT now()
	)`,
	`CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_ws_name ON tags(workspace_id, name)`,

	// ── Relação N:N contato ↔ tag ──────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS contact_tags (
		contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
		tag_id     UUID REFERENCES tags(id) ON DELETE CASCADE,
		PRIMARY KEY (contact_id, tag_id)
	)`,

	// ── Agentes de IA para Chat ────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS chat_agents (
		id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id      TEXT NOT NULL,
		name              TEXT NOT NULL,
		avatar_url        TEXT,
		provider          TEXT DEFAULT 'gemini',
		model_name        TEXT,
		system_prompt     TEXT NOT NULL DEFAULT '',
		temperature       REAL DEFAULT 0.7,
		max_tokens        INT DEFAULT 2048,
		tools_enabled     BOOLEAN DEFAULT false,
		predefined_tools  JSONB DEFAULT '[]',
		custom_tools      JSONB DEFAULT '[]',
		rag_enabled       BOOLEAN DEFAULT false,
		rag_sources       JSONB DEFAULT '[]',
		handoff_enabled   BOOLEAN DEFAULT true,
		handoff_keywords  JSONB DEFAULT '["atendente", "humano", "falar com alguém"]',
		active            BOOLEAN DEFAULT true,
		created_at        TIMESTAMPTZ DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_chat_agents_ws ON chat_agents(workspace_id)`,

	// ── Conversas (thread unificada cross-canal) ───────────────────────
	`CREATE TABLE IF NOT EXISTS conversations (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id  TEXT NOT NULL,
		inbox_id      UUID REFERENCES inboxes(id),
		contact_id    UUID REFERENCES contacts(id) ON DELETE SET NULL,
		status        TEXT DEFAULT 'open',
		priority      TEXT DEFAULT 'none',
		assignee_id   TEXT,
		ai_active     BOOLEAN DEFAULT false,
		chat_agent_id UUID REFERENCES chat_agents(id) ON DELETE SET NULL,
		last_msg_at   TIMESTAMPTZ DEFAULT now(),
		custom_attrs  JSONB DEFAULT '{}',
		created_at    TIMESTAMPTZ DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_conv_ws_status ON conversations(workspace_id, status, last_msg_at DESC)`,
	`CREATE INDEX IF NOT EXISTS idx_conv_contact ON conversations(contact_id)`,

	// ── Relação N:N conversa ↔ tag ─────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS conversation_tags (
		conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
		tag_id          UUID REFERENCES tags(id) ON DELETE CASCADE,
		PRIMARY KEY (conversation_id, tag_id)
	)`,

	// ── Mensagens (particionada por mês) ───────────────────────────────
	`CREATE TABLE IF NOT EXISTS messages (
		id               UUID DEFAULT gen_random_uuid(),
		conversation_id  UUID NOT NULL,
		sender_type      TEXT NOT NULL,
		sender_id        TEXT,
		content          TEXT,
		content_type     TEXT DEFAULT 'text',
		media_url        TEXT,
		external_id      TEXT,
		status           TEXT DEFAULT 'sent',
		metadata         JSONB DEFAULT '{}',
		created_at       TIMESTAMPTZ DEFAULT now(),
		PRIMARY KEY (id, created_at)
	) PARTITION BY RANGE (created_at)`,

	// ── Embeddings vetoriais para RAG ──────────────────────────────────
	`DO $$ BEGIN
		CREATE TABLE IF NOT EXISTS embeddings (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id  TEXT NOT NULL,
			source_type   TEXT NOT NULL,
			source_id     TEXT NOT NULL,
			chunk_text    TEXT NOT NULL,
			embedding     vector(768),
			metadata      JSONB DEFAULT '{}',
			created_at    TIMESTAMPTZ DEFAULT now()
		);
	EXCEPTION WHEN undefined_object THEN
		CREATE TABLE IF NOT EXISTS embeddings (
			id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			workspace_id  TEXT NOT NULL,
			source_type   TEXT NOT NULL,
			source_id     TEXT NOT NULL,
			chunk_text    TEXT NOT NULL,
			metadata      JSONB DEFAULT '{}',
			created_at    TIMESTAMPTZ DEFAULT now()
		);
	END $$`,

	// ── CRM: Pipelines ─────────────────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS pipelines (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id  TEXT NOT NULL,
		name          TEXT NOT NULL,
		created_at    TIMESTAMPTZ DEFAULT now()
	)`,

	// ── CRM: Estágios do Pipeline ──────────────────────────────────────
	`CREATE TABLE IF NOT EXISTS pipeline_stages (
		id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		pipeline_id   UUID REFERENCES pipelines(id) ON DELETE CASCADE,
		name          TEXT NOT NULL,
		color         TEXT DEFAULT '#6366f1',
		position      INT NOT NULL DEFAULT 0,
		sla_hours     INT
	)`,

	// ── CRM: Deals (Cards do Kanban) ───────────────────────────────────
	`CREATE TABLE IF NOT EXISTS deals (
		id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id    TEXT NOT NULL,
		pipeline_id     UUID REFERENCES pipelines(id),
		stage_id        UUID REFERENCES pipeline_stages(id),
		contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
		conversation_id UUID,
		title           TEXT NOT NULL,
		value_cents     BIGINT DEFAULT 0,
		position        INT DEFAULT 0,
		assignee_id     TEXT,
		custom_attrs    JSONB DEFAULT '{}',
		created_at      TIMESTAMPTZ DEFAULT now(),
		updated_at      TIMESTAMPTZ DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_deals_ws_pipeline ON deals(workspace_id, pipeline_id)`,

	// ── Automações (trigger → action) ──────────────────────────────────
	`CREATE TABLE IF NOT EXISTS automations (
		id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
		workspace_id   TEXT NOT NULL,
		name           TEXT NOT NULL,
		trigger_type   TEXT NOT NULL,
		trigger_config JSONB DEFAULT '{}',
		action_type    TEXT NOT NULL,
		action_config  JSONB DEFAULT '{}',
		active         BOOLEAN DEFAULT true,
		priority       INT DEFAULT 0,
		created_at     TIMESTAMPTZ DEFAULT now()
	)`,
	`CREATE INDEX IF NOT EXISTS idx_automations_ws ON automations(workspace_id, active)`,

	// ── Migrações de constraints para exclusão segura ──────────────────
	`ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_contact_id_fkey,
	 ADD CONSTRAINT conversations_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL`,
	`ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_contact_id_fkey,
	 ADD CONSTRAINT deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL`,
}

// envPGURL lê a URL de conexão do PostgreSQL da env.
func envPGURL() string {
	if v := os.Getenv("KALLIA_PG_URL"); v != "" {
		return v
	}
	// Fallback: monta a URL a partir de variáveis separadas (Docker Compose)
	host := envStr("POSTGRES_HOST", "")
	if host == "" {
		return ""
	}
	port := envStr("POSTGRES_PORT", "5432")
	user := envStr("POSTGRES_USER", "kallia")
	pass := envStr("POSTGRES_PASSWORD", "")
	dbname := envStr("POSTGRES_DB", "kallia")
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable", user, pass, host, port, dbname)
}
