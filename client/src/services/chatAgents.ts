import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { ChatAgent } from "@/types/chatAgent";

export const listChatAgents = async (workspaceId: string): Promise<ChatAgent[]> => {
  if (!workspaceId) return [];
  const res = await apiGet<ChatAgent[]>(`/api/workspaces/${workspaceId}/chat-agents`);
  return res || [];
};

export const getChatAgent = async (workspaceId: string, id: string): Promise<ChatAgent> => {
  return apiGet<ChatAgent>(`/api/workspaces/${workspaceId}/chat-agents/${id}`);
};

export const createChatAgent = async (
  workspaceId: string,
  agent: Partial<ChatAgent>
): Promise<ChatAgent> => {
  return apiPost<ChatAgent>(`/api/workspaces/${workspaceId}/chat-agents`, agent);
};

export const updateChatAgent = async (
  workspaceId: string,
  id: string,
  agent: Partial<ChatAgent>
): Promise<ChatAgent> => {
  return apiPut<ChatAgent>(`/api/workspaces/${workspaceId}/chat-agents/${id}`, agent);
};

export const deleteChatAgent = async (
  workspaceId: string,
  id: string
): Promise<{ ok: boolean }> => {
  return apiDelete<{ ok: boolean }>(`/api/workspaces/${workspaceId}/chat-agents/${id}`);
};

export const testChatAgent = async (
  workspaceId: string,
  id: string,
  message: string,
  history: Array<{ sender: string; content: string }>
): Promise<{ bubbles: string[] }> => {
  return apiPost<{ bubbles: string[] }>(`/api/workspaces/${workspaceId}/chat-agents/${id}/test`, {
    message,
    history,
  });
};
