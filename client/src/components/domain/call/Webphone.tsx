import { useState, useEffect } from "react";
import {
  Phone,
  Delete,
  Mic,
  MicOff,
  PhoneOff,
  Globe,
  Users,
  Search,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { startCall, endCall } from "@/services/calls";
import { useCalls } from "@/stores/calls";
import { useAIAgents } from "@/stores/ai";
import { useContactInfo } from "@/hooks/useContactInfo";
import { useContacts } from "@/hooks/useContacts";
import { useNavigation } from "@/stores/navigation";
import { formatPhoneNumber, getInitials } from "@/utils/format";
import { cn } from "@/lib/utils";
import type { Contact } from "@/types/contact";

export const ddiOptions = [
  { code: "55", flag: "🇧🇷", label: "+55 BR" },
  { code: "1", flag: "🇺🇸", label: "+1 US/CA" },
  { code: "351", flag: "🇵🇹", label: "+351 PT" },
  { code: "54", flag: "🇦🇷", label: "+54 AR" },
  { code: "52", flag: "🇲🇽", label: "+52 MX" },
  { code: "34", flag: "🇪🇸", label: "+34 ES" },
  { code: "44", flag: "🇬🇧", label: "+44 UK" },
];

export const formatPhoneInput = (val: string, ddi = "55"): string => {
  let digits = val.replace(/\D/g, "");
  if (!digits) return "";

  if (ddi === "55" && digits.startsWith("55") && digits.length >= 12) {
    digits = digits.slice(2);
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
};

export const normalizePhoneWithDDI = (ddi: string, phoneInput: string): string => {
  const digitsOnly = phoneInput.replace(/\D/g, "");
  if (!digitsOnly) return "";
  const ddiDigits = ddi.replace(/\D/g, "");
  if (ddiDigits && digitsOnly.startsWith(ddiDigits) && digitsOnly.length > ddiDigits.length + 8) {
    return digitsOnly;
  }
  return `${ddiDigits}${digitsOnly}`;
};

interface WebphoneProps {
  sid: string;
  useAI?: boolean;
  prompt?: string;
}

export const Webphone = ({ sid, useAI = true, prompt = "" }: WebphoneProps) => {
  const [ddi, setDdi] = useState("55");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAutoComplete, setShowAutoComplete] = useState(false);

  const dialPhone = useNavigation((s) => s.dialPhone);
  const setDialPhone = useNavigation((s) => s.setDialPhone);

  const calls = useCalls((s) => s.calls);
  const activeCall = calls.find((c) => c.sessionId === sid && c.status !== "ended");

  const activeAgentCalls = useAIAgents((s) => s.activeAgentCalls);
  const customPrompts = useAIAgents((s) => s.customPrompts);

  const isAgentActive = activeCall ? activeAgentCalls.has(activeCall.callId) : false;
  const activeCustomPrompt = activeCall ? customPrompts[activeCall.callId] : null;

  const { data: contact } = useContactInfo(sid, activeCall?.peer);
  const { data: contactsList = [] } = useContacts(sid, searchQuery || phone);

  const displayPhone = formatPhoneNumber(contact?.phone || activeCall?.peer);
  const displayName = contact?.name && contact.name !== contact.phone ? contact.name : displayPhone;
  const hasContactName = Boolean(contact?.name && contact.name !== contact.phone);

  // Escuta o sinal do botão de ligar vindo da tela de Contatos
  useEffect(() => {
    if (dialPhone) {
      const raw = dialPhone.replace(/\D/g, "");
      if (raw.startsWith("55") && raw.length >= 12) {
        setDdi("55");
        setPhone(formatPhoneInput(raw.slice(2), "55"));
      } else {
        setPhone(formatPhoneInput(raw, ddi));
      }
      setDialPhone("");
    }
  }, [dialPhone, ddi, setDialPhone]);



  const selectContact = (c: Contact) => {
    const raw = c.phone.replace(/\D/g, "");
    if (raw.startsWith("55") && raw.length >= 12) {
      setDdi("55");
      setPhone(formatPhoneInput(raw.slice(2), "55"));
    } else {
      setPhone(formatPhoneInput(raw, ddi));
    }
    setShowAutoComplete(false);
    setIsPickerOpen(false);
  };

  const handleKeyPress = (digit: string) => {
    const raw = phone.replace(/\D/g, "");
    if (raw.length < 11) {
      setPhone(formatPhoneInput(raw + digit, ddi));
    }
  };

  const handleBackspace = () => {
    const raw = phone.replace(/\D/g, "");
    setPhone(formatPhoneInput(raw.slice(0, -1), ddi));
  };

  const handleCall = async () => {
    if (!phone.trim()) {
      toast.error("Informe o número de telefone.");
      return;
    }

    const fullPhone = normalizePhoneWithDDI(ddi, phone);
    if (!fullPhone || fullPhone.length < 8) {
      toast.error("Número de telefone inválido.");
      return;
    }

    setLoading(true);
    try {
      await startCall(
        sid,
        fullPhone,
        true,
        useAI,
        prompt.trim() || undefined
      );
      toast.success(`Iniciando chamada para +${fullPhone}...`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleHangup = async () => {
    if (!activeCall) return;
    try {
      await endCall(sid, activeCall.callId);
      toast.info("Chamada finalizada.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const numericKeys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  // Filtra sugestões de auto-complete
  const autoCompleteSuggestions = phone.trim()
    ? (contactsList ?? []).filter(
        (c) =>
          c.phone.replace(/\D/g, "").includes(phone.replace(/\D/g, "")) ||
          (c.name || "").toLowerCase().includes(phone.toLowerCase()) ||
          (c.company || "").toLowerCase().includes(phone.toLowerCase())
      ).slice(0, 4)
    : [];

  return (
    <div className="rounded-3xl border bg-card p-6 shadow-xl space-y-5 animate-fade-in transition-all relative">
      {/* Phone Header */}
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold">
            <Phone className="h-4.5 w-4.5" />
          </div>
          <div>
            <h3 className="text-base font-extrabold tracking-tight text-foreground">Discador Webphone</h3>
            <p className="text-[11px] text-muted-foreground font-medium">Ligue diretamente para qualquer contato</p>
          </div>
        </div>
      </div>

      {/* Active Call Card Overlay */}
      {activeCall ? (
        <div className="rounded-2xl border bg-emerald-500/10 p-5 text-center space-y-4 animate-scale-in">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg animate-pulse">
            <Phone className="h-7 w-7" />
          </div>
          <div>
            <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Chamada Em Andamento</p>
            <h4 className="text-lg font-extrabold truncate px-2 text-foreground" title={displayName}>
              {displayName}
            </h4>
            {hasContactName && (
              <p className="text-xs font-medium text-muted-foreground font-mono truncate">{displayPhone}</p>
            )}
            <div className="flex items-center justify-center gap-2 mt-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
              <span className="text-xs text-muted-foreground font-medium">
                {isAgentActive ? "Atendimento por IA (Gemini Live)" : "Atendimento Manual"}
              </span>
            </div>
            {activeCustomPrompt && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 mt-2 truncate font-medium">
                💡 {activeCustomPrompt}
              </p>
            )}
          </div>



          {/* Active Controls */}
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMuted(!muted)}
              className={cn("h-11 w-11 rounded-full transition-all", muted && "bg-amber-500/15 text-amber-500 border-amber-500/30")}
              title={muted ? "Desmutar" : "Mutar Mic"}
            >
              {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>

            <Button
              variant="destructive"
              size="icon"
              onClick={handleHangup}
              className="h-12 w-12 rounded-full shadow-md hover:scale-105 transition-all"
              title="Desligar"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* Display Field com Seletor de DDI e Busca Integrada de Contatos */}
          <div className="space-y-1.5 relative">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Globe className="h-3 w-3 text-primary" />
                <span>Número de Telefone:</span>
              </label>

              <button
                type="button"
                onClick={() => setIsPickerOpen(true)}
                className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 focus:outline-none"
              >
                <Users className="h-3.5 w-3.5" />
                <span>Buscar Contato</span>
              </button>
            </div>

            <div className="flex items-center rounded-2xl border bg-muted/30 focus-within:bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all p-1.5 gap-2 relative">
              {/* Seletor de DDI */}
              <div className="relative flex items-center shrink-0 border-r pr-2 border-border/60">
                <select
                  value={ddi}
                  onChange={(e) => {
                    const newDdi = e.target.value;
                    setDdi(newDdi);
                    if (phone) setPhone(formatPhoneInput(phone, newDdi));
                  }}
                  className="bg-transparent font-mono text-xs font-bold text-foreground cursor-pointer focus:outline-none pr-1 pl-1"
                >
                  {ddiOptions.map((opt) => (
                    <option key={opt.code} value={opt.code} className="bg-card text-foreground font-mono">
                      {opt.flag} +{opt.code}
                    </option>
                  ))}
                </select>
              </div>

              {/* Input Numérico com Formatação de Telefone e Sugestões */}
              <input
                type="tel"
                value={phone}
                onFocus={() => setShowAutoComplete(true)}
                onBlur={() => setTimeout(() => setShowAutoComplete(false), 200)}
                onChange={(e) => {
                  setPhone(formatPhoneInput(e.target.value, ddi));
                  setShowAutoComplete(true);
                }}
                placeholder="Ex: (11) 99YYY-XXXX"
                className="w-full bg-transparent text-lg font-bold tracking-wider text-foreground focus:outline-none placeholder:text-muted-foreground/40 placeholder:font-normal placeholder:text-xs font-mono"
              />

              {phone && (
                <button
                  type="button"
                  onClick={handleBackspace}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 shrink-0"
                  title="Apagar dígito"
                >
                  <Delete className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Auto-complete Popover de Contatos */}
            {showAutoComplete && autoCompleteSuggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-primary/20 rounded-2xl shadow-xl p-2 space-y-1 animate-in fade-in-50 zoom-in-95">
                <p className="text-[10px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-wider">
                  Contatos Encontrados
                </p>
                {autoCompleteSuggestions.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={() => selectContact(c)}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-primary/10 transition-colors text-left group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {c.avatarUrl ? (
                        <img src={c.avatarUrl} alt={c.name} className="h-7 w-7 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="h-7 w-7 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {getInitials(c.name || "W")}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-foreground truncate group-hover:text-primary">
                          {c.name || "Contato WhatsApp"}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-mono truncate">
                          {formatPhoneNumber(c.phone)}
                        </p>
                      </div>
                    </div>
                    <Check className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            )}

            <p className="text-[10px] text-muted-foreground font-medium pl-1">
              O DDI <span className="font-bold text-primary font-mono">+{ddi}</span> será incluído automaticamente ao ligar.
            </p>
          </div>

          {/* Teclado Numérico Limpo 0-9 */}
          <div className="grid grid-cols-3 gap-2.5 pt-1">
            {numericKeys.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleKeyPress(num)}
                className="flex h-12 items-center justify-center rounded-2xl border bg-card hover:bg-muted/60 active:scale-95 transition-all text-lg font-extrabold text-foreground shadow-2xs"
              >
                {num}
              </button>
            ))}

            {/* Linha inferior: Limpar, 0 e Backspace */}
            <button
              type="button"
              onClick={() => setPhone("")}
              disabled={!phone}
              className="flex h-12 items-center justify-center rounded-2xl border bg-card hover:bg-muted/60 active:scale-95 transition-all text-xs font-bold text-muted-foreground disabled:opacity-40"
              title="Limpar tudo"
            >
              C
            </button>

            <button
              type="button"
              onClick={() => handleKeyPress("0")}
              className="flex h-12 items-center justify-center rounded-2xl border bg-card hover:bg-muted/60 active:scale-95 transition-all text-lg font-extrabold text-foreground shadow-2xs"
            >
              0
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              disabled={!phone}
              className="flex h-12 items-center justify-center rounded-2xl border bg-card hover:bg-muted/60 active:scale-95 transition-all text-muted-foreground disabled:opacity-40"
              title="Apagar último dígito"
            >
              <Delete className="h-5 w-5" />
            </button>
          </div>

          {/* Botão de Ligar */}
          <Button
            onClick={handleCall}
            disabled={loading || !phone}
            className="w-full h-12 rounded-2xl gap-2 text-base font-bold shadow-md bg-emerald-500 hover:bg-emerald-600 text-white transition-all active:scale-[0.98]"
          >
            <Phone className="h-5 w-5" />
            <span>{useAI ? "Ligar com IA" : "Ligar Manual"}</span>
          </Button>
        </>
      )}

      {/* Modal / Dialog Integrado para Selecionar Contato da Base */}
      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="sm:max-w-md card-premium">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Selecionar Contato para Ligar
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone ou empresa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
              {contactsList.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs">
                  Nenhum contato encontrado na sua base.
                </div>
              ) : (
                contactsList.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectContact(c)}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-primary/10 bg-card hover:bg-primary/10 hover:border-primary/30 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {c.avatarUrl ? (
                        <img
                          src={c.avatarUrl}
                          alt={c.name}
                          className="h-9 w-9 rounded-full object-cover border border-primary/10 shrink-0"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {getInitials(c.name || "W")}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-foreground truncate group-hover:text-primary">
                          {c.name || "Contato WhatsApp"}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {formatPhoneNumber(c.phone)}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" className="h-7 text-xs gap-1 font-semibold">
                      <Phone className="h-3 w-3 text-emerald-500" /> Discar
                    </Button>
                  </button>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
