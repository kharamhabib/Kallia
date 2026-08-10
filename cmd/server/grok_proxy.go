package main

import (
	"net/http"
	"net/url"
	"time"

	"github.com/gorilla/websocket"
)

// Proxy do xAI Grok Live: a API key do Grok fica SOMENTE no servidor (criptografada).
// O navegador conecta neste endpoint (autenticado por ticket ou X-API-Key)
// e o servidor injeta o header de autorização na conexão com a xAI.
//
//	GET /api/sessions/{sid}/grok/ws → proxy WebSocket (Grok Speech to Speech)

var grokWSUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (s *server) handleGrokWS(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r.PathValue("sid"))
	if sess == nil {
		return
	}

	projectID := sess.projectID
	if projectID == "" {
		projectID = "default"
	}

	row, err := s.sessions.store.getAIProvider(r.Context(), projectID, "grok")
	if err != nil || row == nil || !row.Enabled || row.EncryptedAPIKey == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "grok api key não configurada ou desativada"})
		return
	}

	apiKey, err := decryptSecret(row.EncryptedAPIKey)
	if err != nil || apiKey == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "falha ao descriptografar chave do grok"})
		return
	}

	clientConn, err := grokWSUpgrader.Upgrade(w, r, nil)
	if err != nil {
		s.log.Warn("grok proxy: upgrade falhou", "err", err)
		return
	}

	model := row.DefaultModel
	if model == "" {
		model = "grok-voice-latest"
	}

	u, _ := url.Parse("wss://api.x.ai/v1/realtime")
	q := u.Query()
	q.Set("model", model)
	u.RawQuery = q.Encode()

	headers := http.Header{}
	headers.Set("Authorization", "Bearer "+apiKey)

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	grokConn, resp, err := dialer.DialContext(r.Context(), u.String(), headers)
	if err != nil {
		status := 0
		if resp != nil {
			status = resp.StatusCode
		}
		s.log.Error("grok proxy: dial na xAI falhou", "status", status, "err", err)
		_ = clientConn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "upstream grok indisponível"))
		_ = clientConn.Close()
		return
	}

	s.log.Info("grok proxy: sessão WebSocket intermediada", "session", sess.id, "model", model)

	done := make(chan struct{}, 2)
	proxy := func(dst, src *websocket.Conn) {
		defer func() { done <- struct{}{} }()
		for {
			msgType, data, err := src.ReadMessage()
			if err != nil {
				_ = dst.WriteMessage(websocket.CloseMessage,
					websocket.FormatCloseMessage(websocket.CloseNormalClosure, ""))
				return
			}
			if err := dst.WriteMessage(msgType, data); err != nil {
				return
			}
		}
	}

	go proxy(grokConn, clientConn) // cliente → Grok
	go proxy(clientConn, grokConn) // Grok → cliente

	<-done
	_ = clientConn.Close()
	_ = grokConn.Close()
}
