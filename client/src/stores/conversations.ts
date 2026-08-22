import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { getToken, getApiBase } from "@/lib/auth";
import type {
  Conversation,
  Message,
  Tag,
  Inbox,
  ConversationFilters,
} from "@/types/omnichannel";

interface ConversationsState {
  conversations: Conversation[];
  activeConversationId: string | null;
  activeConversation: Conversation | null;
  messages: Message[];
  inboxes: Inbox[];
  tags: Tag[];
  replyingToMessage: Message | null;
  isLoadingConversations: boolean;
  isLoadingMessages: boolean;
  isSendingMessage: boolean;
  filters: ConversationFilters;
  typingMap: Record<string, boolean>; // convId -> isTyping
  wsConnected: boolean;

  // Actions
  setReplyingToMessage: (msg: Message | null) => void;
  setFilters: (filters: Partial<ConversationFilters>) => void;
  fetchInboxes: (workspaceId: string) => Promise<void>;
  fetchTags: (workspaceId: string) => Promise<void>;
  fetchConversations: (workspaceId: string) => Promise<void>;
  selectConversation: (conversationId: string | null) => Promise<void>;
  fetchMessages: (conversationId: string) => Promise<void>;
  sendMessage: (payload: {
    content: string;
    content_type?: string;
    base64?: string;
    media_url?: string;
    file_name?: string;
    mimetype?: string;
    reply_to_id?: string;
  }) => Promise<void>;
  reactToMessage: (
    conversationId: string,
    messageId: string,
    emoji: string,
  ) => Promise<void>;
  editMessage: (
    conversationId: string,
    messageId: string,
    content: string,
  ) => Promise<void>;
  deleteMessage: (
    conversationId: string,
    messageId: string,
  ) => Promise<void>;
  updateConversationStatus: (
    conversationId: string,
    status: string,
  ) => Promise<void>;
  toggleAIActive: (
    conversationId: string,
    active: boolean,
  ) => Promise<void>;
  addTagToConversation: (
    conversationId: string,
    tagId: string,
  ) => Promise<void>;
  removeTagFromConversation: (
    conversationId: string,
    tagId: string,
  ) => Promise<void>;
  startConversation: (
    workspaceId: string,
    phone: string,
    name?: string,
    message?: string,
  ) => Promise<Conversation>;
  sendTypingSignal: (conversationId: string, isTyping: boolean, media?: "text" | "audio") => void;
  connectWebSocket: (workspaceId: string) => void;
  disconnectWebSocket: () => void;
}

let activeWS: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export const useConversationsStore = create<ConversationsState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  activeConversation: null,
  messages: [],
  inboxes: [],
  tags: [],
  replyingToMessage: null,
  isLoadingConversations: false,
  isLoadingMessages: false,
  isSendingMessage: false,
  typingMap: {},
  wsConnected: false,
  filters: {
    status: "open",
    assignee: "all",
    channel: "all",
    tagId: "",
    search: "",
  },

  setReplyingToMessage: (msg) => set({ replyingToMessage: msg }),

  setFilters: (newFilters) => {
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
    }));
  },

  fetchInboxes: async (workspaceId: string) => {
    if (!workspaceId) return;
    try {
      const inboxes = await apiGet<Inbox[]>(
        `/api/workspaces/${workspaceId}/inboxes`,
      );
      set({ inboxes: inboxes || [] });
    } catch (err) {
      console.warn("Erro ao buscar inboxes:", err);
    }
  },

  fetchTags: async (workspaceId: string) => {
    if (!workspaceId) return;
    try {
      const tags = await apiGet<Tag[]>(`/api/workspaces/${workspaceId}/tags`);
      set({ tags: tags || [] });
    } catch (err) {
      console.warn("Erro ao buscar tags:", err);
    }
  },

  fetchConversations: async (workspaceId: string) => {
    if (!workspaceId) return;
    set({ isLoadingConversations: true });
    try {
      const { filters } = get();
      const params = new URLSearchParams();
      if (filters.status && filters.status !== "all") params.set("status", filters.status);
      if (filters.assignee && filters.assignee !== "all") params.set("assignee_id", filters.assignee);
      if (filters.channel && filters.channel !== "all") params.set("channel_type", filters.channel);
      if (filters.tagId) params.set("tag_id", filters.tagId);
      if (filters.search) params.set("search", filters.search);
      params.set("limit", "50");

      const res = await apiGet<{ items: Conversation[]; total: number }>(
        `/api/workspaces/${workspaceId}/conversations?${params.toString()}`,
      );

      const items = res.items || [];
      set({ conversations: items });

      // Se há conversa ativa, atualiza seu objeto
      const { activeConversationId } = get();
      if (activeConversationId) {
        const found = items.find((c) => c.id === activeConversationId);
        if (found) set({ activeConversation: found });
      }
    } catch (err) {
      console.error("Erro ao buscar conversas:", err);
    } finally {
      set({ isLoadingConversations: false });
    }
  },

  selectConversation: async (conversationId: string | null) => {
    if (!conversationId) {
      set({ activeConversationId: null, activeConversation: null, messages: [] });
      return;
    }

    const { conversations } = get();
    const found = conversations.find((c) => c.id === conversationId) || null;
    set({ activeConversationId: conversationId, activeConversation: found });

    await get().fetchMessages(conversationId);
  },

  fetchMessages: async (conversationId: string) => {
    if (!conversationId) return;
    set({ isLoadingMessages: true });
    try {
      const msgs = await apiGet<Message[]>(
        `/api/conversations/${conversationId}/messages?limit=100`,
      );
      set({ messages: msgs || [] });
    } catch (err) {
      console.error("Erro ao buscar mensagens:", err);
    } finally {
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (payload) => {
    const { activeConversationId, activeConversation } = get();
    if (!activeConversationId) return;

    set({ isSendingMessage: true });
    try {
      const newMsg = await apiPost<Message>(
        `/api/conversations/${activeConversationId}/messages`,
        payload,
      );

      // Adiciona na lista local otimisticamente caso o WS ainda não tenha entregue
      set((state) => {
        const exists = state.messages.some((m) => m.id === newMsg.id);
        const updated = exists ? state.messages : [...state.messages, newMsg];

        // Atualiza conversa na lista lateral
        const convList = state.conversations.map((c) => {
          if (c.id === activeConversationId) {
            return {
              ...c,
              last_message: newMsg,
              last_msg_at: newMsg.created_at || new Date().toISOString(),
              status: c.status === "resolved" ? ("open" as const) : c.status,
            };
          }
          return c;
        });

        // Reordena para colocar a conversa no topo
        convList.sort(
          (a, b) =>
            new Date(b.last_msg_at).getTime() - new Date(a.last_msg_at).getTime(),
        );

        return {
          messages: updated,
          conversations: convList,
          activeConversation: activeConversation
            ? {
                ...activeConversation,
                last_message: newMsg,
                last_msg_at: newMsg.created_at || new Date().toISOString(),
              }
            : activeConversation,
        };
      });
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      throw err;
    } finally {
      set({ isSendingMessage: false, replyingToMessage: null });
    }
  },

  reactToMessage: async (conversationId, messageId, emoji) => {
    try {
      const res = await apiPost<{ status: string; metadata: any }>(
        `/api/conversations/${conversationId}/messages/${messageId}/react`,
        { emoji },
      );
      if (res?.metadata) {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId ? { ...m, metadata: res.metadata } : m,
          ),
        }));
      }
    } catch (err) {
      console.error("Erro ao reagir à mensagem:", err);
    }
  },

  editMessage: async (conversationId, messageId, content) => {
    try {
      const res = await apiPatch<{ status: string; content: string; metadata: any }>(
        `/api/conversations/${conversationId}/messages/${messageId}`,
        { content },
      );
      if (res) {
        set((state) => ({
          messages: state.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: res.content || content,
                  metadata: res.metadata || m.metadata,
                }
              : m,
          ),
        }));
      }
    } catch (err) {
      console.error("Erro ao editar mensagem:", err);
      throw err;
    }
  },

  deleteMessage: async (conversationId, messageId) => {
    try {
      const res = await apiDelete<{ status: string; content: string; metadata: any }>(
        `/api/conversations/${conversationId}/messages/${messageId}`,
      );
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === messageId
            ? {
                ...m,
                content: res?.content || "Esta mensagem foi apagada",
                metadata: res?.metadata || {
                  ...(m.metadata || {}),
                  is_deleted: true,
                },
              }
            : m,
        ),
      }));
    } catch (err) {
      console.error("Erro ao apagar mensagem:", err);
      throw err;
    }
  },

  updateConversationStatus: async (conversationId: string, status: string) => {
    try {
      await apiPatch(`/api/conversations/${conversationId}`, { status });
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, status: status as any } : c,
        ),
        activeConversation:
          state.activeConversation?.id === conversationId
            ? { ...state.activeConversation, status: status as any }
            : state.activeConversation,
      }));
    } catch (err) {
      console.error("Erro ao atualizar status:", err);
    }
  },

  toggleAIActive: async (conversationId: string, active: boolean) => {
    try {
      await apiPatch(`/api/conversations/${conversationId}`, {
        ai_active: active,
      });
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, ai_active: active } : c,
        ),
        activeConversation:
          state.activeConversation?.id === conversationId
            ? { ...state.activeConversation, ai_active: active }
            : state.activeConversation,
      }));
    } catch (err) {
      console.error("Erro ao alternar IA:", err);
    }
  },

  addTagToConversation: async (conversationId: string, tagId: string) => {
    try {
      await apiPost(`/api/conversations/${conversationId}/tags`, {
        tag_id: tagId,
      });
      const { tags } = get();
      const tagObj = tags.find((t) => t.id === tagId);
      if (tagObj) {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              const currentTags = c.tags || [];
              if (!currentTags.some((t) => t.id === tagId)) {
                return { ...c, tags: [...currentTags, tagObj] };
              }
            }
            return c;
          }),
          activeConversation:
            state.activeConversation?.id === conversationId
              ? {
                  ...state.activeConversation,
                  tags: [
                    ...(state.activeConversation.tags || []).filter(
                      (t) => t.id !== tagId,
                    ),
                    tagObj,
                  ],
                }
              : state.activeConversation,
        }));
      }
    } catch (err) {
      console.error("Erro ao vincular tag:", err);
    }
  },

  removeTagFromConversation: async (conversationId: string, tagId: string) => {
    try {
      await apiDelete(`/api/conversations/${conversationId}/tags/${tagId}`);
      set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id === conversationId) {
            return {
              ...c,
              tags: (c.tags || []).filter((t) => t.id !== tagId),
            };
          }
          return c;
        }),
        activeConversation:
          state.activeConversation?.id === conversationId
            ? {
                ...state.activeConversation,
                tags: (state.activeConversation.tags || []).filter(
                  (t) => t.id !== tagId,
                ),
              }
            : state.activeConversation,
      }));
    } catch (err) {
      console.error("Erro ao desvincular tag:", err);
    }
  },

  startConversation: async (workspaceId, phone, name, message) => {
    try {
      const conv = await apiPost<Conversation>(
        `/api/workspaces/${workspaceId}/conversations/start`,
        { phone, name, message },
      );

      set((state) => {
        const exists = state.conversations.some((c) => c.id === conv.id);
        const list = exists ? state.conversations : [conv, ...state.conversations];
        return {
          conversations: list,
          activeConversationId: conv.id,
          activeConversation: conv,
        };
      });

      await get().fetchMessages(conv.id);
      return conv;
    } catch (err) {
      console.error("Erro ao iniciar conversa:", err);
      throw err;
    }
  },

  sendTypingSignal: (conversationId: string, isTyping: boolean, media: "text" | "audio" = "text") => {
    if (activeWS && activeWS.readyState === WebSocket.OPEN) {
      activeWS.send(
        JSON.stringify({
          type: "chat_presence",
          conversation_id: conversationId,
          is_typing: isTyping,
          media,
        }),
      );
    }
  },

  connectWebSocket: (workspaceId: string) => {
    if (!workspaceId) return;
    if (activeWS && activeWS.readyState === WebSocket.OPEN) return;

    if (activeWS) {
      try {
        activeWS.close();
      } catch {}
      activeWS = null;
    }

    const token = getToken() || "";
    const loc = window.location;
    const base = getApiBase();

    let wsProto = loc.protocol === "https:" ? "wss:" : "ws:";
    let wsHost = loc.host;

    if (base.startsWith("https://")) {
      wsProto = "wss:";
      try {
        wsHost = new URL(base).host;
      } catch {}
    } else if (base.startsWith("http://")) {
      wsProto = "ws:";
      try {
        wsHost = new URL(base).host;
      } catch {}
    }

    const wsUrl = `${wsProto}//${wsHost}/api/workspaces/${workspaceId}/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      activeWS = ws;

      ws.onopen = () => {
        set({ wsConnected: true });
        console.log("[WS Realtime] Conectado ao workspace:", workspaceId);
      };

      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);

          if (data.type === "message:created" && data.message) {
            const msg: Message = data.message;
            const { activeConversationId } = get();

            // Adiciona na timeline ativa se pertencer a ela
            if (activeConversationId === msg.conversation_id) {
              set((state) => {
                const exists = state.messages.some((m) => m.id === msg.id);
                if (exists) return state;
                return { messages: [...state.messages, msg] };
              });
            }

            // Atualiza na lista de conversas
            set((state) => {
              const updated = state.conversations.map((c) => {
                if (c.id === msg.conversation_id) {
                  return {
                    ...c,
                    last_message: msg,
                    last_msg_at: msg.created_at,
                    status:
                      msg.sender_type === "contact" && c.status === "resolved"
                        ? ("open" as const)
                        : c.status,
                  };
                }
                return c;
              });

              // Reordena
              updated.sort(
                (a, b) =>
                  new Date(b.last_msg_at).getTime() -
                  new Date(a.last_msg_at).getTime(),
              );

              return { conversations: updated };
            });
          } else if (data.type === "message:updated" && data.message_id) {
            set((state) => ({
              messages: state.messages.map((m) => {
                if (m.id === data.message_id) {
                  return {
                    ...m,
                    content: data.content !== undefined ? data.content : m.content,
                    metadata: data.metadata !== undefined ? data.metadata : m.metadata,
                  };
                }
                return m;
              }),
            }));
          } else if (data.type === "message:status" && data.message_ids && Array.isArray(data.message_ids)) {
            const idSet = new Set(data.message_ids);
            const newStatus = data.status;
            set((state) => ({
              messages: state.messages.map((m) =>
                idSet.has(m.id) ? { ...m, status: newStatus } : m,
              ),
            }));
          } else if (data.type === "typing") {
            const convId = data.conversation_id;
            const isTyping = data.is_typing;
            const media = data.media || "text";
            set((state) => ({
              typingMap: { ...state.typingMap, [convId]: isTyping ? { isTyping: true, media } : false },
            }));
          } else if (data.type === "conversation:updated") {
            // Revalida a conversa
            get().fetchConversations(workspaceId);
          }
        } catch (err) {
          console.warn("[WS Realtime] Mensagem não parseada:", err);
        }
      };

      ws.onerror = (err) => {
        console.warn("[WS Realtime] Erro na conexão:", err);
      };

      ws.onclose = () => {
        set({ wsConnected: false });
        activeWS = null;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          get().connectWebSocket(workspaceId);
        }, 3000);
      };
    } catch (e) {
      console.error("[WS Realtime] Falha ao iniciar WebSocket:", e);
    }
  },

  disconnectWebSocket: () => {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (activeWS) {
      try {
        activeWS.close();
      } catch {}
      activeWS = null;
    }
    set({ wsConnected: false });
  },
}));
