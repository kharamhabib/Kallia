package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

// ── Structs da API REST do Google Gemini ─────────────────────────────────

type geminiChatPart struct {
	Text             string                 `json:"text,omitempty"`
	InlineData       *geminiInlineData      `json:"inlineData,omitempty"`
	FunctionCall     *geminiFunctionCall    `json:"functionCall,omitempty"`
	FunctionResponse *geminiFunctionResponse `json:"functionResponse,omitempty"`
}

type geminiInlineData struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type geminiFunctionCall struct {
	Name string         `json:"name"`
	Args map[string]any `json:"args"`
}

type geminiFunctionResponse struct {
	Name     string         `json:"name"`
	Response map[string]any `json:"response"`
}

type geminiChatContent struct {
	Role  string           `json:"role"` // "user", "model", "system"
	Parts []geminiChatPart `json:"parts"`
}

type geminiToolDeclaration struct {
	FunctionDeclarations []geminiFunctionDecl `json:"functionDeclarations"`
}

type geminiFunctionDecl struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

type geminiGenerateContentRequest struct {
	Contents          []geminiChatContent      `json:"contents"`
	SystemInstruction *geminiChatContent       `json:"systemInstruction,omitempty"`
	Tools             []geminiToolDeclaration `json:"tools,omitempty"`
	GenerationConfig  *geminiGenerationConfig  `json:"generationConfig,omitempty"`
}

type geminiGenerationConfig struct {
	Temperature     float32  `json:"temperature,omitempty"`
	MaxOutputTokens int      `json:"maxOutputTokens,omitempty"`
	StopSequences   []string `json:"stopSequences,omitempty"`
}

type geminiGenerateContentResponse struct {
	Candidates []struct {
		Content geminiChatContent `json:"content"`
	} `json:"candidates"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

// ── Transcrição de Áudio via Gemini Multimodal ─────────────────────────

func transcribeAudioWithGemini(ctx context.Context, apiKey, mediaPath string) (string, error) {
	if apiKey == "" {
		return "", fmt.Errorf("api key gemini vazia")
	}

	audioBytes, err := os.ReadFile(mediaPath)
	if err != nil {
		return "", fmt.Errorf("ler arquivo áudio: %w", err)
	}

	mimeType := "audio/ogg"
	ext := strings.ToLower(filepath.Ext(mediaPath))
	switch ext {
	case ".mp3":
		mimeType = "audio/mp3"
	case ".wav":
		mimeType = "audio/wav"
	case ".mp4", ".m4a":
		mimeType = "audio/mp4"
	case ".webm":
		mimeType = "audio/webm"
	}

	b64Audio := base64.StdEncoding.EncodeToString(audioBytes)

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=%s", apiKey)
	reqBody := geminiGenerateContentRequest{
		Contents: []geminiChatContent{
			{
				Role: "user",
				Parts: []geminiChatPart{
					{
						InlineData: &geminiInlineData{
							MimeType: mimeType,
							Data:     b64Audio,
						},
					},
					{
						Text: "Transcreva com máxima fidelidade o que foi falado neste áudio em português. Retorne estritamente o texto da transcrição sem comentários adicionais.",
					},
				},
			},
		},
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBytes))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("requisição transcrição: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("erro transcrição (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var res geminiGenerateContentResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return "", fmt.Errorf("unmarshal transcrição: %w", err)
	}

	if len(res.Candidates) > 0 && len(res.Candidates[0].Content.Parts) > 0 {
		return strings.TrimSpace(res.Candidates[0].Content.Parts[0].Text), nil
	}

	return "", fmt.Errorf("resposta vazia da transcrição")
}

// ── Divisão Inteligente em Balões Naturais (Anti-Textão) ────────────────

func splitIntoNaturalBubbles(text string, maxBubbles int) []string {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	if maxBubbles <= 0 {
		maxBubbles = 3
	}

	// 1. Tenta dividir por quebras duplas de linha (\n\n)
	rawParagraphs := strings.Split(text, "\n\n")
	var paras []string
	for _, p := range rawParagraphs {
		p = strings.TrimSpace(p)
		if p != "" {
			paras = append(paras, p)
		}
	}

	if len(paras) > 1 && len(paras) <= maxBubbles {
		return paras
	}

	if len(paras) > maxBubbles {
		// Agrupa excedentes nos últimos balões
		var result []string
		groupSize := (len(paras) + maxBubbles - 1) / maxBubbles
		for i := 0; i < len(paras); i += groupSize {
			end := i + groupSize
			if end > len(paras) {
				end = len(paras)
			}
			result = append(result, strings.Join(paras[i:end], "\n\n"))
		}
		return result
	}

	// 2. Se for parágrafo único longo (> 280 caracteres), tenta quebrar por frases
	if utf8.RuneCountInString(text) > 280 && maxBubbles > 1 {
		sentences := splitIntoSentences(text)
		if len(sentences) > 1 {
			mid := len(sentences) / 2
			bubble1 := strings.Join(sentences[:mid], " ")
			bubble2 := strings.Join(sentences[mid:], " ")
			return []string{strings.TrimSpace(bubble1), strings.TrimSpace(bubble2)}
		}
	}

	return []string{text}
}

// ── Declaração de Tools do Chat Agent ────────────────────────────────────

func buildChatAgentTools() []geminiToolDeclaration {
	return []geminiToolDeclaration{
		{
			FunctionDeclarations: []geminiFunctionDecl{
				{
					Name:        "transfer_to_human",
					Description: "Transfere a conversa para um atendente humano quando solicitado pelo cliente ou quando a IA não souber responder. Pausa a IA e notifica a equipe.",
					Parameters: map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"reason": map[string]interface{}{
								"type":        "string",
								"description": "Motivo da transferência para o atendente humano.",
							},
							"notify_message": map[string]interface{}{
								"type":        "string",
								"description": "Mensagem cordial informando ao cliente que um atendente assumirá.",
							},
						},
						"required": []string{"reason"},
					},
				},
				{
					Name:        "update_contact",
					Description: "Salva ou atualiza informações cadastrais do contato no CRM (nome, e-mail, empresa, observações).",
					Parameters: map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"name": map[string]interface{}{
								"type":        "string",
								"description": "Nome completo do cliente identificado no diálogo.",
							},
							"email": map[string]interface{}{
								"type":        "string",
								"description": "E-mail do cliente.",
							},
							"company": map[string]interface{}{
								"type":        "string",
								"description": "Empresa ou organização do cliente.",
							},
							"notes": map[string]interface{}{
								"type":        "string",
								"description": "Notas importantes ou interesse específico do cliente.",
							},
						},
					},
				},
				{
					Name:        "add_tag",
					Description: "Aplica uma tag contextual na conversa ou no contato para organização da equipe (ex: 'Lead Quente', 'Suporte', 'Dúvida Preço').",
					Parameters: map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"tag_name": map[string]interface{}{
								"type":        "string",
								"description": "Nome da tag a ser aplicada.",
							},
						},
						"required": []string{"tag_name"},
					},
				},
			},
		},
	}
}

// ── Motor Central de Resposta do Agente de Chat ─────────────────────────

func executeChatAgentTurn(
	ctx context.Context,
	db *sql.DB,
	hub *RealtimeHub,
	sessManager *SessionManager,
	workspaceID, conversationID, sessionID, contactPhone string,
	accumulatedMsgs []QueuedChatMessage,
) error {
	if db == nil || workspaceID == "" || conversationID == "" {
		return nil
	}

	// 1. Carregar conversa e verificar se IA ainda está ativa
	var conv Conversation
	var contactID sql.NullString
	var chatAgentID sql.NullString
	var inboxID string

	convQuery := `
		SELECT id, workspace_id, inbox_id, contact_id, status, ai_active, chat_agent_id
		FROM conversations
		WHERE id = $1 AND workspace_id = $2
	`
	err := db.QueryRowContext(ctx, convQuery, conversationID, workspaceID).Scan(
		&conv.ID, &conv.WorkspaceID, &inboxID, &contactID, &conv.Status, &conv.AIActive, &chatAgentID,
	)
	if err != nil {
		return fmt.Errorf("obter conversa: %w", err)
	}

	if !conv.AIActive {
		return nil // IA pausada (ex: operador assumiu)
	}

	// 2. Carregar o Agente de Chat apropriado
	var agent *ChatAgent
	if chatAgentID.Valid && chatAgentID.String != "" {
		agent, _ = pgGetChatAgent(db, workspaceID, chatAgentID.String)
	}
	if agent == nil {
		agent, _ = pgGetDefaultChatAgent(db, workspaceID)
	}
	if agent == nil || !agent.Active {
		return nil // Nenhum agente de chat ativo configurado
	}

	// 3. Obter chave de API do provedor (Gemini)
	apiKey := resolveAIProviderKey(ctx, sessManager.store, workspaceID, agent.Provider)
	if apiKey == "" {
		return fmt.Errorf("chave de api para '%s' não configurada", agent.Provider)
	}

	// 4. Consolidar as mensagens recebidas e transcrever áudios se houver
	var consolidatedInput strings.Builder
	for _, m := range accumulatedMsgs {
		text := m.Content
		if (m.ContentType == "audio" || strings.HasPrefix(m.ContentType, "audio/")) && m.MediaURL != "" {
			// Resolve caminho físico da mídia
			fileName := filepath.Base(m.MediaURL)
			localPath := filepath.Join("storage", "media", workspaceID, fileName)
			if _, err := os.Stat(localPath); err == nil {
				transcription, trErr := transcribeAudioWithGemini(ctx, apiKey, localPath)
				if trErr == nil && transcription != "" {
					text = fmt.Sprintf("[Áudio do Cliente Transcrito]: %s", transcription)
					// Atualiza a mensagem na base de dados com a transcrição
					_, _ = db.ExecContext(ctx, "UPDATE messages SET content = $1 WHERE id = $2", text, m.MessageID)
					if hub != nil {
						hub.BroadcastJSON(workspaceID, map[string]interface{}{
							"type": "message:updated",
							"data": map[string]interface{}{
								"id":              m.MessageID,
								"conversation_id": conversationID,
								"content":         text,
							},
						})
					}
				}
			}
		}
		if text != "" {
			if consolidatedInput.Len() > 0 {
				consolidatedInput.WriteString("\n")
			}
			consolidatedInput.WriteString(text)
		}
	}

	userMessage := consolidatedInput.String()
	if strings.TrimSpace(userMessage) == "" {
		return nil
	}

	// 5. Obter sessão WhatsApp para presença e envio
	var sess *Session
	if sessionID != "" {
		sess, _ = sessManager.Get(sessionID)
	}
	if sess == nil || sess.getClient() == nil || sess.getClient().Store == nil || sess.getClient().Store.ID == nil {
		// Tenta encontrar qualquer sessão ativa do workspace
		for _, s := range sessManager.list() {
			if s.getWorkspaceID() == workspaceID && s.getClient() != nil && s.getClient().Store != nil && s.getClient().Store.ID != nil {
				sess = s
				break
			}
		}
	}
	if sess == nil || sess.getClient() == nil || sess.getClient().Store == nil || sess.getClient().Store.ID == nil {
		return fmt.Errorf("nenhuma sessão whatsapp pronta para envio")
	}

	chatJID := types.NewJID(contactPhone, types.DefaultUserServer)

	// Dispara presença inicial "digitando..." no WhatsApp e WebSocket
	_ = sess.getClient().SendChatPresence(ctx, chatJID, "composing", "text")
	if hub != nil {
		hub.BroadcastJSON(workspaceID, map[string]interface{}{
			"type": "typing",
			"data": map[string]interface{}{
				"conversation_id": conversationID,
				"is_typing":       true,
				"media":           "text",
			},
		})
	}

	// 6. Carregar histórico recente de mensagens (até 20 mensagens)
	historyRows, err := db.QueryContext(ctx, `
		SELECT sender_type, content, content_type
		FROM messages
		WHERE conversation_id = $1
		ORDER BY created_at DESC
		LIMIT 20
	`, conversationID)
	var historyMsgs []struct {
		SenderType  string
		Content     string
		ContentType string
	}
	if err == nil {
		for historyRows.Next() {
			var hm struct {
				SenderType  string
				Content     string
				ContentType string
			}
			if err := historyRows.Scan(&hm.SenderType, &hm.Content, &hm.ContentType); err == nil {
				historyMsgs = append(historyMsgs, hm)
			}
		}
		historyRows.Close()
	}

	// Inverte para ordem cronológica
	var contents []geminiChatContent
	for i := len(historyMsgs) - 1; i >= 0; i-- {
		hm := historyMsgs[i]
		if hm.Content == "" {
			continue
		}
		role := "user"
		if hm.SenderType == "agent" || hm.SenderType == "ai" {
			role = "model"
		}
		contents = append(contents, geminiChatContent{
			Role:  role,
			Parts: []geminiChatPart{{Text: hm.Content}},
		})
	}

	// Adiciona a mensagem atual se ainda não estiver
	if len(contents) == 0 || contents[len(contents)-1].Parts[0].Text != userMessage {
		contents = append(contents, geminiChatContent{
			Role:  "user",
			Parts: []geminiChatPart{{Text: userMessage}},
		})
	}

	// 7. RAG Semântico (pgvector)
	var ragContext strings.Builder
	if agent.RAGEnabled {
		matches, err := pgSearchSimilarKnowledge(ctx, db, sessManager.store, workspaceID, userMessage, 4)
		if err == nil && len(matches) > 0 {
			ragContext.WriteString("\n\n[BASE DE CONHECIMENTO DO WORKSPACE - Use estas informações para responder com precisão]:\n")
			for _, m := range matches {
				ragContext.WriteString(fmt.Sprintf("---\n%s\n", m.ChunkText))
			}
		}
	}

	// 8. Montar System Prompt com Diretrizes de Humanização
	var systemPrompt strings.Builder
	systemPrompt.WriteString("Você é um atendente humano corporativo e empático no WhatsApp.\n")
	if agent.SystemPrompt != "" {
		systemPrompt.WriteString(agent.SystemPrompt + "\n")
	}
	systemPrompt.WriteString(`
DIRETRIZES DE HUMANIZAÇÃO OBRIGATÓRIAS:
- Responda no estilo conversacional do WhatsApp: seja direto, prestativo, claro e cordial.
- NUNCA escreva blocos gigantescos de texto monolítico. Divida suas ideias em frases objetivas.
- Se a conversa já estiver em andamento, NÃO fique repetindo saudações formais (como "Olá! Tudo bem? Como posso ajudar?") a cada resposta.
- Se o cliente perguntar algo sobre a empresa ou produtos, use estritamente a Base de Conhecimento fornecida.
- Caso o cliente solicite falar com uma pessoa, use imediatamente a ferramenta 'transfer_to_human'.
- Ao identificar o nome ou e-mail do cliente, utilize a ferramenta 'update_contact' para salvar no CRM.
`)
	if ragContext.Len() > 0 {
		systemPrompt.WriteString(ragContext.String())
	}

	// 9. Configurar Chamada ao Gemini REST
	modelName := agent.ModelName
	if modelName == "" {
		modelName = "gemini-2.5-flash"
	}
	reqURL := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", modelName, apiKey)

	reqPayload := geminiGenerateContentRequest{
		Contents: contents,
		SystemInstruction: &geminiChatContent{
			Role:  "system",
			Parts: []geminiChatPart{{Text: systemPrompt.String()}},
		},
		GenerationConfig: &geminiGenerationConfig{
			Temperature:     agent.Temperature,
			MaxOutputTokens: agent.MaxTokens,
		},
	}
	if agent.ToolsEnabled {
		reqPayload.Tools = buildChatAgentTools()
	}

	// Loop de chamada com suporte a Function Calling (Tools)
	var finalResponseText string
	client := &http.Client{Timeout: 45 * time.Second}

	for turn := 0; turn < 3; turn++ {
		select {
		case <-ctx.Done():
			return ctx.Err() // Cancelado por nova mensagem
		default:
		}

		jsonBytes, err := json.Marshal(reqPayload)
		if err != nil {
			return err
		}

		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(jsonBytes))
		if err != nil {
			return err
		}
		httpReq.Header.Set("Content-Type", "application/json")

		resp, err := client.Do(httpReq)
		if err != nil {
			return fmt.Errorf("requisição gemini: %w", err)
		}

		respBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return fmt.Errorf("erro api gemini (%d): %s", resp.StatusCode, string(respBytes))
		}

		var geminiResp geminiGenerateContentResponse
		if err := json.Unmarshal(respBytes, &geminiResp); err != nil {
			return fmt.Errorf("unmarshal gemini resp: %w", err)
		}

		if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
			break
		}

		candidate := geminiResp.Candidates[0].Content
		reqPayload.Contents = append(reqPayload.Contents, candidate)

		var hasFunctionCall bool
		var functionResponses []geminiChatPart

		for _, part := range candidate.Parts {
			if part.FunctionCall != nil {
				hasFunctionCall = true
				fc := part.FunctionCall
				var toolResult map[string]any

				switch fc.Name {
				case "transfer_to_human":
					reason, _ := fc.Args["reason"].(string)
					_ = reason
					notifyMsg, _ := fc.Args["notify_message"].(string)
					if notifyMsg == "" {
						notifyMsg = "Certo! Estou transferindo você para um de nossos atendentes humanos. Um momento, por favor!"
					}
					// Atualiza conversa para pending e pausa IA
					_, _ = db.ExecContext(ctx, `
						UPDATE conversations
						SET status = 'pending', ai_active = false, priority = 'medium'
						WHERE id = $1 AND workspace_id = $2
					`, conversationID, workspaceID)

					if hub != nil {
						hub.BroadcastJSON(workspaceID, map[string]interface{}{
							"type": "conversation:updated",
							"data": map[string]interface{}{
								"id":        conversationID,
								"status":    "pending",
								"ai_active": false,
							},
						})
					}
					finalResponseText = notifyMsg
					toolResult = map[string]any{"status": "success", "message": "Transbordo executado com sucesso"}

				case "update_contact":
					if contactID.Valid && contactID.String != "" {
						name, _ := fc.Args["name"].(string)
						email, _ := fc.Args["email"].(string)
						company, _ := fc.Args["company"].(string)
						notes, _ := fc.Args["notes"].(string)
						if name != "" || email != "" {
							_, _ = db.ExecContext(ctx, `
								UPDATE contacts
								SET name = COALESCE(NULLIF($1, ''), name),
								    email = COALESCE(NULLIF($2, ''), email),
								    updated_at = now()
								WHERE id = $3 AND workspace_id = $4
							`, name, email, contactID.String, workspaceID)
						}
						_ = company
						_ = notes
					}
					toolResult = map[string]any{"status": "success"}

				case "add_tag":
					tagName, _ := fc.Args["tag_name"].(string)
					if tagName != "" {
						// Cria tag se não existir e vincula à conversa
						var tagID string
						_ = db.QueryRowContext(ctx, `
							INSERT INTO tags (workspace_id, name, color, scope)
							VALUES ($1, $2, '#6366f1', 'conversation')
							ON CONFLICT (workspace_id, name) DO UPDATE SET name = EXCLUDED.name
							RETURNING id
						`, workspaceID, tagName).Scan(&tagID)
						if tagID != "" {
							_, _ = db.ExecContext(ctx, `
								INSERT INTO conversation_tags (conversation_id, tag_id)
								VALUES ($1, $2) ON CONFLICT DO NOTHING
							`, conversationID, tagID)
						}
					}
					toolResult = map[string]any{"status": "success"}
				}

				functionResponses = append(functionResponses, geminiChatPart{
					FunctionResponse: &geminiFunctionResponse{
						Name:     fc.Name,
						Response: toolResult,
					},
				})
			} else if part.Text != "" {
				finalResponseText = part.Text
			}
		}

		if !hasFunctionCall {
			break
		}

		// Adiciona respostas das tools aos contents para a próxima iteração
		reqPayload.Contents = append(reqPayload.Contents, geminiChatContent{
			Role:  "user",
			Parts: functionResponses,
		})
	}

	finalResponseText = strings.TrimSpace(finalResponseText)
	if finalResponseText == "" {
		_ = sess.getClient().SendChatPresence(ctx, chatJID, "paused", "text")
		return nil
	}

	// 10. Dividir em Balões Naturais e Despachar com Delay Humano
	bubbles := splitIntoNaturalBubbles(finalResponseText, agent.MaxBubbles)

	for i, bubble := range bubbles {
		select {
		case <-ctx.Done():
			return ctx.Err() // Cancelado por nova mensagem do cliente
		default:
		}

		// Presença "digitando..."
		_ = sess.getClient().SendChatPresence(ctx, chatJID, "composing", "text")
		if hub != nil {
			hub.BroadcastJSON(workspaceID, map[string]interface{}{
				"type": "typing",
				"data": map[string]interface{}{
					"conversation_id": conversationID,
					"is_typing":       true,
					"media":           "text",
				},
			})
		}

		// Delay proporcional ao tamanho da frase (ex: 1.5s a 3.5s)
		typingDelay := time.Duration(agent.TypingDelaySec) * time.Second
		if typingDelay <= 0 {
			typingDelay = 2 * time.Second
		}
		charBonus := time.Duration(min(len(bubble)*30, 2000)) * time.Millisecond
		totalDelay := typingDelay + charBonus
		if totalDelay > 5*time.Second {
			totalDelay = 5 * time.Second
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(totalDelay):
		}

		// Enviar pelo WhatsApp whatsmeow
		waResp, sendErr := sess.getClient().SendMessage(ctx, chatJID, &waE2E.Message{
			Conversation: proto.String(bubble),
		})
		extID := ""
		if sendErr == nil && waResp.ID != "" {
			extID = waResp.ID
		}

		// Salvar mensagem no PostgreSQL
		_, _ = pgCreateMessage(db, hub, Message{
			ConversationID: conversationID,
			SenderType:     "ai",
			Content:        bubble,
			ContentType:    "text",
			ExternalID:     extID,
			Status:         "delivered",
		}, workspaceID)

		// Pausa breve entre balões se houver próximo
		if i < len(bubbles)-1 {
			time.Sleep(800 * time.Millisecond)
		}
	}

	// Pausa indicador de presença no WhatsApp e WebSocket
	_ = sess.getClient().SendChatPresence(ctx, chatJID, "paused", "text")
	if hub != nil {
		hub.BroadcastJSON(workspaceID, map[string]interface{}{
			"type": "typing",
			"data": map[string]interface{}{
				"conversation_id": conversationID,
				"is_typing":       false,
				"media":           "text",
			},
		})
	}

	return nil
}

// simulateChatAgentTurn simula o turno do Agente no Sandbox de teste sem enviar para o WhatsApp.
func simulateChatAgentTurn(
	ctx context.Context,
	db *sql.DB,
	store *sessionStore,
	agent *ChatAgent,
	apiKey, userMessage string,
	history []struct {
		Sender  string `json:"sender"`
		Content string `json:"content"`
	},
) ([]string, error) {
	var contents []geminiChatContent
	for _, h := range history {
		role := "user"
		if h.Sender == "ai" || h.Sender == "model" {
			role = "model"
		}
		contents = append(contents, geminiChatContent{
			Role:  role,
			Parts: []geminiChatPart{{Text: h.Content}},
		})
	}
	contents = append(contents, geminiChatContent{
		Role:  "user",
		Parts: []geminiChatPart{{Text: userMessage}},
	})

	var ragContext strings.Builder
	if agent.RAGEnabled && db != nil {
		matches, err := pgSearchSimilarKnowledge(ctx, db, store, agent.WorkspaceID, userMessage, 4)
		if err == nil && len(matches) > 0 {
			ragContext.WriteString("\n\n[BASE DE CONHECIMENTO DO WORKSPACE - Trechos encontrados]:\n")
			for _, m := range matches {
				ragContext.WriteString(fmt.Sprintf("---\n%s\n", m.ChunkText))
			}
		}
	}

	var systemPrompt strings.Builder
	systemPrompt.WriteString("Você é um atendente humano corporativo e empático no WhatsApp.\n")
	if agent.SystemPrompt != "" {
		systemPrompt.WriteString(agent.SystemPrompt + "\n")
	}
	systemPrompt.WriteString(`
DIRETRIZES DE HUMANIZAÇÃO OBRIGATÓRIAS:
- Responda no estilo conversacional do WhatsApp: direto, objetivo e empático.
- NUNCA escreva blocos gigantescos de texto. Divida ideias em frases menores.
- Se o cliente perguntar algo sobre a empresa ou produtos, use estritamente a Base de Conhecimento fornecida.
`)
	if ragContext.Len() > 0 {
		systemPrompt.WriteString(ragContext.String())
	}

	modelName := agent.ModelName
	if modelName == "" {
		modelName = "gemini-2.5-flash"
	}
	reqURL := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", modelName, apiKey)

	reqPayload := geminiGenerateContentRequest{
		Contents: contents,
		SystemInstruction: &geminiChatContent{
			Role:  "system",
			Parts: []geminiChatPart{{Text: systemPrompt.String()}},
		},
		GenerationConfig: &geminiGenerationConfig{
			Temperature:     agent.Temperature,
			MaxOutputTokens: agent.MaxTokens,
		},
	}

	jsonBytes, err := json.Marshal(reqPayload)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, reqURL, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("requisição simulada: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("erro api gemini (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var res geminiGenerateContentResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, fmt.Errorf("unmarshal resp: %w", err)
	}

	if len(res.Candidates) > 0 && len(res.Candidates[0].Content.Parts) > 0 {
		rawText := res.Candidates[0].Content.Parts[0].Text
		return splitIntoNaturalBubbles(rawText, agent.MaxBubbles), nil
	}

	return []string{"Desculpe, não consegui formular uma resposta no momento."}, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
