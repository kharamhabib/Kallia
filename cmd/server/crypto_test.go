package main

import (
	"testing"
)

func TestCryptoEncryptionAndDecryption(t *testing.T) {
	originalKey := "xai-1234567890abcdefghijklmnopqrstuvwxyz"
	
	encrypted, err := encryptSecret(originalKey)
	if err != nil {
		t.Fatalf("falha ao criptografar: %v", err)
	}
	if encrypted == originalKey {
		t.Fatalf("o texto criptografado não deve ser igual ao texto original")
	}

	decrypted, err := decryptSecret(encrypted)
	if err != nil {
		t.Fatalf("falha ao descriptografar: %v", err)
	}
	if decrypted != originalKey {
		t.Fatalf("esperado %q, obtido %q", originalKey, decrypted)
	}
}

func TestMaskSecret(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", ""},
		{"short", "••••••••"},
		{"xai-1234567890abcdef", "xai-••••cdef"},
	}

	for _, tt := range tests {
		got := maskSecret(tt.input)
		if got != tt.want {
			t.Errorf("maskSecret(%q) = %q; want %q", tt.input, got, tt.want)
		}
	}
}
