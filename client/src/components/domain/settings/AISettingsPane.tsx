import { useState, useEffect } from "react";
import { Sparkles, Target, Bot, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { AIConfig } from "@/types/ai";
import { Switch } from "@/components/ui/Switch";
import { listAgents, type Agent } from "@/services/agents";

interface AISettingsPaneProps {
  config: AIConfig;
  onChange: (cfg: AIConfig) => void;
  enabled: boolean;
  sid?: string;
}

export const AISettingsPane = ({ config, onChange, enabled, sid }: AISettingsPaneProps) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentToAdd, setSelectedAgentToAdd] = useState<string>("");
  const isFirstUtteranceActive = !!(config.firstUtterance && config.firstUtterance.trim() !== "");
  const isSpecialistTransferEnabled = config.enableSpecialistTransfer ?? true;

  useEffect(() => {
    if (sid) {
      listAgents(sid).then((res) => {
        setAgents(res);
        // Se ainda não houver filtro definido (undefined), inicializa com todos os especialistas disponíveis
        if (config.allowedSpecialistIds === undefined) {
          const defaultSpecIds = res.filter((a) => !a.inbound && !a.outbound).map((a) => a.id);
          onChange({ ...config, allowedSpecialistIds: defaultSpecIds });
        }
      }).catch(() => {});
    }
  }, [sid]);

  // Todos os agentes especialistas da conexão (que não são Principal Inbound/Outbound)
  const availableSpecialists = agents.filter((a) => !a.inbound && !a.outbound);

  // Lista dos IDs atualmente selecionados/permitidos para transferência
  const allowedIds = config.allowedSpecialistIds || [];

  // Agentes que o usuário efetivamente adicionou para a transferência
  const activeSpecialists = availableSpecialists.filter((a) => allowedIds.includes(a.id));

  // Agentes ainda não adicionados
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

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Status indicator */}
      <div className="flex items-center gap-2 px-1">
        <Sparkles className="h-4 w-4 text-warning-text fill-warning/20" />
        <span className="text-sm font-medium">
          Integração de Voz IA (Gemini Live)
        </span>
        <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
          enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        }`}>
          {enabled ? "Ativa" : "Inativa"}
        </span>
      </div>

      {/* API Key */}
      <Card className="card-premium">
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="apiKey">Gemini API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="Insira sua chave de API Gemini Live"
              value={config.geminiApiKey}
              onChange={(e) => onChange({ ...config, geminiApiKey: e.target.value })}
            />
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
                <option value="Puck">Puck (Masculina suave)</option>
                <option value="Charon">Charon (Masculina grave)</option>
                <option value="Kore">Kore (Feminina jovem)</option>
                <option value="Fenrir">Fenrir (Masculina firme)</option>
                <option value="Aoede">Aoede (Feminina expressiva)</option>
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
                <option value="pt-BR">Português (pt-BR)</option>
                <option value="en-US">Inglês (en-US)</option>
                <option value="es-ES">Espanhol (es-ES)</option>
              </select>
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
                    className="h-9 gap-1.5 text-xs rounded-md shrink-0"
                    disabled={!selectedAgentToAdd}
                    onClick={handleAddSpecialist}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Adicionar Especialista</span>
                  </Button>
                </div>

                {availableSpecialists.length === 0 && (
                  <div className="rounded-lg border border-dashed bg-background/60 p-3.5 text-center space-y-1">
                    <p className="text-xs text-muted-foreground">
                      Nenhum agente especialista encontrado nesta conexão.
                    </p>
                    <p className="text-[11px] text-muted-foreground/80">
                      Crie agentes com descrições específicas na aba <strong>"Agentes IA"</strong> para adicioná-los aqui.
                    </p>
                  </div>
                )}

                {activeSpecialists.length === 0 && availableSpecialists.length > 0 && (
                  <div className="rounded-lg border border-dashed bg-background/60 p-3.5 text-center space-y-1">
                    <p className="text-xs text-muted-foreground font-semibold">
                      Nenhum especialista ativado para esta conexão.
                    </p>
                    <p className="text-[11px] text-muted-foreground/80">
                      Selecione um agente no menu acima e clique em <strong>"Adicionar Especialista"</strong>.
                    </p>
                  </div>
                )}

                {activeSpecialists.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">
                      Especialistas Ativos para Transferência ({activeSpecialists.length})
                    </p>
                    {activeSpecialists.map((ag) => (
                      <div key={ag.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card text-xs shadow-2xs">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 font-bold mt-0.5">
                            <Bot className="h-4 w-4" />
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground truncate">{ag.name}</span>
                              <span className="bg-primary/10 text-primary text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                                Ativo
                              </span>
                            </div>
                            <p className="text-muted-foreground text-[11px] line-clamp-2">
                              {ag.description || "Sem descrição (edite o agente na aba 'Agentes IA' para definir sua especialidade)."}
                            </p>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive/10"
                          onClick={() => handleRemoveSpecialist(ag.id)}
                          title="Remover especialista das regras de transferência"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* First Utterance Toggle */}
          <div className="space-y-3 rounded-xl border bg-muted/20 p-3.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="firstUtteranceToggle" className="text-sm font-medium cursor-pointer">
                  IA fala primeiro ao atender
                </Label>
                <p className="text-xs text-muted-foreground">
                  Se ativado, a IA iniciará a conversa com uma saudação. Se desativado, a IA aguardará a pessoa falar primeiro.
                </p>
              </div>
              <Switch
                id="firstUtteranceToggle"
                checked={isFirstUtteranceActive}
                onChange={(checked) => {
                  if (checked) {
                    onChange({
                      ...config,
                      firstUtterance: config.firstUtterance || "Alô? Boa tarde, sou a assistente virtual e estou ligando...",
                    });
                  } else {
                    onChange({ ...config, firstUtterance: "" });
                  }
                }}
              />
            </div>

            {isFirstUtteranceActive && (
              <div className="space-y-1.5 pt-2 border-t border-border/50 animate-fade-in">
                <Label htmlFor="firstUtteranceText" className="text-xs font-semibold text-muted-foreground">
                  Mensagem da Primeira Fala
                </Label>
                <textarea
                  id="firstUtteranceText"
                  rows={2}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder="Ex: Alô? Boa tarde, sou a assistente virtual e estou ligando..."
                  value={config.firstUtterance}
                  onChange={(e) => onChange({ ...config, firstUtterance: e.target.value })}
                />
              </div>
            )}
          </div>

          {/* Temperature & Duration */}
          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="space-y-1.5">
              <Label htmlFor="temp">Temperatura ({config.temperature ?? 1.0})</Label>
              <input
                id="temp"
                type="range"
                min="0.2"
                max="1.8"
                step="0.1"
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                value={config.temperature ?? 1.0}
                onChange={(e) => onChange({ ...config, temperature: parseFloat(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="duration">Duração Máxima (Minutos)</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                max="60"
                value={config.maxDurationMin ?? 15}
                onChange={(e) => onChange({ ...config, maxDurationMin: parseInt(e.target.value) || 15 })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toggles */}
      <Card className="card-premium">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground">
            Comportamento
          </h3>
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium cursor-pointer" htmlFor="serverSideAI">IA Autônoma no Servidor</Label>
                <p className="text-xs text-muted-foreground">O servidor gerencia IA e agendamentos sem necessidade do navegador aberto</p>
              </div>
              <Switch id="serverSideAI" checked={config.serverSideAI} onChange={(v) => onChange({ ...config, serverSideAI: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium cursor-pointer" htmlFor="autoAnswer">Atendimento Automático</Label>
                <p className="text-xs text-muted-foreground">Atender ligações de voz recebidas pela IA</p>
              </div>
              <Switch id="autoAnswer" checked={config.autoAnswer} onChange={(v) => onChange({ ...config, autoAnswer: v })} />
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
                  onChange={(e) => onChange({ ...config, autoAnswerDelay: parseInt(e.target.value) })}
                  className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary focus:outline-none"
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium cursor-pointer" htmlFor="silenceOperator">Modo Silencioso do Operador</Label>
                <p className="text-xs text-muted-foreground">Mutar reprodução de áudio no seu navegador</p>
              </div>
              <Switch id="silenceOperator" checked={config.silenceOperator} onChange={(v) => onChange({ ...config, silenceOperator: v })} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium cursor-pointer" htmlFor="transcribeAudio">Transcrição em Tempo Real</Label>
                <p className="text-xs text-muted-foreground">Transcrever diálogos de áudio em texto</p>
              </div>
              <Switch id="transcribeAudio" checked={config.transcribeAudio} onChange={(v) => onChange({ ...config, transcribeAudio: v })} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
