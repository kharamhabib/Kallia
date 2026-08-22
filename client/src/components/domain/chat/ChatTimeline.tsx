import { useEffect, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  Clock,
  Sparkles,
  Lock,
  FileText,
  Download,
  Play,
  Pause,
  Image as ImageIcon,
  Video,
  Reply,
  Copy,
  Pencil,
  Trash2,
  ChevronDown,
  Smile,
  Ban,
  CheckCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useConversationsStore } from "@/stores/conversations";
import type { Message } from "@/types/omnichannel";
import { cn } from "@/lib/utils";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const ChatTimeline = () => {
  const activeConversation = useConversationsStore(
    (s) => s.activeConversation,
  );
  const messages = useConversationsStore((s) => s.messages);
  const isLoadingMessages = useConversationsStore((s) => s.isLoadingMessages);
  const typingMap = useConversationsStore((s) => s.typingMap);

  const setReplyingToMessage = useConversationsStore((s) => s.setReplyingToMessage);
  const reactToMessage = useConversationsStore((s) => s.reactToMessage);
  const editMessage = useConversationsStore((s) => s.editMessage);
  const deleteMessage = useConversationsStore((s) => s.deleteMessage);

  const containerRef = useRef<HTMLDivElement>(null);
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState(false);

  // Modal de Edição
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  // Modal de Confirmação de Exclusão
  const [deletingMessage, setDeletingMessage] = useState<Message | null>(null);
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  const typingState = activeConversation ? typingMap[activeConversation.id] : undefined;
  const isTyping = Boolean(
    typingState &&
      (typeof typingState === "boolean" ? typingState : (typingState as any)?.isTyping),
  );
  const typingMedia =
    typeof typingState === "object" && typingState !== null && "media" in typingState
      ? (typingState as any).media
      : "text";

  // ── Smart Auto-Scroll ───────────────────────────────────────────────

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight <= 80;
    isAtBottomRef.current = atBottom;
    setShowScrollBottomBtn(!atBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (!containerRef.current) return;
    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior,
    });
    isAtBottomRef.current = true;
    setShowScrollBottomBtn(false);
  };

  // Quando troca de conversa, rola direto para o fim
  useEffect(() => {
    scrollToBottom("auto");
  }, [activeConversation?.id]);

  // Quando chegam mensagens ou digitação: só rola se o usuário já estiver no final
  useEffect(() => {
    if (isAtBottomRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages, isTyping]);

  // ── Ações de Mensagem ───────────────────────────────────────────────

  const handleCopy = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const openEditModal = (msg: Message) => {
    setEditingMessage(msg);
    setEditContent(msg.content || "");
  };

  const submitEdit = async () => {
    if (!activeConversation || !editingMessage || !editContent.trim()) return;
    setIsSubmittingEdit(true);
    try {
      await editMessage(activeConversation.id, editingMessage.id, editContent.trim());
      setEditingMessage(null);
      setEditContent("");
    } catch (err) {
      console.error("Falha ao salvar edição:", err);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  const openDeleteModal = (msg: Message) => {
    setDeletingMessage(msg);
  };

  const submitDelete = async () => {
    if (!activeConversation || !deletingMessage) return;
    setIsSubmittingDelete(true);
    try {
      await deleteMessage(activeConversation.id, deletingMessage.id);
      setDeletingMessage(null);
    } catch (err) {
      console.error("Falha ao apagar mensagem:", err);
    } finally {
      setIsSubmittingDelete(false);
    }
  };

  if (!activeConversation) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center text-muted-foreground">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-4">
          💬
        </div>
        <h3 className="text-base font-bold text-foreground">
          Nenhuma conversa selecionada
        </h3>
        <p className="text-xs text-muted-foreground max-w-sm mt-1">
          Escolha uma conversa na lista ao lado para visualizar o histórico de mensagens e responder ao cliente.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative flex-1 overflow-y-auto p-4 custom-scrollbar bg-radial from-muted/20 via-background to-background"
    >
      {/* Toast de Cópia */}
      {copyToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl bg-card border border-border px-4 py-2 text-xs font-semibold text-foreground shadow-lg animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <span>Texto copiado para a área de transferência!</span>
        </div>
      )}

      {/* Botão Flutuante de Retornar ao Fim */}
      {showScrollBottomBtn && (
        <button
          type="button"
          onClick={() => scrollToBottom("smooth")}
          className="sticky bottom-4 float-right z-30 flex h-9 w-9 items-center justify-center rounded-full bg-card/95 border border-border shadow-lg text-foreground hover:bg-muted transition-all cursor-pointer hover:scale-105 active:scale-95"
          title="Rolar para as mensagens recentes"
        >
          <ChevronDown className="h-5 w-5 text-primary" />
        </button>
      )}

      {isLoadingMessages && messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
          <p className="text-xs">
            Início da conversa com {activeConversation.contact?.name || activeConversation.contact?.phone}
          </p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            As mensagens enviadas e recebidas via WhatsApp e outros canais aparecerão aqui em tempo real.
          </p>
        </div>
      ) : (
        <div className="space-y-4 max-w-4xl mx-auto">
          {messages.map((msg, index) => {
            const isContact = msg.sender_type === "contact";
            const isNote = msg.content_type === "note" || msg.sender_type === "system";
            const isAI = msg.sender_type === "ai";
            const isDeleted = Boolean(msg.metadata?.is_deleted);
            const isEdited = Boolean(msg.metadata?.is_edited);

            // Separador de Data Agrupado por Dia
            const showDateDivider =
              index === 0 ||
              getDayKey(msg.created_at) !== getDayKey(messages[index - 1]?.created_at);

            return (
              <div key={msg.id || index} className="space-y-3">
                {/* Divisor de Data Estilo WhatsApp */}
                {showDateDivider && (
                  <div className="my-3 flex justify-center sticky top-2 z-10 select-none">
                    <span className="rounded-xl bg-card/95 border border-border/80 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-xs backdrop-blur-md">
                      {formatDateDivider(msg.created_at)}
                    </span>
                  </div>
                )}

                {/* Se for nota interna, renderiza como card central */}
                {isNote ? (
                  <div className="flex justify-center my-2">
                    <div className="max-w-md w-full rounded-xl bg-amber-500/10 border border-amber-500/25 p-3 text-xs text-amber-900 dark:text-amber-200 shadow-2xs">
                      <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-700 dark:text-amber-400 mb-1">
                        <Lock className="h-3.5 w-3.5" />
                        <span>Nota Interna (Privada)</span>
                        <span className="ml-auto text-[10px] font-normal opacity-70">
                          {formatMsgTime(msg.created_at)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  /* Balão de Mensagem Padrão com Botões Discretos ao Lado */
                  <div
                    className={cn(
                      "flex w-full group/msg relative items-end",
                      isContact ? "justify-start" : "justify-end",
                    )}
                  >
                    {/* Ações para mensagens enviadas (!isContact) - à esquerda do balão */}
                    {!isContact && !isDeleted && (
                      <div className="mr-1.5 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity self-center shrink-0">
                        {/* Botão de Opções ⌄ */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-card/95 border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-xs transition-colors cursor-pointer"
                              title="Opções da mensagem"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="top" className="w-44 z-50">
                            <DropdownMenuItem
                              onClick={() => setReplyingToMessage(msg)}
                              className="gap-2 text-xs cursor-pointer"
                            >
                              <Reply className="h-3.5 w-3.5" />
                              <span>Responder</span>
                            </DropdownMenuItem>
                            {msg.content && (
                              <DropdownMenuItem
                                onClick={() => handleCopy(msg.content)}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copiar</span>
                              </DropdownMenuItem>
                            )}
                            {msg.content_type === "text" && (
                              <DropdownMenuItem
                                onClick={() => openEditModal(msg)}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                <span>Editar</span>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => openDeleteModal(msg)}
                              className="gap-2 text-xs text-destructive focus:text-destructive cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Apagar para todos</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Botão de Emoji ☺ com Popover dos 6 Emojis */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-card/95 border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-xs transition-colors cursor-pointer"
                              title="Reagir com emoji"
                            >
                              <Smile className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" side="top" className="p-1 min-w-fit rounded-full shadow-lg border bg-card/98 backdrop-blur-md z-50">
                            <div className="flex items-center gap-0.5">
                              {QUICK_EMOJIS.map((emoji) => (
                                <DropdownMenuItem
                                  key={emoji}
                                  onClick={() =>
                                    reactToMessage(activeConversation.id, msg.id, emoji)
                                  }
                                  className="h-7 w-7 p-0 flex items-center justify-center rounded-full hover:bg-muted text-sm cursor-pointer hover:scale-125 transition-transform"
                                >
                                  <span>{emoji}</span>
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}

                    {/* Balão de Mensagem */}
                    <div
                      className={cn(
                        "relative max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-2xs transition-all text-xs",
                        isContact
                          ? "rounded-tl-xs bg-card border border-border text-foreground"
                          : isAI
                          ? "rounded-tr-xs bg-amber-500/15 border border-amber-500/30 text-foreground"
                          : "rounded-tr-xs bg-primary text-primary-foreground font-medium",
                        isDeleted && "opacity-60 italic",
                      )}
                    >
                      {/* Badge de IA se a mensagem foi enviada pelo agente */}
                      {isAI && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1">
                          <Sparkles className="h-3 w-3" />
                          <span>Agente de IA</span>
                        </div>
                      )}

                      {/* Renderização de Citação (Reply Quote) */}
                      {msg.metadata?.reply_to && (
                        <div
                          className={cn(
                            "mb-2 overflow-hidden rounded-lg border-l-3 p-2 text-[11px]",
                            isContact
                              ? "border-primary bg-muted/60 text-foreground"
                              : "border-white bg-black/15 text-primary-foreground",
                          )}
                        >
                          <span className="font-bold block truncate">
                            {msg.metadata.reply_to.sender_type === "contact"
                              ? activeConversation.contact?.name || "Contato"
                              : "Você"}
                          </span>
                          <span className="truncate block opacity-85 text-[10.5px]">
                            {msg.metadata.reply_to.content_type === "image" && "📷 Foto"}
                            {msg.metadata.reply_to.content_type === "audio" && "🎵 Áudio"}
                            {msg.metadata.reply_to.content_type === "video" && "🎥 Vídeo"}
                            {msg.metadata.reply_to.content_type === "document" && "📄 Documento"}
                            {msg.metadata.reply_to.content || "(Sem texto)"}
                          </span>
                        </div>
                      )}

                      {/* Mensagem Apagada */}
                      {isDeleted ? (
                        <div className="flex items-center gap-1.5 text-xs">
                          <Ban className="h-3.5 w-3.5 shrink-0 opacity-70" />
                          <span>Esta mensagem foi apagada</span>
                        </div>
                      ) : (
                        <>
                          {/* Renderização de Imagem */}
                          {msg.content_type === "image" && (
                            <div className="mb-2 overflow-hidden rounded-xl bg-black/5">
                              {msg.media_url ? (
                                <img
                                  src={msg.media_url}
                                  alt="Anexo de Imagem"
                                  onClick={() => setLightboxImage(msg.media_url || null)}
                                  className="max-h-72 w-full object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                                />
                              ) : (
                                <div className="flex items-center gap-2 p-3 text-xs">
                                  <ImageIcon className="h-4 w-4" />
                                  <span>Imagem recebida</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Renderização de Vídeo */}
                          {msg.content_type === "video" && (
                            <div className="mb-2 overflow-hidden rounded-xl bg-black/5">
                              {msg.media_url ? (
                                <video
                                  src={msg.media_url}
                                  controls
                                  className="max-h-72 w-full rounded-lg object-contain bg-black/80"
                                />
                              ) : (
                                <div className="flex items-center gap-2 p-3 text-xs">
                                  <Video className="h-4 w-4" />
                                  <span>Vídeo recebido</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Renderização de Áudio / Voice Note */}
                          {msg.content_type === "audio" && (
                            <AudioPlayer
                              src={msg.media_url || ""}
                              isOutbound={!isContact}
                            />
                          )}

                          {/* Renderização de Documento */}
                          {msg.content_type === "document" && (
                            <div
                              className={cn(
                                "mb-2 flex items-center justify-between gap-3 rounded-xl p-2.5 border",
                                isContact
                                  ? "bg-muted/50 border-border"
                                  : "bg-black/10 border-white/15",
                              )}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                  <FileText className="h-4 w-4" />
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-xs">
                                    {msg.metadata?.file_name || "Documento.pdf"}
                                  </p>
                                  <p className="text-[10px] opacity-70">Arquivo anexado</p>
                                </div>
                              </div>
                              {msg.media_url && (
                                <a
                                  href={msg.media_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg p-1.5 hover:bg-black/10 transition-colors"
                                  download
                                >
                                  <Download className="h-4 w-4" />
                                </a>
                              )}
                            </div>
                          )}

                          {/* Conteúdo de Texto */}
                          {msg.content && (
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.content}
                            </p>
                          )}
                        </>
                      )}

                      {/* Rodapé da Mensagem (Horário + Badge Editada + Status de Entrega WhatsApp) */}
                      <div
                        className={cn(
                          "mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-75",
                          !isContact && "text-primary-foreground/90",
                        )}
                      >
                        {isEdited && !isDeleted && (
                          <span className="text-[9px] italic opacity-80 mr-0.5">
                            (editada)
                          </span>
                        )}
                        <span>{formatMsgTime(msg.created_at)}</span>
                        {!isContact && !isDeleted && (
                          <MessageStatusIcon status={msg.status} />
                        )}
                      </div>

                      {/* Badge de Reações no Canto Inferior */}
                      {msg.metadata?.reactions && msg.metadata.reactions.length > 0 && (
                        <div
                          className={cn(
                            "absolute -bottom-2.5 z-10 flex items-center gap-0.5 rounded-full bg-card/95 border border-border px-2 py-0.5 text-[11px] shadow-xs cursor-pointer select-none hover:bg-muted transition-colors",
                            isContact ? "left-2" : "right-2",
                          )}
                          onClick={() =>
                            reactToMessage(activeConversation.id, msg.id, "")
                          }
                          title="Clique para remover sua reação"
                        >
                          {msg.metadata.reactions.map((r, i) => (
                            <span key={i}>{r.emoji}</span>
                          ))}
                          {msg.metadata.reactions.length > 1 && (
                            <span className="text-[10px] text-muted-foreground font-bold ml-0.5">
                              {msg.metadata.reactions.length}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ações para mensagens recebidas (isContact) - à direita do balão */}
                    {isContact && !isDeleted && (
                      <div className="ml-1.5 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity self-center shrink-0">
                        {/* Botão de Emoji ☺ com Popover dos 6 Emojis */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-card/95 border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-xs transition-colors cursor-pointer"
                              title="Reagir com emoji"
                            >
                              <Smile className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" side="top" className="p-1 min-w-fit rounded-full shadow-lg border bg-card/98 backdrop-blur-md z-50">
                            <div className="flex items-center gap-0.5">
                              {QUICK_EMOJIS.map((emoji) => (
                                <DropdownMenuItem
                                  key={emoji}
                                  onClick={() =>
                                    reactToMessage(activeConversation.id, msg.id, emoji)
                                  }
                                  className="h-7 w-7 p-0 flex items-center justify-center rounded-full hover:bg-muted text-sm cursor-pointer hover:scale-125 transition-transform"
                                >
                                  <span>{emoji}</span>
                                </DropdownMenuItem>
                              ))}
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>

                        {/* Botão de Opções ⌄ */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="flex h-6 w-6 items-center justify-center rounded-full bg-card/95 border border-border text-muted-foreground hover:text-foreground hover:bg-muted shadow-xs transition-colors cursor-pointer"
                              title="Opções da mensagem"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" side="top" className="w-44 z-50">
                            <DropdownMenuItem
                              onClick={() => setReplyingToMessage(msg)}
                              className="gap-2 text-xs cursor-pointer"
                            >
                              <Reply className="h-3.5 w-3.5" />
                              <span>Responder</span>
                            </DropdownMenuItem>
                            {msg.content && (
                              <DropdownMenuItem
                                onClick={() => handleCopy(msg.content)}
                                className="gap-2 text-xs cursor-pointer"
                              >
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copiar</span>
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Indicador de Digitação / Gravação de Áudio do Cliente */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs bg-card border border-border px-3.5 py-2.5 shadow-2xs text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {activeConversation.contact?.name || "Cliente"}
                </span>
                <span className="text-[11px] italic text-emerald-500 font-medium">
                  {typingMedia === "audio" ? "gravando áudio..." : "digitando..."}
                </span>
                <span className="flex gap-1 items-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                </span>
              </div>
            </div>
          )}

          <div ref={scrollBottomRef} />
        </div>
      )}

      {/* Lightbox Modal de Imagem */}
      <Dialog
        open={Boolean(lightboxImage)}
        onOpenChange={(open) => !open && setLightboxImage(null)}
      >
        <DialogContent className="max-w-3xl p-2 bg-black/90 border-0 flex flex-col items-center justify-center">
          {lightboxImage && (
            <img
              src={lightboxImage}
              alt="Visualização expandida"
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Edição de Mensagem */}
      <Dialog
        open={Boolean(editingMessage)}
        onOpenChange={(open) => !open && setEditingMessage(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Pencil className="h-4 w-4 text-primary" />
              <span>Editar Mensagem</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              A mensagem será atualizada no WhatsApp do cliente e exibirá a marcação "(editada)".
            </p>
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={3}
              placeholder="Digite a nova versão da mensagem..."
              className="text-xs"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingMessage(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isSubmittingEdit || !editContent.trim()}
              onClick={submitEdit}
              className="text-xs gap-1.5"
            >
              {isSubmittingEdit ? "Salvando..." : "Salvar Edição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Exclusão (Revoke WhatsApp) */}
      <Dialog
        open={Boolean(deletingMessage)}
        onOpenChange={(open) => !open && setDeletingMessage(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
              <Trash2 className="h-4 w-4" />
              <span>Apagar Mensagem para Todos?</span>
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-xs text-muted-foreground">
              Esta ação enviará um comando de revogação para apagar a mensagem no WhatsApp do cliente e a substituirá por <i>"Esta mensagem foi apagada"</i>.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingMessage(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isSubmittingDelete}
              onClick={submitDelete}
              className="text-xs gap-1.5"
            >
              {isSubmittingDelete ? "Apagando..." : "Apagar para Todos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Player de Áudio Estilo WhatsApp ────────────────────────────────────

const AudioPlayer = ({
  src,
  isOutbound,
}: {
  src: string;
  isOutbound: boolean;
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className={cn(
        "mb-1 flex items-center gap-3 rounded-2xl p-2 min-w-[220px] sm:min-w-[260px]",
        isOutbound ? "bg-black/10" : "bg-muted/50",
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={togglePlay}
        className={cn(
          "h-9 w-9 shrink-0 rounded-full cursor-pointer",
          isOutbound ? "bg-white/20 text-white hover:bg-white/30" : "bg-primary text-primary-foreground hover:bg-primary/90",
        )}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </Button>

      <div className="flex-1 space-y-1">
        {/* Barra de Progresso Simulado */}
        <div className="relative h-1.5 w-full rounded-full bg-black/15 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-100",
              isOutbound ? "bg-white" : "bg-primary",
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] opacity-70">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration)}</span>
        </div>
      </div>
    </div>
  );
};

// ── Helpers ────────────────────────────────────────────────────────────

const MessageStatusIcon = ({ status }: { status?: string }) => {
  switch (status) {
    case "sent":
      return (
        <span title="Enviada">
          <Check className="h-3.5 w-3.5 text-primary-foreground/70" />
        </span>
      );
    case "delivered":
      return (
        <span title="Entregue no WhatsApp">
          <CheckCheck className="h-3.5 w-3.5 text-primary-foreground/70" />
        </span>
      );
    case "read":
      return (
        <span title="Lida pelo cliente">
          <CheckCheck className="h-3.5 w-3.5 text-sky-400 font-bold" />
        </span>
      );
    default:
      return (
        <span title="Enviando...">
          <Clock className="h-3 w-3 opacity-60" />
        </span>
      );
  }
};

const formatMsgTime = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

const formatAudioTime = (secs: number) => {
  if (!secs || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
};

const getDayKey = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  } catch {
    return "";
  }
};

const formatDateDivider = (dateStr: string): string => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();

    const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const diffDays = Math.round((nowDay - dDay) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "Hoje";
    if (diffDays === 1) return "Ontem";
    if (diffDays > 1 && diffDays < 7) {
      const weekdays = [
        "Domingo",
        "Segunda-feira",
        "Terça-feira",
        "Quarta-feira",
        "Quinta-feira",
        "Sexta-feira",
        "Sábado",
      ];
      return weekdays[d.getDay()];
    }

    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "";
  }
};
