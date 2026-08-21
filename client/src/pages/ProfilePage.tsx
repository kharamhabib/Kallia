import { useState, useEffect, useMemo } from "react";
import {
  User,
  Shield,
  KeyRound,
  Building2,
  Sparkles,
  CheckCircle2,
  Lock,
  Mail,
  Calendar,
  ArrowRight,
  Crown,
  Save,
  Loader2,
  Eye,
  EyeOff,
  CreditCard,
  Layers,
  Smartphone,
  Users,
  Search,
  Activity,
  PhoneCall,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getUser, updateUserProfile, changeUserPassword, type AuthUser } from "@/lib/auth";
import { useWorkspaceStore, type Workspace } from "@/stores/workspace";
import { useNavigation } from "@/stores/navigation";
import {
  getAdminOverview,
  getAdminUsers,
  updateAdminUserRole,
  getAdminWorkspaces,
  updateAdminWorkspace,
  type AdminOverviewStats,
  type AdminUser,
  type AdminWorkspace,
} from "@/services/admin";

type ProfileTab = "general" | "workspaces" | "security" | "plan" | "saas_admin";

const avatarPresets = [
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80",
];

export const ProfilePage = () => {
  const [activeTab, setActiveTab] = useState<ProfileTab>("general");
  const [user, setUser] = useState<AuthUser | null>(getUser());
  const { setActiveSection } = useNavigation();

  // Workspaces Store
  const { workspaces, currentWorkspace, setCurrentWorkspace, fetchWorkspaces, isLoading: loadingWorkspaces } =
    useWorkspaceStore();

  // General Form State
  const [name, setName] = useState(user?.name || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [customAvatar, setCustomAvatar] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  // Security Form State
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showOldPass, setShowOldPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Superadmin SaaS Global Panel State
  const isSuperAdmin = user?.role === "appadmin" || user?.role === "superadmin";
  const [adminStats, setAdminStats] = useState<AdminOverviewStats | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminWorkspaces, setAdminWorkspaces] = useState<AdminWorkspace[]>([]);
  const [loadingAdmin, setLoadingAdmin] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<"users" | "workspaces">("users");
  const [userSearch, setUserSearch] = useState("");
  const [wsSearch, setWsSearch] = useState("");

  useEffect(() => {
    fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (isSuperAdmin && activeTab === "saas_admin") {
      loadAdminData();
    }
  }, [isSuperAdmin, activeTab]);

  const loadAdminData = async () => {
    setLoadingAdmin(true);
    try {
      const [stats, users, wsList] = await Promise.all([
        getAdminOverview().catch(() => null),
        getAdminUsers().catch(() => []),
        getAdminWorkspaces().catch(() => []),
      ]);
      if (stats) setAdminStats(stats);
      setAdminUsers(users);
      setAdminWorkspaces(wsList);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar dados do painel SaaS");
    } finally {
      setLoadingAdmin(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome de exibição não pode ficar vazio.");
      return;
    }

    setSavingProfile(true);
    try {
      const selectedAvatar = customAvatar.trim() || avatar;
      const updated = await updateUserProfile({
        name: name.trim(),
        avatar: selectedAvatar,
      });
      setUser(updated);
      toast.success("Perfil atualizado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar alterações no perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword) {
      toast.error("Informe sua senha atual.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A nova senha e a confirmação não conferem.");
      return;
    }

    setSavingPassword(true);
    try {
      await changeUserPassword(oldPassword, newPassword, confirmPassword);
      toast.success("Senha alterada com sucesso!");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar senha. Verifique sua senha atual.");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSelectWorkspace = (ws: Workspace) => {
    setCurrentWorkspace(ws);
    toast.success(`Workspace ativo alterado para "${ws.name}"`);
  };

  const handleRoleChange = async (targetUser: AdminUser, newRole: string) => {
    try {
      await updateAdminUserRole(targetUser.id, newRole);
      toast.success(`Cargo de ${targetUser.email} atualizado para ${newRole}`);
      setAdminUsers((prev) => prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u)));
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar cargo do usuário");
    }
  };

  const handlePlanChange = async (ws: AdminWorkspace, newPlan: string) => {
    try {
      await updateAdminWorkspace(ws.id, { plan: newPlan });
      toast.success(`Plano do workspace "${ws.name}" atualizado para ${newPlan}`);
      setAdminWorkspaces((prev) => prev.map((w) => (w.id === ws.id ? { ...w, plan: newPlan } : w)));
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar plano");
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Data não disponível";
    try {
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim();
    if (!q) return adminUsers;
    return adminUsers.filter(
      (u) => u.email.toLowerCase().includes(q) || (u.name && u.name.toLowerCase().includes(q)) || u.role.toLowerCase().includes(q),
    );
  }, [adminUsers, userSearch]);

  const filteredWorkspaces = useMemo(() => {
    const q = wsSearch.toLowerCase().trim();
    if (!q) return adminWorkspaces;
    return adminWorkspaces.filter(
      (w) => w.name.toLowerCase().includes(q) || w.id.toLowerCase().includes(q) || w.plan.toLowerCase().includes(q),
    );
  }, [adminWorkspaces, wsSearch]);

  return (
    <div className="flex-1 space-y-6 p-6 max-w-6xl mx-auto">
      {/* Top Banner Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border bg-card p-6 shadow-xs relative overflow-hidden">
        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl font-extrabold tracking-tight text-foreground">Meu Perfil & Conta</h1>
            {isSuperAdmin ? (
              <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 font-bold text-xs">
                <Crown className="h-3 w-3 fill-amber-500 text-amber-500" />
                Superadministrador Global
              </Badge>
            ) : (
              <Badge variant="secondary" className="gap-1 font-semibold text-xs">
                <Shield className="h-3 w-3 text-primary" />
                {user?.role === "creator" ? "Criador de Workspace" : "Membro"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Gerencie seus dados de acesso, preferências, workspaces vinculados e segurança da conta.
          </p>
        </div>

        {/* Quick User Identity Badge */}
        <div className="flex items-center gap-3 bg-muted/40 border border-border/50 rounded-xl p-2.5 px-3 shrink-0">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0 ring-2 ring-primary/20">
            {user?.avatar ? (
              <img src={user.avatar} alt="Avatar" className="h-full w-full rounded-full object-cover" />
            ) : (
              <span>{user?.name ? user.name.slice(0, 1).toUpperCase() : user?.email ? user.email.slice(0, 1).toUpperCase() : "U"}</span>
            )}
            {isSuperAdmin && (
              <div className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-xs">
                <Crown className="h-2.5 w-2.5 fill-white text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0 text-left">
            <p className="font-bold text-xs truncate text-foreground">{user?.name || user?.email?.split("@")[0]}</p>
            <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex gap-1.5 rounded-xl border bg-muted/40 p-1 flex-wrap">
        <button
          onClick={() => setActiveTab("general")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "general"
              ? "bg-background text-foreground shadow-2xs font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <User className="h-4 w-4 text-primary" />
          <span>Visão Geral & Dados</span>
        </button>

        <button
          onClick={() => setActiveTab("workspaces")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "workspaces"
              ? "bg-background text-foreground shadow-2xs font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Building2 className="h-4 w-4 text-primary" />
          <span>Meus Workspaces ({workspaces.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("security")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "security"
              ? "bg-background text-foreground shadow-2xs font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <KeyRound className="h-4 w-4 text-primary" />
          <span>Segurança & Senha</span>
        </button>

        <button
          onClick={() => setActiveTab("plan")}
          className={cn(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
            activeTab === "plan"
              ? "bg-background text-foreground shadow-2xs font-bold"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <CreditCard className="h-4 w-4 text-primary" />
          <span>Plano & Limites</span>
        </button>

        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab("saas_admin")}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
              activeTab === "saas_admin"
                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shadow-2xs font-bold"
                : "text-amber-600 dark:text-amber-400/80 hover:text-amber-600 hover:bg-amber-500/10",
            )}
          >
            <Crown className="h-4 w-4 fill-amber-500 text-amber-500" />
            <span>Painel Admin Global</span>
          </button>
        )}
      </div>

      {/* Tab Content 1: Visão Geral & Dados */}
      {activeTab === "general" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Card Esquerdo: Resumo de Identidade */}
          <div className="lg:col-span-5 rounded-2xl border bg-card p-6 shadow-xs space-y-6">
            <div className="flex flex-col items-center text-center space-y-3 pb-6 border-b">
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary font-extrabold text-2xl ring-4 ring-primary/20 shadow-xs">
                {avatar ? (
                  <img src={avatar} alt="Avatar Preview" className="h-full w-full rounded-full object-cover" />
                ) : (
                  <span>{name ? name.slice(0, 1).toUpperCase() : user?.email?.slice(0, 1).toUpperCase() || "U"}</span>
                )}
                {isSuperAdmin && (
                  <div
                    className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white shadow-md"
                    title="Superadministrador"
                  >
                    <Crown className="h-3.5 w-3.5 fill-white text-white" />
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-extrabold text-base text-foreground">{name || "Usuário"}</h3>
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                  <Mail className="h-3 w-3" />
                  {user?.email}
                </p>
              </div>

              <div className="pt-1">
                {isSuperAdmin ? (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-xs">
                    <Crown className="h-3 w-3 fill-amber-500 text-amber-500" />
                    Acesso Superadmin
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {user?.role === "creator" ? "Proprietário / Criador" : "Membro da Equipe"}
                  </Badge>
                )}
              </div>
            </div>

            {/* Informações da Conta */}
            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider">
                Detalhes da Conta
              </h4>
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Membro desde
                </span>
                <strong className="text-foreground font-semibold">{formatDate(user?.createdAt)}</strong>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 text-primary" />
                  Workspace Atual
                </span>
                <strong className="text-foreground font-semibold truncate max-w-[150px]">
                  {currentWorkspace?.name || "Padrão"}
                </strong>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-primary" />
                  Total de Workspaces
                </span>
                <strong className="text-foreground font-semibold">{workspaces.length}</strong>
              </div>
            </div>
          </div>

          {/* Card Direito: Formulário de Edição de Perfil */}
          <div className="lg:col-span-7 rounded-2xl border bg-card p-6 shadow-xs space-y-6">
            <div className="border-b pb-4">
              <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Editar Informações do Perfil
              </h3>
              <p className="text-xs text-muted-foreground">Atualize seu nome de exibição e foto de perfil.</p>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="profile-name" className="text-xs font-bold">
                  Nome Completo / Exibição
                </Label>
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="profile-email" className="text-xs font-bold">
                  E-mail de Acesso (Não alterável)
                </Label>
                <Input
                  id="profile-email"
                  value={user?.email || ""}
                  disabled
                  className="rounded-xl text-xs bg-muted/50 cursor-not-allowed opacity-80"
                />
                <p className="text-[10px] text-muted-foreground">
                  Para alterar seu e-mail de login, contate o administrador do sistema.
                </p>
              </div>

              {/* Seletor de Avatar */}
              <div className="space-y-3">
                <Label className="text-xs font-bold">Escolha um Avatar Predefinido</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  {avatarPresets.map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setAvatar(preset);
                        setCustomAvatar("");
                      }}
                      className={cn(
                        "h-11 w-11 rounded-full overflow-hidden border-2 transition-all cursor-pointer",
                        avatar === preset
                          ? "border-primary ring-2 ring-primary/30 scale-105"
                          : "border-border/60 hover:border-primary/50 opacity-70 hover:opacity-100",
                      )}
                    >
                      <img src={preset} alt={`Preset ${idx + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setAvatar("");
                      setCustomAvatar("");
                    }}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer",
                      !avatar && !customAvatar
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Usar Iniciais
                  </button>
                </div>
              </div>

              {/* URL Customizada de Avatar */}
              <div className="space-y-2">
                <Label htmlFor="profile-avatar" className="text-xs font-bold">
                  Ou insira a URL de uma Imagem de Avatar
                </Label>
                <Input
                  id="profile-avatar"
                  value={customAvatar}
                  onChange={(e) => {
                    setCustomAvatar(e.target.value);
                    if (e.target.value.trim()) setAvatar(e.target.value.trim());
                  }}
                  placeholder="https://exemplo.com/sua-foto.jpg"
                  className="rounded-xl text-xs font-mono"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={savingProfile}
                  className="gap-2 rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                >
                  {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  <span>Salvar Alterações</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab Content 2: Meus Workspaces */}
      {activeTab === "workspaces" && (
        <div className="rounded-2xl border bg-card p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Workspaces Associados
              </h3>
              <p className="text-xs text-muted-foreground">
                Workspaces e ambientes aos quais sua conta tem acesso no Kallia.
              </p>
            </div>

            <Button
              onClick={() => setActiveSection("connections")}
              variant="outline"
              size="sm"
              className="gap-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Smartphone className="h-3.5 w-3.5 text-primary" />
              <span>Gerenciar Conexões</span>
            </Button>
          </div>

          {loadingWorkspaces ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : workspaces.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground space-y-2">
              <Building2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
              <p className="font-bold text-sm text-foreground">Nenhum workspace encontrado</p>
              <p>Você está operando no workspace padrão do sistema.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {workspaces.map((ws) => {
                const isActive = currentWorkspace?.id === ws.id;
                return (
                  <div
                    key={ws.id}
                    className={cn(
                      "rounded-2xl border p-5 transition-all space-y-4 relative overflow-hidden",
                      isActive
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30 shadow-xs"
                        : "border-border bg-card hover:border-primary/40",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm truncate text-foreground">{ws.name}</h4>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">ID: {ws.id}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {ws.membership_role === "member" ? (
                          <Badge
                            variant="outline"
                            className="bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25 gap-1 text-[10px] font-bold"
                          >
                            <Users className="h-2.5 w-2.5" />
                            Convidado
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25 gap-1 text-[10px] font-bold"
                          >
                            <Crown className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                            Criador
                          </Badge>
                        )}
                        {isActive && (
                          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 text-[10px] font-bold">
                            <CheckCircle2 className="h-3 w-3" />
                            Ativo
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/40">
                      <div className="p-2 rounded-lg bg-muted/40 border">
                        <span className="text-[10px] text-muted-foreground block">Plano</span>
                        <strong className="text-foreground uppercase font-bold text-[11px]">{ws.plan || "Trial"}</strong>
                      </div>
                      <div className="p-2 rounded-lg bg-muted/40 border">
                        <span className="text-[10px] text-muted-foreground block">Status</span>
                        <strong className="text-emerald-600 dark:text-emerald-400 capitalize font-bold text-[11px]">
                          {ws.plan_status || "Ativo"}
                        </strong>
                      </div>
                    </div>

                    {!isActive && (
                      <Button
                        onClick={() => handleSelectWorkspace(ws)}
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs font-bold gap-1.5 rounded-xl cursor-pointer"
                      >
                        <span>Alternar para este Workspace</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab Content 3: Segurança & Senha */}
      {activeTab === "security" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 rounded-2xl border bg-card p-6 shadow-xs space-y-6">
            <div className="border-b pb-4">
              <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                Alterar Senha de Acesso
              </h3>
              <p className="text-xs text-muted-foreground">
                Recomendamos utilizar uma senha forte com no mínimo 6 caracteres contendo letras e números.
              </p>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="old-password" className="text-xs font-bold">
                  Senha Atual
                </Label>
                <div className="relative">
                  <Input
                    id="old-password"
                    type={showOldPass ? "text" : "password"}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="••••••••"
                    className="rounded-xl text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPass(!showOldPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showOldPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="new-password" className="text-xs font-bold">
                  Nova Senha
                </Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="rounded-xl text-xs pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="text-xs font-bold">
                  Confirme a Nova Senha
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="rounded-xl text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <Button
                  type="submit"
                  disabled={savingPassword}
                  className="gap-2 rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                >
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  <span>Atualizar Senha</span>
                </Button>
              </div>
            </form>
          </div>

          {/* Dicas de Segurança */}
          <div className="lg:col-span-5 rounded-2xl border bg-card p-6 shadow-xs space-y-4">
            <h4 className="font-extrabold text-sm text-foreground flex items-center gap-2">
              <Shield className="h-4 w-4 text-emerald-500" />
              Diretrizes de Segurança
            </h4>
            <ul className="space-y-2.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Utilize uma senha exclusiva e não a compartilhe com terceiros.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Sua sessão é protegida com criptografia de ponta a ponta e tokens JWT.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <span>Ao alterar a senha, todas as suas conexões ativas serão preservadas.</span>
              </li>
            </ul>

            <div className="pt-4 border-t border-border/50">
              <div className="p-3.5 rounded-xl bg-muted/40 border space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Tipo de Autenticação
                </span>
                <p className="text-xs font-semibold text-foreground">PocketBase Auth / JWT Bearer</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 4: Plano & Limites */}
      {activeTab === "plan" && (
        <div className="rounded-2xl border bg-card p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h3 className="font-extrabold text-base text-foreground flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Plano do Workspace Ativo ({currentWorkspace?.name || "Padrão"})
              </h3>
              <p className="text-xs text-muted-foreground">
                Consumo de recursos, conexões simultâneas de WhatsApp e limites de agentes.
              </p>
            </div>

            <Button
              onClick={() => setActiveSection("billing")}
              className="gap-2 rounded-xl text-xs font-bold cursor-pointer shadow-xs"
            >
              <span>Gerenciar Assinatura & Planos</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Plano Atual</span>
                <CreditCard className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-extrabold text-foreground uppercase">{currentWorkspace?.plan || "Trial"}</p>
              <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                Status: {currentWorkspace?.plan_status || "Ativo"}
              </Badge>
            </div>

            <div className="p-4 rounded-2xl border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Conexões WhatsApp</span>
                <Smartphone className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-extrabold text-foreground">
                {currentWorkspace?.connections_count || 1} / {currentWorkspace?.max_connections || 3}
              </p>
              <p className="text-[10px] text-muted-foreground">Instâncias simultâneas</p>
            </div>

            <div className="p-4 rounded-2xl border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Agentes Cadastrados</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-extrabold text-foreground">
                {currentWorkspace?.agents_count || 1} / {currentWorkspace?.max_agents || 10}
              </p>
              <p className="text-[10px] text-muted-foreground">Agentes IA e especialistas</p>
            </div>

            <div className="p-4 rounded-2xl border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Chamadas Simultâneas</span>
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <p className="text-xl font-extrabold text-foreground">
                {currentWorkspace?.max_concurrent_calls || 5} canais
              </p>
              <p className="text-[10px] text-muted-foreground">Capacidade VoIP em tempo real</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content 5: Painel SaaS Global (Exclusivo Superadmin) */}
      {isSuperAdmin && activeTab === "saas_admin" && (
        <div className="space-y-6">
          {/* Global KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl border bg-card shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Total de Usuários</span>
                <Users className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-extrabold text-foreground">{adminStats?.totalUsers ?? adminUsers.length}</p>
              <p className="text-[10px] text-muted-foreground">Contas registradas no PocketBase</p>
            </div>

            <div className="p-4 rounded-2xl border bg-card shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Total de Workspaces</span>
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-extrabold text-foreground">
                {adminStats?.totalWorkspaces ?? adminWorkspaces.length}
              </p>
              <p className="text-[10px] text-muted-foreground">Ambientes e projetos ativos</p>
            </div>

            <div className="p-4 rounded-2xl border bg-card shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Conexões WhatsApp</span>
                <Activity className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {adminStats?.activeSessions ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">Instâncias em execução no servidor</p>
            </div>

            <div className="p-4 rounded-2xl border bg-card shadow-xs space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-xs font-semibold">Total de Ligações VoIP</span>
                <PhoneCall className="h-4 w-4 text-primary" />
              </div>
              <p className="text-2xl font-extrabold text-foreground">{adminStats?.totalCalls ?? 0}</p>
              <p className="text-[10px] text-muted-foreground">Chamadas gravadas no sistema</p>
            </div>
          </div>

          {/* Sub Navigation: Users vs Workspaces */}
          <div className="rounded-2xl border bg-card p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
              <div className="flex gap-2">
                <Button
                  onClick={() => setAdminSubTab("users")}
                  variant={adminSubTab === "users" ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Gerenciar Usuários ({adminUsers.length})</span>
                </Button>

                <Button
                  onClick={() => setAdminSubTab("workspaces")}
                  variant={adminSubTab === "workspaces" ? "default" : "outline"}
                  size="sm"
                  className="rounded-xl text-xs font-bold gap-1.5 cursor-pointer"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  <span>Gerenciar Workspaces ({adminWorkspaces.length})</span>
                </Button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={adminSubTab === "users" ? userSearch : wsSearch}
                  onChange={(e) =>
                    adminSubTab === "users" ? setUserSearch(e.target.value) : setWsSearch(e.target.value)
                  }
                  placeholder={adminSubTab === "users" ? "Buscar usuário..." : "Buscar workspace..."}
                  className="pl-8 text-xs rounded-xl"
                />
              </div>
            </div>

            {loadingAdmin ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : adminSubTab === "users" ? (
              /* TABELA DE USUÁRIOS */
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b text-muted-foreground uppercase text-[10px] font-bold">
                      <th className="pb-3">Usuário</th>
                      <th className="pb-3">E-mail</th>
                      <th className="pb-3">Cargo / Role</th>
                      <th className="pb-3">Criado em</th>
                      <th className="pb-3 text-right">Ação de Cargo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-semibold text-foreground flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                            {u.avatar ? (
                              <img src={u.avatar} alt="Avatar" className="h-full w-full rounded-full object-cover" />
                            ) : (
                              u.name ? u.name[0].toUpperCase() : u.email[0].toUpperCase()
                            )}
                          </div>
                          <span>{u.name || "Sem Nome"}</span>
                        </td>
                        <td className="py-3 text-muted-foreground font-mono text-[11px]">{u.email}</td>
                        <td className="py-3">
                          {u.role === "appadmin" ? (
                            <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[10px]">
                              <Crown className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />
                              Superadmin
                            </Badge>
                          ) : u.role === "creator" ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Criador
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Membro
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">{formatDate(u.created)}</td>
                        <td className="py-3 text-right">
                          <select
                            value={u.role}
                            onChange={(e) => handleRoleChange(u, e.target.value)}
                            className="text-xs bg-muted/60 border rounded-lg px-2 py-1 font-semibold cursor-pointer outline-none"
                          >
                            <option value="normal">Membro (Normal)</option>
                            <option value="creator">Criador (Creator)</option>
                            <option value="appadmin">Superadmin (AppAdmin)</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              /* TABELA DE WORKSPACES */
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b text-muted-foreground uppercase text-[10px] font-bold">
                      <th className="pb-3">Workspace</th>
                      <th className="pb-3">Criador / Proprietário</th>
                      <th className="pb-3">ID</th>
                      <th className="pb-3">Plano</th>
                      <th className="pb-3">Conexões</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Alterar Plano</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredWorkspaces.map((ws) => (
                      <tr key={ws.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 font-semibold text-foreground flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          <span>{ws.name}</span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-[10px] shrink-0">
                              {ws.creator_name ? ws.creator_name[0].toUpperCase() : ws.creator_email ? ws.creator_email[0].toUpperCase() : "A"}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground truncate max-w-[140px] leading-tight">
                                {ws.creator_name || "Administrador"}
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px] leading-tight">
                                {ws.creator_email || "admin@kallia.com"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground font-mono text-[11px]">{ws.id}</td>
                        <td className="py-3">
                          <Badge className="uppercase text-[10px]">{ws.plan || "Trial"}</Badge>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {ws.connections_count} / {ws.max_connections} ativas
                        </td>
                        <td className="py-3">
                          <Badge
                            className={cn(
                              "capitalize text-[10px]",
                              ws.plan_status === "active"
                                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {ws.plan_status || "Ativo"}
                          </Badge>
                        </td>
                        <td className="py-3 text-right">
                          <select
                            value={ws.plan}
                            onChange={(e) => handlePlanChange(ws, e.target.value)}
                            className="text-xs bg-muted/60 border rounded-lg px-2 py-1 font-semibold cursor-pointer outline-none uppercase"
                          >
                            <option value="trial">Trial</option>
                            <option value="basic">Basic</option>
                            <option value="pro">Pro</option>
                            <option value="expert">Expert</option>
                            <option value="enterprise">Enterprise</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
