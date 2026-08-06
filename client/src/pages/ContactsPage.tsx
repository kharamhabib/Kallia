import { useState, useMemo, useEffect } from "react";
import {
  Users,
  Search,
  Plus,
  PhoneCall,
  Mail,
  Building2,
  Tag,
  LayoutGrid,
  List,
  Edit2,
  Trash2,
  UserCheck,
  Building,
  NotebookTabs,
  Clock,
  Sparkles,
  Quote,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useContacts, useSaveContact, useDeleteContact } from "@/hooks/useContacts";
import { useHistory } from "@/hooks/useHistory";
import type { HistoryRow } from "@/types/history";
import { useNavigation } from "@/stores/navigation";
import { formatPhoneNumber, getInitials, formatEndReason } from "@/utils/format";
import type { Contact, UpsertContactPayload } from "@/types/contact";
import { ConfirmModal } from "@/components/shared/ConfirmModal";

interface ContactsPageProps {
  sid?: string | null;
}

export const ContactsPage = ({ sid }: ContactsPageProps) => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Queries & Mutations
  const { data: rawContacts, isLoading } = useContacts(sid, debouncedSearch);
  const contacts = useMemo(() => (Array.isArray(rawContacts) ? rawContacts : []), [rawContacts]);
  const { data: rawHistory } = useHistory(sid || "", !!sid);
  const history = useMemo(() => (Array.isArray(rawHistory) ? rawHistory : []), [rawHistory]);
  const saveMutation = useSaveContact(sid || "");
  const deleteMutation = useDeleteContact(sid || "");

  // Form State
  const [formData, setFormData] = useState<UpsertContactPayload>({
    phone: "",
    name: "",
    email: "",
    company: "",
    notes: "",
    tags: "",
  });

  const contactHistory = useMemo(() => {
    if (!selectedContact) return [];
    const cleanPhone = selectedContact.phone.replace(/\D/g, "");
    return (history as HistoryRow[]).filter((h: HistoryRow) => {
      const peerClean = (h.peer || "").replace(/\D/g, "");
      return peerClean === cleanPhone || peerClean.includes(cleanPhone);
    });
  }, [selectedContact, history]);

  const handleOpenCreate = () => {
    setEditingContact(null);
    setFormData({
      phone: "",
      name: "",
      email: "",
      company: "",
      notes: "",
      tags: "",
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (contact: Contact, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingContact(contact);
    setFormData({
      phone: contact.phone,
      name: contact.name,
      email: contact.email,
      company: contact.company,
      notes: contact.notes,
      tags: contact.tags,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.phone) return;
    try {
      await saveMutation.mutateAsync({
        id: editingContact?.id,
        data: formData,
      });
      setIsModalOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenDelete = (contact: Contact, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setContactToDelete(contact);
  };

  const confirmDeleteContact = async () => {
    if (!contactToDelete) return;
    try {
      await deleteMutation.mutateAsync(contactToDelete.id);
      if (selectedContact?.id === contactToDelete.id) {
        setIsDetailOpen(false);
      }
      setContactToDelete(null);
    } catch (err) {
      console.error(err);
    }
  };

  const { navigateToWebphone } = useNavigation();

  const handleDial = (phone: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigateToWebphone(phone);
  };

  const stats = useMemo(() => {
    const total = contacts.length;
    const withCompany = contacts.filter((c) => (c?.company || "").trim() !== "").length;
    const withNotes = contacts.filter((c) => (c?.notes || "").trim() !== "").length;
    return { total, withCompany, withNotes };
  }, [contacts]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-7 w-7 text-primary" />
            Base de Contatos & CRM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gerencie contatos, empresas, anotações e acompanhe o histórico das ligações do WhatsApp.
          </p>
        </div>
        <Button onClick={handleOpenCreate} className="gap-2 shadow-sm font-semibold">
          <Plus className="h-4 w-4" /> Novo Contato
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="card-premium border-primary/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Total de Contatos
              </p>
              <h3 className="text-2xl font-black text-foreground mt-1">{stats.total}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <UserCheck className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-premium border-primary/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Com Empresa
              </p>
              <h3 className="text-2xl font-black text-foreground mt-1">{stats.withCompany}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Building className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="card-premium border-primary/10">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Com Anotações / Tags
              </p>
              <h3 className="text-2xl font-black text-foreground mt-1">{stats.withNotes}</h3>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <NotebookTabs className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-primary/10 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, empresa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-background border-primary/10 focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-1 self-end sm:self-auto bg-muted/50 p-1 rounded-lg">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("grid")}
            className="h-8 px-2.5"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("list")}
            className="h-8 px-2.5"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16 bg-card/50 rounded-2xl border border-dashed border-primary/20">
          <Users className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-foreground">Nenhum contato encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            {search
              ? "Nenhum resultado corresponde à sua busca."
              : "Os contatos que ligarem ou enviarem mensagem aparecerão aqui automaticamente, ou você pode cadastrar manualmente."}
          </p>
          {!search && (
            <Button onClick={handleOpenCreate} className="mt-4 gap-2">
              <Plus className="h-4 w-4" /> Cadastrar Primeiro Contato
            </Button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contacts.map((c) => {
            const displayName = c.name || "Contato WhatsApp";
            const initials = getInitials(c.name || "W");
            const isBiz = (c.tags || "").includes("WhatsApp Business") || !!c.company;
            const syncTime = c.enrichedAt || c.updatedAt;

            return (
              <Card
                key={c.id}
                onClick={() => {
                  setSelectedContact(c);
                  setIsDetailOpen(true);
                }}
                className="card-premium hover:shadow-md cursor-pointer transition-all duration-200 border-primary/10 group relative"
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {c.avatarUrl ? (
                          <img
                            src={c.avatarUrl}
                            alt={displayName}
                            className="h-12 w-12 rounded-full object-cover border-2 border-primary/15 shadow-xs"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-sm border-2 border-primary/10">
                            {initials}
                          </div>
                        )}
                        {isBiz && (
                          <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-2 ring-background text-[9px]" title="WhatsApp Business">
                            <Sparkles className="h-2.5 w-2.5" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h4 className="font-bold text-foreground truncate text-base group-hover:text-primary transition-colors flex items-center gap-1.5">
                          <span className="truncate">{displayName}</span>
                        </h4>
                        <p className="text-xs font-mono text-muted-foreground truncate">
                          {formatPhoneNumber(c.phone)}
                        </p>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDial(c.phone, e)}
                      className="h-8 w-8 text-primary hover:bg-primary/10 shrink-0"
                      title="Ligar via Webphone"
                    >
                      <PhoneCall className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Recado / Status do WhatsApp */}
                  {c.notes && (
                    <div className="text-xs text-muted-foreground/90 italic bg-muted/40 px-2.5 py-1.5 rounded-lg border border-border/30 truncate flex items-center gap-1.5">
                      <Quote className="h-3 w-3 text-primary/60 shrink-0" />
                      <span className="truncate">{c.notes}</span>
                    </div>
                  )}

                  {/* Company & Email */}
                  {(c.company || c.email) && (
                    <div className="space-y-1 pt-1 border-t border-border/40 text-xs text-muted-foreground">
                      {c.company && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2 className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                          <span className="truncate font-medium">{c.company}</span>
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tags */}
                  {c.tags && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {c.tags.split(",").map((t, idx) => {
                        const tagText = t.trim();
                        if (!tagText) return null;
                        const isBizTag = tagText === "WhatsApp Business";
                        return (
                          <Badge
                            key={idx}
                            variant="outline"
                            className={
                              isBizTag
                                ? "text-[10px] py-0 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold gap-1"
                                : "text-[10px] py-0 px-1.5 bg-primary/5"
                            }
                          >
                            {isBizTag && <Sparkles className="h-2.5 w-2.5" />}
                            {tagText}
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {/* Card Footer com data/hora de sincronização e ações */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                    {syncTime ? (
                      <div className="flex items-center gap-1 opacity-80" title="Última sincronização com WhatsApp">
                        <Clock className="h-3 w-3 text-primary/60" />
                        <span>
                          {new Date(syncTime).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    ) : (
                      <span />
                    )}

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenEdit(c, e)}
                        className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="h-3 w-3 mr-1" /> Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleOpenDelete(c, e)}
                        className="h-6 px-1.5 text-xs text-destructive hover:bg-destructive/10 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3 mr-1" /> Excluir
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        /* List View */
        <Card className="card-premium overflow-hidden border-primary/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs font-semibold uppercase text-muted-foreground border-b border-border/50">
                <tr>
                  <th className="py-3 px-4">Contato</th>
                  <th className="py-3 px-4">Telefone</th>
                  <th className="py-3 px-4">Empresa</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {contacts.map((c) => {
                  const displayName = c.name || "Contato WhatsApp";
                  const initials = getInitials(c.name || "W");

                  return (
                    <tr
                      key={c.id}
                      onClick={() => {
                        setSelectedContact(c);
                        setIsDetailOpen(true);
                      }}
                      className="hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {c.avatarUrl ? (
                            <img
                              src={c.avatarUrl}
                              alt={displayName}
                              className="h-8 w-8 rounded-full object-cover border border-primary/10"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs">
                              {initials}
                            </div>
                          )}
                          <span className="font-semibold text-foreground">{displayName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                        {formatPhoneNumber(c.phone)}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{c.company || "—"}</td>
                      <td className="py-3 px-4 text-muted-foreground">{c.email || "—"}</td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleDial(c.phone, e)}
                            className="h-8 w-8 text-primary hover:bg-primary/10"
                            title="Ligar"
                          >
                            <PhoneCall className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleOpenEdit(c, e)}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            title="Editar"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => handleOpenDelete(c, e)}
                            className="h-8 w-8 text-destructive hover:bg-destructive/10 cursor-pointer"
                            title="Excluir Contato"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal Criar / Editar Contato */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-lg card-premium">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {editingContact ? "Editar Contato" : "Novo Contato CRM"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone / WhatsApp *</Label>
                <Input
                  id="phone"
                  placeholder="5527999999999"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="name">Nome do Contato</Label>
                <Input
                  id="name"
                  placeholder="Nome completo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="company">Empresa / Cargo</Label>
                <Input
                  id="company"
                  placeholder="Nome da empresa"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="contato@empresa.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tags">Tags (separadas por vírgula)</Label>
              <Input
                id="tags"
                placeholder="Cliente VIP, Prospect, Suporte"
                value={formData.tags}
                onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Anotações / Histórico do Cliente</Label>
              <Textarea
                id="notes"
                placeholder="Detalhes importantes sobre este contato..."
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} className="gap-2 font-semibold">
                {saveMutation.isPending ? "Salvando..." : "Salvar Contato"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Gaveta de Detalhes do Contato */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto space-y-6">
          {selectedContact && (
            <>
              <SheetHeader className="text-left border-b border-border/40 pb-4">
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    {selectedContact.avatarUrl ? (
                      <img
                        src={selectedContact.avatarUrl}
                        alt={selectedContact.name}
                        className="h-16 w-16 rounded-full object-cover border-2 border-primary/20 shadow-md"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xl border-2 border-primary/10">
                        {getInitials(selectedContact.name || "W")}
                      </div>
                    )}
                    {((selectedContact.tags || "").includes("WhatsApp Business") || !!selectedContact.company) && (
                      <div className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center ring-2 ring-background text-[10px]" title="WhatsApp Business">
                        <Sparkles className="h-3 w-3" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-xl font-bold text-foreground truncate flex items-center gap-2">
                      <span className="truncate">{selectedContact.name || "Contato WhatsApp"}</span>
                    </SheetTitle>
                    <SheetDescription className="font-mono text-sm text-primary font-semibold">
                      {formatPhoneNumber(selectedContact.phone)}
                    </SheetDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-3">
                  <Button
                    onClick={(e) => handleDial(selectedContact.phone, e)}
                    className="flex-1 gap-2 shadow-xs font-semibold"
                  >
                    <PhoneCall className="h-4 w-4" /> Ligar Webphone
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => handleOpenEdit(selectedContact, e)}
                    className="cursor-pointer"
                    title="Editar Contato"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={(e) => handleOpenDelete(selectedContact, e)}
                    className="text-destructive hover:bg-destructive/10 cursor-pointer border-destructive/30"
                    title="Excluir Contato"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </SheetHeader>

              {/* Informações de Cadastro & WhatsApp */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Perfil & Dados do WhatsApp</span>
                  {selectedContact.enrichedAt && (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Sincronizado
                    </span>
                  )}
                </h4>

                <div className="space-y-2 text-sm bg-muted/30 p-3.5 rounded-xl border border-border/40">
                  <div className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Building2 className="h-3.5 w-3.5 text-primary/70" /> Empresa / Perfil
                    </span>
                    <span className="font-semibold text-foreground">
                      {selectedContact.company || "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 text-primary/70" /> E-mail
                    </span>
                    <span className="font-semibold text-foreground truncate max-w-[180px]">
                      {selectedContact.email || "—"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-border/30">
                    <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                      <Tag className="h-3.5 w-3.5 text-primary/70" /> Tags
                    </span>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {selectedContact.tags ? (
                        selectedContact.tags.split(",").map((t, idx) => {
                          const tagText = t.trim();
                          if (!tagText) return null;
                          const isBizTag = tagText === "WhatsApp Business";
                          return (
                            <Badge
                              key={idx}
                              variant="outline"
                              className={
                                isBizTag
                                  ? "text-[10px] py-0 px-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 font-semibold gap-1"
                                  : "text-[10px] py-0 px-1.5 bg-primary/5"
                              }
                            >
                              {isBizTag && <Sparkles className="h-2.5 w-2.5" />}
                              {tagText}
                            </Badge>
                          );
                        })
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </div>

                  {(selectedContact.enrichedAt || selectedContact.updatedAt) && (
                    <div className="flex items-center justify-between py-1 border-b border-border/30">
                      <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary/70" /> Última Sincronização
                      </span>
                      <span className="font-mono text-xs text-foreground">
                        {new Date(selectedContact.enrichedAt || selectedContact.updatedAt).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  )}

                  {selectedContact.lid && (
                    <div className="flex items-center justify-between py-1">
                      <span className="text-muted-foreground text-xs">Identificador WhatsApp (LID)</span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {selectedContact.lid}
                      </span>
                    </div>
                  )}
                </div>

                {/* Recado / Status do WhatsApp ou Anotações */}
                {selectedContact.notes && (
                  <div className="space-y-1">
                    <h5 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                      <Quote className="h-3.5 w-3.5 text-primary/70" /> Recado do WhatsApp / Anotações:
                    </h5>
                    <p className="text-xs text-foreground bg-primary/[0.04] p-3 rounded-xl border border-primary/10 leading-relaxed whitespace-pre-wrap italic">
                      "{selectedContact.notes}"
                    </p>
                  </div>
                )}
              </div>

              {/* Histórico de Ligações */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                  <span>Histórico de Chamadas ({contactHistory.length})</span>
                </h4>

                {contactHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6 bg-muted/20 rounded-xl border border-dashed">
                    Nenhuma chamada registrada para este contato.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {contactHistory.slice(0, 10).map((h: HistoryRow) => (
                      <div
                        key={h.callId}
                        className="p-3 rounded-xl border border-border/40 bg-card hover:bg-muted/30 transition-colors space-y-1"
                      >
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-foreground capitalize">
                            {h.direction === "inbound" ? "Recebida" : "Efetuada"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(h.startedAt).toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatEndReason(h.endReason, h.startedAt, h.endedAt, h.direction)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Modal de Confirmação de Exclusão de Contato */}
      <ConfirmModal
        open={!!contactToDelete}
        onOpenChange={(open) => !open && setContactToDelete(null)}
        title="Excluir Contato do CRM"
        description={
          <>
            Tem certeza que deseja excluir permanentemente o contato{" "}
            <span className="font-bold text-foreground font-mono">
              {contactToDelete?.name || (contactToDelete?.phone ? formatPhoneNumber(contactToDelete.phone) : "")}
            </span>
            ? Esta ação removerá o cadastro do CRM e não poderá ser desfeita.
          </>
        }
        confirmText="Excluir Contato"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={confirmDeleteContact}
      />
    </div>
  );
};
