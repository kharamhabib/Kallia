import { useEffect, useState } from "react";
import { Key, Eye, EyeOff, Check, ShieldCheck, Sparkles, Cpu, Layers } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/Switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAIProviders, updateAIProvider, type AIProviderConfig } from "@/services/aiProviders";

type ProviderTab = "grok" | "gemini" | "openai";

export const AIProvidersSettingsPane = () => {
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [activeTab, setActiveTab] = useState<ProviderTab>("grok");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form states per provider
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [enabledState, setEnabledState] = useState<Record<string, boolean>>({});
  const [selectedModels, setSelectedModels] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const loadProviders = async () => {
    try {
      setLoading(true);
      const res = await getAIProviders();
      const list = res.providers || [];
      setProviders(list);

      const keys: Record<string, string> = {};
      const en: Record<string, boolean> = {};
      const models: Record<string, string> = {};

      list.forEach((p: AIProviderConfig) => {
        keys[p.provider] = p.maskedKey || "";
        en[p.provider] = p.enabled;
        models[p.provider] = p.defaultModel;
      });

      setApiKeys(keys);
      setEnabledState(en);
      setSelectedModels(models);
    } catch (e) {
      toast.error("Erro ao carregar provedores de IA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const handleSave = async (providerKey: string) => {
    try {
      setSaving(true);
      const keyVal = apiKeys[providerKey] || "";
      const isEnabled = enabledState[providerKey] || false;
      const model = selectedModels[providerKey] || "";

      await updateAIProvider(providerKey, {
        apiKey: keyVal,
        enabled: isEnabled,
        defaultModel: model,
      });

      toast.success(`Configuração do provedor ${providerKey.toUpperCase()} salva com sucesso! (Criptografada AES-256)`);
      await loadProviders();
    } catch (e) {
      toast.error("Falha ao salvar chave do provedor");
    } finally {
      setSaving(false);
    }
  };

  const activeProvider = providers.find((p: AIProviderConfig) => p.provider === activeTab);

  const tabs: { key: ProviderTab; label: string; icon: typeof Sparkles; color: string }[] = [
    { key: "grok", label: "xAI Grok Live", icon: Sparkles, color: "text-amber-500" },
    { key: "gemini", label: "Google Gemini Live", icon: Cpu, color: "text-blue-500" },
    { key: "openai", label: "OpenAI GPT Live", icon: Layers, color: "text-emerald-500" },
  ];

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground animate-pulse">
        Carregando provedores de IA...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Informational Header */}
      <div className="px-1 space-y-1">
        <h3 className="text-lg font-semibold tracking-tight">Provedores de IA & Modelos ao Vivo</h3>
        <p className="text-sm text-muted-foreground">
          Gerencie as chaves de API e a ativação dos modelos de voz em tempo real (Speech to Speech).
          Todas as chaves fornecidas são armazenadas no banco de dados com <strong>criptografia AES-256-GCM</strong>.
        </p>
      </div>

      {/* Sub-Tabs Selection */}
      <div className="flex gap-2 border-b border-border/60 pb-3 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isSelected = activeTab === t.key;
          const pData = providers.find((p: AIProviderConfig) => p.provider === t.key);
          const isAct = pData?.enabled && pData?.hasKey;

          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all duration-200 border",
                isSelected
                  ? "bg-card border-primary/50 text-foreground shadow-sm ring-1 ring-primary/20"
                  : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", t.color)} />
              <span>{t.label}</span>
              {isAct ? (
                <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px] px-1.5 py-0">
                  Ativo
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                  Inativo
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Provider Card */}
      {activeProvider && (
        <Card className="card-premium border-border/80 shadow-md">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <Key className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {activeProvider.name}
                    {enabledState[activeTab] && activeProvider.hasKey && (
                      <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 font-medium">
                        <Check className="h-3 w-3 mr-1" /> Pronto p/ Uso
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Configuração de chave de API e parâmetros do modelo
                  </CardDescription>
                </div>
              </div>

              {/* Enable Switch */}
              <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border border-border/50">
                <Label htmlFor={`switch-${activeTab}`} className="text-xs font-medium cursor-pointer">
                  {enabledState[activeTab] ? "Ativado" : "Desativado"}
                </Label>
                <Switch
                  id={`switch-${activeTab}`}
                  checked={enabledState[activeTab] || false}
                  onChange={(v: boolean) =>
                    setEnabledState((prev) => ({ ...prev, [activeTab]: v }))
                  }
                />
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 pt-2">
            {/* API Key Input Field */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`apikey-${activeTab}`} className="text-sm font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-500" />
                  API Key do Provedor
                </Label>
                {activeProvider.hasKey && (
                  <span className="text-[11px] text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-md font-mono flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Criptografado no banco (AES-256-GCM)
                  </span>
                )}
              </div>

              <div className="relative flex items-center">
                <Input
                  id={`apikey-${activeTab}`}
                  type={showKeys[activeTab] ? "text" : "password"}
                  placeholder={`Cole sua API Key do ${activeProvider.name} aqui...`}
                  value={apiKeys[activeTab] || ""}
                  onChange={(e) =>
                    setApiKeys((prev) => ({ ...prev, [activeTab]: e.target.value }))
                  }
                  className="pr-10 font-mono text-sm"
                />
                <button
                  type="button"
                  onClick={() =>
                    setShowKeys((prev) => ({ ...prev, [activeTab]: !prev[activeTab] }))
                  }
                  className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors p-1"
                  title={showKeys[activeTab] ? "Ocultar Chave" : "Mostrar Chave"}
                >
                  {showKeys[activeTab] ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Sua chave fica protegida por criptografia simétrica no banco de dados. Nem administradores conseguem visualizar a chave em texto plano.
              </p>
            </div>

            {/* Default Model Select */}
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Modelo Padrão</Label>
              <select
                value={selectedModels[activeTab] || activeProvider.defaultModel}
                onChange={(e) =>
                  setSelectedModels((prev) => ({ ...prev, [activeTab]: e.target.value }))
                }
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {activeProvider.availableModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
              </select>
            </div>

            {/* Model List Cards */}
            <div className="space-y-2 pt-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Modelos Suportados por este Provedor
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {activeProvider.availableModels.map((m) => (
                  <div
                    key={m.id}
                    className="p-3 rounded-lg border border-border/60 bg-muted/20 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-foreground">{m.name}</span>
                      <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {m.id}
                      </code>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{m.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-3 border-t border-border/40">
              <Button
                onClick={() => handleSave(activeTab)}
                disabled={saving}
                className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 font-medium shadow"
              >
                {saving ? "Salvando..." : "Salvar Configurações do Provedor"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
