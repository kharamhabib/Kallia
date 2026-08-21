package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"io"
	"os"
	"strings"
)

// getEncryptionKey devolve uma chave de 32 bytes para o AES-256-GCM.
// Busca na variável KALLIA_ENCRYPTION_KEY; se não definida, gera um hash SHA-256
// de um segredo mestre de fallback do sistema.
func getEncryptionKey() []byte {
	keyStr := strings.TrimSpace(os.Getenv("KALLIA_ENCRYPTION_KEY"))
	if keyStr == "" {
		keyStr = "kallia_master_secret_encryption_fallback_v1"
	}
	hash := sha256.Sum256([]byte(keyStr))
	return hash[:]
}

// encryptSecret criptografa uma string em texto claro usando AES-256-GCM.
// O resultado retornado é um ciphertext codificado em Base64 contendo o nonce/IV.
func encryptSecret(plaintext string) (string, error) {
	if plaintext == "" {
		return "", nil
	}
	block, err := aes.NewCipher(getEncryptionKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// candidateEncryptionKeys retorna todas as chaves possíveis para descriptografia
func candidateEncryptionKeys() [][]byte {
	var keys [][]byte
	seen := make(map[string]bool)

	addKeyStr := func(s string) {
		s = strings.TrimSpace(s)
		if s != "" && !seen[s] {
			seen[s] = true
			hash := sha256.Sum256([]byte(s))
			keys = append(keys, hash[:])
			if len(s) == 32 {
				keys = append(keys, []byte(s))
			}
		}
	}

	addKeyStr(os.Getenv("KALLIA_ENCRYPTION_KEY"))
	addKeyStr(os.Getenv("POCKETBASE_ENCRYPTION_KEY"))
	addKeyStr(os.Getenv("KALLIA_AI_ENCRYPTION_KEY"))
	addKeyStr(os.Getenv("KALLIA_JWT_SECRET"))
	addKeyStr("kallia_master_secret_encryption_key_prod_2026")
	addKeyStr("kallia_pb_encryption_key_prod_2026")
	addKeyStr("kallia_jwt_secret_key_prod_2026_secure")
	addKeyStr("kallia_master_encryption_key_2026_secure")
	addKeyStr("kallia_master_secret_encryption_fallback_v1")

	return keys
}

// decryptSecret descriptografa uma string codificada em Base64 usando AES-256-GCM com suporte a múltiplas chaves.
// Se a string já estiver em texto claro ou se a decodificação falhar, retorna o próprio texto.
func decryptSecret(cryptoText string) (string, error) {
	txt := strings.TrimSpace(cryptoText)
	if txt == "" {
		return "", nil
	}

	// Se começar com prefixos conhecidos de chaves de IA em texto claro, retorna diretamente
	if strings.HasPrefix(txt, "AIza") || strings.HasPrefix(txt, "xai-") || strings.HasPrefix(txt, "sk-") {
		return txt, nil
	}

	// Decodifica Base64 tentando os formatos padrão, URL e RAW
	var data []byte
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding,
		base64.URLEncoding,
		base64.RawStdEncoding,
		base64.RawURLEncoding,
	} {
		if d, e := enc.DecodeString(txt); e == nil && len(d) > 0 {
			data = d
			break
		}
	}

	if len(data) == 0 {
		return txt, nil
	}

	// Tenta descriptografar com todas as chaves candidatas
	for _, keyBytes := range candidateEncryptionKeys() {
		block, err := aes.NewCipher(keyBytes)
		if err != nil {
			continue
		}
		gcm, err := cipher.NewGCM(block)
		if err != nil {
			continue
		}
		nonceSize := gcm.NonceSize()
		if len(data) < nonceSize {
			continue
		}
		nonce, ciphertext := data[:nonceSize], data[nonceSize:]
		plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
		if err == nil && len(plaintext) > 0 {
			return string(plaintext), nil
		}
	}

	// Fallback para texto original caso tenha sido salvo sem criptografia
	return txt, nil
}

// maskSecret devolve uma versão mascarada da chave para ser exibida no frontend (ex: xai-••••1234).
func maskSecret(key string) string {
	k := strings.TrimSpace(key)
	if k == "" {
		return ""
	}
	if len(k) <= 8 {
		return "••••••••"
	}
	prefix := k[:4]
	suffix := k[len(k)-4:]
	return prefix + "••••" + suffix
}
