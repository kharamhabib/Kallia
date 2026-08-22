import { useEffect, useState } from "react";
import { ConversationsList } from "@/components/domain/chat/ConversationsList";
import { ChatHeader } from "@/components/domain/chat/ChatHeader";
import { ChatTimeline } from "@/components/domain/chat/ChatTimeline";
import { ChatInputBar } from "@/components/domain/chat/ChatInputBar";
import { ContactDetailsDrawer } from "@/components/domain/chat/ContactDetailsDrawer";
import { useConversationsStore } from "@/stores/conversations";
import { useWorkspaceStore } from "@/stores/workspace";

export const ConversationsPage = () => {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const activeConversationId = useConversationsStore(
    (s) => s.activeConversationId,
  );
  const fetchConversations = useConversationsStore(
    (s) => s.fetchConversations,
  );
  const fetchInboxes = useConversationsStore((s) => s.fetchInboxes);
  const fetchTags = useConversationsStore((s) => s.fetchTags);
  const connectWebSocket = useConversationsStore((s) => s.connectWebSocket);
  const disconnectWebSocket = useConversationsStore(
    (s) => s.disconnectWebSocket,
  );

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const wid = currentWorkspace?.id;

  useEffect(() => {
    if (wid) {
      void fetchConversations(wid);
      void fetchInboxes(wid);
      void fetchTags(wid);
      connectWebSocket(wid);
    }
    return () => {
      disconnectWebSocket();
    };
  }, [wid]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] md:h-screen w-full overflow-hidden bg-background">
      {/* Coluna 1: Lista de Conversas (Painel Esquerdo) */}
      <div className="w-full md:w-80 lg:w-96 shrink-0 h-full">
        <ConversationsList />
      </div>

      {/* Coluna 2: Chat Ativo (Painel Central) */}
      <div className="hidden md:flex flex-1 flex-col h-full min-w-0 bg-background">
        {activeConversationId ? (
          <>
            <ChatHeader
              isDrawerOpen={isDrawerOpen}
              onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
            />
            <ChatTimeline />
            <ChatInputBar />
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-4 text-2xl">
              💬
            </div>
            <h3 className="text-base font-bold text-foreground">
              Central de Atendimento Omnichannel
            </h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              Selecione uma conversa na barra lateral para iniciar o atendimento ao vivo, gerenciar tags e enviar mensagens via WhatsApp.
            </p>
          </div>
        )}
      </div>

      {/* Coluna 3: Gaveta de Detalhes do Contato (Painel Direito Retrátil) */}
      {activeConversationId && isDrawerOpen && (
        <div className="hidden xl:block h-full">
          <ContactDetailsDrawer />
        </div>
      )}
    </div>
  );
};
