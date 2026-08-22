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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useConversationsStore } from "@/stores/conversations";
import { cn } from "@/lib/utils";

export const ChatTimeline = () => {
  const activeConversation = useConversationsStore(
    (s) => s.activeConversation,
  );
  const messages = useConversationsStore((s) => s.messages);
  const isLoadingMessages = useConversationsStore((s) => s.isLoadingMessages);
  const typingMap = useConversationsStore((s) => s.typingMap);

  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const isTyping = Boolean(activeConversation && typingMap[activeConversation.id]);

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

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
    <div className="relative flex-1 overflow-y-auto p-4 custom-scrollbar bg-radial from-muted/20 via-background to-background">
      {isLoadingMessages && messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
          <p className="text-xs">Início da conversa com {activeConversation.contact?.name || activeConversation.contact?.phone}</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1">As mensagens enviadas e recebidas via WhatsApp e outros canais aparecerão aqui em tempo real.</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-4xl mx-auto">
          {messages.map((msg, index) => {
            const isContact = msg.sender_type === "contact";
            const isNote = msg.content_type === "note" || msg.sender_type === "system";
            const isAI = msg.sender_type === "ai";

            // Se for nota interna, renderiza como card central de anotação privada
            if (isNote) {
              return (
                <div
                  key={msg.id || index}
                  className="flex justify-center my-3"
                >
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
              );
            }

            return (
              <div
                key={msg.id || index}
                className={cn(
                  "flex w-full",
                  isContact ? "justify-start" : "justify-end",
                )}
              >
                <div
                  className={cn(
                    "relative max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 shadow-2xs transition-all text-xs",
                    isContact
                      ? "rounded-tl-xs bg-card border border-border text-foreground"
                      : isAI
                      ? "rounded-tr-xs bg-amber-500/15 border border-amber-500/30 text-foreground"
                      : "rounded-tr-xs bg-primary text-primary-foreground font-medium",
                  )}
                >
                  {/* Badge de IA se a mensagem foi enviada pelo agente */}
                  {isAI && (
                    <div className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1">
                      <Sparkles className="h-3 w-3" />
                      <span>Agente de IA</span>
                    </div>
                  )}

                  {/* Renderização de Imagem */}
                  {msg.content_type === "image" && (
                    <div className="mb-2 overflow-hidden rounded-xl bg-black/5">
                      {msg.media_url ? (
                        <img
                          src={msg.media_url}
                          alt="Anexo de Imagem"
                          onClick={() => setLightboxImage(msg.media_url || null)}
                          className="max-h-64 w-full object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
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
                            {(msg.metadata?.file_name as string) || "Documento.pdf"}
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

                  {/* Rodapé da Mensagem (Horário + Status de Entrega) */}
                  <div
                    className={cn(
                      "mt-1.5 flex items-center justify-end gap-1 text-[10px] opacity-70",
                      !isContact && "text-primary-foreground/80",
                    )}
                  >
                    <span>{formatMsgTime(msg.created_at)}</span>
                    {!isContact && (
                      <MessageStatusIcon status={msg.status} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Indicador de Digitação do Cliente */}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl rounded-tl-xs bg-card border border-border px-3.5 py-2.5 shadow-2xs text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {activeConversation.contact?.name || "Cliente"}
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

const MessageStatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "sent":
      return (
        <span title="Enviado">
          <Check className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      );
    case "delivered":
      return (
        <span title="Entregue">
          <CheckCheck className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
      );
    case "read":
      return (
        <span title="Lido">
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
