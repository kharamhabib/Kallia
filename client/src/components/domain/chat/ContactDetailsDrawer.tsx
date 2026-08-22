import {
  Phone,
  Mail,
  Building2,
  Tag as TagIcon,
  Plus,
  X,
  KanbanSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useConversationsStore } from "@/stores/conversations";
import { useNavigation } from "@/stores/navigation";
import { apiPost, apiDelete } from "@/lib/api";
import { toast } from "sonner";

export const ContactDetailsDrawer = () => {
  const activeConversation = useConversationsStore(
    (s) => s.activeConversation,
  );
  const tags = useConversationsStore((s) => s.tags);
  const { navigateToWebphone } = useNavigation();

  if (!activeConversation) return null;

  const contact = activeConversation.contact;
  if (!contact) return null;

  const contactTags = contact.tags || activeConversation.tags || [];
  const availableTags = tags.filter(
    (t) => !contactTags.some((ct) => ct.id === t.id),
  );

  const handleAddTag = async (tagId: string) => {
    try {
      await apiPost(`/api/contacts/${contact.id}/tags`, { tag_id: tagId });
      toast.success("Tag vinculada ao contato!");
    } catch (err) {
      toast.error("Erro ao vincular tag");
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    try {
      await apiDelete(`/api/contacts/${contact.id}/tags/${tagId}`);
      toast.success("Tag removida!");
    } catch (err) {
      toast.error("Erro ao remover tag");
    }
  };

  return (
    <aside className="w-80 shrink-0 border-l bg-card/40 p-4 space-y-5 overflow-y-auto custom-scrollbar select-none text-xs">
      {/* Header do Perfil */}
      <div className="flex flex-col items-center text-center space-y-2 pt-2">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xl border">
          {contact.avatar_url ? (
            <img
              src={contact.avatar_url}
              alt={contact.name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <span>{contact.name ? contact.name.slice(0, 2).toUpperCase() : "WA"}</span>
          )}
        </div>
        <div className="space-y-0.5 min-w-0 w-full">
          <h3 className="font-bold text-sm text-foreground truncate">{contact.name || "Contato"}</h3>
          <p className="text-xs text-muted-foreground font-mono truncate">{contact.phone}</p>
        </div>
      </div>

      {/* Botões de Ação Rápida */}
      <div className="grid grid-cols-2 gap-2">
        {contact.phone && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateToWebphone(contact.phone)}
            className="h-9 gap-1.5 rounded-xl text-xs font-semibold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 border-emerald-500/30 cursor-pointer"
          >
            <Phone className="h-3.5 w-3.5" />
            <span>Ligar</span>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => toast.info("Módulo Kanban será aberto na Fase 4!")}
          className="h-9 gap-1.5 rounded-xl text-xs font-semibold hover:bg-primary/10 border-primary/30 text-primary cursor-pointer"
        >
          <KanbanSquare className="h-3.5 w-3.5" />
          <span>Criar Deal</span>
        </Button>
      </div>

      {/* Informações de Contato */}
      <div className="space-y-3 rounded-2xl bg-muted/40 p-3.5 border">
        <h4 className="font-bold text-foreground text-xs uppercase tracking-wider text-muted-foreground">
          Dados do Contato
        </h4>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Phone className="h-4 w-4 shrink-0 text-primary" />
            <span className="font-mono text-foreground select-all">{contact.phone || "—"}</span>
          </div>

          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Mail className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground truncate">{contact.email || "Sem e-mail"}</span>
          </div>

          <div className="flex items-center gap-2.5 text-muted-foreground">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-foreground truncate">
              {(contact.custom_attrs?.company as string) || "Empresa não informada"}
            </span>
          </div>
        </div>
      </div>

      {/* Tags do Contato */}
      <div className="space-y-2.5 rounded-2xl bg-muted/40 p-3.5 border">
        <div className="flex items-center justify-between">
          <h4 className="font-bold text-foreground text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <TagIcon className="h-3.5 w-3.5 text-primary" />
            <span>Tags do Contato</span>
          </h4>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-primary">
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-xs">Vincular Tag</DropdownMenuLabel>
              {availableTags.length === 0 ? (
                <span className="p-2 text-[11px] text-muted-foreground block">
                  Todas as tags já vinculadas
                </span>
              ) : (
                availableTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.id}
                    onClick={() => handleAddTag(tag.id)}
                    className="text-xs gap-2 cursor-pointer"
                  >
                    <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    <span>{tag.name}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {contactTags.length === 0 ? (
            <span className="text-[11px] text-muted-foreground">Nenhuma tag cadastrada</span>
          ) : (
            contactTags.map((tag) => (
              <Badge
                key={tag.id}
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                  borderColor: `${tag.color}40`,
                }}
                className="text-[10px] font-semibold gap-1 pr-1 border"
              >
                <span>{tag.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag.id)}
                  className="rounded-full hover:bg-black/10 p-0.5"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))
          )}
        </div>
      </div>
    </aside>
  );
};
