import { apiGet, apiPost, apiDelete } from "@/lib/api";
import type { AIConfig } from "@/types/ai";

export const getAIConfig = (sid?: string, wid?: string) => {
  const url = wid
    ? `/api/workspaces/${wid}/ai-config`
    : sid
    ? `/api/sessions/${sid}/ai-config`
    : "/api/ai-config";
  return apiGet<{ aiConfig: AIConfig; enabled: boolean }>(url);
};

export const setAIConfig = (sid: string | undefined, config: AIConfig, wid?: string) => {
  const url = wid
    ? `/api/workspaces/${wid}/ai-config`
    : sid
    ? `/api/sessions/${sid}/ai-config`
    : "/api/ai-config";
  return apiPost<{ aiConfig: AIConfig }>(url, config);
};

export const deleteAIConfig = (sid: string) =>
  apiDelete(`/api/sessions/${sid}/ai-config`);

export const getNPSSummary = (sid?: string, wid?: string) => {
  const url = wid ? `/api/workspaces/${wid}/nps/summary` : `/api/sessions/${sid}/nps/summary`;
  return apiGet<{ summary: import("@/types/ai").NPSSummary }>(url);
};

export const getNPSRatings = (sid?: string, wid?: string) => {
  const url = wid ? `/api/workspaces/${wid}/nps` : `/api/sessions/${sid}/nps`;
  return apiGet<{ ratings: import("@/types/ai").CallRating[] }>(url);
};

