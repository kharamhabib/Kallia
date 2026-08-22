import { useQuery } from "@tanstack/react-query";
import { fetchHistory, fetchTranscript } from "@/services/history";

export const useHistory = (sid: string | null, enabled: boolean, wid?: string) =>
  useQuery({
    queryKey: ["history", wid || sid],
    queryFn: () => fetchHistory(sid || undefined, wid),
    enabled: enabled && (!!sid || !!wid),
  });

export const useTranscript = (sid: string | null, callId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ["transcript", sid, callId],
    queryFn: () => fetchTranscript(sid as string, callId as string),
    enabled: enabled && !!sid && !!callId,
  });

