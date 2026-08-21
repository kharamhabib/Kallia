import { apiGet, apiPatch } from "@/lib/api";

export interface AdminOverviewStats {
  totalUsers: number;
  totalWorkspaces: number;
  activeSessions: number;
  totalCalls: number;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "appadmin" | "creator" | "normal" | string;
  avatar?: string;
  workspace_id?: string;
  created: string;
  updated: string;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  plan: "trial" | "basic" | "pro" | "expert" | "enterprise" | string;
  plan_status: "active" | "inactive" | "canceled" | "past_due" | string;
  max_connections: number;
  max_concurrent_calls: number;
  max_agents: number;
  connections_count: number;
  creator_name?: string;
  creator_email?: string;
  created_at: string;
}

export const getAdminOverview = () =>
  apiGet<AdminOverviewStats>("/api/admin/overview");

export const getAdminUsers = () =>
  apiGet<{ users: AdminUser[] }>("/api/admin/users").then((r) => r.users ?? []);

export const updateAdminUserRole = (uid: string, role: string) =>
  apiPatch<{ status: string; message: string }>(`/api/admin/users/${uid}/role`, { role });

export const getAdminWorkspaces = () =>
  apiGet<{ workspaces: AdminWorkspace[] }>("/api/admin/workspaces").then((r) => r.workspaces ?? []);

export const updateAdminWorkspace = (wid: string, data: Partial<AdminWorkspace>) =>
  apiPatch<{ status: string; message: string }>(`/api/admin/workspaces/${wid}`, data);
