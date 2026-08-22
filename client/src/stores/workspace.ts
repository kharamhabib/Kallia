import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { getUser } from "@/lib/auth";

export interface WorkspaceMember {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
  created: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: "trial" | "basic" | "pro" | "expert" | "enterprise";
  plan_status: "active" | "inactive" | "canceled" | "past_due";
  max_connections?: number;
  max_concurrent_calls?: number;
  max_agents?: number;
  connections_count?: number;
  agents_count?: number;
  default_session_id?: string;
  role?: string;
  membership_role?: "owner" | "creator" | "admin" | "member" | string;
  creator_name?: string;
  creator_email?: string;
  created_at?: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  members: WorkspaceMember[];
  isLoading: boolean;
  isLoadingMembers: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<Workspace[]>;
  setCurrentWorkspace: (workspace: Workspace | string) => void;
  createWorkspace: (name: string, plan?: string) => Promise<Workspace>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
  setDefaultSession: (wid: string, sessionId: string) => Promise<Workspace>;

  fetchMembers: (wid: string) => Promise<WorkspaceMember[]>;
  inviteMember: (wid: string, email: string, role?: string) => Promise<void>;
  removeMember: (wid: string, memberId: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspace: null,
      members: [],
      isLoading: false,
      isLoadingMembers: false,
      error: null,

      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiGet<{ workspaces: Workspace[] }>("/api/workspaces");
          const list = res.workspaces || [];
          set({ workspaces: list });

          const current = get().currentWorkspace;
          const user = getUser();
          const isSuperAdmin = user?.role === "appadmin" || user?.role === "superadmin";

          // Se for superadmin e estiver administrando um workspace, preserva a seleção
          if (isSuperAdmin && current?.id) {
            const updated = list.find((w: Workspace) => w.id === current.id);
            if (updated) {
              set({ currentWorkspace: updated });
            }
          } else if (!current || !list.some((w: Workspace) => w.id === current.id)) {
            if (list.length > 0) {
              set({ currentWorkspace: list[0] });
            } else {
              set({ currentWorkspace: null });
            }
          } else {
            // Atualiza os dados do workspace atual caso o plano ou contagem tenha mudado
            const updatedCurrent = list.find((w: Workspace) => w.id === current.id);
            if (updatedCurrent) {
              set({ currentWorkspace: updatedCurrent });
            }
          }
          return list;
        } catch (err: any) {
          set({ error: err.message || "Erro ao carregar workspaces" });
          return [];
        } finally {
          set({ isLoading: false });
        }
      },

      setCurrentWorkspace: (workspace) => {
        let selected: Workspace | null = null;
        if (typeof workspace === "string") {
          const found = get().workspaces.find((w: Workspace) => w.id === workspace);
          if (found) {
            selected = found;
          } else {
            selected = { id: workspace, name: workspace, plan: "trial", plan_status: "active" };
          }
        } else {
          selected = workspace;
        }
        set({ currentWorkspace: selected });
      },

      createWorkspace: async (name: string, plan = "trial") => {
        const res = await apiPost<{ workspace: Workspace }>("/api/workspaces", { name, plan });
        const newWs = res.workspace;
        const updated = [...get().workspaces, newWs];
        set({ workspaces: updated, currentWorkspace: newWs });
        return newWs;
      },

      updateWorkspace: async (id: string, data: Partial<Workspace>) => {
        const res = await apiPatch<{ workspace: Workspace }>(`/api/workspaces/${id}`, data);
        const updatedWs = res.workspace;
        const list = get().workspaces.map((w: Workspace) => (w.id === id ? updatedWs : w));
        set({
          workspaces: list,
          currentWorkspace: get().currentWorkspace?.id === id ? updatedWs : get().currentWorkspace,
        });
        return updatedWs;
      },

      deleteWorkspace: async (id: string) => {
        await apiDelete(`/api/workspaces/${id}`);
        const list = get().workspaces.filter((w: Workspace) => w.id !== id);
        set({
          workspaces: list,
          currentWorkspace: list.length > 0 ? list[0] : null,
        });
      },

      setDefaultSession: async (wid: string, sessionId: string) => {
        return get().updateWorkspace(wid, { default_session_id: sessionId });
      },

      fetchMembers: async (wid: string) => {
        set({ isLoadingMembers: true });
        try {
          const res = await apiGet<{ members: WorkspaceMember[] }>(`/api/workspaces/${wid}/members`);
          const membersList = res.members || [];
          set({ members: membersList });
          return membersList;
        } catch {
          return [];
        } finally {
          set({ isLoadingMembers: false });
        }
      },

      inviteMember: async (wid: string, email: string, role = "member") => {
        await apiPost(`/api/workspaces/${wid}/members`, { email, role });
        await get().fetchMembers(wid);
      },

      removeMember: async (wid: string, memberId: string) => {
        await apiDelete(`/api/workspaces/${wid}/members/${memberId}`);
        set({ members: get().members.filter((m) => m.id !== memberId) });
      },
    }),
    {
      name: "kallia-workspace-store",
      partialize: (state) => ({ currentWorkspace: state.currentWorkspace }),
    },
  ),
);
