import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Smartphone,
  Loader2,
  LogOut,
  CheckCircle2,
  Copy,
  Pencil,
  Bot,
  PhoneIncoming,
  PhoneOutgoing,
  Target,
  QrCode,
  RefreshCw,
  KeyRound,
  ShieldCheck,
  User,
  Settings,
  Crown,
  Star,
  Building2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSessions, setActiveSession, refreshSessions } from "@/stores/sessions";
import { createSession, deleteSession, logoutSession, renameSession, pairSession } from "@/services/sessions";
import { useWorkspaceStore } from "@/stores/workspace";
import { useNavigation } from "@/stores/navigation";
import { listAgents, type Agent } from "@/services/agents";
import { SessionPairing } from "@/components/domain/session/SessionPairing";
import { WorkspaceSettingsModal } from "@/components/domain/workspace/WorkspaceSettingsModal";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { apiUrl, getToken, getUser } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import type { SessionInfo } from "@/types/session";
import { cn } from "@/lib/utils";

const SessionAgentsSummary = ({ sid }: { sid: string }) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAgents(sid)
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sid]);

  if (loading) return null;

  const outboundAgent = agents.find((a) => a.outbound);
  const specialistCount = agents.filter((a) => !a.outbound).length;

  return (
    <div className="rounded-xl border bg-muted/20 p-3 space-y-2 text-xs">
      <div className="flex items-center justify-between font-semibold text-muted-foreground border-b pb-1.5 border-border/50">
        <span className="flex items-center gap-1.5 text-foreground">
          <Bot className="h-3.5 w-3.5 text-primary" /> Agentes da Conexão
        </span>
        {agents.length > 0 && (
          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
            {agents.length} {agents.length === 1 ? "agente" : "agentes"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 pt-0.5">
        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <PhoneIncoming className="h-3 w-3 text-indigo-500" /> Atendimento Recebidas:
          </span>
          <p className="font-medium truncate text-foreground">
            IA Principal da Conexão
          </p>
        </div>

        <div className="space-y-0.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <PhoneOutgoing className="h-3 w-3 text-emerald-500" /> Atendimento Efetuadas:
          </span>
          <p className="font-medium truncate text-foreground">
            {outboundAgent ? outboundAgent.name : "IA Principal da Conexão"}
          </p>
        </div>
      </div>

      {specialistCount > 0 && (
        <div className="pt-1 flex items-center gap-1 text-[11px] text-muted-foreground border-t border-border/40">
          <Target className="h-3 w-3 text-primary shrink-0" />
          <span>{specialistCount} {specialistCount === 1 ? "agente especialista disponível" : "agentes especialistas disponíveis"} para transferência</span>
        </div>
      )}
    </div>
  );
};

export const ConnectionsPage = () => {
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const { currentWorkspace, setDefaultSession, fetchWorkspaces } = useWorkspaceStore();
  const { setActiveSection } = useNavigation();
  const currentUser = getUser();
  const isSuperAdmin = currentUser?.role === "appadmin";

  // Modal de Configurações do Workspace
  const [showWorkspaceSettings, setShowWorkspaceSettings] = useState(false);

  // Estados para criação de nova conexão
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState("WhatsApp");
  const [creating, setCreating] = useState(false);

  // Estados para edição/renomeação de conexão existente
  const [editingSession, setEditingSession] = useState<SessionInfo | null>(null);
  const [editNameInput, setEditNameInput] = useState("");
  const [renaming, setRenaming] = useState(false);

  // Estado para exclusão
  const [toDelete, setToDelete] = useState<SessionInfo | null>(null);

  // Estado para rotação / alteração de API Key
  const [rotateSession, setRotateSession] = useState<SessionInfo | null>(null);
  const [customApiKey, setCustomApiKey] = useState("");
  const [rotatingKey, setRotatingKey] = useState(false);

  // Estado para solicitação de QR code / reconexão
  const [pairingSessionId, setPairingSessionId] = useState<string | null>(null);

  // Filtra conexões do workspace ativo (ou todas se super admin)
  const currentWsId = currentWorkspace?.id || "default";
  const workspaceSessions = sessions.filter((s) => {
    if (isSuperAdmin && !currentWorkspace) return true;
    return s.projectId === currentWsId || (currentWsId === "default" && (!s.projectId || s.projectId === "default"));
  });

  const maxConnections = currentWorkspace?.max_connections || 1;
  const currentConnCount = workspaceSessions.length;
  const isLimitReached = currentConnCount >= maxConnections;
  const usagePercentage = Math.min(100, Math.round((currentConnCount / maxConnections) * 100));

  const refreshSessionsList = async () => {
    try {
      await refreshSessions();
      await fetchWorkspaces();
    } catch {
      // Falhas silenciosas
    }
  };

  useEffect(() => {
    refreshSessionsList();
  }, [currentWsId]);

  const handleRotateKeySubmit = async () => {
    if (!rotateSession) return;
    setRotatingKey(true);
    try {
      const res = await fetch(apiUrl(`/api/sessions/${rotateSession.id}/rotate-key`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ apiKey: customApiKey.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao alterar Chave de API");
        return;
      }
      if (data.apiKey) {
        navigator.clipboard.writeText(data.apiKey);
        toast.success("Nova Chave de API salva e copiada com sucesso!");
      }
      await refreshSessionsList();
      setRotateSession(null);
      setCustomApiKey("");
    } catch {
      toast.error("Erro ao conectar ao servidor para alterar chave");
    } finally {
      setRotatingKey(false);
    }
  };

  const handlePairSession = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPairingSessionId(id);
    try {
      await pairSession(id);
      await refreshSessionsList();
      toast.success("Solicitação enviada. Gerando novo QR Code...");
    } catch (err) {
      toast.error(`Erro ao solicitar QR Code: ${(err as Error).message}`);
    } finally {
      setPairingSessionId(null);
    }
  };

  const handleOpenCreateModal = () => {
    if (isLimitReached) {
      setShowLimitModal(true);
      return;
    }
    setNewSessionName(`WhatsApp ${workspaceSessions.length > 0 ? workspaceSessions.length + 1 : ""}`.trim());
    setShowCreateModal(true);
  };

  const onNewSessionSubmit = async () => {
    const name = newSessionName.trim() || "WhatsApp";
    setCreating(true);
    try {
      const res = await createSession(name, currentWsId);
      const newId = (res as any)?.id || (res as any)?.session?.id || "";
      await refreshSessionsList();
      if (newId) {
        setActiveSession(newId);
      }
      setShowCreateModal(false);
      toast.success("Nova conexão criada com sucesso!");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar sessão");
    } finally {
      setCreating(false);
    }
  };

  const handleSetDefaultSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentWorkspace) return;
    try {
      await setDefaultSession(currentWorkspace.id, sessionId);
      toast.success("Linha padrão atualizada com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao definir linha padrão");
    }
  };

  const handleOpenRenameModal = (session: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSession(session);
    setEditNameInput(session.name);
  };

  const onRenameSubmit = async () => {
    if (!editingSession) return;
    const name = editNameInput.trim();
    if (!name) {
      toast.error("O nome da conexão não pode ser vazio.");
      return;
    }
    setRenaming(true);
    try {
      await renameSession(editingSession.id, name);
      await refreshSessionsList();
      toast.success("Nome da conexão alterado com sucesso!");
      setEditingSession(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRenaming(false);
    }
  };

  const onRemoveSession = async (id: string) => {
    try {
      await deleteSession(id);
      await refreshSessionsList();
      toast.success("Conexão removida.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onLogout = async (id: string) => {
    try {
      await logoutSession(id);
      await refreshSessionsList();
      toast.success("Sessão desconectada.");
    } catch (e) {
      toast.error((e as Error).message);
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
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      {/* Workspace Hub Banner & Header */}
      <div className="rounded-2xl border bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/90 to-primary text-primary-foreground font-bold text-lg shadow-sm">
              {currentWorkspace ? currentWorkspace.name.slice(0, 1).toUpperCase() : <Building2 className="h-6 w-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  {currentWorkspace ? currentWorkspace.name : "Gerenciador de Conexões WhatsApp"}
                </h1>
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border",
                    planBadge.color,
                  )}
                >
                  {planBadge.label}
                </span>
                {isSuperAdmin && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                    <ShieldCheck className="h-3 w-3" /> SuperAdmin
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Conecte e gerencie seus números de WhatsApp para chamadas de voz e IA neste workspace.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWorkspaceSettings(true)}
              className="gap-1.5 text-xs font-semibold rounded-xl cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Configurações</span>
            </Button>

            <Button
              size="sm"
              onClick={() => setActiveSection("billing")}
              className="gap-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white shadow-xs cursor-pointer"
            >
              <Crown className="h-3.5 w-3.5" />
              <span>Upgrade do Plano</span>
            </Button>
          </div>
        </div>

        {/* Cota do Plano & Barra de Limite */}
        <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-muted/20 p-3 rounded-xl">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Smartphone className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="space-y-1 w-full sm:w-64">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-foreground">Capacidade de Conexões:</span>
                <span className="font-mono font-bold text-foreground">
                  {currentConnCount} / {maxConnections} Whats ({usagePercentage}%)
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    isLimitReached ? "bg-amber-500" : "bg-primary",
                  )}
                  style={{ width: `${usagePercentage}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isLimitReached ? (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold text-[11px]">
                <Zap className="h-3.5 w-3.5" /> Limite de conexões atingido no plano {planBadge.label}
              </span>
            ) : (
              <span>
                Você ainda pode conectar mais <strong>{maxConnections - currentConnCount}</strong> número(s).
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Grid of Sessions */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {workspaceSessions.map((s) => {
          const isActive = s.id === activeId;
          const isDefault = currentWorkspace?.default_session_id
            ? currentWorkspace.default_session_id === s.id
            : workspaceSessions[0]?.id === s.id;

          return (
            <div
              key={s.id}
              onClick={() => setActiveSession(s.id)}
              className={cn(
                "group relative flex flex-col justify-between rounded-2xl border bg-card p-5 shadow-xs transition-all duration-200 cursor-pointer",
                isActive ? "ring-2 ring-primary border-transparent shadow-md" : "hover:border-muted-foreground/30",
              )}
            >
              <div className="space-y-4">
                {/* SuperAdmin Tenant Badge */}
                {isSuperAdmin && (
                  <div className="flex items-center justify-between pb-2 border-b border-border/40 text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <User className="h-3.5 w-3.5 text-primary" />
                      <span>Usuário / Tenant:</span>
                      <span className="font-semibold text-foreground">
                        {s.ownerEmail || (s.projectId ? `Projeto: ${s.projectId}` : "Não atribuído")}
                      </span>
                    </div>
                    {s.ownerName && s.ownerName !== s.ownerEmail && (
                      <span className="text-muted-foreground font-mono">({s.ownerName})</span>
                    )}
                  </div>
                )}

                {/* Session Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-sm shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base">{s.name}</h3>
                        <button
                          type="button"
                          title="Alterar nome da conexão"
                          onClick={(e) => handleOpenRenameModal(s, e)}
                          className="text-muted-foreground/70 hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-bold",
                            s.paired
                              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                              : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                          )}
                        >
                          {s.paired ? "● Conectada" : "○ Desconectada"}
                        </span>
                        {isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" /> Linha Padrão
                          </span>
                        )}
                        {isActive && (
                          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                            Selecionada
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{s.jid ? s.jid.split("@")[0] : "Número pendente"}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-mono text-muted-foreground/75 bg-muted/60 px-1.5 py-0.5 rounded-md select-all">
                          SID: {s.id}
                        </span>
                        <button
                          type="button"
                          title="Copiar SID"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(s.id);
                            toast.success("SID copiado para a área de transferência!");
                          }}
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {s.apiKey && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] font-mono text-muted-foreground/75 bg-muted/60 px-1.5 py-0.5 rounded-md">
                            API Key: {s.apiKey ? s.apiKey.slice(0, 6) : ""}••••••••
                          </span>
                          <button
                            type="button"
                            title="Copiar API Key"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (s.apiKey) {
                                navigator.clipboard.writeText(s.apiKey);
                                toast.success("Chave de API da conexão copiada com sucesso!");
                              }
                            }}
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Rotacionar / Alterar API Key"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRotateSession(s);
                              setCustomApiKey("");
                            }}
                            className="text-muted-foreground hover:text-primary p-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {!isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-amber-500"
                        title="Definir como Linha Padrão do Workspace"
                        onClick={(e) => handleSetDefaultSession(s.id, e)}
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                    )}
                    {!s.paired && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs text-primary border-primary/30 hover:bg-primary/10 shadow-2xs"
                        title="Gerar QR Code e Reconectar"
                        onClick={(e) => handlePairSession(s.id, e)}
                        disabled={pairingSessionId === s.id}
                      >
                        {pairingSessionId === s.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <QrCode className="h-3.5 w-3.5" />
                        )}
                        <span>Reconectar</span>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-primary"
                      title="Alterar Nome"
                      onClick={(e) => handleOpenRenameModal(s, e)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {s.paired && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-amber-500"
                        title="Desconectar WhatsApp"
                        onClick={(e) => {
                          e.stopPropagation();
                          void onLogout(s.id);
                        }}
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Excluir Conexão"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete(s);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Connection Details or QR Pairing */}
                {s.paired ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2.5 rounded-xl border bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-5 w-5 shrink-0" />
                      <div>
                        <p className="text-xs font-semibold">WhatsApp Conectado & Operacional</p>
                        <p className="text-[11px] opacity-80">Pronto para realizar e receber ligações.</p>
                      </div>
                    </div>
                    <SessionAgentsSummary sid={s.id} />
                  </div>
                ) : (
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <SessionPairing session={s} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {workspaceSessions.length > 0 && !isLimitReached && (
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex flex-col items-center justify-center min-h-[220px] rounded-2xl border-2 border-dashed border-border/80 bg-card/30 hover:bg-muted/40 hover:border-primary/50 p-6 text-center transition-all cursor-pointer group"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Plus className="h-6 w-6" />
            </div>
            <p className="font-bold text-sm text-foreground mt-3">Adicionar Linha WhatsApp</p>
            <p className="text-xs text-muted-foreground mt-1">
              Vaga disponível no plano ({currentConnCount + 1}/{maxConnections})
            </p>
          </button>
        )}

        {workspaceSessions.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed bg-card/40 p-12 text-center space-y-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Smartphone className="h-7 w-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base text-foreground">Nenhuma conexão cadastrada neste Workspace</h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Seu plano <strong>{planBadge.label}</strong> permite conectar até <strong>{maxConnections}</strong> número(s) de WhatsApp. Conecte sua primeira linha para chamadas de voz e IA.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button onClick={handleOpenCreateModal} className="gap-2 rounded-xl font-semibold cursor-pointer">
                <Plus className="h-4 w-4" />
                <span>Criar Conexão</span>
              </Button>
              {isLimitReached && (
                <Button
                  variant="outline"
                  onClick={() => setActiveSection("billing")}
                  className="gap-2 rounded-xl font-semibold text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 cursor-pointer"
                >
                  <Crown className="h-4 w-4" />
                  <span>Fazer Upgrade</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal de Limite de Plano Atingido */}
      <Dialog open={showLimitModal} onOpenChange={setShowLimitModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 mb-2">
              <Crown className="h-6 w-6" />
            </div>
            <DialogTitle className="text-center text-base">Limite de Conexões Atingido</DialogTitle>
            <DialogDescription className="text-center text-xs">
              Seu plano atual (<strong>{planBadge.label}</strong>) permite no máximo <strong>{maxConnections}</strong> conexão(ões) de WhatsApp no workspace.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 rounded-xl border bg-muted/20 space-y-2 text-xs">
            <p className="font-semibold text-foreground">Benefícios do Upgrade de Plano:</p>
            <ul className="space-y-1 text-muted-foreground text-[11px]">
              <li>• Conexão de múltiplos números de WhatsApp</li>
              <li>• Mais chamadas de voz simultâneas</li>
              <li>• Mais agentes especialistas de IA</li>
              <li>• Suporte prioritário e webhooks dedicados</li>
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setShowLimitModal(false)}>
              Fechar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setShowLimitModal(false);
                setActiveSection("billing");
              }}
              className="gap-1.5 font-bold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white cursor-pointer"
            >
              <Crown className="h-3.5 w-3.5" /> Fazer Upgrade Agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Criar Nova Conexão */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
            <DialogDescription>
              Informe o nome de identificação para esta nova linha no workspace <strong>{currentWorkspace?.name}</strong> (ex: Suporte, Vendas, Comercial).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="create-session-name" className="text-xs font-semibold">
                Nome da Conexão
              </Label>
              <Input
                id="create-session-name"
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onNewSessionSubmit();
                }}
                placeholder="Ex: WhatsApp Comercial"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button onClick={onNewSessionSubmit} disabled={creating || !newSessionName.trim()}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Criar Conexão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para Renomear Conexão Existente */}
      <Dialog open={!!editingSession} onOpenChange={(open) => !open && setEditingSession(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Alterar Nome da Conexão</DialogTitle>
            <DialogDescription>
              Defina um novo nome para identificar esta linha de WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="rename-session-name" className="text-xs font-semibold">
                Nome da Conexão
              </Label>
              <Input
                id="rename-session-name"
                value={editNameInput}
                onChange={(e) => setEditNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void onRenameSubmit();
                }}
                placeholder="Ex: WhatsApp Vendas"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditingSession(null)}>
              Cancelar
            </Button>
            <Button onClick={onRenameSubmit} disabled={renaming || !editNameInput.trim()}>
              {renaming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar Exclusão */}
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir conexão?"
        description={toDelete ? `A conexão ${toDelete.name} será deslogada e removida.` : undefined}
        confirmLabel="Excluir"
        destructive
        onConfirm={() => {
          if (toDelete) void onRemoveSession(toDelete.id);
        }}
      />

      {/* Modal de Rotação de API Key */}
      <Dialog open={!!rotateSession} onOpenChange={(open) => !open && setRotateSession(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5 text-primary" /> Rotacionar Chave de API
            </DialogTitle>
            <DialogDescription className="text-xs">
              Altere ou gere uma nova chave de integração para a conexão <strong>{rotateSession?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-600 dark:text-amber-400 space-y-1">
              <p className="font-semibold">⚠️ Atenção à segurança:</p>
              <p>Ao rotacionar a chave, integrações externas ativas (N8N, Typebot, Chatwoot, Zapier) deixarão de autenticar até que você atualize o token nelas.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Chave Personalizada (Opcional)</Label>
              <Input
                value={customApiKey}
                onChange={(e) => setCustomApiKey(e.target.value)}
                placeholder="Deixe em branco para gerar automaticamente (kc_...)"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Deixe vazio para gerar automaticamente uma chave criptográfica segura com prefixo <code className="text-primary font-mono">kc_</code>.
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setRotateSession(null)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              disabled={rotatingKey}
              onClick={handleRotateKeySubmit}
              className="gap-1.5"
            >
              {rotatingKey ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              {customApiKey.trim() ? "Salvar Chave Personalizada" : "Gerar Nova Chave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Configurações do Workspace */}
      <WorkspaceSettingsModal
        isOpen={showWorkspaceSettings}
        onClose={() => setShowWorkspaceSettings(false)}
        workspace={currentWorkspace}
      />
    </div>
  );
};
