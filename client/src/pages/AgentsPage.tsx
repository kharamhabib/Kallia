import { useState, useEffect, useCallback, useMemo } from "react";
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
import { getAIProviders, type AIProviderConfig } from "@/services/aiProviders";
import type { AIConfig } from "@/types/ai";
import { useAIAgents } from "@/stores/ai";
import { useWorkspaceStore } from "@/stores/workspace";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { PromptEditorModal, PromptExpandButton, type PromptTag } from "@/components/shared/PromptEditorModal";

import { AISettingsPane } from "@/components/domain/settings/AISettingsPane";
import { ToolsSettingsPane } from "@/components/domain/settings/ToolsSettingsPane";
import { PostCallSettingsPane } from "@/components/domain/settings/PostCallSettingsPane";
import { FollowupSettingsPane } from "@/components/domain/settings/FollowupSettingsPane";

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
  systemInstruction: `## 1. Papel & Identidade
Você é a assistente virtual de voz do [session_name].
Sua função é atuar como uma secretária executiva inteligente, gerenciando chamadas telefônicas de entrada e saída via WhatsApp.
**Regra de Ouro da Transparência:** Nos primeiros segundos da conversa, informe ao interlocutor que você é uma assistente virtual de inteligência artificial. Nunca simule ser humana.

Hoje é [today]. Você está conversando com [contact_name] (número: [phone]). Esta é uma chamada de [direction].
[custom_fields]

---

## 2. Gatilhos & Ações (Triggers & Actions)

### 📥 Chamadas Recebidas (Inbound)
* **Gatilho**: Ao atender a ligação.
  * **Ação**: Cumprimente de forma simpática e informe sua identidade de IA.
  * *Exemplo*: "Olá, [contact_name]! Tudo bem? Aqui é a assistente virtual do [session_name]. No momento ele não pode atender, como posso te ajudar?"
* **Gatilho**: Se o cliente quiser deixar um recado.
  * **Ação**: Colete o assunto principal e se há algum prazo/urgência de retorno.
* **Gatilho**: Após registrar o recado ou responder à solicitação.
  * **Ação**: Confirme a ação e pergunte: "Há mais alguma coisa em que eu possa te ajudar agora?"

### 📤 Chamadas Efetuadas (Outbound)
* **Gatilho**: Ao ser atendida pelo interlocutor.
  * **Ação**: Confirme se fala com a pessoa certa e apresente o motivo.
  * *Exemplo*: "Olá, falo com [contact_name]? Aqui é a assistente virtual do [session_name], estou te ligando a pedido dele, tudo bem?"
* **Gatilho**: Após transmitir o recado ou realizar a tarefa.
  * **Ação**: Pergunte: "Ficou alguma dúvida ou posso te ajudar com algo mais?"

---

## 3. Pré-falas & Latência (Audio Preambles)
* **Antes de Executar Ferramentas ou Buscas Longas**: Emita uma pré-fala curta e natural para que o cliente saiba que você está processando a informação e não haja silêncio constrangedor na ligação.
  * *Exemplos*: "Só um instante enquanto consulto isso para você...", "Estou enviando a mensagem no seu WhatsApp agora mesmo..."
* **Exceção de Pré-fala**: Se o áudio do usuário for incompreensível ou cortado, NÃO use pré-fala e NÃO chame ferramentas; solicite esclarecimento diretamente.

---

## 4. Guardrails & Fronteiras de Uso de Ferramentas
* **Confirmação Prévia**: Antes de realizar agendamentos (\`schedule_call\`) ou chamados (\`open_ticket\`), confirme os dados com o cliente.
* **Envio de Mensagens (\`send_message\`)**: Utilize para enviar textos por escrito no WhatsApp. Após executar, confirme verbalmente o envio e pergunte se ele precisa de algo mais.
* **REGRA ABSOLUTA ANTI-DESLIGAMENTO**: JAMAIS se despeça ou execute a ferramenta \`hangup\` automaticamente após usar ferramentas (\`send_message\`, \`web_search\`, \`x_search\`, \`schedule_call\`, \`open_ticket\`).
* **Critério para Encerramento (\`hangup\`)**: A ferramenta \`hangup\` só deve ser acionada se o cliente responder expressamente que NÃO precisa de mais nada e se despedir.

---

## 5. Diretrizes de Sintonia e Ruído (TTS/STT)
* **Formato Conversacional Telefônico**: Respostas curtas de no máximo 2 a 3 frases por turno. Evite monólogos longos.
* **Proibição de Leitura Técnica**: NUNCA leia URLs (\`http/https\`), chaves PIX longas ou códigos de barras por voz. Avise que enviou esses dados por escrito no WhatsApp.
* **Tratamento de Áudio Incompreensível ou Ruído**: Se o áudio do cliente estiver cortado, com ruído ou confuso, pergunte educadamente sem adivinhar:
  * "Desculpe, a ligação falhou um pouco e não entendi. Você pode repetir, por favor?"`,
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
    hangup: "* Ferramenta hangup (Desligar Chamada): Use esta ferramenta APENAS E EXCLUSIVAMENTE quando o cliente disser explicitamente que não precisa de mais nada e se despedir. NUNCA chame esta ferramenta automaticamente após executar outras ferramentas.",
    open_ticket: "* Ferramenta open_ticket (Abrir Chamado): Use esta ferramenta quando o cliente solicitar suporte humano. Informe que o chamado foi registrado e PERGUNTE se ele precisa de ajuda com mais alguma coisa. Não desligue a chamada.",
    send_message: "* Ferramenta send_message (Enviar WhatsApp): Use esta ferramenta quando o cliente solicitar informações por escrito no WhatsApp. Diga que está enviando, execute a ferramenta e PERGUNTE educadamente se ele precisa de mais alguma coisa. JAMAIS se despeça após enviar a mensagem.",
    schedule_call: "* Ferramenta schedule_call (Reagendar/Agendar Ligação): Solicite a data e hora desejada e execute a ferramenta. Confirme o agendamento e PERGUNTE se há algo mais em que possa ajudar antes de encerrar."
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
  enableGrokWebSearch: true,
  enableGrokXSearch: true,
  grokReasoningEffort: "high",
  grokOutputSpeed: 1.0,
};

type MasterSubTab = "voice" | "instructions" | "tools" | "post_call";

export const AgentsPage = ({ sid, wid: propWid }: { sid?: string; wid?: string }) => {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const wid = propWid || currentWorkspace?.id;

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

  const [aiProviders, setAiProviders] = useState<AIProviderConfig[]>([]);

  // Form State para Agente Especialista Selecionado
  const [specForm, setSpecForm] = useState<{
    name: string;
    description: string;
    provider: string;
    modelName: string;
    voiceName: string;
    systemInstruction: string;
    outbound: boolean;
  }>({
    name: "",
    description: "",
    provider: "grok",
    modelName: "grok-voice-latest",
    voiceName: "eve",
    systemInstruction: "",
    outbound: false,
  });

  const specialists = useMemo(() => {
    return agents.filter((a) => !a.inbound && a.id !== "master" && a.name.trim().toLowerCase() !== "agente principal");
  }, [agents]);

  const loadData = useCallback(async () => {
    if (!sid && !wid) return;
    setLoading(true);
    try {
      const [resAgents, resConfig, resProviders] = await Promise.all([
        listAgents(sid, wid).catch(() => []),
        sid ? getAIConfig(sid).catch(() => null) : null,
        getAIProviders().catch(() => ({ providers: [] })),
      ]);
      const providersList = resProviders.providers || [];
      setAgents(resAgents);
      setAiProviders(providersList);
      if (resConfig) {
        const c = resConfig.aiConfig || defaultConfig;
        const provKey = c.provider || "gemini";
        const provHasKey = providersList.some((p) => p.provider === provKey && p.hasKey);
        const isAIEnabled = !!resConfig.enabled || provHasKey || (!!c.geminiApiKey && !c.geminiApiKey.includes("•••••"));
        setEnabled(isAIEnabled);

        setAiConfig({
          ...defaultConfig,
          ...c,
          serverSideAI: !!c.serverSideAI,
          provider: c.provider || "gemini",
          modelName: c.modelName || (c.provider === "gemini" ? "gemini-3.1-flash-live-preview" : "grok-voice-latest"),
          geminiApiKey: c.geminiApiKey || "",
          voiceName: c.voiceName || (c.provider === "gemini" ? "Puck" : "eve"),
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
          enableGrokWebSearch: c.enableGrokWebSearch ?? true,
          enableGrokXSearch: c.enableGrokXSearch ?? true,
          grokReasoningEffort: c.grokReasoningEffort || "high",
          grokOutputSpeed: c.grokOutputSpeed ?? 1.0,
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
        const prov = target.aiConfig?.provider || "gemini";
        const mod = target.aiConfig?.modelName || (prov === "gemini" ? "gemini-3.1-flash-live-preview" : prov === "openai" ? "gpt-4o-realtime-preview" : "grok-voice-latest");
        const v = target.aiConfig?.voiceName || (prov === "gemini" ? "Puck" : prov === "openai" ? "alloy" : "eve");

        setSpecForm({
          name: target.name,
          description: target.description || "",
          provider: prov,
          modelName: mod,
          voiceName: v,
          systemInstruction: target.aiConfig?.systemInstruction || "",
          outbound: target.outbound,
        });
      }
    }
  }, [selectedId, agents]);

  // Salva Agente Principal
  const handleSaveMaster = async () => {
    if (!aiConfig) return;
    if (!sid) {
      toast.error("Nenhuma conexão de WhatsApp ativa selecionada.");
      return;
    }
    setSaveBusy(true);
    try {
      await setAIConfig(sid, aiConfig);
      toast.success("Configurações do Agente Principal salvas!");
      await loadData();
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
          provider: specForm.provider,
          modelName: specForm.modelName,
          voiceName: specForm.voiceName,
          systemInstruction: specForm.systemInstruction.trim(),
        },
      }, wid);
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
      const activeProvs = aiProviders.filter((p) => p.enabled && p.hasKey);
      const defaultProv = activeProvs[0]?.provider || "grok";
      const defaultMod = activeProvs[0]?.defaultModel || (defaultProv === "gemini" ? "gemini-3.1-flash-live-preview" : defaultProv === "openai" ? "gpt-4o-realtime-preview" : "grok-voice-latest");
      const defaultVoice = defaultProv === "gemini" ? "Puck" : defaultProv === "openai" ? "alloy" : "eve";

      const newAgent = await createAgent(sid, {
        name: "Novo Especialista",
        description: "Descreva quando a IA deve transferir para este agente",
        inbound: false,
        outbound: false,
        aiConfig: {
          provider: defaultProv,
          modelName: defaultMod,
          voiceName: defaultVoice,
          systemInstruction: "Você é um agente especialista em atendimento.",
        },
      }, wid);
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
      await deleteAgent(sid, deletingAgent.id, wid);
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
              {specialists.length + 1} {specialists.length === 0 ? "agente cadastrado" : "agentes cadastrados"}
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
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Especialistas ({specialists.length})</span>
              <span className="h-px bg-border flex-1" />
            </div>

            {/* LISTA DE AGENTES ESPECIALISTAS */}
            {specialists.length === 0 ? (
              <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground space-y-2">
                <Bot className="h-6 w-6 mx-auto text-muted-foreground/50" />
                <p className="font-medium">Nenhum especialista cadastrado.</p>
                <p className="text-[10px]">Crie especialistas para transferir chamadas automaticamente pela IA.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {specialists.map((ag) => {
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

                  {/* Provedor & Modelo do Especialista */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground">Provedor de IA</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                        value={specForm.provider || "grok"}
                        onChange={(e) => {
                          const pKey = e.target.value;
                          const targetProv = aiProviders.find((p) => p.provider === pKey);
                          const defaultMod = targetProv?.defaultModel || (pKey === "gemini" ? "gemini-3.1-flash-live-preview" : pKey === "openai" ? "gpt-4o-realtime-preview" : "grok-voice-latest");
                          let defaultVoice = "eve";
                          if (pKey === "gemini") defaultVoice = "Puck";
                          if (pKey === "openai") defaultVoice = "alloy";
                          setSpecForm({ ...specForm, provider: pKey, modelName: defaultMod, voiceName: defaultVoice });
                        }}
                      >
                        {aiProviders.filter((p) => p.enabled && p.hasKey).length > 0 ? (
                          aiProviders.filter((p) => p.enabled && p.hasKey).map((p) => (
                            <option key={p.provider} value={p.provider}>
                              {p.name}
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="grok">xAI Grok Live (Requer Chave)</option>
                            <option value="gemini">Google Gemini Live (Requer Chave)</option>
                            <option value="openai">OpenAI GPT Live (Requer Chave)</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground">Modelo de Voz</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={specForm.modelName || (specForm.provider === "gemini" ? "gemini-3.1-flash-live-preview" : specForm.provider === "openai" ? "gpt-4o-realtime-preview" : "grok-voice-latest")}
                        onChange={(e) => setSpecForm({ ...specForm, modelName: e.target.value })}
                      >
                        {(() => {
                          const provKey = specForm.provider || "grok";
                          const provConfig = aiProviders.find((p) => p.provider === provKey);
                          if (provConfig && provConfig.availableModels.length > 0) {
                            return provConfig.availableModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.id})
                              </option>
                            ));
                          }
                          if (provKey === "gemini") {
                            return (
                              <>
                                <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live Preview</option>
                                <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                                <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
                              </>
                            );
                          }
                          if (provKey === "openai") {
                            return (
                              <>
                                <option value="gpt-4o-realtime-preview">GPT-4o Realtime</option>
                                <option value="gpt-4o-mini-realtime-preview">GPT-4o Mini Realtime</option>
                              </>
                            );
                          }
                          return (
                            <>
                              <option value="grok-voice-latest">Grok Voice Latest</option>
                              <option value="grok-voice-think-fast-2.0">Grok Voice Think Fast 2.0</option>
                              <option value="grok-voice-think-fast-1.0">Grok Voice Think Fast 1.0</option>
                            </>
                          );
                        })()}
                      </select>
                    </div>
                  </div>

                  {/* Voz da IA do Especialista */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground">Voz da IA do Especialista</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                      value={specForm.voiceName}
                      onChange={(e) => setSpecForm({ ...specForm, voiceName: e.target.value })}
                    >
                      {specForm.provider === "grok" ? (
                        <>
                          <option value="eve">Eve (Feminina expressiva)</option>
                          <option value="adam">Adam (Masculino profissional)</option>
                          <option value="nova">Nova (Feminina jovem)</option>
                        </>
                      ) : specForm.provider === "openai" ? (
                        <>
                          <option value="alloy">Alloy (Neutro equilibrado)</option>
                          <option value="echo">Echo (Masculino caloroso)</option>
                          <option value="shimmer">Shimmer (Feminino claro)</option>
                          <option value="fable">Fable (Expressivo)</option>
                          <option value="onyx">Onyx (Masculino grave)</option>
                          <option value="nova">Nova (Feminina jovem)</option>
                        </>
                      ) : (
                        <>
                          <option value="Puck">Puck (Masculina suave)</option>
                          <option value="Charon">Charon (Masculina grave)</option>
                          <option value="Kore">Kore (Feminina jovem)</option>
                          <option value="Fenrir">Fenrir (Masculina firme)</option>
                          <option value="Aoede">Aoede (Feminina expressiva)</option>
                        </>
                      )}
                    </select>
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
