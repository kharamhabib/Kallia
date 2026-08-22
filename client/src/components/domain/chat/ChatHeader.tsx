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
  const isTyping = Boolean(typingMap[activeConversation.id]);
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
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-md">
      {/* Informações do Contato */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="relative">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm border">
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
            className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-2xs text-[9px] font-bold"
            title="WhatsApp"
          >
            💬
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-bold text-foreground">
              {contact?.name || contact?.phone || "Conversa"}
            </h3>
            {isResolved && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground border-border py-0">
                Resolvida
              </Badge>
            )}
          </div>

          <p className="truncate text-xs text-muted-foreground flex items-center gap-1.5">
            {isTyping ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold animate-pulse">
                digitando...
              </span>
            ) : (
              <span>{contact?.phone || ""}</span>
            )}
          </p>
        </div>
      </div>

      {/* Ações do Chat */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Toggle de IA Ativa */}
        <div
          className={cn(
            "hidden md:flex items-center gap-2 rounded-xl px-2.5 py-1.5 border transition-all text-xs font-medium",
            activeConversation.ai_active
              ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
              : "bg-muted/40 border-border text-muted-foreground",
          )}
          title="Ativar/Desativar resposta automática do agente de IA nesta conversa"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold">IA</span>
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
              className="h-8 gap-1.5 rounded-lg text-xs font-medium cursor-pointer"
            >
              <TagIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tags</span>
              {contactTags.length > 0 && (
                <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-primary">
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
            className="h-8 gap-1.5 rounded-lg text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-500/30 cursor-pointer"
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
            "h-8 gap-1.5 rounded-lg text-xs font-semibold cursor-pointer shadow-2xs transition-all",
            !isResolved && "bg-emerald-600 hover:bg-emerald-700 text-white",
          )}
        >
          {isResolved ? (
            <>
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reabrir</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Resolver</span>
            </>
          )}
        </Button>

        {/* Botão para abrir gaveta de detalhes do contato */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleDrawer}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          title={isDrawerOpen ? "Ocultar Detalhes" : "Ver Detalhes do Contato"}
        >
          {isDrawerOpen ? (
            <PanelRightClose className="h-4 w-4" />
          ) : (
            <PanelRightOpen className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
};
