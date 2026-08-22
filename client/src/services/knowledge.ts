import { apiGet, apiPost, apiPut, apiDelete, apiPatch } from "@/lib/api";
import type { KnowledgeDocument, KnowledgeSearchMatch } from "@/types/chatAgent";

export const listKnowledgeDocs = async (
  workspaceId: string,
  search?: string,
  category?: string
): Promise<KnowledgeDocument[]> => {
  if (!workspaceId) return [];
  const params = new URLSearchParams();
  if (search) params.append("search", search);
  if (category && category !== "all") params.append("category", category);

  const qs = params.toString();
  const url = `/api/workspaces/${workspaceId}/knowledge${qs ? `?${qs}` : ""}`;
  const res = await apiGet<KnowledgeDocument[]>(url);
  return res || [];
};

export const getKnowledgeDoc = async (
  workspaceId: string,
  id: string
): Promise<KnowledgeDocument> => {
  return apiGet<KnowledgeDocument>(`/api/workspaces/${workspaceId}/knowledge/${id}`);
};

export const createKnowledgeDoc = async (
  workspaceId: string,
  doc: Partial<KnowledgeDocument>
): Promise<KnowledgeDocument> => {
  return apiPost<KnowledgeDocument>(`/api/workspaces/${workspaceId}/knowledge`, doc);
};

export const updateKnowledgeDoc = async (
  workspaceId: string,
  id: string,
  doc: Partial<KnowledgeDocument>
): Promise<KnowledgeDocument> => {
  return apiPut<KnowledgeDocument>(`/api/workspaces/${workspaceId}/knowledge/${id}`, doc);
};

export const deleteKnowledgeDoc = async (
  workspaceId: string,
  id: string
): Promise<{ ok: boolean }> => {
  return apiDelete<{ ok: boolean }>(`/api/workspaces/${workspaceId}/knowledge/${id}`);
};

export const toggleKnowledgeDoc = async (
  workspaceId: string,
  id: string,
  enabled: boolean
): Promise<{ ok: boolean; enabled: boolean }> => {
  return apiPatch<{ ok: boolean; enabled: boolean }>(
    `/api/workspaces/${workspaceId}/knowledge/${id}/toggle`,
    { enabled }
  );
};

export const testKnowledgeSearch = async (
  workspaceId: string,
  query: string,
  limit?: number
): Promise<KnowledgeSearchMatch[]> => {
  return apiPost<KnowledgeSearchMatch[]>(`/api/workspaces/${workspaceId}/knowledge/search`, {
    query,
    limit: limit || 4,
  });
};
