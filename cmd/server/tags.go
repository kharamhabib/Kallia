package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// Tag representa uma tag reutilizável por workspace.
type Tag struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id,omitempty"`
	Name        string    `json:"name"`
	Color       string    `json:"color"`
	Scope       string    `json:"scope"` // "contact", "conversation", "both"
	CreatedAt   time.Time `json:"created_at"`
}

// ── Queries ────────────────────────────────────────────────────────────

func pgListTags(db *sql.DB, workspaceID string) ([]Tag, error) {
	rows, err := db.Query(
		`SELECT id, workspace_id, name, color, scope, created_at FROM tags WHERE workspace_id = $1 ORDER BY name`,
		workspaceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []Tag
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Color, &t.Scope, &t.CreatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

func pgCreateTag(db *sql.DB, workspaceID, name, color, scope string) (*Tag, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, errBadRequest("nome da tag é obrigatório")
	}
	if color == "" {
		color = "#6366f1"
	}
	if scope == "" {
		scope = "both"
	}
	var t Tag
	err := db.QueryRow(
		`INSERT INTO tags (workspace_id, name, color, scope) VALUES ($1, $2, $3, $4)
		 ON CONFLICT (workspace_id, name) DO UPDATE SET color = EXCLUDED.color, scope = EXCLUDED.scope
		 RETURNING id, workspace_id, name, color, scope, created_at`,
		workspaceID, name, color, scope,
	).Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Color, &t.Scope, &t.CreatedAt)
	return &t, err
}

func pgUpdateTag(db *sql.DB, tagID, name, color, scope string) (*Tag, error) {
	var t Tag
	err := db.QueryRow(
		`UPDATE tags SET name = COALESCE(NULLIF($2, ''), name), color = COALESCE(NULLIF($3, ''), color), scope = COALESCE(NULLIF($4, ''), scope)
		 WHERE id = $1
		 RETURNING id, workspace_id, name, color, scope, created_at`,
		tagID, name, color, scope,
	).Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Color, &t.Scope, &t.CreatedAt)
	return &t, err
}

func pgDeleteTag(db *sql.DB, tagID string) error {
	_, err := db.Exec(`DELETE FROM tags WHERE id = $1`, tagID)
	return err
}

// ── Tags em Contatos ───────────────────────────────────────────────────

func pgAddContactTag(db *sql.DB, contactID, tagID string) error {
	_, err := db.Exec(
		`INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		contactID, tagID,
	)
	return err
}

func pgRemoveContactTag(db *sql.DB, contactID, tagID string) error {
	_, err := db.Exec(`DELETE FROM contact_tags WHERE contact_id = $1 AND tag_id = $2`, contactID, tagID)
	return err
}

func pgListContactTags(db *sql.DB, contactID string) ([]Tag, error) {
	rows, err := db.Query(
		`SELECT t.id, t.workspace_id, t.name, t.color, t.scope, t.created_at
		 FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id
		 WHERE ct.contact_id = $1 ORDER BY t.name`,
		contactID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []Tag
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Color, &t.Scope, &t.CreatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

// ── Tags em Conversas ──────────────────────────────────────────────────

func pgAddConversationTag(db *sql.DB, conversationID, tagID string) error {
	_, err := db.Exec(
		`INSERT INTO conversation_tags (conversation_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
		conversationID, tagID,
	)
	return err
}

func pgRemoveConversationTag(db *sql.DB, conversationID, tagID string) error {
	_, err := db.Exec(
		`DELETE FROM conversation_tags WHERE conversation_id = $1 AND tag_id = $2`,
		conversationID, tagID,
	)
	return err
}

func pgListConversationTags(db *sql.DB, conversationID string) ([]Tag, error) {
	rows, err := db.Query(
		`SELECT t.id, t.workspace_id, t.name, t.color, t.scope, t.created_at
		 FROM tags t JOIN conversation_tags ct ON ct.tag_id = t.id
		 WHERE ct.conversation_id = $1 ORDER BY t.name`,
		conversationID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tags []Tag
	for rows.Next() {
		var t Tag
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.Color, &t.Scope, &t.CreatedAt); err != nil {
			return nil, err
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

// ── Helpers ────────────────────────────────────────────────────────────

type badRequestError struct{ msg string }

func (e *badRequestError) Error() string { return e.msg }
func errBadRequest(msg string) error     { return &badRequestError{msg: msg} }

// ── HTTP Handlers ──────────────────────────────────────────────────────

func (s *server) handleListTags(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	if wid == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id obrigatório"})
		return
	}
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	tags, err := pgListTags(db, wid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if tags == nil {
		tags = []Tag{}
	}
	writeJSON(w, http.StatusOK, tags)
}

func (s *server) handleCreateTag(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
		Scope string `json:"scope"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body inválido"})
		return
	}
	tag, err := pgCreateTag(db, wid, body.Name, body.Color, body.Scope)
	if err != nil {
		if _, ok := err.(*badRequestError); ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusCreated, tag)
}

func (s *server) handleUpdateTag(w http.ResponseWriter, r *http.Request) {
	tagID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	var body struct {
		Name  string `json:"name"`
		Color string `json:"color"`
		Scope string `json:"scope"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body inválido"})
		return
	}
	tag, err := pgUpdateTag(db, tagID, body.Name, body.Color, body.Scope)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, tag)
}

func (s *server) handleDeleteTag(w http.ResponseWriter, r *http.Request) {
	tagID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	if err := pgDeleteTag(db, tagID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ── Handlers para tags em entidades ────────────────────────────────────

func (s *server) handleAddContactTag(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	var body struct {
		TagID string `json:"tag_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.TagID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "tag_id obrigatório"})
		return
	}
	if err := pgAddContactTag(db, contactID, body.TagID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleRemoveContactTag(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")
	tagID := r.PathValue("tagId")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	if err := pgRemoveContactTag(db, contactID, tagID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (s *server) handleListContactTags(w http.ResponseWriter, r *http.Request) {
	contactID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	tags, err := pgListContactTags(db, contactID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if tags == nil {
		tags = []Tag{}
	}
	writeJSON(w, http.StatusOK, tags)
}
