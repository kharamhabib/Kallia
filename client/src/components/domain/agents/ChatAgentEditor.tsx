import { useState } from "react";
import {
  Bot,
  Sparkles,
  Save,
  Trash2,
  Play,
  RotateCcw,
  Sliders,
  BookOpen,
  Wrench,
  UserCheck,
  Send,
  Loader2,
  CheckCircle2,
  Layers,
  Clock,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/Switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ChatAgent } from "@/types/chatAgent";
import { createChatAgent, updateChatAgent, deleteChatAgent, testChatAgent } from "@/services/chatAgents";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

interface ChatAgentEditorProps {
  workspaceId: string;
  agent: ChatAgent | null; // null se estiver criando novo
  onSave: (savedAgent: ChatAgent) => void;
  onDelete?: (deletedId: string) => void;
  onCancel: () => void;
}

const CHAT_PROMPT_PRESETS = [
  {
    id: "comercial",
    name: "Atendente Comercial & Vendas",
    desc: "Apresenta produtos, esclarece dúvidas de preço e qualifica o lead para fechar negócio.",
    prompt: `Você é a Sofia, consultora comercial oficial no WhatsApp.
Seu objetivo é entender o que o cliente precisa, apresentar as melhores soluções da empresa, tirar dúvidas com simpatia e conduzir para a contratação.
- Seja simpática, prestativa e objetiva.
- Faça perguntas abertas para entender a necessidade do cliente.
- Caso o cliente demonstre alto interesse, colete o nome e e-mail com a ferramenta 'update_contact'.`,
  },
  {
    id: "suporte",
    name: "Suporte Técnico Nível 1",
    desc: "Auxilia com dúvidas frequentes, instruções de uso e procedimentos padrão.",
    prompt: `Você é o Alex, assistente de suporte técnico no WhatsApp.
Seu objetivo é resolver dúvidas operacionais e problemas comuns com base estritamente na Base de Conhecimento.
- Seja paciente, empático e muito claro nas instruções passo a passo.
- Se não souber a resposta ou se o cliente solicitar atendimento humano, use imediatamente a ferramenta 'transfer_to_human'.`,
  },
  {
    id: "agendamento",
    name: "Secretária de Agendamentos",
    desc: "Organiza horários de reuniões, consultas ou visitas técnicas.",
    prompt: `Você é a Clara, secretária de agendamentos no WhatsApp.
Seu objetivo é auxiliar o cliente a escolher a melhor data e horário para reunião ou serviço.
- Confirme os dados cadastrais do cliente (nome, telefone, e-mail).
- Seja ágil, cordial e confirme os detalhes antes de finalizar.`,
  },
];

export const ChatAgentEditor = ({
  workspaceId,
  agent,
  onSave,
  onDelete,
  onCancel,
}: ChatAgentEditorProps) => {
  const isEditing = Boolean(agent?.id);

  const [name, setName] = useState(agent?.name || "Assistente WhatsApp");
  const [modelName, setModelName] = useState(agent?.model_name || "gemini-2.5-flash");
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || CHAT_PROMPT_PRESETS[0].prompt);
  const [temperature, setTemperature] = useState(agent?.temperature ?? 0.7);
  const [typingDelaySec, setTypingDelaySec] = useState(agent?.typing_delay_sec ?? 3);
  const [maxBubbles, setMaxBubbles] = useState(agent?.max_bubbles ?? 3);
  const [audioReplyMode, setAudioReplyMode] = useState<"text" | "mirror" | "audio">(
    agent?.audio_reply_mode || "text"
  );
  const [isDefault, setIsDefault] = useState(agent?.is_default ?? true);
  const [toolsEnabled, setToolsEnabled] = useState(agent?.tools_enabled ?? true);
  const [ragEnabled, setRagEnabled] = useState(agent?.rag_enabled ?? true);
  const [handoffEnabled, setHandoffEnabled] = useState(agent?.handoff_enabled ?? true);
  const [activeTab, setActiveTab] = useState<"personality" | "humanization" | "rag" | "tools" | "sandbox">(
    "personality"
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Sandbox State
  const [sandboxMessages, setSandboxMessages] = useState<Array<{ sender: "user" | "ai"; content: string }>>([
    {
      sender: "ai",
      content: "Olá! Como posso ajudar você hoje?",
    },
  ]);
  const [sandboxInput, setSandboxInput] = useState("");
  const [isTesting, setIsTesting] = useState(false);

  const handleApplyPreset = (promptText: string) => {
    setSystemPrompt(promptText);
    toast.success("Preset de prompt aplicado com sucesso!");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Informe um nome para o agente");
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<ChatAgent> = {
        name: name.trim(),
        provider: "gemini",
        model_name: modelName,
        system_prompt: systemPrompt.trim(),
        temperature,
        typing_delay_sec: typingDelaySec,
        max_bubbles: maxBubbles,
        audio_reply_mode: audioReplyMode,
        is_default: isDefault,
        tools_enabled: toolsEnabled,
        rag_enabled: ragEnabled,
        handoff_enabled: handoffEnabled,
        active: true,
      };

      let result: ChatAgent;
      if (isEditing && agent?.id) {
        result = await updateChatAgent(workspaceId, agent.id, payload);
        toast.success("Agente de Chat atualizado com sucesso!");
      } else {
        result = await createChatAgent(workspaceId, payload);
        toast.success("Agente de Chat criado com sucesso!");
      }
      onSave(result);
    } catch (err: any) {
      toast.error(err.message || "Falha ao salvar agente");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!agent?.id) return;
    setIsDeleting(true);
    try {
      await deleteChatAgent(workspaceId, agent.id);
      toast.success("Agente de Chat excluído");
      onDelete?.(agent.id);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir agente");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleSendSandbox = async () => {
    if (!sandboxInput.trim() || isTesting) return;

    const userText = sandboxInput.trim();
    setSandboxInput("");
    const newHistory = [...sandboxMessages, { sender: "user" as const, content: userText }];
    setSandboxMessages(newHistory);
    setIsTesting(true);

    try {
      if (!agent?.id) {
        // Se ainda não salvou, simula localmente
        setTimeout(() => {
          setSandboxMessages((prev) => [
            ...prev,
            {
              sender: "ai",
              content: `[Simulação Sandbox]: Recebi sua mensagem: "${userText}". Salve o agente para testar com RAG e ferramentas reais!`,
            },
          ]);
          setIsTesting(false);
        }, 1500);
        return;
      }

      const res = await testChatAgent(
        workspaceId,
        agent.id,
        userText,
        newHistory.map((h) => ({ sender: h.sender, content: h.content }))
      );

      if (res?.bubbles && res.bubbles.length > 0) {
        res.bubbles.forEach((bubble, idx) => {
          setTimeout(() => {
            setSandboxMessages((prev) => [...prev, { sender: "ai", content: bubble }]);
          }, (idx + 1) * 800);
        });
      }
    } catch (err: any) {
      toast.error(err.message || "Erro no teste do sandbox");
      setSandboxMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          content: "⚠️ Erro ao consultar modelo de IA. Verifique se a chave do Gemini está configurada em 'Provedores de IA'.",
        },
      ]);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header do Editor */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <Bot className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight">
                {isEditing ? `Editar: ${name}` : "Novo Agente de Chat WhatsApp"}
              </h2>
              {isDefault && (
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 text-[10px] font-semibold">
                  Principal do Workspace
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Atendimento automatizado em texto, áudio e RAG com Gemini 2.5 Flash
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancelar
          </Button>
          {isEditing && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowDeleteModal(true)}
              disabled={isSaving}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Excluir
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5 shadow-sm">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isEditing ? "Salvar Alterações" : "Criar Agente"}
          </Button>
        </div>
      </div>

      {/* Navegação de Abas do Editor */}
      <div className="flex items-center gap-1 border-b pb-px overflow-x-auto custom-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab("personality")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "personality"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Sparkles className="h-4 w-4" />
          Identidade & Prompt
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("humanization")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "humanization"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Clock className="h-4 w-4" />
          Humanização & Balões
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("rag")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "rag"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <BookOpen className="h-4 w-4" />
          Base de Conhecimento (RAG)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tools")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "tools"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Wrench className="h-4 w-4" />
          Ferramentas & Transbordo
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("sandbox")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer",
            activeTab === "sandbox"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Play className="h-4 w-4" />
          Simulador (Sandbox)
        </button>
      </div>

      {/* Conteúdo das Abas */}
      <div className="grid grid-cols-1 gap-6">
        {/* ABA 1: Identidade & Prompt */}
        {activeTab === "personality" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Identificação do Agente</CardTitle>
                <CardDescription className="text-xs">
                  Nome e modelo de linguagem utilizado para processamento das mensagens.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Nome do Agente</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Sofia (Vendas), Suporte N1..."
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Modelo Base</Label>
                    <select
                      value={modelName}
                      onChange={(e) => setModelName(e.target.value)}
                      className="w-full flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recomendado - Mais rápido e inteligente)</option>
                      <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro (Raciocínio complexo)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-semibold">Agente Padrão do Workspace</Label>
                    <p className="text-[11px] text-muted-foreground">
                      Responderá automaticamente novas conversas que chegarem no WhatsApp do Workspace.
                    </p>
                  </div>
                  <Switch checked={isDefault} onChange={setIsDefault} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">System Prompt (Instruções de Personalidade)</CardTitle>
                    <CardDescription className="text-xs">
                      Define a postura, diretrizes e tom de voz do agente nas conversas.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Presets Rápidos */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Carregar Modelo Pré-Configurado:</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {CHAT_PROMPT_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleApplyPreset(p.prompt)}
                        className="flex flex-col text-left p-2.5 rounded-lg border border-border/70 hover:border-primary/50 hover:bg-primary/5 transition-all text-xs cursor-pointer"
                      >
                        <span className="font-semibold text-foreground">{p.name}</span>
                        <span className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="Instruções completas do atendente..."
                    className="min-h-[220px] font-mono text-xs leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5 pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Temperatura (Criatividade vs Precisão): {temperature}</Label>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.1"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0.0 (Estritamente factual)</span>
                    <span>0.7 (Equilibrado)</span>
                    <span>1.5 (Muito criativo)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ABA 2: Humanização & Balões */}
        {activeTab === "humanization" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Controle de Digitação Humana & Balões</CardTitle>
                <CardDescription className="text-xs">
                  Configurações que tornam o atendimento indistinguível de um ser humano real no WhatsApp.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-primary" />
                      Delay Base de Digitação ({typingDelaySec} segundos)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Tempo que a IA fica com status "digitando..." no WhatsApp antes de disparar cada balão.
                    </p>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      step="1"
                      value={typingDelaySec}
                      onChange={(e) => setTypingDelaySec(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>1s (Rápido)</span>
                      <span>3s (Humano Padrão)</span>
                      <span>6s (Mais Lento)</span>
                    </div>
                  </div>

                  <div className="space-y-1.5 p-3 rounded-lg border bg-muted/20">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-primary" />
                      Fatiamento Anti-Textão (Máx: {maxBubbles} balões)
                    </Label>
                    <p className="text-[11px] text-muted-foreground mb-2">
                      Quebra respostas longas em múltiplos balões curtos e naturais enviados em sequência.
                    </p>
                    <input
                      type="range"
                      min="1"
                      max="4"
                      step="1"
                      value={maxBubbles}
                      onChange={(e) => setMaxBubbles(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>1 (Balão Único)</span>
                      <span>2-3 (Recomendado)</span>
                      <span>4 (Frases Curtas)</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-3 rounded-lg border bg-muted/20">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Volume2 className="h-4 w-4 text-primary" />
                    Modo de Resposta a Mensagens de Áudio do WhatsApp
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Define o formato da resposta quando o cliente enviar uma mensagem de voz.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setAudioReplyMode("text")}
                      className={cn(
                        "p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer",
                        audioReplyMode === "text"
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <div className="font-medium">Sempre Texto (Padrão)</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Transcreve o áudio e responde em texto claro e ágil.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAudioReplyMode("mirror")}
                      className={cn(
                        "p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer",
                        audioReplyMode === "mirror"
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <div className="font-medium">Espelhar Cliente</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Se mandar áudio responde com áudio; se mandar texto responde texto.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setAudioReplyMode("audio")}
                      className={cn(
                        "p-2.5 rounded-lg border text-left text-xs transition-all cursor-pointer",
                        audioReplyMode === "audio"
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border hover:bg-muted"
                      )}
                    >
                      <div className="font-medium">Sempre Áudio</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Gera notas de voz PTT em todas as respostas.
                      </div>
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ABA 3: Base de Conhecimento (RAG) */}
        {activeTab === "rag" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Busca Semântica RAG (pgvector 768d)</CardTitle>
                    <CardDescription className="text-xs">
                      Consulta documentos cadastrados na Base de Conhecimento para responder perguntas com fidelidade absoluta.
                    </CardDescription>
                  </div>
                  <Switch checked={ragEnabled} onChange={setRagEnabled} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg border bg-muted/20 text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Como funciona o RAG neste agente:
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Quando o cliente faz uma pergunta no WhatsApp, o backend gera um embedding vetorial com o modelo{" "}
                    <code className="text-primary font-mono">text-embedding-004</code> e busca os trechos mais relevantes dos
                    documentos ativos na aba <strong>Base de Conhecimento</strong>, injetando o conteúdo diretamente no contexto da resposta.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ABA 4: Ferramentas (Tools) & Transbordo */}
        {activeTab === "tools" && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Ações Automáticas (Function Calling)</CardTitle>
                    <CardDescription className="text-xs">
                      Permite que a IA execute operações no CRM e no sistema durante a conversa.
                    </CardDescription>
                  </div>
                  <Switch checked={toolsEnabled} onChange={setToolsEnabled} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <UserCheck className="h-4 w-4 text-emerald-500" />
                        Transbordo Humano Inteligente (transfer_to_human)
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Pausa a IA, altera o status para 'Pendente' e alerta os operadores quando o cliente pedir um humano.
                      </p>
                    </div>
                    <Switch checked={handoffEnabled} onChange={setHandoffEnabled} />
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Enriquecimento Automático de CRM (update_contact)
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Captura nome, e-mail e empresa informados no chat e grava diretamente no cadastro do contato.
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                      Habilitada
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                    <div className="space-y-0.5">
                      <div className="text-xs font-semibold flex items-center gap-1.5">
                        <Sliders className="h-4 w-4 text-amber-500" />
                        Auto-Tags da Conversa (add_tag)
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Aplica tags contextuais (ex: 'Lead Quente', 'Suporte', 'Dúvida Preço') com base no diálogo.
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                      Habilitada
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ABA 5: Simulador / Sandbox */}
        {activeTab === "sandbox" && (
          <div className="space-y-4">
            <Card className="flex flex-col h-[520px]">
              <CardHeader className="py-3 px-4 border-b flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold">Simulador Interativo do Agente</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSandboxMessages([
                      { sender: "ai", content: "Olá! Como posso ajudar você hoje?" },
                    ])
                  }
                  className="h-7 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Limpar Chat
                </Button>
              </CardHeader>

              {/* Timeline do Sandbox */}
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-muted/10">
                {sandboxMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex flex-col max-w-[80%]",
                      msg.sender === "user" ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div
                      className={cn(
                        "rounded-2xl px-3.5 py-2 text-xs leading-relaxed shadow-2xs whitespace-pre-wrap",
                        msg.sender === "user"
                          ? "bg-primary text-primary-foreground rounded-tr-xs"
                          : "bg-card border text-card-foreground rounded-tl-xs"
                      )}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[9px] text-muted-foreground mt-0.5 px-1">
                      {msg.sender === "user" ? "Você (Cliente)" : name}
                    </span>
                  </div>
                ))}

                {isTesting && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground italic mr-auto">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>{name} está digitando...</span>
                  </div>
                )}
              </CardContent>

              {/* Input Bar do Sandbox */}
              <div className="p-3 border-t bg-card flex items-center gap-2">
                <Input
                  value={sandboxInput}
                  onChange={(e) => setSandboxInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendSandbox();
                    }
                  }}
                  placeholder="Digite uma mensagem para testar o agente..."
                  className="text-xs"
                  disabled={isTesting}
                />
                <Button
                  size="sm"
                  onClick={handleSendSandbox}
                  disabled={isTesting || !sandboxInput.trim()}
                  className="h-9 px-3"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>

      <ConfirmModal
        open={showDeleteModal}
        onOpenChange={setShowDeleteModal}
        title="Excluir Agente de Chat"
        description={`Tem certeza que deseja excluir o agente "${name}"? As conversas vinculadas deixarão de ser respondidas por ele.`}
        confirmText="Excluir Definitivamente"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
};
