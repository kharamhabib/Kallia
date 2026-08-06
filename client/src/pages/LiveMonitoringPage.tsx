import { useState, useEffect } from "react";
import {
  Headphones,
  Radio,
  PhoneCall,
  PhoneOff,
  Mic,
  Volume2,
  Activity,
  Bot,
  RefreshCw,
  Signal,
  MessageSquare,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useSessions } from "@/stores/sessions";
import { cn } from "@/lib/utils";

interface ActiveCallMonitor {
  id: string;
  phone: string;
  clientName: string;
  agentName: string;
  startedAt: string;
  durationSec: number;
  status: "in_progress" | "connecting" | "ai_speaking" | "user_speaking";
  transcriptLive: { sender: "user" | "ai"; text: string; time: string }[];
  audioLevel: number; // 0-100 para animação de áudio
  sentiment: "positivo" | "neutro" | "atencao";
}

const mockActiveCalls: ActiveCallMonitor[] = [
  {
    id: "call-live-101",
    phone: "5511988776655",
    clientName: "Carlos Eduardo Silva",
    agentName: "Agente Vendas Principais",
    startedAt: "14:22:10",
    durationSec: 145,
    status: "ai_speaking",
    sentiment: "positivo",
    audioLevel: 78,
    transcriptLive: [
      { sender: "ai", text: "Olá Carlos! Vi que você se cadastrou no nosso site. Como posso ajudar?", time: "14:22:12" },
      { sender: "user", text: "Gostaria de saber os valores do plano mensal de voz.", time: "14:22:25" },
      { sender: "ai", text: "Com certeza! O plano Pro inclui 1.000 minutos de voz com IA por R$ 299/mês.", time: "14:22:40" },
    ],
  },
  {
    id: "call-live-102",
    phone: "5521977665544",
    clientName: "Mariana Oliveira",
    agentName: "Suporte Nível 1",
    startedAt: "14:23:45",
    durationSec: 50,
    status: "user_speaking",
    sentiment: "atencao",
    audioLevel: 45,
    transcriptLive: [
      { sender: "ai", text: "Suporte Kallia, boa tarde! Qual a sua dúvida sobre a integração?", time: "14:23:48" },
      { sender: "user", text: "Meu webhook está retornando erro 401 ao autenticar.", time: "14:24:02" },
    ],
  },
];

export const LiveMonitoringPage = ({ sid }: { sid: string }) => {
  const sessions = useSessions((s) => s.sessions);
  const activeSession = sessions.find((s) => s.id === sid);

  const [activeCalls, setActiveCalls] = useState<ActiveCallMonitor[]>(mockActiveCalls);
  const [selectedCall, setSelectedCall] = useState<ActiveCallMonitor | null>(null);
  const [listeningCallId, setListeningCallId] = useState<string | null>(null);
  const [interveningCallId, setInterveningCallId] = useState<string | null>(null);

  // Efeito simulador de contador de segundos e animação de áudio em tempo real
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveCalls((prev) =>
        prev.map((c) => ({
          ...c,
          durationSec: c.durationSec + 1,
          audioLevel: Math.floor(Math.random() * 60) + 20,
        }))
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleListenIn = (call: ActiveCallMonitor) => {
    if (listeningCallId === call.id) {
      setListeningCallId(null);
      toast.info(`Escuta silenciosa finalizada.`);
    } else {
      setListeningCallId(call.id);
      setInterveningCallId(null);
      toast.success(`Iniciada escuta silenciosa da chamada com ${call.clientName}.`);
    }
  };

  const handleIntervene = (call: ActiveCallMonitor) => {
    if (interveningCallId === call.id) {
      setInterveningCallId(null);
      toast.info(`Operador saiu da chamada. IA retomando atendimento.`);
    } else {
      setInterveningCallId(call.id);
      setListeningCallId(null);
      toast.warning(`Você assumiu a chamada com ${call.clientName}! O Agente IA foi pausado.`);
    }
  };

  const handleHangupCall = (callId: string, clientName: string) => {
    setActiveCalls((prev) => prev.filter((c) => c.id !== callId));
    if (selectedCall?.id === callId) setSelectedCall(null);
    toast.error(`Chamada com ${clientName} encerrada.`);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary relative">
            <Radio className="h-6 w-6 animate-pulse" />
            <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background animate-ping" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Monitoramento ao Vivo
              </h1>
              <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Signal className="h-3 w-3" /> STREAM LIVE
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Acompanhe ligações em andamento, escute áudios ao vivo, veja transcrições instantâneas e intervenha quando necessário.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => toast.success("Lista de monitoramento atualizada.")}
            className="gap-2 text-xs cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </Button>
        </div>
      </div>

      {/* Realtime Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="card-premium p-4 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Chamadas em Andamento</span>
            <PhoneCall className="h-4 w-4 text-emerald-500 animate-bounce" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">{activeCalls.length}</span>
            <span className="text-xs text-emerald-600 font-semibold">ao vivo</span>
          </div>
        </Card>

        <Card className="card-premium p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Agentes IA Livres</span>
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">3</span>
            <span className="text-xs text-muted-foreground">de 4 ativos</span>
          </div>
        </Card>

        <Card className="card-premium p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Operadores em Escuta</span>
            <Headphones className="h-4 w-4 text-purple-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">{listeningCallId || interveningCallId ? 1 : 0}</span>
            <span className="text-xs text-muted-foreground">supervisores</span>
          </div>
        </Card>

        <Card className="card-premium p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Latência Webphone</span>
            <Activity className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold">120ms</span>
            <span className="text-xs text-emerald-600 font-semibold">Excelente</span>
          </div>
        </Card>
      </div>

      {/* Main Monitoring Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Ligações em Execução Agora ({activeCalls.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Sessão Ativa: <strong>{activeSession?.name || "Kallia Default"}</strong>
          </span>
        </div>

        {activeCalls.length === 0 ? (
          <Card className="p-12 text-center card-premium">
            <PhoneOff className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="text-sm font-semibold">Nenhuma chamada ativa no momento</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Assim que uma ligação for efetuada ou recebida via WhatsApp/Webphone, ela aparecerá aqui em tempo real.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {activeCalls.map((call) => {
              const isListening = listeningCallId === call.id;
              const isIntervening = interveningCallId === call.id;

              return (
                <Card
                  key={call.id}
                  className={cn(
                    "card-premium border-2 transition-all duration-200 relative overflow-hidden",
                    isIntervening
                      ? "border-amber-500 bg-amber-500/5"
                      : isListening
                      ? "border-purple-500 bg-purple-500/5"
                      : "border-border/60 hover:border-primary/40"
                  )}
                >
                  {/* Top Live Bar */}
                  <div className="bg-muted/40 px-4 py-2 flex items-center justify-between border-b text-xs">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                      </span>
                      <span className="font-bold text-foreground">{formatDuration(call.durationSec)}</span>
                      <span className="text-[10px] text-muted-foreground">Iniciada às {call.startedAt}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {call.sentiment === "positivo" && (
                        <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold px-2 py-0.5 rounded-full">
                          Sentimento Bom
                        </span>
                      )}
                      {call.sentiment === "atencao" && (
                        <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold px-2 py-0.5 rounded-full">
                          Atenção
                        </span>
                      )}
                    </div>
                  </div>

                  <CardContent className="p-5 space-y-4">
                    {/* Participant Details */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-primary shrink-0" />
                          <h4 className="text-sm font-bold text-foreground truncate">{call.clientName}</h4>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">+{call.phone}</p>
                      </div>

                      <div className="text-right space-y-1">
                        <div className="flex items-center gap-1.5 justify-end">
                          <Bot className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-semibold text-foreground">{call.agentName}</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">Atendimento IA</p>
                      </div>
                    </div>

                    {/* Live Audio Visualizer Waveform */}
                    <div className="rounded-xl border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                          <Volume2 className="h-3.5 w-3.5 text-primary" />
                          Forma de Onda de Áudio (Live Stream)
                        </span>
                        <span className="text-[10px] font-mono text-primary font-bold">
                          {call.status === "ai_speaking" ? "IA Falando..." : "Cliente Falando..."}
                        </span>
                      </div>

                      {/* Animated Audio Bars */}
                      <div className="flex items-center justify-center gap-1 h-8 bg-muted/30 rounded-lg px-3 overflow-hidden">
                        {Array.from({ length: 28 }).map((_, idx) => {
                          const height = Math.max(15, (call.audioLevel * (idx % 5 + 1)) % 100);
                          return (
                            <div
                              key={idx}
                              style={{ height: `${height}%` }}
                              className={cn(
                                "w-1 rounded-full transition-all duration-150",
                                call.status === "ai_speaking" ? "bg-primary" : "bg-emerald-500"
                              )}
                            />
                          );
                        })}
                      </div>
                    </div>

                    {/* Live Transcript Preview */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 text-primary" /> Transcrição Instantânea
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedCall(call)}
                          className="h-6 text-[10px] text-primary"
                        >
                          Ver Histórico Completo
                        </Button>
                      </div>

                      <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                        {call.transcriptLive.map((t, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "p-2 rounded-lg text-xs leading-relaxed",
                              t.sender === "ai"
                                ? "bg-primary/10 text-primary-foreground/90 border border-primary/20"
                                : "bg-muted/40 text-foreground border border-border/40"
                            )}
                          >
                            <span className="font-bold text-[10px] mr-1.5 opacity-70 uppercase">
                              {t.sender === "ai" ? "IA" : "Cliente"}:
                            </span>
                            {t.text}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant={isListening ? "default" : "outline"}
                        onClick={() => handleListenIn(call)}
                        className={cn(
                          "text-xs gap-1.5 cursor-pointer",
                          isListening && "bg-purple-600 hover:bg-purple-700 text-white"
                        )}
                      >
                        <Headphones className="h-3.5 w-3.5" />
                        {isListening ? "Ouvindo..." : "Escuta Muta"}
                      </Button>

                      <Button
                        size="sm"
                        variant={isIntervening ? "default" : "outline"}
                        onClick={() => handleIntervene(call)}
                        className={cn(
                          "text-xs gap-1.5 cursor-pointer",
                          isIntervening && "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
                        )}
                      >
                        <Mic className="h-3.5 w-3.5" />
                        {isIntervening ? "Assumido!" : "Intervir / Falar"}
                      </Button>

                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleHangupCall(call.id, call.clientName)}
                        className="text-xs gap-1.5 cursor-pointer"
                      >
                        <PhoneOff className="h-3.5 w-3.5" /> Desligar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Transcript Detail Dialog */}
      <Dialog open={!!selectedCall} onOpenChange={() => setSelectedCall(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              Transcrição ao Vivo: {selectedCall?.clientName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Telefone: +{selectedCall?.phone} | Agente: {selectedCall?.agentName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto p-2 border rounded-xl bg-card">
            {selectedCall?.transcriptLive.map((t, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-3 rounded-xl text-xs space-y-1",
                  t.sender === "ai"
                    ? "bg-primary/10 border border-primary/20 text-foreground ml-6"
                    : "bg-muted/40 border border-border/50 text-foreground mr-6"
                )}
              >
                <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                  <span>{t.sender === "ai" ? "AGENTE IA" : "CLIENTE"}</span>
                  <span>{t.time}</span>
                </div>
                <p className="text-xs font-medium leading-relaxed">{t.text}</p>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setSelectedCall(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
