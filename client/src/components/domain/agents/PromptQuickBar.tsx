import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  Bot,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Maximize2,
  Clock,
  Smile,
  Briefcase,
  Zap,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  detectActiveTemplateId,
  detectCallDirection,
  extractHandbookConfig,
  countActiveHandbookRules,
  PROMPT_TEMPLATES,
} from "@/lib/promptTemplates";
import { AgentHandbookDrawer } from "./AgentHandbookDrawer";
import { cn } from "@/lib/utils";

interface PromptQuickBarProps {
  prompt: string;
  onChangePrompt: (newPrompt: string) => void;
  onExpand?: () => void;
}

export const PromptQuickBar = ({
  prompt,
  onChangePrompt,
  onExpand,
}: PromptQuickBarProps) => {
  const [showHandbookDrawer, setShowHandbookDrawer] = useState(false);

  const activeTemplateId = useMemo(() => detectActiveTemplateId(prompt), [prompt]);
  const activeDirection = useMemo(() => detectCallDirection(prompt), [prompt]);
  const handbookConfig = useMemo(() => extractHandbookConfig(prompt), [prompt]);
  const activeRulesCount = useMemo(
    () => countActiveHandbookRules(handbookConfig),
    [handbookConfig],
  );

  const activeTemplate = useMemo(
    () =>
      PROMPT_TEMPLATES.find((t) => t.id === activeTemplateId) ||
      PROMPT_TEMPLATES[0],
    [activeTemplateId],
  );

  const displayName = handbookConfig.useAgentName && handbookConfig.agentName
    ? handbookConfig.agentName
    : "Assistente de Atendimento";

  return (
    <>
      <div className="rounded-2xl border border-border/80 bg-gradient-to-r from-card via-card/90 to-primary/5 p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* LADO ESQUERDO: AVATAR, NOME, TÍTULO & BADGES DE STATUS */}
        <div className="flex items-center gap-3 min-w-0">
          {/* AVATAR DO AGENTE */}
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo-600 text-primary-foreground shadow-md font-extrabold text-sm">
            {handbookConfig.useAgentName && handbookConfig.agentName ? (
              <span>{handbookConfig.agentName.charAt(0).toUpperCase()}</span>
            ) : (
              <Bot className="h-5 w-5" />
            )}
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background animate-pulse" />
          </div>

          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-sm text-foreground tracking-tight">
                {displayName}
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">
                • Instruções do Sistema (System Prompt)
              </span>
            </div>

            {/* BADGES DINÂMICOS */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* BADGE MODELO */}
              <div className="flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                <Bot className="h-3 w-3" />
                <span>{activeTemplate.name}</span>
              </div>

              {/* BADGE SENTIDO DA CHAMADA */}
              <div className="flex items-center gap-1 rounded-md bg-muted/60 border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {activeDirection === "both" ? (
                  <>
                    <PhoneCall className="h-2.5 w-2.5 text-primary" />
                    <span>In & Outbound</span>
                  </>
                ) : activeDirection === "inbound_only" ? (
                  <>
                    <PhoneIncoming className="h-2.5 w-2.5 text-emerald-500" />
                    <span>Só Inbound</span>
                  </>
                ) : (
                  <>
                    <PhoneOutgoing className="h-2.5 w-2.5 text-indigo-500" />
                    <span>Só Outbound</span>
                  </>
                )}
              </div>

              {/* BADGE TRANSPARÊNCIA */}
              <div className="flex items-center gap-1 rounded-md bg-muted/60 border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {handbookConfig.transparencyMode === "natural_honest" ? (
                  <>
                    <Sparkles className="h-2.5 w-2.5 text-primary" />
                    <span>Natural / Discreta</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-2.5 w-2.5 text-amber-500" />
                    <span>Avisar IA</span>
                  </>
                )}
              </div>

              {/* BADGE TOM */}
              <div className="flex items-center gap-1 rounded-md bg-muted/60 border border-border/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {handbookConfig.defaultToneStyle === "conversational" ? (
                  <>
                    <Smile className="h-2.5 w-2.5 text-emerald-500" />
                    <span>Conversacional</span>
                  </>
                ) : handbookConfig.defaultToneStyle === "professional" ? (
                  <>
                    <Briefcase className="h-2.5 w-2.5 text-indigo-500" />
                    <span>Formal</span>
                  </>
                ) : (
                  <>
                    <Zap className="h-2.5 w-2.5 text-amber-500" />
                    <span>Direto</span>
                  </>
                )}
              </div>

              {/* BADGE HORÁRIO */}
              {handbookConfig.timeAwareGreeting && (
                <div className="flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                  <Clock className="h-2.5 w-2.5" />
                  <span>Horário Ativo</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LADO DIREITO: BOTÃO DE CONFIGURAÇÕES & EXPANDIR */}
        <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => setShowHandbookDrawer(true)}
            className={cn(
              "h-9 px-3.5 text-xs font-bold gap-2 cursor-pointer shadow-sm rounded-xl transition-all",
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Configurações do Agente</span>
            <span className="flex h-5 items-center justify-center rounded-full bg-primary-foreground text-primary px-1.5 text-[10px] font-extrabold shadow-2xs">
              {activeRulesCount}
            </span>
          </Button>

          {onExpand && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onExpand}
              className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer rounded-xl bg-card/80 border-border/70 hover:bg-muted/60"
              title="Ampliar Editor em Tela Cheia"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* PAINEL LATERAL DESLIZANTE DO AGENT HANDBOOK */}
      <AgentHandbookDrawer
        open={showHandbookDrawer}
        onClose={() => setShowHandbookDrawer(false)}
        prompt={prompt}
        onSavePrompt={onChangePrompt}
      />
    </>
  );
};
