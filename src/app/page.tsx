"use client";

import { useState, useTransition, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loginAction, logoutAction, getSessionUserAction } from "@/app/actions/authActions";
import { UserAccount } from "@/lib/services/authService";
import { toast } from "sonner";
import {
  ArrowRight,
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
  Shield,
  User,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load existing session info if present, but DO NOT block the auth page
  useEffect(() => {
    getSessionUserAction().then((u) => {
      if (u) setCurrentUser(u);
    });
  }, []);

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
          if (redirectTarget && redirectTarget.startsWith("/")) {
            router.push(redirectTarget);
          } else if (res.user.role === "ADMIN") {
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

  return (
    <div className="w-full max-w-md relative z-10 space-y-5">
      {/* Active Session Notice Banner if user already has a session */}
      {currentUser && (
        <div className="bg-emerald-950/70 border border-emerald-500/40 backdrop-blur-md rounded-2xl p-4 flex items-center justify-between text-white shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs ring-1 ring-emerald-500/40">
              {currentUser.avatar || <User className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs font-semibold text-emerald-200">
                Active Session: {currentUser.fullName}
              </div>
              <div className="text-[10px] text-emerald-400/80 font-mono">
                Role: {currentUser.role}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                await logoutAction();
                setCurrentUser(null);
                toast.success("Signed out successfully.");
              }}
              className="h-8 text-xs bg-transparent border-emerald-500/40 text-emerald-200 hover:bg-emerald-900/50 rounded-xl px-2.5"
            >
              Sign Out
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                router.push(
                  redirectTarget && redirectTarget.startsWith("/")
                    ? redirectTarget
                    : currentUser.role === "ADMIN"
                    ? "/events"
                    : "/scan"
                )
              }
              className="h-8 text-xs bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl px-3"
            >
              Go to {currentUser.role === "ADMIN" ? "Events Hub" : "Gate Scanner"} &rarr;
            </Button>
          </div>
        </div>
      )}

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
                  autoComplete="email"
                  placeholder="name@eventportal.com"
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
                  autoComplete="current-password"
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



          <div className="pt-2 text-center">
            <div className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 font-medium bg-slate-50 border border-slate-100 rounded-full px-3 py-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Protected Access: Authorized portal users only</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Available Portal Roles:
            </div>
            <div className="flex items-start gap-1.5">
              <span className="font-semibold text-primary shrink-0">&bull; Administrator:</span>
              <span className="text-slate-600">All Events Hub, Dashboards, Registrations, Bulk Imports & Security Audit</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="font-semibold text-emerald-700 shrink-0">&bull; Gate Volunteer:</span>
              <span className="text-slate-600">On-site QR Camera Scanner & Venue Attendance Roster</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer info */}
      <p className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
        <Shield className="w-3 h-3 text-slate-500" />
        <span>Secured Event Authentication System &bull; Active Brute-Force & Injection Defense</span>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <Suspense fallback={<div className="text-white text-sm">Loading portal...</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
