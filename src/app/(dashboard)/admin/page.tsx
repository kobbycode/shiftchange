"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth-context";
import { db, rememberResetVersion } from "@/lib/firestore";
import { User, AuditLog, UserRole, Shift, seedUsers, seedStations, Announcement } from "@/lib/mock-db";
import { 
  ShieldCheck, Users, Activity, Settings as SettingsIcon, UserPlus, Key, 
  Save, X, Search, ChevronDown, Filter, Printer, Clock, AlertTriangle, Radio, Compass, ArrowRightLeft, Download, Database, CheckCircle, ChevronUp, KeyRound, Mail, Megaphone, Trash2
} from "lucide-react";
import toast from "react-hot-toast";
import { DutyPairBadge } from "@/components/duty-pair-badge";

type Tab = "users" | "logs" | "config";

const roleOptions: UserRole[] = ["Technician", "Supervisor", "Admin"];

export default function AdminPage() {
  const { user, loading, checkPermission } = useAuth();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("users");

  React.useEffect(() => {
    if (!loading && (!user || !checkPermission("Admin"))) {
      router.replace("/");
    }
  }, [user, loading, checkPermission, router]);

  if (loading || !user || !checkPermission("Admin")) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 text-left">
      <div>
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" /> System Administration &amp; Security Control
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Manage duty engineer accounts, role permissions, security PINs, system audit logs, and infrastructure health.</p>
      </div>

      <div className="flex items-center gap-1 border-b border-border overflow-x-auto whitespace-nowrap scrollbar-none pb-0.5">
        {[
          { id: "users" as Tab, label: "User & Access Management", icon: Users },
          { id: "logs" as Tab, label: "Security & Audit Logs", icon: Activity },
          { id: "config" as Tab, label: "Infrastructure & Storage Health", icon: SettingsIcon },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                tab === t.id
                  ? "border-primary text-foreground font-bold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "users" && <UserManagement />}
      {tab === "logs" && <SystemLogs />}
      {tab === "config" && <Configuration />}
    </div>
  );
}

function UserManagement() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [search, setSearch] = React.useState("");
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [editingRole, setEditingRole] = React.useState<string | null>(null);
  const [resettingPin, setResettingPin] = React.useState<string | null>(null);
  const [newPin, setNewPin] = React.useState("");
  const [emailAcctUser, setEmailAcctUser] = React.useState<string | null>(null);
  const [emailAcctEmail, setEmailAcctEmail] = React.useState("");
  const [emailAcctPassword, setEmailAcctPassword] = React.useState("");
  const [emailAcctBusy, setEmailAcctBusy] = React.useState(false);
  // Whether THIS device's Firebase session is linked to an email account —
  // PIN changes only reach the server when it is.
  const [emailLinked, setEmailLinked] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    db.users.list().then(setUsers);
  }, []);

  React.useEffect(() => {
    db.auth.isEmailLinked().then(setEmailLinked);
  }, []);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const qRaw = search.toLowerCase().trim();
    const searchBlob = `${u.name} ${u.email} ${u.role}`.toLowerCase();
    if (searchBlob.includes(qRaw)) return true;
    const qTokens = qRaw.split(/[\s&,/]+/).filter((t) => t.length > 1);
    return qTokens.length > 0 && qTokens.every((token) => searchBlob.includes(token));
  });

  const handleRoleChange = async (userId: string, role: UserRole) => {
    try {
      await db.users.update(userId, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
      toast.success("Role updated");
    } catch {
      toast.error("Failed to update role");
    }
    setEditingRole(null);
  };

  const handleResetPin = async (userId: string) => {
    if (!newPin || newPin.length < 4) {
      toast.error("PIN must be at least 4 characters");
      return;
    }
    try {
      const updated = await db.users.update(userId, { pin: newPin });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, pin: newPin } : u)));
      if ((updated as { pinSync?: string }).pinSync === "local") {
        toast("PIN saved on this device only — this admin session has no linked email account, so other devices keep the old PIN.", { duration: 6000 });
      } else {
        toast.success("User login PIN updated! User can now log in with the new PIN.");
      }
      setResettingPin(null);
      setNewPin("");
    } catch {
      toast.error("Failed to reset PIN");
    }
  };

  const handleResetDefaultPins = () => {
    const ok = window.confirm(
      "Restore ALL staff accounts to their default factory PINs? Anyone who personalized their PIN loses it. This affects this device's saved credentials."
    );
    if (!ok) return;
    try {
      localStorage.removeItem("shift_users");
      localStorage.removeItem("shift_original_pins");
      toast.success("Default PINs restored — reloading...");
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast.error("Failed to reset default PINs");
    }
  };

  const handleLinkEmail = async (userId: string) => {
    if (!emailAcctEmail.trim() || !emailAcctPassword) {
      toast.error("Enter an email and password");
      return;
    }
    setEmailAcctBusy(true);
    try {
      const result = await db.auth.linkEmail(userId, emailAcctEmail.trim(), emailAcctPassword);
      if (!result.ok) {
        toast.error(result.error || "Failed to create email account");
        return;
      }
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, email: emailAcctEmail.trim() } : u)));
      toast.success("Email account created — user can sign in with it on any device.");
      db.auth.isEmailLinked().then(setEmailLinked);
      setEmailAcctUser(null);
      setEmailAcctEmail("");
      setEmailAcctPassword("");
    } catch {
      toast.error("Failed to create email account");
    } finally {
      setEmailAcctBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search and Add User controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border/60 p-4 rounded-2xl shadow-xs">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-secondary/50 border border-border rounded-xl pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/95 transition-colors cursor-pointer shadow-xs shrink-0"
        >
          <UserPlus className="w-4 h-4" /> Add New Engineer Account
        </button>
        <button
          onClick={handleResetDefaultPins}
          title="Restore all staff accounts to their factory-default PINs"
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-secondary/50 border border-border text-xs font-semibold rounded-xl hover:bg-secondary transition-colors cursor-pointer shrink-0"
        >
          <KeyRound className="w-4 h-4" /> Reset Default PINs
        </button>
      </div>

      {showAddForm && <AddUserForm onDone={() => { setShowAddForm(false); db.users.list().then(setUsers); }} />}

      {emailLinked === false && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-[11px] leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            This session has no linked email account, so PIN changes are saved on this device only.{" "}
            <span className="font-semibold">Create an email account on your own row</span> (Email Account column) to sync PIN changes
            to the server.
          </span>
        </div>
      )}

      {/* MOBILE VIEW (User Cards) */}
      <div className="block md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-card border border-border/60 rounded-2xl">
            No matching users found.
          </div>
        ) : (
          filtered.map((member) => (
            <div key={member.id} className="bg-card border border-border/60 rounded-2xl p-4 space-y-3 shadow-xs">
              <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                <DutyPairBadge name={member.name} size="sm" />
              </div>
              <div className="space-y-2 text-xs bg-secondary/30 p-3 rounded-xl border border-border/30">
                <div className="font-semibold text-foreground text-[10px] uppercase tracking-wider">{member.email}</div>

                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Role</span>
                  {editingRole === member.id ? (
                    <div className="flex gap-1 items-center">
                      <select
                        defaultValue={member.role}
                        onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                        className="bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-foreground font-semibold"
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button onClick={() => setEditingRole(null)} className="p-1 text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingRole(member.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary border border-border/40 text-foreground font-bold text-[10px] uppercase cursor-pointer"
                    >
                      {member.role} <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    </button>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Security PIN</span>
                  {resettingPin === member.id ? (
                    <div className="flex gap-1 items-center">
                      <input
                        type="text"
                        value={newPin}
                        onChange={(e) => setNewPin(e.target.value)}
                        placeholder="New PIN"
                        className="w-20 bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
                        maxLength={6}
                      />
                      <button onClick={() => handleResetPin(member.id)} className="p-1 text-success">
                        <Save className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { setResettingPin(null); setNewPin(""); }} className="p-1 text-muted-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setResettingPin(member.id); setNewPin(member.pin); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border/40 text-foreground font-mono text-xs cursor-pointer font-semibold"
                    >
                      <Key className="w-3 h-3 text-muted-foreground" /> ••••
                    </button>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground font-bold uppercase">Email account</span>
                  {emailAcctUser === member.id ? (
                    <div className="flex flex-col gap-1 items-end">
                      <input
                        type="email"
                        value={emailAcctEmail}
                        onChange={(e) => setEmailAcctEmail(e.target.value)}
                        placeholder="user@station.example"
                        className="w-44 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                      />
                      <input
                        type="password"
                        value={emailAcctPassword}
                        onChange={(e) => setEmailAcctPassword(e.target.value)}
                        placeholder="Password (6+ chars)"
                        className="w-44 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                      />
                      <div className="flex gap-1 items-center">
                        <button
                          onClick={() => handleLinkEmail(member.id)}
                          disabled={emailAcctBusy}
                          className="p-1 text-success cursor-pointer disabled:opacity-50"
                        >
                          <Save className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setEmailAcctUser(null); setEmailAcctEmail(""); setEmailAcctPassword(""); }}
                          className="p-1 text-muted-foreground cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEmailAcctUser(member.id); setEmailAcctEmail(member.email || ""); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-secondary border border-border/40 text-foreground text-xs cursor-pointer font-semibold max-w-[180px] truncate"
                    >
                      <Mail className="w-3 h-3 text-muted-foreground shrink-0" />
                      {member.email || "Add email account"}
                    </button>
                  )}
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-border/30">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/15 px-2.5 py-0.5 rounded-full border border-success/30 uppercase">
                    Active Account
                  </span>
                  <button
                    onClick={async () => {
                      if (confirm(`Deactivate access for user "${member.name}"?`)) {
                        try {
                          await db.users.delete(member.id);
                          setUsers(prev => prev.filter(x => x.id !== member.id));
                          toast.success(`Access revoked for ${member.name}`);
                        } catch {
                          toast.error("Failed to revoke access");
                        }
                      }
                    }}
                    className="text-xs font-bold text-destructive hover:underline cursor-pointer"
                  >
                    Revoke Access
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* DESKTOP VIEW (User Table) */}
      <div className="hidden md:block border border-border/60 rounded-2xl bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-secondary/30 text-muted-foreground text-[10px] uppercase font-bold">
                <th className="py-3.5 px-4">Name</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Security PIN</th>
                <th className="py-3.5 px-4">Email Account</th>
                <th className="py-3.5 px-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground italic">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                filtered.map((member) => (
                  <tr key={member.id} className="hover:bg-secondary/15 transition-colors">
                    <td className="py-3.5 px-4">
                      <DutyPairBadge name={member.name} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 text-xs text-muted-foreground">
                      {member.email}
                    </td>
                    <td className="py-3.5 px-4">
                      {editingRole === member.id ? (
                        <div className="flex gap-1 items-center">
                          <select
                            defaultValue={member.role}
                            onChange={(e) => handleRoleChange(member.id, e.target.value as UserRole)}
                            className="bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground font-semibold"
                          >
                            {roleOptions.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                          <button onClick={() => setEditingRole(null)} className="p-1 text-muted-foreground hover:text-foreground cursor-pointer">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingRole(member.id)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-secondary border border-border/40 hover:border-border text-foreground font-semibold transition-colors cursor-pointer text-[10px]"
                        >
                          {member.role} <ChevronDown className="w-2.5 h-2.5 text-muted-foreground" />
                        </button>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {resettingPin === member.id ? (
                        <div className="flex gap-1 items-center">
                          <input
                            type="text"
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            placeholder="New PIN"
                            className="w-20 bg-secondary border border-border rounded px-2 py-1 text-xs font-mono text-foreground"
                            maxLength={6}
                          />
                          <button
                            onClick={() => handleResetPin(member.id)}
                            className="p-1 text-success hover:text-success/80 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setResettingPin(null); setNewPin(""); }}
                            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setResettingPin(member.id)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/50 hover:bg-secondary text-foreground font-mono transition-colors cursor-pointer font-medium text-[10px]"
                        >
                          <Key className="w-2.5 h-2.5 text-muted-foreground" /> ••••
                        </button>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      {emailAcctUser === member.id ? (
                        <div className="flex gap-1 items-center">
                          <input
                            type="email"
                            value={emailAcctEmail}
                            onChange={(e) => setEmailAcctEmail(e.target.value)}
                            placeholder="user@station.example"
                            className="w-40 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                          />
                          <input
                            type="password"
                            value={emailAcctPassword}
                            onChange={(e) => setEmailAcctPassword(e.target.value)}
                            placeholder="Password (6+)"
                            className="w-28 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
                          />
                          <button
                            onClick={() => handleLinkEmail(member.id)}
                            disabled={emailAcctBusy}
                            className="p-1 text-success hover:text-success/80 cursor-pointer disabled:opacity-50"
                          >
                            <Save className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => { setEmailAcctUser(null); setEmailAcctEmail(""); setEmailAcctPassword(""); }}
                            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEmailAcctUser(member.id); setEmailAcctEmail(member.email || ""); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-secondary/50 hover:bg-secondary text-foreground text-[10px] font-medium transition-colors cursor-pointer max-w-[180px] truncate"
                        >
                          <Mail className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                          {member.email || "Add email account"}
                        </button>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/15 px-2 py-0.5 rounded-full border border-success/30 uppercase">
                          Active
                        </span>
                        <button
                          onClick={async () => {
                            if (confirm(`Deactivate access for user "${member.name}"?`)) {
                              try {
                                await db.users.delete(member.id);
                                setUsers(prev => prev.filter(x => x.id !== member.id));
                                toast.success(`Access revoked for ${member.name}`);
                              } catch {
                                toast.error("Failed to revoke access");
                              }
                            }
                          }}
                          className="text-[10px] font-bold text-destructive hover:underline cursor-pointer"
                        >
                          Revoke
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AddUserForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<UserRole>("Technician");
  const [pin, setPin] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !pin) {
      toast.error("Please fill in all fields");
      return;
    }
    setSaving(true);
    try {
      const created = await db.users.create({ name, email, role, pin });
      if ((created as { pinSync?: string }).pinSync === "local") {
        toast("User created — but the PIN is saved on this device only (this admin session has no linked email account).", { duration: 6000 });
      } else {
        toast.success("User created successfully");
      }
      onDone();
    } catch {
      toast.error("Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 border border-border/40 rounded-xl bg-card space-y-3 text-xs">
      <h3 className="font-semibold text-foreground">Add New User</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <input
          type="text"
          placeholder="Full Name (e.g. Enoch)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs"
          required
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs"
        >
          {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <input
          type="text"
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="bg-secondary/50 border border-border/40 rounded-lg px-3 py-2 text-xs font-mono"
          maxLength={6}
          required
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/95 transition-colors disabled:opacity-50 cursor-pointer"
        >
          {saving ? "Creating..." : "Create User"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 bg-secondary/50 text-muted-foreground text-xs font-semibold rounded-lg hover:bg-secondary transition-colors cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SystemLogs() {
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [shifts, setShifts] = React.useState<Shift[]>([]);
  const [selectedShiftId, setSelectedShiftId] = React.useState<string>("all");
  const [selectedCategory, setSelectedCategory] = React.useState<string>("All");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showShiftDropdown, setShowShiftDropdown] = React.useState(false);
  const shiftDropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (shiftDropdownRef.current && !shiftDropdownRef.current.contains(e.target as Node)) {
        setShowShiftDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    Promise.all([db.auditLogs.list(), db.users.list(), db.shifts.list()]).then(([l, u, s]) => {
      setLogs(l);
      setUsers(u);
      setShifts(s);
    });
  }, []);

  const handlePrintAudit = () => {
    window.print();
  };

  const handleExportCSV = () => {
    const headers = ["Timestamp", "User", "Action", "Target", "Details"];
    const rows = filteredLogs.map((log) => {
      const u = users.find((x) => x.id === log.user_id);
      return [
        new Date(log.created_at).toISOString(),
        `"${u?.name || "System"}"`,
        `"${log.action}"`,
        `"${log.target_table}"`,
        `"${(log.details || "").replace(/"/g, '""')}"`,
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `shift_audit_logs_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Audit logs exported to CSV spreadsheet!");
  };

  const categories = [
    { id: "All", label: "All Shift Actions", icon: Activity },
    { id: "STATION_STATUS_CHANGE", label: "Station Status", icon: Radio },
    { id: "CREATE_FAULT", label: "Fault Logs", icon: AlertTriangle },
    { id: "START_SHIFT", label: "Attendance & Shifts", icon: Clock },
    { id: "HANDOVER", label: "Handovers", icon: ArrowRightLeft },
    { id: "OB", label: "Outside Broadcast", icon: Compass },
  ];

  const filteredLogs = logs.filter((log) => {
    // Shift filter
    if (selectedShiftId !== "all") {
      const matchTarget = log.target_id === selectedShiftId;
      const matchDetails = log.details && log.details.includes(selectedShiftId);
      if (!matchTarget && !matchDetails) return false;
    }

    // Category filter
    if (selectedCategory !== "All") {
      if (selectedCategory === "STATION_STATUS_CHANGE" && !log.action.includes("STATION")) return false;
      if (selectedCategory === "CREATE_FAULT" && !log.action.includes("FAULT")) return false;
      if (selectedCategory === "START_SHIFT" && !log.action.includes("SHIFT") && !log.action.includes("ATTENDANCE")) return false;
      if (selectedCategory === "HANDOVER" && !log.action.includes("HANDOVER")) return false;
      if (selectedCategory === "OB" && !log.action.includes("OB")) return false;
    }

    // Search query - multi-field search
    if (searchQuery.trim()) {
      const qRaw = searchQuery.toLowerCase().trim();
      const u = users.find((x) => x.id === log.user_id);
      
      const searchBlob = [
        u?.name || "",
        u?.email || "",
        u?.role || "",
        log.action || "",
        log.target_table || "",
        log.details || "",
        log.user_id || "",
      ].join(" ").toLowerCase();

      if (searchBlob.includes(qRaw)) return true;

      const qTokens = qRaw.split(/\s+/).filter((t) => t.length > 1);
      if (qTokens.length > 0) {
        if (qTokens.every((token) => searchBlob.includes(token))) return true;
      }

      const matchingUserIds = new Set(
        users
          .filter((userItem) => {
            const b = `${userItem.name} ${userItem.email} ${userItem.role}`.toLowerCase();
            if (b.includes(qRaw)) return true;
            return qTokens.length > 0 && qTokens.every((token) => b.includes(token));
          })
          .map((userItem) => userItem.id)
      );

      if (log.user_id && matchingUserIds.has(log.user_id)) return true;

      return false;
    }

    return true;
  });

  const getActionBadgeColor = (action: string) => {
    if (action.includes("FAULT")) return "bg-destructive/15 text-destructive border-destructive/25";
    if (action.includes("STATION")) return "bg-warning/15 text-warning border-warning/25";
    if (action.includes("SHIFT") || action.includes("ATTENDANCE")) return "bg-primary/15 text-primary border-primary/25";
    if (action.includes("HANDOVER")) return "bg-purple-500/15 text-purple-400 border-purple-500/25";
    return "bg-secondary text-foreground border-border/40";
  };

  return (
    <div className="space-y-4">
      {/* Live Shift Action Control Header & Actions */}
      <div className="bg-card border border-border/60 p-4 sm:p-5 rounded-2xl space-y-4 shadow-xs">
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary shrink-0" /> Live Shift Action Timeline &amp; Activity Feed
          </h3>
          <p className="text-xs text-muted-foreground">Select individual shift sessions below to audit engineer actions, status changes, and handover events.</p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 border-t border-border/40">
          {/* Shift Session Selector */}
          <div className="w-full sm:max-w-md relative" ref={shiftDropdownRef}>
            <button
              onClick={() => setShowShiftDropdown(!showShiftDropdown)}
              className="w-full bg-secondary border border-border rounded-xl px-3 py-2 text-xs font-semibold text-foreground flex items-center gap-2 cursor-pointer hover:bg-secondary/80 transition-colors truncate"
            >
              <span className="flex-1 truncate text-left">
                {selectedShiftId === "all"
                  ? "All Recorded Shift Sessions"
                  : (() => {
                      const s = shifts.find(sh => sh.id === selectedShiftId);
                      if (!s) return "All Recorded Shift Sessions";
                      const staff = users.find((u) => u.id === s.incoming_staff_id);
                      const d = new Date(s.start_time);
                      const label = s.shift_type === "Morning" ? "AM" : "PM";
                      return `${label} ${d.getMonth() + 1}/${d.getDate()} ${staff?.name || "Unknown"}`;
                    })()
                }
              </span>
              {showShiftDropdown ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
            </button>

            {showShiftDropdown && (
              <>
                {/* Mobile overlay backdrop */}
                <div className="fixed inset-0 z-40 bg-black/40 sm:hidden" onClick={() => setShowShiftDropdown(false)} />
                {/* Dropdown panel */}
                <div className="sm:absolute sm:z-50 sm:top-full sm:left-0 sm:right-0 sm:mt-1 sm:bg-card sm:border sm:border-border sm:rounded-xl sm:shadow-xl sm:max-h-60 sm:overflow-y-auto fixed z-50 bottom-0 left-0 right-0 bg-card border-t border-border rounded-t-2xl shadow-2xl max-h-[50vh] overflow-y-auto">
                  <div className="sticky top-0 bg-card border-b border-border/40 px-4 py-3 flex items-center justify-between sm:hidden">
                    <span className="text-xs font-bold text-foreground">Select Shift Session</span>
                    <button onClick={() => setShowShiftDropdown(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="p-1 sm:p-0">
                    <button
                      onClick={() => { setSelectedShiftId("all"); setShowShiftDropdown(false); }}
                      className={`w-full text-left px-4 py-3 sm:px-3 sm:py-2.5 text-xs font-semibold cursor-pointer transition-colors hover:bg-secondary/50 truncate ${
                        selectedShiftId === "all" ? "bg-primary/10 text-primary" : "text-foreground"
                      }`}
                    >
                      All Recorded Shift Sessions
                    </button>
                    {shifts.map((s) => {
                      const staff = users.find((u) => u.id === s.incoming_staff_id);
                      const d = new Date(s.start_time);
                      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
                      const shiftLabel = s.shift_type === "Morning" ? "AM" : "PM";
                      const isSelected = s.id === selectedShiftId;
                      return (
                        <button
                          key={s.id}
                          onClick={() => { setSelectedShiftId(s.id); setShowShiftDropdown(false); }}
                          className={`w-full text-left px-4 py-3 sm:px-3 sm:py-2.5 text-xs font-semibold cursor-pointer transition-colors hover:bg-secondary/50 truncate ${
                            isSelected ? "bg-primary/10 text-primary" : "text-foreground"
                          }`}
                        >
                          {shiftLabel} {dateStr} {staff?.name || "Unknown"}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto shrink-0">
            <button
              onClick={handlePrintAudit}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-secondary border border-border hover:bg-secondary/80 text-foreground font-semibold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" /> Print Audit
            </button>

            <button
              onClick={handleExportCSV}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
        </div>
      </div>

      {/* Category Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border border-border/60 p-3 rounded-2xl bg-card shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap scrollbar-none w-full sm:w-auto py-0.5">
          {categories.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                  selectedCategory === c.id
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "bg-secondary/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {c.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter actions or duty engineer..."
            className="w-full bg-secondary/50 border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      {/* MOBILE VIEW (Audit Action Log Cards) */}
      <div className="block md:hidden space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-card border border-border/60 rounded-2xl">
            No matching shift actions found for the selected criteria.
          </div>
        ) : (
          filteredLogs.map((log) => {
            const u = users.find((x) => x.id === log.user_id);
            return (
              <div key={log.id} className="bg-card border border-border/60 rounded-2xl p-4 space-y-3 shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {new Date(log.created_at).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${getActionBadgeColor(log.action)}`}>
                    {log.action}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <DutyPairBadge name={u?.name || "System Automated"} size="sm" />
                </div>

                <div className="p-3 bg-secondary/30 rounded-xl border border-border/30 text-xs text-foreground leading-relaxed">
                  {log.details || `Performed ${log.action} on ${log.target_table}`}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP VIEW (Audit Table) */}
      <div className="hidden md:block border border-border/60 rounded-2xl bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-secondary/30 text-muted-foreground text-[10px] uppercase font-bold">
                <th className="py-3 px-4">Exact Timestamp</th>
                <th className="py-3 px-4">Duty Pair / Staff</th>
                <th className="py-3 px-4">Action Type</th>
                <th className="py-3 px-4">Action Details &amp; Operational Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground italic">
                    No matching shift actions found for the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const u = users.find((x) => x.id === log.user_id);
                  return (
                    <tr key={log.id} className="hover:bg-secondary/10 transition-colors">
                      <td className="py-3 px-4 font-mono text-muted-foreground whitespace-nowrap text-[11px]">
                        {new Date(log.created_at).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <DutyPairBadge name={u?.name || "System Automated"} size="sm" />
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${getActionBadgeColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-foreground leading-relaxed">
                        {log.details || `Performed ${log.action} on ${log.target_table}`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="p-3 border-t border-border/40 bg-secondary/10 text-[10px] text-muted-foreground flex justify-between items-center">
          <span>Supervisor Shift Action Audit Feed</span>
          <span>Showing {filteredLogs.length} logged action{filteredLogs.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}

function Configuration() {
  const [dbStatus, setDbStatus] = React.useState("Checking...");
  const [userCount, setUserCount] = React.useState(0);
  const [shiftCount, setShiftCount] = React.useState(0);
  const [showConfirmModal, setShowConfirmModal] = React.useState<"factory-reset" | "clear-cache" | null>(null);
  const [announcements, setAnnouncements] = React.useState<Announcement[]>([]);
  const [announcementText, setAnnouncementText] = React.useState("");
  const [posting, setPosting] = React.useState(false);

  React.useEffect(() => {
    Promise.all([db.users.list(), db.shifts.list(), db.announcements.list()]).then(([u, s, a]) => {
      setUserCount(u.filter(x => x.role === "Technician").length);
      setShiftCount(s.length);
      setAnnouncements(a);
      setDbStatus("Connected (Firestore / LocalStorage v18)");
    });
  }, []);

  const handlePostAnnouncement = async () => {
    if (!announcementText.trim()) { toast.error("Write the announcement first"); return; }
    setPosting(true);
    try {
      const author = db.auth.getUser();
      const created = await db.announcements.create(announcementText, author?.id, author?.name);
      setAnnouncements((prev) => [created, ...prev]);
      setAnnouncementText("");
      toast.success("Announcement posted — visible on every dashboard.");
    } catch {
      toast.error("Failed to post announcement");
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm("Delete this announcement?")) return;
    try {
      await db.announcements.remove(id, db.auth.getUser()?.id);
      setAnnouncements((prev) => prev.filter(a => a.id !== id));
      toast.success("Announcement removed");
    } catch {
      toast.error("Failed to remove announcement");
    }
  };

  const clearAnnouncementDismissals = () => {
    if (typeof window === "undefined") return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith("shift_announcement_dismissed_"));
    keys.forEach(k => localStorage.removeItem(k));
  };

  const handleClearCache = () => {
    setShowConfirmModal(null);
    ["shift_faults", "shift_fault_updates", "shift_tasks", "shift_obs",
     "shift_shifts", "shift_attendance", "shift_handovers",
     "shift_notifications", "shift_jobs", "shift_audit_logs",
     "shift_broadcast_status", "shift_reports", "shift_attachments",
     "shift_equipment", "shift_session",
     "shift_stations", "shift_announcements",
     "start_shift_draft", "shift_maintenance_schedules_v2"].forEach(k => localStorage.removeItem(k));
    clearAnnouncementDismissals();
    window.location.href = "/admin";
  };

  const handleFactoryReset = async () => {
    setShowConfirmModal(null);

    // Local wipe runs FIRST and unconditionally — the cloud call must never
    // block the reset (a hanging /api/factory-reset fetch used to leave stale
    // local state behind, e.g. old station statuses still showing "Fault").
    const clearKeys = [
      "shift_faults", "shift_fault_updates", "shift_tasks", "shift_obs",
      "shift_shifts", "shift_attendance", "shift_handovers",
      "shift_notifications", "shift_jobs", "shift_audit_logs",
      "shift_broadcast_status", "shift_reports", "shift_attachments",
      "shift_equipment", "shift_session",
      "shift_stations", "shift_announcements",
      "start_shift_draft", "shift_maintenance_schedules_v2"
    ];
    clearKeys.forEach(k => localStorage.removeItem(k));
    clearAnnouncementDismissals();
    localStorage.removeItem("shift_firestore_degraded");

    // Seed data comes from the single source of truth in mock-db — the app's
    // real seeds — so a factory reset can never resurrect stale users/stations
    localStorage.setItem("shift_users", JSON.stringify(seedUsers));
    localStorage.setItem("shift_stations", JSON.stringify(seedStations));
    localStorage.setItem("shift_clean_v20", "true");
    localStorage.removeItem("shift_original_pins");

    // Cloud wipe runs in the background with a bounded timeout so a slow or
    // failing call can never leave the local state un-reset.
    try {
      const firestoreConfigured = !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      if (firestoreConfigured) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 15000);
          const resp = await fetch("/api/factory-reset", { method: "POST", signal: ctrl.signal });
          clearTimeout(timer);
          const result = await resp.json();
          if (result.success && result.reset_version) {
            // Mark this device as synced with the new cloud version so it
            // doesn't purge its (already reset) local state again on reload
            rememberResetVersion(String(result.reset_version));
          }
          if (!result.success) console.warn("Firestore reset:", result.message);
        } catch (fetchErr) {
          console.warn("Firestore factory-reset call failed (function may not be deployed):", fetchErr);
        }
      }

      toast.success("Factory reset complete!");
      window.location.href = "/admin";
    } catch (err: any) {
      toast.error(err.message || "Factory reset failed");
    }
  };

  return (
    <div className="space-y-6">
      {/* System Health & Storage Engine */}
      <div className="border border-border/60 rounded-2xl bg-card p-6 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-foreground">Database Engine &amp; Storage Health</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Live status of NOC database connections and storage layers.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success/15 text-success border border-success/30 font-bold text-xs">
              <CheckCircle className="w-3.5 h-3.5" /> {dbStatus}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-4 bg-secondary/30 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Registered Duty Engineers</span>
            <span className="text-lg font-bold text-foreground">{userCount} Duty Engineers</span>
          </div>
          <div className="p-4 bg-secondary/30 border border-border/40 rounded-xl">
            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Total Shift Sessions Logged</span>
            <span className="text-lg font-bold text-foreground">{shiftCount} Recorded Shifts</span>
          </div>
          <div className="p-4 bg-secondary/30 border border-border/40 rounded-xl sm:col-span-1">
            <span className="text-[10px] text-muted-foreground uppercase font-bold block">Cache Maintenance</span>
            <button
              onClick={() => setShowConfirmModal("clear-cache")}
              className="mt-1 px-3 py-1 bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 font-semibold rounded-lg transition-colors cursor-pointer text-xs"
            >
              Reset System Cache
            </button>
          </div>
        </div>
      </div>

      {/* Station Announcements */}
      <div className="border border-border/60 rounded-2xl bg-card p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-3 border-b border-border pb-4">
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-500">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground">Station Announcements</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Post a notice that appears on every dashboard until dismissed.</p>
          </div>
        </div>

        <div className="space-y-2">
          <textarea
            value={announcementText}
            onChange={(e) => setAnnouncementText(e.target.value)}
            placeholder="e.g. All hands on deck — transmitter site inspection at 14:00."
            rows={3}
            className="w-full bg-secondary/50 border border-border rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40 resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={handlePostAnnouncement}
              disabled={posting || !announcementText.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl hover:bg-primary/95 transition-colors cursor-pointer disabled:opacity-50"
            >
              {posting ? (
                <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
              ) : (
                <><Megaphone className="w-3.5 h-3.5" /><span>Post Announcement</span></>
              )}
            </button>
          </div>
        </div>

        {announcements.length > 0 && (
          <div className="space-y-2 border-t border-border/40 pt-4">
            {announcements.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-start gap-2 p-3 bg-secondary/30 border border-border/30 rounded-xl">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground whitespace-pre-wrap leading-relaxed">{a.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {a.author_name ? `${a.author_name} · ` : ""}{new Date(a.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteAnnouncement(a.id)}
                  title="Delete announcement"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-colors shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Factory Reset Section */}
      <div className="border border-destructive/30 rounded-2xl bg-destructive/5 p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-3 border-b border-destructive/20 pb-4">
          <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-foreground">Factory Reset — Fresh Deployment</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Wipe all recorded activity so the app starts as a clean installation with zero shift history.</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Use this before releasing the website to the public. It clears every shift, fault log, handover, outside broadcast,
          task, notification, job record, and audit trail. The app will reload with only the default seed users
          (admin, supervisor, and the six duty engineers) — no shifts recorded, no history, fresh state.
        </p>
        <button
          onClick={() => setShowConfirmModal("factory-reset")}
          className="px-5 py-2.5 bg-destructive text-destructive-foreground text-xs font-bold rounded-xl hover:bg-destructive/90 transition-colors cursor-pointer shadow-xs"
        >
          Full Factory Reset — Wipe Everything
        </button>
      </div>

      {/* Custom Confirm Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowConfirmModal(null)} />
          <div className="relative bg-card border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-foreground">
                  {showConfirmModal === "factory-reset" ? "Factory Reset" : "Clear Cache"}
                </h3>
                <p className="text-[11px] text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-xs text-foreground leading-relaxed">
              {showConfirmModal === "factory-reset"
                ? "This will permanently delete ALL recorded shifts, faults, handovers, tasks, OBs, notifications, job records, and audit logs. The app will reset to a fresh factory state with only the default user accounts. Are you sure?"
                : "This will clear the local cache and reset the app state to default values. Are you sure?"}
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowConfirmModal(null)}
                className="px-4 py-2 bg-secondary border border-border text-foreground text-xs font-semibold rounded-xl hover:bg-secondary/80 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(null);
                  if (showConfirmModal === "factory-reset") handleFactoryReset();
                  else handleClearCache();
                }}
                className="px-4 py-2 bg-destructive text-destructive-foreground text-xs font-bold rounded-xl hover:bg-destructive/90 transition-colors cursor-pointer"
              >
                {showConfirmModal === "factory-reset" ? "Yes, Reset Everything" : "Yes, Clear Cache"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Hierarchy */}
      <div className="border border-border/60 rounded-2xl bg-card p-6 space-y-4 shadow-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Role Hierarchy &amp; Access Controls</h4>
        <div className="space-y-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2 p-2.5 bg-secondary/20 rounded-xl border border-border/30">
            <span className="w-2.5 h-2.5 rounded-full bg-primary shrink-0" />
            <span className="font-bold text-foreground">Admin</span>
            <span>— Full system access, user creation, PIN resets, and access revocation.</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-secondary/20 rounded-xl border border-border/30">
            <span className="w-2.5 h-2.5 rounded-full bg-info shrink-0" />
            <span className="font-bold text-foreground">Supervisor</span>
            <span>— Shift action audit feed, report exports, real-time action monitoring, analytics &amp; oversight.</span>
          </div>
          <div className="flex items-center gap-2 p-2.5 bg-secondary/20 rounded-xl border border-border/30">
            <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground shrink-0" />
            <span className="font-bold text-foreground">Technician</span>
            <span>— Standard shift log entry, attendance checking, job recording.</span>
          </div>
        </div>
      </div>

      {/* System Settings */}
      <Link
        href="/settings"
        className="flex items-center gap-3 p-5 border border-border/60 rounded-2xl bg-card shadow-xs hover:bg-secondary/50 transition-colors cursor-pointer"
      >
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary">
          <SettingsIcon className="w-6 h-6" />
        </div>
        <div>
          <h4 className="font-bold text-sm text-foreground">System Settings &amp; Maintenance</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Station configuration, SMTP, maintenance schedules, and system preferences.</p>
        </div>
      </Link>
    </div>
  );
}
