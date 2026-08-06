import { useState } from "react";
import { Loader2, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { useSessions } from "@/stores/sessions";
import { pairSession } from "@/services/sessions";
import { toast } from "sonner";
import type { SessionInfo } from "@/types/session";

interface SessionPairingProps {
  session: SessionInfo;
  onPairRequested?: () => void;
}

export const SessionPairing = ({ session, onPairRequested }: SessionPairingProps) => {
  const qr = useSessions((s) => s.qrs[session.id]);
  const [pairing, setPairing] = useState(false);

  const handlePair = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPairing(true);
    try {
      await pairSession(session.id);
      onPairRequested?.();
      toast.success("Solicitação enviada. Gerando novo QR Code...");
    } catch (err) {
      toast.error(`Erro ao gerar QR Code: ${(err as Error).message}`);
    } finally {
      setPairing(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-4 text-center space-y-4">
      {qr ? (
        <div className="flex flex-col items-center space-y-3">
          <div className="rounded-xl border bg-white p-3.5 shadow-sm">
            <QRCodeSVG value={qr} size={210} marginSize={1} />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground">
              Escaneie o QR Code com seu WhatsApp
            </p>
            <p className="text-[11px] text-muted-foreground max-w-xs">
              Abra o WhatsApp &gt; Aparelhos Conectados &gt; Conectar um aparelho.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePair}
            disabled={pairing}
            className="gap-1.5 text-xs rounded-lg mt-1"
          >
            {pairing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span>Gerar Novo QR Code</span>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-3.5 py-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Smartphone className="h-6 w-6" />
          </div>

          <div className="space-y-1 max-w-xs">
            <h4 className="text-sm font-bold text-foreground">Dispositivo Desconectado</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Esta sessão do WhatsApp não está pareada ou foi desconectada. Clique no botão abaixo para gerar o QR Code e reconectar.
            </p>
          </div>

          <Button
            onClick={handlePair}
            disabled={pairing}
            className="gap-2 rounded-xl shadow-xs px-5"
          >
            {pairing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            <span>Gerar QR Code &amp; Reconectar</span>
          </Button>
        </div>
      )}
    </div>
  );
};

