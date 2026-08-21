export type Contact = {
  id: number;
  sessionId: string;
  phone: string;
  name: string;
  username?: string;
  email: string;
  company: string;
  notes: string;
  avatarUrl: string;
  lid: string;
  jid: string;
  tags: string;
  enrichedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type UpsertContactPayload = {
  phone: string;
  name?: string;
  username?: string;
  email?: string;
  company?: string;
  notes?: string;
  avatarUrl?: string;
  lid?: string;
  jid?: string;
  tags?: string;
};
