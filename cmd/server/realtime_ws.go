package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		return true // CORS é validado pelo middleware withCORS
	},
}

// WSClient representa uma conexão WebSocket ativa de um operador frontend.
type WSClient struct {
	hub         *RealtimeHub
	conn        *websocket.Conn
	workspaceID string
	userID      string
	send        chan []byte
}

// RealtimeHub gerencia os clientes conectados e o Redis Pub/Sub por workspace.
type RealtimeHub struct {
	rdb     *redis.Client
	log     *slog.Logger
	clients map[string]map[*WSClient]bool // workspace_id -> set of clients
	mu      sync.RWMutex
	ctx     context.Context
	cancel  context.CancelFunc
}

func NewRealtimeHub(ctx context.Context, rdb *redis.Client, log *slog.Logger) *RealtimeHub {
	hubCtx, cancel := context.WithCancel(ctx)
	hub := &RealtimeHub{
		rdb:     rdb,
		log:     log,
		clients: make(map[string]map[*WSClient]bool),
		ctx:     hubCtx,
		cancel:  cancel,
	}
	return hub
}

func (h *RealtimeHub) register(c *WSClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.clients[c.workspaceID]; !ok {
		h.clients[c.workspaceID] = make(map[*WSClient]bool)
		// Inicia subscriber do Redis Pub/Sub para este workspace se Redis estiver ativo
		if h.rdb != nil {
			go h.subscribeRedis(c.workspaceID)
		}
	}
	h.clients[c.workspaceID][c] = true
	h.log.Debug("[WS] Cliente conectado", "workspace", c.workspaceID, "user", c.userID, "total", len(h.clients[c.workspaceID]))
}

func (h *RealtimeHub) unregister(c *WSClient) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if wsGroup, ok := h.clients[c.workspaceID]; ok {
		delete(wsGroup, c)
		close(c.send)
		if len(wsGroup) == 0 {
			delete(h.clients, c.workspaceID)
		}
	}
	h.log.Debug("[WS] Cliente desconectado", "workspace", c.workspaceID, "user", c.userID)
}

// Broadcast envia uma mensagem para todos os clientes conectados de um workspace.
func (h *RealtimeHub) Broadcast(workspaceID string, payload []byte) {
	// Se Redis estiver disponível, publica no canal Redis para atingir todas as instâncias em cluster
	if h.rdb != nil {
		channel := "ws:workspace:" + workspaceID
		if err := h.rdb.Publish(h.ctx, channel, payload).Err(); err != nil {
			h.log.Warn("[WS PubSub] Falha ao publicar no Redis, despachando localmente", "err", err)
			h.broadcastLocal(workspaceID, payload)
		}
		return
	}
	h.broadcastLocal(workspaceID, payload)
}

func (h *RealtimeHub) broadcastLocal(workspaceID string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	clients, ok := h.clients[workspaceID]
	if !ok {
		return
	}
	for client := range clients {
		select {
		case client.send <- payload:
		default:
			// Buffer cheio, desconecta cliente lento
			close(client.send)
			delete(clients, client)
		}
	}
}

func (h *RealtimeHub) subscribeRedis(workspaceID string) {
	if h.rdb == nil {
		return
	}
	channel := "ws:workspace:" + workspaceID
	pubsub := h.rdb.Subscribe(h.ctx, channel)
	defer pubsub.Close()

	ch := pubsub.Channel()
	for {
		select {
		case <-h.ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			h.broadcastLocal(workspaceID, []byte(msg.Payload))
		}
	}
}

func (h *RealtimeHub) Close() {
	h.cancel()
}

// ── Leitura e Escrita do Cliente WebSocket ─────────────────────────────

func (c *WSClient) readPump() {
	defer func() {
		c.hub.unregister(c)
		_ = c.conn.Close()
	}()

	c.conn.SetReadLimit(65536)
	_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		var inMsg struct {
			Type           string `json:"type"`
			ConversationID string `json:"conversation_id,omitempty"`
			IsTyping       bool   `json:"is_typing,omitempty"`
			MessageID      string `json:"message_id,omitempty"`
		}
		if err := json.Unmarshal(message, &inMsg); err != nil {
			continue
		}

		switch inMsg.Type {
		case "ping":
			c.send <- []byte(`{"type":"pong"}`)
		case "typing":
			// Reencaminha typing indicator para todos os outros atendentes do workspace
			outJSON, _ := json.Marshal(map[string]interface{}{
				"type":            "typing",
				"conversation_id": inMsg.ConversationID,
				"sender_id":       c.userID,
				"is_typing":       inMsg.IsTyping,
			})
			c.hub.Broadcast(c.workspaceID, outJSON)
		}
	}
}

func (c *WSClient) writePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ── HTTP Handler para conexão WebSocket ────────────────────────────────

func (s *server) handleWorkspaceWS(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	if wid == "" {
		http.Error(w, "workspace_id obrigatório", http.StatusBadRequest)
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		s.log.Warn("[WS] Falha ao fazer upgrade da conexão", "err", err)
		return
	}

	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		userID = "anonymous"
	}

	client := &WSClient{
		hub:         s.hub,
		conn:        conn,
		workspaceID: wid,
		userID:      userID,
		send:        make(chan []byte, 256),
	}

	s.hub.register(client)

	// Boas-vindas
	welcome, _ := json.Marshal(map[string]interface{}{
		"type":         "connected",
		"workspace_id": wid,
		"timestamp":    time.Now().UnixMilli(),
	})
	client.send <- welcome

	go client.writePump()
	go client.readPump()
}
