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

export const getAIProviders = () =>
  apiGet<{ providers: AIProviderConfig[] }>("/api/ai-providers");

export const updateAIProvider = (
  provider: string,
  payload: {
    apiKey?: string;
    enabled: boolean;
    defaultModel?: string;
    options?: Record<string, unknown>;
  }
) => apiPost<AIProviderConfig>(`/api/ai-providers/${provider}`, payload);
