import { useState } from "react";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneOff,
  PhoneMissed,
  Smartphone,
  FileText,
  Sparkles,
  Trash2,
  Filter,
  Calendar as CalendarIcon,
  Search,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { HistoryRow } from "@/types/history";
import { formatDuration, formatPhoneNumber, getCallStatusDetails } from "@/utils/format";
import { useContactDisplay } from "@/hooks/useContactDisplay";
import { AudioRecordingPlayer } from "./AudioRecordingPlayer";
import { TranscriptModal } from "./TranscriptModal";
import { SummaryModal } from "./SummaryModal";
import { deleteHistoryCall } from "@/services/history";
import { cn } from "@/lib/utils";

interface HistoryTableProps {
  sid: string;
  rows: HistoryRow[];
}

const EndReasonBadge = ({
  label,
  statusType,
}: {
  label: string;
  statusType: string;
}) => {
  if (label.includes("IA")) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 px-2 py-0.5 text-[10px] font-semibold text-purple-600 dark:text-purple-400">
        <Sparkles className="h-3 w-3 shrink-0 text-purple-500" />
        {label}
      </span>
    );
  }
  if (statusType === "rejected" || label.toLowerCase().includes("recusada")) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
        <PhoneOff className="h-3 w-3 shrink-0 text-red-500" />
        {label}
      </span>
    );
  }
  if (
    statusType === "missed" ||
    label.includes("Não atendeu") ||
    label.includes("Cancelada") ||
    label.includes("limite") ||
    label.includes("ocupada")
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
        <PhoneMissed className="h-3 w-3 shrink-0 text-amber-500" />
        {label}
      </span>
    );
  }
  if (statusType === "accepted_elsewhere" || label.includes("outro aparelho")) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
        <Smartphone className="h-3 w-3 shrink-0 text-blue-500" />
        {label}
      </span>
    );
  }

  // Padrão: Desligado pelo cliente, Desligado pelo operador, Concluída normalmente
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 border border-border px-2 py-0.5 text-[10px] font-medium text-foreground">
      <PhoneOff className="h-3 w-3 shrink-0 text-muted-foreground" />
      {label}
    </span>
  );
};

const HistoryTableRow = ({
  sid,
  r,
  onSelectTranscript,
  onSelectSummary,
  onDelete,
}: {
  sid: string;
  r: HistoryRow;
  onSelectTranscript: (row: HistoryRow) => void;
  onSelectSummary: (row: HistoryRow) => void;
  onDelete: (row: HistoryRow) => void;
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
    <tr className="hover:bg-muted/40 transition-colors group">
      {/* HORÁRIO */}
      <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
        {new Date(r.startedAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })}
      </td>

      {/* CONTATO DO WHATSAPP */}
      <td className="py-3 px-4 whitespace-nowrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {pictureUrl ? (
            <img
              src={pictureUrl}
              alt={displayName}
              className="h-7 w-7 rounded-full object-cover shrink-0 border shadow-2xs"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-[10px] shrink-0 border border-primary/20">
              {initials}
            </div>
          )}
          <span className="text-xs font-bold text-foreground truncate max-w-[150px]" title={displayName}>
            {displayName}
          </span>
        </div>
      </td>

      {/* TELEFONE */}
      <td className="py-3 px-4 font-mono text-xs font-semibold text-foreground whitespace-nowrap">
        {formattedPhone || "Sem número"}
      </td>

      {/* DURAÇÃO */}
      <td className="py-3 px-4 font-mono text-[11px] font-semibold whitespace-nowrap">
        {formatDuration(r.startedAt, r.endedAt)}
      </td>

      {/* TIPO */}
      <td className="py-3 px-4 whitespace-nowrap">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-foreground border">
          <DirIcon className={cn("h-3 w-3 shrink-0", isInbound ? "text-emerald-500" : "text-blue-500")} />
          {isInbound ? "Entrada" : "Saída"}
        </span>
      </td>

      {/* MOTIVO TÉRMINO */}
      <td className="py-3 px-4 whitespace-nowrap">
        <EndReasonBadge label={statusDetails.badgeText} statusType={statusDetails.statusType} />
      </td>

      {/* STATUS */}
      <td className="py-3 px-4 whitespace-nowrap">
        {statusDetails.statusType === "completed" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
            concluído
          </span>
        ) : statusDetails.statusType === "rejected" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 border border-red-500/20 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
            recusada
          </span>
        ) : statusDetails.statusType === "missed" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
            não atendida
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
            outro aparelho
          </span>
        )}
      </td>

      {/* AÇÕES & GRAVAÇÃO */}
      <td className="py-3 px-4 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2 shrink-0">
          {statusDetails.showMedia && r.recordingUrl ? (
            <AudioRecordingPlayer recordingUrl={r.recordingUrl} compact={true} />
          ) : null}
          <Button
            variant="outline"
            size="icon"
            disabled={!statusDetails.showMedia}
            className={cn(
              "h-7 w-7 shrink-0 rounded-lg transition-all",
              statusDetails.showMedia
                ? "text-muted-foreground hover:text-foreground cursor-pointer"
                : "opacity-35 cursor-not-allowed bg-muted/20 text-muted-foreground/60"
            )}
            title={statusDetails.showMedia ? "Transcrição" : "Sem transcrição (chamada não atendida)"}
            onClick={() => statusDetails.showMedia && onSelectTranscript(r)}
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            disabled={!statusDetails.showMedia}
            className={cn(
              "h-7 w-7 shrink-0 rounded-lg transition-all",
              statusDetails.showMedia
                ? "text-muted-foreground hover:text-primary cursor-pointer"
                : "opacity-35 cursor-not-allowed bg-muted/20 text-muted-foreground/60"
            )}
            title={statusDetails.showMedia ? "Resumo IA" : "Sem resumo por IA (chamada não atendida)"}
            onClick={() => statusDetails.showMedia && onSelectSummary(r)}
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0 rounded-lg cursor-pointer"
            title="Excluir"
            onClick={() => onDelete(r)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
};

export const HistoryTable = ({ sid, rows }: HistoryTableProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const queryClient = useQueryClient();

  const [selectedTranscriptRow, setSelectedTranscriptRow] = useState<HistoryRow | null>(null);
  const [selectedSummaryRow, setSelectedSummaryRow] = useState<HistoryRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HistoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredRows = rows.filter((r) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.phone?.toLowerCase().includes(term) ||
      r.name?.toLowerCase().includes(term) ||
      r.callId?.toLowerCase().includes(term) ||
      r.endReason?.toLowerCase().includes(term)
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteHistoryCall(sid, deleteTarget.callId);
      toast.success("Chamada excluída do histórico");
      queryClient.invalidateQueries({ queryKey: ["history", sid] });
      setDeleteTarget(null);
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir chamada");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-in w-full overflow-hidden">
      {/* Retell Top Control Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card/60 border rounded-2xl p-3 shadow-2xs">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por contato, telefone ou motivo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-background w-full"
            />
          </div>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs rounded-xl shrink-0 px-2.5">
            <CalendarIcon className="h-3.5 w-3.5 opacity-60" />
            <span className="hidden sm:inline">Período</span>
          </Button>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs rounded-xl shrink-0 px-2.5">
            <Filter className="h-3.5 w-3.5 opacity-60" />
            <span className="hidden sm:inline">Filtros</span>
          </Button>
        </div>

        <div className="text-[11px] sm:text-xs text-muted-foreground font-mono self-end sm:self-center">
          Exibindo {paginatedRows.length} de {filteredRows.length} chamadas
        </div>
      </div>

      {/* Retell Data Table Container */}
      <div className="rounded-2xl border bg-card shadow-2xs overflow-hidden w-full">
        <div className="overflow-x-auto custom-scrollbar w-full">
          <table className="w-full text-left border-collapse min-w-[1080px]">
            <thead>
              <tr className="border-b bg-muted/40 text-[11px] font-bold text-muted-foreground uppercase tracking-wider select-none">
                <th className="py-3 px-4 w-32">Horário</th>
                <th className="py-3 px-4 w-44">Contato</th>
                <th className="py-3 px-4 w-36">Telefone</th>
                <th className="py-3 px-4 w-20">Duração</th>
                <th className="py-3 px-4 w-24">Tipo</th>
                <th className="py-3 px-4 w-36">Motivo Término</th>
                <th className="py-3 px-4 w-24">Status</th>
                <th className="py-3 px-4 text-right min-w-[220px]">Ações & Gravação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-xs">
              {paginatedRows.map((r) => (
                <HistoryTableRow
                  key={r.callId}
                  sid={sid}
                  r={r}
                  onSelectTranscript={setSelectedTranscriptRow}
                  onSelectSummary={setSelectedSummaryRow}
                  onDelete={(row) => setDeleteTarget(row)}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Retell Pagination Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-4 py-3 border-t bg-muted/20 text-xs text-muted-foreground">
          <div>
            Página {page} de {totalPages} • Total: {filteredRows.length} chamadas
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-lg"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2 font-mono text-xs font-bold text-foreground">{page}</span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 rounded-lg"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Modais de Transcrição e Resumo */}
      {selectedTranscriptRow && (
        <TranscriptModal
          sid={sid}
          row={selectedTranscriptRow}
          open={!!selectedTranscriptRow}
          onOpenChange={(open) => !open && setSelectedTranscriptRow(null)}
          displayName={selectedTranscriptRow.name || formatPhoneNumber(selectedTranscriptRow.phone)}
        />
      )}
      {selectedSummaryRow && (
        <SummaryModal
          row={selectedSummaryRow}
          open={!!selectedSummaryRow}
          onOpenChange={(open) => !open && setSelectedSummaryRow(null)}
          displayName={selectedSummaryRow.name || formatPhoneNumber(selectedSummaryRow.phone)}
        />
      )}

      {/* Modal Reutilizável de Confirmação de Exclusão de Chamada */}
      <ConfirmModal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Excluir Chamada do Histórico"
        description={
          <>
            Tem certeza que deseja excluir permanentemente o registro da chamada de{" "}
            <span className="font-bold text-foreground font-mono">
              {deleteTarget?.name || (deleteTarget?.phone ? formatPhoneNumber(deleteTarget.phone) : deleteTarget?.callId)}
            </span>
            ? Esta ação não pode ser desfeita.
          </>
        }
        confirmText="Excluir Registro"
        variant="destructive"
        loading={deleting}
        onConfirm={confirmDelete}
      />
    </div>
  );
};
