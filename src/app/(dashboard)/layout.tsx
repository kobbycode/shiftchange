"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Toaster } from "react-hot-toast";
import { Sidebar, navItems, usePendingTaskCount } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { NotificationCenter } from "@/components/notification-center";
import { FaultAssignmentBanner } from "@/components/fault-assignment-banner";
import { AssignedDutiesModal } from "@/components/assigned-duties-modal";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/query-provider";
import { LogoutDialog } from "@/components/logout-dialog";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { ClockInPartnerModal } from "@/components/clock-in-partner-modal";
import type { UserRole, Shift, Attendance, User as DBUser } from "@/lib/mock-db";
import { MockDB } from "@/lib/mock-db";
import { db, switchToUser, switchBackToOrigin, getSwitchOriginUser, isFirestoreConfigured, firestoreDegraded } from "@/lib/firestore";
import { getSystemSettings } from "@/lib/system-settings";
import { useBrowsingMode } from "@/lib/browsing-mode";
import { 
  LayoutDashboard, Radio, AlertTriangle, ClipboardList, 
  Plus, Search, Calendar, ChevronDown, Menu, X, ArrowRightLeft, Users, Camera,
  Play, FileBarChart, BarChart3, Settings as SettingsIcon, PenTool, LogOut, UserPlus, UserCheck,
  UserRoundCog, ArrowLeftRight, Eye
} from "lucide-react";

function DashboardLayoutContent({ children }: { children: React.ReactNode }) {
  const { user, logout, loading, checkPermission, hasRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [time, setTime] = React.useState("");
  const [showAddMenu, setShowAddMenu] = React.useState(false);
  const [showLogoutPrompt, setShowLogoutPrompt] = React.useState(false);
  const [showClockInModal, setShowClockInModal] = React.useState(false);
  const [showUserSwitcher, setShowUserSwitcher] = React.useState(false);
  const [originUser] = React.useState<DBUser | null>(() => getSwitchOriginUser());
  // "Just Browsing" login (technicians): view-only session — no attendance
  // writes, no record creation, no partner clock-ins. Everything is visible,
  // nothing is editable.
  const browsing = useBrowsingMode() && user?.role === "Technician";
  // PIN-verified dashboard switch: viewing a partner's dashboard requires
  // that partner's PIN — the dropdown alone must never log them in
  const [pinTarget, setPinTarget] = React.useState<DBUser | null>(null);
  const [switchPin, setSwitchPin] = React.useState("");
  const [switchError, setSwitchError] = React.useState("");
  const [switching, setSwitching] = React.useState(false);
  const pendingTasks = usePendingTaskCount();

  // ── Session idle timeout (System Settings) ──────────────────
  // Auto sign-out after N minutes without activity so shared workstations
  // never sit logged in. Disabled when the timeout is 0.
  React.useEffect(() => {
    if (!user) return;
    const timeoutMin = (() => { try { return getSystemSettings().sessionTimeout; } catch { return 60; } })();
    if (!timeoutMin || timeoutMin <= 0) return;
    let lastActivity = Date.now();
    const bump = () => { lastActivity = Date.now(); };
    const events: (keyof WindowEventMap)[] = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(ev => window.addEventListener(ev, bump, { passive: true }));
    const interval = setInterval(() => {
      if (Date.now() - lastActivity > timeoutMin * 60 * 1000) {
        clearInterval(interval);
        try { db.auth.signOut(); } catch {}
        window.location.href = "/login";
      }
    }, 30000);
    return () => {
      events.forEach(ev => window.removeEventListener(ev, bump));
      clearInterval(interval);
    };
  }, [user]);

const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [shiftAttendance, setShiftAttendance] = React.useState<Attendance[]>([]);
  const [allAttendance, setAllAttendance] = React.useState<Attendance[]>([]);
  const [dbUsers, setDbUsers] = React.useState<DBUser[]>([]);

  const loadHeaderShiftData = React.useCallback(async () => {
    // Browsing technicians see no duty engineer — skip loading shift/attendance
    if (browsing) {
      setActiveShift(null);
      setShiftAttendance([]);
      setAllAttendance([]);
      const allUsers = await db.users.list();
      setDbUsers(allUsers);
      return;
    }
    try {
      const active = await db.shifts.getActive();
      const allUsers = await db.users.list();
      const att = active ? await db.attendance.getForShift(active.id) : [];
      const allAtt = await db.attendance.list();
      // Only update state when data actually changed — polling every few
      // seconds with fresh references re-renders the header (and re-rasterizes
      // the glass/backdrop-blur styles), which is visible as flickering.
      setActiveShift((prev) => (JSON.stringify(prev) === JSON.stringify(active) ? prev : active));
      setDbUsers((prev) => (JSON.stringify(prev) === JSON.stringify(allUsers) ? prev : allUsers));
      setShiftAttendance((prev) => (JSON.stringify(prev) === JSON.stringify(att) ? prev : att));
      setAllAttendance((prev) => (JSON.stringify(prev) === JSON.stringify(allAtt) ? prev : allAtt));
    } catch {}
  }, [browsing]);

  React.useEffect(() => {
    loadHeaderShiftData();
    const handleShiftDataChanged = () => loadHeaderShiftData();
    window.addEventListener("shift_data_changed", handleShiftDataChanged);
    window.addEventListener("storage", handleShiftDataChanged);
    const interval = setInterval(loadHeaderShiftData, 5000);
    return () => {
      window.removeEventListener("shift_data_changed", handleShiftDataChanged);
      window.removeEventListener("storage", handleShiftDataChanged);
      clearInterval(interval);
    };
  }, [loadHeaderShiftData]);

  // Compute combined duty pair name string (e.g. "Alex & Willie") — Technicians only.
  // Supervisors/Admins see their own name, not the engineers on duty.
  // Browsing technicians see no duty pair (not on duty).
  const checkedInUserIds = React.useMemo(() => shiftAttendance.filter(a => !a.is_absent).map(a => a.user_id), [shiftAttendance]);
  const dutyNames = React.useMemo(() => {
    if (!user) return "";
    if (browsing) return "";
    if (user.role !== "Technician") return user.name;
    const technicianNames = checkedInUserIds
      .map(id => dbUsers.find(u => u.id === id && u.role === "Technician")?.name)
      .filter(Boolean) as string[];
    if (technicianNames.length === 0) {
      return user.name;
    }
    return technicianNames.slice(0, 2).join(" & ");
  }, [checkedInUserIds, dbUsers, user, browsing]);

  // Duty partners — other technicians checked into the CURRENT active shift
  // (the incoming crew after a handover). The old outgoing crew's devices are
  // signed out by the end-of-shift detection instead of lingering here.
  // Browsing technicians have no duty partners.
  const partnerUsers = React.useMemo(() => {
    if (!user || user.role !== "Technician" || browsing) return [];
    return dbUsers.filter(u =>
      u.role === "Technician" &&
      u.id !== user.id &&
      checkedInUserIds.includes(u.id)
    );
  }, [dbUsers, checkedInUserIds, user, browsing]);

  // ── End-of-shift detection ───────────────────────────────────
  // A technician whose shift was completed by a handover performed on ANOTHER
  // device must not keep a stale dashboard session: once an active shift exists
  // that no longer includes them, their device is signed out and prompted to
  // sign in as the incoming crew.
  const shiftEnded = React.useMemo(() => {
    if (!user || user.role !== "Technician") return false;
    if (originUser) return false; // viewing a partner's dashboard — their session owns this device
    if (!activeShift) return false; // nothing to detect against a missing active shift
    const mine = allAttendance
      .filter(a => a.user_id === user.id)
      .sort((a, b) => new Date(b.time_reported).getTime() - new Date(a.time_reported).getTime())[0];
    if (!mine) return false; // never clocked in — nothing to end
    return mine.shift_id !== activeShift.id;
  }, [allAttendance, activeShift, user, originUser]);

  const handleShiftEndedSignOut = async () => {
    try { await db.auth.signOut(); } catch {}
    window.location.href = "/login";
  };

  // ── PIN-verified partner dashboard switch ───────────────────
  const handleSwitchVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTarget || switching) return;
    if (!switchPin) { setSwitchError("Enter the partner's PIN to continue."); return; }
    setSwitching(true);
    try {
      const users = await db.users.list();
      const partner = users.find(x => x.id === pinTarget.id);
      const localMatch = !!partner && partner.pin === switchPin;

      // Server-side verification when the cloud is reachable (rate-limited);
      // the local mirror is the fallback for offline devices.
      let verified = localMatch;
      if (isFirestoreConfigured && !firestoreDegraded) {
        const res = await db.auth.verifyPin(pinTarget.id, switchPin);
        if (res.locked) {
          setSwitchError(res.error || "Too many failed attempts — try again later.");
          setSwitching(false);
          return;
        }
        if (res.ok) verified = true;
      }

      if (verified) {
        const target = pinTarget;
        setPinTarget(null);
        setSwitchPin("");
        try {
          MockDB.logAudit(user?.id, "SWITCH_DASHBOARD", "users", target.id, `${user?.name} switched to ${target.name}'s dashboard`);
        } catch {}
        switchToUser(target);
      } else {
        setSwitchError("Incorrect PIN — access denied. Switching is not allowed.");
        try {
          MockDB.logAudit(user?.id, "SWITCH_DENIED", "users", pinTarget.id, `Switch to ${pinTarget.name} denied (wrong PIN)`);
        } catch {}
      }
    } catch {
      setSwitchError("Verification failed — try again.");
    } finally {
      setSwitching(false);
    }
  };

  const handleSelectPartner = (partner: DBUser) => {
    setShowUserSwitcher(false);
    setPinTarget(partner);
    setSwitchPin("");
    setSwitchError("");
  };

  // Auto-updating clock for dashboard
  React.useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) +
        " | " +
        now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-muted-foreground font-medium animate-pulse">Establishing secure connection...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
    {!loading && shiftEnded ? (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-2xl bg-warning/15 border border-warning/30 flex items-center justify-center mx-auto mb-5">
            <LogOut className="w-7 h-7 text-warning" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-2">Your shift has ended</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-6">
            The shift handover was completed on another device, so this session is no longer
            on the active shift. Sign in again to continue working on the incoming crew.
          </p>
          <button
            onClick={handleShiftEndedSignOut}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/95 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Sign in
          </button>
        </div>
      </div>
    ) : (
    <div className="flex min-h-screen bg-background text-foreground transition-colors duration-200">
      {/* Sidebar - Desktop */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
        {/* Header */}
        <header className="glass-nav h-14 px-4 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Title / Current Page indicator */}
            <div className="hidden sm:block">
              <span className="text-xs text-muted-foreground font-medium capitalize">
                NOC Operations &gt;{" "}
              </span>
              <span className="text-xs font-semibold text-foreground capitalize">
                {pathname === "/" ? "dashboard wallboard" : pathname.replace("/", "").replace("-", " ")}
              </span>
            </div>
            
            {/* Short Title on Mobile */}
            <h1 className="sm:hidden font-semibold text-sm">
              {pathname === "/" ? "NOC Wallboard" : pathname.split("/")[1]?.replace("-", " ")}
            </h1>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Clock Widget */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/40 border border-border/40 px-3 py-1.5 rounded-lg font-mono">
              <Calendar className="w-3.5 h-3.5" />
              <span>{time}</span>
            </div>

            {/* Global Search Button */}
            <button
              onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
              className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground bg-secondary/50 hover:bg-secondary border border-border/40 rounded-lg transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Search...</span>
              <kbd className="hidden sm:inline-flex text-[9px] font-mono border border-border bg-card px-1 rounded">⌘K</kbd>
            </button>

            {/* Notification Center */}
            <NotificationCenter />

            {/* + Partner Clock-In Button — visible on ALL screen sizes for ALL logged-in users (hidden while browsing — attendance is never written in a view-only session) */}
            {user && !browsing && (
              <button
                onClick={() => setShowClockInModal(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary font-bold text-xs transition-all cursor-pointer shadow-xs"
                title="Clock In Duty Partner / Co-Worker on this shared workstation"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">+ Partner</span>
                <span className="sm:hidden">+</span>
              </button>
            )}

            {/* Dashboard User Switcher — hop between checked-in duty partners */}
            {(partnerUsers.length > 0 || originUser) && user && (
              <div className="relative">
                <button
                  onClick={() => setShowUserSwitcher(!showUserSwitcher)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    originUser
                      ? "bg-warning/15 hover:bg-warning/25 border-warning/40 text-warning"
                      : "bg-secondary/50 hover:bg-secondary border-border/40 text-foreground"
                  }`}
                  title={originUser ? `Viewing ${user.name}'s dashboard — switch back to ${originUser.name}` : "Switch to a duty partner's dashboard"}
                >
                  <UserRoundCog className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{originUser ? user.name.split(" ")[0] : "Switch"}</span>
                  <span className="sm:hidden">⇄</span>
                </button>

                {showUserSwitcher && (
                  <>
                    <div className="fixed inset-0 z-40 bg-black/25" onClick={() => setShowUserSwitcher(false)} />
                    <div className="absolute right-0 mt-2 w-64 bg-card text-card-foreground rounded-2xl border border-border shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-4 py-3 border-b border-border bg-secondary/30">
                        <h3 className="text-xs font-bold uppercase tracking-wider">Switch Duty Dashboard</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Operate a checked-in duty partner's workspace.</p>
                      </div>
                      <div className="max-h-72 overflow-y-auto divide-y divide-border/40">
                        {originUser && (
                          <button
                            onClick={() => switchBackToOrigin()}
                            className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-secondary/40 transition-colors cursor-pointer"
                          >
                            <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                              {originUser.name.charAt(0)}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-bold truncate">{originUser.name}</span>
                              <span className="block text-[10px] text-muted-foreground">My dashboard (switch back)</span>
                            </span>
                            <ArrowLeftRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          </button>
                        )}
                        {partnerUsers.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleSelectPartner(p)}
                            className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-secondary/40 transition-colors cursor-pointer"
                          >
                            <span className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                              {p.name.charAt(0)}
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-xs font-bold truncate">{p.name}</span>
                              <span className="block text-[10px] text-muted-foreground">Verify PIN to switch</span>
                            </span>
                            <UserRoundCog className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Browsing (view-only) badge — technicians who chose "Just Browsing" at login */}
            {browsing && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-warning/15 hover:bg-warning/25 border border-warning/40 text-warning text-[10px] font-bold"
                title="You signed in as Just Browsing — viewing only, nothing is recorded"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Browsing · Not on duty</span>
              </div>
            )}

            {/* Logged in Duty Pair Badge — desktop only */}
            {user && (
              <div className="hidden lg:flex items-center pl-2 border-l border-border/40">
                <DutyPairBadge name={dutyNames} role={user.role} size="sm" showAvatars={true} />
              </div>
            )}
          </div>
        </header>

        {/* Clock In Partner Modal */}
        <ClockInPartnerModal
          isOpen={showClockInModal}
          onClose={() => setShowClockInModal(false)}
          activeShift={activeShift}
          currentUserId={user.id}
          alreadyCheckedInUserIds={checkedInUserIds}
          absentUserIds={shiftAttendance.filter(a => a.is_absent).map(a => a.user_id)}
          onSuccess={loadHeaderShiftData}
        />

        {/* Fault Assignment Banner — shown after login when a fault was assigned to this user */}
        <FaultAssignmentBanner />

        {/* Station-wide announcement strip */}
        <AnnouncementBanner />

        {/* Assigned Duties Awareness — full-screen blur acknowledgment of assigned faults/tasks */}
        <AssignedDutiesModal />

        {/* Dashboard Main Workspace */}
        <main className="flex-1 p-4 pb-20 md:p-6 md:pb-14 overflow-y-auto max-w-7xl w-full mx-auto">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </main>
      </div>

      {/* Floating Add Action Button (Mobile & Tablet) - hidden for Admin and browsing sessions */}
      {!hasRole("Admin") && !browsing && (
        <>
          {showAddMenu && (
            <div className="fixed inset-0 z-30 bg-black/40" onClick={() => setShowAddMenu(false)} />
          )}
          <div className="fixed bottom-20 right-4 z-40 md:bottom-6 md:right-6">
            <button
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/95 transition-transform hover:scale-105 active:scale-95 cursor-pointer pulse-primary"
            >
              <Plus className={`w-6 h-6 transition-transform ${showAddMenu ? "rotate-45" : ""}`} />
            </button>

            {showAddMenu && (
              <div className="absolute bottom-14 right-0 w-48 bg-card border border-border rounded-xl shadow-xl p-1.5 space-y-0.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
                {!hasRole("Admin") && !hasRole("Supervisor") && (
                  <button
                    onClick={() => { router.push("/handover"); setShowAddMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" /> Handover Shift
                  </button>
                )}
                {!hasRole("Admin") && !hasRole("Supervisor") && (
                  <button
                    onClick={() => { router.push("/faults?action=new"); setShowAddMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" /> Report Fault
                  </button>
                )}
                {!hasRole("Admin") && !hasRole("Supervisor") && (
                  <button
                    onClick={() => { router.push("/tasks"); setShowAddMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg hover:bg-secondary text-left text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-primary" /> Create Task
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-card/90 backdrop-blur-md flex items-center justify-around px-2 z-40 shadow-lg">
        <Link
          href="/"
          className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors ${
            pathname === "/" ? "text-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Dashboard</span>
        </Link>
        {!hasRole("Admin") && !hasRole("Supervisor") && !browsing && (
          <Link
            href="/current-shift"
            className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors ${
              pathname === "/current-shift" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Radio className="w-5 h-5" />
            <span>Active Shift</span>
          </Link>
        )}
        {/* + Partner Clock-In shortcut in mobile bottom nav — all users (hidden while browsing) */}
        {user && !browsing && (
          <button
            onClick={() => setShowClockInModal(true)}
            className="flex flex-col items-center gap-1 text-[10px] font-semibold text-primary transition-colors cursor-pointer"
          >
            <UserPlus className="w-5 h-5" />
            <span>+ Partner</span>
          </button>
        )}
        {!hasRole("Admin") && !hasRole("Supervisor") && (
          <Link
            href="/faults"
            className={`flex flex-col items-center gap-1 text-[10px] font-semibold transition-colors ${
              pathname === "/faults" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
            <span>Faults</span>
          </Link>
        )}
      </nav>

      {/* Mobile Sidebar Overlay/Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Drawer Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 backdrop-blur-xs" 
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer Content */}
          <div className="relative w-64 bg-card border-r border-border p-4 flex flex-col h-full animate-in slide-in-from-left duration-250 z-10">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Brand Header */}
            <div className="flex items-center justify-center px-2 py-3 border-b border-border mb-6">
              <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                <img 
                  src="/logo.png" 
                  alt="App Logo" 
                  className="w-full h-full object-cover rounded-full" 
                  onError={(e) => {
                    e.currentTarget.src = "https://res.cloudinary.com/dlu07cuqx/image/upload/v1784668203/ChatGPT_Image_Jul_21_2026_09_09_29_PM_xmnmek.png";
                  }}
                />
              </div>
            </div>

            {/* Mobile Nav Links */}
            <nav className="flex-1 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                if (item.role && !checkPermission(item.role)) return null;
                if (item.hideFrom && item.hideFrom.some((r) => hasRole(r))) return null;

                const isActive = pathname === item.href;
                const Icon = item.icon;

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? "text-primary-foreground" : item.color}`} />
                    <span>{item.name}</span>
                    {item.href === "/tasks" && pendingTasks > 0 && (
                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-5 text-center bg-primary/15 text-primary border border-primary/30">
                        {pendingTasks}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="pt-4 border-t border-border mt-auto">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowLogoutPrompt(true);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold rounded-lg text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <LogoutDialog
        isOpen={showLogoutPrompt}
        onClose={() => setShowLogoutPrompt(false)}
        onConfirm={logout}
      />

      {/* PIN-Verified Dashboard Switch Modal */}
      {pinTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => { if (!switching) setPinTarget(null); }}
        >
          <form
            onSubmit={handleSwitchVerify}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-5 py-4 border-b border-border bg-secondary/30 flex items-center gap-3">
              <span className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {pinTarget.name.charAt(0)}
              </span>
              <div>
                <h3 className="text-sm font-bold">Verify to switch dashboard</h3>
                <p className="text-[11px] text-muted-foreground">
                  Enter {pinTarget.name.split(" ")[0]}&apos;s PIN to view their dashboard.
                </p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <input
                type="password"
                autoFocus
                inputMode="numeric"
                maxLength={4}
                value={switchPin}
                onChange={(e) => { setSwitchPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setSwitchError(""); }}
                placeholder="••••"
                className="w-full text-center text-lg font-bold tracking-widest bg-secondary/50 border border-border rounded-xl py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
              />
              {switchError && (
                <p className="text-[11px] font-semibold text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  {switchError}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPinTarget(null)}
                  disabled={switching}
                  className="flex-1 py-2.5 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={switching}
                  className="flex-1 py-2.5 text-xs font-bold rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground transition-colors cursor-pointer disabled:opacity-50"
                >
                  {switching ? "Verifying..." : "Verify & Switch"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Global Command Palette search modal */}
      <CommandPalette />
      
      {/* PWA Install Prompt Banner */}
      <PWAInstallPrompt />

      {/* Toast Manager */}
      <Toaster position="top-right" reverseOrder={false} />
    </div>
    )}
    </>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryProvider>
          <DashboardLayoutContent>{children}</DashboardLayoutContent>
        </QueryProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
