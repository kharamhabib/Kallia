import React, { useState, useEffect } from "react";
import {
  Building2,
  ChevronDown,
  Plus,
  Check,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const WorkspaceSelector: React.FC = () => {
  const {
    workspaces,
    currentWorkspace,
    fetchWorkspaces,
    setCurrentWorkspace,
    createWorkspace,
  } = useWorkspaceStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    setIsSubmitting(true);
    try {
      await createWorkspace(newWorkspaceName.trim());
      toast.success("Workspace criado com sucesso!");
      setNewWorkspaceName("");
      setIsCreating(false);
      setIsOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar workspace");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getPlanBadge = (plan?: string) => {
    switch (plan) {
      case "enterprise":
        return { label: "Enterprise", color: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20" };
      case "expert":
        return { label: "Expert", color: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20" };
      case "pro":
        return { label: "Pro", color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20" };
      case "basic":
        return { label: "Basic", color: "bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/20" };
      default:
        return { label: "Trial", color: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" };
    }
  };

  const planBadge = getPlanBadge(currentWorkspace?.plan);

  return (
    <div className="relative w-full">
      {/* Botão Principal do Workspace */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-2.5 rounded-xl border bg-card/80 p-2 text-xs font-semibold shadow-xs hover:border-primary/40 transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary/90 to-primary text-primary-foreground font-bold text-xs shrink-0 shadow-2xs group-hover:scale-105 transition-transform">
            {currentWorkspace ? (
              currentWorkspace.name.slice(0, 1).toUpperCase()
            ) : (
              <Building2 className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0 text-left">
            <p className="truncate text-xs font-bold text-foreground leading-tight">
              {currentWorkspace ? currentWorkspace.name : "Selecionar Workspace"}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold border",
                  planBadge.color,
                )}
              >
                {planBadge.label}
              </span>
              {currentWorkspace?.connections_count !== undefined && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  • {currentWorkspace.connections_count}/{currentWorkspace.max_connections || 1} Whats
                </span>
              )}
            </div>
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* Menu Dropdown */}
      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute top-13 left-0 right-0 z-50 rounded-xl border bg-popover p-1.5 shadow-xl animate-in fade-in-80 space-y-1 w-[260px]">
            <div className="flex items-center justify-between px-2 py-1">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                Seus Workspaces
              </p>
              <span className="text-[10px] text-muted-foreground">
                {workspaces.length} total
              </span>
            </div>

            {/* Lista de Workspaces */}
            <div className="space-y-0.5 max-h-52 overflow-y-auto custom-scrollbar">
              {workspaces.map((ws) => {
                const isSelected = ws.id === currentWorkspace?.id;
                const badge = getPlanBadge(ws.plan);

                return (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setCurrentWorkspace(ws);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-colors cursor-pointer text-left",
                      isSelected
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted/60 text-foreground",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={cn(
                          "flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-bold shrink-0",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {ws.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs">{ws.name}</p>
                        <span
                          className={cn(
                            "inline-flex items-center px-1 py-0 rounded text-[8px] font-medium border mt-0.5",
                            badge.color,
                          )}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-primary shrink-0 ml-2" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Ações Inferiores */}
            <div className="pt-1.5 border-t border-border/50 space-y-1">
              {!isCreating ? (
                <button
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-primary font-medium hover:bg-primary/10 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Novo Workspace</span>
                </button>
              ) : (
                <form onSubmit={handleCreateWorkspace} className="p-1 space-y-1.5">
                  <input
                    type="text"
                    placeholder="Nome do Workspace..."
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    autoFocus
                    className="w-full text-xs px-2.5 py-1.5 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <div className="flex items-center gap-1.5 justify-end">
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted rounded cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || !newWorkspaceName.trim()}
                      className="px-2.5 py-1 text-[11px] bg-primary text-primary-foreground font-semibold rounded hover:bg-primary/90 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmitting ? "Criando..." : "Criar"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
