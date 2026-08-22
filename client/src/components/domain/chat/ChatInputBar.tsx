import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import {
  Send,
  Paperclip,
  Smile,
  Mic,
  Trash2,
  Image as ImageIcon,
  FileText,
  Video,
  Lock,
  MessageSquare,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useConversationsStore } from "@/stores/conversations";
import { cn } from "@/lib/utils";

const EMOJI_LIST = [
  "😀", "😃", "😄", "😁", "😅", "😂", "🤣", "😊", "😇", "🙂", "😉", "😍",
  "🥰", "😘", "😋", "😜", "😎", "🥳", "🤩", "🤔", "🤫", "🤭", "🙄", "😴",
  "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️", "🤞", "👋", "🔥", "✨",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💯", "🎉", "🚀", "📞", "💬",
  "⭐", "✅", "❌", "⚠️", "📌", "📍", "💼", "💰", "🧾", "📊", "🕒", "📅",
];

export const ChatInputBar = () => {
  const activeConversation = useConversationsStore(
    (s) => s.activeConversation,
  );
  const sendMessage = useConversationsStore((s) => s.sendMessage);
  const isSendingMessage = useConversationsStore((s) => s.isSendingMessage);
  const sendTypingSignal = useConversationsStore((s) => s.sendTypingSignal);
  const replyingToMessage = useConversationsStore((s) => s.replyingToMessage);
  const setReplyingToMessage = useConversationsStore((s) => s.setReplyingToMessage);

  const [text, setText] = useState("");
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // File Upload State
  const [selectedFile, setSelectedFile] = useState<{
    file: File;
    previewUrl?: string;
    type: "image" | "audio" | "document" | "video";
    base64: string;
  } | null>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileInputAccept, setFileInputAccept] = useState("*/*");

  const convId = activeConversation?.id;

  useEffect(() => {
    setText("");
    setSelectedFile(null);
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }, [convId]);

  // Dispara sinal de digitação throttled
  const handleTextChange = (val: string) => {
    setText(val);
    if (convId) {
      if (!typingTimerRef.current) {
        sendTypingSignal(convId, true, "text");
      } else {
        clearTimeout(typingTimerRef.current);
      }
      typingTimerRef.current = setTimeout(() => {
        sendTypingSignal(convId, false, "text");
        typingTimerRef.current = null;
      }, 2500);
    }
  };

  const handleSend = async () => {
    if (!activeConversation) return;

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (convId) {
      sendTypingSignal(convId, false, "text");
    }

    const replyToId = replyingToMessage?.id;

    if (selectedFile) {
      await sendMessage({
        content: text.trim(),
        content_type: isNoteMode ? "note" : selectedFile.type,
        base64: selectedFile.base64,
        file_name: selectedFile.file.name,
        mimetype: selectedFile.file.type,
        reply_to_id: replyToId,
      });
      setSelectedFile(null);
      setText("");
      return;
    }

    if (!text.trim()) return;

    const content = text.trim();
    setText("");
    await sendMessage({
      content,
      content_type: isNoteMode ? "note" : "text",
      reply_to_id: replyToId,
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // ── Upload de Arquivos ────────────────────────────────────────────────

  const openFilePicker = (accept: string) => {
    setFileInputAccept(accept);
    setTimeout(() => {
      fileInputRef.current?.click();
    }, 50);
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let type: "image" | "audio" | "document" | "video" = "document";
    if (file.type.startsWith("image/")) type = "image";
    else if (file.type.startsWith("audio/")) type = "audio";
    else if (file.type.startsWith("video/")) type = "video";

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setSelectedFile({
        file,
        type,
        base64,
        previewUrl: type === "image" ? URL.createObjectURL(file) : undefined,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Gravador de Voz (PTT / Voice Note) ────────────────────────────────

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let chosenMime = "";
      if (typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          chosenMime = "audio/ogg;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          chosenMime = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          chosenMime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          chosenMime = "audio/webm";
        }
      }

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);
      if (convId) {
        sendTypingSignal(convId, true, "audio");
      }

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Erro ao acessar microfone:", err);
    }
  };

  const stopAndSendRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (convId) {
      sendTypingSignal(convId, false, "audio");
    }

    mediaRecorderRef.current.onstop = () => {
      const activeMime = mediaRecorderRef.current?.mimeType || "audio/ogg; codecs=opus";
      const blob = new Blob(audioChunksRef.current, { type: activeMime });
      const ext = activeMime.includes("ogg")
        ? "ogg"
        : activeMime.includes("mp4")
        ? "mp4"
        : "webm";

      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        void sendMessage({
          content: "",
          content_type: "audio",
          base64,
          file_name: `audio_${Date.now()}.${ext}`,
          mimetype: activeMime,
        });
      };
      reader.readAsDataURL(blob);
      setIsRecording(false);
    };

    mediaRecorderRef.current.stop();
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (convId) {
      sendTypingSignal(convId, false, "audio");
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    audioChunksRef.current = [];
  };

  if (!activeConversation) return null;

  return (
    <footer className="shrink-0 border-t bg-card/90 p-2.5 sm:p-3 backdrop-blur-md">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={fileInputAccept}
        className="hidden"
        onChange={handleFileSelected}
      />

      {/* Prévia de Citação / Resposta (Reply) */}
      {replyingToMessage && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs transition-all animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-8 w-1 shrink-0 rounded-full bg-primary" />
            <div className="overflow-hidden">
              <span className="font-bold text-primary block truncate text-[11px]">
                {replyingToMessage.sender_type === "contact"
                  ? activeConversation?.contact?.name || "Contato"
                  : "Você"}
              </span>
              <span className="text-muted-foreground truncate block text-[11px]">
                {replyingToMessage.content_type === "image" && "📷 Foto "}
                {replyingToMessage.content_type === "audio" && "🎵 Áudio "}
                {replyingToMessage.content_type === "video" && "🎥 Vídeo "}
                {replyingToMessage.content_type === "document" && "📄 Documento "}
                {replyingToMessage.content || "(Anexo de mídia)"}
              </span>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setReplyingToMessage(null)}
            className="h-6 w-6 shrink-0 rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
            title="Cancelar resposta"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* Alternador de Modo (Mensagem Externa vs Nota Interna) */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-0.5 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setIsNoteMode(false)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all cursor-pointer",
              !isNoteMode
                ? "bg-card text-emerald-600 dark:text-emerald-400 shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>WhatsApp</span>
          </button>
          <button
            type="button"
            onClick={() => setIsNoteMode(true)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-all cursor-pointer",
              isNoteMode
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Nota Interna</span>
          </button>
        </div>

        {isNoteMode && (
          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
            🔒 Esta mensagem será salva como anotação privada e NÃO será enviada ao cliente.
          </span>
        )}
      </div>

      {/* Modo de Gravação de Áudio Ativo */}
      {isRecording ? (
        <div className="flex items-center gap-3 rounded-2xl bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive animate-pulse">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-destructive animate-ping" />
            <span className="font-bold text-xs">Gravando áudio...</span>
            <span className="font-mono font-bold text-xs">{formatSeconds(recordingSeconds)}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={cancelRecording}
              className="h-8 gap-1 rounded-xl text-xs font-semibold hover:bg-destructive/20 border-destructive/30 text-destructive cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Cancelar</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={stopAndSendRecording}
              className="h-8 gap-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Enviar Áudio</span>
            </Button>
          </div>
        </div>
      ) : (
        /* Barra de Entrada Padrão */
        <div className="flex items-end gap-2">
          {/* Menu de Anexos */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
                title="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                onClick={() => openFilePicker("image/*,video/*")}
                className="gap-2.5 text-xs cursor-pointer"
              >
                <ImageIcon className="h-4 w-4 text-purple-500" />
                <span>Fotos e Vídeos</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openFilePicker(".pdf,.doc,.docx,.xls,.xlsx,.txt")}
                className="gap-2.5 text-xs cursor-pointer"
              >
                <FileText className="h-4 w-4 text-blue-500" />
                <span>Documentos & PDF</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => openFilePicker("audio/*")}
                className="gap-2.5 text-xs cursor-pointer"
              >
                <Video className="h-4 w-4 text-amber-500" />
                <span>Áudio / Música</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Seletor de Emojis */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowEmojiPicker((prev) => !prev)}
              className="h-10 w-10 shrink-0 rounded-xl text-muted-foreground hover:text-foreground cursor-pointer"
              title="Inserir Emoji"
            >
              <Smile className="h-4 w-4" />
            </Button>

            {showEmojiPicker && (
              <div className="absolute bottom-12 left-0 z-50 w-64 rounded-2xl border bg-card p-2.5 shadow-xl grid grid-cols-6 gap-1 max-h-48 overflow-y-auto custom-scrollbar">
                {EMOJI_LIST.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      handleTextChange(text + emoji);
                      setShowEmojiPicker(false);
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted text-base transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input de Texto */}
          <div className="flex-1 relative">
            <Textarea
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isNoteMode
                  ? "Escreva uma nota interna privada..."
                  : "Digite uma mensagem..."
              }
              rows={1}
              className={cn(
                "min-h-[40px] max-h-32 resize-none rounded-xl py-2.5 px-3 text-xs leading-relaxed transition-all",
                isNoteMode
                  ? "border-amber-500/40 bg-amber-500/[0.04] focus-visible:ring-amber-500/30"
                  : "border-border bg-background focus-visible:ring-primary/20",
              )}
            />
          </div>

          {/* Botão de Gravar Áudio ou Enviar */}
          {text.trim() || selectedFile ? (
            <Button
              onClick={handleSend}
              disabled={isSendingMessage}
              className={cn(
                "h-10 w-10 shrink-0 rounded-xl p-0 shadow-2xs cursor-pointer transition-all",
                isNoteMode
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white",
              )}
              title="Enviar Mensagem"
            >
              <Send className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={startVoiceRecording}
              className="h-10 w-10 shrink-0 rounded-xl text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-500/30 cursor-pointer"
              title="Gravar Áudio"
            >
              <Mic className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}

      {/* Modal de Preview de Anexo */}
      <Dialog
        open={Boolean(selectedFile)}
        onOpenChange={(open) => !open && setSelectedFile(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" />
              <span>Confirmar Envio de Anexo</span>
            </DialogTitle>
          </DialogHeader>

          {selectedFile && (
            <div className="space-y-3 py-2 text-xs">
              {selectedFile.type === "image" && selectedFile.previewUrl && (
                <div className="overflow-hidden rounded-xl bg-black/5 max-h-56 flex items-center justify-center">
                  <img
                    src={selectedFile.previewUrl}
                    alt="Preview"
                    className="max-h-56 w-auto object-contain rounded-lg"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3">
                <FileText className="h-5 w-5 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{selectedFile.file.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {(selectedFile.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>

              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Adicionar uma legenda (opcional)..."
                rows={2}
                className="text-xs rounded-xl"
              />
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedFile(null)}
              className="rounded-xl text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={isSendingMessage}
              className="gap-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Enviar</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </footer>
  );
};

const formatSeconds = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
};
