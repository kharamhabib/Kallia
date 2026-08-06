import { useState } from "react";
import {
  Home,
  Bot,
  BookOpen,
  Radio,
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
  ChevronDown,
  Code2,
  LogOut,
  Sparkles,
  Check,
} from "lucide-react";
import { useNavigation, type NavSection } from "@/stores/navigation";
import { useSessions, setActiveSession } from "@/stores/sessions";
import { getUser, clearAuth } from "@/lib/auth";
import { ThemeToggle } from "./ThemeToggle";
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
  const sessions = useSessions((s) => s.sessions);
  const activeId = useSessions((s) => s.activeId);
  const activeSession = sessions.find((s) => s.id === activeId);
  const user = getUser();
  const [workspaceDropdown, setWorkspaceDropdown] = useState(false);

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
        <div className="relative">
          <button
            type="button"
            onClick={() => setWorkspaceDropdown(!workspaceDropdown)}
            className="flex w-full items-center justify-between gap-2.5 rounded-xl border bg-card/80 p-2 text-xs font-semibold shadow-xs hover:border-primary/40 transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs shrink-0 shadow-2xs">
                {activeSession ? activeSession.name.slice(0, 1).toUpperCase() : "K"}
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-xs font-bold text-foreground leading-tight">
                  {activeSession ? activeSession.name : "Kallia AI"}
                </p>
                <p className="text-[10px] text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0",
                      activeSession?.state === "open" ? "bg-emerald-500" : activeSession?.state === "qr" ? "bg-amber-500" : "bg-red-500",
                    )}
                  />
                  <span>{activeSession?.state === "open" ? "Conectado" : activeSession?.state === "qr" ? "Aguardando QR" : "Desconectado"}</span>
                </p>
              </div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </button>

          {/* Workspace Dropdown */}
          {workspaceDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setWorkspaceDropdown(false)} />
              <div className="absolute top-12 left-0 right-0 z-50 rounded-xl border bg-popover p-1.5 shadow-xl animate-in fade-in-80 space-y-1">
                <p className="px-2 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                  Selecione o Workspace
                </p>
                <div className="space-y-0.5 max-h-48 overflow-y-auto custom-scrollbar">
                  {sessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveSession(s.id);
                        setWorkspaceDropdown(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors cursor-pointer",
                        s.id === activeId ? "bg-primary/10 text-primary font-semibold" : "hover:bg-muted/60 text-foreground",
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            s.state === "open" ? "bg-emerald-500" : s.state === "qr" ? "bg-amber-500" : "bg-red-500",
                          )}
                        />
                        <span className="truncate">{s.name}</span>
                      </div>
                      {s.id === activeId && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    </button>
                  ))}
                </div>

                <div className="pt-1.5 border-t border-border/50">
                  <button
                    onClick={() => {
                      setActiveSection("connections");
                      setWorkspaceDropdown(false);
                      onNavigate?.();
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-primary font-semibold hover:bg-primary/10 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Radio className="h-3.5 w-3.5" />
                      <span>Gerenciar Workspace</span>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

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

      {/* Retell Sidebar Footer: User profile & Plan status */}
      <div className="pt-3 border-t border-border/70 space-y-2 shrink-0">
        <div className="flex items-center justify-between px-1">
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Sparkles className="h-3 w-3" /> Plano Expert
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">v1.2.6</span>
        </div>

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

