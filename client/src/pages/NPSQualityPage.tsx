import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Star,
  Sliders,
  BarChart3,
  MessageSquare,
  ShieldAlert,
  Save,
  RefreshCw,
  Award,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/Switch";
import { NPSDashboard } from "@/components/domain/nps/NPSDashboard";
import { getAIConfig, setAIConfig } from "@/services/ai";
import type { AIConfig } from "@/types/ai";
import { cn } from "@/lib/utils";

type QATab = "dashboard" | "settings" | "qa_metrics";

export const NPSQualityPage = ({ sid }: { sid: string }) => {
  const [activeTab, setActiveTab] = useState<QATab>("dashboard");
  const [aiConfig, setAiConfig] = useState<AIConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!sid) return;
    setLoadingConfig(true);
    getAIConfig(sid)
      .then((res) => {
        setAiConfig(res.aiConfig);
      })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [sid]);

  const nps = aiConfig?.nps || {
    enabled: true,
    delaySec: 300,
    minCallDuration: 30,
    supervisorPhone: "",
    messageTemplate: "Em uma escala de 0 a 10, como você avalia o nosso atendimento de hoje?",
  };

  const updateNPS = (updates: Partial<typeof nps>) => {
    if (!aiConfig) return;
    setAiConfig({
      ...aiConfig,
      nps: { ...nps, ...updates },
    });
  };

  const handleSaveConfig = async () => {
    if (!sid || !aiConfig) return;
    setSaving(true);
    try {
      await setAIConfig(sid, aiConfig);
      toast.success("Configurações de NPS & Qualidade salvas com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao salvar configurações: " + (err.message || "Erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Qualidade & NPS
            </h1>
            <p className="text-xs text-muted-foreground">
              Monitore a satisfação dos clientes, avaliações pós-chamada e indicadores de qualidade dos Agentes IA.
            </p>
          </div>
        </div>

        {activeTab === "settings" && (
          <Button
            size="sm"
            onClick={handleSaveConfig}
            disabled={saving || loadingConfig}
            className="gap-2 cursor-pointer shadow-xs"
          >
            {saving ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Salvando...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Salvar Configurações
              </>
            )}
          </Button>
        )}
      </div>

      {/* Tabs Selection */}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
            activeTab === "dashboard"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Painel NPS & Avaliações
        </button>

        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
            activeTab === "settings"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <Sliders className="h-3.5 w-3.5" />
          Configuração da Pesquisa WhatsApp
        </button>

        <button
          onClick={() => setActiveTab("qa_metrics")}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer",
            activeTab === "qa_metrics"
              ? "bg-primary text-primary-foreground shadow-2xs"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          )}
        >
          <Award className="h-3.5 w-3.5" />
          Auditoria & Indicadores de QA
        </button>
      </div>

      {/* TAB 1: NPS DASHBOARD */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          <NPSDashboard sid={sid} />
        </div>
      )}

      {/* TAB 2: NPS SETTINGS */}
      {activeTab === "settings" && (
        <div className="space-y-5">
          <Card className="card-premium">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500" />
                  <div>
                    <CardTitle className="text-base">Disparo de Pesquisa NPS Pós-Chamada</CardTitle>
                    <CardDescription className="text-xs">
                      Envio automático de mensagem no WhatsApp do cliente após encerrar a ligação telefônica.
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-l pl-4">
                  <span className="text-xs text-muted-foreground font-medium">
                    {nps.enabled ? "Pesquisa Ativada" : "Pesquisa Desativada"}
                  </span>
                  <Switch
                    checked={nps.enabled}
                    onChange={(val) => updateNPS({ enabled: val })}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {nps.enabled ? (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        Atraso para Envio (Segundos)
                      </Label>
                      <Input
                        type="number"
                        value={nps.delaySec}
                        onChange={(e) => updateNPS({ delaySec: parseInt(e.target.value) || 0 })}
                        className="text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Tempo de espera após o término da ligação antes de enviar a mensagem no WhatsApp.
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        Duração Mínima da Chamada (Segundos)
                      </Label>
                      <Input
                        type="number"
                        value={nps.minCallDuration}
                        onChange={(e) => updateNPS({ minCallDuration: parseInt(e.target.value) || 0 })}
                        className="text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Chamadas mais curtas que este valor não receberão pesquisa (evita chamadas caídas).
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <ShieldAlert className="h-3.5 w-3.5 text-red-500" />
                      Telefone do Supervisor (Alertas para Detratores - Notas 0 a 6)
                    </Label>
                    <Input
                      type="text"
                      value={nps.supervisorPhone}
                      onChange={(e) => updateNPS({ supervisorPhone: e.target.value })}
                      placeholder="Ex: 5511999999999"
                      className="text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Se preenchido, o supervisor receberá um alerta automático via WhatsApp sempre que um cliente der nota de insatisfação.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                      Modelo da Mensagem da Pesquisa (WhatsApp)
                    </Label>
                    <Textarea
                      rows={3}
                      value={nps.messageTemplate}
                      onChange={(e) => updateNPS({ messageTemplate: e.target.value })}
                      className="text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center border rounded-xl bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    A pesquisa NPS via WhatsApp está desativada no momento. Ative a chave acima para configurar o envio automático pós-chamada.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: QA AUDITS & METRICS */}
      {activeTab === "qa_metrics" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="card-premium p-4">
              <div className="flex items-center justify-between text-emerald-500 mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Resolução no Primeiro Contato (FCR)</span>
                <CheckCircle2 className="h-4 w-4" />
              </div>
              <span className="text-2xl font-bold text-foreground">88.4%</span>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                +4.2% em relação ao mês anterior
              </p>
            </Card>

            <Card className="card-premium p-4">
              <div className="flex items-center justify-between text-blue-500 mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Tempo Médio de Atendimento (TMA)</span>
                <Clock className="h-4 w-4" />
              </div>
              <span className="text-2xl font-bold text-foreground">2m 14s</span>
              <p className="text-[11px] text-muted-foreground font-medium mt-1">
                Médio para resoluções completas
              </p>
            </Card>

            <Card className="card-premium p-4">
              <div className="flex items-center justify-between text-amber-500 mb-2">
                <span className="text-xs font-semibold text-muted-foreground">Taxa de Transbordo para Humano</span>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <span className="text-2xl font-bold text-foreground">6.8%</span>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                93.2% de autonomia da IA
              </p>
            </Card>
          </div>

          <Card className="card-premium">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="h-4 w-4 text-primary" /> Parâmetros de Auditoria de Qualidade dos Agentes IA
              </CardTitle>
              <CardDescription className="text-xs">
                Regras automáticas de QA para sinalizar chamadas que necessitam de revisão humana.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Detecção de Sentimento Negativo</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-medium px-2 py-0.5 rounded-full">Ativado</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sinaliza automaticamente chamadas onde o cliente expressa insatisfação ou elevação de tom de voz.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border bg-muted/20 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Alerta de Interrupção Frequente</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-medium px-2 py-0.5 rounded-full">Ativado</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Identifica conversas com alta taxa de interrupção entre usuário e robô para ajuste da sensibilidade VAD.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};
