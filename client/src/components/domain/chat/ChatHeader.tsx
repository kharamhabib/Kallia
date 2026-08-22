import { useState } from "react";
import {
  Phone,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Tag as TagIcon,
  PanelRightOpen,
  PanelRightClose,
  Plus,
  X,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/Switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversationsStore } from "@/stores/conversations";
import { useNavigation } from "@/stores/navigation";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  onToggleDrawer: () => void;
  isDrawerOpen: boolean;
}

export const ChatHeader = ({ onToggleDrawer, isDrawerOpen }: ChatHeaderProps) => {
  const activeConversation = useConversationsStore(
    (s) => s.activeConversation,
  );
  const selectConversation = useConversationsStore(
    (s) => s.selectConversation,
  );
  const tags = useConversationsStore((s) => s.tags);
  const typingMap = useConversationsStore((s) => s.typingMap);
  const updateConversationStatus = useConversationsStore(
    (s) => s.updateConversationStatus,
  );
  const toggleAIActive = useConversationsStore((s) => s.toggleAIActive);
  const addTagToConversation = useConversationsStore(
    (s) => s.addTagToConversation,
  );
  const removeTagFromConversation = useConversationsStore(
    (s) => s.removeTagFromConversation,
  );
  const { navigateToWebphone } = useNavigation();

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  if (!activeConversation) return null;

  const contact = activeConversation.contact;
  const typingState = typingMap[activeConversation.id];
  const isTyping = Boolean(
    typingState &&
      (typeof typingState === "boolean" ? typingState : (typingState as any)?.isTyping),
  );
  const typingMedia =
    typeof typingState === "object" && typingState !== null && "media" in typingState
      ? (typingState as any).media
      : "text";
  const isResolved = activeConversation.status === "resolved";

  const handleToggleStatus = async () => {
    setIsUpdatingStatus(true);
    try {
      const nextStatus = isResolved ? "open" : "resolved";
      await updateConversationStatus(activeConversation.id, nextStatus);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const contactTags = activeConversation.tags || [];
  const availableTags = tags.filter(
    (t) => !contactTags.some((ct) => ct.id === t.id),
  );

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card/80 px-3 sm:px-4 backdrop-blur-md gap-2 select-none">
      {/* Informações do Contato & Voltar no Mobile */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        {/* Botão Voltar Mobile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => selectConversation(null)}
          className="md:hidden h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          title="Voltar para a lista de conversas"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <div className="relative shrink-0">
          <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs sm:text-sm border">
            {contact?.avatar_url ? (
              <img
                src={contact.avatar_url}
                alt={contact.name}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span>
                {contact?.name
                  ? contact.name.slice(0, 2).toUpperCase()
                  : "WA"}
              </span>
            )}
          </div>
          {/* Badge do canal WhatsApp */}
          <div
            className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-2xs text-[8px] sm:text-[9px] font-bold"
            title="WhatsApp"
          >
            💬
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="truncate text-xs sm:text-sm font-bold text-foreground">
              {contact?.name || contact?.phone || "Conversa"}
            </h3>
            {isResolved && (
              <Badge variant="outline" className="text-[9px] sm:text-[10px] text-muted-foreground border-border py-0 shrink-0">
                Resolvida
              </Badge>
            )}
          </div>

          <p className="truncate text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1">
            {isTyping ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                {typingMedia === "audio" ? "gravando áudio..." : "digitando..."}
              </span>
            ) : (
              <span className="font-mono">{contact?.phone || ""}</span>
            )}
          </p>
        </div>
      </div>

      {/* Ações do Chat */}
      <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
        {/* Toggle de IA Ativa */}
        <div
          className={cn(
            "hidden md:flex items-center gap-1.5 rounded-xl px-2 py-1 border transition-all text-xs font-medium shrink-0",
            activeConversation.ai_active
              ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
              : "bg-muted/40 border-border text-muted-foreground",
          )}
          title="Ativar/Desativar resposta automática do agente de IA nesta conversa"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="text-[10px] font-semibold hidden lg:inline">IA</span>
          <Switch
            checked={activeConversation.ai_active}
            onChange={(checked: boolean) =>
              toggleAIActive(activeConversation.id, checked)
            }
          />
        </div>

        {/* Gerenciador de Tags */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 sm:px-2.5 gap-1 rounded-lg text-xs font-medium cursor-pointer shrink-0"
              title="Gerenciar tags da conversa"
            >
              <TagIcon className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Tags</span>
              {contactTags.length > 0 && (
                <span className="rounded-full bg-primary/15 px-1 py-0.2 text-[9px] font-bold text-primary">
                  {contactTags.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Tags da Conversa</DropdownMenuLabel>
            <div className="flex flex-wrap gap-1 p-2 max-h-32 overflow-y-auto">
              {contactTags.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">Nenhuma tag vinculada</span>
              ) : (
                contactTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    style={{ backgroundColor: `${tag.color}20`, color: tag.color, borderColor: `${tag.color}40` }}
                    className="text-[10px] font-semibold gap-1 pr-1 border"
                  >
                    <span>{tag.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTagFromConversation(activeConversation.id, tag.id);
                      }}
                      className="rounded-full hover:bg-black/10 p-0.5"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
            {availableTags.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">
                  Adicionar Tag
                </DropdownMenuLabel>
                {availableTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.id}
                    onClick={() => addTagToConversation(activeConversation.id, tag.id)}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span>{tag.name}</span>
                    <Plus className="ml-auto h-3 w-3 text-muted-foreground" />
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Ligar pelo Webphone */}
        {contact?.phone && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateToWebphone(contact.phone)}
            className="h-8 px-2 sm:px-2.5 gap-1 rounded-lg text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-500/30 cursor-pointer shrink-0"
            title="Iniciar Ligação pelo WhatsApp (Webphone)"
          >
            <Phone className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Ligar</span>
          </Button>
        )}

        {/* Resolver / Reabrir */}
        <Button
          variant={isResolved ? "outline" : "default"}
          size="sm"
          disabled={isUpdatingStatus}
          onClick={handleToggleStatus}
          className={cn(
            "h-8 px-2 sm:px-2.5 gap-1 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-all shrink-0",
            !isResolved && "bg-emerald-600 hover:bg-emerald-700 text-white",
          )}
          title={isResolved ? "Reabrir conversa" : "Marcar conversa como resolvida"}
        >
          {isResolved ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reabrir</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Resolver</span>
            </>
          )}
        </Button>

        {/* Botão para abrir gaveta de detalhes do contato */}
        <Button
          variant={isDrawerOpen ? "secondary" : "ghost"}
          size="icon"
          onClick={onToggleDrawer}
          className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
          title={isDrawerOpen ? "Ocultar Detalhes" : "Ver Detalhes do Contato"}
        >
          {isDrawerOpen ? (
            <PanelRightClose className="h-4 w-4 text-primary" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
};
