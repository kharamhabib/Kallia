import { useState, useEffect } from "react";
import { Plus, Trash2, Smartphone, Loader2, LogOut, CheckCircle2, Copy, Pencil, Bot, PhoneIncoming, PhoneOutgoing, Target, QrCode, RefreshCw, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useSessions, setActiveSession } from "@/stores/sessions";
import { createSession, deleteSession, logoutSession, renameSession, pairSession, listSessions } from "@/services/sessions";
import { listAgents, type Agent } from "@/services/agents";
import { SessionPairing } from "@/components/domain/session/SessionPairing";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { apiUrl, getToken } from "@/lib/auth";
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

  // Estados para criação de nova conexão
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const refreshSessionsList = async () => {
    try {
      const updated = await listSessions();
      useSessions.setState({ sessions: updated });
    } catch {
      // Falhas silenciosas
    }
  };

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
    setNewSessionName(`WhatsApp ${sessions.length > 0 ? sessions.length + 1 : ""}`.trim());
    setShowCreateModal(true);
  };

  const onNewSessionSubmit = async () => {
    const name = newSessionName.trim() || "WhatsApp";
    setCreating(true);
    try {
      const { id } = await createSession(name);
      await refreshSessionsList();
      setActiveSession(id);
      setShowCreateModal(false);
      toast.success("Nova conexão criada com sucesso!");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCreating(false);
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-card p-5 shadow-xs">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Gerenciador de Conexões WhatsApp</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conecte e gerencie seus números de WhatsApp para chamadas de voz e IA.
          </p>
        </div>

        <Button onClick={handleOpenCreateModal} className="gap-2 rounded-xl shadow-xs">
          <Plus className="h-4 w-4" />
          <span>Nova Conexão</span>
        </Button>
      </div>

      {/* Grid of Sessions */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {sessions.map((s) => {
          const isActive = s.id === activeId;
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
                {/* Session Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-sm shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-base">{s.name}</h3>
                        <button
                          type="button"
                          title="Alterar nome da conexão"
                          onClick={(e) => handleOpenRenameModal(s, e)}
                          className="text-muted-foreground/70 hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        {isActive && (
                          <span className="rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                            Ativa
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
                          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
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
                            className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-muted transition-colors"
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
                            className="text-muted-foreground hover:text-primary p-0.5 rounded hover:bg-muted transition-colors"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
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

        {sessions.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed bg-card/40 p-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Smartphone className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-bold text-base">Nenhuma conexão cadastrada</h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Clique no botão abaixo para criar sua primeira conexão de WhatsApp.
            </p>
            <Button onClick={handleOpenCreateModal} className="mt-5 gap-2 rounded-xl">
              <Plus className="h-4 w-4" />
              <span>Criar Conexão</span>
            </Button>
          </div>
        )}
      </div>

      {/* Modal para Criar Nova Conexão */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Conexão WhatsApp</DialogTitle>
            <DialogDescription>
              Informe o nome de identificação para esta nova linha do WhatsApp (ex: Suporte, Vendas, Comercial).
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
    </div>
  );
};
