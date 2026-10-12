"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction } from "@/app/actions/authActions";
import { toast } from "sonner";
import {
  ArrowRight,
  QrCode,
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  UserCheck,
  CheckCircle2,
  Calendar,
} from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please enter both your account email and password.");
      return;
    }

    startTransition(async () => {
      try {
        const res = await loginAction(email, password);
        if (res.success && res.user) {
          toast.success(`Welcome back, ${res.user.fullName}!`);
          if (res.user.role === "ADMIN") {
            router.push("/events");
          } else {
            router.push("/scan");
          }
        } else {
          setErrorMessage(res.error || "Invalid account credentials. Please try again.");
          toast.error("Authentication failed.");
        }
      } catch (err: any) {
        setErrorMessage(err.message || "An unexpected error occurred during sign in.");
      }
    });
  };

  const handleFillDemo = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage("");
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-5">
        {/* Main Card */}
        <Card className="bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-2xl shadow-black/40 rounded-2xl overflow-hidden relative">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-primary via-indigo-500 to-blue-600" />

          <CardHeader className="text-center pt-8 pb-4 px-6 sm:px-8 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-1 font-sans font-bold text-2xl shadow-xs ring-4 ring-primary/5">
              E
            </div>
            <CardTitle className="text-2xl sm:text-3xl font-sans font-bold text-slate-900 tracking-tight">
              Event Portal Sign In
            </CardTitle>
            <CardDescription className="text-slate-500 text-xs sm:text-sm">
              Collegiate Tournaments, Hackathons & Verification Hub
            </CardDescription>
          </CardHeader>

          <CardContent className="px-6 sm:px-8 pb-8 space-y-5">
            {/* Error Message Alert */}
            {errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Account Email / Username</span>
                  <span className="text-[10px] text-slate-400 font-normal">Official Portal ID</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    type="email"
                    required
                    placeholder="admin@eventportal.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-10.5 rounded-xl text-xs sm:text-sm bg-slate-50/50 border-slate-300 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                  <span>Account Password</span>
                  <span className="text-[10px] text-slate-400 font-normal">Case-sensitive</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="Enter your account password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 pr-9 h-10.5 rounded-xl text-xs sm:text-sm bg-slate-50/50 border-slate-300 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full h-11 rounded-xl font-semibold text-sm bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/25 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-2"
              >
                {isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing In...
                  </span>
                ) : (
                  <>
                    Sign In to Portal
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Quick Demo Credentials Pill Selectors */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                <span className="flex items-center gap-1 text-slate-600 font-semibold">
                  <Sparkles className="w-3 h-3 text-amber-500" /> Quick Demo Credentials:
                </span>
                <span className="text-[10px] text-slate-400">Click to autofill</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleFillDemo("admin@eventportal.com", "admin123")}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-primary/60 hover:bg-primary/5 bg-slate-50 text-left transition-all group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 group-hover:text-primary">
                    <ShieldCheck className="w-3.5 h-3.5 text-primary" />
                    Administrator
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                    admin@eventportal.com
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">pass: admin123</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleFillDemo("volunteer@eventportal.com", "volunteer123")}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-emerald-600/60 hover:bg-emerald-50 bg-slate-50 text-left transition-all group"
                >
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                    <QrCode className="w-3.5 h-3.5 text-emerald-600" />
                    Gate Volunteer
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate">
                    volunteer@eventportal.com
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">pass: volunteer123</div>
                </button>
              </div>
            </div>

            {/* Direct Navigation Links for quick testing */}
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/80 flex items-center justify-between text-xs font-sans">
              <span className="text-slate-600 font-medium">Direct Access:</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => router.push("/events")}
                  className="text-primary hover:underline font-semibold flex items-center gap-1"
                >
                  <Calendar className="w-3 h-3" /> Event Hub
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => router.push("/scan")}
                  className="text-slate-700 hover:underline font-semibold flex items-center gap-1"
                >
                  <QrCode className="w-3 h-3 text-slate-500" /> Gate Scanner
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-400">
          Secured Event Authentication System &bull; Active Node Session
        </p>
      </div>
    </main>
  );
}
