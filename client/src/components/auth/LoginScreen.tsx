import { useState } from "react";
import { Loader2, PhoneCall, KeyRound, Mail, Building, ShieldCheck, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setAuth } from "@/lib/auth";
import { pb } from "@/lib/pocketbase";

type AuthMode = "login" | "register" | "forgot_request" | "forgot_reset";

export const LoginScreen = ({ onSuccess }: { onSuccess: () => void }) => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
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

  const handleGoogleLogin = async () => {
    setBusy(true);
    resetMessages();
    try {
      const authData = await pb.collection("users").authWithOAuth2({ provider: "google" });
      if (authData && authData.token) {
        setAuth(base, authData.token, {
          id: authData.record.id,
          email: authData.record.email,
          role: authData.record.role || "creator",
          projectId: (authData.record as any).project_id || "",
          name: (authData.record as any).name || "",
        });
        onSuccess();
      }
    } catch (err: any) {
      if (err?.name === "ClientResponseError" && err.status === 0) {
        setErr("Login com Google cancelado ou janela fechada.");
      } else {
        // Fallback suave
        setErr(err?.message || "Não foi possível autenticar com o Google no momento.");
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLoginOrRegister = async () => {
    setBusy(true);
    resetMessages();

    const cleanEmail = email.trim().toLowerCase();

    if (mode === "register") {
      if (password.length < 6) {
        setErr("A senha deve conter no mínimo 6 caracteres.");
        setBusy(false);
        return;
      }
      if (password !== confirmPassword) {
        setErr("As senhas não coincidem. Por favor, confira a digitação.");
        setBusy(false);
        return;
      }
    }

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
        setSuccessMsg("Conta criada com sucesso! Entrando no seu projeto...");
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
        setErr(data.error || "Erro ao solicitar recuperação de senha");
        return;
      }

      setSuccessMsg(data.message || "Instruções enviadas com sucesso!");
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
                {mode === "login" && "Acesse com sua conta ou Google"}
                {mode === "forgot_request" && "Recuperação de Senha"}
                {mode === "forgot_reset" && "Digite o código e sua nova senha"}
              </p>
            </div>
          </div>

          {/* Google OAuth2 Button (Login / Register) */}
          {(mode === "login" || mode === "register") && (
            <div className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full h-10 border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-slate-100 font-medium flex items-center justify-center gap-2.5 transition-all shadow-sm"
                onClick={handleGoogleLogin}
                disabled={busy}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continuar com Google
              </Button>

              <div className="relative flex items-center justify-center">
                <div className="border-t border-slate-800 w-full" />
                <span className="bg-slate-950 px-2 text-xs text-slate-500 uppercase tracking-wider font-semibold">
                  ou e-mail
                </span>
                <div className="border-t border-slate-800 w-full" />
              </div>
            </div>
          )}

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
                  placeholder="Ex: Minha Empresa"
                  className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600"
                />
              </div>
            )}

            {/* Email Field */}
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

            {/* Password Field */}
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
                        setConfirmPassword("");
                      }}
                      className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Esqueci a senha
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (err) setErr("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLoginOrRegister();
                    }}
                    placeholder="••••••••"
                    className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none p-1 rounded transition-colors"
                    title={showPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-slate-400" />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm Password Field (Register Only) */}
            {mode === "register" && (
              <div className="space-y-1.5 animate-fade-in">
                <Label className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Confirmar Senha
                </Label>
                <div className="relative">
                  <Input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (err) setErr("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleLoginOrRegister();
                    }}
                    placeholder="••••••••"
                    className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600 pr-10"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none p-1 rounded transition-colors"
                    title={showConfirmPassword ? "Ocultar senha" : "Ver senha"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-slate-400" />}
                  </button>
                </div>
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-[11px] text-amber-400 font-medium">As senhas não coincidem</p>
                )}
              </div>
            )}

            {/* Reset Code & New Password Fields */}
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
                  <div className="relative">
                    <Input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleResetPassword();
                      }}
                      placeholder="Mínimo 6 caracteres"
                      className="bg-slate-900/60 border-slate-800 focus-visible:ring-indigo-500 text-slate-100 placeholder:text-slate-600 pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 focus:outline-none p-1 rounded transition-colors"
                      title={showNewPassword ? "Ocultar senha" : "Ver senha"}
                    >
                      {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4 text-slate-400" />}
                    </button>
                  </div>
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
                disabled={
                  busy ||
                  !email.trim() ||
                  !password.trim() ||
                  (mode === "register" && (!projectName.trim() || !confirmPassword.trim() || password !== confirmPassword))
                }
                onClick={handleLoginOrRegister}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {mode === "register" ? "Criar Projeto e Entrar" : "Entrar com E-mail"}
              </Button>
            )}

            {mode === "forgot_request" && (
              <Button
                className="w-full h-10 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white"
                disabled={busy || !email.trim()}
                onClick={handleRequestCode}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Enviar Código de Recuperação
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
            {mode === "forgot_request" || mode === "forgot_reset" ? (
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  resetMessages();
                  setConfirmPassword("");
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
                  setConfirmPassword("");
                }}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {mode === "register"
                  ? "Já possui uma conta? Faça login"
                  : "Não tem uma conta? Cadastre-se aqui"}
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-4">
          Kallia VoIP & AI Multi-Provider Platform
        </p>
      </div>
    </div>
  );
};
