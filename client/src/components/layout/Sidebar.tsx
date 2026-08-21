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

  const navGroups: NavGroup[] = [
    {
      items: [{ id: "dashboard", label: "Início", icon: Home }],
    },
    {
      category: "CONSTRUÇÃO",
      items: [
        { id: "agents", label: "Agentes IA", icon: Bot },
        { id: "knowledge", label: "Base de Conhecimento", icon: BookOpen },
      ],
    },
    {
      category: "OPERAÇÃO",
      items: [
        { id: "connections", label: "Conexões do Workspace", icon: Smartphone },
        { id: "webphone", label: "Webphone & Ligações", icon: PhoneCall },
        { id: "schedules", label: "Disparos & Agenda", icon: Calendar },
      ],
    },
    {
      category: "REGISTROS",
      items: [
        { id: "calls", label: "Histórico de Ligações", icon: History },
        { id: "chat_history", label: "Histórico de Chat", icon: MessageSquare },
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
        <div className="flex items-center justify-between gap-2 rounded-xl bg-card/60 border p-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-xs shrink-0">
              {user?.email ? user.email.slice(0, 1).toUpperCase() : "A"}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {user?.name || user?.email?.split("@")[0] || "Administrador"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user?.email || "admin@kallia.com"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
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

