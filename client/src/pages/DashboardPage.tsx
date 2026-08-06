import { useEffect, useState, useMemo } from "react";
import {
  Phone,
  PhoneMissed,
  Clock,
  Star,
  ArrowUpRight,
  Ticket,
  Calendar,
  Sparkles,
  FileText,
  PhoneIncoming,
  PhoneOutgoing,
} from "lucide-react";
import { useNavigation } from "@/stores/navigation";
import { useCalls } from "@/stores/calls";
import { useHistory } from "@/hooks/useHistory";
import { getNPSSummary, getAIConfig } from "@/services/ai";
import { parseScheduledCalls } from "@/lib/ai/scheduled-calls";
import type { NPSSummary, ScheduledCall } from "@/types/ai";
import type { HistoryRow } from "@/types/history";
import { AudioRecordingPlayer } from "@/components/domain/history/AudioRecordingPlayer";
import { TranscriptModal } from "@/components/domain/history/TranscriptModal";
import { SummaryModal } from "@/components/domain/history/SummaryModal";
import { Button } from "@/components/ui/button";
import { formatPhoneNumber, formatDuration, isCallMissedOrRejected, isCallAnswered, getCallStatusDetails } from "@/utils/format";
import { cn } from "@/lib/utils";
import { useContactDisplay } from "@/hooks/useContactDisplay";

function formatDurationSecs(secs: number): string {
  if (secs <= 0) return "00:00";
  const mins = Math.floor(secs / 60);
  const remainSecs = Math.floor(secs % 60);
  return `${mins.toString().padStart(2, "0")}:${remainSecs.toString().padStart(2, "0")}`;
}

const DashboardCallItem = ({
  sid,
  r,
  onSelectTranscript,
  onSelectSummary,
}: {
  sid: string;
  r: HistoryRow;
  onSelectTranscript: (row: HistoryRow) => void;
  onSelectSummary: (row: HistoryRow) => void;
}) => {
  const { displayName, formattedPhone, pictureUrl, initials } = useContactDisplay(
    sid,
    r.phone || r.peer,
    r.name
  );
  const isInbound = r.direction === "inbound";
  const DirIcon = isInbound ? PhoneIncoming : PhoneOutgoing;
  const statusDetails = getCallStatusDetails(r.startedAt, r.endedAt, r.endReason, r.direction);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3.5 shadow-2xs hover:border-border/80 transition-all space-y-3">
      {/* Top Row: Contact Info, Badges & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {pictureUrl ? (
            <img
              src={pictureUrl}
              alt={displayName}
              className="h-8 w-8 rounded-full object-cover shrink-0 border shadow-2xs"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs border border-primary/20">
              {initials}
            </div>
          )}
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-xs truncate text-foreground" title={displayName}>
                {displayName}
              </h4>
              {/* Badge discreto de Tipo (Entrada/Saída) no padrão da tabela */}
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-foreground border border-border/50 shrink-0">
                <DirIcon className={cn("h-3 w-3 shrink-0", isInbound ? "text-emerald-500" : "text-blue-500")} />
                {isInbound ? "Entrada" : "Saída"}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
              <span className="font-semibold text-foreground">{formattedPhone || "Sem número"}</span>
              <span className="text-muted-foreground/40">•</span>
              <span>
                {new Date(r.startedAt).toLocaleString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="font-semibold text-foreground/80">{formatDuration(r.startedAt, r.endedAt)}</span>
            </div>
          </div>
        </div>

        {/* Motivo Término & Status Discretos (Padrão da Tabela) */}
        <div className="flex items-center gap-2 self-start sm:self-center shrink-0 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
            {statusDetails.badgeText}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold border",
              statusDetails.badgeClass,
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
            {statusDetails.statusType === "completed" ? "concluído" : "não atendida"}
          </span>
        </div>
      </div>

      {/* Media Controls & Action Buttons (somente se atendida) */}
      {statusDetails.statusType === "completed" && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2 border-t border-border/40">
          {/* Audio Player Compacto */}
          <div className="flex-1 min-w-0">
            {r.recordingUrl ? (
              <AudioRecordingPlayer recordingUrl={r.recordingUrl} compact={true} />
            ) : (
              <span className="text-[11px] text-muted-foreground italic font-medium">Sem gravação de áudio</span>
            )}
          </div>

          {/* Action Buttons: Sobrios, profissionais (lado a lado) */}
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectTranscript(r)}
              className="h-7 px-2.5 text-xs gap-1.5 rounded-lg font-medium border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Ver Transcrição"
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Transcrição</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelectSummary(r)}
              className="h-7 px-2.5 text-xs gap-1.5 rounded-lg font-medium border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Ver Resumo IA"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span>Resumo IA</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export const DashboardPage = ({ sid }: { sid: string }) => {
  const { agentStatus, setAgentStatus, setActiveSection } = useNavigation();
  const activeCallsStore = useCalls((s) => s.calls);
  
  const { data: historyRows = [] } = useHistory(sid, true);
  const [npsData, setNpsData] = useState<NPSSummary | null>(null);
  const [upcomingSchedules, setUpcomingSchedules] = useState<ScheduledCall[]>([]);
  const [selectedTranscriptRow, setSelectedTranscriptRow] = useState<HistoryRow | null>(null);
  const [selectedSummaryRow, setSelectedSummaryRow] = useState<HistoryRow | null>(null);

  // Busca dados de NPS e Agendamentos
  useEffect(() => {
    if (!sid) return;
    getNPSSummary(sid)
      .then((r) => setNpsData(r.summary))
      .catch(() => {});

    getAIConfig(sid)
      .then((r) => {
        if (r.aiConfig?.scheduledCalls) {
          const all = parseScheduledCalls(r.aiConfig.scheduledCalls);
          const pending = all
            .filter((s) => s.active && new Date(s.time) > new Date())
            .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
          setUpcomingSchedules(pending);
        }
      })
      .catch(() => {});
  }, [sid]);

  // Cálculos de Estatísticas Reais baseados no Histórico (Memoizados)
  const todayStr = useMemo(() => new Date().toDateString(), []);
  
  const todayHistory = useMemo(() => {
    return historyRows.filter(
      (r) => new Date(r.startedAt).toDateString() === todayStr,
    );
  }, [historyRows, todayStr]);
  
  const todayCallsCount = todayHistory.length;
  
  const answeredCalls = useMemo(() => {
    return todayHistory.filter((r) => isCallAnswered(r.startedAt, r.endedAt, r.endReason));
  }, [todayHistory]);

  const missedCallsCount = useMemo(() => {
    return todayHistory.filter((r) => isCallMissedOrRejected(r.startedAt, r.endedAt, r.endReason)).length;
  }, [todayHistory]);

  const totalSecsAnswered = useMemo(() => {
    return answeredCalls.reduce(
      (acc, r) => acc + Math.floor(((r.endedAt ?? r.startedAt) - r.startedAt) / 1000),
      0,
    );
  }, [answeredCalls]);
  
  const avgDurationSecs = useMemo(() => {
    return answeredCalls.length > 0 ? Math.round(totalSecsAnswered / answeredCalls.length) : 0;
  }, [answeredCalls, totalSecsAnswered]);
  
  const openTicketsCount = useMemo(() => {
    return todayHistory.filter((r) => r.ticketOpened).length;
  }, [todayHistory]);
  
  const activeRealtimeCalls = useMemo(() => {
    return activeCallsStore.filter((c) => c.sessionId === sid && c.status !== "ended");
  }, [activeCallsStore, sid]);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Top Banner & Status Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-card p-5 shadow-xs">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Painel do Agente</h1>
            {activeRealtimeCalls.length > 0 && (
              <span className="rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold px-2.5 py-0.5 animate-pulse">
                {activeRealtimeCalls.length} {activeRealtimeCalls.length === 1 ? "chamada em andamento" : "chamadas em andamento"}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Visão geral do seu atendimento PABX e performance de IA em tempo real</p>
        </div>

        {/* Status Selector Pills */}
        <div className="flex items-center gap-1.5 rounded-xl border bg-muted/40 p-1">
          <button
            onClick={() => setAgentStatus("available")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              agentStatus === "available"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Disponível</span>
          </button>

          <button
            onClick={() => setAgentStatus("busy")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              agentStatus === "busy"
                ? "bg-red-500/15 text-red-600 dark:text-red-400 shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span>Ocupado</span>
          </button>

          <button
            onClick={() => setAgentStatus("paused")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all",
              agentStatus === "paused"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 shadow-xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Em Pausa</span>
          </button>
        </div>
      </div>

      {/* Real-time KPI Metrics Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {/* Chamadas Hoje */}
        <div className="rounded-2xl border bg-card p-4.5 shadow-xs transition-all hover:shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Chamadas Hoje</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Phone className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{todayCallsCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium">
            {answeredCalls.length} atendidas / {todayCallsCount - answeredCalls.length} sem resposta
          </p>
        </div>

        {/* Perdidas / Rejeitadas */}
        <div className="rounded-2xl border bg-card p-4.5 shadow-xs transition-all hover:shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Perdidas / Rejeitadas</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
              <PhoneMissed className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-red-500">{missedCallsCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium">
            {todayCallsCount > 0 ? `${Math.round((missedCallsCount / todayCallsCount) * 100)}% de não atendimentos` : "Sem perdas hoje"}
          </p>
        </div>

        {/* Duração Média (TMA) */}
        <div className="rounded-2xl border bg-card p-4.5 shadow-xs transition-all hover:shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Duração Média</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
              <Clock className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-foreground">{formatDurationSecs(avgDurationSecs)}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Tempo médio de atendimento (TMA)</p>
        </div>

        {/* NPS Score */}
        <div className="rounded-2xl border bg-card p-4.5 shadow-xs transition-all hover:shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">NPS Score</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Star className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-amber-500">
            {npsData && npsData.total > 0 ? `${Math.round(npsData.npsScore)}%` : "N/A"}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium">
            {npsData && npsData.total > 0 ? `${npsData.total} avaliações recebidas` : "Aguardando pesquisas"}
          </p>
        </div>

        {/* Chamados Abertos */}
        <div className="rounded-2xl border bg-card p-4.5 shadow-xs transition-all hover:shadow-md space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground">Chamados Abertos</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500">
              <Ticket className="h-4 w-4" />
            </span>
          </div>
          <p className="text-2xl font-extrabold text-orange-500">{openTicketsCount}</p>
          <p className="text-[10px] text-muted-foreground font-medium">Transbordo para suporte humano</p>
        </div>
      </div>

      {/* Main Grid: Recent Calls List & Right Sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 cols: Últimas Chamadas Realizadas */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span>Últimos Atendimentos Realizados</span>
            </h3>

            <button
              onClick={() => setActiveSection("calls")}
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <span>Ver Histórico Completo</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {historyRows.length === 0 ? (
            <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground space-y-2">
              <Phone className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="text-xs font-semibold">Nenhuma chamada registrada recentemente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {historyRows.slice(0, 5).map((r) => (
                <DashboardCallItem
                  key={r.callId}
                  sid={sid}
                  r={r}
                  onSelectTranscript={setSelectedTranscriptRow}
                  onSelectSummary={setSelectedSummaryRow}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right 4 cols: Upcoming IA Schedules */}
        <div className="lg:col-span-4 space-y-5">

          {/* Próximos Agendamentos da IA */}
          <div className="rounded-2xl border bg-card p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                <span>Próximos Agendamentos IA</span>
              </h3>
              <button
                onClick={() => setActiveSection("schedules")}
                className="text-xs font-semibold text-primary hover:underline"
              >
                <span>Ver Todos</span>
              </button>
            </div>

            {upcomingSchedules.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground space-y-1">
                <Sparkles className="h-4 w-4 text-amber-500 mx-auto" />
                <p className="font-medium">Nenhum agendamento pendente.</p>
                <p className="text-[10px]">A IA agendará automaticamente quando solicitado pelos clientes.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {upcomingSchedules.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-xl border bg-amber-500/5 p-3 space-y-1 text-xs">
                    <div className="flex items-center justify-between font-bold">
                      <span className="font-mono text-foreground">{formatPhoneNumber(item.phone)}</span>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400">
                        {new Date(item.time).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {item.prompt && <p className="text-[11px] text-muted-foreground truncate">{item.prompt}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Transcrição Completa */}
      {selectedTranscriptRow && (
        <TranscriptModal
          sid={sid}
          row={selectedTranscriptRow}
          open={!!selectedTranscriptRow}
          onOpenChange={(open) => !open && setSelectedTranscriptRow(null)}
          displayName={selectedTranscriptRow.name || formatPhoneNumber(selectedTranscriptRow.phone)}
        />
      )}

      {/* Modal de Resumo IA */}
      {selectedSummaryRow && (
        <SummaryModal
          row={selectedSummaryRow}
          open={!!selectedSummaryRow}
          onOpenChange={(open) => !open && setSelectedSummaryRow(null)}
          displayName={selectedSummaryRow.name || formatPhoneNumber(selectedSummaryRow.phone)}
        />
      )}
    </div>
  );
};
