import { useState } from "react";
import {
  Search,
  Filter,
  Sparkles,
  Image as ImageIcon,
  Mic,
  FileText,
  Lock,
  ChevronDown,
  Plus,
  MessageSquarePlus,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversationsStore } from "@/stores/conversations";
import { useWorkspaceStore } from "@/stores/workspace";
import type { Conversation } from "@/types/omnichannel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const ConversationsList = () => {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace);
  const conversations = useConversationsStore((s) => s.conversations);
  const activeConversationId = useConversationsStore(
    (s) => s.activeConversationId,
  );
  const selectConversation = useConversationsStore(
    (s) => s.selectConversation,
  );
  const startConversation = useConversationsStore(
    (s) => s.startConversation,
  );
  const filters = useConversationsStore((s) => s.filters);
  const setFilters = useConversationsStore((s) => s.setFilters);
  const fetchConversations = useConversationsStore(
    (s) => s.fetchConversations,
  );
  const tags = useConversationsStore((s) => s.tags);
  const isLoading = useConversationsStore((s) => s.isLoadingConversations);

  const [searchInput, setSearchInput] = useState(filters.search);

  // Modal Nova Conversa State
  const [isNewConvOpen, setIsNewConvOpen] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [newInitialMsg, setNewInitialMsg] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const handleStartNewConversation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWorkspace?.id || !newPhone.trim()) return;

    setIsStarting(true);
    try {
      await startConversation(
        currentWorkspace.id,
        newPhone.trim(),
        newName.trim(),
        newInitialMsg.trim(),
      );
      toast.success("Conversa iniciada com sucesso!");
      setIsNewConvOpen(false);
      setNewPhone("");
      setNewName("");
      setNewInitialMsg("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar conversa");
    } finally {
      setIsStarting(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ search: searchInput });
    if (currentWorkspace?.id) {
      void fetchConversations(currentWorkspace.id);
    }
  };

  const handleStatusTab = (status: "open" | "pending" | "resolved" | "all") => {
    setFilters({ status });
    if (currentWorkspace?.id) {
      void fetchConversations(currentWorkspace.id);
    }
  };

  const handleAssigneeFilter = (assignee: "all" | "me" | "unassigned") => {
    setFilters({ assignee });
    if (currentWorkspace?.id) {
      void fetchConversations(currentWorkspace.id);
    }
  };

  const handleTagFilter = (tagId: string) => {
    setFilters({ tagId: filters.tagId === tagId ? "" : tagId });
    if (currentWorkspace?.id) {
      void fetchConversations(currentWorkspace.id);
    }
  };

  return (
    <div className="flex h-full flex-col border-r bg-card/60">
      {/* Header & Busca */}
      <div className="p-3 border-b space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">Conversas</h2>
            <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[10px] font-bold">
              {conversations.length}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Botão Nova Conversa */}
            <Button
              size="sm"
              onClick={() => setIsNewConvOpen(true)}
              className="h-8 px-2 sm:px-2.5 gap-1 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-2xs shrink-0"
              title="Iniciar Nova Conversa via WhatsApp"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Nova Conversa</span>
            </Button>

            {/* Filtros Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 px-2 gap-1 rounded-lg text-xs font-medium cursor-pointer shrink-0",
                    (filters.assignee !== "all" || filters.tagId || filters.channel !== "all") &&
                      "border-primary text-primary font-bold bg-primary/5",
                  )}
                  title="Filtros de Atribuição e Canal"
                >
                  <Filter className="h-3.5 w-3.5" />
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs">Atribuição</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => handleAssigneeFilter("all")}
                  className={cn("text-xs cursor-pointer", filters.assignee === "all" && "font-bold text-primary")}
                >
                  Todas as conversas
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAssigneeFilter("unassigned")}
                  className={cn("text-xs cursor-pointer", filters.assignee === "unassigned" && "font-bold text-primary")}
                >
                  Não atribuídas
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleAssigneeFilter("me")}
                  className={cn("text-xs cursor-pointer", filters.assignee === "me" && "font-bold text-primary")}
                >
                  Minhas conversas
                </DropdownMenuItem>

                {tags.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs">Filtrar por Tag</DropdownMenuLabel>
                    {tags.map((tag) => (
                      <DropdownMenuItem
                        key={tag.id}
                        onClick={() => handleTagFilter(tag.id)}
                        className={cn(
                          "text-xs gap-2 cursor-pointer",
                          filters.tagId === tag.id && "font-bold text-primary",
                        )}
                      >
                        <div
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span>{tag.name}</span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Input de Busca */}
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="h-8.5 rounded-xl pl-8 text-xs bg-background/80"
          />
        </form>

        {/* Tabs de Status */}
        <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-0.5 text-xs font-semibold">
          {(["open", "pending", "resolved", "all"] as const).map((tab) => {
            const labels = {
              open: "Abertas",
              pending: "Pendentes",
              resolved: "Resolvidas",
              all: "Todas",
            };
            const isActive = filters.status === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => handleStatusTab(tab)}
                className={cn(
                  "flex-1 py-1 text-center rounded-lg transition-all cursor-pointer text-[11px]",
                  isActive
                    ? "bg-card text-foreground font-bold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista de Cards de Conversas */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
        {isLoading && conversations.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">
            Nenhuma conversa encontrada neste filtro.
          </div>
        ) : (
          conversations.map((conv) => {
            const isActive = conv.id === activeConversationId;
            const contact = conv.contact;
            const lastMsg = conv.last_message;

            return (
              <div
                key={conv.id}
                onClick={() => selectConversation(conv.id)}
                className={cn(
                  "group relative flex items-start gap-3 rounded-2xl p-3 text-xs transition-all cursor-pointer border select-none",
                  isActive
                    ? "bg-primary/10 border-primary/30 shadow-2xs"
                    : "bg-card/40 border-transparent hover:border-border hover:bg-card",
                )}
              >
                {/* Avatar com Badge do WhatsApp */}
                <div className="relative shrink-0 mt-0.5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs border">
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
                  <div
                    className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white text-[8px]"
                    title="WhatsApp"
                  >
                    💬
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <h4 className="truncate font-bold text-xs text-foreground">
                      {contact?.name || contact?.phone || "Contato"}
                    </h4>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatConvDate(conv.last_msg_at)}
                    </span>
                  </div>

                  {/* Prévia da Mensagem */}
                  <p className="truncate text-[11px] text-muted-foreground flex items-center gap-1">
                    {renderMessagePreview(lastMsg)}
                  </p>

                  {/* Badges de Tags e Status de IA */}
                  <div className="flex flex-wrap items-center gap-1 pt-0.5">
                    {conv.ai_active && (
                      <Badge
                        variant="secondary"
                        className="h-4 gap-1 px-1.5 text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 py-0"
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        <span>IA Ativa</span>
                      </Badge>
                    )}
                    {conv.tags?.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag.id}
                        style={{
                          backgroundColor: `${tag.color}20`,
                          color: tag.color,
                          borderColor: `${tag.color}40`,
                        }}
                        className="h-4 px-1.5 text-[9px] font-semibold border py-0"
                      >
                        {tag.name}
                      </Badge>
                    ))}
                    {(conv.tags?.length || 0) > 2 && (
                      <span className="text-[9px] text-muted-foreground font-semibold">
                        +{(conv.tags?.length || 0) - 2}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Iniciar Nova Conversa */}
      <Dialog open={isNewConvOpen} onOpenChange={setIsNewConvOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-emerald-500" />
              <span>Iniciar Nova Conversa via WhatsApp</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleStartNewConversation} className="space-y-3.5 py-2 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Número do WhatsApp (com DDI e DDD) *
              </label>
              <Input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Ex: 5511999998888"
                required
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Nome do Contato (Opcional)
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: João da Silva"
                className="h-9 rounded-xl text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-muted-foreground">
                Mensagem Inicial (Opcional)
              </label>
              <Textarea
                value={newInitialMsg}
                onChange={(e) => setNewInitialMsg(e.target.value)}
                placeholder="Digite a primeira mensagem para ser enviada automaticamente..."
                rows={3}
                className="text-xs rounded-xl"
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewConvOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isStarting || !newPhone.trim()}
                className="gap-1.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{isStarting ? "Iniciando..." : "Iniciar Conversa"}</span>
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const renderMessagePreview = (msg?: Conversation["last_message"]) => {
  if (!msg) return <span>Nenhuma mensagem</span>;
  if (msg.content_type === "image")
    return (
      <>
        <ImageIcon className="h-3 w-3 text-purple-500 shrink-0" />
        <span>Foto</span>
      </>
    );
  if (msg.content_type === "audio")
    return (
      <>
        <Mic className="h-3 w-3 text-emerald-500 shrink-0" />
        <span>Áudio</span>
      </>
    );
  if (msg.content_type === "document")
    return (
      <>
        <FileText className="h-3 w-3 text-blue-500 shrink-0" />
        <span>Documento</span>
      </>
    );
  if (msg.content_type === "note")
    return (
      <>
        <Lock className="h-3 w-3 text-amber-500 shrink-0" />
        <span>Nota interna</span>
      </>
    );
  return <span>{msg.content || "..."}</span>;
};

const formatConvDate = (dateStr: string) => {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { day: "2-digit", month: "2-digit" });
  } catch {
    return "";
  }
};
