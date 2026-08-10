import { useState } from "react";
import { Sliders, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";
import { GeneralSettingsPane } from "./GeneralSettingsPane";
import { AIProvidersSettingsPane } from "./AIProvidersSettingsPane";

type SettingsSubTab = "general" | "ai_providers";

export const SettingsTab = ({ sid: _sid }: { sid: string }) => {
  const [subTab, setSubTab] = useState<SettingsSubTab>("general");

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in">
      {/* Settings Sub-Tab Navigation */}
      <div className="flex gap-2 bg-muted/40 p-1 rounded-xl border border-border/50 max-w-md">
        <button
          onClick={() => setSubTab("general")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200",
            subTab === "general"
              ? "bg-card text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Dispositivos & Aparência</span>
        </button>
        <button
          onClick={() => setSubTab("ai_providers")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200",
            subTab === "ai_providers"
              ? "bg-card text-foreground shadow-sm border border-border/60"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Cpu className="h-3.5 w-3.5 text-amber-500" />
          <span>Provedores de IA</span>
        </button>
      </div>

      {subTab === "general" ? <GeneralSettingsPane /> : <AIProvidersSettingsPane />}
    </div>
  );
};
