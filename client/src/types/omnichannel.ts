export type ChannelType = "whatsapp" | "instagram" | "email" | "telegram" | "sms";

export type ConversationStatus = "open" | "pending" | "resolved" | "snoozed";

export type SenderType = "contact" | "agent" | "ai" | "system";

export type MessageContentType =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "location"
  | "interactive"
  | "note";

export type MessageStatus = "sent" | "delivered" | "read" | "failed";

export interface Tag {
  id: string;
  workspace_id?: string;
  name: string;
  color: string;
  scope: "contact" | "conversation" | "both";
  created_at: string;
}

export interface PGContact {
  id: string;
  workspace_id?: string;
  name: string;
  phone: string;
  email?: string;
  instagram_id?: string;
  telegram_id?: string;
  avatar_url?: string;
  custom_attrs?: Record<string, unknown>;
  tags?: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Inbox {
  id: string;
  workspace_id: string;
  channel_type: ChannelType;
  name: string;
  channel_config?: Record<string, unknown>;
  session_id?: string;
  active: boolean;
  created_at: string;
}

export interface MessageReaction {
  emoji: string;
  sender: "agent" | "contact";
  created_at: string;
}

export interface QuotedMessage {
  id: string;
  content: string;
  sender_type: SenderType;
  content_type: MessageContentType;
}

export interface MessageMetadata {
  file_name?: string;
  mimetype?: string;
  reactions?: MessageReaction[];
  reply_to?: QuotedMessage;
  is_edited?: boolean;
  edited_at?: string;
  is_deleted?: boolean;
  deleted_at?: string;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  sender_id?: string;
  content: string;
  content_type: MessageContentType;
  media_url?: string;
  external_id?: string;
  status: MessageStatus;
  metadata?: MessageMetadata;
  created_at: string;
}

export interface Conversation {
  id: string;
  workspace_id: string;
  inbox_id: string;
  contact_id: string;
  contact?: PGContact;
  status: ConversationStatus;
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assignee_id?: string;
  ai_active: boolean;
  chat_agent_id?: string;
  last_msg_at: string;
  custom_attrs?: Record<string, unknown>;
  tags?: Tag[];
  last_message?: Message;
  unread_count?: number;
  created_at: string;
}

export interface ConversationFilters {
  status: "all" | "open" | "pending" | "resolved";
  assignee: "all" | "me" | "unassigned";
  channel: "all" | ChannelType;
  tagId: string;
  search: string;
}
