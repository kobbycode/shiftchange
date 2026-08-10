"use client";

import * as React from "react";
import { db } from "@/lib/firestore";
import { AuthCard } from "@/components/auth/auth-card";
import { User } from "@/lib/mock-db";
import {
  ArrowRight, ShieldAlert,
  Sun, Moon, KeyRound, Play, Eye, Mail, Lock,
} from "lucide-react";
import { useTheme, ThemeProvider } from "@/components/theme-provider";

function LoginPageContent() {
  const { theme, setTheme } = useTheme();

  const [pin, setPin] = React.useState("");
  const [demoUsers, setDemoUsers] = React.useState<User[]>([]);
  const [error, setError] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // Technician who just signed in — awaiting their on-duty confirmation
  const [pendingUser, setPendingUser] = React.useState<User | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  // Email/password mode (switches over the PIN form)
  const [emailMode, setEmailMode] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  // Shared post-login: technicians confirm on-duty, everyone else proceeds
  const completeLogin = (user: User) => {
    if (user.role === "Technician") {
      setPendingUser(user);
      setSubmitting(false);
      return;
    }
    localStorage.setItem("shift_checkin_optin", "0");
    window.location.href = "/";
  };

  React.useEffect(() => {
    db.users.list().then((users) => {
      // Only show users still on their default PIN — anyone who changed their
      // credentials disappears from the quick-login list (is_default = false)
      const validUsers = users.filter((u) => u.pin && u.pin.length === 4);
      const defaultUsers = validUsers.filter((u) => u.is_default !== false);
      setDemoUsers(defaultUsers.length > 0 ? defaultUsers : []);
    }).catch(() => {
      setDemoUsers([]);
    });
  }, []);

  const handlePinLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!pin) { setError("Please enter your PIN."); return; }
    setSubmitting(true);
    try {
      const result = await db.auth.signIn("", pin);
      if (result.error) { setError(result.error); setSubmitting(false); return; }
      if (result.user) {
        completeLogin(result.user);
      } else {
        setSubmitting(false);
      }
    } catch (err) {
      setError("Login failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setSubmitting(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Enter your email address."); return; }
    if (!password) { setError("Enter your password."); return; }
    setSubmitting(true);
    try {
      const result = await db.auth.signInWithEmail(email.trim(), password);
      if (result.error) { setError(result.error); setSubmitting(false); return; }
      if (result.user) {
        completeLogin(result.user);
      } else {
        setSubmitting(false);
      }
    } catch (err) {
      setError("Login failed: " + (err instanceof Error ? err.message : "Unknown error"));
      setSubmitting(false);
    }
  };

  // "Start Shift" — explicitly record this technician's check-in for the
  // active shift (or start one if none is running), then enter the dashboard
  const handleStartShift = async () => {
    if (!pendingUser || confirming) return;
    setConfirming(true);
    try {
      localStorage.setItem("shift_checkin_optin", "1");
      await db.shifts.recordCheckIn(pendingUser.id);
      await db.sessions.log(pendingUser.id, "shift");
    } catch {}
    window.location.href = "/";
  };

  // "Just Browsing" — no attendance recorded, no shift started
  const handleJustBrowsing = async () => {
    if (!pendingUser || confirming) return;
    setConfirming(true);
    try {
      localStorage.setItem("shift_checkin_optin", "0");
      await db.sessions.log(pendingUser.id, "browsing");
    } catch {}
    window.location.href = "/";
  };

  return (
    <>
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="p-2.5 rounded-xl bg-card border border-border text-foreground hover:bg-secondary shadow-xs transition-colors cursor-pointer flex items-center gap-2 text-xs font-semibold"
        >
          {theme === "dark" ? (
            <><Sun className="w-4 h-4 text-amber-400" /><span>Light</span></>
          ) : (
            <><Moon className="w-4 h-4 text-purple-500" /><span>Dark</span></>
          )}
        </button>
      </div>

      <AuthCard
        title={emailMode ? "Sign in with email" : "Sign in with PIN"}
        subtitle={emailMode ? "Use the email account your admin set up for you" : "Select your name or enter your PIN below"}
      >
        {pendingUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-secondary/40 border border-border text-center">
              <div className="w-12 h-12 rounded-full bg-primary/15 text-primary flex items-center justify-center mx-auto mb-2">
                <span className="font-bold text-base">{pendingUser.name.charAt(0)}</span>
              </div>
              <p className="text-sm font-bold text-foreground">Welcome, {pendingUser.name}</p>
              <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Are you starting your shift on duty, or just checking in on things?
                Attendance is only recorded when you start your shift.
              </p>
            </div>

            <button
              type="button"
              disabled={confirming}
              onClick={handleStartShift}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm rounded-lg cursor-pointer transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {confirming ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Play className="w-4 h-4" /><span>Start Shift — I&apos;m on duty</span></>
              )}
            </button>

            <button
              type="button"
              disabled={confirming}
              onClick={handleJustBrowsing}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-secondary/50 hover:bg-secondary text-foreground font-semibold text-sm rounded-lg border border-border cursor-pointer transition-colors disabled:opacity-50"
            >
              <><Eye className="w-4 h-4 text-muted-foreground" /><span>Just Browsing — don&apos;t record me</span></>
            </button>

            {confirming && (
              <p className="text-[10px] text-muted-foreground text-center">Processing your choice...</p>
            )}
          </div>
        ) : (
          <>
        {emailMode ? (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
                <ShieldAlert className="w-4 h-4 shrink-0" /><span>{error}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Email address</label>
              <div className="relative flex items-center">
                <Mail className="absolute left-3 w-4 h-4 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(""); }}
                  autoComplete="email"
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground"
                  placeholder="you@station.example"
                  autoFocus
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm rounded-lg cursor-pointer transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {submitting ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <><span>Sign In</span><ArrowRight className="w-4 h-4" /></>
              )}
            </button>
            <button
              type="button"
              onClick={() => { setEmailMode(false); setError(""); }}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground hover:text-foreground font-semibold cursor-pointer transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" /><span>Back to PIN sign-in</span>
            </button>
          </form>
        ) : (
          <>
        {demoUsers.length > 0 && (
          <div className="mb-5 space-y-3">
            <div className="flex items-center justify-between mb-1.5 px-1">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Select Account to login</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {demoUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setPin(u.pin)}
                  className="px-2.5 py-3 bg-secondary/50 hover:bg-secondary border border-border hover:border-primary/40 text-left rounded-lg transition-colors cursor-pointer group"
                >
                  <p className="text-[10px] font-bold text-foreground group-hover:text-primary truncate">{u.name}</p>
                  <p className="text-[8px] text-muted-foreground font-mono tracking-wider">{u.role}</p>
                </button>
              ))}
            </div>
          </div>
        )}
        {demoUsers.length === 0 && (
          <div className="mb-5 p-3 rounded-lg bg-secondary/40 border border-border text-center">
            <p className="text-[10px] font-semibold text-muted-foreground">
              All staff PINs have been personalized. Enter your PIN below to sign in.
            </p>
          </div>
        )}

        <form onSubmit={handlePinLogin} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
              <ShieldAlert className="w-4 h-4 shrink-0" /><span>{error}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Enter your PIN</label>
            <div className="relative flex items-center">
              <KeyRound className="absolute left-3 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }}
                maxLength={4}
                className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground text-center text-lg font-bold"
                placeholder="••••"
                autoFocus
                required
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm rounded-lg cursor-pointer transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {submitting ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <><span>Authenticate Access</span><ArrowRight className="w-4 h-4" /></>
            )}
          </button>
        </form>
        <button
          type="button"
          onClick={() => { setEmailMode(true); setError(""); }}
          className="w-full flex items-center justify-center gap-2 py-2 text-xs text-muted-foreground hover:text-foreground font-semibold cursor-pointer transition-colors"
        >
          <Mail className="w-3.5 h-3.5" /><span>Use email &amp; password instead</span>
        </button>
          </>
        )}
        </>
        )}
      </AuthCard>
    </>
  );
}

export default function LoginPage() {
  return (
    <ThemeProvider>
      <LoginPageContent />
    </ThemeProvider>
  );
}
