import { apiGet, apiPost, apiDelete } from "@/lib/api";
import type { SessionInfo } from "@/types/session";

export const listSessions = (workspaceId?: string) => {
  if (workspaceId && workspaceId !== "all") {
    return apiGet<SessionInfo[]>(`/api/workspaces/${workspaceId}/connections`).then((r) => r ?? []);
  }
  return apiGet<{ sessions: SessionInfo[] }>("/api/sessions").then((r) => r.sessions ?? []);
};

export const createSession = (name: string, workspaceId?: string) => {
  if (workspaceId && workspaceId !== "default") {
    return apiPost<SessionInfo>(`/api/workspaces/${workspaceId}/connections`, { name });
  }
  return apiPost<{ id: string }>("/api/sessions", { name });
};

export const deleteSession = (id: string) => apiDelete(`/api/sessions/${id}`);

export const renameSession = (id: string, name: string) =>
  apiPost<{ status: string }>(`/api/sessions/${id}/rename`, { name });

export const logoutSession = (id: string) => apiPost<void>(`/api/sessions/${id}/logout`, {});

export const pairSession = (id: string) => apiPost<void>(`/api/sessions/${id}/pair`, {});
