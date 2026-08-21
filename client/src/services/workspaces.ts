import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type { Workspace } from "@/stores/workspace";
import type { SessionInfo } from "@/types/session";

export interface WorkspaceMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  created: string;
}

export const listWorkspaces = () =>
  apiGet<{ workspaces: Workspace[] }>("/api/workspaces").then((r) => r.workspaces ?? []);

export const getWorkspace = (id: string) =>
  apiGet<{ workspace: Workspace }>(`/api/workspaces/${id}`).then((r) => r.workspace);

export const createWorkspace = (name: string, plan = "trial") =>
  apiPost<{ workspace: Workspace }>("/api/workspaces", { name, plan }).then((r) => r.workspace);

export const updateWorkspace = (id: string, data: Partial<Workspace>) =>
  apiPatch<{ workspace: Workspace }>(`/api/workspaces/${id}`, data).then((r) => r.workspace);

export const deleteWorkspace = (id: string) =>
  apiDelete(`/api/workspaces/${id}`);

export const listWorkspaceConnections = (wid: string) =>
  apiGet<SessionInfo[]>(`/api/workspaces/${wid}/connections`);

export const createWorkspaceConnection = (wid: string, name?: string) =>
  apiPost<SessionInfo>(`/api/workspaces/${wid}/connections`, { name });

export const listWorkspaceMembers = (wid: string) =>
  apiGet<{ members: WorkspaceMember[] }>(`/api/workspaces/${wid}/members`).then((r) => r.members ?? []);

export const inviteWorkspaceMember = (wid: string, email: string, role = "member") =>
  apiPost<{ status: string; message: string }>(`/api/workspaces/${wid}/members`, { email, role });

export const removeWorkspaceMember = (wid: string, memberId: string) =>
  apiDelete(`/api/workspaces/${wid}/members/${memberId}`);
