package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
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

// decryptSecret descriptografa uma string codificada em Base64 usando AES-256-GCM.
func decryptSecret(cryptoText string) (string, error) {
	if cryptoText == "" {
		return "", nil
	}
	data, err := base64.StdEncoding.DecodeString(cryptoText)
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(getEncryptionKey())
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", errors.New("ciphertext muito curto")
	}
	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
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
