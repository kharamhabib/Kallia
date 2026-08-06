import type { CallStatus } from "@/types/call";

export const formatCallDuration = (startedAt: number, status: CallStatus): string => {
  if (status !== "connected") return status;
  const s = Math.floor((Date.now() - startedAt) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const formatPhoneNumber = (value?: string | null): string => {
  if (!value) return "";
  const user = value.split("@")[0];
  const cleaned = user.replace(/\D/g, "");
  if (!cleaned) return value;

  // Se o número for muito longo (>13 dígitos), é um LID/identificador interno Multi-Device do WhatsApp.
  if (cleaned.length > 13) {
    return `LID ${cleaned.slice(0, 4)}...${cleaned.slice(-4)}`;
  }

  if (cleaned.length <= 2) return `+${cleaned}`;
  if (cleaned.length <= 4) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2)}`;
  if (cleaned.length <= 8) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4)}`;
  if (cleaned.length <= 12) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
  return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9, 13)}`;
};

export const formatDuration = (startedAt: number, endedAt: number | null): string => {
  if (!endedAt) return "Em andamento";
  const secs = Math.floor((endedAt - startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
};

export const getInitials = (name: string): string => {
  if (!name) return "W";
  const clean = name.replace(/[^a-zA-ZÀ-ÿ\s]/g, "").trim();
  if (clean) {
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    if (parts[0]) {
      return parts[0].slice(0, 2).toUpperCase();
    }
  }
  return "W";
};

export const isCallMissedOrRejected = (startedAt: number, endedAt: number | null, endReason?: string | null): boolean => {
  if (!endedAt) return true;
  const reason = (endReason || "").toLowerCase().trim();
  if (
    reason === "accepted_elsewhere" ||
    reason === "rejected_elsewhere" ||
    reason === "rejected" ||
    reason === "reject" ||
    reason === "declined" ||
    reason === "busy" ||
    reason === "do_not_disturb" ||
    reason === "no_answer" ||
    reason === "timeout" ||
    reason === "canceled" ||
    reason === "cancelled" ||
    reason === "failed" ||
    reason === "unknown"
  ) return true;
  const duration = endedAt - startedAt;
  if (duration < 5000) return true;
  return false;
};

export const isCallAnswered = (startedAt: number, endedAt: number | null, endReason?: string | null): boolean => {
  return !isCallMissedOrRejected(startedAt, endedAt, endReason);
};

export interface CallStatusDetails {
  statusType: "accepted_elsewhere" | "rejected" | "missed" | "completed";
  badgeText: string;
  badgeClass: string;
  cardBorderClass: string;
  descriptionText: string;
  showMedia: boolean;
}

export const formatEndReason = (
  endReason?: string | null,
  startedAt?: number,
  endedAt?: number | null,
  direction?: string | null
): string => {
  const reason = (endReason || "").toLowerCase().trim();
  const duration = startedAt && endedAt ? endedAt - startedAt : 0;

  if (
    reason === "rejected" ||
    reason === "reject" ||
    reason === "declined" ||
    reason === "rejected_elsewhere"
  ) {
    if (reason === "rejected_elsewhere") return "Recusada em outro aparelho";
    return direction === "inbound" ? "Recusada por você" : "Recusada pelo contato";
  }
  if (reason === "user_ended") {
    if (duration < 5000) return direction === "inbound" ? "Chamada recusada" : "Cancelada antes de atender";
    return direction === "inbound" ? "Desligado pelo cliente" : "Desligado pelo operador";
  }
  if (reason === "peer_ended") {
    if (duration < 5000) return direction === "inbound" ? "Cancelada pelo cliente" : "Recusada pelo contato";
    return direction === "inbound" ? "Desligado pelo operador" : "Desligado pelo contato";
  }
  if (reason === "ai_hangup" || reason === "agent_ended" || reason === "tool_hangup") {
    return "Finalizado pela IA";
  }
  if (reason === "busy") {
    return "Linha ocupada";
  }
  if (reason === "no_answer") {
    return "Não atendeu";
  }
  if (reason === "timeout") {
    return "Tempo limite excedido";
  }
  if (reason === "canceled" || reason === "cancelled") {
    return "Cancelada antes de atender";
  }
  if (reason === "accepted_elsewhere") {
    return "Atendida em outro aparelho";
  }
  if (reason === "failed" || reason === "error") {
    return "Falha na conexão VoIP";
  }

  // Fallback quando não há motivo explícito registrado
  if (endedAt && duration >= 5000) {
    return "Concluída normalmente";
  }
  if (!endedAt || duration < 5000) {
    return "Não atendida";
  }

  return endReason || "Concluída";
};

export const getCallStatusDetails = (
  startedAt: number,
  endedAt: number | null,
  endReason?: string | null,
  direction?: string | null
): CallStatusDetails => {
  const isInbound = direction === "inbound";
  const duration = endedAt ? endedAt - startedAt : 0;
  const reason = (endReason || "").toLowerCase().trim();

  const isAcceptedElsewhere = reason === "accepted_elsewhere";
  const isRejected =
    reason === "rejected" ||
    reason === "reject" ||
    reason === "rejected_elsewhere" ||
    reason === "declined" ||
    reason === "busy" ||
    reason === "do_not_disturb";

  const isMissed =
    !endedAt ||
    duration < 5000 ||
    reason === "no_answer" ||
    reason === "timeout" ||
    reason === "canceled" ||
    reason === "cancelled" ||
    reason === "failed" ||
    reason === "unknown";

  const reasonLabel = formatEndReason(endReason, startedAt, endedAt, direction);

  if (isAcceptedElsewhere) {
    return {
      statusType: "accepted_elsewhere",
      badgeText: reasonLabel,
      badgeClass: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
      cardBorderClass: "border-blue-500/20 bg-blue-500/[0.02] hover:border-blue-500/30",
      descriptionText: isInbound
        ? "Chamada recebida — Atendida em outro dispositivo"
        : "Chamada efetuada — Atendida em outro dispositivo",
      showMedia: false,
    };
  }

  if (isRejected) {
    return {
      statusType: "rejected",
      badgeText: reasonLabel,
      badgeClass: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
      cardBorderClass: "border-red-500/20 bg-red-500/[0.02] hover:border-red-500/30",
      descriptionText: isInbound
        ? "Chamada recebida — Chamada recusada"
        : "Chamada efetuada — O contato recusou a ligação",
      showMedia: false,
    };
  }

  if (isMissed) {
    return {
      statusType: "missed",
      badgeText: reasonLabel,
      badgeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
      cardBorderClass: "border-amber-500/20 bg-amber-500/[0.02] hover:border-amber-500/30",
      descriptionText: isInbound
        ? "Chamada recebida não atendida (Perdida)"
        : "Chamada efetuada não atendida (Sem resposta)",
      showMedia: false,
    };
  }

  return {
    statusType: "completed",
    badgeText: reasonLabel,
    badgeClass: isInbound
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
      : "bg-primary/10 text-primary border-primary/20",
    cardBorderClass: "border-primary/10 bg-card hover:shadow-xs",
    descriptionText: isInbound
      ? "Chamada recebida e atendida"
      : "Chamada efetuada e atendida",
    showMedia: true,
  };
};
