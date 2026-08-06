import { useState } from "react";
import { MessageSquare, Workflow, Code, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ChatwootSettingsPane } from "@/components/domain/settings/ChatwootSettingsPane";

type IntegrationSubTab = "chatwoot" | "webhooks";

const subTabs: { id: IntegrationSubTab; label: string; icon: any; description: string }[] = [
  { 
    id: "chatwoot", 
    label: "Chatwoot CRM", 
    icon: MessageSquare,
    description: "Sincronização de conversas e mensagens com caixa de entrada Chatwoot" 
  },
  { 
    id: "webhooks", 
    label: "Webhooks & APIs", 
    icon: Workflow,
    description: "Notificações em tempo real e chamadas para serviços externos" 
  },
];

export const IntegrationsTab = ({ sid }: { sid: string }) => {
  const [active, setActive] = useState<IntegrationSubTab>("chatwoot");

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Navigation Pills */}
      <div className="flex gap-1.5 rounded-xl border bg-card p-1 shadow-2xs w-fit">
        {subTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold transition-all cursor-pointer",
                isActive
                  ? "bg-primary text-primary-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Pane Content */}
      <div key={active} className="space-y-5">
        {active === "chatwoot" && <ChatwootSettingsPane sid={sid} />}
        {active === "webhooks" && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-2 px-1">
              <Workflow className="h-4 w-4 text-emerald-500" />
              <span className="text-sm font-medium">Webhooks e Integrações HTTP</span>
            </div>

            <p className="text-sm text-muted-foreground px-1">
              Gerencie o recebimento de eventos e o envio automático de dados pós-chamada para seus sistemas via Webhook.
            </p>

            <Card className="card-premium">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between border-b pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Code className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold">Webhooks Pós-Chamada & Ferramentas IA</h4>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Configure disparos automáticos HTTP após encerramento de ligações ou crie ferramentas HTTP customizadas para o agente executar em tempo real.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Ações Pós-Chamada</span>
                      <span className="text-[10px] bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full">Automático</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Envio de JSON com resumo da chamada, gravação, transcrição e métricas NPS para o seu endpoint.
                    </p>
                  </div>

                  <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">Custom Tools (Functions)</span>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium px-2 py-0.5 rounded-full">Em Chamada</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Permite que a IA consulte APIs externas (CRM, Estoque, Agendamento) durante a conversa por voz ou chat.
                    </p>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs p-3 rounded-lg flex items-center justify-between">
                  <span>As configurações de Webhook Pós-Chamada e Custom Tools ficam atreladas ao perfil de cada Agente IA.</span>
                  <a href="#agents" onClick={() => window.location.hash = "#agents"} className="font-semibold underline flex items-center gap-1 hover:text-amber-500">
                    Ir para Agentes IA <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
