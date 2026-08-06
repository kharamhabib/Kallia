import { useState } from "react";
import { History } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";
import { useHistory } from "@/hooks/useHistory";
import { HistoryItem } from "@/components/domain/history/HistoryDrawer";
import { HistoryTable } from "@/components/domain/history/HistoryTable";
import { cn } from "@/lib/utils";

export const CallsPage = ({ sid }: { sid: string }) => {
  const [viewMode, setViewMode] = useState<"table" | "grid">("table");
  const { data: historyRows = [] } = useHistory(sid, true);

  return (
    <div className="space-y-5 w-full max-w-[1600px] mx-auto px-2 sm:px-6 py-3 animate-fade-in">
      {/* Header com contador e alternador de visualização */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3.5">
        <div>
          <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
            <History className="h-4.5 w-4.5 text-primary shrink-0" />
            <span>Histórico de Ligações ({historyRows.length})</span>
          </h2>
          <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
            Registro de todas as chamadas com gravações, transcrições e resumos por IA.
          </p>
        </div>

        <div className="flex items-center gap-1 self-start sm:self-center bg-muted/60 p-1 rounded-xl border shadow-2xs">
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              viewMode === "table"
                ? "bg-background text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Tabela
          </button>
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer",
              viewMode === "grid"
                ? "bg-background text-foreground shadow-2xs font-bold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Cards
          </button>
        </div>
      </div>

      {/* Conteúdo principal de Histórico */}
      {historyRows.length === 0 ? (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="Nenhum histórico encontrado"
          description="As ligações concluídas ou gravadas aparecerão aqui automaticamente."
        />
      ) : viewMode === "table" ? (
        <HistoryTable sid={sid} rows={historyRows} />
      ) : (
        <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {historyRows.map((r) => (
            <HistoryItem key={r.callId} sid={sid} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
};
