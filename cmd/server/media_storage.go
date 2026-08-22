package main

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SaveIncomingMedia grava os bytes da mídia descriptografada em storage/media/{wid}/{msgID}.{ext}
// e retorna a URL relativa do endpoint HTTP para exibição no chat.
func SaveIncomingMedia(storageDir, wid, msgID, ext string, data []byte) (string, error) {
	if storageDir == "" {
		storageDir = "./storage"
	}
	if wid == "" {
		wid = "default"
	}

	cleanExt := strings.TrimPrefix(ext, ".")
	if cleanExt == "" {
		cleanExt = "bin"
	}

	targetDir := filepath.Join(storageDir, "media", wid)
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return "", fmt.Errorf("criar pasta de mídia (%s): %w", targetDir, err)
	}

	fileName := fmt.Sprintf("%s.%s", msgID, cleanExt)
	filePath := filepath.Join(targetDir, fileName)

	if err := os.WriteFile(filePath, data, 0644); err != nil {
		return "", fmt.Errorf("gravar arquivo de mídia (%s): %w", filePath, err)
	}

	mediaURL := fmt.Sprintf("/api/media/%s/%s", wid, fileName)
	return mediaURL, nil
}

// StartMediaCleaner inicia uma goroutine em background para expirar e remover
// mídias locais com mais de retentionDays dias, liberando espaço em disco no VPS.
func StartMediaCleaner(storageDir string, retentionDays int, interval time.Duration) {
	if retentionDays <= 0 {
		retentionDays = 30 // Padrão: 30 dias de retenção
	}
	if interval <= 0 {
		interval = 24 * time.Hour
	}
	if storageDir == "" {
		storageDir = "./storage"
	}

	mediaRoot := filepath.Join(storageDir, "media")

	goSafe(slog.Default(), func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		// Executa uma varredura logo após a inicialização (com delay de 1 minuto)
		select {
		case <-time.After(1 * time.Minute):
			cleanOldMedia(mediaRoot, retentionDays)
		}

		for range ticker.C {
			cleanOldMedia(mediaRoot, retentionDays)
		}
	})
}

// cleanOldMedia percorre a pasta de mídias e remove arquivos com idade superior ao limite.
func cleanOldMedia(mediaRoot string, retentionDays int) {
	if _, err := os.Stat(mediaRoot); os.IsNotExist(err) {
		return
	}

	cutoff := time.Now().AddDate(0, 0, -retentionDays)
	var deletedCount int
	var deletedBytes int64

	err := filepath.Walk(mediaRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil
		}
		if !info.IsDir() && info.ModTime().Before(cutoff) {
			size := info.Size()
			if removeErr := os.Remove(path); removeErr == nil {
				deletedCount++
				deletedBytes += size
			}
		}
		return nil
	})

	if err == nil && deletedCount > 0 {
		slog.Info("[MediaStorage] Limpeza automática de mídias concluída",
			"arquivos_removidos", deletedCount,
			"espaco_liberado_mb", fmt.Sprintf("%.2f", float64(deletedBytes)/(1024*1024)),
			"dias_retencao", retentionDays,
		)
	}
}
