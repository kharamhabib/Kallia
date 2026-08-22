import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Smile,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  Briefcase,
  Users,
  HelpCircle,
  X,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Zap,
  MessageSquare,
  SlidersHorizontal,
  Bot,
  UserRound,
  Building2,
  Headphones,
  Clock,
  Volume2,
  FileCode,
  Lock,
  PhoneOff,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/Switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  AgentHandbookConfig,
  defaultHandbookConfig,
  extractHandbookConfig,
  applyHandbookConfig,
  PROMPT_TEMPLATES,
  getPresetGreeting,
} from "@/lib/promptTemplates";

interface AgentHandbookDrawerProps {
  open: boolean;
  onClose: () => void;
  prompt: string;
  onSavePrompt: (newPrompt: string) => void;
}

type HandbookTab = "identity" | "personality" | "tools" | "safety";

export const AgentHandbookDrawer = ({
  open,
  onClose,
  prompt,
  onSavePrompt,
}: AgentHandbookDrawerProps) => {
  const [activeTab, setActiveTab] = useState<HandbookTab>("identity");
  const [config, setConfig] = useState<AgentHandbookConfig>(defaultHandbookConfig);

  useEffect(() => {
    if (open) {
      const extracted = extractHandbookConfig(prompt);
      setConfig(extracted);
    }
  }, [open, prompt]);

  // Fechar com tecla ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    const updatedPrompt = applyHandbookConfig(prompt, config);
    onSavePrompt(updatedPrompt);
    onClose();
  };

  const handleSelectTemplate = (templateId: string) => {
    const tpl = PROMPT_TEMPLATES.find((t) => t.id === templateId);
    if (tpl) {
      const greeting = getPresetGreeting(
        tpl.category,
        config.useAgentName,
        config.agentName,
        config.transparencyMode,
      );
      setConfig({
        ...config,
        templateId,
        customGreeting: greeting,
      });
    }
  };

  const handleToggleTransparency = (mode: "announce_early" | "natural_honest") => {
    const tpl = PROMPT_TEMPLATES.find((t) => t.id === config.templateId) || PROMPT_TEMPLATES[0];
    const newGreeting = getPresetGreeting(
      tpl.category,
      config.useAgentName,
      config.agentName,
      mode,
    );
    setConfig({
      ...config,
      transparencyMode: mode,
      customGreeting: newGreeting,
    });
  };

  const handleToggleUseName = (useName: boolean) => {
    const tpl = PROMPT_TEMPLATES.find((t) => t.id === config.templateId) || PROMPT_TEMPLATES[0];
    const newGreeting = getPresetGreeting(
      tpl.category,
      useName,
      config.agentName,
      config.transparencyMode,
    );
    setConfig({
      ...config,
      useAgentName: useName,
      customGreeting: newGreeting,
    });
  };

  const handleAgentNameChange = (name: string) => {
    const tpl = PROMPT_TEMPLATES.find((t) => t.id === config.templateId) || PROMPT_TEMPLATES[0];
    const newGreeting = getPresetGreeting(
      tpl.category,
      config.useAgentName,
      name,
      config.transparencyMode,
    );
    setConfig({
      ...config,
      agentName: name,
      customGreeting: newGreeting,
    });
  };

  const setGreetingPreset = (category: "personal" | "company" | "support") => {
    const greeting = getPresetGreeting(
      category,
      config.useAgentName,
      config.agentName,
      config.transparencyMode,
    );
    setConfig({
      ...config,
      customGreeting: greeting,
    });
  };

  const drawerContent = (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* BACKDROP OVERLAY */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in"
      />

      {/* DRAWER CONTAINER */}
      <div
        className="relative z-50 w-full sm:max-w-lg md:max-w-xl bg-card text-card-foreground border-l border-border/80 shadow-2xl flex flex-col h-full animate-slide-in-right overflow-hidden"
        style={{
          boxShadow: "-10px 0 35px -5px rgb(0 0 0 / 0.5)",
        }}
      >
        {/* HEADER */}
        <div className="p-5 border-b border-border/70 bg-muted/20 flex items-start justify-between gap-4 shrink-0">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <SlidersHorizontal className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-foreground tracking-tight">
                  Configurações do Agente
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-widest text-primary">
                  Prompt Master & Diretrizes
                </span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">
              Personalize nome, transparência de IA, modelo base, horários de saudação e regras operacionais.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* NAVEGAÇÃO DE 4 SUB-ABAS */}
        <div className="px-5 py-2.5 border-b border-border/50 bg-muted/10 shrink-0">
          <div className="grid grid-cols-4 gap-1 rounded-xl bg-muted/50 p-1 text-center">
            <button
              type="button"
              onClick={() => setActiveTab("identity")}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer",
                activeTab === "identity"
                  ? "bg-background text-foreground shadow-xs font-bold ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <User className="h-3.5 w-3.5 text-primary" />
              <span className="truncate">Identidade</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("personality")}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer",
                activeTab === "personality"
                  ? "bg-background text-foreground shadow-xs font-bold ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Smile className="h-3.5 w-3.5 text-emerald-500" />
              <span className="truncate">Tom & Voz</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("tools")}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer",
                activeTab === "tools"
                  ? "bg-background text-foreground shadow-xs font-bold ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span className="truncate">Pré-falas</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("safety")}
              className={cn(
                "flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-semibold transition-all cursor-pointer",
                activeTab === "safety"
                  ? "bg-background text-foreground shadow-xs font-bold ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
              <span className="truncate">Segurança</span>
            </button>
          </div>
        </div>

        {/* CONTEÚDO SCROLLABLE */}
        <div className="flex-1 p-5 space-y-4 overflow-y-auto custom-scrollbar">
          {/* ABA 1: IDENTIDADE & FLUXO */}
          {activeTab === "identity" && (
            <div className="space-y-4 animate-fade-in">
              {/* NOME DO AGENTE (COM CHECKBOX OPCIONAL) */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    <div>
                      <h4 className="font-bold text-xs text-foreground">
                        Nome Próprio da Assistente
                      </h4>
                      <p className="text-[11px] text-muted-foreground">
                        Dê um nome humanizado para a assistente (ex: Sofia, Luíza).
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={config.useAgentName}
                    onChange={(v: boolean) => handleToggleUseName(v)}
                  />
                </div>

                {config.useAgentName ? (
                  <div className="space-y-1.5 pt-1 animate-fade-in">
                    <Label htmlFor="agentName" className="text-[11px] font-semibold text-muted-foreground">
                      Nome de Apresentação:
                    </Label>
                    <input
                      id="agentName"
                      type="text"
                      value={config.agentName}
                      onChange={(e) => handleAgentNameChange(e.target.value)}
                      className="w-full rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs font-bold text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary shadow-2xs"
                      placeholder="Ex: Sofia, Luíza, Kallia..."
                    />
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted/30 p-2.5 border border-border/40 text-[11px] text-muted-foreground leading-relaxed">
                    ℹ️ A IA se apresentará genericamente como equipe/assistente de voz do negócio, sem utilizar nome de pessoa física.
                  </div>
                )}
              </div>

              {/* TRANSPARÊNCIA DE IA (MOVIDO PARA IDENTIDADE) */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                <div>
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    Transparência e Divulgação de IA
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Define como o agente se posiciona a respeito de ser uma inteligência artificial.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    onClick={() => handleToggleTransparency("natural_honest")}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-all",
                      config.transparencyMode === "natural_honest"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/60 bg-muted/20 hover:border-primary/40",
                    )}
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary">
                      {config.transparencyMode === "natural_honest" && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        <span className="font-bold text-xs text-foreground">Natural / Discreta (Falar em nome de)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Apresenta-se como {config.useAgentName && config.agentName ? config.agentName : "assistente"} ou fala em nome do negócio sem anunciar IA de início. Se perguntada diretamente se é uma IA, confirma cordialmente sem mentir.
                      </p>
                    </div>
                  </label>

                  <label
                    onClick={() => handleToggleTransparency("announce_early")}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-all",
                      config.transparencyMode === "announce_early"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/60 bg-muted/20 hover:border-primary/40",
                    )}
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary">
                      {config.transparencyMode === "announce_early" && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-bold text-xs text-foreground">Avisar Logo no Início da Chamada</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Informa proativamente logo na primeira frase que é uma assistente virtual de inteligência artificial.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* SELEÇÃO DO MODELO BASE */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                <div>
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                    Modelo Base de Atendimento
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Selecione o papel fundamental e propósito da assistente virtual.
                  </p>
                </div>

                <div className="space-y-2">
                  {PROMPT_TEMPLATES.map((tpl) => {
                    const isSelected = config.templateId === tpl.id;
                    const Icon =
                      tpl.id === "personal_secretary"
                        ? UserRound
                        : tpl.id === "commercial_company"
                        ? Building2
                        : Headphones;

                    return (
                      <label
                        key={tpl.id}
                        onClick={() => handleSelectTemplate(tpl.id)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-all",
                          isSelected
                            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                            : "border-border/60 bg-muted/20 hover:border-primary/40",
                        )}
                      >
                        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary">
                          {isSelected && <div className="h-2 w-2 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-primary" />
                            <span className="font-bold text-xs text-foreground">{tpl.name}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{tpl.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* SENTIDO DE ATENDIMENTO */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                <div>
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <PhoneCall className="h-3.5 w-3.5 text-primary" />
                    Sentido de Atendimento
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Define se a IA atenderá chamadas recebidas, efetuará ligações ou ambas.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, callDirection: "both" })}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer",
                      config.callDirection === "both"
                        ? "border-primary bg-primary/10 text-foreground font-bold ring-1 ring-primary/40 shadow-xs"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <PhoneCall className="h-4 w-4 mb-1 text-primary" />
                    <span className="text-xs">Ambas</span>
                    <span className="text-[10px] text-muted-foreground font-normal">In & Outbound</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, callDirection: "inbound_only" })}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer",
                      config.callDirection === "inbound_only"
                        ? "border-primary bg-primary/10 text-foreground font-bold ring-1 ring-primary/40 shadow-xs"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <PhoneIncoming className="h-4 w-4 mb-1 text-emerald-500" />
                    <span className="text-xs">Recebidas</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Só Inbound</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfig({ ...config, callDirection: "outbound_only" })}
                    className={cn(
                      "flex flex-col items-center justify-center p-2.5 rounded-xl border text-center transition-all cursor-pointer",
                      config.callDirection === "outbound_only"
                        ? "border-primary bg-primary/10 text-foreground font-bold ring-1 ring-primary/40 shadow-xs"
                        : "border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <PhoneOutgoing className="h-4 w-4 mb-1 text-indigo-500" />
                    <span className="text-xs">Efetuadas</span>
                    <span className="text-[10px] text-muted-foreground font-normal">Só Outbound</span>
                  </button>
                </div>
              </div>

              {/* SAUDAÇÃO & DESPEDIDA POR HORÁRIO DO DIA */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-amber-500" />
                    Saudação & Despedida por Horário do Dia
                  </h4>
                  <Switch
                    checked={config.timeAwareGreeting}
                    onChange={(v: boolean) => setConfig({ ...config, timeAwareGreeting: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  A IA adapta saudações e despedidas contextualmente conforme o horário: &quot;Bom dia&quot; (05h às 12h), &quot;Boa tarde&quot; (12h às 18h) e &quot;Boa noite&quot; (18h às 05h).
                </p>
              </div>

              {/* SAUDAÇÃO DE ABERTURA */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-indigo-500" />
                    Frase de Abertura (Inbound)
                  </h4>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setGreetingPreset("personal")}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Pessoal
                    </button>
                    <button
                      type="button"
                      onClick={() => setGreetingPreset("company")}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Empresa
                    </button>
                    <button
                      type="button"
                      onClick={() => setGreetingPreset("support")}
                      className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      Suporte
                    </button>
                  </div>
                </div>
                <textarea
                  rows={2}
                  value={config.customGreeting}
                  onChange={(e) => setConfig({ ...config, customGreeting: e.target.value })}
                  className="w-full rounded-lg border border-border/70 bg-muted/20 p-2.5 text-xs text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary leading-relaxed resize-none custom-scrollbar"
                  placeholder="Digite a saudação inicial do agente..."
                />
              </div>
            </div>
          )}

          {/* ABA 2: TOM & ESTILO DE FALA */}
          {activeTab === "personality" && (
            <div className="space-y-4 animate-fade-in">
              {/* TOM DE VOZ */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-3 shadow-2xs">
                <div>
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                    Postura e Tom de Voz
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Define o estilo conversacional adotado pela IA em todas as respostas.
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    onClick={() => setConfig({ ...config, defaultToneStyle: "conversational" })}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-all",
                      config.defaultToneStyle === "conversational"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/60 bg-muted/20 hover:border-primary/40",
                    )}
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary">
                      {config.defaultToneStyle === "conversational" && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Smile className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="font-bold text-xs text-foreground">Conversacional & Acolhedor</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Natural, caloroso e humano, sem frieza robótica.</p>
                    </div>
                  </label>

                  <label
                    onClick={() => setConfig({ ...config, defaultToneStyle: "professional" })}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-all",
                      config.defaultToneStyle === "professional"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/60 bg-muted/20 hover:border-primary/40",
                    )}
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary">
                      {config.defaultToneStyle === "professional" && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-indigo-500" />
                        <span className="font-bold text-xs text-foreground">Formal & Executivo</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Sóbrio, polido, estritamente corporativo.</p>
                    </div>
                  </label>

                  <label
                    onClick={() => setConfig({ ...config, defaultToneStyle: "direct" })}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer transition-all",
                      config.defaultToneStyle === "direct"
                        ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                        : "border-border/60 bg-muted/20 hover:border-primary/40",
                    )}
                  >
                    <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-primary">
                      {config.defaultToneStyle === "direct" && (
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-bold text-xs text-foreground">Ágil & Direto</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Respostas rápidas e sem rodeios para alta produtividade.</p>
                    </div>
                  </label>
                </div>
              </div>

              {/* PALAVRAS DE PREENCHIMENTO NATURAIS */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                    Palavras de Preenchimento Naturais (Filler Words)
                  </h4>
                  <Switch
                    checked={config.naturalFillerWords}
                    onChange={(v: boolean) => setConfig({ ...config, naturalFillerWords: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Insere expressões como &quot;entendi&quot;, &quot;veja bem&quot;, &quot;sabe&quot; para soar calorosa e humana.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Então, sim! Deixa eu só puxar essas informações aqui rapidinho para você.&quot;</span>
                </div>
              </div>

              {/* ALTA EMPATIA */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Smile className="h-3.5 w-3.5 text-pink-500" />
                    Alta Empatia (High Empathy)
                  </h4>
                  <Switch
                    checked={config.highEmpathy}
                    onChange={(v: boolean) => setConfig({ ...config, highEmpathy: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Valida a preocupação e sentimentos do cliente com acolhimento antes de focar na solução.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Sinto muito por esse transtorno, compreendo perfeitamente como isso pode ser chato. Vamos resolver isso agora mesmo!&quot;</span>
                </div>
              </div>

              {/* RESPOSTAS CURTAS */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Volume2 className="h-3.5 w-3.5 text-blue-500" />
                    Respostas Curtas Telefônicas (2 a 3 frases)
                  </h4>
                  <Switch
                    checked={config.shortResponses}
                    onChange={(v: boolean) => setConfig({ ...config, shortResponses: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Impede monólogos longos, garantindo respostas ágeis e conversacionais ideais para ligações via WhatsApp.
                </p>
              </div>

              {/* PROIBIÇÃO DE LEITURA TÉCNICA */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <FileCode className="h-3.5 w-3.5 text-amber-500" />
                    Proibir Leitura de URLs / PIX / Códigos
                  </h4>
                  <Switch
                    checked={config.prohibitTechReading}
                    onChange={(v: boolean) => setConfig({ ...config, prohibitTechReading: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  A IA nunca lê links longos ou chaves PIX por voz; avisa que enviou por escrito no WhatsApp.
                </p>
              </div>
            </div>
          )}

          {/* ABA 3: PRÉ-FALAS & FERRAMENTAS */}
          {activeTab === "tools" && (
            <div className="space-y-4 animate-fade-in">
              {/* PRÉ-FALAS DE LATÊNCIA */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-500" />
                    Pré-falas de Latência em Ferramentas
                  </h4>
                  <Switch
                    checked={config.enablePreambles}
                    onChange={(v: boolean) => setConfig({ ...config, enablePreambles: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Emite um aviso curto (&quot;Só um instante enquanto consulto...&quot;) antes de executar ferramentas ou pesquisas para evitar silêncio.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Só um instante enquanto consulto isso para você...&quot;</span>
                </div>
              </div>

              {/* REGRA ABSOLUTA ANTI-DESLIGAMENTO */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <PhoneOff className="h-3.5 w-3.5 text-rose-500" />
                    Guardrail Anti-Desligamento Precoce
                  </h4>
                  <Switch
                    checked={config.antiHangupGuardrail}
                    onChange={(v: boolean) => setConfig({ ...config, antiHangupGuardrail: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Proíbe terminantemente a IA de se despedir ou desligar automaticamente após enviar mensagens ou consultar dados, mantendo a linha aberta até o cliente finalizar.
                </p>
              </div>

              {/* CONFIRMAÇÃO PRÉVIA DE FERRAMENTAS */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    Confirmação Prévia de Ações e Agendamentos
                  </h4>
                  <Switch
                    checked={config.toolConfirmations}
                    onChange={(v: boolean) => setConfig({ ...config, toolConfirmations: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Confirma datas, horários e dados com o cliente antes de acionar agendamentos ou abertura de chamados.
                </p>
              </div>

              {/* TRATAMENTO DE RUÍDO E ÁUDIO CORTADO */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                    Tratamento Educado de Ruído e Áudio Cortado
                  </h4>
                  <Switch
                    checked={config.handleAudioNoise}
                    onChange={(v: boolean) => setConfig({ ...config, handleAudioNoise: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Se o áudio do usuário estiver confuso ou cortado, a IA não adivinha: solicita esclarecimento educadamente.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Desculpe, a ligação falhou um pouco e não entendi. Você pode repetir, por favor?&quot;</span>
                </div>
              </div>
            </div>
          )}

          {/* ABA 4: PRECISÃO & SEGURANÇA */}
          {activeTab === "safety" && (
            <div className="space-y-4 animate-fade-in">
              {/* CONFIRMAÇÃO POR ECO */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-indigo-500" />
                    Confirmação por Eco (Echo Verification)
                  </h4>
                  <Switch
                    checked={config.echoVerification}
                    onChange={(v: boolean) => setConfig({ ...config, echoVerification: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Repete números de telefone, nomes de contatos, e-mails e endereços solicitando confirmação de sim/não.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Só para confirmar: o seu número de telefone é (27) 99530-7734. Está correto?&quot;</span>
                </div>
              </div>

              {/* ALFABETO FONÉTICO / SOLETRAÇÃO */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <HelpCircle className="h-3.5 w-3.5 text-blue-500" />
                    Alfabeto Fonético / Soletração Clara
                  </h4>
                  <Switch
                    checked={config.phoneticAlphabet}
                    onChange={(v: boolean) => setConfig({ ...config, phoneticAlphabet: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Soletra dados alfanuméricos complexos (e-mails incomuns, senhas) utilizando palavras de apoio (ex: &quot;B de Brasil, K de Kilo&quot;).
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Seria B de Brasil? Ótimo—B-7-K-2, correto?&quot;</span>
                </div>
              </div>

              {/* NORMALIZAÇÃO DE FALA */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                    Normalização de Fala (Speech Normalization)
                  </h4>
                  <Switch
                    checked={config.speechNormalization}
                    onChange={(v: boolean) => setConfig({ ...config, speechNormalization: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Lê valores monetários, datas, horários e números em formato por extenso natural e compreensível.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;O valor total da sua proposta ficou em vinte e quatro reais e doze centavos.&quot;</span>
                </div>
              </div>

              {/* CORRESPONDÊNCIA INTELIGENTE */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-amber-500" />
                    Correspondência Inteligente (Smart Matching)
                  </h4>
                  <Switch
                    checked={config.smartMatching}
                    onChange={(v: boolean) => setConfig({ ...config, smartMatching: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Reconhece variações fonéticas próximas e abreviações (Luíza/Luisa, Rua/R., Av./Avenida) como a mesma entidade.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Então o endereço é na Rua Principal, número 123—o mesmo que R. Principal, correto?&quot;</span>
                </div>
              </div>

              {/* LIMITES DE ESCOPO */}
              <div className="rounded-xl border border-border/70 bg-card p-4 space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-foreground flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-emerald-500" />
                    Fronteiras e Limites de Escopo (Scope Boundaries)
                  </h4>
                  <Switch
                    checked={config.scopeBoundaries}
                    onChange={(v: boolean) => setConfig({ ...config, scopeBoundaries: v })}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Maior confiabilidade e menor risco. Mantém-se estritamente dentro do contexto do negócio e ferramentas ativas sem inventar respostas.
                </p>
                <div className="rounded-lg bg-muted/40 p-2.5 border border-border/40 text-[11px] text-muted-foreground flex items-start gap-2">
                  <span className="text-base shrink-0">🤖</span>
                  <span className="italic leading-relaxed">&quot;Não consigo realizar essa ação diretamente por aqui, mas posso verificar o status com a equipe ou abrir um chamado para você.&quot;</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t border-border/70 bg-muted/20 flex items-center justify-end gap-2.5 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="text-xs font-semibold cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="text-xs font-bold gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
          >
            <CheckCircle2 className="h-4 w-4" />
            <span>Salvar Configurações no Prompt</span>
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(drawerContent, document.body);
};
