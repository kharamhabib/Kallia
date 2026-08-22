import { useState } from "react";
import {
  Bot,
  Plus,
  Edit2,
  Trash2,
  BookOpen,
  Clock,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ChatAgent } from "@/types/chatAgent";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { toast } from "sonner";
import { deleteChatAgent } from "@/services/chatAgents";

interface ChatAgentsListProps {
  workspaceId: string;
  agents: ChatAgent[];
  onSelectAgent: (agent: ChatAgent) => void;
  onNewAgent: () => void;
  onAgentDeleted: (deletedId: string) => void;
}

export const ChatAgentsList = ({
  workspaceId,
  agents,
  onSelectAgent,
  onNewAgent,
  onAgentDeleted,
}: ChatAgentsListProps) => {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteConfirm = async () => {
    if (!deletingId) return;
    setIsDeleting(true);
    try {
      await deleteChatAgent(workspaceId, deletingId);
      toast.success("Agente de Chat excluído");
      onAgentDeleted(deletingId);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir agente");
    } finally {
      setIsDeleting(false);
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header da Listagem */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Agentes de Chat WhatsApp
          </h2>
          <p className="text-xs text-muted-foreground">
            Personas autônomas para atendimento em texto no WhatsApp com RAG vetorial e simulação humana.
          </p>
        </div>

        <Button onClick={onNewAgent} size="sm" className="gap-1.5 shadow-sm shrink-0">
          <Plus className="h-4 w-4" />
          Novo Agente de Chat
        </Button>
      </div>

      {/* Grid de Cards de Agentes */}
      {agents.length === 0 ? (
        <Card className="border-dashed p-8 text-center bg-muted/10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary mb-3">
            <Bot className="h-6 w-6" />
          </div>
          <h3 className="text-sm font-semibold mb-1">Nenhum agente de chat configurado</h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-4">
            Crie seu primeiro agente de inteligência artificial para responder automaticamente clientes no WhatsApp com
            respostas humanizadas e base de conhecimento.
          </p>
          <Button onClick={onNewAgent} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            Criar Primeiro Agente
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <Card
              key={agent.id}
              className="relative overflow-hidden group hover:border-primary/50 transition-all shadow-xs flex flex-col justify-between"
            >
              <CardContent className="p-4 space-y-3.5 flex-1 flex flex-col justify-between">
                <div>
                  {/* Topo do Card: Avatar & Badges */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm border border-primary/20">
                        {agent.avatar_url ? (
                          <img
                            src={agent.avatar_url}
                            alt={agent.name}
                            className="h-full w-full rounded-xl object-cover"
                          />
                        ) : (
                          agent.name.slice(0, 2).toUpperCase()
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-sm font-bold leading-tight group-hover:text-primary transition-colors">
                            {agent.name}
                          </h3>
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {agent.model_name || "gemini-2.5-flash"}
                        </span>
                      </div>
                    </div>

                    {agent.is_default && (
                      <Badge variant="outline" className="text-[9px] font-semibold border-emerald-500/30 text-emerald-500 bg-emerald-500/10">
                        Principal
                      </Badge>
                    )}
                  </div>

                  {/* Descrição / Trecho do Prompt */}
                  <p className="text-[11px] text-muted-foreground line-clamp-2 italic leading-relaxed">
                    "{agent.system_prompt || "Assistente pronto para atendimento."}"
                  </p>
                </div>

                {/* Métricas e Tags do Agente */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      <Clock className="h-3 w-3 text-primary" />
                      {agent.typing_delay_sec || 3}s digitação
                    </span>

                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      <Layers className="h-3 w-3 text-primary" />
                      Até {agent.max_bubbles || 3} balões
                    </span>

                    {agent.rag_enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                        <BookOpen className="h-3 w-3" />
                        RAG Ativo
                      </span>
                    )}
                  </div>

                  {/* Barra de Ações */}
                  <div className="flex items-center justify-between pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onSelectAgent(agent)}
                      className="h-7 text-xs gap-1.5 flex-1 mr-2"
                    >
                      <Edit2 className="h-3 w-3" />
                      Editar & Testar
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingId(agent.id)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      title="Excluir agente"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmModal
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Excluir Agente de Chat"
        description="Tem certeza que deseja excluir este agente de chat? As conversas vinculadas deixarão de ser respondidas por ele."
        confirmText="Excluir"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
