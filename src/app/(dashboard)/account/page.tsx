"use client";

import * as React from "react";
import { useAuth } from "@/components/auth-context";
import { db } from "@/lib/firestore";
import { KeyRound, Save, ShieldAlert, CheckCircle, Lock, Mail } from "lucide-react";

import toast, { Toaster } from "react-hot-toast";

export default function AccountPage() {
  const { user } = useAuth();
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const [curPassword, setCurPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState("");
  const [passwordDone, setPasswordDone] = React.useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (pin && pin.length !== 4) {
      setError("PIN must be exactly 4 digits.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const newPin = pin || user.pin;
      const updated = await db.users.changeCredentials(user.id, user.email, newPin);
      if ((updated as { pinSync?: string }).pinSync === "local") {
        toast("Saved on this device only — link an email account (Admin panel) to sync your PIN across devices.", { duration: 6000 });
      } else {
        toast.success("Credentials updated successfully!");
      }
      setPin("");
      setConfirmPin("");
    } catch (err: any) {
      setError(err.message || "Failed to update credentials.");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordDone(false);
    if (!curPassword) { setPasswordError("Enter your current password."); return; }
    if (!newPassword || newPassword.length < 6) { setPasswordError("New password must be at least 6 characters."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("New passwords do not match."); return; }

    setSavingPassword(true);
    try {
      const result = await db.auth.changeEmailPassword(curPassword, newPassword);
      if (!result.ok) {
        setPasswordError(result.error || "Failed to change password.");
        return;
      }
      setPasswordDone(true);
      setCurPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Email password updated — use it next time you sign in.");
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Account Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Update your login security PIN.</p>
      </div>

      <div className="glass border border-border/60 rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold ring-2 ring-card">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">{user.name}</p>
            <p className="text-[10px] text-muted-foreground capitalize">{user.role}</p>
          </div>
        </div>

        {user.is_default === false && (
          <div className="flex items-center gap-2 p-3 text-xs bg-info/10 text-info border border-info/20 rounded-lg">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>Your PIN has been updated. The default login no longer appears on the login page.</span>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">New Security PIN (4 digits)</label>
            <div className="relative flex items-center">
              <KeyRound className="absolute left-3 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground tracking-widest focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground transition-colors"
                placeholder="Leave blank to keep current"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Confirm New PIN</label>
            <div className="relative flex items-center">
              <KeyRound className="absolute left-3 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                maxLength={4}
                className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground tracking-widest focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground transition-colors"
                placeholder="Re-enter new PIN"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm rounded-lg cursor-pointer transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </form>
      </div>

      <div className="glass border border-border/60 rounded-2xl p-5 md:p-6 space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold">
            <Lock className="w-3.5 h-3.5" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Email account password</p>
            <p className="text-[10px] text-muted-foreground">{user.email || "No email account linked"}</p>
          </div>
        </div>

        {user.email ? (
          <form onSubmit={handlePasswordSave} className="space-y-4">
            {passwordDone && (
              <div className="flex items-center gap-2 p-3 text-xs bg-success/10 text-success border border-success/20 rounded-lg">
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>Password updated successfully.</span>
              </div>
            )}
            {passwordError && (
              <div className="flex items-center gap-2 p-3 text-xs bg-destructive/10 text-destructive border border-destructive/20 rounded-lg">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Current password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={curPassword}
                  onChange={(e) => { setCurPassword(e.target.value); setPasswordError(""); }}
                  autoComplete="current-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">New password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setPasswordError(""); }}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground transition-colors"
                  placeholder="At least 6 characters"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Confirm new password</label>
              <div className="relative flex items-center">
                <Lock className="absolute left-3 w-4 h-4 text-muted-foreground" />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(""); }}
                  autoComplete="new-password"
                  className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary placeholder:text-muted-foreground transition-colors"
                  placeholder="Re-enter new password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingPassword}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-sm rounded-lg cursor-pointer transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {savingPassword ? (
                <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Change Password</span>
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-2 p-3 text-xs bg-secondary/40 text-muted-foreground border border-border rounded-lg">
            <Mail className="w-4 h-4 shrink-0" />
            <span>No email account is linked to this user yet. Ask an admin to add one in Admin → User &amp; Access Management, then you can sign in from any device.</span>
          </div>
        )}
      </div>

      <Toaster position="top-right" />
    </div>
  );
}
