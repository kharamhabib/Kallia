package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"
)

// Inbox representa um canal de comunicação configurado no workspace.
type Inbox struct {
	ID            string                 `json:"id"`
	WorkspaceID   string                 `json:"workspace_id"`
	ChannelType   string                 `json:"channel_type"` // "whatsapp", "instagram", "email", "telegram"
	Name          string                 `json:"name"`
	ChannelConfig map[string]interface{} `json:"channel_config"`
	SessionID     string                 `json:"session_id,omitempty"`
	Active        bool                   `json:"active"`
	CreatedAt     time.Time              `json:"created_at"`
}

// Conversation representa uma thread de atendimento unificada cross-canal.
type Conversation struct {
	ID           string                 `json:"id"`
	WorkspaceID  string                 `json:"workspace_id"`
	InboxID      string                 `json:"inbox_id"`
	ContactID    string                 `json:"contact_id"`
	Contact      *PGContact             `json:"contact,omitempty"`
	Status       string                 `json:"status"` // "open", "pending", "resolved", "snoozed"
	Priority     string                 `json:"priority"`
	AssigneeID   string                 `json:"assignee_id,omitempty"`
	AIActive     bool                   `json:"ai_active"`
	ChatAgentID  string                 `json:"chat_agent_id,omitempty"`
	LastMsgAt    time.Time              `json:"last_msg_at"`
	CustomAttrs  map[string]interface{} `json:"custom_attrs"`
	Tags         []Tag                  `json:"tags,omitempty"`
	LastMessage  *Message               `json:"last_message,omitempty"`
	UnreadCount  int                    `json:"unread_count"`
	CreatedAt    time.Time              `json:"created_at"`
}

// Message representa uma mensagem na timeline de uma conversa.
type Message struct {
	ID             string                 `json:"id"`
	ConversationID string                 `json:"conversation_id"`
	SenderType     string                 `json:"sender_type"` // "contact", "agent", "ai", "system"
	SenderID       string                 `json:"sender_id,omitempty"`
	Content        string                 `json:"content"`
	ContentType    string                 `json:"content_type"` // "text", "image", "audio", "video", "document", "location", "interactive", "note"
	MediaURL       string                 `json:"media_url,omitempty"`
	ExternalID     string                 `json:"external_id,omitempty"`
	Status         string                 `json:"status"` // "sent", "delivered", "read", "failed"
	Metadata       map[string]interface{} `json:"metadata"`
	CreatedAt      time.Time              `json:"created_at"`
}

// ── Inboxes ────────────────────────────────────────────────────────────

func pgEnsureInbox(db *sql.DB, workspaceID, channelType, name, sessionID string) (*Inbox, error) {
	var in Inbox
	var cfgJSON []byte
	query := `
		INSERT INTO inboxes (workspace_id, channel_type, name, session_id, active)
		VALUES ($1, $2, $3, $4, true)
		ON CONFLICT (id) DO NOTHING
		RETURNING id, workspace_id, channel_type, name, channel_config, session_id, active, created_at
	`
	// Tenta buscar inbox existente para esta sessão
	err := db.QueryRow(
		`SELECT id, workspace_id, channel_type, name, channel_config, COALESCE(session_id, ''), active, created_at
		 FROM inboxes WHERE workspace_id = $1 AND (session_id = $2 OR (session_id IS NULL AND channel_type = $3))
		 LIMIT 1`,
		workspaceID, sessionID, channelType,
	).Scan(&in.ID, &in.WorkspaceID, &in.ChannelType, &in.Name, &cfgJSON, &in.SessionID, &in.Active, &in.CreatedAt)

	if err == nil {
		if len(cfgJSON) > 0 {
			_ = json.Unmarshal(cfgJSON, &in.ChannelConfig)
		}
		return &in, nil
	}

	// Cria se não existir
	err = db.QueryRow(query, workspaceID, channelType, name, sessionID).Scan(
		&in.ID, &in.WorkspaceID, &in.ChannelType, &in.Name, &cfgJSON, &in.SessionID, &in.Active, &in.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(cfgJSON) > 0 {
		_ = json.Unmarshal(cfgJSON, &in.ChannelConfig)
	}
	return &in, nil
}

func pgListInboxes(db *sql.DB, workspaceID string) ([]Inbox, error) {
	rows, err := db.Query(
		`SELECT id, workspace_id, channel_type, name, channel_config, COALESCE(session_id, ''), active, created_at
		 FROM inboxes WHERE workspace_id = $1 AND active = true ORDER BY name`,
		workspaceID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Inbox
	for rows.Next() {
		var in Inbox
		var cfgJSON []byte
		if err := rows.Scan(&in.ID, &in.WorkspaceID, &in.ChannelType, &in.Name, &cfgJSON, &in.SessionID, &in.Active, &in.CreatedAt); err != nil {
			return nil, err
		}
		if len(cfgJSON) > 0 {
			_ = json.Unmarshal(cfgJSON, &in.ChannelConfig)
		}
		list = append(list, in)
	}
	return list, rows.Err()
}

// ── Conversas ──────────────────────────────────────────────────────────

func pgListConversations(db *sql.DB, workspaceID string, status string, assigneeID string, channelType string, tagID string, search string, limit, offset int) ([]Conversation, int, error) {
	if limit <= 0 {
		limit = 30
	}

	where := []string{"conv.workspace_id = $1"}
	args := []interface{}{workspaceID}
	argIdx := 2

	if status != "" && status != "all" {
		where = append(where, fmt.Sprintf("conv.status = $%d", argIdx))
		args = append(args, status)
		argIdx++
	}

	if assigneeID == "unassigned" {
		where = append(where, "(conv.assignee_id IS NULL OR conv.assignee_id = '')")
	} else if assigneeID != "" && assigneeID != "all" {
		where = append(where, fmt.Sprintf("conv.assignee_id = $%d", argIdx))
		args = append(args, assigneeID)
		argIdx++
	}

	if channelType != "" && channelType != "all" {
		where = append(where, fmt.Sprintf("inb.channel_type = $%d", argIdx))
		args = append(args, channelType)
		argIdx++
	}

	if tagID != "" {
		where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM conversation_tags cvt WHERE cvt.conversation_id = conv.id AND cvt.tag_id = $%d)", argIdx))
		args = append(args, tagID)
		argIdx++
	}

	if search != "" {
		where = append(where, fmt.Sprintf("(ct.name ILIKE $%d OR ct.phone ILIKE $%d)", argIdx, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	whereClause := strings.Join(where, " AND ")

	// Total count
	countQuery := fmt.Sprintf(
		`SELECT COUNT(*) FROM conversations conv
		 JOIN contacts ct ON ct.id = conv.contact_id
		 LEFT JOIN inboxes inb ON inb.id = conv.inbox_id
		 WHERE %s`,
		whereClause,
	)
	var total int
	if err := db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	query := fmt.Sprintf(
		`SELECT conv.id, conv.workspace_id, conv.inbox_id, conv.contact_id, conv.status,
		        conv.priority, COALESCE(conv.assignee_id, ''), conv.ai_active, COALESCE(conv.chat_agent_id::text, ''),
		        conv.last_msg_at, conv.custom_attrs, conv.created_at,
		        ct.name, ct.phone, COALESCE(ct.email, ''), COALESCE(ct.avatar_url, '')
		 FROM conversations conv
		 JOIN contacts ct ON ct.id = conv.contact_id
		 LEFT JOIN inboxes inb ON inb.id = conv.inbox_id
		 WHERE %s
		 ORDER BY conv.last_msg_at DESC
		 LIMIT $%d OFFSET $%d`,
		whereClause, argIdx, argIdx+1,
	)
	args = append(args, limit, offset)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var convs []Conversation
	for rows.Next() {
		var c Conversation
		var contact PGContact
		var customJSON []byte
		if err := rows.Scan(
			&c.ID, &c.WorkspaceID, &c.InboxID, &c.ContactID, &c.Status,
			&c.Priority, &c.AssigneeID, &c.AIActive, &c.ChatAgentID,
			&c.LastMsgAt, &customJSON, &c.CreatedAt,
			&contact.Name, &contact.Phone, &contact.Email, &contact.AvatarURL,
		); err != nil {
			return nil, 0, err
		}
		contact.ID = c.ContactID
		c.Contact = &contact
		if len(customJSON) > 0 {
			_ = json.Unmarshal(customJSON, &c.CustomAttrs)
		}
		convs = append(convs, c)
	}

	// Carregar tags e última mensagem para cada conversa
	if len(convs) > 0 {
		for i := range convs {
			tags, _ := pgListConversationTags(db, convs[i].ID)
			convs[i].Tags = tags
			if convs[i].Tags == nil {
				convs[i].Tags = []Tag{}
			}

			// Última mensagem
			var lastMsg Message
			var metaJSON []byte
			err := db.QueryRow(
				`SELECT id, conversation_id, sender_type, COALESCE(sender_id, ''), content, content_type, COALESCE(media_url, ''), status, metadata, created_at
				 FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 1`,
				convs[i].ID,
			).Scan(
				&lastMsg.ID, &lastMsg.ConversationID, &lastMsg.SenderType, &lastMsg.SenderID,
				&lastMsg.Content, &lastMsg.ContentType, &lastMsg.MediaURL, &lastMsg.Status,
				&metaJSON, &lastMsg.CreatedAt,
			)
			if err == nil {
				if len(metaJSON) > 0 {
					_ = json.Unmarshal(metaJSON, &lastMsg.Metadata)
				}
				convs[i].LastMessage = &lastMsg
			}
		}
	}

	return convs, total, rows.Err()
}

func pgGetOrCreateConversation(db *sql.DB, workspaceID, inboxID, contactID string) (*Conversation, error) {
	var c Conversation
	var customJSON []byte
	query := `
		SELECT id, workspace_id, inbox_id, contact_id, status, priority, COALESCE(assignee_id, ''), ai_active,
		       COALESCE(chat_agent_id::text, ''), last_msg_at, custom_attrs, created_at
		FROM conversations
		WHERE workspace_id = $1 AND inbox_id = $2 AND contact_id = $3
		ORDER BY last_msg_at DESC LIMIT 1
	`
	err := db.QueryRow(query, workspaceID, inboxID, contactID).Scan(
		&c.ID, &c.WorkspaceID, &c.InboxID, &c.ContactID, &c.Status,
		&c.Priority, &c.AssigneeID, &c.AIActive, &c.ChatAgentID,
		&c.LastMsgAt, &customJSON, &c.CreatedAt,
	)
	if err == nil {
		if len(customJSON) > 0 {
			_ = json.Unmarshal(customJSON, &c.CustomAttrs)
		}
		return &c, nil
	}

	// Cria nova conversa
	insertQuery := `
		INSERT INTO conversations (workspace_id, inbox_id, contact_id, status, last_msg_at)
		VALUES ($1, $2, $3, 'open', now())
		RETURNING id, workspace_id, inbox_id, contact_id, status, priority, COALESCE(assignee_id, ''), ai_active,
		          COALESCE(chat_agent_id::text, ''), last_msg_at, custom_attrs, created_at
	`
	err = db.QueryRow(insertQuery, workspaceID, inboxID, contactID).Scan(
		&c.ID, &c.WorkspaceID, &c.InboxID, &c.ContactID, &c.Status,
		&c.Priority, &c.AssigneeID, &c.AIActive, &c.ChatAgentID,
		&c.LastMsgAt, &customJSON, &c.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(customJSON) > 0 {
		_ = json.Unmarshal(customJSON, &c.CustomAttrs)
	}
	return &c, nil
}

// ── Mensagens ──────────────────────────────────────────────────────────

func pgListMessages(db *sql.DB, conversationID string, limit int, beforeTime string) ([]Message, error) {
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	where := "conversation_id = $1"
	args := []interface{}{conversationID}

	if beforeTime != "" {
		where += " AND created_at < $2"
		args = append(args, beforeTime)
	}

	query := fmt.Sprintf(
		`SELECT id, conversation_id, sender_type, COALESCE(sender_id, ''), content, content_type,
		        COALESCE(media_url, ''), COALESCE(external_id, ''), status, metadata, created_at
		 FROM messages
		 WHERE %s
		 ORDER BY created_at DESC
		 LIMIT %d`,
		where, limit,
	)

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []Message
	for rows.Next() {
		var m Message
		var metaJSON []byte
		if err := rows.Scan(
			&m.ID, &m.ConversationID, &m.SenderType, &m.SenderID,
			&m.Content, &m.ContentType, &m.MediaURL, &m.ExternalID,
			&m.Status, &metaJSON, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		if len(metaJSON) > 0 {
			_ = json.Unmarshal(metaJSON, &m.Metadata)
		}
		if m.Metadata == nil {
			m.Metadata = make(map[string]interface{})
		}
		msgs = append(msgs, m)
	}

	// Inverte para retornar em ordem cronológica ascendente
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}

	return msgs, rows.Err()
}

func pgCreateMessage(db *sql.DB, hub *RealtimeHub, msg Message, workspaceID string) (*Message, error) {
	if msg.ContentType == "" {
		msg.ContentType = "text"
	}
	if msg.Status == "" {
		msg.Status = "sent"
	}
	metaJSON, _ := json.Marshal(msg.Metadata)
	if len(metaJSON) == 0 {
		metaJSON = []byte("{}")
	}

	var res Message
	var resMeta []byte
	query := `
		INSERT INTO messages (conversation_id, sender_type, sender_id, content, content_type, media_url, external_id, status, metadata, created_at)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, NULLIF($6, ''), NULLIF($7, ''), $8, $9, now())
		RETURNING id, conversation_id, sender_type, COALESCE(sender_id, ''), content, content_type,
		          COALESCE(media_url, ''), COALESCE(external_id, ''), status, metadata, created_at
	`
	err := db.QueryRow(
		query,
		msg.ConversationID, msg.SenderType, msg.SenderID, msg.Content, msg.ContentType,
		msg.MediaURL, msg.ExternalID, msg.Status, metaJSON,
	).Scan(
		&res.ID, &res.ConversationID, &res.SenderType, &res.SenderID, &res.Content, &res.ContentType,
		&res.MediaURL, &res.ExternalID, &res.Status, &resMeta, &res.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	if len(resMeta) > 0 {
		_ = json.Unmarshal(resMeta, &res.Metadata)
	}

	// Atualiza conversa: last_msg_at e reabre se estiver resolvida (quando a mensagem é do cliente)
	reopenClause := ""
	if msg.SenderType == "contact" {
		reopenClause = ", status = 'open'"
	}
	_, _ = db.Exec(
		fmt.Sprintf("UPDATE conversations SET last_msg_at = now()%s WHERE id = $1", reopenClause),
		msg.ConversationID,
	)

	// Broadcast via WebSocket para todos os atendentes conectados
	if hub != nil && workspaceID != "" {
		wsEvent, _ := json.Marshal(map[string]interface{}{
			"type":            "message:created",
			"conversation_id": msg.ConversationID,
			"message":         res,
		})
		hub.Broadcast(workspaceID, wsEvent)
	}

	return &res, nil
}

// ── Ingestão de Mensagens do WhatsApp para PostgreSQL ───────────────────

func pgIngestWhatsAppMessage(db *sql.DB, hub *RealtimeHub, workspaceID, sessionID, remotePhone, contactName, text, mediaURL, contentType string, isFromMe bool, externalID string) error {
	if db == nil || workspaceID == "" {
		return nil
	}

	// 1. Obter ou criar contato
	contact, err := pgGetOrCreateContact(db, workspaceID, remotePhone, contactName)
	if err != nil {
		return fmt.Errorf("contato: %w", err)
	}

	// 2. Obter ou criar inbox WhatsApp da sessão
	inbox, err := pgEnsureInbox(db, workspaceID, "whatsapp", "WhatsApp", sessionID)
	if err != nil {
		return fmt.Errorf("inbox: %w", err)
	}

	// 3. Obter ou criar conversa ativa
	conv, err := pgGetOrCreateConversation(db, workspaceID, inbox.ID, contact.ID)
	if err != nil {
		return fmt.Errorf("conversa: %w", err)
	}

	// 4. Inserir mensagem
	senderType := "contact"
	if isFromMe {
		senderType = "agent"
	}
	if contentType == "" {
		contentType = "text"
	}

	_, err = pgCreateMessage(db, hub, Message{
		ConversationID: conv.ID,
		SenderType:     senderType,
		Content:        text,
		ContentType:    contentType,
		MediaURL:       mediaURL,
		ExternalID:     externalID,
		Status:         "delivered",
	}, workspaceID)

	return err
}

// ── HTTP Handlers para /api/workspaces/{wid}/conversations ──────────────

func (s *server) handleListInboxes(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusOK, []Inbox{})
		return
	}
	inboxes, err := pgListInboxes(db, wid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if inboxes == nil {
		inboxes = []Inbox{}
	}
	writeJSON(w, http.StatusOK, inboxes)
}

func (s *server) handleListConversations(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"items": []Conversation{}, "total": 0})
		return
	}

	q := r.URL.Query()
	status := q.Get("status")
	assigneeID := q.Get("assignee_id")
	channelType := q.Get("channel_type")
	tagID := q.Get("tag_id")
	search := q.Get("search")
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	convs, total, err := pgListConversations(db, wid, status, assigneeID, channelType, tagID, search, limit, offset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if convs == nil {
		convs = []Conversation{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": convs,
		"total": total,
	})
}

func (s *server) handleGetConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}

	var c Conversation
	var contact PGContact
	var customJSON []byte
	query := `
		SELECT conv.id, conv.workspace_id, conv.inbox_id, conv.contact_id, conv.status,
		       conv.priority, COALESCE(conv.assignee_id, ''), conv.ai_active, COALESCE(conv.chat_agent_id::text, ''),
		       conv.last_msg_at, conv.custom_attrs, conv.created_at,
		       ct.name, ct.phone, COALESCE(ct.email, ''), COALESCE(ct.avatar_url, '')
		FROM conversations conv
		JOIN contacts ct ON ct.id = conv.contact_id
		WHERE conv.id = $1
	`
	err := db.QueryRow(query, id).Scan(
		&c.ID, &c.WorkspaceID, &c.InboxID, &c.ContactID, &c.Status,
		&c.Priority, &c.AssigneeID, &c.AIActive, &c.ChatAgentID,
		&c.LastMsgAt, &customJSON, &c.CreatedAt,
		&contact.Name, &contact.Phone, &contact.Email, &contact.AvatarURL,
	)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "conversa não encontrada"})
		return
	}
	contact.ID = c.ContactID
	c.Contact = &contact
	if len(customJSON) > 0 {
		_ = json.Unmarshal(customJSON, &c.CustomAttrs)
	}
	tags, _ := pgListConversationTags(db, c.ID)
	c.Tags = tags
	if c.Tags == nil {
		c.Tags = []Tag{}
	}

	writeJSON(w, http.StatusOK, c)
}

func (s *server) handleListMessages(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusOK, []Message{})
		return
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	beforeTime := r.URL.Query().Get("before")

	msgs, err := pgListMessages(db, id, limit, beforeTime)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if msgs == nil {
		msgs = []Message{}
	}

	writeJSON(w, http.StatusOK, msgs)
}

func (s *server) handleSendMessage(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}

	var body struct {
		Content     string `json:"content"`
		ContentType string `json:"content_type"` // "text", "note", "image", "audio", "document"
		MediaURL    string `json:"media_url,omitempty"`
		Base64      string `json:"base64,omitempty"`
		FileName    string `json:"file_name,omitempty"`
		Mimetype    string `json:"mimetype,omitempty"`
		SenderID    string `json:"sender_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body inválido"})
		return
	}
	if body.ContentType == "" {
		body.ContentType = "text"
	}
	if body.Content == "" && body.Base64 == "" && body.MediaURL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "conteúdo ou arquivo de mídia obrigatório"})
		return
	}

	// 1. Obter conversa para saber workspace, inbox e telefone de destino
	var workspaceID, inboxID, contactPhone, sessionID string
	err := db.QueryRow(
		`SELECT conv.workspace_id, conv.inbox_id, ct.phone, COALESCE(inb.session_id, '')
		 FROM conversations conv
		 JOIN contacts ct ON ct.id = conv.contact_id
		 LEFT JOIN inboxes inb ON inb.id = conv.inbox_id
		 WHERE conv.id = $1`,
		convID,
	).Scan(&workspaceID, &inboxID, &contactPhone, &sessionID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "conversa não encontrada"})
		return
	}

	senderType := "agent"
	if body.ContentType == "note" {
		senderType = "system"
	}

	// 2. Se for mensagem externa (não nota interna) e tiver sessão WhatsApp ativa, dispara pelo whatsmeow
	var externalID string
	if body.ContentType != "note" && sessionID != "" && contactPhone != "" {
		sess, _ := s.sessions.Get(sessionID)
		if sess != nil && sess.getClient() != nil && sess.getClient().Store.ID != nil {
			jid, err := resolveRecipient(contactPhone)
			if err == nil {
				var waMsg *waE2E.Message
				switch body.ContentType {
				case "image":
					if up, ok := s.uploadMedia(sess, w, r, body.Base64, body.MediaURL, whatsmeow.MediaImage); ok {
						mime := body.Mimetype
						if mime == "" {
							mime = "image/jpeg"
						}
						waMsg = &waE2E.Message{ImageMessage: &waE2E.ImageMessage{
							Caption: proto.String(body.Content), Mimetype: proto.String(mime),
							URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
							FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: proto.Uint64(up.FileLength),
						}}
					}
				case "audio":
					if up, ok := s.uploadMedia(sess, w, r, body.Base64, body.MediaURL, whatsmeow.MediaAudio); ok {
						mime := body.Mimetype
						if mime == "" {
							mime = "audio/ogg; codecs=opus"
						}
						waMsg = &waE2E.Message{AudioMessage: &waE2E.AudioMessage{
							Mimetype: proto.String(mime), PTT: proto.Bool(true),
							URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
							FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: proto.Uint64(up.FileLength),
						}}
					}
				case "document":
					if up, ok := s.uploadMedia(sess, w, r, body.Base64, body.MediaURL, whatsmeow.MediaDocument); ok {
						mime := body.Mimetype
						if mime == "" {
							mime = "application/pdf"
						}
						waMsg = &waE2E.Message{DocumentMessage: &waE2E.DocumentMessage{
							Title: proto.String(body.FileName), FileName: proto.String(body.FileName), Mimetype: proto.String(mime),
							URL: &up.URL, DirectPath: &up.DirectPath, MediaKey: up.MediaKey,
							FileEncSHA256: up.FileEncSHA256, FileSHA256: up.FileSHA256, FileLength: proto.Uint64(up.FileLength),
						}}
					}
				default:
					waMsg = &waE2E.Message{Conversation: proto.String(body.Content)}
				}

				if waMsg != nil {
					resp, err := sess.getClient().SendMessage(r.Context(), jid, waMsg)
					if err == nil {
						externalID = string(resp.ID)
					}
				}
			}
		}
	}

	metadata := map[string]interface{}{}
	if body.FileName != "" {
		metadata["file_name"] = body.FileName
	}
	if body.Mimetype != "" {
		metadata["mimetype"] = body.Mimetype
	}

	// 3. Salvar no PostgreSQL e emitir WebSocket
	msg, err := pgCreateMessage(db, s.hub, Message{
		ConversationID: convID,
		SenderType:     senderType,
		SenderID:       body.SenderID,
		Content:        body.Content,
		ContentType:    body.ContentType,
		MediaURL:       body.MediaURL,
		ExternalID:     externalID,
		Status:         "sent",
		Metadata:       metadata,
	}, workspaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, msg)
}

func (s *server) handleUpdateConversation(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}

	var body struct {
		Status      *string `json:"status,omitempty"`
		Priority    *string `json:"priority,omitempty"`
		AssigneeID  *string `json:"assignee_id,omitempty"`
		AIActive    *bool   `json:"ai_active,omitempty"`
		ChatAgentID *string `json:"chat_agent_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "body inválido"})
		return
	}

	setClauses := []string{}
	args := []interface{}{id}
	argIdx := 2

	if body.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", argIdx))
		args = append(args, *body.Status)
		argIdx++
	}
	if body.Priority != nil {
		setClauses = append(setClauses, fmt.Sprintf("priority = $%d", argIdx))
		args = append(args, *body.Priority)
		argIdx++
	}
	if body.AssigneeID != nil {
		setClauses = append(setClauses, fmt.Sprintf("assignee_id = NULLIF($%d, '')", argIdx))
		args = append(args, *body.AssigneeID)
		argIdx++
	}
	if body.AIActive != nil {
		setClauses = append(setClauses, fmt.Sprintf("ai_active = $%d", argIdx))
		args = append(args, *body.AIActive)
		argIdx++
	}
	if body.ChatAgentID != nil {
		setClauses = append(setClauses, fmt.Sprintf("chat_agent_id = NULLIF($%d, '')::uuid", argIdx))
		args = append(args, *body.ChatAgentID)
		argIdx++
	}

	if len(setClauses) == 0 {
		writeJSON(w, http.StatusOK, map[string]string{"status": "no changes"})
		return
	}

	query := fmt.Sprintf("UPDATE conversations SET %s WHERE id = $1 RETURNING workspace_id", strings.Join(setClauses, ", "))
	var workspaceID string
	err := db.QueryRow(query, args...).Scan(&workspaceID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// Broadcast atualização da conversa
	if s.hub != nil && workspaceID != "" {
		event, _ := json.Marshal(map[string]interface{}{
			"type":            "conversation:updated",
			"conversation_id": id,
		})
		s.hub.Broadcast(workspaceID, event)
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleAddConversationTag(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
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
	if err := pgAddConversationTag(db, convID, body.TagID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleRemoveConversationTag(w http.ResponseWriter, r *http.Request) {
	convID := r.PathValue("id")
	tagID := r.PathValue("tagId")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}
	if err := pgRemoveConversationTag(db, convID, tagID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (s *server) handleStartConversation(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "PostgreSQL não configurado"})
		return
	}

	var body struct {
		Phone     string `json:"phone"`
		Name      string `json:"name"`
		Message   string `json:"message"`
		SessionID string `json:"session_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Phone == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "telefone obrigatório"})
		return
	}

	// 1. Criar ou obter contato
	contact, err := pgGetOrCreateContact(db, wid, body.Phone, body.Name)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// 2. Obter ou criar inbox WhatsApp
	sessionID := body.SessionID
	if sessionID == "" {
		for _, info := range s.sessions.infos() {
			if info.WorkspaceID == wid && info.State == "open" {
				sessionID = info.ID
				break
			}
		}
	}

	inbox, err := pgEnsureInbox(db, wid, "whatsapp", "WhatsApp", sessionID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// 3. Criar ou obter conversa
	conv, err := pgGetOrCreateConversation(db, wid, inbox.ID, contact.ID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	// 4. Se tiver mensagem inicial, dispara e salva
	if body.Message != "" {
		var externalID string
		if sessionID != "" {
			sess, _ := s.sessions.Get(sessionID)
			if sess != nil && sess.getClient() != nil && sess.getClient().Store.ID != nil {
				jid, err := resolveRecipient(body.Phone)
				if err == nil {
					resp, err := sess.getClient().SendMessage(r.Context(), jid, &waE2E.Message{Conversation: proto.String(body.Message)})
					if err == nil {
						externalID = string(resp.ID)
					}
				}
			}
		}

		_, _ = pgCreateMessage(db, s.hub, Message{
			ConversationID: conv.ID,
			SenderType:     "agent",
			Content:        body.Message,
			ContentType:    "text",
			ExternalID:     externalID,
			Status:         "sent",
		}, wid)
	}

	conv.Contact = contact
	writeJSON(w, http.StatusCreated, conv)
}

