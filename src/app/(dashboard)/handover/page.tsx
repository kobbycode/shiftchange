"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firestore";
import { Shift, User, Fault, Task, OutsideBroadcast, Handover, Attendance, Station, ShiftType, TaskStatus, FaultPriority, getShiftTypeForTime, isLateCheckIn, MockDB } from "@/lib/mock-db";
import { AIService } from "@/lib/ai";
import { useAuth } from "@/components/auth-context";
import { HandoverSectionA, SectionAData } from "@/components/handover-section-a";
import { HandoverSectionB, SectionBData } from "@/components/handover-section-b";
import { HandoverSectionC, SectionCData } from "@/components/handover-section-c";
import { HandoverSectionD, SectionDData } from "@/components/handover-section-d";
import { HandoverSectionE, SectionEData } from "@/components/handover-section-e";
import { HandoverSectionF, SectionFData } from "@/components/handover-section-f";
import { 
  ArrowRightLeft, Copy, Calendar, ShieldCheck, 
  Clock, CheckCircle, AlertTriangle, Compass, Users, Download, Printer, Search, Info,
  FileText, Send, X, CheckCircle2, AlertCircle
} from "lucide-react";
import toast from "react-hot-toast";
import { formatPairName } from "@/lib/pair-utils";
import { useBrowsingMode } from "@/lib/browsing-mode";
import { getSystemSettings } from "@/lib/system-settings";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { PrintableHandoverForm } from "@/components/printable-handover-form";
import { motion, AnimatePresence } from "framer-motion";

/* ── Theme Hook ───────────────────────────────────────────── */
function useThemeColors() {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const check = () => setDark(document.documentElement.classList.contains("dark"));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark ? {
    page: "#020617", card: "#111827", card2: "#1E293B", border: "#334155",
    text: "#F8FAFC", text2: "#CBD5E1", muted: "#94A3B8",
    brand: "#8B5CF6", brandHover: "#7C3AED", brandLight: "rgba(139,92,246,.12)",
    success: "#10B981", successBg: "rgba(16,185,129,.12)",
    warning: "#F59E0B", warningBg: "rgba(245,158,11,.12)",
    danger: "#EF4444", dangerBg: "rgba(239,68,68,.12)",
    info: "#3B82F6", infoBg: "rgba(59,130,246,.12)",
    shadow: "0 1px 2px rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.25)",
    shadowLg: "0 2px 4px rgba(0,0,0,.25), 0 12px 32px rgba(0,0,0,.3)",
  } : {
    page: "#F8FAFC", card: "#FFFFFF", card2: "#F1F5F9", border: "#E2E8F0",
    text: "#0F172A", text2: "#475569", muted: "#94A3B8",
    brand: "#7C3AED", brandHover: "#6D28D9", brandLight: "#EDE9FE",
    success: "#10B981", successBg: "#DCFCE7",
    warning: "#F59E0B", warningBg: "#FEF3C7",
    danger: "#EF4444", dangerBg: "#FEE2E2",
    info: "#3B82F6", infoBg: "#DBEAFE",
    shadow: "0 1px 2px rgba(15,23,42,.05), 0 8px 24px rgba(15,23,42,.06)",
    shadowLg: "0 2px 4px rgba(15,23,42,.06), 0 12px 32px rgba(15,23,42,.08)",
  };
}

export default function HandoverPage() {
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();
  const browsing = useBrowsingMode() && currentUser?.role === "Technician";
  const [dataLoading, setDataLoading] = React.useState(true);

  // Step flow: Section A → B → C → D → E → F (Pending Tasks) → G (Final Verification)
  const [step, setStep] = React.useState<"section-a" | "section-b" | "section-c" | "section-d" | "section-e" | "section-f" | "handover">("section-a");
  const [sectionAData, setSectionAData] = React.useState<SectionAData | null>(null);
  const [sectionBData, setSectionBData] = React.useState<SectionBData | null>(null);
  const [sectionCData, setSectionCData] = React.useState<SectionCData | null>(null);
  const [sectionDData, setSectionDData] = React.useState<SectionDData | null>(null);
  const [sectionEData, setSectionEData] = React.useState<SectionEData | null>(null);
  const [sectionFData, setSectionFData] = React.useState<SectionFData | null>(null);

  // Active shift states
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [outgoingStaff, setOutgoingStaff] = React.useState<User | null>(null);
  const [users, setUsers] = React.useState<User[]>([]);
  const [faults, setFaults] = React.useState<Fault[]>([]);
  const [allFaults, setAllFaults] = React.useState<Fault[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [obs, setObs] = React.useState<OutsideBroadcast[]>([]);
  const [attendance, setAttendance] = React.useState<Attendance[]>([]);
  const [stations, setStations] = React.useState<Station[]>([]);
  const [showPrintModal, setShowPrintModal] = React.useState(false);

  // Handover History States
  const [history, setHistory] = React.useState<Handover[]>([]);
  const [allShifts, setAllShifts] = React.useState<Shift[]>([]);
  const [searchQuery, setSearchQuery] = React.useState("");

  // Handover Form States
  const [summary, setSummary] = React.useState("");
  const [incomingStaffId, setIncomingStaffId] = React.useState("");
  const [incomingStaffIds, setIncomingStaffIds] = React.useState<string[]>([]);
  const [incomingPins, setIncomingPins] = React.useState<Record<string, string>>({});
  const [excusedTechs, setExcusedTechs] = React.useState<Record<string, boolean>>({});
  // Mark-as-absent is supervisor/admin only: the checkbox first opens an
  // authorization step that must be confirmed with the supervisor's own PIN
  const [excusePending, setExcusePending] = React.useState<Record<string, boolean>>({});
  const [excusePins, setExcusePins] = React.useState<Record<string, string>>({});
  const [excuseErrors, setExcuseErrors] = React.useState<Record<string, string>>({});
  const [outgoingPins, setOutgoingPins] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const [completingObId, setCompletingObId] = React.useState<string | null>(null);

  const activeObs = React.useMemo(() => obs.filter(o => o.is_running), [obs]);
  const t = useThemeColors();

  // Full duty-crew name (e.g. "Enoch & Ransford") from a handover's stored
  // crew ids — falls back to the primary id when the crew wasn't recorded.
  const formatCrewIds = (ids?: string[], fallbackId?: string): string => {
    const list = ids && ids.length > 0 ? ids : fallbackId ? [fallbackId] : [];
    const names = list.map(id => users.find(u => u.id === id)?.name).filter(Boolean) as string[];
    if (names.length === 0) return "Tech";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  };

  // Section G roster: ONLY technicians on duty (checked in for this shift) —
  // the ones accounted for in the attendance ledger before Section G.
  // Excused/absent techs drop out of the list entirely. If nobody has checked
  // in yet, fall back to all technicians so the supervisor can still verify.
  const onDutyTechs = React.useMemo(() => {
    if (!activeShift) return [];
    const shiftAttIds = new Set(
      attendance.filter(a => a.shift_id === activeShift.id && !a.is_absent).map(a => a.user_id)
    );
    return users.filter(u => shiftAttIds.has(u.id) && u.role === "Technician");
  }, [activeShift, attendance, users]);

  const sectionGRoster = React.useMemo(
    () => (onDutyTechs.length > 0 ? onDutyTechs : users.filter(u => u.role === "Technician"))
      .filter(u => !excusedTechs[u.id]),
    [onDutyTechs, users, excusedTechs]
  );
  const excusedTechList = React.useMemo(
    () => users.filter(u => u.role === "Technician" && !!excusedTechs[u.id]),
    [users, excusedTechs]
  );
  const allTechnicians = React.useMemo(
    () => users.filter(u => u.role === "Technician"),
    [users]
  );

  // Every technician marked absent for the active shift — supervisors mark
  // them in the Absence Console; they must not appear anywhere a technician
  // is listed (incoming selection, assignments, rosters).
  const absentTechIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const u of excusedTechList) ids.add(u.id);
    if (activeShift) {
      for (const a of attendance) {
        if (a.shift_id === activeShift.id && a.is_absent) ids.add(a.user_id);
      }
    }
    return ids;
  }, [excusedTechList, attendance, activeShift]);

  React.useEffect(() => {
    if (!currentUser) return;
    Promise.all([
      loadActiveShiftData().catch(e => console.error("Failed to load shift data:", e)),
      loadHistory()
    ]).catch(e => console.error("Failed to load initial data:", e))
    .finally(() => setDataLoading(false));
  }, [currentUser]);

  // Poll the active shift + checked-in roster so a supervisor's page left open
  // picks up check-ins made on other browsers (cross-browser changes never fire
  // local events). Only shift/roster state is refreshed — form selections in
  // Sections A–D are untouched.
  React.useEffect(() => {
    if (!currentUser) return;
    const poll = async () => {
      try {
        const active = await db.shifts.getActive();
        if (!active) return;
        setActiveShift(active);
        const all = await db.attendance.list();
        setAttendance(all.filter(a => a.shift_id === active.id));
      } catch {}
    };
    const interval = setInterval(poll, 15000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const loadActiveShiftData = async () => {
    let active = await db.shifts.getActive();

    // Auto-create a shift if none exists (handover-driven flow) —
    // never auto-creates in a browsing session and never for supervisors/admins:
    // a visiting supervisor must not spawn a shift in their own name
    if (!active && currentUser && !browsing && currentUser.role === "Technician") {
      try {
        const now = new Date();
        active = await db.shifts.start(getShiftTypeForTime(now), "Radio Engineering", currentUser.id, "Auto-created for handover");
      } catch (e: any) {
        console.error("Failed to auto-create shift:", e);
      }
    }

    setActiveShift(active);

    const allUsers = await db.users.list();
    setUsers(allUsers);

    if (active) {
      const outUser = allUsers.find(u => u.id === active.incoming_staff_id);
      if (outUser) setOutgoingStaff(outUser);

      // Load faults logged during this shift
      const allFaults = await db.faults.list();
      setAllFaults(allFaults);
      const shiftFaults = allFaults.filter(f => f.shift_id === active.id);
      setFaults(shiftFaults);

      // Load tasks
      const allTasks = await db.tasks.list();
      setTasks(allTasks);

      // Load OBs
      const allObs = await db.outsideBroadcasts.list();
      setObs(allObs);

      // Load attendance
      const allAttendance = await db.attendance.list();
      const shiftAttendance = allAttendance.filter(a => a.shift_id === active.id);
      setAttendance(shiftAttendance);
      // Restore any supervisor-authorized absences so they survive reloads —
      // they drop out of the Section G roster and skip PIN verification.
      setExcusedTechs(prev => {
        const next = { ...prev };
        shiftAttendance.forEach(a => { if (a.is_absent) next[a.user_id] = true; });
        return next;
      });

      // Seed the incoming roster from the shift when Section A hasn't run yet
      // (e.g. the supervisor console) so the incoming cards — PIN verification
      // and absence marking — always render. A later Section A completion
      // overwrites this selection. Absent technicians are never seeded.
      if (incomingStaffIds.length === 0) {
        const shiftIncoming = allUsers.find(u => u.id === active.incoming_staff_id && u.role === "Technician" && !shiftAttendance.some(a => a.user_id === u.id && a.is_absent));
        if (shiftIncoming) setIncomingStaffIds([shiftIncoming.id]);
      }

      // Load stations
      const allStations = await db.stations.list();
      setStations(allStations);
    }
  };

  const loadHistory = async () => {
    db.handovers.list().then(setHistory).catch(() => {});
    db.shifts.list().then(setAllShifts).catch(() => {});
  };

  const handleSectionAComplete = async (data: SectionAData) => {
    setSectionAData(data);
    setIncomingStaffId(data.incomingStaffId);
    setIncomingStaffIds(data.incomingStaffIds ?? [data.incomingStaffId]);
    // Persist the shift type and location chosen by the outgoing staff so they
    // show consistently across the app (current shift, header, attendance, reports)
    if (activeShift && (activeShift.shift_type !== data.shift || activeShift.location !== data.location)) {
      try {
        const updated = await db.shifts.update(activeShift.id, { shift_type: data.shift, location: data.location });
        setActiveShift(updated);
      } catch (e) {
        console.error("Failed to update shift details:", e);
      }
    }
    setStep("section-b");
  };

  const handleSectionBComplete = async (data: SectionBData) => {
    setSectionBData(data);
    // Persist each technician's late flag + reason to their OWN attendance
    // record — one reason per engineer (the Attendance Log and print form
    // render these per-row, so a shared reason would misattribute lateness)
    if (activeShift) {
      const shiftAtt = attendance.filter(a => a.shift_id === activeShift.id);
      for (const att of shiftAtt) {
        const flag = data.lateFlags[att.user_id];
        if (!flag) continue;
        const changed =
          (!!att.is_late !== flag.is_late) ||
          ((att.late_reason || "") !== flag.reason.trim());
        if (changed) {
          try {
            await db.attendance.update(att.id, {
              is_late: flag.is_late,
              // null (not undefined) clears the cloud field — undefined keys
              // are stripped by clean(), so a stale reason would survive
              late_reason: flag.is_late && flag.reason.trim() ? flag.reason.trim() : null,
            });
          } catch (e) {
            console.error(`Failed to save late flag for attendance ${att.id}:`, e);
          }
        }
      }
      db.attendance.list().then(all => setAttendance(all.filter(a => a.shift_id === activeShift.id))).catch(() => {});
    }
    setStep("section-c");
  };

  const handleSectionCComplete = (data: SectionCData) => {
    setSectionCData(data);
    setStep("section-d");
  };

  const handleSectionDComplete = async (data: SectionDData) => {
    if (!currentUser) return;
    let updatedCount = 0;
    let createdCount = 0;
    for (const sd of data.faults) {
      const original = faults.find(f => f.id === sd.id);
      if (sd.id.startsWith("fault-temp-")) {
        try {
          await db.faults.create({
            shift_id: activeShift?.id,
            station_id: stations.length > 0 ? stations[0].id : "",
            category: "Other",
            description: sd.description,
            reported_by_id: currentUser.id,
            priority: "Medium",
            action_taken: sd.actionTaken,
            status: sd.status,
            assigned_engineer_id: sd.assignedToId || undefined,
          });
          createdCount++;
        } catch (e) {
          console.error("Failed to create fault:", e);
          toast.error(`Failed to create fault: ${sd.description.substring(0, 30)}`);
        }
      } else if (original && (original.status !== sd.status || original.action_taken !== sd.actionTaken || (original.assigned_engineer_id || "") !== (sd.assignedToId || ""))) {
        try {
          await db.faults.update(sd.id, {
            status: sd.status,
            action_taken: sd.actionTaken,
            assigned_engineer_id: sd.assignedToId || "",
          }, currentUser.id);
          updatedCount++;
        } catch (e) {
          console.error("Failed to update fault status:", e);
          toast.error(`Failed to update fault ${sd.id}: ${e instanceof Error ? e.message : e}`);
        }
      }
    }
    const total = updatedCount + createdCount;
    if (total > 0) toast.success(`${updatedCount} fault(s) updated, ${createdCount} created`);
    else toast("No fault changes to persist");
    db.faults.list().then(setFaults);
    setSectionDData(data);
    setStep("section-e");
  };

  const handleSectionEComplete = async (data: SectionEData) => {
    setSectionEData(data);
    if (!activeShift) {
      setStep("section-f");
      return;
    }
    let createdCount = 0;
    let updatedCount = 0;
    for (const ob of data.obs) {
      try {
        if (ob.id.startsWith("ob-temp-")) {
          await db.outsideBroadcasts.create({
            shift_id: activeShift.id,
            is_running: ob.isRunning,
            program_name: ob.programName,
            location: ob.location,
            technical_issues: ob.technicalIssues || undefined,
            status: (ob.isRunning ? "Active" : "Completed") as OutsideBroadcast["status"],
            signal_method: "Fiber",
            technical_crew: [],
            equipment_used: [],
          });
          createdCount++;
        } else {
          await db.outsideBroadcasts.update(ob.id, {
            is_running: ob.isRunning,
            status: (ob.isRunning ? "Active" : "Completed") as OutsideBroadcast["status"],
            location: ob.location,
            technical_issues: ob.technicalIssues || undefined,
          });
          updatedCount++;
        }
      } catch (e) {
        console.error("Failed to save OB:", e);
        toast.error(`Failed to save OB: ${ob.programName.substring(0, 30)}`);
      }
    }
    if (createdCount > 0 || updatedCount > 0) toast.success(`${createdCount} OB(s) created, ${updatedCount} updated`);
    db.outsideBroadcasts.list().then(setObs).catch(() => {});
    setStep("section-f");
  };

  const handleSectionFComplete = async (data: SectionFData) => {
    if (!currentUser) return;
    let updatedCount = 0;
    let createdCount = 0;
    for (const td of data.tasks) {
      const original = tasks.find(t => t.id === td.id);
      if (td.id.startsWith("task-temp-")) {
        try {
          await db.tasks.create({
            shift_id: activeShift?.id,
            task_name: td.taskName,
            description: td.description || undefined,
            assigned_to_id: td.assignedToId || undefined,
            priority: td.priority as FaultPriority,
            due_date: td.dueDate || undefined,
            status: td.status as TaskStatus,
          });
          createdCount++;
        } catch (e) {
          console.error("Failed to create task:", e);
          toast.error(`Failed to create task: ${td.taskName.substring(0, 30)}`);
        }
      } else if (original && original.status !== td.status) {
        try {
          await db.tasks.update(td.id, { status: td.status as TaskStatus });
          updatedCount++;
        } catch (e) {
          console.error("Failed to update task:", e);
          toast.error(`Failed to update task: ${td.taskName.substring(0, 30)}`);
        }
      }
    }
    if (createdCount > 0 || updatedCount > 0) toast.success(`${createdCount} task(s) created, ${updatedCount} updated`);
    db.tasks.list().then(setTasks);
    setSectionFData(data);
    setStep("handover");
  };

  const handleBackToSectionA = () => {
    setStep("section-a");
  };

  const handleBackToSectionB = () => {
    setStep("section-b");
  };

  const handleBackToSectionC = () => {
    setStep("section-c");
  };

  const handleBackToSectionD = () => {
    setStep("section-d");
  };

  const handleBackToSectionE = () => {
    setStep("section-e");
  };

  const activeOutgoingUsers = React.useMemo(() => {
    if (!activeShift) return [];
    const shiftAtt = attendance.filter(a => a.shift_id === activeShift.id && !a.is_absent);
    const attUsers = users.filter(u => shiftAtt.some(a => a.user_id === u.id) && u.role === "Technician");
    if (attUsers.length > 0) return attUsers;
    const outUser = users.find(u => u.id === activeShift.incoming_staff_id && u.role === "Technician");
    return outUser ? [outUser] : (currentUser && currentUser.role === "Technician" ? [currentUser] : []);
  }, [activeShift, attendance, users, currentUser]);

  const isOutgoingStaff = activeShift && currentUser && (
    activeOutgoingUsers.some(u => u.id === currentUser.id) ||
    activeShift.incoming_staff_id === currentUser.id
  );

  const incomingStaff = users.find(u => u.id === incomingStaffId);

  // Metrics calculations
  const totalFaults = faults.length;
  const resolvedFaults = faults.filter(f => f.status === "Resolved").length;
  const activeFaults = faults.filter(f => f.status !== "Resolved").length;
  const pendingTasks = tasks.filter(t => t.status !== "Completed").length;

  const calculateHours = () => {
    if (!activeShift) return "0.0";
    const start = new Date(activeShift.start_time).getTime();
    const end = Date.now();
    return ((end - start) / 3600000).toFixed(1);
  };

  const handleGenerateAISummary = () => {
    if (!activeShift) return;
    const aiText = AIService.generateShiftSummary(activeShift, outgoingStaff || undefined, faults, tasks, obs);
    setSummary(aiText);
    toast.success("AI handover report generated!");
  };

  const handleCopySummary = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    toast.success("Summary copied to clipboard!");
  };

  const handleMarkObDone = async (obId: string) => {
    setCompletingObId(obId);
    try {
      await db.outsideBroadcasts.update(obId, { is_running: false, status: "Completed" });
      setObs(prev => prev.map(o => o.id === obId ? { ...o, is_running: false, status: "Completed" } : o));
      toast.success("OB marked as completed");
    } catch (err: any) {
      toast.error(err.message || "Failed to complete OB");
    } finally {
      setCompletingObId(null);
    }
  };

  // ── Mark-as-absent (Excused / On Leave) — supervisors & admins ONLY ──
  const canAuthorizeAbsence = !!currentUser && (currentUser.role === "Supervisor" || currentUser.role === "Admin");

  const handleExcuseCheckbox = (techId: string, checked: boolean) => {
    if (!canAuthorizeAbsence) return; // technicians can never open or use this
    if (!checked) {
      // Unmarking is free — no PIN needed to cancel an authorization
      setExcusedTechs(prev => ({ ...prev, [techId]: false }));
      setExcusePending(prev => ({ ...prev, [techId]: false }));
      setExcuseErrors(prev => ({ ...prev, [techId]: "" }));
      // Clear the persisted absence from the attendance ledger too. A row the
      // absence console created for a tech who never checked in (absence_only)
      // must be DELETED — flipping is_absent would turn "not absent" into
      // "checked in" and leak them into the duty-engineer roster.
      if (activeShift) {
        const existing = attendance.find(a => a.shift_id === activeShift.id && a.user_id === techId);
        if (existing?.is_absent) {
          const clear = existing.absence_only
            ? db.attendance.remove(existing.id)
            : db.attendance.update(existing.id, {
                is_absent: false,
                absent_marked_by: null,
                absent_marked_at: null,
              });
          clear.then(() => {
            db.attendance.list().then(all => setAttendance(all.filter(a => a.shift_id === activeShift!.id))).catch(() => {});
          }).catch(e => console.error("Failed to clear absence:", e));
        }
      }
      return;
    }
    setExcusePending(prev => ({ ...prev, [techId]: true }));
    setExcuseErrors(prev => ({ ...prev, [techId]: "" }));
  };

  const handleAuthorizeExcuse = async (techId: string) => {
    if (!canAuthorizeAbsence || !currentUser) return;
    const pinVal = excusePins[techId] || "";
    if (!pinVal) { setExcuseErrors(prev => ({ ...prev, [techId]: "Enter your PIN to authorize this absence." })); return; }
    // Verify against the SAME users list the login screen uses — the PIN that
    // can sign this supervisor in is the PIN that authorizes. A stale session
    // or a local credential overlay can make `users` state / session pin
    // disagree with the list, so re-read it fresh.
    let me: User | undefined;
    try {
      const fresh = await db.users.list();
      me = fresh.find(u => u.id === currentUser.id);
    } catch { me = users.find(u => u.id === currentUser.id); }
    if (me && me.pin === pinVal) {
      const techName = users.find(u => u.id === techId)?.name || "Technician";
      setExcusedTechs(prev => ({ ...prev, [techId]: true }));
      setExcusePending(prev => ({ ...prev, [techId]: false }));
      setExcusePins(prev => ({ ...prev, [techId]: "" }));
      setExcuseErrors(prev => ({ ...prev, [techId]: "" }));
      try {
        MockDB.logAudit(currentUser.id, "MARK_ABSENT", "users", techId, `${currentUser.name} marked ${techName} as absent/excused at final handover`);
      } catch {}
      // Persist to the shift's attendance ledger so the absence shows in the
      // Attendance Log and survives reloads. Missing check-in rows get created
      // with the deterministic (shift, user) id used by attendance.create.
      if (activeShift) {
        try {
          const existing = attendance.find(a => a.shift_id === activeShift.id && a.user_id === techId);
          if (existing) {
            await db.attendance.update(existing.id, {
              is_absent: true,
              absent_marked_by: currentUser.name,
              absent_marked_at: new Date().toISOString(),
            });
          } else {
            await db.attendance.create({
              shift_id: activeShift.id,
              user_id: techId,
              time_reported: new Date().toISOString(),
              hours_worked: 0,
              is_late: false,
              is_absent: true,
              absent_marked_by: currentUser.name,
              absent_marked_at: new Date().toISOString(),
              absence_only: true,
            });
          }
          const all = await db.attendance.list();
          setAttendance(all.filter(a => a.shift_id === activeShift.id));
        } catch (e) {
          console.error("Failed to persist absence:", e);
          toast.error("Absence authorized but failed to save to the attendance log");
        }
      }
      toast.success(`${techName} marked as absent — authorized by ${currentUser.name}`);
    } else {
      setExcuseErrors(prev => ({ ...prev, [techId]: `Incorrect PIN — it doesn't match ${currentUser.name}'s current PIN. The admin can reset PINs under Admin → Users.` }));
    }
  };

  const handleHandoverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift || !outgoingStaff || !currentUser) return;
    if (!summary.trim()) {
      toast.error("Please enter or generate a shift handover summary");
      return;
    }
    if (incomingStaffIds.length === 0) {
      toast.error("Please select at least one incoming technician");
      return;
    }
    // Honor the System Settings gate: PIN-based handover signing can be
    // disabled by the admin, which blocks Section G submission until re-enabled
    if (!getSystemSettings().allowPinSignature) {
      toast.error("PIN handover signing is disabled in System Settings — re-enable it to complete this handover");
      return;
    }

    setSaving(true);
    try {
      // 1. Verify PINs for all listed outgoing technicians (excused ones are
      // no longer listed and are skipped anyway)
      for (const tech of sectionGRoster) {
        if (excusedTechs[tech.id]) continue;

        const pinVal = outgoingPins[tech.id] || "";
        if (pinVal !== tech.pin) {
          toast.error(`Invalid Security PIN for outgoing technician: ${tech.name}`);
          setSaving(false);
          return;
        }
      }

      // 2. Verify PIN for ALL incoming technicians (excused ones are bypassed)
      const incomingTechUsers = incomingStaffIds.map(id => users.find(u => u.id === id)).filter(Boolean) as User[];
      for (const inTech of incomingTechUsers) {
        if (excusedTechs[inTech.id]) continue;
        const pinVal = incomingPins[inTech.id] || "";
        if (pinVal !== inTech.pin) {
          toast.error(`Invalid Security PIN for incoming technician: ${inTech.name}`);
          setSaving(false);
          return;
        }
      }

      // 3. Log Handover record — include the FULL duty crews on both sides,
      // not just the primary names, so every form/history view can show them
      await db.handovers.create({
        shift_id: activeShift.id,
        outgoing_staff_id: outgoingStaff.id,
        outgoing_staff_ids: sectionGRoster.map(u => u.id),
        incoming_staff_id: incomingStaffIds[0],
        incoming_staff_ids: incomingStaffIds,
        summary: summary,
        outgoing_signature_url: "PIN_VERIFIED",
        incoming_signature_url: "PIN_VERIFIED",
      });

      // 4. Start a new shift for the primary incoming technician
      //    — reuse the shift type + location selected in Section A by the outgoing staff.
      //    completeExisting=true: this is the deliberate rotation — the outgoing
      //    shift is closed and the incoming crew starts fresh.
      const shiftType: ShiftType = sectionAData?.shift || getShiftTypeForTime();
      const newShift = await db.shifts.start(shiftType, sectionAData?.location || activeShift.location, incomingStaffIds[0], `Handover from ${outgoingStaff.name}`, true);

      // 5. Create attendance records for any additional incoming technicians
      if (incomingStaffIds.length > 1 && newShift) {
        for (let i = 1; i < incomingStaffIds.length; i++) {
          await db.attendance.create({
            shift_id: newShift.id,
            user_id: incomingStaffIds[i],
            time_reported: new Date().toISOString(),
            hours_worked: 0,
            is_late: isLateCheckIn(new Date(), newShift),
          });
        }
      }

      // 6. Persist any pending fault status changes
      if (sectionDData) {
        for (const sd of sectionDData.faults) {
          const original = faults.find(f => f.id === sd.id);
          if (original && original.status !== sd.status) {
            await db.faults.update(sd.id, { status: sd.status, action_taken: sd.actionTaken }, currentUser.id);
          } else if (sd.id.startsWith("fault-temp-")) {
            await db.faults.create({
              shift_id: activeShift.id,
              station_id: stations.length > 0 ? stations[0].id : "",
              category: "Other",
              description: sd.description,
              reported_by_id: currentUser.id,
              priority: "Medium",
              action_taken: sd.actionTaken,
              status: sd.status,
            });
          }
        }
      }

      toast.success("Shift handover completed!");

      // 7. Sign out outgoing user, sign in as the first incoming technician
      await db.auth.signOut();
      await db.auth.signIn("", incomingTechUsers[0].pin);
      window.location.href = "/";
    } catch (err: any) {
      toast.error(err.message || "Failed to submit handover");
    } finally {
      setSaving(false);
    }
  };

  // CSV History Export
  const handleExportCSV = () => {
    if (history.length === 0) return;
    let csv = "Handover ID,Shift Date,Outgoing Staff,Incoming Staff,Handover Time,Summary\n";
    history.forEach(h => {
      const shift = allShifts.find(s => s.id === h.shift_id);
      const outName = formatCrewIds(h.outgoing_staff_ids, h.outgoing_staff_id);
      const inName = formatCrewIds(h.incoming_staff_ids, h.incoming_staff_id);
      csv += `"${h.id}","${shift?.date || ""}","${outName}","${inName}","${h.handover_time}","${h.summary?.replace(/"/g, '""') || ""}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handover-logs-${Date.now()}.csv`;
    a.click();
    toast.success("CSV Log export downloaded!");
  };

  return (
    <div className="space-y-6 text-left">
      {authLoading || dataLoading ? (
        <div className="flex items-center justify-center py-24">
          <div style={{ textAlign: "center" }}>
            <div style={{ width: "36px", height: "36px", border: "3px solid rgba(139,92,246,.2)", borderTopColor: t.brand, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
            <p style={{ fontSize: "14px", color: t.muted }}>Loading handover data...</p>
          </div>
        </div>
      ) : (<>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-xl font-bold tracking-tight">Shift Handover Portal</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Section G double-verification handover logbook and history vaults.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPrintModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs rounded-xl cursor-pointer transition-colors shadow-xs"
        >
          <Printer className="w-4 h-4 text-primary" /> Print Official Form
        </button>

      {showPrintModal && (
        <PrintableHandoverForm
          shift={activeShift}
          outgoingStaff={outgoingStaff}
          outgoingStaffs={sectionGRoster}
          incomingStaff={users.find(u => u.id === incomingStaffId)}
          incomingStaffs={incomingStaffIds.map(id => users.find(u => u.id === id)).filter(Boolean)}
          users={users}
          attendance={attendance}
          stations={stations}
          faults={faults}
          obs={obs}
          tasks={tasks}
          handoverSummary={summary}
          incomingSig={null}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 & 2: Active Handover form — view-only while browsing */}
        <div className="lg:col-span-2 space-y-6">
          {browsing ? (
            <div className="glass border border-warning/30 p-12 text-center text-xs rounded-2xl space-y-3">
              <div className="w-14 h-14 rounded-full bg-warning/15 border border-warning/30 flex items-center justify-center mx-auto">
                <Info className="w-6 h-6 text-warning" />
              </div>
              <h3 className="text-sm font-bold text-foreground">Browsing — View Only</h3>
              <p className="text-muted-foreground leading-relaxed max-w-sm mx-auto">
                You signed in as Just Browsing, so this handover form is not available in this session.
                Nothing you do here is recorded.
              </p>
              <p className="text-[10px] text-muted-foreground/70">
                Sign out and choose &quot;Start Shift&quot; when you&apos;re ready to take the shift.
              </p>
            </div>
          ) : activeShift ? (
            <>
            {step === "section-a" && (
              isOutgoingStaff ? (
                <HandoverSectionA
                  activeShift={activeShift}
                  currentUser={currentUser!}
                  activeOutgoingUsers={activeOutgoingUsers}
                  users={users}
                  absentTechIds={absentTechIds}
                  theme={t}
                  onComplete={handleSectionAComplete}
                />
              ) : canAuthorizeAbsence ? (
                <div style={{ background: t.card, borderRadius: "16px", border: `1px solid ${t.border}`, boxShadow: t.shadow, overflow: "hidden", padding: "28px 28px 36px" }}>
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: t.warningBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <ShieldCheck style={{ width: "20px", height: "20px", color: t.warning }} />
                      </div>
                      <div>
                        <h3 style={{ fontSize: "18px", fontWeight: 700, color: t.text, margin: 0, lineHeight: 1.2 }}>Supervisor Absence Console</h3>
                        <p style={{ fontSize: "12px", color: t.muted, margin: "4px 0 0" }}>
                          Mark technicians as absent for the active shift — authorized with your PIN.
                        </p>
                      </div>
                    </div>
                    <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "9999px", background: t.warningBg, color: t.warning, whiteSpace: "nowrap" }}>
                      {excusedTechList.length} absent
                    </span>
                  </div>

                  {/* Attendance-only notice */}
                  <div style={{ marginTop: "18px", display: "flex", alignItems: "flex-start", gap: "8px", padding: "10px 14px", borderRadius: "10px", background: t.card2, border: `1px dashed ${t.border}` }}>
                    <Info style={{ width: "14px", height: "14px", color: t.muted, flexShrink: 0, marginTop: "1px" }} />
                    <p style={{ fontSize: "11px", color: t.muted, margin: 0, lineHeight: 1.55 }}>
                      Attendance only — this console does not hand over the shift. Absences are saved to the attendance log for the active shift. The outgoing technician completes the actual handover separately.
                    </p>
                  </div>

                  {/* Technician roster */}
                  <div className="space-y-3" style={{ marginTop: "20px" }}>
                    {allTechnicians.length === 0 ? (
                      <p style={{ fontSize: "12px", color: t.muted, textAlign: "center", padding: "20px 0" }}>No technicians found.</p>
                    ) : allTechnicians.map(tech => {
                      const att = attendance.find(a => a.shift_id === activeShift.id && a.user_id === tech.id);
                      const isAbsent = !!excusedTechs[tech.id] || !!att?.is_absent;
                      const awaitingAuth = !!excusePending[tech.id];
                      return (
                        <div key={tech.id} style={{ background: t.card2, borderRadius: "12px", border: `1px solid ${isAbsent ? `${t.danger}55` : t.border}`, padding: "16px 18px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
                            <DutyPairBadge name={tech.name} role={tech.role} size="sm" />
                            {isAbsent ? (
                              <span style={{ fontSize: "10px", fontWeight: 700, padding: "3px 10px", borderRadius: "9999px", background: t.dangerBg, color: t.danger, border: `1px solid ${t.danger}30` }}>
                                ABSENT{att?.absent_marked_by ? ` — by ${att.absent_marked_by}` : ""}
                              </span>
                            ) : att ? (
                              <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 10px", borderRadius: "9999px", background: t.successBg, color: t.success, border: `1px solid ${t.success}30` }}>
                                Checked in
                              </span>
                            ) : (
                              <span style={{ fontSize: "10px", fontWeight: 600, padding: "3px 10px", borderRadius: "9999px", background: t.card, color: t.muted, border: `1px solid ${t.border}` }}>
                                Not checked in
                              </span>
                            )}
                          </div>
                          <div style={{ minWidth: "230px", maxWidth: "100%" }}>
                            {isAbsent ? (
                              <button
                                type="button"
                                onClick={() => handleExcuseCheckbox(tech.id, false)}
                                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "11px", fontWeight: 700, background: "transparent", color: t.danger, border: `1px solid ${t.danger}50`, borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}
                              >
                                <X style={{ width: "13px", height: "13px" }} /> Unmark Absent
                              </button>
                            ) : awaitingAuth ? (
                              <div className="space-y-2">
                                <label style={{ fontSize: "11px", fontWeight: 500, color: t.muted, display: "block" }}>
                                  Enter your {currentUser?.role} PIN to authorize this absence
                                </label>
                                <input
                                  type="password"
                                  maxLength={4}
                                  autoFocus
                                  value={excusePins[tech.id] || ""}
                                  onChange={(e) => {
                                    setExcusePins({ ...excusePins, [tech.id]: e.target.value.replace(/\D/g, "").slice(0, 4) });
                                    setExcuseErrors(prev => ({ ...prev, [tech.id]: "" }));
                                  }}
                                  placeholder="••••"
                                  style={{
                                    width: "100%", padding: "10px 12px", borderRadius: "8px", fontSize: "16px",
                                    letterSpacing: "0.25em", textAlign: "center", border: `1px solid ${excuseErrors[tech.id] ? t.danger : t.border}`,
                                    background: t.card, color: t.text, outline: "none", fontFamily: "monospace"
                                  }}
                                />
                                {excuseErrors[tech.id] && (
                                  <p style={{ fontSize: "10px", color: t.danger, fontWeight: 600 }}>{excuseErrors[tech.id]}</p>
                                )}
                                <div style={{ display: "flex", gap: "8px" }}>
                                  <button
                                    type="button"
                                    onClick={() => handleAuthorizeExcuse(tech.id)}
                                    style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", fontWeight: 700, fontSize: "11px", background: t.success, color: "#fff", border: "none", cursor: "pointer" }}
                                  >
                                    Authorize Absence
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleExcuseCheckbox(tech.id, false)}
                                    style={{ padding: "8px 12px", borderRadius: "8px", fontWeight: 600, fontSize: "11px", background: "transparent", color: t.muted, border: `1px solid ${t.border}`, cursor: "pointer" }}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleExcuseCheckbox(tech.id, true)}
                                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "7px 14px", fontSize: "11px", fontWeight: 700, background: t.dangerBg, color: t.danger, border: `1px solid ${t.danger}30`, borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}
                              >
                                <AlertTriangle style={{ width: "13px", height: "13px" }} /> Mark Absent
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ background: t.card, borderRadius: "16px", border: `1px solid ${t.border}`, boxShadow: t.shadow, overflow: "hidden", padding: "48px 32px", textAlign: "center" }}>
                  <div style={{ width: "64px", height: "64px", borderRadius: "50%", background: t.warningBg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={t.warning} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: "18px", fontWeight: 700, color: t.text, marginBottom: "8px" }}>Access Restricted</h3>
                  <p style={{ fontSize: "14px", color: t.muted, maxWidth: "400px", margin: "0 auto", lineHeight: 1.6 }}>
                    Only the outgoing shift engineer can fill in the handover form. Please ensure you are logged in as the correct staff member assigned to this shift.
                  </p>
                </div>
              )
            )}
            {step === "section-b" && isOutgoingStaff && sectionAData && (
              <HandoverSectionB
                activeShift={activeShift}
                currentUserName={currentUser!.name}
                attendance={attendance}
                users={users}
                theme={t}
                onComplete={handleSectionBComplete}
                onBack={handleBackToSectionA}
              />
            )}
            {step === "section-c" && isOutgoingStaff && (
              <HandoverSectionC
                stations={stations}
                faults={allFaults}
                theme={t}
                onComplete={handleSectionCComplete}
                onBack={handleBackToSectionB}
              />
            )}
            {step === "section-d" && isOutgoingStaff && (
              <HandoverSectionD
                faults={faults}
                stations={stations}
                users={users.filter(u => u.role === "Technician" && !absentTechIds.has(u.id))}
                currentUserId={currentUser!.id}
                theme={t}
                onSave={handleSectionDComplete}
                onBack={handleBackToSectionC}
              />
            )}
            {step === "section-e" && isOutgoingStaff && (
              <HandoverSectionE
                obs={obs}
                onSave={handleSectionEComplete}
                onBack={handleBackToSectionD}
                theme={t}
              />
            )}
            {step === "section-f" && isOutgoingStaff && (
              <HandoverSectionF
                tasks={tasks}
                users={users}
                absentTechIds={absentTechIds}
                onSave={handleSectionFComplete}
                onBack={handleBackToSectionE}
                theme={t}
              />
            )}
            {step === "handover" && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
            <form onSubmit={handleHandoverSubmit} style={{ background: t.card, borderRadius: "16px", border: `1px solid ${t.border}`, boxShadow: t.shadow, overflow: "hidden" }}>

              {/* Header */}
              <div className="px-5 pt-6 sm:px-8 sm:pt-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: t.brandLight, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <ArrowRightLeft style={{ width: "20px", height: "20px", color: t.brand }} />
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-[26px]" style={{ fontWeight: 700, color: t.text, margin: 0, lineHeight: 1.2 }}>SECTION G — FINAL PIN VERIFICATION TO HAND OVER</h3>
                      <p style={{ fontSize: "13px", color: t.muted, margin: "4px 0 0" }}>Double-verified handover — {activeShift.shift_type} shift</p>
                    </div>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 600, padding: "4px 12px", borderRadius: "9999px", background: t.brandLight, color: t.brand }}>Active</span>
                </div>
              </div>

              <div className="px-5 pb-6 sm:px-8 sm:pb-8 space-y-6">

                {/* ── Stat Cards ──────────────────────────── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "Hours Active", value: `${calculateHours()}h`, icon: Clock, bg: t.infoBg, iconColor: t.info },
                    { label: "Active Faults", value: activeFaults, icon: AlertTriangle, bg: t.warningBg, iconColor: t.warning },
                    { label: "Resolved", value: resolvedFaults, icon: CheckCircle, bg: t.successBg, iconColor: t.success },
                    { label: "OB Feeds", value: activeObs.length, icon: Compass, bg: t.brandLight, iconColor: t.brand },
                  ].map((s, i) => (
                    <motion.div key={i} whileHover={{ y: -2, boxShadow: t.shadowLg }} transition={{ duration: 0.2 }}
                      className="p-3 sm:p-5 text-center"
                      style={{ background: t.card, borderRadius: "14px", border: `1px solid ${t.border}`, boxShadow: t.shadow, cursor: "default", transition: "box-shadow 0.2s" }}>
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3" style={{ background: s.bg }}>
                        <s.icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" style={{ color: s.iconColor }} />
                      </div>
                      <p className="text-2xl sm:text-[36px]" style={{ fontWeight: 700, color: t.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{s.value}</p>
                      <p style={{ fontSize: "12px", fontWeight: 500, color: t.muted, marginTop: "6px" }}>{s.label}</p>
                    </motion.div>
                  ))}
                </div>

                {/* ── Form Grid ──────────────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Outgoing Tech */}
                  <div>
                    <label style={{ fontSize: "13px", fontWeight: 500, color: t.muted, letterSpacing: "0.025em", display: "block", marginBottom: "8px" }}>Outgoing Shift Technicians</label>
                    <div style={{ background: t.card2, borderRadius: "12px", border: `1px solid ${t.border}`, padding: "12px 16px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {sectionGRoster.map(u => (
                        <DutyPairBadge key={u.id} name={u.name} size="sm" />
                      ))}
                      {excusedTechList.length > 0 && (
                        <span style={{ fontSize: "10px", fontWeight: 600, padding: "2px 10px", borderRadius: "9999px", background: t.card, border: `1px dashed ${t.danger}55`, color: t.danger }}>
                          {excusedTechList.length} excused
                        </span>
                      )}
                      {sectionGRoster.length === 0 && excusedTechList.length === 0 && (
                        <span style={{ fontSize: "11px", color: t.muted }}>No technicians listed</span>
                      )}
                    </div>
                  </div>

                  {/* Incoming Technicians (selected in Section A) */}
                  <div>
                    <label style={{ fontSize: "13px", fontWeight: 500, color: t.muted, letterSpacing: "0.025em", display: "block", marginBottom: "8px" }}>Incoming Technicians</label>
                    <div style={{ background: t.card2, borderRadius: "12px", border: `1px solid ${t.border}`, padding: "10px 16px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      {incomingStaffIds.length > 0
                        ? incomingStaffIds.map(id => { const u = users.find(x => x.id === id); return u ? <DutyPairBadge key={id} name={u.name} role={u.role} size="sm" /> : null; })
                        : <DutyPairBadge name={incomingStaff?.name} role={incomingStaff?.role} size="sm" />
                      }
                    </div>
                  </div>
                </div>

                {/* ── Active OBs ──────────────────────────── */}
                <AnimatePresence>
                {activeObs.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div style={{ background: t.card, borderRadius: "14px", border: `1px solid ${t.border}`, boxShadow: t.shadow, overflow: "hidden" }}>
                      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: t.infoBg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Compass style={{ width: "16px", height: "16px", color: t.info }} />
                        </div>
                        <p style={{ fontSize: "14px", fontWeight: 600, color: t.text, margin: 0 }}>Active Outside Broadcasts</p>
                      </div>
                      <div style={{ padding: "16px 20px" }} className="space-y-2">
                        {activeObs.map(ob => (
                          <div key={ob.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: "12px", border: `1px solid ${t.border}`, background: t.card2 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: "14px", fontWeight: 500, color: t.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ob.program_name}</p>
                              <p style={{ fontSize: "12px", color: t.muted, margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {ob.location}{ob.technical_crew && ob.technical_crew.length > 0 ? ` — ${ob.technical_crew.join(", ")}` : ""}
                              </p>
                            </div>
                            <button type="button" onClick={() => handleMarkObDone(ob.id)} disabled={completingObId === ob.id}
                              style={{ marginLeft: "12px", display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", fontSize: "12px", fontWeight: 600, background: t.successBg, color: t.success, border: `1px solid ${t.success}30`, borderRadius: "8px", cursor: "pointer", opacity: completingObId === ob.id ? 0.5 : 1, transition: "all 0.2s", whiteSpace: "nowrap" }}>
                              <CheckCircle style={{ width: "14px", height: "14px" }} />
                              {completingObId === ob.id ? "Done..." : "Mark Done"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>

                {/* ── Summary ──────────────────────────── */}
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2" style={{ marginBottom: "10px" }}>
                    <label style={{ fontSize: "13px", fontWeight: 500, color: t.muted, letterSpacing: "0.025em" }}>Shift Handover Summary <span style={{ color: t.danger }}>*</span></label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button type="button" onClick={handleGenerateAISummary}
                        style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, background: "transparent", color: t.brand, border: `1px solid ${t.brand}`, borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = t.brandLight; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                        Generate Activities
                      </button>
                      {summary && (
                        <button type="button" onClick={handleCopySummary}
                          style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, background: t.card, color: t.muted, border: `1px solid ${t.border}`, borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = t.card2; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = t.card; }}>
                          <Copy style={{ width: "14px", height: "14px" }} /> Copy
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={7} required
                    style={{ width: "100%", padding: "14px 16px", borderRadius: "12px", fontSize: "15px", lineHeight: 1.7, border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none", resize: "none", minHeight: "160px", transition: "border-color 0.2s, box-shadow 0.2s" }}
                    placeholder="Draft handover log details, active studio configs, station health notes..."
                    onFocus={(e) => { e.currentTarget.style.borderColor = t.info; e.currentTarget.style.boxShadow = `0 0 0 3px ${t.infoBg}`; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = t.border; e.currentTarget.style.boxShadow = "none"; }} />
                </div>

                {/* ── Verification ──────────────────────────── */}
                <div className="space-y-4">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: t.text, margin: 0 }}>
                      Technician Sign-Off &amp; Verification
                    </p>
                    <span style={{ fontSize: "11px", color: t.muted }}>
                      {sectionGRoster.length} outgoing · {incomingStaffIds.filter(id => !excusedTechs[id]).length} incoming
                    </span>
                  </div>

                  {/* ── OUTGOING section ── */}
                  <p style={{ fontSize: "11px", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>Outgoing — Sign Off</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {sectionGRoster.map(tech => {
                      const isExcused = !!excusedTechs[tech.id];
                      const awaitingAuth = !!excusePending[tech.id];
                      return (
                        <div key={tech.id} style={{ background: t.card, borderRadius: "14px", border: `1px solid ${isExcused ? t.success : t.border}`, padding: "20px", boxShadow: t.shadow, position: "relative" }}>
                          <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2">
                            <DutyPairBadge name={tech.name} role={tech.role} size="sm" />
                            {canAuthorizeAbsence ? (
                              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                                <input
                                  type="checkbox"
                                  checked={isExcused || awaitingAuth}
                                  onChange={(e) => handleExcuseCheckbox(tech.id, e.target.checked)}
                                  className="rounded border-border cursor-pointer"
                                />
                                Excused / On Leave
                              </label>
                            ) : isExcused ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                                Authorized absence
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                Absence requires supervisor authorization
                              </span>
                            )}
                          </div>
                          {isExcused ? (
                            <div className="py-6 text-center space-y-1">
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                                🛡️ Approved Absence / On Leave
                              </span>
                              <p className="text-[11px] text-muted-foreground mt-1">Supervisor approved sign-off bypass for {tech.name}.</p>
                            </div>
                          ) : awaitingAuth ? (
                            <div className="space-y-2">
                              <label style={{ fontSize: "12px", fontWeight: 500, color: t.muted, display: "block" }}>
                                Enter your {currentUser?.role} PIN to authorize this absence
                              </label>
                              <input
                                type="password"
                                maxLength={4}
                                autoFocus
                                value={excusePins[tech.id] || ""}
                                onChange={(e) => {
                                  setExcusePins({ ...excusePins, [tech.id]: e.target.value.replace(/\D/g, "").slice(0, 4) });
                                  setExcuseErrors(prev => ({ ...prev, [tech.id]: "" }));
                                }}
                                placeholder="••••"
                                style={{
                                  width: "100%", padding: "12px 14px", borderRadius: "10px", fontSize: "18px",
                                  letterSpacing: "0.25em", textAlign: "center", border: `1px solid ${excuseErrors[tech.id] ? t.danger : t.border}`,
                                  background: t.card2, color: t.text, outline: "none", fontFamily: "monospace"
                                }}
                              />
                              {excuseErrors[tech.id] && (
                                <p style={{ fontSize: "11px", color: t.danger, fontWeight: 600 }}>{excuseErrors[tech.id]}</p>
                              )}
                              <button
                                type="button"
                                onClick={() => handleAuthorizeExcuse(tech.id)}
                                className="w-full py-2.5 rounded-lg font-bold text-xs cursor-pointer transition-colors"
                                style={{ background: t.success, color: "#fff", border: "none" }}
                              >
                                Authorize Absence
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExcuseCheckbox(tech.id, false)}
                                className="w-full py-1.5 rounded-lg font-semibold text-[11px] cursor-pointer transition-colors"
                                style={{ background: "transparent", color: t.muted, border: `1px solid ${t.border}` }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                              <div>
                                <label style={{ fontSize: "12px", fontWeight: 500, color: t.muted, display: "block", marginBottom: "8px" }}>
                                  {tech.name}&apos;s 4-Digit Security PIN <span style={{ color: t.danger }}>*</span>
                                </label>
                                <input
                                  type="password"
                                  maxLength={4}
                                  value={outgoingPins[tech.id] || ""}
                                  onChange={(e) => setOutgoingPins({ ...outgoingPins, [tech.id]: e.target.value })}
                                  placeholder="••••"
                                  style={{
                                    width: "100%", padding: "12px 14px", borderRadius: "10px", fontSize: "18px",
                                    letterSpacing: "0.25em", textAlign: "center", border: `1px solid ${t.border}`,
                                    background: t.card2, color: t.text, outline: "none", fontFamily: "monospace"
                                  }}
                                />
                              </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* ── INCOMING section ── */}
                  <p style={{ fontSize: "11px", fontWeight: 700, color: t.brand, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: "8px", marginBottom: "6px" }}>Incoming — Acknowledge Receipt</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {incomingStaffIds.filter(id => !excusedTechs[id]).map((id, idx) => {
                      const inTech = users.find(u => u.id === id);
                      if (!inTech) return null;
                      const isExcused = !!excusedTechs[id];
                      const awaitingAuth = !!excusePending[id];
                      return (
                        <div key={id} style={{ background: t.card, borderRadius: "14px", border: `2px solid ${isExcused ? t.success : t.brand}40`, padding: "20px", boxShadow: t.shadow, position: "relative" }}>
                          <div className="flex items-center justify-between mb-3 border-b border-border/40 pb-2">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 7px", borderRadius: "9999px", background: t.brand, color: "#fff" }}>IN #{idx + 1}</span>
                              <DutyPairBadge name={inTech.name} role={inTech.role} size="sm" />
                            </div>
                            {canAuthorizeAbsence ? (
                              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                                <input
                                  type="checkbox"
                                  checked={isExcused || awaitingAuth}
                                  onChange={(e) => handleExcuseCheckbox(id, e.target.checked)}
                                  className="rounded border-border cursor-pointer"
                                />
                                Excused / On Leave
                              </label>
                            ) : isExcused ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                                Authorized absence
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-muted-foreground">
                                Absence requires supervisor authorization
                              </span>
                            )}
                          </div>
                          {isExcused ? (
                            <div className="py-6 text-center space-y-1">
                              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                                🛡️ Approved Absence / On Leave
                              </span>
                              <p className="text-[11px] text-muted-foreground mt-1">Supervisor approved receipt bypass for {inTech.name}.</p>
                            </div>
                          ) : awaitingAuth ? (
                            <div className="space-y-2">
                              <label style={{ fontSize: "12px", fontWeight: 500, color: t.muted, display: "block" }}>
                                Enter your {currentUser?.role} PIN to authorize this absence
                              </label>
                              <input
                                type="password"
                                maxLength={4}
                                autoFocus
                                value={excusePins[id] || ""}
                                onChange={(e) => {
                                  setExcusePins({ ...excusePins, [id]: e.target.value.replace(/\D/g, "").slice(0, 4) });
                                  setExcuseErrors(prev => ({ ...prev, [id]: "" }));
                                }}
                                placeholder="••••"
                                style={{
                                  width: "100%", padding: "12px 14px", borderRadius: "10px", fontSize: "18px",
                                  letterSpacing: "0.25em", textAlign: "center", border: `1px solid ${excuseErrors[id] ? t.danger : t.border}`,
                                  background: t.card2, color: t.text, outline: "none", fontFamily: "monospace"
                                }}
                              />
                              {excuseErrors[id] && (
                                <p style={{ fontSize: "11px", color: t.danger, fontWeight: 600 }}>{excuseErrors[id]}</p>
                              )}
                              <button
                                type="button"
                                onClick={() => handleAuthorizeExcuse(id)}
                                className="w-full py-2.5 rounded-lg font-bold text-xs cursor-pointer transition-colors"
                                style={{ background: t.success, color: "#fff", border: "none" }}
                              >
                                Authorize Absence
                              </button>
                              <button
                                type="button"
                                onClick={() => handleExcuseCheckbox(id, false)}
                                className="w-full py-1.5 rounded-lg font-semibold text-[11px] cursor-pointer transition-colors"
                                style={{ background: "transparent", color: t.muted, border: `1px solid ${t.border}` }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div>
                              <label style={{ fontSize: "12px", fontWeight: 500, color: t.muted, display: "block", marginBottom: "8px" }}>
                                {inTech.name}&apos;s 4-Digit Security PIN <span style={{ color: t.danger }}>*</span>
                              </label>
                              <input
                                type="password"
                                maxLength={4}
                                value={incomingPins[id] || ""}
                                onChange={(e) => setIncomingPins(prev => ({ ...prev, [id]: e.target.value }))}
                                placeholder="••••"
                                style={{
                                  width: "100%", padding: "12px 14px", borderRadius: "10px", fontSize: "18px",
                                  letterSpacing: "0.25em", textAlign: "center", border: `1px solid ${t.brand}40`,
                                  background: t.card2, color: t.text, outline: "none", fontFamily: "monospace"
                                }}
                              />
                              <p style={{ fontSize: "11px", color: t.muted, textAlign: "center", marginTop: "8px" }}>
                                {inTech.name} confirms receipt of shift handover.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {excusedTechList.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 14px", borderRadius: "10px", background: t.card2, border: `1px dashed ${t.danger}55` }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: t.danger, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        Excused from handover
                      </span>
                      {excusedTechList.map(u => (
                        <span key={u.id} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 600, padding: "3px 10px", borderRadius: "9999px", background: t.card, border: `1px solid ${t.border}` }}>
                          <DutyPairBadge name={u.name} size="sm" showAvatars={false} />
                          <button
                            type="button"
                            onClick={() => handleExcuseCheckbox(u.id, false)}
                            title={`Unmark ${u.name} as absent`}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: t.muted, fontSize: "13px", lineHeight: 1, padding: "2px" }}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Submit ──────────────────────────── */}
                {!getSystemSettings().allowPinSignature && (
                  <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "8px" }}>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: t.warning, background: t.warningBg, padding: "6px 12px", borderRadius: "8px" }}>
                      PIN handover signing is disabled in System Settings — re-enable it to complete this handover
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "20px", borderTop: `1px solid ${t.border}` }}>
                  <motion.button type="submit" disabled={saving} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 28px", borderRadius: "12px", fontSize: "14px", fontWeight: 600, color: "#fff", background: saving ? t.muted : t.brand, border: "none", cursor: saving ? "not-allowed" : "pointer", minHeight: "44px", transition: "background 0.2s" }}>
                    {saving ? <><span style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} /> Signing...</> : <><Send style={{ width: "16px", height: "16px" }} /> Submit Double-Verified Handover</>}
                  </motion.button>
                </div>
              </div>
            </form>
            </motion.div>
            )}
            </>
          ) : (
            <div className="glass border border-border/40 p-12 text-center text-xs text-muted-foreground rounded-2xl">
              No shift is currently active. Handovers require an initialized active engineering shift.
            </div>
          )}
        </div>

        {/* Column 3: Handover History Logs Vault */}
        <div className="glass border border-border/60 rounded-2xl p-5 md:p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="font-bold text-sm flex items-center gap-1.5" style={{ color: "var(--foreground)" }}>
              <Calendar className="w-4 h-4" style={{ color: "var(--muted-foreground)" }} /> History Vault
            </h3>
            <button
              onClick={handleExportCSV}
              disabled={history.length === 0}
              className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-50"
              title="Export CSV logs"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Search filter */}
          <div className="relative flex items-center text-xs">
            <Search className="absolute left-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 bg-secondary/40 border border-border rounded-lg"
              placeholder="Search history by summary..."
            />
          </div>

          <div className="space-y-3.5 max-h-[70vh] overflow-y-auto pr-1 divide-y divide-border/40">
            {history.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No handover history records logged.</div>
            ) : (
              history
                .filter((hand) => {
                  if (!searchQuery.trim()) return true;
                  const qRaw = searchQuery.toLowerCase().trim();
                  const outUser = users.find((u) => u.id === hand.outgoing_staff_id);
                  const inUser = users.find((u) => u.id === hand.incoming_staff_id);

                  const blob = [
                    hand.summary || "",
                    outUser?.name || "",
                    formatPairName(outUser),
                    outUser?.email || "",
                    inUser?.name || "",
                    formatPairName(inUser),
                    inUser?.email || "",
                  ].join(" ").toLowerCase();

                  if (blob.includes(qRaw)) return true;
                  const qTokens = qRaw.split(/[\s&,/]+/).filter((tok) => tok.length > 1);
                  return qTokens.length > 0 && qTokens.every((tok) => blob.includes(tok));
                })
                .map((hand) => {
                  const shift = allShifts.find(s => s.id === hand.shift_id);
                  const outName = formatCrewIds(hand.outgoing_staff_ids, hand.outgoing_staff_id);
                  const inName = formatCrewIds(hand.incoming_staff_ids, hand.incoming_staff_id);

                  return (
                    <div key={hand.id} className="pt-3 text-xs text-left space-y-1.5">
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                        <span>{shift ? new Date(shift.date).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</span>
                        <span>Shift: {shift?.shift_type}</span>
                      </div>
                      <div className="flex flex-col gap-1 text-[11px] font-semibold text-foreground">
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-500 font-normal">Out:</span>
                          <DutyPairBadge name={outName} size="sm" showAvatars={false} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-zinc-500 font-normal">In:</span>
                          <DutyPairBadge name={inName} size="sm" showAvatars={false} />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
                        {hand.summary}
                      </p>
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => {
                            setSummary(hand.summary || "");
                            toast.success("History summary loaded into editor!");
                          }}
                          className="text-[10px] text-primary hover:underline font-semibold"
                        >
                          Copy to form
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>
      </div>
    </>)}
  </div>
  );
}
