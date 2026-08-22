import {
  Home,
  Bot,
  BookOpen,
  Calendar,
  History,
  PhoneCall,
  MessageSquare,
  Users,
  BarChart3,
  Headphones,
  ShieldCheck,
  Workflow,
  CreditCard,
  Settings,
  Smartphone,
  Code2,
  LogOut,
  Crown,
} from "lucide-react";
import { useNavigation, type NavSection } from "@/stores/navigation";
import { getUser, clearAuth } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";
import { WorkspaceSelector } from "./WorkspaceSelector";
import { cn } from "@/lib/utils";

interface NavGroup {
  category?: string;
  items: {
    id: NavSection;
    label: string;
    icon: typeof Home;
    badge?: number;
  }[];
}

export const Sidebar = ({ onNavigate }: { onNavigate?: () => void }) => {
  const { activeSection, setActiveSection } = useNavigation();
  const user = getUser();
  const isSuperAdmin = user?.role === "appadmin" || user?.role === "superadmin";

  const navGroups: NavGroup[] = [
    {
      items: [{ id: "dashboard", label: "Início", icon: Home }],
    },
    {
      category: "CONSTRUÇÃO",
      items: [
        { id: "agents", label: "Agentes IA", icon: Bot },
        { id: "connections", label: "Conexões", icon: Smartphone },
        { id: "knowledge", label: "Base de Conhecimento", icon: BookOpen },
      ],
    },
    {
      category: "OPERAÇÃO",
      items: [
        { id: "conversations", label: "Conversas", icon: MessageSquare },
        { id: "webphone", label: "Ligações", icon: PhoneCall },
        { id: "schedules", label: "Ligações Agendadas", icon: Calendar },
      ],
    },
    {
      category: "REGISTROS",
      items: [
        { id: "calls", label: "Histórico de Ligações", icon: History },
        { id: "chat_history", label: "Chamados em Aberto", icon: MessageSquare },
        { id: "contacts", label: "Contatos", icon: Users },
      ],
    },
    {
      category: "MONITORAMENTO",
      items: [
        { id: "analytics", label: "Analytics & Métricas", icon: BarChart3 },
        { id: "live_monitoring", label: "Monitoramento ao Vivo", icon: Headphones },
        { id: "nps_qa", label: "Qualidade & NPS", icon: ShieldCheck },
      ],
    },
    {
      category: "SISTEMA",
      items: [
        { id: "integrations", label: "Integrações & Webhooks", icon: Workflow },
        { id: "billing", label: "Assinatura & Planos", icon: CreditCard },
        { id: "settings", label: "Configurações", icon: Settings },
      ],
    },
  ];

  return (
    <div className="flex h-full flex-col justify-between bg-sidebar border-r border-border/70 text-sidebar-foreground p-3 select-none">
      <div className="space-y-4 overflow-y-auto custom-scrollbar pr-0.5">
        {/* Workspace Selector Header */}
        <WorkspaceSelector />

        {/* Retell Categorized Navigation */}
        <nav className="space-y-3.5">
          {navGroups.map((group, idx) => (
            <div key={idx} className="space-y-1">
              {group.category && (
                <h4 className="px-3 text-[10px] font-bold tracking-wider text-muted-foreground/80 uppercase">
                  {group.category}
                </h4>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveSection(item.id);
                        onNavigate?.();
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 cursor-pointer",
                        isActive
                          ? "bg-primary/10 text-primary font-semibold shadow-2xs"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0 transition-transform", isActive && "text-primary scale-105")} />
                      <span className="truncate">{item.label}</span>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </div>

      {/* Sidebar Footer: User profile & controls */}
      <div className="pt-2.5 border-t border-border/70 space-y-2 shrink-0">
        <div
          onClick={() => {
            setActiveSection("profile");
            onNavigate?.();
          }}
          className={cn(
            "group flex items-center justify-between gap-2 rounded-xl border p-2 text-xs transition-all duration-150 cursor-pointer",
            isSuperAdmin
              ? "border-amber-500/25 bg-amber-500/[0.04] hover:border-amber-500/50 hover:bg-amber-500/[0.08]"
              : "bg-card/60 border-border hover:border-primary/50 hover:bg-card",
            activeSection === "profile" &&
              (isSuperAdmin
                ? "border-amber-500/60 bg-amber-500/10 ring-1 ring-amber-500/30"
                : "border-primary/60 bg-primary/5 ring-1 ring-primary/20"),
          )}
          title={isSuperAdmin ? "Superadmin Global - Ver Meu Perfil & Conta" : "Ver Meu Perfil & Conta"}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className={cn(
                "relative flex h-8 w-8 items-center justify-center rounded-full font-bold text-xs shrink-0 ring-1",
                isSuperAdmin
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30"
                  : "bg-primary/10 text-primary ring-primary/20",
              )}
            >
              {user?.avatar ? (
                <img src={user.avatar} alt="Avatar" className="h-full w-full rounded-full object-cover" />
              ) : (
                <span>{user?.name ? user.name.slice(0, 1).toUpperCase() : user?.email ? user.email.slice(0, 1).toUpperCase() : "A"}</span>
              )}
              {isSuperAdmin && (
                <div
                  className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-500 text-white shadow-2xs"
                  title="Superadmin"
                >
                  <Crown className="h-2 w-2 fill-white text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-xs font-bold transition-colors",
                  isSuperAdmin
                    ? "text-amber-600 dark:text-amber-400 group-hover:text-amber-500"
                    : "text-foreground group-hover:text-primary",
                )}
              >
                {user?.name || user?.email?.split("@")[0] || "Administrador"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user?.email || "admin@kallia.com"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <ThemeToggle />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearAuth();
                window.location.reload();
              }}
              title="Encerrar Sessão (Logout)"
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Quick Footer Links */}
        <div className="flex items-center justify-around text-[11px] text-muted-foreground pt-1">
          <button
            type="button"
            className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
            onClick={() => window.open("/api-docs.html", "_blank")}
          >
            <Code2 className="h-3 w-3" /> API
          </button>
          <span>•</span>
          <span className="flex items-center gap-1 hover:text-foreground transition-colors">
            Atualizações
          </span>
        </div>
      </div>
    </div>
  );
};

