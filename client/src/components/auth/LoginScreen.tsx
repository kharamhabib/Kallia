import { useState } from "react";
import { Loader2, PhoneCall, KeyRound, Mail, Building, ShieldCheck, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuth } from "@/lib/auth";

type AuthMode = "login" | "register" | "forgot_request" | "forgot_reset";

export const LoginScreen = ({ onSuccess }: { onSuccess: () => void }) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const base = window.location.origin;

  const resetMessages = () => {
    setErr("");
    setSuccessMsg("");
  };

  const handleLoginOrRegister = async () => {
    setBusy(true);
    resetMessages();

    const cleanEmail = email.trim().toLowerCase();

    try {
      if (mode === "register") {
        const r = await fetch(`${base}/api/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: cleanEmail, password, name: projectName.trim() }),
        });
        const data = await r.json();
        if (!r.ok) {
          if (r.status === 409) {
            setErr("Este e-mail já está cadastrado. Por favor, faça login.");
          } else {
            setErr(data.error || `Erro ${r.status}`);
          }
          return;
        }
        setSuccessMsg("Conta criada! Entrando...");
      }

      const loginRes = await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) {
        setErr(loginData.error || `Erro ${loginRes.status}`);
        return;
      }

      setAuth(base, loginData.token, loginData.user);
      onSuccess();
    } catch {
      setErr("Não foi possível conectar ao servidor.");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestCode = async () => {
    setBusy(true);
    resetMessages();

    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await fetch(`${base}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: cleanEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Erro ao solicitar código de recuperação");
        return;
      }

      setSuccessMsg(data.message || "Código gerado com sucesso!");
      if (data.code) {
        setResetCode(data.code);
      }
      setMode("forgot_reset");
    } catch {
      setErr("Erro ao conectar ao servidor para recuperação.");
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async () => {
    setBusy(true);
    resetMessages();

    const cleanEmail = email.trim().toLowerCase();
    try {
      const res = await fetch(`${base}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          code: resetCode.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.error || "Erro ao redefinir a senha.");
        return;
      }

      setSuccessMsg("Senha alterada com sucesso! Faça login com a nova senha.");
      setPassword(newPassword);
      setNewPassword("");
      setResetCode("");
      setMode("login");
    } catch {
      setErr("Erro ao conectar ao servidor.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{
        background: "linear-gradient(135deg, hsl(222.2 47.4% 11.2%) 0%, hsl(222.2 47.4% 6%) 100%)",
      }}
    >
      <div className="w-full max-w-sm animate-slide-up">
        <div
          className="rounded-2xl border border-slate-800 bg-slate-950/80 p-8 space-y-6 text-slate-100 backdrop-blur-md"
          style={{ boxShadow: "0 8px 32px rgb(0 0 0 / 0.3), 0 4px 12px rgb(0 0 0 / 0.2)" }}
        >
          {/* Logo & branding */}
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
              <PhoneCall className="h-7 w-7" />
            </span>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
                Kallia
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                {mode === "register" && "Crie sua conta e inicie seu projeto"}
                {mode === "login" && "Acesse com seu e-mail e senha"}
                {mode === "forgot_request" && "Recuperação de Senha"}
                {mode === "forgot_reset" && "Digite o código e sua nova senha"}
              </p>
            </div>
          </div>

          {/* Form Content */}
          <div className="space-y-4">
            {mode === "register" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Building className="h-3.5 w-3.5" /> Nome do Projeto / Empresa
                </Label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ex: Minha Empresa CallCenter"
                  className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600"
                />
              </div>
            )}

            {/* Email Field (Always visible) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> E-mail
              </Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (mode === "forgot_request") handleRequestCode();
                    else if (mode === "forgot_reset") handleResetPassword();
                    else handleLoginOrRegister();
                  }
                }}
                placeholder="nome@exemplo.com"
                className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600"
              />
            </div>

            {/* Password Field (for Login/Register) */}
            {(mode === "login" || mode === "register") && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> Senha
                  </Label>
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode("forgot_request");
                        resetMessages();
                      }}
                      className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Esqueci a senha
                    </button>
                  )}
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (err) setErr("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLoginOrRegister();
                  }}
                  placeholder="••••••••"
                  className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600"
                />
              </div>
            )}

            {/* Reset Code & New Password Fields (for Forgot Reset) */}
            {mode === "forgot_reset" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-indigo-400" /> Código de 6 Dígitos
                  </Label>
                  <Input
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    placeholder="123456"
                    className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600 text-center font-mono tracking-widest text-lg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" /> Nova Senha
                  </Label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleResetPassword();
                    }}
                    placeholder="Mínimo 6 caracteres"
                    className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600"
                  />
                </div>
              </>
            )}

            {/* Error & Success Messages */}
            {err && <p className="text-sm text-red-400 font-medium">{err}</p>}
            {successMsg && (
              <p className="text-sm text-emerald-400 font-medium bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-800/50">
                {successMsg}
              </p>
            )}

            {/* Submit Buttons */}
            {(mode === "login" || mode === "register") && (
              <Button
                className="w-full h-10 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                disabled={busy || !email.trim() || !password.trim() || (mode === "register" && !projectName.trim())}
                onClick={handleLoginOrRegister}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {mode === "register" ? "Cadastrar Projeto" : "Entrar"}
              </Button>
            )}

            {mode === "forgot_request" && (
              <Button
                className="w-full h-10 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                disabled={busy || !email.trim()}
                onClick={handleRequestCode}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Gerar Código de Recuperação
              </Button>
            )}

            {mode === "forgot_reset" && (
              <Button
                className="w-full h-10 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white"
                disabled={busy || !email.trim() || !resetCode.trim() || newPassword.length < 6}
                onClick={handleResetPassword}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Salvar Nova Senha
              </Button>
            )}
          </div>

          {/* Footer Options */}
          <div className="text-center space-y-2 pt-2 border-t border-slate-800/60">
            {(mode === "forgot_request" || mode === "forgot_reset") ? (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  resetMessages();
                }}
                className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-center gap-1 mx-auto"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Login
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "register" ? "login" : "register");
                  resetMessages();
                }}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {mode === "register"
                  ? "Já possui uma conta? Faça login"
                  : "Não tem uma conta? Cadastre aqui"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          WhatsApp voice calls with AI-powered agents
        </p>
      </div>
    </div>
  );
};
