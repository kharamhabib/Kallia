import { useState } from "react";
import {
  CreditCard,
  Zap,
  CheckCircle2,
  Sparkles,
  Download,
  Plus,
  Bot,
  PhoneCall,
  Check,
  RefreshCw,
  QrCode,
  DollarSign,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { useWorkspaceStore } from "@/stores/workspace";

interface Invoice {
  id: string;
  date: string;
  amount: string;
  description: string;
  status: "paid" | "pending";
}

const mockInvoices: Invoice[] = [
  { id: "inv-2026-08", date: "01/08/2026", amount: "R$ 299,00", description: "Assinatura Plano Kallia Pro - Mensal", status: "paid" },
  { id: "inv-2026-07", date: "15/07/2026", amount: "R$ 100,00", description: "Recarga de Créditos de Voz Adicionais (Pix)", status: "paid" },
  { id: "inv-2026-06", date: "01/07/2026", amount: "R$ 299,00", description: "Assinatura Plano Kallia Pro - Mensal", status: "paid" },
];

export const BillingPage = ({ sid: _sid }: { sid: string }) => {
  const { currentWorkspace, updateWorkspace } = useWorkspaceStore();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlan, setSelectedPlan] = useState<string>(currentWorkspace?.plan || "pro");
  const [showRechargeModal, setShowRechargeModal] = useState(false);
  const [rechargeAmount, setRechargeAmount] = useState<number>(100);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const handleProcessRecharge = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      setShowRechargeModal(false);
      toast.success(`Recarga de R$ ${rechargeAmount},00 efetuada com sucesso! Saldo atualizado.`);
    }, 1200);
  };

  const handleSelectPlan = async (planId: string, planName: string) => {
    setSelectedPlan(planId);
    if (currentWorkspace) {
      let maxConn = 1;
      let maxCalls = 1;
      let maxAgents = 2;
      if (planId === "starter" || planId === "basic") {
        maxConn = 1;
        maxCalls = 2;
        maxAgents = 2;
      } else if (planId === "pro") {
        maxConn = 3;
        maxCalls = 5;
        maxAgents = 5;
      } else if (planId === "expert") {
        maxConn = 10;
        maxCalls = 20;
        maxAgents = 50;
      } else if (planId === "enterprise") {
        maxConn = 50;
        maxCalls = 100;
        maxAgents = 500;
      }
      try {
        await updateWorkspace(currentWorkspace.id, {
          plan: (planId === "starter" ? "basic" : planId) as any,
          max_connections: maxConn,
          max_concurrent_calls: maxCalls,
          max_agents: maxAgents,
        });
        toast.success(`Plano do workspace atualizado para ${planName}!`);
      } catch {
        toast.success(`Plano ${planName} selecionado.`);
      }
    } else {
      toast.success(`Plano ${planName} selecionado.`);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Assinatura & Planos
            </h1>
            <p className="text-xs text-muted-foreground">
              Gerencie sua assinatura Kallia, acompanhe o consumo de minutos de voz/IA e faça recargas de créditos.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setShowRechargeModal(true)}
            className="gap-2 shadow-xs cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Recarregar Créditos
          </Button>
        </div>
      </div>

      {/* Active Subscription & Usage Section */}
      <Card className="card-premium border-l-4 border-l-primary">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">Plano Ativo: Kallia Pro</CardTitle>
                <span className="text-[10px] font-bold bg-primary/15 text-primary px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                  Renovação Automática
                </span>
              </div>
              <CardDescription className="text-xs mt-0.5">
                Sua assinatura renova em <strong>01 de Setembro de 2026</strong>.
              </CardDescription>
            </div>

            <div className="flex items-center gap-3 bg-muted/30 p-2.5 rounded-xl border">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Saldo Extra Disponível</p>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">R$ 150,00</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowRechargeModal(true)} className="h-8 text-xs cursor-pointer">
                Adicionar
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 pt-2">
          {/* Progress Bars for Usage */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Minutos de Voz */}
            <div className="p-3.5 rounded-xl border bg-card/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <PhoneCall className="h-3.5 w-3.5 text-primary" /> Minutos de Voz IA
                </span>
                <span className="font-bold text-primary">680 / 1.000 min</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: "68%" }} />
              </div>
              <p className="text-[11px] text-muted-foreground">68% consumido neste período</p>
            </div>

            {/* Mensagens WhatsApp */}
            <div className="p-3.5 rounded-xl border bg-card/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-500" /> Disparos & NPS
                </span>
                <span className="font-bold text-amber-500">4.120 / 10.000</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: "41%" }} />
              </div>
              <p className="text-[11px] text-muted-foreground">41% consumido neste período</p>
            </div>

            {/* Agentes IA */}
            <div className="p-3.5 rounded-xl border bg-card/60 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Bot className="h-3.5 w-3.5 text-emerald-500" /> Agentes de Voz Ativos
                </span>
                <span className="font-bold text-emerald-500">4 / 5 Agentes</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: "80%" }} />
              </div>
              <p className="text-[11px] text-muted-foreground">1 slot de agente disponível</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plans Comparison Section */}
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Planos Disponíveis Kallia
            </h3>
            <p className="text-xs text-muted-foreground">
              Escolha o plano ideal para a sua empresa crescer o volume de atendimentos e chamadas por voz.
            </p>
          </div>

          {/* Billing Cycle Switch */}
          <div className="flex items-center gap-1 rounded-xl border bg-card p-1 text-xs">
            <button
              onClick={() => setBillingCycle("monthly")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer",
                billingCycle === "monthly" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle("yearly")}
              className={cn(
                "px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1",
                billingCycle === "yearly" ? "bg-primary text-primary-foreground shadow-2xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Anual <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.2 rounded-full">-20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Starter Plan */}
          <Card
            className={cn(
              "card-premium relative transition-all duration-200",
              selectedPlan === "starter" && "border-2 border-primary"
            )}
          >
            <CardHeader>
              <CardTitle className="text-base">Starter</CardTitle>
              <CardDescription className="text-xs">Ideal para autônomos e pequenos negócios</CardDescription>
              <div className="pt-2">
                <span className="text-3xl font-black text-foreground">
                  {billingCycle === "monthly" ? "R$ 149" : "R$ 119"}
                </span>
                <span className="text-xs text-muted-foreground"> /mês</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span><strong>300 minutos</strong> de voz com IA</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Até <strong>2 Agentes IA</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span><strong>1 Sessão WhatsApp</strong> conectada</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Base de Conhecimento RAG Básico</span>
                </li>
              </ul>

              <Button
                variant={selectedPlan === "starter" ? "default" : "outline"}
                onClick={() => handleSelectPlan("starter", "Starter")}
                className="w-full text-xs cursor-pointer"
              >
                {selectedPlan === "starter" ? "Plano Selecionado" : "Trocar para Starter"}
              </Button>
            </CardContent>
          </Card>

          {/* Pro Plan (Recommended) */}
          <Card className="card-premium relative border-2 border-primary shadow-lg bg-card">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-extrabold uppercase px-3 py-1 rounded-full tracking-wider shadow-xs">
              Mais Popular
            </div>

            <CardHeader>
              <CardTitle className="text-base text-primary">Pro (Ativo)</CardTitle>
              <CardDescription className="text-xs">Para empresas que buscam alta escala e automação</CardDescription>
              <div className="pt-2">
                <span className="text-3xl font-black text-foreground">
                  {billingCycle === "monthly" ? "R$ 299" : "R$ 239"}
                </span>
                <span className="text-xs text-muted-foreground"> /mês</span>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <ul className="space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span><strong>1.000 minutos</strong> de voz com IA</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Até <strong>5 Agentes IA</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span><strong>3 Sessões WhatsApp</strong> conectadas</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>RAG Avançado (pgvector + Embeddings)</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Integração Chatwoot + Webhooks</span>
                </li>
              </ul>

              <Button
                disabled
                className="w-full text-xs bg-emerald-600 text-white cursor-default"
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Seu Plano Atual
              </Button>
            </CardContent>
          </Card>

          {/* Enterprise Plan */}
          <Card
            className={cn(
              "card-premium relative transition-all duration-200",
              selectedPlan === "enterprise" && "border-2 border-primary"
            )}
          >
            <CardHeader>
              <CardTitle className="text-base">Enterprise</CardTitle>
              <CardDescription className="text-xs">Para operação de alto volume e call centers</CardDescription>
              <div className="pt-2">
                <span className="text-3xl font-black text-foreground">
                  {billingCycle === "monthly" ? "R$ 799" : "R$ 639"}
                </span>
                <span className="text-xs text-muted-foreground"> /mês</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span><strong>3.500 minutos</strong> de voz com IA</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Agentes IA <strong>Ilimitados</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Sessões WhatsApp <strong>Ilimitadas</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Suporte Prioritário & Gerente Dedicado</span>
                </li>
              </ul>

              <Button
                variant={selectedPlan === "enterprise" ? "default" : "outline"}
                onClick={() => handleSelectPlan("enterprise", "Enterprise")}
                className="w-full text-xs cursor-pointer"
              >
                {selectedPlan === "enterprise" ? "Plano Selecionado" : "Fazer Upgrade para Enterprise"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invoices History Table */}
      <Card className="card-premium">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" /> Histórico de Faturas & Pagamentos
          </CardTitle>
          <CardDescription className="text-xs">
            Consulte os recibos das mensalidades e recargas realizadas na sua conta.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {mockInvoices.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between p-3.5 border rounded-xl bg-card hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">{inv.description}</h4>
                    <p className="text-[11px] text-muted-foreground">ID: {inv.id} • Data: {inv.date}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm font-extrabold text-foreground">{inv.amount}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toast.success(`Download do recibo ${inv.id} iniciado.`)}
                    className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recharge Modal */}
      <Dialog open={showRechargeModal} onOpenChange={setShowRechargeModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Recarregar Créditos de Voz & IA
            </DialogTitle>
            <DialogDescription className="text-xs">
              Adicione saldo extra para garantir que suas chamadas não sejam interrompidas ao esgotar a franquia do plano.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleProcessRecharge} className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Selecione o Valor da Recarga</Label>
              <div className="grid grid-cols-4 gap-2">
                {[50, 100, 250, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRechargeAmount(val)}
                    className={cn(
                      "py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer",
                      rechargeAmount === val
                        ? "border-primary bg-primary/10 text-primary shadow-2xs"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    R$ {val}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Forma de Pagamento</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("pix")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer",
                    paymentMethod === "pix"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-border bg-card text-muted-foreground"
                  )}
                >
                  <QrCode className="h-4 w-4" /> Pix Instantâneo
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-lg border transition-all cursor-pointer",
                    paymentMethod === "card"
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-card text-muted-foreground"
                  )}
                >
                  <CreditCard className="h-4 w-4" /> Cartão de Crédito
                </button>
              </div>
            </div>

            {paymentMethod === "pix" && (
              <div className="p-3.5 border rounded-xl bg-muted/20 text-center space-y-2">
                <p className="text-xs font-bold text-foreground">QR Code Pix gerado automaticamente</p>
                <div className="bg-white p-2 rounded-lg w-32 h-32 mx-auto flex items-center justify-center border shadow-xs">
                  <QrCode className="h-24 w-24 text-black" />
                </div>
                <p className="text-[11px] text-muted-foreground">O saldo é creditado em até 10 segundos após a confirmação.</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowRechargeModal(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isProcessingPayment} className="gap-2">
                {isProcessingPayment ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Confirmando...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" /> Concluir Recarga (R$ {rechargeAmount},00)
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
