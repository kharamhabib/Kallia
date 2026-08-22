package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

// KnowledgeDocument representa um documento ou base temática cadastrada pelo workspace.
type KnowledgeDocument struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Title       string    `json:"title"`
	SourceType  string    `json:"source_type"` // "text", "file", "url", "faq"
	Category    string    `json:"category"`    // "Empresa", "Produtos", "Suporte", "Políticas", "Vendas", etc.
	SourceName  string    `json:"source_name"`
	Content     string    `json:"content"`
	TokensCount int       `json:"tokens_count"`
	ChunksCount int       `json:"chunks_count"`
	Enabled     bool      `json:"enabled"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type KnowledgeSearchMatch struct {
	ChunkText  string  `json:"chunk_text"`
	SourceID   string  `json:"source_id"`
	SourceType string  `json:"source_type"`
	Similarity float64 `json:"similarity"`
}

// ── Chunking Semântico ──────────────────────────────────────────────────

// chunkText quebra um texto grande em pedaços (chunks) preservando quebras de parágrafo e frases.
func chunkText(content string, targetSize, overlap int) []string {
	content = strings.TrimSpace(content)
	if content == "" {
		return nil
	}
	if targetSize <= 0 {
		targetSize = 600
	}
	if overlap < 0 || overlap >= targetSize {
		overlap = 100
	}

	// Se o conteúdo for menor que o targetSize, retorna como chunk único
	if utf8.RuneCountInString(content) <= targetSize {
		return []string{content}
	}

	paragraphs := strings.Split(content, "\n")
	var chunks []string
	var currentChunk strings.Builder

	for _, para := range paragraphs {
		para = strings.TrimSpace(para)
		if para == "" {
			continue
		}

		// Se o parágrafo sozinho é maior que o targetSize, fatia por sentenças
		if utf8.RuneCountInString(para) > targetSize {
			sentences := splitIntoSentences(para)
			for _, sent := range sentences {
				sent = strings.TrimSpace(sent)
				if sent == "" {
					continue
				}
				if currentChunk.Len() > 0 && currentChunk.Len()+len(sent) > targetSize {
					chunks = append(chunks, strings.TrimSpace(currentChunk.String()))
					currentChunk.Reset()
				}
				if currentChunk.Len() > 0 {
					currentChunk.WriteString(" ")
				}
				currentChunk.WriteString(sent)
			}
			continue
		}

		if currentChunk.Len() > 0 && currentChunk.Len()+len(para) > targetSize {
			chunks = append(chunks, strings.TrimSpace(currentChunk.String()))
			currentChunk.Reset()
		}

		if currentChunk.Len() > 0 {
			currentChunk.WriteString("\n")
		}
		currentChunk.WriteString(para)
	}

	if currentChunk.Len() > 0 {
		chunks = append(chunks, strings.TrimSpace(currentChunk.String()))
	}

	return chunks
}

func splitIntoSentences(text string) []string {
	var sentences []string
	var current strings.Builder

	runes := []rune(text)
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		current.WriteRune(r)
		if (r == '.' || r == '!' || r == '?' || r == ';') && (i+1 == len(runes) || runes[i+1] == ' ' || runes[i+1] == '\n') {
			sentences = append(sentences, strings.TrimSpace(current.String()))
			current.Reset()
		}
	}
	if current.Len() > 0 {
		sentences = append(sentences, strings.TrimSpace(current.String()))
	}
	return sentences
}

// ── Gemini Embeddings (text-embedding-004: 768 dimensões) ───────────────

type geminiEmbedRequest struct {
	Model   string             `json:"model"`
	Content geminiEmbedContent `json:"content"`
}

type geminiEmbedContent struct {
	Parts []geminiEmbedPart `json:"parts"`
}

type geminiEmbedPart struct {
	Text string `json:"text"`
}

type geminiEmbedResponse struct {
	Embedding struct {
		Values []float32 `json:"values"`
	} `json:"embedding"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

type geminiBatchEmbedRequest struct {
	Requests []geminiEmbedRequest `json:"requests"`
}

type geminiBatchEmbedResponse struct {
	Embeddings []struct {
		Values []float32 `json:"values"`
	} `json:"embeddings"`
	Error *struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"error,omitempty"`
}

func generateGeminiEmbedding(ctx context.Context, apiKey, text string) ([]float32, error) {
	if apiKey == "" {
		return nil, fmt.Errorf("gemini api key não configurada no workspace")
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=%s", apiKey)
	reqBody := geminiEmbedRequest{
		Model: "models/text-embedding-004",
		Content: geminiEmbedContent{
			Parts: []geminiEmbedPart{{Text: text}},
		},
	}
	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("requisição embedding gemini: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("erro api gemini (%d): %s", resp.StatusCode, string(bodyBytes))
	}

	var res geminiEmbedResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, fmt.Errorf("unmarshal embedding: %w", err)
	}
	if res.Error != nil {
		return nil, fmt.Errorf("gemini error: %s", res.Error.Message)
	}

	return res.Embedding.Values, nil
}

func generateGeminiBatchEmbeddings(ctx context.Context, apiKey string, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}
	if apiKey == "" {
		return nil, fmt.Errorf("gemini api key não configurada no workspace")
	}

	// Se for apenas 1 texto, usa endpoint simples
	if len(texts) == 1 {
		emb, err := generateGeminiEmbedding(ctx, apiKey, texts[0])
		if err != nil {
			return nil, err
		}
		return [][]float32{emb}, nil
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:batchEmbedContents?key=%s", apiKey)
	var reqs []geminiEmbedRequest
	for _, t := range texts {
		reqs = append(reqs, geminiEmbedRequest{
			Model: "models/text-embedding-004",
			Content: geminiEmbedContent{
				Parts: []geminiEmbedPart{{Text: t}},
			},
		})
	}

	reqBody := geminiBatchEmbedRequest{Requests: reqs}
	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBytes))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("requisição batch embedding gemini: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		// Fallback para geração individual caso batch falhe
		var results [][]float32
		for _, t := range texts {
			emb, err := generateGeminiEmbedding(ctx, apiKey, t)
			if err != nil {
				return nil, err
			}
			results = append(results, emb)
		}
		return results, nil
	}

	var res geminiBatchEmbedResponse
	if err := json.Unmarshal(bodyBytes, &res); err != nil {
		return nil, fmt.Errorf("unmarshal batch embedding: %w", err)
	}
	if res.Error != nil {
		return nil, fmt.Errorf("gemini batch error: %s", res.Error.Message)
	}

	var results [][]float32
	for _, item := range res.Embeddings {
		results = append(results, item.Values)
	}
	return results, nil
}

func formatVectorString(vec []float32) string {
	var sb strings.Builder
	sb.WriteString("[")
	for i, v := range vec {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(fmt.Sprintf("%f", v))
	}
	sb.WriteString("]")
	return sb.String()
}

// ── Operações de Banco de Dados PostgreSQL ─────────────────────────────

func pgListKnowledgeDocs(db *sql.DB, wid, search, category string) ([]KnowledgeDocument, error) {
	if db == nil {
		return []KnowledgeDocument{}, nil
	}

	var conditions []string
	var args []interface{}
	argIdx := 1

	conditions = append(conditions, fmt.Sprintf("workspace_id = $%d", argIdx))
	args = append(args, wid)
	argIdx++

	if search != "" {
		conditions = append(conditions, fmt.Sprintf("(title ILIKE $%d OR content ILIKE $%d OR source_name ILIKE $%d)", argIdx, argIdx, argIdx))
		args = append(args, "%"+search+"%")
		argIdx++
	}

	if category != "" && category != "all" {
		conditions = append(conditions, fmt.Sprintf("category = $%d", argIdx))
		args = append(args, category)
		argIdx++
	}

	query := fmt.Sprintf(`
		SELECT id, workspace_id, title, source_type, category, source_name, content,
		       tokens_count, chunks_count, enabled, created_at, updated_at
		FROM knowledge_documents
		WHERE %s
		ORDER BY created_at DESC
	`, strings.Join(conditions, " AND "))

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []KnowledgeDocument
	for rows.Next() {
		var doc KnowledgeDocument
		if err := rows.Scan(
			&doc.ID, &doc.WorkspaceID, &doc.Title, &doc.SourceType, &doc.Category, &doc.SourceName,
			&doc.Content, &doc.TokensCount, &doc.ChunksCount, &doc.Enabled, &doc.CreatedAt, &doc.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, doc)
	}

	if list == nil {
		list = []KnowledgeDocument{}
	}
	return list, nil
}

func pgGetKnowledgeDoc(db *sql.DB, wid, docID string) (*KnowledgeDocument, error) {
	if db == nil {
		return nil, fmt.Errorf("banco de dados postgres não disponível")
	}

	var doc KnowledgeDocument
	query := `
		SELECT id, workspace_id, title, source_type, category, source_name, content,
		       tokens_count, chunks_count, enabled, created_at, updated_at
		FROM knowledge_documents
		WHERE id = $1 AND workspace_id = $2
	`
	err := db.QueryRow(query, docID, wid).Scan(
		&doc.ID, &doc.WorkspaceID, &doc.Title, &doc.SourceType, &doc.Category, &doc.SourceName,
		&doc.Content, &doc.TokensCount, &doc.ChunksCount, &doc.Enabled, &doc.CreatedAt, &doc.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &doc, nil
}

func pgSaveAndIndexKnowledgeDoc(ctx context.Context, db *sql.DB, store *sessionStore, doc *KnowledgeDocument) error {
	if db == nil {
		return fmt.Errorf("postgres não disponível")
	}

	// 1. Chunking
	chunks := chunkText(doc.Content, 600, 100)
	doc.ChunksCount = len(chunks)
	doc.TokensCount = utf8.RuneCountInString(doc.Content) / 4 // Estimativa padrão

	// 2. Resolver Gemini API Key para gerar embeddings
	apiKey := resolveAIProviderKey(ctx, store, doc.WorkspaceID, "gemini")
	var embeddings [][]float32
	if apiKey != "" && len(chunks) > 0 {
		var err error
		embeddings, err = generateGeminiBatchEmbeddings(ctx, apiKey, chunks)
		if err != nil {
			// Loga mas não trava a criação do documento textual
			fmt.Printf("[RAG] Aviso ao gerar embeddings: %v\n", err)
		}
	}

	// 3. Upsert em knowledge_documents
	var docID string
	if doc.ID == "" {
		query := `
			INSERT INTO knowledge_documents (workspace_id, title, source_type, category, source_name, content, tokens_count, chunks_count, enabled, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
			RETURNING id
		`
		err := db.QueryRowContext(ctx, query,
			doc.WorkspaceID, doc.Title, doc.SourceType, doc.Category, doc.SourceName, doc.Content,
			doc.TokensCount, doc.ChunksCount, doc.Enabled,
		).Scan(&docID)
		if err != nil {
			return fmt.Errorf("inserir knowledge_doc: %w", err)
		}
		doc.ID = docID
	} else {
		docID = doc.ID
		query := `
			UPDATE knowledge_documents
			SET title = $1, source_type = $2, category = $3, source_name = $4, content = $5,
			    tokens_count = $6, chunks_count = $7, enabled = $8, updated_at = now()
			WHERE id = $9 AND workspace_id = $10
		`
		_, err := db.ExecContext(ctx, query,
			doc.Title, doc.SourceType, doc.Category, doc.SourceName, doc.Content,
			doc.TokensCount, doc.ChunksCount, doc.Enabled, docID, doc.WorkspaceID,
		)
		if err != nil {
			return fmt.Errorf("atualizar knowledge_doc: %w", err)
		}
	}

	// 4. Limpar embeddings antigos deste documento
	_, _ = db.ExecContext(ctx, "DELETE FROM embeddings WHERE workspace_id = $1 AND source_id = $2", doc.WorkspaceID, docID)

	// 5. Inserir novos embeddings
	if len(chunks) > 0 {
		for i, chunk := range chunks {
			var vecStr sql.NullString
			if i < len(embeddings) && len(embeddings[i]) > 0 {
				vecStr = sql.NullString{String: formatVectorString(embeddings[i]), Valid: true}
			}

			metaJSON, _ := json.Marshal(map[string]interface{}{
				"title":       doc.Title,
				"category":    doc.Category,
				"source_name": doc.SourceName,
				"chunk_index": i,
				"total":       len(chunks),
			})

			if vecStr.Valid {
				_, _ = db.ExecContext(ctx, `
					INSERT INTO embeddings (workspace_id, source_type, source_id, chunk_text, embedding, metadata, created_at)
					VALUES ($1, $2, $3, $4, $5::vector, $6, now())
				`, doc.WorkspaceID, doc.SourceType, docID, chunk, vecStr.String, metaJSON)
			} else {
				_, _ = db.ExecContext(ctx, `
					INSERT INTO embeddings (workspace_id, source_type, source_id, chunk_text, metadata, created_at)
					VALUES ($1, $2, $3, $4, $5, now())
				`, doc.WorkspaceID, doc.SourceType, docID, chunk, metaJSON)
			}
		}
	}

	return nil
}

func pgDeleteKnowledgeDoc(ctx context.Context, db *sql.DB, wid, docID string) error {
	if db == nil {
		return fmt.Errorf("postgres não disponível")
	}
	_, _ = db.ExecContext(ctx, "DELETE FROM embeddings WHERE workspace_id = $1 AND source_id = $2", wid, docID)
	_, err := db.ExecContext(ctx, "DELETE FROM knowledge_documents WHERE id = $1 AND workspace_id = $2", docID, wid)
	return err
}

func pgToggleKnowledgeDoc(ctx context.Context, db *sql.DB, wid, docID string, enabled bool) error {
	if db == nil {
		return fmt.Errorf("postgres não disponível")
	}
	_, err := db.ExecContext(ctx, "UPDATE knowledge_documents SET enabled = $1, updated_at = now() WHERE id = $2 AND workspace_id = $3", enabled, docID, wid)
	return err
}

// pgSearchSimilarKnowledge busca os trechos mais similares usando pgvector ou busca textual.
func pgSearchSimilarKnowledge(ctx context.Context, db *sql.DB, store *sessionStore, wid, queryText string, limit int) ([]KnowledgeSearchMatch, error) {
	if db == nil || queryText == "" {
		return nil, nil
	}
	if limit <= 0 {
		limit = 4
	}

	apiKey := resolveAIProviderKey(ctx, store, wid, "gemini")
	if apiKey != "" {
		queryVec, err := generateGeminiEmbedding(ctx, apiKey, queryText)
		if err == nil && len(queryVec) > 0 {
			vecStr := formatVectorString(queryVec)
			sqlQuery := `
				SELECT e.chunk_text, e.source_id, e.source_type, 1 - (e.embedding <=> $1::vector) AS similarity
				FROM embeddings e
				JOIN knowledge_documents kd ON kd.id::text = e.source_id AND kd.enabled = true
				WHERE e.workspace_id = $2 AND e.embedding IS NOT NULL
				ORDER BY e.embedding <=> $1::vector ASC
				LIMIT $3
			`
			rows, err := db.QueryContext(ctx, sqlQuery, vecStr, wid, limit)
			if err == nil {
				defer rows.Close()
				var results []KnowledgeSearchMatch
				for rows.Next() {
					var match KnowledgeSearchMatch
					if err := rows.Scan(&match.ChunkText, &match.SourceID, &match.SourceType, &match.Similarity); err == nil {
						if match.Similarity >= 0.35 { // Limiar mínimo de relevância semântica
							results = append(results, match)
						}
					}
				}
				if len(results) > 0 {
					return results, nil
				}
			}
		}
	}

	// Fallback para ILIKE simples se não houver vetor
	words := strings.Fields(queryText)
	if len(words) == 0 {
		return nil, nil
	}
	sqlQuery := `
		SELECT e.chunk_text, e.source_id, e.source_type, 0.5 AS similarity
		FROM embeddings e
		JOIN knowledge_documents kd ON kd.id::text = e.source_id AND kd.enabled = true
		WHERE e.workspace_id = $1 AND e.chunk_text ILIKE $2
		LIMIT $3
	`
	rows, err := db.QueryContext(ctx, sqlQuery, wid, "%"+words[0]+"%", limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []KnowledgeSearchMatch
	for rows.Next() {
		var match KnowledgeSearchMatch
		if err := rows.Scan(&match.ChunkText, &match.SourceID, &match.SourceType, &match.Similarity); err == nil {
			results = append(results, match)
		}
	}
	return results, nil
}

// ── HTTP REST Handlers ──────────────────────────────────────────────────

func (s *server) handleListKnowledgeDocs(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusOK, []KnowledgeDocument{})
		return
	}

	q := r.URL.Query()
	search := q.Get("search")
	category := q.Get("category")

	docs, err := pgListKnowledgeDocs(db, wid, search, category)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

func (s *server) handleCreateKnowledgeDoc(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	var req struct {
		Title      string `json:"title"`
		SourceType string `json:"source_type"`
		Category   string `json:"category"`
		SourceName string `json:"source_name"`
		Content    string `json:"content"`
		Enabled    bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}
	if strings.TrimSpace(req.Title) == "" || strings.TrimSpace(req.Content) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Título e conteúdo são obrigatórios"})
		return
	}
	if req.SourceType == "" {
		req.SourceType = "text"
	}
	if req.Category == "" {
		req.Category = "Empresa"
	}

	doc := &KnowledgeDocument{
		WorkspaceID: wid,
		Title:       strings.TrimSpace(req.Title),
		SourceType:  req.SourceType,
		Category:    req.Category,
		SourceName:  req.SourceName,
		Content:     strings.TrimSpace(req.Content),
		Enabled:     req.Enabled,
	}

	if err := pgSaveAndIndexKnowledgeDoc(r.Context(), db, s.sessions.store, doc); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusCreated, doc)
}

func (s *server) handleGetKnowledgeDoc(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	docID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Documento não encontrado"})
		return
	}

	doc, err := pgGetKnowledgeDoc(db, wid, docID)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "Documento não encontrado"})
		return
	}
	writeJSON(w, http.StatusOK, doc)
}

func (s *server) handleUpdateKnowledgeDoc(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	docID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	var req struct {
		Title      string `json:"title"`
		SourceType string `json:"source_type"`
		Category   string `json:"category"`
		SourceName string `json:"source_name"`
		Content    string `json:"content"`
		Enabled    bool   `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	doc := &KnowledgeDocument{
		ID:          docID,
		WorkspaceID: wid,
		Title:       strings.TrimSpace(req.Title),
		SourceType:  req.SourceType,
		Category:    req.Category,
		SourceName:  req.SourceName,
		Content:     strings.TrimSpace(req.Content),
		Enabled:     req.Enabled,
	}

	if err := pgSaveAndIndexKnowledgeDoc(r.Context(), db, s.sessions.store, doc); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, doc)
}

func (s *server) handleDeleteKnowledgeDoc(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	docID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	if err := pgDeleteKnowledgeDoc(r.Context(), db, wid, docID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *server) handleToggleKnowledgeDoc(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	docID := r.PathValue("id")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "PostgreSQL não disponível"})
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "JSON inválido"})
		return
	}

	if err := pgToggleKnowledgeDoc(r.Context(), db, wid, docID, req.Enabled); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true, "enabled": req.Enabled})
}

func (s *server) handleTestKnowledgeSearch(w http.ResponseWriter, r *http.Request) {
	wid := r.PathValue("wid")
	db := s.pg.DB()
	if db == nil {
		writeJSON(w, http.StatusOK, []KnowledgeSearchMatch{})
		return
	}

	var req struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if strings.TrimSpace(req.Query) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Query é obrigatória"})
		return
	}

	matches, err := pgSearchSimilarKnowledge(r.Context(), db, s.sessions.store, wid, req.Query, req.Limit)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if matches == nil {
		matches = []KnowledgeSearchMatch{}
	}
	writeJSON(w, http.StatusOK, matches)
}
