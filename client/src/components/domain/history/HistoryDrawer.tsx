import { useState } from "react";
import { History, PhoneIncoming, PhoneOutgoing, Clock, MessageSquare, ExternalLink, Sparkles, Trash2, Calendar } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/shared/EmptyState";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useHistory } from "@/hooks/useHistory";
import { useContactInfo } from "@/hooks/useContactInfo";
import { AudioRecordingPlayer } from "./AudioRecordingPlayer";
import { TranscriptModal } from "./TranscriptModal";
import { SummaryModal } from "./SummaryModal";
import { deleteHistoryCall } from "@/services/history";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import type { HistoryRow } from "@/types/history";
import { formatDuration, getInitials, formatPhoneNumber, getCallStatusDetails } from "@/utils/format";
import { cn } from "@/lib/utils";

export const HistoryItem = ({ sid, row }: { sid: string; row: HistoryRow }) => {
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();

  const { data: contact } = useContactInfo(sid, row.phone);
  const isInbound = row.direction === "inbound";
  const DirIcon = isInbound ? PhoneIncoming : PhoneOutgoing;

  const displayName = row.name || contact?.name || formatPhoneNumber(row.phone);
  const pictureUrl = contact?.pictureUrl;

  const statusDetails = getCallStatusDetails(row.startedAt, row.endedAt, row.endReason, row.direction);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteHistoryCall(sid, row.callId);
      toast.success("Chamada excluída do histórico com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["history", sid] });
      setShowDeleteConfirm(false);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir chamada.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <li className={`flex flex-col justify-between h-full rounded-2xl border p-4 transition-all duration-200 bg-card hover:shadow-md ${statusDetails.cardBorderClass} group relative`}>
        <div className="space-y-3">
          {/* Header Superior: Avatar + Nome + Ação de Exclusão */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {pictureUrl ? (
                <img
                  src={pictureUrl}
                  alt={displayName}
                  className="h-10 w-10 shrink-0 rounded-full object-cover border-2 border-primary/15 shadow-2xs"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs border border-primary/20 shadow-2xs">
                  {getInitials(displayName)}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <h4 className="truncate text-xs sm:text-sm font-bold text-foreground leading-snug group-hover:text-primary transition-colors" title={displayName}>
                  {displayName}
                </h4>
                <p className="text-[11px] text-muted-foreground font-mono truncate mt-0.5">
                  {formatPhoneNumber(row.phone)}
                </p>
              </div>
            </div>

            {/* Lixeira de exclusão no topo */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
              title="Excluir chamada"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Badges de Direção (Entrada/Saída), Status e Duração */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {/* Badge de Direção (Entrada / Saída) */}
            <span className="inline-flex items-center gap-1 rounded-full bg-muted/80 px-2.5 py-0.5 text-[10px] font-semibold text-foreground border border-border/50">
              <DirIcon className={cn("h-3 w-3 shrink-0", isInbound ? "text-emerald-500" : "text-blue-500")} />
              <span>{isInbound ? "Entrada" : "Saída"}</span>
            </span>

            {/* Badge de Status da Chamada */}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold border",
                statusDetails.statusType === "completed"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : statusDetails.statusType === "rejected"
                  ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20"
                  : statusDetails.statusType === "missed"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                  : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full shrink-0",
                  statusDetails.statusType === "completed"
                    ? "bg-emerald-500"
                    : statusDetails.statusType === "rejected"
                    ? "bg-red-500"
                    : statusDetails.statusType === "missed"
                    ? "bg-amber-500"
                    : "bg-blue-500"
                )}
              />
              <span>{statusDetails.badgeText}</span>
            </span>

            {/* Duração */}
            <span className="ml-auto flex items-center gap-1 text-[10px] font-mono font-medium text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-md">
              <Clock className="h-3 w-3 text-muted-foreground/70" />
              {formatDuration(row.startedAt, row.endedAt)}
            </span>
          </div>

          {/* Horário da Chamada */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            <Calendar className="h-3 w-3 text-primary/70 shrink-0" />
            <span>
              {new Date(row.startedAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          {/* Alerta de Chamado Aberto */}
          {row.ticketOpened && (
            <div className="rounded-xl bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-300 border border-amber-500/20 break-words space-y-0.5">
              <span className="font-bold flex items-center gap-1 text-amber-800 dark:text-amber-200">
                ⚠️ Chamado Aberto
              </span>
              <p className="text-[11px] leading-relaxed">{row.ticketReason || "Sem motivo especificado."}</p>
            </div>
          )}

          {/* Player e Ações da Chamada (Apenas se a chamada foi atendida com mídia) */}
          {statusDetails.showMedia && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              {row.recordingUrl && (
                <div className="w-full">
                  <AudioRecordingPlayer recordingUrl={row.recordingUrl} compact={true} />
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all flex-1 sm:flex-initial justify-center cursor-pointer"
                  onClick={() => setShowTranscriptModal(true)}
                >
                  <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>Transcrição</span>
                  <ExternalLink className="h-3 w-3 opacity-60 shrink-0" />
                </Button>

                {row.summary && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-primary/5 transition-all flex-1 sm:flex-initial justify-center cursor-pointer"
                    onClick={() => setShowSummaryModal(true)}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary animate-pulse shrink-0" />
                    <span>Resumo IA</span>
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </li>

      <TranscriptModal
        sid={sid}
        row={row}
        open={showTranscriptModal}
        onOpenChange={setShowTranscriptModal}
        displayName={displayName}
      />

      <SummaryModal
        row={row}
        open={showSummaryModal}
        onOpenChange={setShowSummaryModal}
        displayName={displayName}
      />

      {/* Modal Reutilizável de Confirmação de Exclusão */}
      <ConfirmModal
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Excluir Chamada do Histórico"
        description="Esta ação excluirá permanentemente esta chamada do banco de dados, incluindo gravação de áudio, transcrições e resumos correspondentes."
        confirmText="Sim, Excluir"
        variant="destructive"
        loading={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  );
};

export const HistoryDrawer = ({ sid }: { sid: string }) => {
  const [open, setOpen] = useState(false);
  const { data: rows = [] } = useHistory(sid, open);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <History className="h-4 w-4" />
          History
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        <SheetHeader className="p-6 pb-4">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Histórico de Ligações
          </SheetTitle>
        </SheetHeader>
        <Separator />
        <ScrollArea className="h-[calc(100vh-5.5rem)] px-4 py-4 custom-scrollbar">
          {rows.length === 0 ? (
            <EmptyState title="Nenhuma ligação anterior" description="As chamadas efetuadas ou recebidas aparecerão aqui." />
          ) : (
            <ul className="space-y-3 stagger-children">
              {rows.map((r) => (
                <HistoryItem key={r.callId} sid={sid} row={r} />
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
