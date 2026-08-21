package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
)

type AIModelInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type AIProviderConfigResponse struct {
	Provider        string        `json:"provider"`
	Name            string        `json:"name"`
	Enabled         bool          `json:"enabled"`
	HasKey          bool          `json:"hasKey"`
	MaskedKey       string        `json:"maskedKey"`
	DefaultModel    string        `json:"defaultModel"`
	AvailableModels []AIModelInfo `json:"availableModels"`
	Options         map[string]any `json:"options"`
}

type AIProviderPayload struct {
	ApiKey       string         `json:"apiKey"`
	Enabled      bool           `json:"enabled"`
	DefaultModel string         `json:"defaultModel"`
	Options      map[string]any `json:"options"`
}

var SupportedAIProviders = map[string]struct {
	Name            string
	DefaultModel    string
	AvailableModels []AIModelInfo
}{
	"gemini": {
		Name:         "Google Gemini Live",
		DefaultModel: "gemini-3.1-flash-live-preview",
		AvailableModels: []AIModelInfo{
			{ID: "gemini-3.1-flash-live-preview", Name: "Gemini 3.1 Flash Live Preview", Description: "Modelo padrão otimizado para áudio bidirecional e voz ao vivo"},
			{ID: "gemini-3.6-flash", Name: "Gemini 3.6 Flash", Description: "Modelo de alto desempenho para tarefas complexas, agentes e texto"},
			{ID: "gemini-3.5-flash-lite", Name: "Gemini 3.5 Flash-Lite", Description: "Modelo ultrarrápido de menor custo para alta taxa de execução"},
		},
	},
	"grok": {
		Name:         "xAI Grok Live",
		DefaultModel: "grok-voice-latest",
		AvailableModels: []AIModelInfo{
			{ID: "grok-voice-latest", Name: "Grok Voice Latest", Description: "Alias automático para o modelo mais recente"},
			{ID: "grok-voice-think-fast-2.0", Name: "Grok Voice Think Fast 2.0", Description: "Modelo principal de voz com raciocínio rápido"},
			{ID: "grok-voice-think-fast-1.0", Name: "Grok Voice Think Fast 1.0", Description: "Geração anterior de voz"},
		},
	},
	"openai": {
		Name:         "OpenAI GPT Live",
		DefaultModel: "gpt-4o-realtime-preview",
		AvailableModels: []AIModelInfo{
			{ID: "gpt-4o-realtime-preview", Name: "GPT-4o Realtime", Description: "API Realtime da OpenAI com modelo GPT-4o"},
			{ID: "gpt-4o-mini-realtime-preview", Name: "GPT-4o Mini Realtime", Description: "Versão compacta e mais econômica da OpenAI"},
		},
	},
}

func (s *server) handleListAIProviders(w http.ResponseWriter, r *http.Request) {
	projectID := projectIDFromContext(r.Context())
	if projectID == "" {
		projectID = "default"
	}

	rows, err := pbClient.ListAIProvidersPB(r.Context())
	if err != nil || len(rows) == 0 {
		rows, _ = s.sessions.store.listAIProviders(r.Context(), projectID)
	}

	rowMap := make(map[string]aiProviderRow)
	for _, row := range rows {
		rowMap[row.Provider] = row
	}

	var res []AIProviderConfigResponse
	for key, meta := range SupportedAIProviders {
		item := AIProviderConfigResponse{
			Provider:        key,
			Name:            meta.Name,
			DefaultModel:    meta.DefaultModel,
			AvailableModels: meta.AvailableModels,
			Options:         map[string]any{},
		}

		if row, exists := rowMap[key]; exists {
			item.Enabled = row.Enabled
			if row.DefaultModel != "" {
				valid := false
				for _, m := range meta.AvailableModels {
					if m.ID == row.DefaultModel {
						valid = true
						break
					}
				}
				if valid {
					item.DefaultModel = row.DefaultModel
				}
			}
			decryptedKey, err := decryptSecret(row.EncryptedAPIKey)
			if err == nil && decryptedKey != "" {
				item.HasKey = true
				item.MaskedKey = maskSecret(decryptedKey)
			}
			if row.OptionsJSON != "" {
				var opts map[string]any
				if json.Unmarshal([]byte(row.OptionsJSON), &opts) == nil {
					item.Options = opts
				}
			}
		}

		res = append(res, item)
	}

	writeJSON(w, http.StatusOK, map[string]any{"providers": res})
}

func (s *server) handleUpdateAIProvider(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	meta, supported := SupportedAIProviders[provider]
	if !supported {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "provedor de IA não suportado"})
		return
	}

	projectID := projectIDFromContext(r.Context())
	if projectID == "" {
		projectID = "default"
	}

	var body AIProviderPayload
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "payload inválido"})
		return
	}

	existing, err := s.sessions.store.getAIProvider(r.Context(), projectID, provider)
	if err != nil {
		s.log.Error("falha ao carregar ai_provider", "provider", provider, "err", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "erro ao carregar configuração"})
		return
	}

	var encryptedKey string
	if body.ApiKey != "" {
		// Se contiver a máscara ••••, preserva a chave existente
		if existing != nil && (body.ApiKey == existing.EncryptedAPIKey || (len(body.ApiKey) > 0 && body.ApiKey[0:1] != "" && containsBullet(body.ApiKey))) {
			encryptedKey = existing.EncryptedAPIKey
		} else {
			enc, err := encryptSecret(body.ApiKey)
			if err != nil {
				s.log.Error("falha ao criptografar api key", "err", err)
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "falha ao criptografar chave de API"})
				return
			}
			encryptedKey = enc
		}
	} else if existing != nil {
		encryptedKey = existing.EncryptedAPIKey
	}

	defaultModel := body.DefaultModel
	if defaultModel == "" {
		if existing != nil && existing.DefaultModel != "" {
			defaultModel = existing.DefaultModel
		} else {
			defaultModel = meta.DefaultModel
		}
	}

	optionsJSON := "{}"
	if body.Options != nil {
		if b, err := json.Marshal(body.Options); err == nil {
			optionsJSON = string(b)
		}
	} else if existing != nil && existing.OptionsJSON != "" {
		optionsJSON = existing.OptionsJSON
	}

	row := aiProviderRow{
		ProjectID:       projectID,
		Provider:        provider,
		EncryptedAPIKey: encryptedKey,
		Enabled:         body.Enabled,
		DefaultModel:    defaultModel,
		OptionsJSON:     optionsJSON,
	}

	_ = pbClient.UpsertAIProviderPB(r.Context(), row)
	_ = s.sessions.store.upsertAIProvider(r.Context(), row)

	decryptedKey, _ := decryptSecret(encryptedKey)
	masked := maskSecret(decryptedKey)

	writeJSON(w, http.StatusOK, map[string]any{
		"provider":     provider,
		"enabled":      row.Enabled,
		"hasKey":       decryptedKey != "",
		"maskedKey":    masked,
		"defaultModel": row.DefaultModel,
	})
}

func containsBullet(s string) bool {
	return strings.Contains(s, "•")
}

// resolveAIProviderKey busca e descriptografa a API Key do provedor no banco (ai_providers) ou nas variáveis de ambiente (.env)
func resolveAIProviderKey(ctx context.Context, store *sessionStore, projectID, provider string) string {
	if projectID == "" {
		projectID = "default"
	}
	if store != nil {
		row, err := store.getAIProvider(ctx, projectID, provider)
		if err == nil && row != nil && row.EncryptedAPIKey != "" {
			key, err := decryptSecret(row.EncryptedAPIKey)
			if err == nil && key != "" {
				return key
			}
		}
	}
	switch provider {
	case "gemini":
		return os.Getenv("GEMINI_API_KEY")
	case "grok":
		if k := os.Getenv("XAI_API_KEY"); k != "" {
			return k
		}
		return os.Getenv("GROK_API_KEY")
	case "openai":
		return os.Getenv("OPENAI_API_KEY")
	}
	return ""
}

// resolveAIConfigKeys resolve dinamicamente as chaves de API e o provedor para o AIConfig
func resolveAIConfigKeys(ctx context.Context, store *sessionStore, projectID string, config *AIConfig) {
	if config == nil {
		return
	}
	if config.Provider == "" {
		config.Provider = "gemini"
	}

	// 1. Resolve chave para o provedor selecionado
	key := resolveAIProviderKey(ctx, store, projectID, config.Provider)
	if key != "" {
		config.GeminiAPIKey = key
		return
	}

	// 2. Fallback: se GeminiAPIKey estiver vazia ou mascarada (•••••), busca a chave do Gemini ou .env
	if config.GeminiAPIKey == "" || containsBullet(config.GeminiAPIKey) {
		config.GeminiAPIKey = resolveAIProviderKey(ctx, store, projectID, "gemini")
	}
}
