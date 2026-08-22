import { useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "./Sidebar";
import { useNavigation } from "@/stores/navigation";
import { cn } from "@/lib/utils";

const sectionTitles: Record<string, string> = {
  dashboard: "Painel de Controle",
  conversations: "Conversas",
  agents: "Agentes IA & Voz",
  knowledge: "Base de Conhecimento (RAG)",
  connections: "Conexões",
  schedules: "Ligações Agendadas",
  webphone: "Ligações",
  calls: "Histórico de Ligações",
  chat_history: "Chamados em Aberto",
  contacts: "Gerenciador de Contatos",
  analytics: "Analytics & Métricas",
  live_monitoring: "Monitoramento ao Vivo",
  nps_qa: "Qualidade & NPS",
  integrations: "Integrações & Webhooks",
  billing: "Assinatura & Planos",
  settings: "Configurações da Conta",
};

export const AppShell = ({ children }: { children: ReactNode }) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { activeSection } = useNavigation();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar (Left Fixo) */}
      <aside className="hidden w-64 shrink-0 border-r bg-card/40 md:block">
        <Sidebar />
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile Header Only (Escondido em telas md: UP) */}
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b bg-background/80 px-4 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Menu">
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navegação Principal</SheetTitle>
                <Sidebar onNavigate={() => setMobileOpen(false)} />
              </SheetContent>
            </Sheet>

            <h2 className="text-sm font-bold tracking-tight text-foreground truncate">
              {sectionTitles[activeSection] || "Kallia"}
            </h2>
          </div>
        </header>

        {/* Page Body: No padding and no outer scroll for Conversations/Chat */}
        <main
          className={cn(
            "flex-1 custom-scrollbar",
            activeSection === "conversations"
              ? "p-0 overflow-hidden flex flex-col h-full min-h-0"
              : "overflow-y-auto p-3 sm:p-6",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
};
