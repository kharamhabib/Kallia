import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useWorkspaceStore, type Workspace, type WorkspaceMember } from "@/stores/workspace";
import { useSessions } from "@/stores/sessions";
import { useNavigation } from "@/stores/navigation";
import { toast } from "sonner";
import {
  Building2,
  Sparkles,
  Smartphone,
  Users,
  AlertTriangle,
  Copy,
  Check,
  Plus,
  Trash2,
  Shield,
  PhoneCall,
  Bot,
  Crown,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkspaceSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspace: Workspace | null;
}

type TabType = "general" | "plan" | "default_session" | "members" | "danger";

export const WorkspaceSettingsModal: React.FC<WorkspaceSettingsModalProps> = ({
  isOpen,
  onClose,
  workspace,
}) => {
  const {
    updateWorkspace,
    deleteWorkspace,
    setDefaultSession,
    members,
    fetchMembers,
    inviteMember,
    removeMember,
    isLoadingMembers,
  } = useWorkspaceStore();

  const sessions = useSessions((s) => s.sessions);
  const { setActiveSection } = useNavigation();

  const [activeTab, setActiveTab] = useState<TabType>("general");

  // Tab Geral
  const [name, setName] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // Tab Linha Padrão
  const [selectedDefaultSession, setSelectedDefaultSession] = useState<string>("");
  const [isSavingDefaultSession, setIsSavingDefaultSession] = useState(false);

  // Tab Membros
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [isInviting, setIsInviting] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<WorkspaceMember | null>(null);

  // Tab Danger Zone
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (workspace) {
      setName(workspace.name || "");
      setSelectedDefaultSession(workspace.default_session_id || "");
      if (isOpen) {
        fetchMembers(workspace.id);
      }
    }
  }, [workspace, isOpen, fetchMembers]);

  if (!workspace) return null;

  // Filtra as conexões que pertencem a este workspace
  const workspaceSessions = sessions.filter(
    (s) =>
      (s.workspaceId || s.projectId) === workspace.id ||
      (workspace.id === "default" && (!s.workspaceId || s.workspaceId === "default") && (!s.projectId || s.projectId === "default")),
  );

  const handleCopyId = () => {
    navigator.clipboard.writeText(workspace.id);
    setCopiedId(true);
    toast.success("ID do Workspace copiado!");
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome do workspace não pode ser vazio");
      return;
    }
    setIsSavingName(true);
    try {
      await updateWorkspace(workspace.id, { name: name.trim() });
      toast.success("Nome do Workspace atualizado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar nome");
    } finally {
      setIsSavingName(false);
    }
  };

  const handleSaveDefaultSession = async () => {
    setIsSavingDefaultSession(true);
    try {
      await setDefaultSession(workspace.id, selectedDefaultSession);
      toast.success("Linha padrão do WhatsApp atualizada!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao definir linha padrão");
    } finally {
      setIsSavingDefaultSession(false);
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      toast.error("Por favor, insira um e-mail válido.");
      return;
    }
    setIsInviting(true);
    try {
      await inviteMember(workspace.id, inviteEmail.trim(), inviteRole);
      toast.success(`Convite enviado para ${inviteEmail.trim()}!`);
      setInviteEmail("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao convidar membro");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToDelete) return;
    try {
      await removeMember(workspace.id, memberToDelete.id);
      toast.success("Membro removido com sucesso");
      setMemberToDelete(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao remover membro");
    }
  };

  const handleDeleteWorkspace = async () => {
    setIsDeleting(true);
    try {
      await deleteWorkspace(workspace.id);
      toast.success("Workspace excluído com sucesso");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir workspace");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
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

  const maxConnections = workspace.max_connections || 1;
  const currentConnCount = workspaceSessions.length;
  const connUsagePercent = Math.min(100, Math.round((currentConnCount / maxConnections) * 100));

  const planBadge = getPlanBadge(workspace.plan);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl p-0 overflow-hidden border-border/80 shadow-2xl bg-card">
          <DialogHeader className="p-5 pb-4 border-b border-border/60 bg-muted/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/90 to-primary text-primary-foreground font-bold text-base shadow-sm">
                  {workspace.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-base font-bold text-foreground">
                      {workspace.name}
                    </DialogTitle>
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border",
                        planBadge.color,
                      )}
                    >
                      {planBadge.label}
                    </span>
                  </div>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Configurações gerais, plano, limites e gerenciamento de equipe.
                  </DialogDescription>
                </div>
              </div>
            </div>

            {/* Abas de Navegação */}
            <div className="flex items-center gap-1.5 pt-4 overflow-x-auto custom-scrollbar">
              <button
                type="button"
                onClick={() => setActiveTab("general")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0",
                  activeTab === "general"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Building2 className="h-3.5 w-3.5" />
                Geral
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("plan")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0",
                  activeTab === "plan"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Plano & Limites
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("default_session")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0",
                  activeTab === "default_session"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Linha Padrão
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("members")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0",
                  activeTab === "members"
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Users className="h-3.5 w-3.5" />
                Equipe & Membros
                {members.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] bg-primary/20 text-primary-foreground font-mono">
                    {members.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("danger")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer shrink-0 ml-auto",
                  activeTab === "danger"
                    ? "bg-destructive text-destructive-foreground shadow-xs"
                    : "text-destructive/80 hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Zona de Perigo
              </button>
            </div>
          </DialogHeader>

          {/* Conteúdo das Abas */}
          <div className="p-6 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-6">
            {/* ABA GERAL */}
            {activeTab === "general" && (
              <div className="space-y-5">
                <form onSubmit={handleSaveName} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="ws-name" className="text-xs font-bold text-foreground">
                      Nome do Workspace
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="ws-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: Comercial Kallia..."
                        className="text-xs font-medium"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        disabled={isSavingName || !name.trim() || name === workspace.name}
                        className="shrink-0 font-semibold cursor-pointer"
                      >
                        {isSavingName ? "Salvando..." : "Salvar Nome"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Este nome aparecerá no seletor de workspaces e em todos os relatórios.
                    </p>
                  </div>
                </form>

                <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> Identificação do Workspace
                  </h4>
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-background text-xs font-mono">
                    <span className="text-muted-foreground truncate">{workspace.id}</span>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer shrink-0"
                      title="Copiar ID"
                    >
                      {copiedId ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Utilize este ID para integrações via Webhooks e chamadas diretas de API.
                  </p>
                </div>
              </div>
            )}

            {/* ABA PLANO & LIMITES */}
            {activeTab === "plan" && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-primary/20">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                        Plano Atual: {planBadge.label}
                      </span>
                      <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.2 rounded-full border border-emerald-500/20">
                        Ativo
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Aumente seus limites para conectar mais números de WhatsApp e atender mais chamadas simultâneas.
                    </p>
                  </div>

                  <Button
                    onClick={() => {
                      onClose();
                      setActiveSection("billing");
                    }}
                    className="gap-1.5 font-bold shadow-md bg-gradient-to-r from-primary to-primary/80 hover:scale-102 transition-transform cursor-pointer shrink-0"
                  >
                    <Crown className="h-4 w-4 text-amber-300" /> Fazer Upgrade de Plano
                  </Button>
                </div>

                {/* Grid de Cotas */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Conexões WhatsApp */}
                  <div className="p-3.5 rounded-xl border bg-card/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Smartphone className="h-3.5 w-3.5 text-emerald-500" /> WhatsApps
                      </span>
                      <span className="font-bold font-mono text-foreground">
                        {currentConnCount} / {maxConnections}
                      </span>
                    </div>
                    {/* Barra de progresso */}
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-300",
                          connUsagePercent >= 100 ? "bg-amber-500" : "bg-primary",
                        )}
                        style={{ width: `${connUsagePercent}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {connUsagePercent >= 100
                        ? "Limite atingido no plano atual."
                        : `${maxConnections - currentConnCount} vaga(s) disponível(is).`}
                    </p>
                  </div>

                  {/* Chamadas Simultâneas */}
                  <div className="p-3.5 rounded-xl border bg-card/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                        <PhoneCall className="h-3.5 w-3.5 text-indigo-500" /> Simultâneas
                      </span>
                      <span className="font-bold font-mono text-foreground">
                        {workspace.max_concurrent_calls || 1} canais
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500 w-1/3" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Capacidade de voz simultânea.
                    </p>
                  </div>

                  {/* Agentes IA */}
                  <div className="p-3.5 rounded-xl border bg-card/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground flex items-center gap-1.5 font-medium">
                        <Bot className="h-3.5 w-3.5 text-primary" /> Agentes IA
                      </span>
                      <span className="font-bold font-mono text-foreground">
                        {workspace.max_agents || 2} agentes
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary w-1/2" />
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Especialistas configuráveis no workspace.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ABA LINHA PADRÃO */}
            {activeTab === "default_session" && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-foreground">
                    Linha de WhatsApp Padrão do Workspace
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Selecione qual número de WhatsApp será utilizado por padrão para efetuar chamadas de voz, testes no Webphone e disparos automáticos.
                  </p>
                </div>

                {workspaceSessions.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed text-center space-y-2">
                    <Smartphone className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-xs font-semibold text-foreground">
                      Nenhuma conexão cadastrada neste workspace
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Crie uma conexão de WhatsApp na aba principal para poder defini-la como padrão.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {workspaceSessions.map((sess) => {
                      const isSelected = (selectedDefaultSession || workspaceSessions[0]?.id) === sess.id;
                      return (
                        <div
                          key={sess.id}
                          onClick={() => setSelectedDefaultSession(sess.id)}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer",
                            isSelected
                              ? "bg-primary/10 border-primary shadow-xs"
                              : "bg-card hover:bg-muted/40 border-border",
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold shrink-0",
                                sess.paired ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600",
                              )}
                            >
                              <Smartphone className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-foreground">{sess.name}</p>
                                {isSelected && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-primary text-primary-foreground">
                                    Padrão
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {sess.jid ? sess.jid.split("@")[0] : "Não pareado"} • {sess.paired ? "Conectado" : "Aguardando QR"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center">
                            <div
                              className={cn(
                                "h-4 w-4 rounded-full border flex items-center justify-center",
                                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                              )}
                            >
                              {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    <div className="pt-2 flex justify-end">
                      <Button
                        onClick={handleSaveDefaultSession}
                        disabled={isSavingDefaultSession || selectedDefaultSession === workspace.default_session_id}
                        className="text-xs font-semibold cursor-pointer"
                        size="sm"
                      >
                        {isSavingDefaultSession ? "Salvando..." : "Salvar Linha Padrão"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ABA EQUIPE & MEMBROS */}
            {activeTab === "members" && (
              <div className="space-y-5">
                {/* Form de Convite */}
                <form onSubmit={handleInviteMember} className="p-4 rounded-xl border bg-muted/20 space-y-3">
                  <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <Plus className="h-3.5 w-3.5 text-primary" /> Convidar Novo Membro
                  </h4>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="email"
                      placeholder="e-mail do colaborador (ex: time@empresa.com)..."
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="text-xs flex-1"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as any)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary shrink-0"
                    >
                      <option value="member">Membro</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <Button
                      type="submit"
                      size="sm"
                      disabled={isInviting || !inviteEmail.trim()}
                      className="gap-1 font-semibold cursor-pointer shrink-0"
                    >
                      {isInviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                      Convidar
                    </Button>
                  </div>
                </form>

                {/* Lista de Membros */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      Membros com Acesso ({members.length})
                    </p>
                  </div>

                  {isLoadingMembers ? (
                    <div className="flex items-center justify-center p-6 text-xs text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando membros...
                    </div>
                  ) : members.length === 0 ? (
                    <div className="p-4 rounded-xl border text-center text-xs text-muted-foreground">
                      Nenhum membro listado.
                    </div>
                  ) : (
                    <div className="divide-y divide-border/60 rounded-xl border bg-card">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between p-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
                              {m.name ? m.name.slice(0, 1).toUpperCase() : m.email.slice(0, 1).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate">{m.name || m.email.split("@")[0]}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{m.email}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border",
                                m.role === "owner"
                                  ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                  : m.role === "admin"
                                    ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                    : "bg-muted text-muted-foreground border-border",
                              )}
                            >
                              {m.role === "owner" ? "Proprietário" : m.role === "admin" ? "Admin" : "Membro"}
                            </span>

                            {m.role !== "owner" && (
                              <button
                                type="button"
                                onClick={() => setMemberToDelete(m)}
                                className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                                title="Remover Membro"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA DANGER ZONE */}
            {activeTab === "danger" && (
              <div className="space-y-4 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-destructive">Excluir este Workspace</h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Ao excluir o workspace <strong>{workspace.name}</strong>, todas as conexões de WhatsApp associadas serão desconectadas e os dados de histórico serão apagados permanentemente. Esta ação não pode ser desfeita.
                    </p>
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={workspace.id === "default" || isDeleting}
                    className="font-semibold cursor-pointer gap-1.5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {workspace.id === "default" ? "Workspace Padrão Protegido" : "Excluir Workspace"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão de Membro */}
      <ConfirmDialog
        open={Boolean(memberToDelete)}
        onOpenChange={(open) => !open && setMemberToDelete(null)}
        title="Remover Membro do Workspace"
        description={`Tem certeza que deseja remover ${memberToDelete?.email} deste workspace? Ele perderá o acesso às conexões e aos relatórios.`}
        confirmLabel="Remover Membro"
        destructive
        onConfirm={handleRemoveMember}
      />

      {/* Confirmação de Exclusão de Workspace */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={`Excluir Workspace "${workspace.name}"?`}
        description="Esta ação é irreversível e desconectará permanentemente todas as linhas de WhatsApp vinculadas a este workspace."
        confirmLabel={isDeleting ? "Excluindo..." : "Sim, Excluir Workspace"}
        destructive
        onConfirm={handleDeleteWorkspace}
      />
    </>
  );
};
