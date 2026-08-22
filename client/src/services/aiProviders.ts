import { apiGet, apiPost } from "@/lib/api";

export type AIModelInfo = {
  id: string;
  name: string;
  description: string;
};

export type AIProviderConfig = {
  provider: "gemini" | "grok" | "openai";
  name: string;
  enabled: boolean;
  hasKey: boolean;
  maskedKey: string;
  defaultModel: string;
  availableModels: AIModelInfo[];
  options?: Record<string, unknown>;
};

export const getAIProviders = (wid?: string) => {
  const url = wid ? `/api/workspaces/${wid}/ai-providers` : "/api/ai-providers";
  return apiGet<{ providers: AIProviderConfig[] }>(url);
};

export const updateAIProvider = (
  provider: string,
  payload: {
    apiKey?: string;
    enabled: boolean;
    defaultModel?: string;
    options?: Record<string, unknown>;
  },
  wid?: string
) => {
  const url = wid ? `/api/workspaces/${wid}/ai-providers/${provider}` : `/api/ai-providers/${provider}`;
  return apiPost<AIProviderConfig>(url, payload);
};
