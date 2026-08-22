import { apiGet, apiDelete } from "@/lib/api";
import type { HistoryRow } from "@/types/history";

export interface TranscriptLine {
  speaker: string;
  text: string;
}

export const fetchHistory = (sid?: string, wid?: string) => {
  const url = wid
    ? `/api/workspaces/${wid}/history?limit=50`
    : sid
    ? `/api/sessions/${sid}/history?limit=50`
    : `/api/history?limit=50`;
  return apiGet<{ rows: HistoryRow[] }>(url).then((r) => r.rows ?? []);
};

export const fetchTranscript = (sid: string, callId: string) =>
  apiGet<{ transcript: TranscriptLine[] }>(`/api/sessions/${sid}/history/${callId}/transcript`).then((r) => r.transcript ?? []);

export const deleteHistoryCall = (sid: string, callId: string) =>
  apiDelete(`/api/sessions/${sid}/history/${callId}`);
