import { useEffect, useState } from "react";
import { Sparkles, Loader2, Calendar, PhoneCall, Trash2, Plus, Clock } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/Switch";
import { getAIConfig, setAIConfig, deleteAIConfig } from "@/services/ai";
import { getAIProviders, type AIProviderConfig } from "@/services/aiProviders";
import type { AIConfig, ScheduledCall } from "@/types/ai";
import { useAIAgents } from "@/stores/ai";
import { DEFAULT_TOOL_PROMPTS } from "@/lib/ai/default-prompts";
import { parseScheduledCalls } from "@/lib/ai/scheduled-calls";

const defaultConfig: AIConfig = {
  geminiApiKey: "",
  voiceName: "Puck",
  languageCode: "pt-BR",
  systemInstruction: `## Identidade e Papel
Você é a assistente virtual de voz do [session_name].
Sua principal função é atuar como uma secretária executiva inteligente, gerenciando a comunicação de entrada e saída em ligações no WhatsApp.
**Regra de Ouro:** Transparência total. Você deve SEMPRE deixar claro, nos primeiros segundos de conversa, que é uma assistente virtual de inteligência artificial falando em nome do [session_name]. Nunca finja ser humana.

Hoje é [today]. Você está conversando com [contact_name] (número: [phone]). Esta é uma chamada de [direction].
[custom_fields]

---

## Comportamento: Recebendo Ligações (Inbound)
1. **Saudação e Identificação**: Atenda com tom cortês, identificando-se imediatamente.
   * Exemplo: "Olá, [contact_name], tudo bem? Aqui é a assistente virtual do [session_name]. Ele não pode atender no momento, como posso te ajudar?"
2. **Escuta Ativa e Triagem**: Ouça a solicitação do cliente com atenção sem interromper.
3. **Coleta Objetiva**: Se necessário registrar um recado, faça perguntas diretas:
   * "Você poderia me informar o assunto principal do recado?"
   * "Há algum prazo ou urgência para este retorno?"
4. **Confirmação e Permanência na Linha**:
   * Confirme verbalmente que o recado foi registrado.
   * **REGRA OBRIGATÓRIA**: NUNCA se despeça diretamente. PERGUNTE SEMPRE: "Há mais alguma coisa em que eu possa te ajudar agora?"

---

## Comportamento: Fazendo Ligações (Outbound)
1. **Identificação e Confirmação**: Verifique se está falando com a pessoa certa e apresente-se.
   * Exemplo: "Olá, falo com [contact_name]? Aqui é a assistente virtual do [session_name], estou te ligando a pedido dele, tudo bem?"
2. **Mensagem Principal**: Transmita o recado ou pergunta de forma clara, breve e objetiva.
3. **Aguardar Resposta**: Deixe o interlocutor responder completamente antes de continuar.
4. **Confirmação de Encerramento**:
   * Após transmitir a mensagem ou executar uma ação, PERGUNTE SEMPRE: "Ficou alguma dúvida ou posso te ajudar com algo mais?"
   * Somente se despeça e use a ferramenta \`hangup\` se a pessoa responder que não precisa de mais nada.

---

## Diretrizes Estritas de Voz e Sintonia (TTS/STT / Realtime)
* **Formato Telefônico Natural**: Fale em frases curtas (no máximo 2 a 3 frases por turno). Evite monólogos longos.
* **Leitura de Dados por Voz**: NUNCA soletre links (HTTP/HTTPS), chaves PIX longas ou códigos de barras verbalmente. Em vez disso, diga que enviou esses dados por escrito no WhatsApp usando a ferramenta \`send_message\`.
* **Sem Símbolos Técnicos**: Não leia asteriscos, hashtags ou formatação de texto. Fale naturally como em um telefonema real.
* **Tratamento de Ruído ou Falhas**: Se a voz falhar ou o áudio ficar confuso, diga educadamente:
   * "Desculpe, deu uma pequena falha na ligação e não consegui te ouvir bem. Você pode repetir, por favor?"

---

## Uso de Ferramentas e Manutenção da Chamada
* **Regra Anti-Desligamento**: Jamais chame a ferramenta \`hangup\` ou diga "tchau" imediatamente após executar \`send_message\`, \`web_search\`, \`x_search\`, \`schedule_call\` ou \`open_ticket\`.
* **Permanência na Linha**: Após qualquer ação, informe o resultado e pergunte se o cliente precisa de mais algum auxílio. A ferramenta \`hangup\` é reservada exclusivamente para quando o atendimento estiver totalmente concluído com a permissão do cliente.`,
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
  // Fonte única dos prompts padrão (lib/ai/default-prompts.ts) — antes eram
  // duplicados aqui e no agente, e divergiam (typo "reuniõe" incluso).
  toolPrompts: { ...DEFAULT_TOOL_PROMPTS },
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

export const AIDialog = ({ sid }: { sid: string }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [tab, setTab] = useState<"config" | "schedules">("config");

  // Estados do formulário da IA
  const [config, setConfig] = useState<AIConfig>({ ...defaultConfig });
  const [schedules, setSchedules] = useState<ScheduledCall[]>([]);
  const [aiProviders, setAiProviders] = useState<AIProviderConfig[]>([]);

  // Estados para nova ligação agendada
  const [newPhone, setNewPhone] = useState("");
  const [newTime, setNewTime] = useState("");

  useEffect(() => {
    if (!open) return;
    setBusy(true);
    getAIProviders().then((res) => setAiProviders(res.providers || [])).catch(() => {});
    getAIConfig(sid)
      .then((r) => {
        setEnabled(r.enabled);
        const c = r.aiConfig || defaultConfig;
        const mappedPredefined = (c.predefinedTools || []).map((t: string) => t === "human_transfer" ? "open_ticket" : t);
        setConfig({
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
          predefinedTools: mappedPredefined,
          toolPrompts: c.toolPrompts || { ...defaultConfig.toolPrompts },
          customTools: c.customTools || [],
          postCall: c.postCall || { ...defaultConfig.postCall },
          customFields: c.customFields || "",
        });
        setSchedules(parseScheduledCalls(c.scheduledCalls));
      })
      .catch(() => {
        toast.error("Falha ao carregar as configurações de IA");
      })
      .finally(() => {
        setBusy(false);
      });
  }, [open, sid]);

  const save = async (updatedConfig?: AIConfig) => {
    setBusy(true);
    const target = updatedConfig || config;
    try {
      await setAIConfig(sid, target);
      toast.success("Configuração de IA salva!");
      setEnabled(target.geminiApiKey !== "");
      useAIAgents.getState().setActiveSessionConfig(target);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setBusy(true);
    try {
      await deleteAIConfig(sid);
      setConfig({ ...defaultConfig });
      setSchedules([]);
      setEnabled(false);
      useAIAgents.getState().setActiveSessionConfig(null);
      toast.success("Integração de IA desabilitada");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddSchedule = () => {
    if (!newPhone.trim() || !newTime) {
      toast.error("Preencha o telefone e a hora do agendamento");
      return;
    }
    const cleanPhone = newPhone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Telefone inválido");
      return;
    }

    const scheduledDate = new Date(newTime);
    if (scheduledDate <= new Date()) {
      toast.error("Escolha um horário no futuro");
      return;
    }

    const newCall: ScheduledCall = {
      id: Math.random().toString(36).substring(2, 11),
      phone: cleanPhone,
      time: scheduledDate.toISOString(),
      active: true,
    };

    const nextSchedules = [...schedules, newCall];
    setSchedules(nextSchedules);
    const nextConfig = { ...config, scheduledCalls: JSON.stringify(nextSchedules) };
    setConfig(nextConfig);
    void save(nextConfig);

    setNewPhone("");
    setNewTime("");
  };

  const handleDeleteSchedule = (id: string) => {
    const nextSchedules = schedules.filter((s) => s.id !== id);
    setSchedules(nextSchedules);
    const nextConfig = { ...config, scheduledCalls: JSON.stringify(nextSchedules) };
    setConfig(nextConfig);
    void save(nextConfig);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={enabled ? "default" : "outline"} size="sm" className="gap-1.5">
          <Sparkles className="h-4 w-4 text-warning-text fill-warning/20" />
          Configurar IA
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-warning-text fill-warning/25" />
            <DialogTitle>Integração de Voz IA (Gemini Live)</DialogTitle>
          </div>
          <DialogDescription>
            Configure um atendente de voz automático utilizando inteligência artificial.
          </DialogDescription>
        </DialogHeader>

        {/* Abas */}
        <div className="flex border-b mt-2">
          <button
            onClick={() => setTab("config")}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 text-center transition-colors ${
              tab === "config" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Voz & IA
          </button>
          <button
            onClick={() => setTab("schedules")}
            className={`flex-1 pb-2.5 text-sm font-medium border-b-2 text-center transition-colors ${
              tab === "schedules" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Agendamentos ({schedules.length})
          </button>
        </div>

        <div className={`absolute inset-0 flex items-center justify-center bg-background/50 z-50 transition-all duration-200 ${
          busy ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        }`}>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>

        <div className="py-4 space-y-4 max-h-[380px] overflow-y-auto pr-1">
          {tab === "config" ? (
            <div className="space-y-4">
              {/* Provedor & Modelo de IA */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="provider">Provedor de IA Cadastrado</Label>
                  <select
                    id="provider"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                    value={config.provider || "grok"}
                    onChange={(e) => {
                      const pKey = e.target.value;
                      const targetProv = aiProviders.find((p) => p.provider === pKey);
                      const defaultMod = targetProv?.defaultModel || (pKey === "gemini" ? "gemini-3.1-flash-live-preview" : pKey === "openai" ? "gpt-4o-realtime-preview" : "grok-voice-latest");
                      let defaultVoice = "eve";
                      if (pKey === "gemini") defaultVoice = "Puck";
                      if (pKey === "openai") defaultVoice = "alloy";
                      setConfig({ ...config, provider: pKey, modelName: defaultMod, voiceName: defaultVoice });
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
                  <Label htmlFor="modelName">Modelo de Voz</Label>
                  <select
                    id="modelName"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={config.modelName || (config.provider === "gemini" ? "gemini-3.1-flash-live-preview" : config.provider === "openai" ? "gpt-4o-realtime-preview" : "grok-voice-latest")}
                    onChange={(e) => setConfig({ ...config, modelName: e.target.value })}
                  >
                    {(() => {
                      const provKey = config.provider || "grok";
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

              {/* Voz e Idioma */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="voice">Voz da IA</Label>
                  <select
                    id="voice"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={config.voiceName}
                    onChange={(e) => setConfig({ ...config, voiceName: e.target.value })}
                  >
                    {config.provider === "grok" ? (
                      <>
                        <option value="eve">Eve (Feminina expressiva)</option>
                        <option value="adam">Adam (Masculino profissional)</option>
                        <option value="nova">Nova (Feminina jovem)</option>
                      </>
                    ) : config.provider === "openai" ? (
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

                <div className="space-y-1.5">
                  <Label htmlFor="language">Idioma</Label>
                  <select
                    id="language"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={config.languageCode}
                    onChange={(e) => setConfig({ ...config, languageCode: e.target.value })}
                  >
                    <option value="pt-BR">Português (pt-BR)</option>
                    <option value="en-US">Inglês (en-US)</option>
                    <option value="es-ES">Espanhol (es-ES)</option>
                  </select>
                </div>
              </div>

              {/* Instruções do Sistema */}
              <div className="space-y-1.5">
                <Label htmlFor="instructions">Instruções do Sistema (Prompt)</Label>
                <textarea
                  id="instructions"
                  rows={3}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder="Ex: Você é o atendente de voz de uma pizzaria. Seja cordial..."
                  value={config.systemInstruction}
                  onChange={(e) => setConfig({ ...config, systemInstruction: e.target.value })}
                />
              </div>

              {/* Primeira Fala da IA */}
              <div className="space-y-1.5">
                <Label htmlFor="firstUtterance">Primeira fala da IA (Atendimento automático/recebidas)</Label>
                <textarea
                  id="firstUtterance"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder="Ex: Alô? Boa tarde, sou a assistente virtual e estou ligando..."
                  value={config.firstUtterance || ""}
                  onChange={(e) => setConfig({ ...config, firstUtterance: e.target.value })}
                />
              </div>

              {/* Temperatura e Duração Máxima */}
              <div className="grid grid-cols-2 gap-3 items-center">
                <div className="space-y-1">
                  <Label htmlFor="temp">Temperatura ({config.temperature})</Label>
                  <input
                    id="temp"
                    type="range"
                    min="0.2"
                    max="1.8"
                    step="0.1"
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    value={config.temperature}
                    onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="duration">Duração Máxima (Minutos)</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    max="60"
                    value={config.maxDurationMin}
                    onChange={(e) => setConfig({ ...config, maxDurationMin: parseInt(e.target.value) || 5 })}
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="border rounded-lg p-3 space-y-3.5 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium cursor-pointer" htmlFor="serverSideAI">IA Autônoma no Servidor</Label>
                    <p className="text-xs text-muted-foreground">O servidor gerencia IA e agendamentos sem navegador aberto</p>
                  </div>
                  <Switch
                    id="serverSideAI"
                    checked={config.serverSideAI}
                    onChange={(v) => setConfig({ ...config, serverSideAI: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium cursor-pointer" htmlFor="autoAnswer">Atendimento Automático</Label>
                    <p className="text-xs text-muted-foreground">Atender ligações de voz recebidas pela IA</p>
                  </div>
                  <Switch
                    id="autoAnswer"
                    checked={config.autoAnswer}
                    onChange={(v) => setConfig({ ...config, autoAnswer: v })}
                  />
                </div>

                {config.autoAnswer && (
                  <div className="space-y-2 border-l-2 border-primary/20 pl-4 py-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium text-muted-foreground">Tempo de toque antes de atender</Label>
                      <span className="text-xs font-semibold text-primary">
                        {config.autoAnswerDelay === 0 ? "Imediatamente" : `${config.autoAnswerDelay}s`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={1}
                      value={config.autoAnswerDelay ?? 0}
                      onChange={(e) => setConfig({ ...config, autoAnswerDelay: parseInt(e.target.value) })}
                      className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium cursor-pointer" htmlFor="silenceOperator">Modo Silencioso do Operador</Label>
                    <p className="text-xs text-muted-foreground">Mutar reprodução de áudio no seu navegador</p>
                  </div>
                  <Switch
                    id="silenceOperator"
                    checked={config.silenceOperator}
                    onChange={(v) => setConfig({ ...config, silenceOperator: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium cursor-pointer" htmlFor="transcribeAudio">Transcrição em Tempo Real</Label>
                    <p className="text-xs text-muted-foreground">Transcrever diálogos de áudio em texto</p>
                  </div>
                  <Switch
                    id="transcribeAudio"
                    checked={config.transcribeAudio}
                    onChange={(v) => setConfig({ ...config, transcribeAudio: v })}
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                {enabled && (
                  <Button variant="outline" className="text-destructive hover:bg-destructive/10" onClick={handleDisable}>
                    Desabilitar IA
                  </Button>
                )}
                <Button onClick={() => save()}>Salvar Configuração</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Adicionar agendamento */}
              <div className="border rounded-lg p-3 space-y-3 bg-muted/15">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                  <Plus className="h-3 w-3" /> Programar Ligação Ativa
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">WhatsApp (Telefone)</Label>
                    <Input
                      type="text"
                      placeholder="Ex: 5511999999999"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Data e Hora de Disparo</Label>
                    <Input
                      type="datetime-local"
                      value={newTime}
                      onChange={(e) => setNewTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" onClick={handleAddSchedule} className="gap-1.5">
                    <Calendar className="h-3.5 w-3.5" />
                    Agendar Ligação
                  </Button>
                </div>
              </div>

              {/* Lista de agendamentos */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Lista de Agendamentos Ativos
                </p>
                <div className="space-y-2">
                  {schedules.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between border rounded-md p-2.5 bg-background shadow-sm hover:border-muted-foreground/30 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <PhoneCall className="h-3.5 w-3.5 text-muted-foreground" />
                          {s.phone}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.time).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-8 w-8"
                        onClick={() => handleDeleteSchedule(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {schedules.length === 0 && (
                    <p className="text-sm text-center text-muted-foreground py-8 border border-dashed rounded-lg">
                      Nenhuma ligação programada ativa.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
