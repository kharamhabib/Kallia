import { apiGet, apiPost, apiDelete, apiPut } from "@/lib/api";

export interface Agent {
  id: string;
  sessionId: string;
  name: string;
  description: string;
  // Derived from inbound/outbound booleans returned by backend
  role: "inbound" | "outbound" | "both";
  isActive: boolean; // true if inbound or outbound is set
  inbound: boolean;
  outbound: boolean;
  aiConfig: {
    provider?: string;
    modelName?: string;
    systemInstruction?: string;
    voiceName?: string;
    languageCode?: string;
    temperature?: number;
    toolsEnabled?: boolean;
    predefinedTools?: string[];
    geminiApiKey?: string;
  };
  createdAt?: string;
}

/** What we send to the backend */
interface AgentPayload {
  name: string;
  description: string;
  aiConfig: string; // JSON-serialized AIConfig
  inbound: boolean;
  outbound: boolean;
}

export interface AgentUpsert {
  name: string;
  description: string;
  role?: Agent["role"];
  inbound?: boolean;
  outbound?: boolean;
  isActive?: boolean;
  aiConfig: Agent["aiConfig"];
}

/** Convert backend row (inbound/outbound) to the nicer Agent interface */
const mapAgent = (row: any): Agent => {
  const inbound = !!row.inbound;
  const outbound = !!row.outbound;
  const role: Agent["role"] = inbound && outbound ? "both" : inbound ? "inbound" : "outbound";
  let aiConfig = {};
  try { aiConfig = JSON.parse(row.aiConfig || "{}"); } catch {}
  return {
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    description: row.description,
    role,
    isActive: inbound || outbound,
    inbound,
    outbound,
    aiConfig,
    createdAt: row.createdAt,
  };
};

/** Build the raw payload for the backend from our AgentUpsert shape */
const toPayload = (data: AgentUpsert): AgentPayload => ({
  name: data.name,
  description: data.description,
  aiConfig: JSON.stringify(data.aiConfig),
  inbound: data.inbound ?? (data.role === "inbound" || data.role === "both"),
  outbound: data.outbound ?? (data.role === "outbound" || data.role === "both"),
});

export const listAgents = async (sessionId?: string, workspaceId?: string): Promise<Agent[]> => {
  const url = workspaceId
    ? `/api/workspaces/${workspaceId}/agents`
    : sessionId
    ? `/api/sessions/${sessionId}/agents`
    : "/api/agents";
  const r = await apiGet<{ agents: any[] }>(url);
  return (r.agents ?? []).map(mapAgent);
};

export const createAgent = async (sessionId: string | undefined, data: AgentUpsert, workspaceId?: string): Promise<Agent> => {
  const url = workspaceId
    ? `/api/workspaces/${workspaceId}/agents`
    : `/api/sessions/${sessionId}/agents`;
  const r = await apiPost<{ id: string }>(url, toPayload(data));
  // Refetch to get the full row
  const agents = await listAgents(sessionId, workspaceId);
  return agents.find((a) => a.id === r.id) ?? ({ id: r.id, ...data, inbound: false, outbound: false, isActive: false } as any);
};

export const updateAgent = async (sessionId: string | undefined, agentId: string, data: Partial<AgentUpsert>, workspaceId?: string): Promise<void> => {
  const url = workspaceId
    ? `/api/workspaces/${workspaceId}/agents/${agentId}`
    : `/api/sessions/${sessionId}/agents/${agentId}`;
  await apiPut<{ status: string }>(url, {
    name: data.name ?? "",
    description: data.description ?? "",
    aiConfig: JSON.stringify(data.aiConfig ?? {}),
    inbound: data.role === "inbound" || data.role === "both",
    outbound: data.role === "outbound" || data.role === "both",
  });
};

export const deleteAgent = (sessionId: string | undefined, agentId: string, workspaceId?: string) => {
  const url = workspaceId
    ? `/api/workspaces/${workspaceId}/agents/${agentId}`
    : `/api/sessions/${sessionId}/agents/${agentId}`;
  return apiDelete(url);
};

export const activateAgent = (sessionId: string, agentId: string, direction: "inbound" | "outbound") =>
  apiPost<{ status: string }>(`/api/sessions/${sessionId}/agents/${agentId}/set-active`, { direction });

export const deactivateAgent = async (sessionId: string, agentId: string, direction: "inbound" | "outbound", workspaceId?: string): Promise<void> => {
  // Get current agent state and clear the direction
  const agents = await listAgents(sessionId, workspaceId);
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return;
  const url = workspaceId
    ? `/api/workspaces/${workspaceId}/agents/${agentId}`
    : `/api/sessions/${sessionId}/agents/${agentId}`;
  await apiPut<{ status: string }>(url, {
    name: agent.name,
    description: agent.description,
    aiConfig: JSON.stringify(agent.aiConfig),
    inbound: direction === "inbound" ? false : agent.inbound,
    outbound: direction === "outbound" ? false : agent.outbound,
  });
};
