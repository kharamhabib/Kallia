export interface ChatAgent {
  id: string;
  workspace_id: string;
  name: string;
  avatar_url?: string;
  provider: "gemini" | "openai" | "grok";
  model_name: string;
  system_prompt: string;
  temperature: number;
  max_tokens: number;
  typing_delay_sec: number;
  audio_reply_mode: "text" | "mirror" | "audio";
  max_bubbles: number;
  is_default: boolean;
  tools_enabled: boolean;
  predefined_tools: string[];
  custom_tools: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
  rag_enabled: boolean;
  rag_sources: string[];
  handoff_enabled: boolean;
  handoff_keywords: string[];
  active: boolean;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  workspace_id: string;
  title: string;
  source_type: "text" | "file" | "url" | "faq";
  category: string;
  source_name?: string;
  content: string;
  tokens_count: number;
  chunks_count: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeSearchMatch {
  chunk_text: string;
  source_id: string;
  source_type: string;
  similarity: number;
}
