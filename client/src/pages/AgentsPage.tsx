import { useState, useEffect, useCallback } from "react";
import {
  Sparkles,
  Bot,
  Plus,
  Trash2,
  Loader2,
  FileText,
  Code,
  Heart,
  Star,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  listAgents,
  createAgent,
  updateAgent,
  deleteAgent,
  type Agent,
} from "@/services/agents";
import { getAIConfig, setAIConfig } from "@/services/ai";
import type { AIConfig } from "@/types/ai";
import { useAIAgents } from "@/stores/ai";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PromptEditorModal, PromptExpandButton, type PromptTag } from "@/components/shared/PromptEditorModal";

import { AISettingsPane } from "@/components/domain/settings/AISettingsPane";
import { ToolsSettingsPane } from "@/components/domain/settings/ToolsSettingsPane";
import { PostCallSettingsPane } from "@/components/domain/settings/PostCallSettingsPane";
import { FollowupSettingsPane } from "@/components/domain/settings/FollowupSettingsPane";

const VOICES = ["Puck", "Charon", "Kore", "Fenrir", "Aoede", "Orbit", "Zephyr", "Leda"];

const systemPromptTags: PromptTag[] = [
  { tag: "[today]", description: "Data e hora atual" },
  { tag: "[phone]", description: "Telefone do cliente" },
  { tag: "[direction]", description: "Sentido da chamada (inbound/outbound)" },
  { tag: "[session_name]", description: "Nome da conexão ativa" },
  { tag: "[custom_fields]", description: "Campos personalizados" },
];

const defaultConfig: AIConfig = {
  geminiApiKey: "",
  voiceName: "Puck",
  languageCode: "pt-BR",
  systemInstruction: `## Identidade e Papel
Você é a assistente virtual de voz do [session_name].
Sua principal função é atuar como uma secretária executiva inteligente, gerenciando o fluxo de comunicação de entrada e saída por meio de ligações no WhatsApp.
**Regra de Ouro:** Você deve SEMPRE deixar claro, logo nos primeiros segundos de interação, que é uma assistente virtual com inteligência artificial falando em nome do [session_name]. Nunca finja ser humana.

Hoje é [today] e você está falando com o cliente do número [phone]. Esta é uma chamada de [direction].
---

## Comportamento: Recebendo Ligações (Inbound)
1. Saudação Inicial: Atenda de forma educada, informando imediatamente sua identidade.
   * Exemplo: "Olá, tudo bem? Aqui é a assistente virtual do [session_name]. Ele não pode atender no momento, como posso te ajudar?"
2. Escuta e Triagem: Escute o motivo da ligação com atenção.
3. Coleta de Informações: Faça perguntas objetivas para registrar o recado.
4. Encerramento: Confirme que a mensagem foi registrada e será repassada com precisão.

## Comportamento: Fazendo Ligações (Outbound)
1. Identificação e Validação: Ao ser atendida, verifique se está falando com a pessoa correta e apresente-se imediatamente.
2. Direto ao Ponto: Informe o motivo da ligação de forma clara e objetiva com base nas instruções recebidas.
3. Interação e Coleta: Repasse a mensagem ou faça a pergunta designada, aguardando pacientemente a resposta.
4. Encerramento: Agradeça o tempo da pessoa e despeça-se de forma cordial e profissional.`,
  serverSideAI: false,
  autoAnswer: false,
  autoAnswerDelay: 0,
  temperature: 1.0,
  maxDurationMin: 15,
  silenceOperator: false,
  transcribeAudio: true,
  scheduledCalls: "[]",
  firstUtterance: "",
  toolsEnabled: false,
  predefinedTools: ["hangup", "open_ticket", "send_message", "schedule_call"],
  toolPrompts: {
    hangup: "* Ferramenta hangup (Desligar Chamada): Quando a conversa estiver resolvida, o cliente se despedir e não houver mais nenhuma pendência, agradeça pelo contato, despeça-se educadamente e chame a ferramenta hangup para desligar a ligação.",
    open_ticket: "* Ferramenta open_ticket (Abrir Chamado): Use esta ferramenta quando o cliente solicitar falar com um atendente humano, suporte ou precisar de ajuda especializada que a IA não consiga resolver.",
    send_message: "* Ferramenta send_message (Enviar WhatsApp): Use esta ferramenta quando o cliente solicitar que você envie informações por escrito no WhatsApp.",
    schedule_call: "* Ferramenta schedule_call (Reagendar/Agendar Ligação): Se o cliente pedir para retornar mais tarde, solicite a data e hora desejada e execute esta ferramenta."
  },
  customTools: [],
  postCall: {
    summaryEnabled: false,
    sendAdmin: false,
    adminNumber: "",
    sendClient: false,
    webhookEnabled: false,
    webhookUrl: "",
  },
  customFields: "",
};

type MasterSubTab = "voice" | "instructions" | "tools" | "post_call";

export const AgentsPage = ({ sid }: { sid: string }) => {
  // State: "master" ou ID do especialista (string)
  const [selectedId, setSelectedId] = useState<string>("master");
  const [masterTab, setMasterTab] = useState<MasterSubTab>("voice");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveBusy, setSaveBusy] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Form State para Agente Especialista Selecionado
  const [specForm, setSpecForm] = useState<{
    name: string;
    description: string;
    voiceName: string;
    systemInstruction: string;
    outbound: boolean;
  }>({
    name: "",
    description: "",
    voiceName: "Puck",
    systemInstruction: "",
    outbound: false,
  });

  const loadData = useCallback(async () => {
    if (!sid) return;
    setLoading(true);
    try {
      const [resAgents, resConfig] = await Promise.all([
        listAgents(sid).catch(() => []),
        getAIConfig(sid).catch(() => null),
      ]);
      setAgents(resAgents);
      if (resConfig) {
        setEnabled(resConfig.enabled);
        const c = resConfig.aiConfig || defaultConfig;
        setAiConfig({
          serverSideAI: !!c.serverSideAI,
          geminiApiKey: c.geminiApiKey || "",
          voiceName: c.voiceName || "Puck",
          languageCode: c.languageCode || "pt-BR",
          systemInstruction: c.systemInstruction || defaultConfig.systemInstruction,
          autoAnswer: !!c.autoAnswer,
          autoAnswerDelay: c.autoAnswerDelay ?? 0,
          temperature: c.temperature ?? 1.0,
          maxDurationMin: c.maxDurationMin ?? 15,
          silenceOperator: !!c.silenceOperator,
          transcribeAudio: c.transcribeAudio ?? true,
          scheduledCalls: c.scheduledCalls || "[]",
          firstUtterance: c.firstUtterance || "",
          toolsEnabled: !!c.toolsEnabled,
          predefinedTools: c.predefinedTools || ["hangup", "open_ticket", "send_message", "schedule_call"],
          toolPrompts: c.toolPrompts || { ...defaultConfig.toolPrompts },
          customTools: c.customTools || [],
          postCall: c.postCall || { ...defaultConfig.postCall },
          customFields: c.customFields || "",
        });
      }
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar dados dos agentes");
    } finally {
      setLoading(false);
    }
  }, [sid]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Atualiza specForm quando seleciona um especialista
  useEffect(() => {
    if (selectedId !== "master") {
      const target = agents.find((a) => a.id === selectedId);
      if (target) {
        setSpecForm({
          name: target.name,
          description: target.description || "",
          voiceName: target.aiConfig?.voiceName || "Puck",
          systemInstruction: target.aiConfig?.systemInstruction || "",
          outbound: target.outbound,
        });
      }
    }
  }, [selectedId, agents]);

  // Salva Agente Principal
  const handleSaveMaster = async () => {
    if (!aiConfig) return;
    setSaveBusy(true);
    try {
      await setAIConfig(sid, aiConfig);
      toast.success("Configurações do Agente Principal salvas!");
      setEnabled(aiConfig.geminiApiKey !== "");
      useAIAgents.getState().setActiveSessionConfig(aiConfig);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaveBusy(false);
    }
  };

  // Salva Agente Especialista
  const handleSaveSpecialist = async () => {
    if (selectedId === "master") return;
    if (!specForm.name.trim()) {
      toast.error("O nome do agente é obrigatório.");
      return;
    }
    if (!specForm.systemInstruction.trim()) {
      toast.error("As instruções (prompt) são obrigatórias.");
      return;
    }

    setSaveBusy(true);
    try {
      await updateAgent(sid, selectedId, {
        name: specForm.name.trim(),
        description: specForm.description.trim(),
        inbound: false,
        outbound: specForm.outbound,
        aiConfig: {
          voiceName: specForm.voiceName,
          systemInstruction: specForm.systemInstruction.trim(),
        },
      });
      toast.success(`Agente Especialista "${specForm.name}" salvo com sucesso!`);
      await loadData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaveBusy(false);
    }
  };

  // Criação de Novo Agente Especialista
  const handleCreateSpecialist = async () => {
    setSaveBusy(true);
    try {
      const newAgent = await createAgent(sid, {
        name: "Novo Especialista",
        description: "Descreva quando a IA deve transferir para este agente",
        inbound: false,
        outbound: false,
        aiConfig: {
          voiceName: "Puck",
          systemInstruction: "Você é um agente especialista em atendimento.",
        },
      });
      toast.success("Novo Agente Especialista criado!");
      await loadData();
      setSelectedId(newAgent.id);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaveBusy(false);
    }
  };

  // Exclusão de Agente Especialista
  const confirmDeleteSpecialist = async () => {
    if (!deletingAgent) return;
    setSaveBusy(true);
    try {
      await deleteAgent(sid, deletingAgent.id);
      toast.success(`Agente "${deletingAgent.name}" excluído.`);
      setDeletingAgent(null);
      setSelectedId("master");
      await loadData();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaveBusy(false);
    }
  };

  const selectedAgentObj = selectedId !== "master" ? agents.find((a) => a.id === selectedId) : null;

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-10">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border bg-card p-5 shadow-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Central de Agentes IA</h1>
            <span className="rounded-full bg-primary/10 text-primary text-xs font-extrabold px-2.5 py-0.5 border border-primary/20">
              {agents.length + 1} {agents.length === 0 ? "agente cadastrado" : "agentes cadastrados"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure a personalidade da IA Principal da conexão e cadastre Especialistas para transferência e chamadas ativas.
          </p>
        </div>

        <Button
          onClick={handleCreateSpecialist}
          disabled={saveBusy}
          className="gap-2 rounded-xl shadow-xs font-semibold shrink-0 cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Agente Especialista</span>
        </Button>
      </div>

      {/* Main Master-Detail Layout */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* COLUNA ESQUERDA: LISTA DE AGENTES (Master + Especialistas) */}
          <div className="lg:col-span-4 space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
              Agentes do Workspace
            </h3>

            {/* CARD 1: AGENTE PRINCIPAL (FIXO NO TOPO) */}
            <div
              onClick={() => setSelectedId("master")}
              className={cn(
                "rounded-2xl border p-4 transition-all cursor-pointer relative overflow-hidden space-y-3",
                selectedId === "master"
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-md"
                  : "border-border bg-card hover:border-primary/40 hover:shadow-xs",
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shadow-xs">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-extrabold text-sm truncate text-foreground">Agente Principal</h4>
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500 shrink-0" />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">Atendimento Receptivo Master</p>
                  </div>
                </div>

                <Badge
                  className={cn(
                    "text-[10px] font-bold border shrink-0",
                    enabled
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {enabled ? "IA Ativa" : "Sem Key"}
                </Badge>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/40 font-mono">
                <span>Voz: <strong className="text-foreground">{aiConfig?.voiceName || "Puck"}</strong></span>
                <span>Tools: <strong className="text-foreground">{aiConfig?.predefinedTools?.length || 0} ativas</strong></span>
              </div>
            </div>

            {/* DIVIDER */}
            <div className="flex items-center gap-2 py-1">
              <span className="h-px bg-border flex-1" />
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Especialistas ({agents.length})</span>
              <span className="h-px bg-border flex-1" />
            </div>

            {/* LISTA DE AGENTES ESPECIALISTAS */}
            {agents.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground space-y-2">
                <Bot className="h-6 w-6 mx-auto text-muted-foreground/50" />
                <p className="font-medium">Nenhum especialista cadastrado.</p>
                <p className="text-[10px]">Crie especialistas para transferir chamadas automaticamente pela IA.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {agents.map((ag) => {
                  const isSelected = selectedId === ag.id;
                  return (
                    <div
                      key={ag.id}
                      onClick={() => setSelectedId(ag.id)}
                      className={cn(
                        "rounded-xl border p-3.5 transition-all cursor-pointer space-y-2",
                        isSelected
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs"
                          : "border-border bg-card hover:border-primary/40",
                      )}
                    >
                      <div className="flex items-center justify-between min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground font-bold">
                            <Bot className="h-4 w-4" />
                          </div>
                          <h4 className="font-bold text-xs truncate text-foreground">{ag.name}</h4>
                        </div>
                        {ag.outbound && (
                          <Badge className="text-[9px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            Efetuadas
                          </Badge>
                        )}
                      </div>

                      {ag.description && (
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{ag.description}</p>
                      )}

                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t border-border/30">
                        <span>Voz: <strong>{ag.aiConfig?.voiceName || "Puck"}</strong></span>
                        <span className="text-[9px] text-primary font-semibold">Editar →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* COLUNA DIREITA: PAINEL DE EDIÇÃO (MASTER OU ESPECIALISTA) */}
          <div className="lg:col-span-8">
            {selectedId === "master" ? (
              /* PAINEL DE EDIÇÃO DO AGENTE PRINCIPAL */
              <div className="rounded-2xl border bg-card p-6 shadow-xs space-y-6">
                {/* Header do Agente Principal */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold shadow-xs">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-foreground">Configuração do Agente Principal</h3>
                      <p className="text-xs text-muted-foreground">Personalidade, chave da API Gemini, voz e automações de atendimento</p>
                    </div>
                  </div>

                  <Button
                    onClick={handleSaveMaster}
                    disabled={saveBusy}
                    className="gap-2 rounded-xl font-bold text-xs shrink-0 cursor-pointer"
                  >
                    {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    <span>Salvar Agente Principal</span>
                  </Button>
                </div>

                {/* Sub-Abas do Agente Principal */}
                <div className="flex gap-1.5 rounded-xl border bg-muted/40 p-1 flex-wrap">
                  <button
                    onClick={() => setMasterTab("voice")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                      masterTab === "voice"
                        ? "bg-background text-foreground shadow-2xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>Voz & Persona</span>
                  </button>

                  <button
                    onClick={() => setMasterTab("instructions")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                      masterTab === "instructions"
                        ? "bg-background text-foreground shadow-2xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 text-primary" />
                    <span>Instruções & Prompt</span>
                  </button>

                  <button
                    onClick={() => setMasterTab("tools")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                      masterTab === "tools"
                        ? "bg-background text-foreground shadow-2xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Code className="h-3.5 w-3.5 text-primary" />
                    <span>Ferramentas da IA</span>
                  </button>

                  <button
                    onClick={() => setMasterTab("post_call")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                      masterTab === "post_call"
                        ? "bg-background text-foreground shadow-2xs font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Heart className="h-3.5 w-3.5 text-primary" />
                    <span>Pós-Atendimento & NPS</span>
                  </button>
                </div>

                {/* Conteúdo das Sub-Abas do Master */}
                {aiConfig && (
                  <div className="space-y-6 pt-2">
                    {masterTab === "voice" && (
                      <AISettingsPane config={aiConfig} onChange={setAiConfig} enabled={enabled} sid={sid} />
                    )}

                    {masterTab === "instructions" && (
                      <div className="space-y-5 animate-fade-in">
                        {/* Editor de Prompt Principal */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Instruções do Sistema (System Prompt Master)
                              </Label>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Define a identidade, regras operacionais e tom de voz da IA ao atender ligações.
                              </p>
                            </div>
                            <PromptExpandButton onClick={() => setShowPromptModal(true)} />
                          </div>

                          <textarea
                            rows={14}
                            value={aiConfig.systemInstruction}
                            onChange={(e) => setAiConfig({ ...aiConfig, systemInstruction: e.target.value })}
                            className="w-full rounded-xl border border-border/70 bg-card p-4 font-mono text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary leading-relaxed custom-scrollbar shadow-2xs"
                            placeholder="Digite as instruções da IA..."
                          />
                        </div>

                        {/* Tags Dinâmicas Disponíveis */}
                        <div className="rounded-xl bg-muted/40 p-4 border border-border/60 space-y-2">
                          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-primary" />
                            Tags Dinâmicas Disponíveis para Inserção no Prompt:
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/80 border border-border/40">
                              <code className="text-primary font-mono font-bold bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">[today]</code>
                              <span className="text-muted-foreground text-[11px]">Substitui por data e hora atual</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/80 border border-border/40">
                              <code className="text-primary font-mono font-bold bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">[phone]</code>
                              <span className="text-muted-foreground text-[11px]">Número de telefone do cliente</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/80 border border-border/40">
                              <code className="text-primary font-mono font-bold bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">[direction]</code>
                              <span className="text-muted-foreground text-[11px]">Sentido da chamada (inbound/outbound)</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/80 border border-border/40">
                              <code className="text-primary font-mono font-bold bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">[session_name]</code>
                              <span className="text-muted-foreground text-[11px]">Nome da conexão ativa</span>
                            </div>
                            <div className="flex items-center gap-2 p-2 rounded-lg bg-background/80 border border-border/40 sm:col-span-2">
                              <code className="text-primary font-mono font-bold bg-primary/10 px-1.5 py-0.5 rounded text-[11px]">[custom_fields]</code>
                              <span className="text-muted-foreground text-[11px]">Injeta o conteúdo configurado no campo de variáveis personalizadas abaixo</span>
                            </div>
                          </div>
                        </div>

                        {/* Campos Personalizados */}
                        <div className="space-y-2 rounded-xl border bg-card p-4 shadow-2xs">
                          <div className="space-y-0.5">
                            <Label htmlFor="customFields" className="text-xs font-bold text-foreground">
                              Campos Personalizados (Injetados via tag <code className="text-primary font-mono">[custom_fields]</code>)
                            </Label>
                            <p className="text-xs text-muted-foreground">
                              Insira informações fixas da empresa, regras ou horários que serão concatenados no prompt da IA.
                            </p>
                          </div>
                          <textarea
                            id="customFields"
                            rows={3}
                            className="w-full rounded-xl border border-input bg-background p-3 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-mono"
                            placeholder="Ex: Nome da empresa: Kallia, Gerente: João, Atendimento: 08h às 18h"
                            value={aiConfig.customFields || ""}
                            onChange={(e) => setAiConfig({ ...aiConfig, customFields: e.target.value })}
                          />
                        </div>

                        {/* Modal Expandido de Edição de Prompt */}
                        <PromptEditorModal
                          open={showPromptModal}
                          onOpenChange={setShowPromptModal}
                          title="Instruções do Agente Principal"
                          value={aiConfig.systemInstruction}
                          onSave={(val) => setAiConfig({ ...aiConfig, systemInstruction: val })}
                          tags={systemPromptTags}
                        />
                      </div>
                    )}

                    {masterTab === "tools" && (
                      <ToolsSettingsPane config={aiConfig} onChange={setAiConfig} />
                    )}

                    {masterTab === "post_call" && (
                      <div className="space-y-6">
                        <PostCallSettingsPane config={aiConfig} onChange={setAiConfig} />
                        <FollowupSettingsPane config={aiConfig} onChange={setAiConfig} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : selectedAgentObj ? (
              /* PAINEL DE EDIÇÃO DO AGENTE ESPECIALISTA */
              <div className="rounded-2xl border bg-card p-6 shadow-xs space-y-6">
                {/* Header do Especialista */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-base text-foreground">{selectedAgentObj.name}</h3>
                      <p className="text-xs text-muted-foreground">Agente Especialista secundário para transferência</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeletingAgent(selectedAgentObj)}
                      disabled={saveBusy}
                      className="text-destructive hover:bg-destructive/10 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir
                    </Button>

                    <Button
                      onClick={handleSaveSpecialist}
                      disabled={saveBusy}
                      className="gap-2 rounded-xl font-bold text-xs shrink-0 cursor-pointer"
                    >
                      {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      <span>Salvar Especialista</span>
                    </Button>
                  </div>
                </div>

                {/* Form Body do Especialista */}
                <div className="space-y-5">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Nome do Agente Especialista</Label>
                    <Input
                      value={specForm.name}
                      onChange={(e) => setSpecForm({ ...specForm, name: e.target.value })}
                      placeholder="Ex: Suporte Técnico, Vendas Boletos..."
                      className="rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Especialidade / Condição de Transferência</Label>
                    <Input
                      value={specForm.description}
                      onChange={(e) => setSpecForm({ ...specForm, description: e.target.value })}
                      placeholder="Ex: Especialista em tirar dúvidas sobre boletos e Pix"
                      className="rounded-xl"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      A IA Principal usará esta descrição para saber exatamente quando transferir ligações para este especialista via <code className="font-mono text-primary">transfer_to_agent</code>.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Voz da IA</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {VOICES.map((v) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setSpecForm({ ...specForm, voiceName: v })}
                          className={cn(
                            "rounded-xl border p-2.5 text-xs font-bold text-center transition-all cursor-pointer",
                            specForm.voiceName === v
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-card hover:border-primary/40 text-muted-foreground",
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Instruções Exclusivas do Especialista
                      </Label>
                      <PromptExpandButton onClick={() => setShowPromptModal(true)} />
                    </div>
                    <textarea
                      rows={10}
                      value={specForm.systemInstruction}
                      onChange={(e) => setSpecForm({ ...specForm, systemInstruction: e.target.value })}
                      className="w-full rounded-xl border border-border/70 bg-card p-4 font-mono text-xs text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary leading-relaxed mt-2 shadow-2xs custom-scrollbar"
                      placeholder="Digite as instruções e regras para este especialista..."
                    />

                    {/* Modal Expandido de Edição de Prompt para Especialista */}
                    <PromptEditorModal
                      open={showPromptModal}
                      onOpenChange={setShowPromptModal}
                      title={`Instruções do Especialista - ${specForm.name}`}
                      value={specForm.systemInstruction}
                      onSave={(val) => setSpecForm({ ...specForm, systemInstruction: val })}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão de Agente Especialista */}
      {deletingAgent && (
        <ConfirmModal
          open={!!deletingAgent}
          onOpenChange={(open) => !open && setDeletingAgent(null)}
          title="Excluir Agente Especialista"
          description={
            <>
              Tem certeza que deseja excluir o especialista{" "}
              <span className="font-bold text-foreground font-mono">{deletingAgent.name}</span>? Esta ação removerá o agente da lista de transferências.
            </>
          }
          confirmText="Excluir Agente"
          variant="destructive"
          loading={saveBusy}
          onConfirm={confirmDeleteSpecialist}
        />
      )}
    </div>
  );
};
