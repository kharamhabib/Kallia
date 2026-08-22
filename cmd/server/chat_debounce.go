package main

import (
	"context"
	"sync"
	"time"
)

// QueuedChatMessage armazena os dados de uma mensagem no buffer de debounce.
type QueuedChatMessage struct {
	MessageID   string
	ContentType string // "text", "audio", "image", etc.
	Content     string
	MediaURL    string
	CreatedAt   time.Time
}

type conversationDebounceState struct {
	mu           sync.Mutex
	workspaceID  string
	sessionID    string
	contactPhone string
	messages     []QueuedChatMessage
	timer        *time.Timer
	cancelGen    context.CancelFunc
	isGenerating bool
}

// ChatDebounceManager gerencia o agrupamento de mensagens picadas por conversa.
type ChatDebounceManager struct {
	mu       sync.Mutex
	states   map[string]*conversationDebounceState
	delay    time.Duration
	onAction func(ctx context.Context, wid, convID, sid, phone string, msgs []QueuedChatMessage)
}

func newChatDebounceManager(delay time.Duration, onAction func(ctx context.Context, wid, convID, sid, phone string, msgs []QueuedChatMessage)) *ChatDebounceManager {
	if delay <= 0 {
		delay = 3 * time.Second
	}
	return &ChatDebounceManager{
		states:   make(map[string]*conversationDebounceState),
		delay:    delay,
		onAction: onAction,
	}
}

// EnqueueMessage adiciona uma mensagem ao buffer da conversa e reinicia o temporizador de debounce.
func (m *ChatDebounceManager) EnqueueMessage(wid, convID, sid, phone string, msg QueuedChatMessage) {
	m.mu.Lock()
	state, exists := m.states[convID]
	if !exists {
		state = &conversationDebounceState{
			workspaceID:  wid,
			sessionID:    sid,
			contactPhone: phone,
			messages:     make([]QueuedChatMessage, 0, 4),
		}
		m.states[convID] = state
	}
	m.mu.Unlock()

	state.mu.Lock()
	defer state.mu.Unlock()

	state.workspaceID = wid
	state.sessionID = sid
	state.contactPhone = phone
	state.messages = append(state.messages, msg)

	// Se houver uma geração em andamento, cancela para que a nova mensagem seja incorporada
	if state.isGenerating && state.cancelGen != nil {
		state.cancelGen()
		state.cancelGen = nil
		state.isGenerating = false
	}

	// Para o timer anterior caso ainda estivesse contando
	if state.timer != nil {
		state.timer.Stop()
	}

	// Inicia nova contagem de debounce (ex: 3s de silêncio após a última mensagem)
	state.timer = time.AfterFunc(m.delay, func() {
		m.processConversation(convID)
	})
}

// Cancel interrompe qualquer debounce ou geração em andamento para a conversa (ex: intervenção humana).
func (m *ChatDebounceManager) Cancel(convID string) {
	m.mu.Lock()
	state, exists := m.states[convID]
	if exists {
		delete(m.states, convID)
	}
	m.mu.Unlock()

	if !exists || state == nil {
		return
	}

	state.mu.Lock()
	defer state.mu.Unlock()

	if state.timer != nil {
		state.timer.Stop()
		state.timer = nil
	}
	if state.cancelGen != nil {
		state.cancelGen()
		state.cancelGen = nil
	}
	state.isGenerating = false
	state.messages = nil
}

func (m *ChatDebounceManager) processConversation(convID string) {
	m.mu.Lock()
	state, exists := m.states[convID]
	m.mu.Unlock()

	if !exists || state == nil {
		return
	}

	state.mu.Lock()
	if len(state.messages) == 0 {
		state.mu.Unlock()
		return
	}

	// Clona mensagens acumuladas
	accumulated := make([]QueuedChatMessage, len(state.messages))
	copy(accumulated, state.messages)
	state.messages = nil

	ctx, cancel := context.WithCancel(context.Background())
	state.cancelGen = cancel
	state.isGenerating = true

	wid := state.workspaceID
	sid := state.sessionID
	phone := state.contactPhone
	state.mu.Unlock()

	defer func() {
		state.mu.Lock()
		state.isGenerating = false
		state.cancelGen = nil
		state.mu.Unlock()
	}()

	if m.onAction != nil {
		m.onAction(ctx, wid, convID, sid, phone, accumulated)
	}
}
