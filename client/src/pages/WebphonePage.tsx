import { useState } from "react";
import { PhoneCall } from "lucide-react";
import { Webphone } from "@/components/domain/call/Webphone";
import { AICallSettingsCard } from "@/components/domain/call/AICallSettingsCard";
import { CallCard } from "@/components/domain/call/CallCard";
import { EmptyState } from "@/components/shared/EmptyState";
import { useCalls } from "@/stores/calls";

export const WebphonePage = ({ sid }: { sid: string }) => {
  const [useAI, setUseAI] = useState(true);
  const [prompt, setPrompt] = useState("");

  const calls = useCalls((s) => s.calls);
  const activeCalls = calls.filter((c) => c.sessionId === sid && c.status !== "ended");

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between border-b pb-3">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-primary" />
            <span>Central de Atendimento & Webphone</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Faça chamadas manuais, configure atendentes virtuais de IA e acompanhe ligações em andamento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Coluna 1 (Esquerda): Webphone */}
        <div className="lg:col-span-4">
          <Webphone sid={sid} useAI={useAI} prompt={prompt} />
        </div>

        {/* Coluna 2 (Meio): Ligação por Agente Virtual */}
        <div className="lg:col-span-4">
          <AICallSettingsCard
            useAI={useAI}
            onToggleUseAI={setUseAI}
            prompt={prompt}
            onPromptChange={setPrompt}
          />
        </div>

        {/* Coluna 3 (Direita): Chamadas em Tempo Real */}
        <div className="lg:col-span-4 space-y-4">
          <h3 className="font-bold text-sm flex items-center justify-between">
            <span className="flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-primary" />
              <span>Chamadas em Tempo Real</span>
            </span>
            {activeCalls.length > 0 && (
              <span className="rounded-full bg-primary/10 text-primary text-xs font-bold px-2.5 py-0.5">
                {activeCalls.length} {activeCalls.length === 1 ? "ativa" : "ativas"}
              </span>
            )}
          </h3>

          {activeCalls.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {activeCalls.map((c) => (
                <CallCard key={c.callId} call={c} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<PhoneCall className="h-6 w-6" />}
              title="Nenhuma chamada ativa"
              description="Disque um número no Webphone ao lado para iniciar um atendimento."
            />
          )}
        </div>
      </div>
    </div>
  );
};
