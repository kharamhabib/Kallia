package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

// PGContact representa um contato unificado cross-canal no PostgreSQL.
type PGContact struct {
	ID          string                 `json:"id"`
	WorkspaceID string                 `json:"workspace_id,omitempty"`
	Name        string                 `json:"name"`
	Phone       string                 `json:"phone"`
	Email       string                 `json:"email"`
	InstagramID string                 `json:"instagram_id,omitempty"`
	TelegramID  string                 `json:"telegram_id,omitempty"`
	AvatarURL   string                 `json:"avatar_url"`
	AvatarUrl   string                 `json:"avatarUrl,omitempty"`
	Company     string                 `json:"company,omitempty"`
	Notes       string                 `json:"notes,omitempty"`
	Username    string                 `json:"username,omitempty"`
	CustomAttrs map[string]interface{} `json:"custom_attrs"`
	Tags        []Tag                  `json:"tags,omitempty"`
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
}

// ── CRUD de Contatos no PostgreSQL ─────────────────────────────────────

func pgListContacts(db *sql.DB, workspaceID string, search string, tagID string, limit, offset int) ([]PGContact, int, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	where := []string{"c.workspace_id = $1"}
	args := []interface{}{workspaceID}
	argIdx := 2

	if search != "" {
		where = append(where, fmt.Sprintf("(c.name ILIKE $%d OR c.phone ILIKE $%d OR c.email ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	if tagID != "" {
		where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = $%d)", argIdx))
		args = append(args, tagID)
		argIdx++
	}

	whereClause := strings.Join(where, " AND ")

	// Total count
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM contacts c WHERE %s", whereClause)
	var total int
	if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	// Select contacts
	query := fmt.Sprintf(
		`SELECT c.id, c.workspace_id, COALESCE(c.name, ''), COALESCE(c.phone, ''), COALESCE(c.email, ''),
		        COALESCE(c.instagram_id, ''), COALESCE(c.telegram_id, ''), COALESCE(c.avatar_url, ''),
		        c.custom_attrs, c.created_at, c.updated_at
		 FROM contacts c
		 WHERE %s
		 ORDER BY c.updated_at DESC
		 LIMIT $%d OFFSET $%d`,
		whereClause, argIdx, argIdx+1,
	)
	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var contacts []PGContact
	for rows.Next() {
		var c PGContact
		var customAttrsJSON []byte
		if err := rows.Scan(
			&c.ID, &c.WorkspaceID, &c.Name, &c.Phone, &c.Email,
			&c.InstagramID, &c.TelegramID, &c.AvatarURL,
			&customAttrsJSON, &c.CreatedAt, &c.UpdatedAt,
		); err != nil {
			return nil, 0, err
		}
		if len(customAttrsJSON) > 0 {
			_ = json.Unmarshal(customAttrsJSON, &c.CustomAttrs)
		}
		if c.CustomAttrs == nil {
			c.CustomAttrs = make(map[string]interface{})
		}
		c.AvatarUrl = c.AvatarURL
		if company, ok := c.CustomAttrs["company"].(string); ok {
			c.Company = company
		}
		if notes, ok := c.CustomAttrs["notes"].(string); ok {
			c.Notes = notes
		}
		if username, ok := c.CustomAttrs["username"].(string); ok {
			c.Username = username
		}
		contacts = append(contacts, c)
	}

	// Carregar tags para os contatos retornados
	if len(contacts) > 0 {
		contactIDs := make([]string, len(contacts))
		for i, c := range contacts {
			contactIDs[i] = c.ID
		}
		tagsMap, _ := pgBatchGetContactTags(db, contactIDs)
		for i := range contacts {
			contacts[i].Tags = tagsMap[contacts[i].ID]
			if contacts[i].Tags == nil {
				contacts[i].Tags = []Tag{}
			}
		}
	}

	return contacts, total, rows.Err()
}

func pgBatchGetContactTags(db *sql.DB, contactIDs []string) (map[string][]Tag, error) {
	if len(contactIDs) == 0 {
		return make(map[string][]Tag), nil
	}

	placeholders := make([]string, len(contactIDs))
	args := make([]interface{}, len(contactIDs))
	for i, id := range contactIDs {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = id
	}

	query := fmt.Sprintf(
		`SELECT ct.contact_id, t.id, t.workspace_id, t.name, t.color, t.scope, t.created_at
		 FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id
		 WHERE ct.contact_id IN (%s)
		 ORDER BY t.name`,
		strings.Join(placeholders, ","),
	)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]Tag)
	for rows.Next() {
		var contactID string
		var t Tag
		if err := rows.Scan(&contactID, &t.ID, &t.WorkspaceID, &t.Name, &t.Color, &t.Scope, &t.CreatedAt); err != nil {
			continue
		}
		result[contactID] = append(result[contactID], t)
	}
	return result, nil
}

func pgGetOrCreateContact(db *sql.DB, workspaceID, phone, name, avatarURL, email string, customAttrs map[string]interface{}) (*PGContact, error) {
	phone = normalizePhone(phone)
	if phone == "" {
		return nil, errBadRequest("telefone inválido")
	}

	if customAttrs == nil {
		customAttrs = make(map[string]interface{})
	}
	customJSON, _ := json.Marshal(customAttrs)
	if len(customJSON) == 0 {
		customJSON = []byte("{}")
	}

	var c PGContact
	var customAttrsJSON []byte
	query := `
		INSERT INTO contacts (workspace_id, phone, name, email, avatar_url, custom_attrs, updated_at)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), $6::jsonb, now())
		ON CONFLICT (workspace_id, phone) WHERE phone IS NOT NULL AND phone != ''
		DO UPDATE SET
			name = CASE WHEN contacts.name = '' OR contacts.name IS NULL OR contacts.name = contacts.phone THEN COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name) ELSE contacts.name END,
			avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), contacts.avatar_url),
			email = COALESCE(NULLIF(EXCLUDED.email, ''), contacts.email),
			custom_attrs = contacts.custom_attrs || EXCLUDED.custom_attrs,
			updated_at = now()
		RETURNING id, workspace_id, COALESCE(name, ''), phone, COALESCE(email, ''),
		          COALESCE(instagram_id, ''), COALESCE(telegram_id, ''), COALESCE(avatar_url, ''),
		          custom_attrs, created_at, updated_at
	`
	err := db.QueryRow(query, workspaceID, phone, name, email, avatarURL, string(customJSON)).Scan(
		&c.ID, &c.WorkspaceID, &c.Name, &c.Phone, &c.Email,
		&c.InstagramID, &c.TelegramID, &c.AvatarURL,
		&customAttrsJSON, &c.CreatedAt, &c.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(customAttrsJSON) > 0 {
		_ = json.Unmarshal(customAttrsJSON, &c.CustomAttrs)
	}
	if c.CustomAttrs == nil {
		c.CustomAttrs = make(map[string]interface{})
	}
	c.AvatarUrl = c.AvatarURL
	if company, ok := c.CustomAttrs["company"].(string); ok {
		c.Company = company
	}
	if notes, ok := c.CustomAttrs["notes"].(string); ok {
		c.Notes = notes
	}
	if username, ok := c.CustomAttrs["username"].(string); ok {
		c.Username = username
	}
	return &c, nil
}

func pgCreateContact(db *sql.DB, workspaceID string, c PGContact) (*PGContact, error) {
	c.Phone = normalizePhone(c.Phone)
	if c.Name == "" && c.Phone == "" && c.Email == "" {
		return nil, errBadRequest("ao menos nome, telefone ou email deve ser preenchido")
	}

	customJSON, _ := json.Marshal(c.CustomAttrs)
	if len(customJSON) == 0 {
		customJSON = []byte("{}")
	}

	var res PGContact
	var customAttrsJSON []byte
	query := `
		INSERT INTO contacts (workspace_id, name, phone, email, instagram_id, telegram_id, avatar_url, custom_attrs, updated_at)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), NULLIF($7, ''), $8, now())
		ON CONFLICT (workspace_id, phone) WHERE phone IS NOT NULL AND phone != ''
		DO UPDATE SET
			name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name),
			email = COALESCE(NULLIF(EXCLUDED.email, ''), contacts.email),
			instagram_id = COALESCE(NULLIF(EXCLUDED.instagram_id, ''), contacts.instagram_id),
			telegram_id = COALESCE(NULLIF(EXCLUDED.telegram_id, ''), contacts.telegram_id),
			avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), contacts.avatar_url),
			custom_attrs = contacts.custom_attrs || EXCLUDED.custom_attrs,
			updated_at = now()
		RETURNING id, workspace_id, COALESCE(name, ''), COALESCE(phone, ''), COALESCE(email, ''),
		          COALESCE(instagram_id, ''), COALESCE(telegram_id, ''), COALESCE(avatar_url, ''),
		          custom_attrs, created_at, updated_at
	`
	err := db.QueryRow(query, workspaceID, c.Name, c.Phone, c.Email, c.InstagramID, c.TelegramID, c.AvatarURL, customJSON).Scan(
		&res.ID, &res.WorkspaceID, &res.Name, &res.Phone, &res.Email,
		&res.InstagramID, &res.TelegramID, &res.AvatarURL,
		&customAttrsJSON, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(customAttrsJSON) > 0 {
		_ = json.Unmarshal(customAttrsJSON, &res.CustomAttrs)
	}
	return &res, nil
}

func pgUpdateContact(db *sql.DB, contactID string, c PGContact) (*PGContact, error) {
	c.Phone = normalizePhone(c.Phone)

	customJSON, _ := json.Marshal(c.CustomAttrs)
	if len(customJSON) == 0 {
		customJSON = []byte("{}")
	}

	var res PGContact
	var customAttrsJSON []byte
	query := `
		UPDATE contacts SET
			name = COALESCE(NULLIF($2, ''), name),
			phone = COALESCE(NULLIF($3, ''), phone),
			email = COALESCE(NULLIF($4, ''), email),
			instagram_id = COALESCE(NULLIF($5, ''), instagram_id),
			telegram_id = COALESCE(NULLIF($6, ''), telegram_id),
			avatar_url = COALESCE(NULLIF($7, ''), avatar_url),
			custom_attrs = custom_attrs || $8,
			updated_at = now()
		WHERE id = $1
		RETURNING id, workspace_id, COALESCE(name, ''), COALESCE(phone, ''), COALESCE(email, ''),
		          COALESCE(instagram_id, ''), COALESCE(telegram_id, ''), COALESCE(avatar_url, ''),
		          custom_attrs, created_at, updated_at
	`
	err := db.QueryRow(query, contactID, c.Name, c.Phone, c.Email, c.InstagramID, c.TelegramID, c.AvatarURL, customJSON).Scan(
		&res.ID, &res.WorkspaceID, &res.Name, &res.Phone, &res.Email,
		&res.InstagramID, &res.TelegramID, &res.AvatarURL,
		&customAttrsJSON, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(customAttrsJSON) > 0 {
		_ = json.Unmarshal(customAttrsJSON, &res.CustomAttrs)
	}
	return &res, nil
}

func pgDeleteContact(db *sql.DB, contactID string) error {
	_, _ = db.Exec(`UPDATE conversations SET contact_id = NULL WHERE contact_id = $1`, contactID)
	_, _ = db.Exec(`UPDATE deals SET contact_id = NULL WHERE contact_id = $1`, contactID)
	_, _ = db.Exec(`DELETE FROM contact_tags WHERE contact_id = $1`, contactID)

	_, err := db.Exec(`DELETE FROM contacts WHERE id = $1`, contactID)
	return err
}

// ── Migração Automática no Startup (PocketBase / SQLite → PostgreSQL) ───

func pgMigrateLegacyContacts(ctx context.Context, db *sql.DB, store *sessionStore, log *slog.Logger) {
	if db == nil {
		return
	}

	// 1. Migrar contatos armazenados nas sessões SQLite
	sessions, err := store.list(ctx, "")
	if err != nil {
		log.Warn("[PG Migrate] Não foi possível listar sessões para migração", "err", err)
		return
	}

	migratedCount := 0
	for _, sess := range sessions {
		if sess.WorkspaceID == "" {
			continue
		}
		// Contatos da sessão
		crmContacts, err := store.listContacts(ctx, sess.ID, "")
		if err == nil {
			for _, cc := range crmContacts {
				if cc.Phone == "" {
					continue
				}
				customAttrs := map[string]interface{}{}
				if cc.Company != "" {
					customAttrs["company"] = cc.Company
				}
				if cc.Notes != "" {
					customAttrs["notes"] = cc.Notes
				}
				_, err := pgCreateContact(db, sess.WorkspaceID, PGContact{
					Name:        cc.Name,
					Phone:       cc.Phone,
					Email:       cc.Email,
					AvatarURL:   cc.AvatarURL,
					CustomAttrs: customAttrs,
				})
				if err == nil {
					migratedCount++
				}
			}
		}
	}

	if migratedCount > 0 {
		log.Info("[PG Migrate] Contatos legados migrados para o PostgreSQL com sucesso", "total", migratedCount)
	}
}

// ── HTTP Handlers Unificados para /api/workspaces/{wid}/contacts ────────

func (s *server) handleListWorkspaceContactsPG(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	if wid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id obrigatório"})
		return
	}

	db := s.pg.DB()
	if db == nil {
		// Fallback para PocketBase se Postgres não estiver configurado
		s.handleListWorkspaceCRMContacts(w, r)
		return
	}

	q := r.URL.Query()
	search := q.Get("search")
	if search == "" {
		search = q.Get("q")
	}
	tagID := q.Get("tag_id")
	limit := 50
	offset := 0

	contacts, total, err := pgListContacts(db, wid, search, tagID, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if contacts == nil {
		contacts = []PGContact{}
	}

	// Background enrichment para contatos do CRM sem foto de perfil ou com nome de telefone
	go func() {
		defer func() { _ = recover() }()
		for _, c := range contacts {
			if c.AvatarURL == "" || c.Name == "" || c.Name == c.Phone {
				phone := c.Phone
				for _, sess := range s.sessions.list() {
					if sess.info().WorkspaceID == wid && sess.info().State == "open" {
						info := sess.enrichContactInfo(context.Background(), phone)
						if info.AvatarURL != "" || (info.Name != "" && info.Name != phone) {
							customAttrs := map[string]interface{}{}
							if info.Company != "" {
								customAttrs["company"] = info.Company
							}
							if info.Notes != "" {
								customAttrs["notes"] = info.Notes
							}
							if info.Username != "" {
								customAttrs["username"] = info.Username
							}
							customJSON, _ := json.Marshal(customAttrs)
							_, _ = db.Exec(
								`UPDATE contacts
								 SET avatar_url = COALESCE(NULLIF($1, ''), avatar_url),
								     name = CASE WHEN name = '' OR name IS NULL OR name = phone THEN COALESCE(NULLIF($2, ''), name) ELSE name END,
								     email = COALESCE(NULLIF($3, ''), email),
								     custom_attrs = contacts.custom_attrs || $4::jsonb,
								     updated_at = now()
								 WHERE workspace_id = $5 AND phone = $6`,
								info.AvatarURL, info.Name, info.Email, string(customJSON), wid, normalizePhone(phone),
							)
						}
						break
					}
				}
			}
		}
	}()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": contacts,
		"total": total,
	})
}

func (s *server) handleCreateWorkspaceContactPG(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		s.handleCreateWorkspaceCRMContact(w, r)
		return
	}

	var body PGContact
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body inválido"})
		return
	}

	contact, err := pgCreateContact(db, wid, body)
	if err != nil {
		if _, ok := err.(*badRequestError); ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, contact)
}

func (s *server) handleUpdateWorkspaceContactPG(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		s.handleUpdateWorkspaceCRMContact(w, r)
		return
	}

	var body PGContact
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body inválido"})
		return
	}

	contact, err := pgUpdateContact(db, id, body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, contact)
}

func (s *server) handleDeleteWorkspaceContactPG(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		s.handleDeleteWorkspaceCRMContact(w, r)
		return
	}

	if err := pgDeleteContact(db, id); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusNoContent, nil)
}
