export type SessionState = "connecting" | "qr" | "open" | "logged_out";

export type SessionInfo = {
  id: string;
  name: string;
  jid: string;
  state: SessionState;
  paired: boolean;
  projectId?: string;
  apiKey?: string;
  ownerEmail?: string;
  ownerName?: string;
};
