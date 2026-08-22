import { useState, useEffect } from "react";
import { Sparkles, Target, ShieldAlert, PhoneCall, Globe } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AIConfig } from "@/types/ai";
import { Switch } from "@/components/ui/Switch";
import { listAgents, type Agent } from "@/services/agents";
import { getAIProviders, type AIProviderConfig } from "@/services/aiProviders";
import { useWorkspaceStore } from "@/stores/workspace";

interface AISettingsPaneProps {
  config: AIConfig;
  onChange: (cfg: AIConfig) => void;
  enabled: boolean;
  sid?: string;
}

export const AISettingsPane = ({ config, onChange, enabled, sid }: AISettingsPaneProps) => {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const wid = currentWorkspace?.id;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentToAdd, setSelectedAgentToAdd] = useState<string>("");
  const [aiProviders, setAiProviders] = useState<AIProviderConfig[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const isSpecialistTransferEnabled = config.enableSpecialistTransfer ?? true;

  useEffect(() => {
    getAIProviders()
      .then((res) => {
        setAiProviders(res.providers || []);
      })
      .catch(() => {})
      .finally(() => setLoadingProviders(false));

    if (sid || wid) {
      listAgents(sid, wid)
        .then((res) => {
          setAgents(res);
          if (config.allowedSpecialistIds === undefined) {
            const defaultSpecIds = res.filter((a) => !a.inbound && !a.outbound).map((a) => a.id);
            onChange({ ...config, allowedSpecialistIds: defaultSpecIds });
          }
        })
        .catch(() => {});
    }
  }, [sid, wid]);

  // Provedores efetivamente configurados com API key ativa no banco
  const activeProviders = aiProviders.filter((p) => p.enabled && p.hasKey);

  // Provedor selecionado no config ou fallback inteligente para o primeiro ativo ou gemini
  const currentProviderKey = config.provider || (activeProviders[0]?.provider ?? "gemini");

  // Dados do provedor selecionado
  const currentProviderConfig = aiProviders.find((p) => p.provider === currentProviderKey);
  const isVoiceActive = enabled || !!currentProviderConfig?.hasKey || (activeProviders.length > 0);

  const availableSpecialists = agents.filter((a) => !a.inbound && !a.outbound);
  const allowedIds = config.allowedSpecialistIds || [];
  const activeSpecialists = availableSpecialists.filter((a) => allowedIds.includes(a.id));
  const unaddedSpecialists = availableSpecialists.filter((a) => !allowedIds.includes(a.id));

  const handleAddSpecialist = () => {
    if (!selectedAgentToAdd) return;
    const nextIds = [...allowedIds, selectedAgentToAdd];
    onChange({ ...config, allowedSpecialistIds: nextIds });
    setSelectedAgentToAdd("");
  };

  const handleRemoveSpecialist = (idToRemove: string) => {
    const nextIds = allowedIds.filter((id) => id !== idToRemove);
    onChange({ ...config, allowedSpecialistIds: nextIds });
  };

  const handleProviderChange = (pKey: string) => {
    const targetProv = aiProviders.find((p) => p.provider === pKey);
    const defaultMod = targetProv?.defaultModel || (pKey === "gemini" ? "gemini-3.1-flash-live-preview" : pKey === "openai" ? "gpt-4o-realtime-preview" : "grok-voice-latest");
    let defaultVoice = "eve";
    if (pKey === "gemini") defaultVoice = "Puck";
    if (pKey === "openai") defaultVoice = "alloy";

    onChange({
      ...config,
      provider: pKey,
      modelName: defaultMod,
      voiceName: defaultVoice,
    });
  };

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Status indicator */}
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-4 w-4 text-primary fill-primary/20" />
        <span className="text-sm font-medium">Integração de Voz</span>
        <span
          className={`ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full ${
            isVoiceActive
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
              : "bg-muted text-muted-foreground border border-border"
          }`}
        >
          {isVoiceActive ? "Ativa" : "Inativa"}
        </span>
      </div>

      {/* Se nenhum provedor estiver configurado nas Configurações Gerais */}
      {!loadingProviders && activeProviders.length === 0 && (
        <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-xs font-semibold">Nenhum Provedor de IA de Voz Configurado</p>
            <p className="text-xs text-muted-foreground">
              Para utilizar a integração de voz nos agentes, cadastre a API Key de pelo menos um provedor (xAI Grok, Google Gemini ou OpenAI) na aba <strong>Configurações &gt; Provedores de IA</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Provedores & Modelos */}
      <Card className="card-premium">
        <CardContent className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="provider">Provedor de IA Cadastrado</Label>
              <select
                id="provider"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                value={currentProviderKey}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {activeProviders.length > 0 ? (
                  activeProviders.map((p) => (
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
                value={config.modelName || currentProviderConfig?.defaultModel || "grok-voice-latest"}
                onChange={(e) => onChange({ ...config, modelName: e.target.value })}
              >
                {currentProviderConfig && currentProviderConfig.availableModels.length > 0 ? (
                  currentProviderConfig.availableModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.id})
                    </option>
                  ))
                ) : (
                  <>
                    {currentProviderKey === "gemini" && (
                      <>
                        <option value="gemini-3.1-flash-live-preview">Gemini 3.1 Flash Live Preview</option>
                        <option value="gemini-3.6-flash">Gemini 3.6 Flash</option>
                        <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite</option>
                      </>
                    )}
                    {currentProviderKey === "openai" && (
                      <>
                        <option value="gpt-4o-realtime-preview">GPT-4o Realtime</option>
                        <option value="gpt-4o-mini-realtime-preview">GPT-4o Mini Realtime</option>
                      </>
                    )}
                    {currentProviderKey === "grok" && (
                      <>
                        <option value="grok-voice-latest">Grok Voice Latest</option>
                        <option value="grok-voice-think-fast-2.0">Grok Voice Think Fast 2.0</option>
                        <option value="grok-voice-think-fast-1.0">Grok Voice Think Fast 1.0</option>
                      </>
                    )}
                  </>
                )}
              </select>
            </div>
          </div>

          {/* Voice & Language */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="voice">Voz da IA</Label>
              <select
                id="voice"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={config.voiceName}
                onChange={(e) => onChange({ ...config, voiceName: e.target.value })}
              >
                {currentProviderKey === "grok" ? (
                  <>
                    <option value="eve">Eve ⭐ (Feminina expressiva — Recomendada pt-BR)</option>
                    <option value="sal">Sal ⭐ (Neutro equilibrado — Recomendada pt-BR)</option>
                    <option value="ara">Ara (Feminina clara)</option>
                    <option value="carina">Carina (Feminina suave)</option>
                    <option value="luna">Luna (Feminina jovem)</option>
                    <option value="iris">Iris (Feminina elegante)</option>
                    <option value="celeste">Celeste (Feminina serena)</option>
                    <option value="ursa">Ursa (Feminina marcante)</option>
                    <option value="zagan">Zagan (Masculino grave)</option>
                    <option value="helix">Helix (Masculino moderno)</option>
                    <option value="orion">Orion (Masculino firme)</option>
                    <option value="altair">Altair (Masculino técnico)</option>
                    <option value="zenith">Zenith (Masculino refinado)</option>
                    <option value="perseus">Perseus (Masculino forte)</option>
                    <option value="helios">Helios (Masculino vibrante)</option>
                    <option value="kepler">Kepler (Masculino calmo)</option>
                    <option value="rigel">Rigel (Masculino formal)</option>
                    <option value="sirius">Sirius (Masculino confiante)</option>
                    <option value="castor">Castor (Masculino articulado)</option>
                    <option value="naksh">Naksh (Masculino dinâmico)</option>
                    <option value="atlas">Atlas (Masculino autoritário)</option>
                    <option value="leo">Leo (Masculino jovem)</option>
                    <option value="rex">Rex (Masculino firme)</option>
                    <option value="lux">Lux (Neutro brilhante)</option>
                    <option value="cosmo">Cosmo (Neutro amigável)</option>
                    <option value="lumen">Lumen (Neutro claro)</option>
                  </>
                ) : currentProviderKey === "openai" ? (
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
                onChange={(e) => onChange({ ...config, languageCode: e.target.value })}
              >
                <option value="pt-BR">Português Brasil (pt-BR)</option>
                <option value="pt-PT">Português Portugal (pt-PT)</option>
                <option value="en-US">Inglês (en-US)</option>
                <option value="es-ES">Espanhol Espanha (es-ES)</option>
                <option value="es-MX">Espanhol México (es-MX)</option>
                <option value="fr">Francês (fr)</option>
                <option value="de">Alemão (de)</option>
                <option value="it">Italiano (it)</option>
                <option value="ja">Japonês (ja)</option>
                <option value="ko">Coreano (ko)</option>
                <option value="zh">Chinês (zh)</option>
                <option value="auto">Detecção Automática</option>
              </select>
            </div>
          </div>

          {/* Ferramentas Nativas & Configurações xAI Grok */}
          {currentProviderKey === "grok" && (
            <div className="space-y-3.5 rounded-xl border border-primary/25 bg-primary/5 p-4 animate-fade-in">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <h4 className="font-semibold text-sm text-foreground">
                  Recursos Avançados da xAI (Grok Realtime)
                </h4>
              </div>
              <p className="text-xs text-muted-foreground">
                Configure o nível de raciocínio e as ferramentas nativas de busca do Grok em tempo real.
              </p>

              <div className="space-y-3.5 pt-2 border-t border-primary/10">
                {/* Reasoning Effort Selector */}
                <div className="space-y-1.5">
                  <Label htmlFor="grokReasoningEffort" className="text-xs font-semibold">
                    Nível de Raciocínio (Reasoning Effort)
                  </Label>
                  <select
                    id="grokReasoningEffort"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                    value={config.grokReasoningEffort || "high"}
                    onChange={(e) => onChange({ ...config, grokReasoningEffort: e.target.value })}
                  >
                    <option value="high">🧠 Alta Precisão & Raciocínio (high - Recomendado)</option>
                    <option value="none">⚡ Resposta Ultrarrápida / Sem Raciocínio (none)</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    'high' ativa a reflexão profunda antes de responder. 'none' reduz a latência ao mínimo para respostas instantâneas.
                  </p>
                </div>

                {/* Output Speed Slider */}
                <div className="space-y-1.5">
                  <Label htmlFor="grokOutputSpeed" className="text-xs font-semibold">
                    🎙️ Velocidade da Fala ({(config.grokOutputSpeed || 1.0).toFixed(1)}x)
                  </Label>
                  <input
                    id="grokOutputSpeed"
                    type="range"
                    min="0.7"
                    max="1.5"
                    step="0.1"
                    value={config.grokOutputSpeed || 1.0}
                    onChange={(e) => onChange({ ...config, grokOutputSpeed: parseFloat(e.target.value) })}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>0.7x (Lento)</span>
                    <span>1.0x (Normal)</span>
                    <span>1.5x (Rápido)</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableGrokWebSearch" className="cursor-pointer text-xs font-semibold">
                      🌐 Pesquisa e Navegação Web (Web Search)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Permite que o robô pesquise na internet em tempo real para responder dados atualizados.
                    </p>
                  </div>
                  <Switch
                    id="enableGrokWebSearch"
                    checked={config.enableGrokWebSearch ?? true}
                    onChange={(v) => onChange({ ...config, enableGrokWebSearch: v })}
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="space-y-0.5">
                    <Label htmlFor="enableGrokXSearch" className="cursor-pointer text-xs font-semibold">
                      🐦 Pesquisa no X / ex-Twitter (X Search)
                    </Label>
                    <p className="text-[11px] text-muted-foreground">
                      Permite que o robô busque postagens, tendências e notícias atualizadas na rede social X.
                    </p>
                  </div>
                  <Switch
                    id="enableGrokXSearch"
                    checked={config.enableGrokXSearch ?? true}
                    onChange={(v) => onChange({ ...config, enableGrokXSearch: v })}
                  />
                </div>
              </div>
            </div>
          )}
          {/* Parâmetros de Conversação */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/50">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="temperature" className="text-xs font-semibold">
                  Temperatura ({config.temperature ?? 1.1})
                </Label>
              </div>
              <input
                id="temperature"
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={config.temperature ?? 1.1}
                onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="maxDurationMin" className="text-xs font-semibold">
                Duração Máxima (Minutos)
              </Label>
              <input
                id="maxDurationMin"
                type="number"
                min="1"
                max="60"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={config.maxDurationMin ?? 5}
                onChange={(e) => onChange({ ...config, maxDurationMin: parseInt(e.target.value) || 5 })}
              />
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="firstUtteranceToggle" className="cursor-pointer font-semibold text-sm">
                  IA fala primeiro ao atender
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se ativado, a IA iniciará a conversa com uma saudação. Se desativado, a IA aguardará a pessoa falar primeiro.
                </p>
              </div>
              <Switch
                id="firstUtteranceToggle"
                checked={!!config.firstUtterance}
                onChange={(checked) => onChange({ ...config, firstUtterance: checked ? "Olá! Como posso ajudar?" : "" })}
              />
            </div>
            {!!config.firstUtterance && (
              <div className="pt-1 animate-fade-in">
                <input
                  type="text"
                  placeholder="Digite a mensagem de saudação inicial..."
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={config.firstUtterance}
                  onChange={(e) => onChange({ ...config, firstUtterance: e.target.value })}
                />
              </div>
            )}
          </div>

          {/* Comportamento */}
          <div className="space-y-3.5 rounded-xl border bg-muted/15 p-4 border-border/50">
            <h4 className="font-semibold text-sm flex items-center gap-1.5 text-foreground">
              <PhoneCall className="h-4 w-4 text-primary" />
              Comportamento do Atendimento
            </h4>

            <div className="space-y-3.5 divide-y divide-border/40">
              <div className="flex items-center justify-between pt-1">
                <div className="space-y-0.5">
                  <Label htmlFor="serverSideAI" className="cursor-pointer font-medium text-sm">
                    IA Autônoma no Servidor
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    O servidor gerencia IA e agendamentos sem necessidade do navegador aberto
                  </p>
                </div>
                <Switch
                  id="serverSideAI"
                  checked={config.serverSideAI ?? true}
                  onChange={(v) => onChange({ ...config, serverSideAI: v })}
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div className="space-y-0.5">
                  <Label htmlFor="autoAnswer" className="cursor-pointer font-medium text-sm">
                    Atendimento Automático
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Atender ligações de voz recebidas pela IA
                  </p>
                </div>
                <Switch
                  id="autoAnswer"
                  checked={config.autoAnswer ?? true}
                  onChange={(v) => onChange({ ...config, autoAnswer: v })}
                />
              </div>

              {(config.autoAnswer ?? true) && (
                <div className="space-y-2 border-l-2 border-primary/30 pl-4 py-2 mt-2 bg-background/40 rounded-r-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Tempo de toque antes de atender
                    </Label>
                    <span className="text-xs font-bold text-primary">
                      {config.autoAnswerDelay === 0 ? "Imediatamente" : `${config.autoAnswerDelay ?? 9}s`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={config.autoAnswerDelay ?? 9}
                    onChange={(e) => onChange({ ...config, autoAnswerDelay: parseInt(e.target.value) || 0 })}
                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center justify-between pt-3">
                <div className="space-y-0.5">
                  <Label htmlFor="silenceOperator" className="cursor-pointer font-medium text-sm">
                    Modo Silencioso do Operador
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Mutar reprodução de áudio no seu navegador
                  </p>
                </div>
                <Switch
                  id="silenceOperator"
                  checked={config.silenceOperator ?? false}
                  onChange={(v) => onChange({ ...config, silenceOperator: v })}
                />
              </div>

              <div className="flex items-center justify-between pt-3">
                <div className="space-y-0.5">
                  <Label htmlFor="transcribeAudio" className="cursor-pointer font-medium text-sm">
                    Transcrição em Tempo Real
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Transcrever diálogos de áudio em texto
                  </p>
                </div>
                <Switch
                  id="transcribeAudio"
                  checked={config.transcribeAudio ?? true}
                  onChange={(v) => onChange({ ...config, transcribeAudio: v })}
                />
              </div>
            </div>
          </div>

          {/* Transferência Automática para Agentes Especialistas */}
          <div className="space-y-3.5 rounded-xl border bg-muted/15 p-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-semibold text-sm">
                  <Target className="h-4 w-4 text-primary" />
                  <Label htmlFor="enableSpecialistTransfer" className="cursor-pointer font-semibold text-sm">
                    Transferência para Agentes Especialistas
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  A IA Principal transfere a chamada via tool calling apenas para os especialistas adicionados abaixo.
                </p>
              </div>
              <Switch
                id="enableSpecialistTransfer"
                checked={isSpecialistTransferEnabled}
                onChange={(checked) => onChange({ ...config, enableSpecialistTransfer: checked })}
              />
            </div>

            {isSpecialistTransferEnabled && (
              <div className="space-y-3 pt-2 border-t border-border/50 animate-fade-in">
                {/* Add Specialist Button & Selector */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <select
                    className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={selectedAgentToAdd}
                    onChange={(e) => setSelectedAgentToAdd(e.target.value)}
                  >
                    <option value="">-- Selecione um agente especialista para adicionar --</option>
                    {unaddedSpecialists.map((ag) => (
                      <option key={ag.id} value={ag.id}>
                        {ag.name} {ag.description ? `(${ag.description})` : ""}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddSpecialist}
                    disabled={!selectedAgentToAdd}
                    className="h-9 gap-1 text-xs font-semibold px-4"
                  >
                    Adicionar
                  </Button>
                </div>

                {/* Active Specialists List */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Especialistas Autorizados para Transferência ({activeSpecialists.length})
                  </span>
                  {activeSpecialists.length === 0 ? (
                    <div className="p-3 text-center rounded-lg border border-dashed text-xs text-muted-foreground bg-background/50">
                      Nenhum agente especialista adicionado. O robô principal não poderá realizar transferências.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {activeSpecialists.map((ag) => (
                        <div
                          key={ag.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-background/80 shadow-2xs hover:border-primary/40 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-xs truncate text-foreground">{ag.name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveSpecialist(ag.id)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Remover especialista"
                          >
                            <ShieldAlert className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
