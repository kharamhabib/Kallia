package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type sessionRow struct {
	ID          string
	Name        string
	JID         string
	Webhook     string
	Chatwoot    string
	AIConfig    string
	WorkspaceID string
	ProjectID   string // alias de compatibilidade para WorkspaceID
	APIKey      string
}

type sessionStore struct{ db *sql.DB }

// newSessionStore cria a tabela de config das sessões no banco PRINCIPAL.
// (O store do whatsmeow de cada sessão fica em um banco separado — ver db.go.)
func newSessionStore(ctx context.Context, db *sql.DB) (*sessionStore, error) {
	// 1. Criar a tabela de usuários locais (cache / fallback)
	_, err := db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS users (
		id            TEXT PRIMARY KEY,
		email         TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		role          TEXT NOT NULL DEFAULT 'creator',
		workspace_id  TEXT,
		created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela users: %w", err)
	}

	// 2. Criar a tabela de conexões (sessions)
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS sessions (
		id           TEXT PRIMARY KEY,
		name         TEXT NOT NULL,
		jid          TEXT,
		webhook      TEXT,
		chatwoot     TEXT,
		ai_config    TEXT,
		workspace_id TEXT,
		api_key      TEXT UNIQUE,
		created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, err
	}

	// 3. Executar migrações de colunas para bancos SQLite existentes
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN webhook TEXT`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN chatwoot TEXT`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN ai_config TEXT`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN workspace_id TEXT`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE sessions ADD COLUMN api_key TEXT`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'creator'`)
	_, _ = db.ExecContext(ctx, `ALTER TABLE users ADD COLUMN workspace_id TEXT`)

	// Migrar dados antigos de project_id para workspace_id caso existam
	_, _ = db.ExecContext(ctx, `UPDATE sessions SET workspace_id = project_id WHERE (workspace_id IS NULL OR workspace_id = '') AND project_id IS NOT NULL AND project_id != ''`)
	_, _ = db.ExecContext(ctx, `UPDATE users SET workspace_id = project_id WHERE (workspace_id IS NULL OR workspace_id = '') AND project_id IS NOT NULL AND project_id != ''`)

	_, _ = db.ExecContext(ctx, `UPDATE users SET email = LOWER(TRIM(email))`)
	_, _ = db.ExecContext(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_lower_email ON users (LOWER(email))`)
	_, _ = db.ExecContext(ctx, `UPDATE sessions SET api_key = 'kc_' || hex(randomblob(16)) WHERE api_key IS NULL OR api_key = ''`)

	// 4. Criar a tabela de agentes (personas)
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS agents (
		id           TEXT PRIMARY KEY,
		workspace_id TEXT,
		session_id   TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
		name         TEXT NOT NULL,
		description  TEXT,
		ai_config    TEXT NOT NULL,
		inbound      BOOLEAN NOT NULL DEFAULT 0,
		outbound     BOOLEAN NOT NULL DEFAULT 0,
		created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela agents: %w", err)
	}
	_, _ = db.ExecContext(ctx, `ALTER TABLE agents ADD COLUMN workspace_id TEXT`)

	// 5. Criar a tabela de transcrições de chamada (buffer de streaming VoIP em tempo real)
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS call_transcripts (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		workspace_id TEXT,
		session_id   TEXT NOT NULL,
		call_id      TEXT NOT NULL,
		speaker      TEXT NOT NULL,
		text         TEXT NOT NULL,
		created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela call_transcripts: %w", err)
	}
	_, _ = db.ExecContext(ctx, `ALTER TABLE call_transcripts ADD COLUMN workspace_id TEXT`)
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_call_transcripts_session_call ON call_transcripts(session_id, call_id)`)

	// 6. Tabela de Provedores de IA (Gemini, Grok xAI, OpenAI GPT)
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS ai_providers (
		workspace_id      TEXT NOT NULL DEFAULT 'default',
		provider          TEXT NOT NULL,
		encrypted_api_key TEXT NOT NULL DEFAULT '',
		enabled           BOOLEAN NOT NULL DEFAULT 0,
		default_model     TEXT NOT NULL DEFAULT '',
		options_json      TEXT NOT NULL DEFAULT '{}',
		updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (workspace_id, provider)
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela ai_providers: %w", err)
	}
	_, _ = db.ExecContext(ctx, `ALTER TABLE ai_providers ADD COLUMN workspace_id TEXT`)

	// 7. Histórico de chamadas persistido
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS call_history (
		workspace_id  TEXT,
		session_id    TEXT NOT NULL,
		call_id       TEXT NOT NULL,
		owner         TEXT,
		direction     TEXT NOT NULL,
		peer          TEXT NOT NULL,
		started_at    BIGINT NOT NULL,
		ended_at      BIGINT,
		end_reason    TEXT,
		summary       TEXT,
		ticket_opened BOOLEAN NOT NULL DEFAULT 0,
		ticket_reason TEXT,
		recording_url TEXT,
		PRIMARY KEY (session_id, call_id)
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela call_history: %w", err)
	}
	_, _ = db.ExecContext(ctx, `ALTER TABLE call_history ADD COLUMN workspace_id TEXT`)

	// 8. Criar a tabela de pesquisas NPS
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS call_ratings (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		workspace_id TEXT,
		session_id   TEXT NOT NULL,
		call_id      TEXT NOT NULL,
		phone        TEXT NOT NULL,
		score        INT NOT NULL,
		comment      TEXT,
		created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela call_ratings: %w", err)
	}
	_, _ = db.ExecContext(ctx, `ALTER TABLE call_ratings ADD COLUMN workspace_id TEXT`)
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_call_ratings_session ON call_ratings(session_id)`)

	// 9. Criar a tabela de enquetes enviadas
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS sent_polls (
		session_id  TEXT NOT NULL,
		poll_id     TEXT NOT NULL,
		option_hash TEXT NOT NULL,
		option_text TEXT NOT NULL,
		PRIMARY KEY (session_id, poll_id, option_hash)
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela sent_polls: %w", err)
	}
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_sent_polls_lookup ON sent_polls(session_id, poll_id)`)

	// 10. Criar a tabela de contatos (CRM)
	_, err = db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS contacts (
		id           INTEGER PRIMARY KEY AUTOINCREMENT,
		workspace_id TEXT,
		session_id   TEXT NOT NULL,
		phone        TEXT NOT NULL,
		name         TEXT NOT NULL DEFAULT '',
		email        TEXT NOT NULL DEFAULT '',
		company      TEXT NOT NULL DEFAULT '',
		notes        TEXT NOT NULL DEFAULT '',
		avatar_url   TEXT NOT NULL DEFAULT '',
		lid          TEXT NOT NULL DEFAULT '',
		jid          TEXT NOT NULL DEFAULT '',
		tags         TEXT NOT NULL DEFAULT '',
		enriched_at  DATETIME,
		created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	)`)
	if err != nil {
		return nil, fmt.Errorf("criar tabela contacts: %w", err)
	}
	_, _ = db.ExecContext(ctx, `ALTER TABLE contacts ADD COLUMN workspace_id TEXT`)
	_, _ = db.ExecContext(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_session_phone ON contacts(session_id, phone)`)
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_contacts_lid ON contacts(session_id, lid)`)
	_, _ = db.ExecContext(ctx, `CREATE INDEX IF NOT EXISTS idx_contacts_workspace ON contacts(workspace_id)`)

	store := &sessionStore{db: db}
	if err := store.bootstrapInitialAdmin(ctx); err != nil {
		slog.Error("[Bootstrap] Falha ao executar bootstrap inicial", "err", err)
	}

	return store, nil
}

// bootstrapInitialAdmin garante que o usuário admin inicial definido no ENV exista no banco local.
func (s *sessionStore) bootstrapInitialAdmin(ctx context.Context) error {
	adminEmail := strings.TrimSpace(strings.ToLower(envStr("KALLIA_ADMIN_EMAIL", "")))
	adminPassword := envStr("KALLIA_ADMIN_PASSWORD", "")
	if adminEmail == "" || adminPassword == "" {
		return nil
	}

	var existingHash string
	err := s.db.QueryRowContext(ctx, `SELECT password_hash FROM users WHERE LOWER(email) = $1`, adminEmail).Scan(&existingHash)
	if err == sql.ErrNoRows {
		hashed, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("gerar hash de senha inicial: %w", err)
		}
		userID := newSessionID()
		_, err = s.db.ExecContext(ctx, `
			INSERT INTO users (id, email, password_hash, role)
			VALUES ($1, $2, $3, 'creator')
			ON CONFLICT (email) DO NOTHING
		`, userID, adminEmail, string(hashed))
		if err != nil {
			return fmt.Errorf("criar usuário admin inicial: %w", err)
		}
		slog.Info("[Bootstrap] Usuário admin inicial criado via ENV", "email", adminEmail)
	} else if err == nil && existingHash != "" {
		if bcrypt.CompareHashAndPassword([]byte(existingHash), []byte(adminPassword)) != nil {
			newHashed, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
			if err == nil {
				_, _ = s.db.ExecContext(ctx, `UPDATE users SET password_hash = $1 WHERE LOWER(email) = $2`, string(newHashed), adminEmail)
				slog.Info("[Bootstrap] Senha do admin sincronizada com ENV", "email", adminEmail)
			}
		}
	}
	return nil
}

func (s *sessionStore) savePollOptions(ctx context.Context, sessionID, pollID string, options []string) error {
	for _, opt := range options {
		h := sha256.Sum256([]byte(opt))
		hashHex := hex.EncodeToString(h[:])
		_, err := s.db.ExecContext(ctx, `
			INSERT INTO sent_polls (session_id, poll_id, option_hash, option_text)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (session_id, poll_id, option_hash) DO NOTHING
		`, sessionID, pollID, hashHex, opt)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *sessionStore) resolvePollOption(ctx context.Context, sessionID, pollID, hashHex string) (string, error) {
	var optText string
	err := s.db.QueryRowContext(ctx, `
		SELECT option_text FROM sent_polls
		WHERE session_id = $1 AND poll_id = $2 AND option_hash = $3
	`, sessionID, pollID, hashHex).Scan(&optText)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return optText, err
}

func (s *sessionStore) deleteCall(ctx context.Context, sessionID, callID string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	_, err = tx.ExecContext(ctx, `DELETE FROM call_history WHERE session_id = $1 AND call_id = $2`, sessionID, callID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM call_transcripts WHERE session_id = $1 AND call_id = $2`, sessionID, callID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM call_ratings WHERE session_id = $1 AND call_id = $2`, sessionID, callID)
	if err != nil {
		return err
	}
	_, err = tx.ExecContext(ctx, `DELETE FROM sent_polls WHERE session_id = $1 AND poll_id = $2`, sessionID, callID)
	if err != nil {
		return err
	}

	return tx.Commit()
}

func newSessionID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *sessionStore) getRawSession(ctx context.Context, id string) (*sessionRow, error) {
	r := &sessionRow{}
	var wsID string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, COALESCE(jid, ''), COALESCE(webhook, ''), COALESCE(chatwoot, ''), COALESCE(ai_config, ''), COALESCE(workspace_id, project_id, ''), COALESCE(api_key, '')
		FROM sessions WHERE id = $1
	`, id).Scan(&r.ID, &r.Name, &r.JID, &r.Webhook, &r.Chatwoot, &r.AIConfig, &wsID, &r.APIKey)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.WorkspaceID = wsID
	r.ProjectID = wsID
	return r, nil
}

func (s *sessionStore) getSessionByAPIKey(ctx context.Context, apiKey string) (*sessionRow, error) {
	if apiKey == "" {
		return nil, nil
	}
	r := &sessionRow{}
	var wsID string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, name, COALESCE(jid, ''), COALESCE(webhook, ''), COALESCE(chatwoot, ''), COALESCE(ai_config, ''), COALESCE(workspace_id, project_id, ''), COALESCE(api_key, '')
		FROM sessions WHERE api_key = $1
	`, apiKey).Scan(&r.ID, &r.Name, &r.JID, &r.Webhook, &r.Chatwoot, &r.AIConfig, &wsID, &r.APIKey)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.WorkspaceID = wsID
	r.ProjectID = wsID
	return r, nil
}

func (s *sessionStore) listAll(ctx context.Context) ([]sessionRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, COALESCE(jid, ''), COALESCE(webhook, ''), COALESCE(chatwoot, ''), COALESCE(ai_config, ''), COALESCE(workspace_id, project_id, ''), COALESCE(api_key, '')
		FROM sessions ORDER BY created_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []sessionRow
	for rows.Next() {
		var r sessionRow
		var wsID string
		if err := rows.Scan(&r.ID, &r.Name, &r.JID, &r.Webhook, &r.Chatwoot, &r.AIConfig, &wsID, &r.APIKey); err != nil {
			return nil, err
		}
		r.WorkspaceID = wsID
		r.ProjectID = wsID
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *sessionStore) list(ctx context.Context, workspaceID string) ([]sessionRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, COALESCE(jid, ''), COALESCE(webhook, ''), COALESCE(chatwoot, ''), COALESCE(ai_config, ''), COALESCE(workspace_id, project_id, ''), COALESCE(api_key, '')
		FROM sessions WHERE workspace_id = $1 OR project_id = $1 ORDER BY created_at
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []sessionRow
	for rows.Next() {
		var r sessionRow
		var wsID string
		if err := rows.Scan(&r.ID, &r.Name, &r.JID, &r.Webhook, &r.Chatwoot, &r.AIConfig, &wsID, &r.APIKey); err != nil {
			return nil, err
		}
		r.WorkspaceID = wsID
		r.ProjectID = wsID
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *sessionStore) insert(ctx context.Context, id, name, workspaceID, apiKey string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (id, name, jid, workspace_id, api_key)
		VALUES ($1, $2, NULL, $3, $4)
	`, id, name, workspaceID, apiKey)
	if err == nil {
		syncSessionToPB(id, name, "", "", "", "", workspaceID, apiKey)
	}
	return err
}

func (s *sessionStore) setJID(ctx context.Context, id, jid string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET jid = $1 WHERE id = $2`, jid, id)
	return err
}

func (s *sessionStore) setWebhook(ctx context.Context, id, url string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET webhook = $1 WHERE id = $2`, url, id)
	return err
}

func (s *sessionStore) setChatwoot(ctx context.Context, id, cfgJSON string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET chatwoot = $1 WHERE id = $2`, cfgJSON, id)
	return err
}

func (s *sessionStore) setAIConfig(ctx context.Context, id, cfgJSON string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET ai_config = $1 WHERE id = $2`, cfgJSON, id)
	return err
}

func (s *sessionStore) setName(ctx context.Context, id, name string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET name = $1 WHERE id = $2`, name, id)
	return err
}

func (s *sessionStore) setAPIKey(ctx context.Context, id, apiKey string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE sessions SET api_key = $1 WHERE id = $2`, apiKey, id)
	return err
}

func (s *sessionStore) delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}

func (s *sessionStore) saveTranscript(ctx context.Context, sessionID, callID string, lines []TranscriptLine) error {
	if len(lines) == 0 {
		return nil
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO call_transcripts (session_id, call_id, speaker, text, created_at)
		VALUES ($1, $2, $3, $4, $5)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	now := time.Now()
	for _, line := range lines {
		// Usa o timestamp real da fala quando disponível; senão, o momento do save.
		lineTime := now
		if line.At > 0 {
			lineTime = time.UnixMilli(line.At)
		}
		_, err = stmt.ExecContext(ctx, sessionID, callID, line.Speaker, line.Text, lineTime)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

func (s *sessionStore) getTranscript(ctx context.Context, sessionID, callID string) ([]TranscriptLine, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT speaker, text FROM call_transcripts
		WHERE session_id = $1 AND call_id = $2
		ORDER BY id
	`, sessionID, callID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TranscriptLine
	for rows.Next() {
		var line TranscriptLine
		if err := rows.Scan(&line.Speaker, &line.Text); err != nil {
			return nil, err
		}
		out = append(out, line)
	}
	return out, rows.Err()
}

// ---- Histórico de chamadas persistido ----

// saveCallHistory faz upsert do registro encerrado na tabela call_history.
func (s *sessionStore) saveCallHistory(ctx context.Context, rec CallRecord) error {
	var endedAt *int64
	if rec.EndedAt != nil {
		endedAt = rec.EndedAt
	}
	var owner *string
	if rec.Owner != nil {
		owner = rec.Owner
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO call_history (session_id, call_id, owner, direction, peer, started_at, ended_at, end_reason, summary, ticket_opened, ticket_reason, recording_url)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
		ON CONFLICT (session_id, call_id) DO UPDATE SET
			owner = EXCLUDED.owner,
			ended_at = EXCLUDED.ended_at,
			end_reason = EXCLUDED.end_reason,
			summary = COALESCE(NULLIF(EXCLUDED.summary, ''), call_history.summary),
			ticket_opened = call_history.ticket_opened OR EXCLUDED.ticket_opened,
			ticket_reason = COALESCE(NULLIF(EXCLUDED.ticket_reason, ''), call_history.ticket_reason),
			recording_url = COALESCE(NULLIF(EXCLUDED.recording_url, ''), call_history.recording_url)
	`, rec.SessionID, rec.CallID, owner, rec.Direction, rec.Peer, rec.StartedAt, endedAt, rec.EndReason, rec.Summary, rec.TicketOpened, rec.TicketReason, rec.RecordingURL)
	return err
}

// listCallHistory devolve os registros mais recentes de uma sessão (ordem cronológica).
func (s *sessionStore) listCallHistory(ctx context.Context, sessionID string, limit int) ([]CallRecord, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT session_id, call_id, owner, direction, peer, started_at, ended_at,
		       COALESCE(end_reason,''), COALESCE(summary,''), ticket_opened, COALESCE(ticket_reason,''), COALESCE(recording_url,'')
		FROM call_history
		WHERE session_id = $1
		ORDER BY started_at DESC
		LIMIT $2
	`, sessionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CallRecord
	for rows.Next() {
		var rec CallRecord
		var owner *string
		var endedAt *int64
		if err := rows.Scan(&rec.SessionID, &rec.CallID, &owner, &rec.Direction, &rec.Peer, &rec.StartedAt, &endedAt, &rec.EndReason, &rec.Summary, &rec.TicketOpened, &rec.TicketReason, &rec.RecordingURL); err != nil {
			return nil, err
		}
		rec.Owner = owner
		rec.EndedAt = endedAt
		rec.Status = StatusEnded
		out = append(out, rec)
	}
	// inverte para ordem cronológica (mais antigo primeiro), igual ao cache do broker
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, rows.Err()
}

// updateCallSummary persiste o resumo de uma chamada do histórico.
func (s *sessionStore) updateCallSummary(ctx context.Context, sessionID, callID, summary string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_history SET summary = $3 WHERE session_id = $1 AND call_id = $2`, sessionID, callID, summary)
	return err
}

// updateCallRecording persiste a URL de gravação de uma chamada do histórico.
func (s *sessionStore) updateCallRecording(ctx context.Context, sessionID, callID, recordingURL string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_history SET recording_url = $3 WHERE session_id = $1 AND call_id = $2`, sessionID, callID, recordingURL)
	return err
}

// ---- Métodos da Pesquisa NPS ----

type CallRating struct {
	ID        int       `json:"id"`
	SessionID string    `json:"sessionId"`
	CallID    string    `json:"callId"`
	Phone     string    `json:"phone"`
	Score     int       `json:"score"`
	Comment   string    `json:"comment"`
	CreatedAt time.Time `json:"createdAt"`
}

type NPSSummary struct {
	Total      int     `json:"total"`
	Average    float64 `json:"average"`
	Promoters  int     `json:"promoters"`
	Neutrals   int     `json:"neutrals"`
	Detractors int     `json:"detractors"`
	NPSScore   float64 `json:"npsScore"`
}

func (s *sessionStore) saveRating(ctx context.Context, r CallRating) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO call_ratings (session_id, call_id, phone, score, comment, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`, r.SessionID, r.CallID, r.Phone, r.Score, r.Comment)
	return err
}

func (s *sessionStore) listRatings(ctx context.Context, sessionID string, limit int) ([]CallRating, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, call_id, phone, score, COALESCE(comment, ''), created_at
		FROM call_ratings
		WHERE session_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, sessionID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []CallRating
	for rows.Next() {
		var r CallRating
		if err := rows.Scan(&r.ID, &r.SessionID, &r.CallID, &r.Phone, &r.Score, &r.Comment, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *sessionStore) getNPSSummary(ctx context.Context, sessionID string) (NPSSummary, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT score FROM call_ratings WHERE session_id = $1
	`, sessionID)
	if err != nil {
		return NPSSummary{}, err
	}
	defer rows.Close()

	var sum, count, promoters, neutrals, detractors int
	for rows.Next() {
		var score int
		if err := rows.Scan(&score); err != nil {
			return NPSSummary{}, err
		}
		count++
		sum += score
		if score >= 9 {
			promoters++
		} else if score >= 7 {
			neutrals++
		} else {
			detractors++
		}
	}
	if count == 0 {
		return NPSSummary{}, nil
	}

	avg := float64(sum) / float64(count)
	nps := (float64(promoters-detractors) / float64(count)) * 100.0

	return NPSSummary{
		Total:      count,
		Average:    avg,
		Promoters:  promoters,
		Neutrals:   neutrals,
		Detractors: detractors,
		NPSScore:   nps,
	}, nil
}

func (s *sessionStore) checkCallSession(ctx context.Context, sessionID, callID string) (bool, error) {
	var exists bool
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM call_history WHERE session_id = $1 AND call_id = $2)`, sessionID, callID).Scan(&exists)
	return exists, err
}

// updateCallTicket persiste a abertura de chamado de uma chamada do histórico.
func (s *sessionStore) updateCallTicket(ctx context.Context, sessionID, callID, reason string) error {
	_, err := s.db.ExecContext(ctx, `UPDATE call_history SET ticket_opened = TRUE, ticket_reason = $3 WHERE session_id = $1 AND call_id = $2`, sessionID, callID, reason)
	return err
}

// pgHistoryPersister adapta o sessionStore à interface HistoryPersister do broker.
// Falhas são logadas e engolidas: o cache em memória segue autoritativo em runtime.
type pgHistoryPersister struct {
	store *sessionStore
	log   *slog.Logger
}

func (p *pgHistoryPersister) SaveCall(rec CallRecord) {
	goSafe(p.log, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := p.store.saveCallHistory(ctx, rec); err != nil {
			p.log.Error("falha ao persistir histórico da chamada", "callId", rec.CallID, "err", err)
		}
	})
}

func (p *pgHistoryPersister) SaveSummary(sessionID, callID, summary string) {
	goSafe(p.log, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := p.store.updateCallSummary(ctx, sessionID, callID, summary); err != nil {
			p.log.Error("falha ao persistir resumo da chamada", "callId", callID, "err", err)
		}
	})
}

func (p *pgHistoryPersister) SaveTicket(sessionID, callID, reason string) {
	goSafe(p.log, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := p.store.updateCallTicket(ctx, sessionID, callID, reason); err != nil {
			p.log.Error("falha ao persistir chamado da chamada", "callId", callID, "err", err)
		}
	})
}

// Structs e CRUD de Usuários e Agentes para Multi-Tenancy

type userRow struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         string    `json:"role"`
	WorkspaceID  *string   `json:"workspaceId,omitempty"`
	ProjectID    *string   `json:"projectId,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
}

type agentRow struct {
	ID          string    `json:"id"`
	SessionID   string    `json:"sessionId"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	AIConfig    string    `json:"aiConfig"`
	Inbound     bool      `json:"inbound"`
	Outbound    bool      `json:"outbound"`
	CreatedAt   time.Time `json:"createdAt"`
}

// --- CRUD Usuários ---

func (s *sessionStore) createUser(ctx context.Context, id, email, passwordHash, role, projectID string) error {
	cleanEmail := strings.TrimSpace(strings.ToLower(email))
	var projVal *string
	if projectID != "" {
		projVal = &projectID
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO users (id, email, password_hash, role, project_id)
		VALUES ($1, $2, $3, $4, $5)
	`, id, cleanEmail, passwordHash, role, projVal)
	return err
}

func (s *sessionStore) getUserByEmail(ctx context.Context, email string) (*userRow, error) {
	cleanEmail := strings.TrimSpace(strings.ToLower(email))
	r := &userRow{}
	var wsID *string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, password_hash, role, COALESCE(workspace_id, project_id), created_at
		FROM users WHERE LOWER(email) = $1
	`, cleanEmail).Scan(&r.ID, &r.Email, &r.PasswordHash, &r.Role, &wsID, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.WorkspaceID = wsID
	r.ProjectID = wsID
	return r, nil
}

func (s *sessionStore) getUserByID(ctx context.Context, id string) (*userRow, error) {
	r := &userRow{}
	var wsID *string
	err := s.db.QueryRowContext(ctx, `
		SELECT id, email, password_hash, role, COALESCE(workspace_id, project_id), created_at
		FROM users WHERE id = $1
	`, id).Scan(&r.ID, &r.Email, &r.PasswordHash, &r.Role, &wsID, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.WorkspaceID = wsID
	r.ProjectID = wsID
	return r, nil
}

// --- CRUD Agentes ---

func (s *sessionStore) createAgent(ctx context.Context, id, sessionID, name, description, aiConfig string, inbound, outbound bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if inbound {
		_, err = tx.ExecContext(ctx, `UPDATE agents SET inbound = FALSE WHERE session_id = $1`, sessionID)
		if err != nil {
			return err
		}
	}
	if outbound {
		_, err = tx.ExecContext(ctx, `UPDATE agents SET outbound = FALSE WHERE session_id = $1`, sessionID)
		if err != nil {
			return err
		}
	}

	_, err = tx.ExecContext(ctx, `
		INSERT INTO agents (id, session_id, name, description, ai_config, inbound, outbound)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, id, sessionID, name, description, aiConfig, inbound, outbound)
	if err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	return nil
}

func (s *sessionStore) updateAgent(ctx context.Context, id, name, description, aiConfig string, inbound, outbound bool) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var sessionID string
	err = tx.QueryRowContext(ctx, `SELECT session_id FROM agents WHERE id = $1`, id).Scan(&sessionID)
	if err != nil {
		return err
	}

	if inbound {
		_, err = tx.ExecContext(ctx, `UPDATE agents SET inbound = FALSE WHERE session_id = $1`, sessionID)
		if err != nil {
			return err
		}
	}
	if outbound {
		_, err = tx.ExecContext(ctx, `UPDATE agents SET outbound = FALSE WHERE session_id = $1`, sessionID)
		if err != nil {
			return err
		}
	}

	_, err = tx.ExecContext(ctx, `
		UPDATE agents SET name = $1, description = $2, ai_config = $3, inbound = $4, outbound = $5
		WHERE id = $6
	`, name, description, aiConfig, inbound, outbound, id)
	if err != nil {
		return err
	}

	if err := tx.Commit(); err != nil {
		return err
	}

	return nil
}

func (s *sessionStore) deleteAgent(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM agents WHERE id = $1`, id)
	return err
}

func (s *sessionStore) getAgent(ctx context.Context, id string) (*agentRow, error) {
	r := &agentRow{}
	err := s.db.QueryRowContext(ctx, `
		SELECT id, session_id, name, COALESCE(description, ''), ai_config, inbound, outbound, created_at
		FROM agents WHERE id = $1
	`, id).Scan(&r.ID, &r.SessionID, &r.Name, &r.Description, &r.AIConfig, &r.Inbound, &r.Outbound, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (s *sessionStore) listAgents(ctx context.Context, sessionID string) ([]agentRow, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, session_id, name, COALESCE(description, ''), ai_config, inbound, outbound, created_at
		FROM agents WHERE session_id = $1 ORDER BY created_at
	`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []agentRow
	for rows.Next() {
		var r agentRow
		if err := rows.Scan(&r.ID, &r.SessionID, &r.Name, &r.Description, &r.AIConfig, &r.Inbound, &r.Outbound, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *sessionStore) getActiveAgent(ctx context.Context, sessionID string, direction string) (*agentRow, error) {
	r := &agentRow{}
	query := `SELECT id, session_id, name, COALESCE(description, ''), ai_config, inbound, outbound, created_at FROM agents WHERE session_id = $1 AND inbound = TRUE LIMIT 1`
	if direction == "outbound" {
		query = `SELECT id, session_id, name, COALESCE(description, ''), ai_config, inbound, outbound, created_at FROM agents WHERE session_id = $1 AND outbound = TRUE LIMIT 1`
	}
	err := s.db.QueryRowContext(ctx, query, sessionID).Scan(&r.ID, &r.SessionID, &r.Name, &r.Description, &r.AIConfig, &r.Inbound, &r.Outbound, &r.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

// Structs e CRUD de Contatos para o módulo de CRM

type ContactRecord struct {
	ID         int64      `json:"id"`
	SessionID  string     `json:"sessionId"`
	Phone      string     `json:"phone"`
	Name       string     `json:"name"`
	Email      string     `json:"email"`
	Company    string     `json:"company"`
	Notes      string     `json:"notes"`
	AvatarURL  string     `json:"avatarUrl"`
	LID        string     `json:"lid"`
	JID        string     `json:"jid"`
	Tags       string     `json:"tags"`
	EnrichedAt *time.Time `json:"enrichedAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`
}

func (s *sessionStore) upsertContact(ctx context.Context, c ContactRecord) (*ContactRecord, error) {
	if c.SessionID == "" || c.Phone == "" {
		return nil, fmt.Errorf("session_id and phone are required")
	}

	c.Phone = normalizePhone(c.Phone)
	if c.Phone == "" {
		return nil, fmt.Errorf("invalid phone number")
	}

	var existing ContactRecord
	var enrichedAt sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, session_id, phone, name, email, company, notes, avatar_url, lid, jid, tags, enriched_at, created_at, updated_at
		FROM contacts WHERE session_id = $1 AND (phone = $2 OR (lid <> '' AND lid = $3))
	`, c.SessionID, c.Phone, c.LID).Scan(
		&existing.ID, &existing.SessionID, &existing.Phone, &existing.Name, &existing.Email,
		&existing.Company, &existing.Notes, &existing.AvatarURL, &existing.LID, &existing.JID,
		&existing.Tags, &enrichedAt, &existing.CreatedAt, &existing.UpdatedAt,
	)
	if enrichedAt.Valid {
		existing.EnrichedAt = &enrichedAt.Time
	}

	now := time.Now()
	if err == sql.ErrNoRows {
		var newID int64
		err = s.db.QueryRowContext(ctx, `
			INSERT INTO contacts (session_id, phone, name, email, company, notes, avatar_url, lid, jid, tags, enriched_at, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			RETURNING id
		`, c.SessionID, c.Phone, c.Name, c.Email, c.Company, c.Notes, c.AvatarURL, c.LID, c.JID, c.Tags, c.EnrichedAt, now, now).Scan(&newID)
		if err != nil {
			return nil, err
		}
		c.ID = newID
		c.CreatedAt = now
		c.UpdatedAt = now
		return &c, nil
	} else if err != nil {
		return nil, err
	}

	name := existing.Name
	if name == "" || name == existing.Phone || (c.Name != "" && existing.Name == "") {
		name = c.Name
	}
	avatar := existing.AvatarURL
	if c.AvatarURL != "" {
		avatar = c.AvatarURL
	}
	lid := existing.LID
	if c.LID != "" {
		lid = c.LID
	}
	jid := existing.JID
	if c.JID != "" {
		jid = c.JID
	}
	var enrichedToSave *time.Time = existing.EnrichedAt
	if c.EnrichedAt != nil {
		enrichedToSave = c.EnrichedAt
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE contacts SET name = $3, avatar_url = $4, lid = $5, jid = $6, enriched_at = $7, updated_at = $8
		WHERE id = $1 AND session_id = $2
	`, existing.ID, c.SessionID, name, avatar, lid, jid, enrichedToSave, now)
	if err != nil {
		return nil, err
	}

	existing.Name = name
	existing.AvatarURL = avatar
	existing.LID = lid
	existing.JID = jid
	existing.EnrichedAt = enrichedToSave
	existing.UpdatedAt = now
	return &existing, nil
}

func (s *sessionStore) updateContactManual(ctx context.Context, c ContactRecord) (*ContactRecord, error) {
	now := time.Now()
	c.Phone = normalizePhone(c.Phone)

	_, err := s.db.ExecContext(ctx, `
		UPDATE contacts SET phone = $3, name = $4, email = $5, company = $6, notes = $7, avatar_url = $8, tags = $9, updated_at = $10
		WHERE id = $1 AND session_id = $2
	`, c.ID, c.SessionID, c.Phone, c.Name, c.Email, c.Company, c.Notes, c.AvatarURL, c.Tags, now)
	if err != nil {
		return nil, err
	}
	c.UpdatedAt = now
	return &c, nil
}

func (s *sessionStore) listContacts(ctx context.Context, sessionID string, search string) ([]ContactRecord, error) {
	query := `
		SELECT id, session_id, phone, name, email, company, notes, avatar_url, lid, jid, tags, enriched_at, created_at, updated_at
		FROM contacts WHERE session_id = $1
	`
	var args []any
	args = append(args, sessionID)

	if search != "" {
		query += ` AND (phone ILIKE $2 OR name ILIKE $2 OR company ILIKE $2 OR email ILIKE $2 OR tags ILIKE $2)`
		args = append(args, "%"+search+"%")
	}
	query += ` ORDER BY updated_at DESC LIMIT 300`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	contacts := make([]ContactRecord, 0)
	for rows.Next() {
		var c ContactRecord
		var enrichedAt sql.NullTime
		if err := rows.Scan(
			&c.ID, &c.SessionID, &c.Phone, &c.Name, &c.Email,
			&c.Company, &c.Notes, &c.AvatarURL, &c.LID, &c.JID,
			&c.Tags, &enrichedAt, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if enrichedAt.Valid {
			c.EnrichedAt = &enrichedAt.Time
		}
		contacts = append(contacts, c)
	}
	return contacts, nil
}

func (s *sessionStore) getContactByPhone(ctx context.Context, sessionID string, phoneOrJID string) (*ContactRecord, error) {
	clean := normalizePhone(phoneOrJID)
	rawJid := phoneOrJID

	var c ContactRecord
	var enrichedAt sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT id, session_id, phone, name, email, company, notes, avatar_url, lid, jid, tags, enriched_at, created_at, updated_at
		FROM contacts WHERE session_id = $1 AND (phone = $2 OR lid = $3 OR jid = $3)
	`, sessionID, clean, rawJid).Scan(
		&c.ID, &c.SessionID, &c.Phone, &c.Name, &c.Email,
		&c.Company, &c.Notes, &c.AvatarURL, &c.LID, &c.JID,
		&c.Tags, &enrichedAt, &c.CreatedAt, &c.UpdatedAt,
	)
	if enrichedAt.Valid {
		c.EnrichedAt = &enrichedAt.Time
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *sessionStore) deleteContact(ctx context.Context, sessionID string, id int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM contacts WHERE session_id = $1 AND id = $2`, sessionID, id)
	return err
}

type aiProviderRow struct {
	WorkspaceID     string
	ProjectID       string // alias para compatibilidade
	Provider        string
	EncryptedAPIKey string
	Enabled         bool
	DefaultModel    string
	OptionsJSON     string
	UpdatedAt       time.Time
}

func (s *sessionStore) getAIProvider(ctx context.Context, workspaceID, provider string) (*aiProviderRow, error) {
	if workspaceID == "" {
		workspaceID = "default"
	}
	r := &aiProviderRow{}
	var wsID string
	err := s.db.QueryRowContext(ctx, `
		SELECT COALESCE(workspace_id, project_id, 'default'), provider, encrypted_api_key, enabled, default_model, options_json, updated_at
		FROM ai_providers WHERE (workspace_id = $1 OR project_id = $1) AND provider = $2
	`, workspaceID, provider).Scan(
		&wsID, &r.Provider, &r.EncryptedAPIKey, &r.Enabled, &r.DefaultModel, &r.OptionsJSON, &r.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	r.WorkspaceID = wsID
	r.ProjectID = wsID
	return r, nil
}

func (s *sessionStore) upsertAIProvider(ctx context.Context, r aiProviderRow) error {
	wsID := r.WorkspaceID
	if wsID == "" {
		wsID = r.ProjectID
	}
	if wsID == "" {
		wsID = "default"
	}
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO ai_providers (workspace_id, provider, encrypted_api_key, enabled, default_model, options_json, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
		ON CONFLICT (workspace_id, provider) DO UPDATE SET
			encrypted_api_key = EXCLUDED.encrypted_api_key,
			enabled = EXCLUDED.enabled,
			default_model = EXCLUDED.default_model,
			options_json = EXCLUDED.options_json,
			updated_at = CURRENT_TIMESTAMP
	`, wsID, r.Provider, r.EncryptedAPIKey, r.Enabled, r.DefaultModel, r.OptionsJSON)
	return err
}

func (s *sessionStore) listAIProviders(ctx context.Context, workspaceID string) ([]aiProviderRow, error) {
	if workspaceID == "" {
		workspaceID = "default"
	}
	rows, err := s.db.QueryContext(ctx, `
		SELECT COALESCE(workspace_id, project_id, 'default'), provider, encrypted_api_key, enabled, default_model, options_json, updated_at
		FROM ai_providers WHERE workspace_id = $1 OR project_id = $1 ORDER BY provider
	`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []aiProviderRow
	for rows.Next() {
		var r aiProviderRow
		var wsID string
		if err := rows.Scan(&wsID, &r.Provider, &r.EncryptedAPIKey, &r.Enabled, &r.DefaultModel, &r.OptionsJSON, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.WorkspaceID = wsID
		r.ProjectID = wsID
		out = append(out, r)
	}
	return out, rows.Err()
}
