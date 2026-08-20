package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// QueueManager gerencia as filas e controle de taxa de concorrência com Redis.
type QueueManager struct {
	rdb    *redis.Client
	log    *slog.Logger
	ctx    context.Context
	cancel context.CancelFunc
	wg     sync.WaitGroup

	// InMemory fallback caso o Redis não esteja disponível
	inMemory bool
	memMu    sync.Mutex
	memLocks map[string]time.Time
}

type WebhookJob struct {
	URL        string            `json:"url"`
	Payload    any               `json:"payload"`
	Headers    map[string]string `json:"headers,omitempty"`
	RetryCount int               `json:"retry_count"`
	MaxRetries int               `json:"max_retries"`
	CreatedAt  time.Time         `json:"created_at"`
}

// NewQueueManager inicializa a conexão com o Redis ou habilita fallback in-memory seguro.
func NewQueueManager(ctx context.Context, redisURL string, log *slog.Logger) *QueueManager {
	ctx, cancel := context.WithCancel(ctx)
	qm := &QueueManager{
		log:      log,
		ctx:      ctx,
		cancel:   cancel,
		memLocks: make(map[string]time.Time),
	}

	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Warn("[Queue] URL Redis inválida, iniciando em modo In-Memory", "url", redisURL, "err", err)
		qm.inMemory = true
		return qm
	}

	rdb := redis.NewClient(opt)
	pingCtx, pingCancel := context.WithTimeout(ctx, 3*time.Second)
	defer pingCancel()

	if err := rdb.Ping(pingCtx).Err(); err != nil {
		log.Warn("[Queue] Redis indisponível no startup, usando fallback In-Memory", "err", err)
		qm.inMemory = true
		_ = rdb.Close()
		return qm
	}

	qm.rdb = rdb
	log.Info("[Queue] Conexão com Redis estabelecida com sucesso", "addr", opt.Addr)

	// Iniciar background worker para processamento de filas de webhooks
	qm.wg.Add(1)
	go qm.webhookWorker()

	return qm
}

// Close encerra os workers e conexões da fila.
func (q *QueueManager) Close() {
	q.cancel()
	if q.rdb != nil {
		_ = q.rdb.Close()
	}
	q.wg.Wait()
}

// AcquireCallSlot tenta obter um slot para disparar uma chamada, garantindo rate limit anti-spam por sessão.
func (q *QueueManager) AcquireCallSlot(ctx context.Context, sessionID string, minInterval time.Duration) (bool, error) {
	key := fmt.Sprintf("kallia:ratelimit:call:%s", sessionID)

	if q.inMemory || q.rdb == nil {
		q.memMu.Lock()
		defer q.memMu.Unlock()
		last, exists := q.memLocks[key]
		if exists && time.Since(last) < minInterval {
			return false, nil
		}
		q.memLocks[key] = time.Now()
		return true, nil
	}

	// Lock atômico no Redis via SET NX EX
	ok, err := q.rdb.SetNX(ctx, key, "1", minInterval).Result()
	if err != nil {
		q.log.Warn("[Queue] Erro no Redis RateLimit, permitindo fallback", "err", err)
		return true, nil
	}
	return ok, nil
}

// ReleaseCallSlot libera explicitamente o slot de chamada de uma sessão.
func (q *QueueManager) ReleaseCallSlot(ctx context.Context, sessionID string) {
	key := fmt.Sprintf("kallia:ratelimit:call:%s", sessionID)
	if q.inMemory || q.rdb == nil {
		q.memMu.Lock()
		delete(q.memLocks, key)
		q.memMu.Unlock()
		return
	}
	_ = q.rdb.Del(ctx, key).Err()
}

// EnqueueWebhook enfileira um payload para ser entregue a uma URL externa de forma confiável.
func (q *QueueManager) EnqueueWebhook(ctx context.Context, url string, payload any, headers map[string]string) error {
	job := WebhookJob{
		URL:        url,
		Payload:    payload,
		Headers:    headers,
		RetryCount: 0,
		MaxRetries: 5,
		CreatedAt:  time.Now(),
	}

	data, err := json.Marshal(job)
	if err != nil {
		return err
	}

	if q.inMemory || q.rdb == nil {
		// Executa assíncrono em goroutine quando sem Redis
		go q.dispatchWebhookDirect(job)
		return nil
	}

	return q.rdb.RPush(ctx, "kallia:queue:webhooks", data).Err()
}

func (q *QueueManager) webhookWorker() {
	defer q.wg.Done()
	client := &http.Client{Timeout: 10 * time.Second}

	for {
		select {
		case <-q.ctx.Done():
			return
		default:
			if q.rdb == nil {
				time.Sleep(1 * time.Second)
				continue
			}

			// BLPop com timeout de 2s para descarregar da fila
			result, err := q.rdb.BLPop(q.ctx, 2*time.Second, "kallia:queue:webhooks").Result()
			if err != nil {
				if err != redis.Nil && !strings.Contains(err.Error(), "context canceled") {
					time.Sleep(500 * time.Millisecond)
				}
				continue
			}

			if len(result) < 2 {
				continue
			}

			var job WebhookJob
			if err := json.Unmarshal([]byte(result[1]), &job); err != nil {
				q.log.Warn("[Queue] Erro ao deserializar WebhookJob", "err", err)
				continue
			}

			if err := q.executeWebhook(client, &job); err != nil {
				job.RetryCount++
				if job.RetryCount <= job.MaxRetries {
					backoff := time.Duration(job.RetryCount*job.RetryCount) * time.Second
					q.log.Warn("[Queue] Falha no webhook, reagendando retry", "url", job.URL, "retry", job.RetryCount, "backoff", backoff)
					go func(j WebhookJob, d time.Duration) {
						time.Sleep(d)
						data, _ := json.Marshal(j)
						if q.rdb != nil {
							_ = q.rdb.RPush(context.Background(), "kallia:queue:webhooks", data)
						}
					}(job, backoff)
				} else {
					q.log.Error("[Queue] Webhook excedeu máximo de retries (DLQ)", "url", job.URL)
				}
			}
		}
	}
}

func (q *QueueManager) executeWebhook(client *http.Client, job *WebhookJob) error {
	if err := validateOutboundURL(job.URL, false); err != nil {
		return fmt.Errorf("url bloqueada por política SSRF: %w", err)
	}

	body, err := json.Marshal(job.Payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(q.ctx, http.MethodPost, job.URL, strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range job.Headers {
		req.Header.Set(k, v)
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("status HTTP retornado pelo servidor de destino: %d", resp.StatusCode)
	}
	return nil
}

func (q *QueueManager) dispatchWebhookDirect(job WebhookJob) {
	client := &http.Client{Timeout: 10 * time.Second}
	_ = q.executeWebhook(client, &job)
}
