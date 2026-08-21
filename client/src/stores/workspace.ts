import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

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
  role?: string;
  created_at?: string;
}

interface WorkspaceState {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isLoading: boolean;
  error: string | null;

  fetchWorkspaces: () => Promise<Workspace[]>;
  setCurrentWorkspace: (workspace: Workspace | string) => void;
  createWorkspace: (name: string) => Promise<Workspace>;
  updateWorkspace: (id: string, data: Partial<Workspace>) => Promise<Workspace>;
  deleteWorkspace: (id: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [],
      currentWorkspace: null,
      isLoading: false,
      error: null,

      fetchWorkspaces: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await apiGet<{ workspaces: Workspace[] }>("/api/workspaces");
          const list = res.workspaces || [];
          set({ workspaces: list });

          const current = get().currentWorkspace;
          if (!current || !list.some((w: Workspace) => w.id === current.id)) {
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
        if (typeof workspace === "string") {
          const found = get().workspaces.find((w: Workspace) => w.id === workspace);
          if (found) set({ currentWorkspace: found });
        } else {
          set({ currentWorkspace: workspace });
        }
      },

      createWorkspace: async (name: string) => {
        const res = await apiPost<{ workspace: Workspace }>("/api/workspaces", { name });
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
    }),
    {
      name: "kallia-workspace-store",
      partialize: (state) => ({ currentWorkspace: state.currentWorkspace }),
    },
  ),
);
