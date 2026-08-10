"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/firestore";
import { Station, Shift, User, Attendance, StationStatus, FaultPriority, FaultStatus, Fault, FaultUpdate } from "@/lib/mock-db";
import { Radio, ShieldAlert, CheckCircle2, Clock, UserCheck, AlertTriangle, Play, Calendar, UserX, Save, X, Search, ChevronDown, AlertCircle, ClipboardList, TriangleAlert, ArrowRightLeft, History, Eye } from "lucide-react";
import toast from "react-hot-toast";
import { formatPairName } from "@/lib/pair-utils";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { useAuth } from "@/components/auth-context";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useBrowsingMode } from "@/lib/browsing-mode";

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
    brand: "#8B5CF6", brandLight: "rgba(139,92,246,.12)",
    success: "#10B981", successBg: "rgba(16,185,129,.12)",
    warning: "#F59E0B", warningBg: "rgba(245,158,11,.12)",
    danger: "#EF4444", dangerBg: "rgba(239,68,68,.12)",
    info: "#3B82F6", infoBg: "rgba(59,130,246,.12)",
    shadow: "0 1px 2px rgba(0,0,0,.2), 0 8px 24px rgba(0,0,0,.25)",
    shadowLg: "0 2px 4px rgba(0,0,0,.25), 0 12px 32px rgba(0,0,0,.3)",
  } : {
    page: "#F8FAFC", card: "#FFFFFF", card2: "#F1F5F9", border: "#E2E8F0",
    text: "#0F172A", text2: "#475569", muted: "#94A3B8",
    brand: "#7C3AED", brandLight: "#EDE9FE",
    success: "#10B981", successBg: "#DCFCE7",
    warning: "#F59E0B", warningBg: "#FEF3C7",
    danger: "#EF4444", dangerBg: "#FEE2E2",
    info: "#3B82F6", infoBg: "#DBEAFE",
    shadow: "0 1px 2px rgba(15,23,42,.05), 0 8px 24px rgba(15,23,42,.06)",
    shadowLg: "0 2px 4px rgba(15,23,42,.06), 0 12px 32px rgba(15,23,42,.08)",
  };
}

export default function CurrentShiftPage() {
  const router = useRouter();
  const { user, recordCheckIn } = useAuth();
  const browsing = useBrowsingMode() && user?.role === "Technician";

  // DB States
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [stations, setStations] = React.useState<Station[]>([]);
  const [engineers, setEngineers] = React.useState<User[]>([]);
  const [attendance, setAttendance] = React.useState<Attendance[]>([]);

  // UI / Form States
  const [loading, setLoading] = React.useState(true);
  const [checkingIn, setCheckingIn] = React.useState(false);
  const [activeStationId, setActiveStationId] = React.useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = React.useState<StationStatus>("OK");
  const [remarks, setRemarks] = React.useState("");

  // Incident Context & Timeline
  const [activeFaultState, setActiveFaultState] = React.useState<Fault | null>(null);
  const [activeFaultTimeline, setActiveFaultTimeline] = React.useState<FaultUpdate[]>([]);

// Cascading Fault Fields (Only displayed if selectedStatus is NOT 'OK')
  const [faultDescription, setFaultDescription] = React.useState("");
  const [actionTaken, setActionTaken] = React.useState("");
  const [timeDetected, setTimeDetected] = React.useState("");
  const [faultStatus, setFaultStatus] = React.useState<FaultStatus>("Open");
  const [faultPriority, setFaultPriority] = React.useState<FaultPriority>("Medium");
  const [customStatus, setCustomStatus] = React.useState(""); // Custom broadcast status
  const [showSaveConfirm, setShowSaveConfirm] = React.useState(false); // Confirmation before closing modal
  const [timeModalOpen, setTimeModalOpen] = React.useState(false); // Time picker modal
  const [draftTimeDetected, setDraftTimeDetected] = React.useState(""); // Draft time while picking
  const [customModalOpen, setCustomModalOpen] = React.useState(false); // Custom status modal
  const [draftCustomStatus, setDraftCustomStatus] = React.useState(""); // Draft custom status text

  // UI state for new form
  const [saving, setSaving] = React.useState(false);
  const [incidentExpanded, setIncidentExpanded] = React.useState(true);
  const [remarksError, setRemarksError] = React.useState(false);

  // Validation schema
  const stationFormSchema = z.object({
    remarks: z.string().min(1, "Remarks are required"),
    faultDescription: z.string().min(1, "Describe Fault / Activity is required"),
    actionTaken: z.string().optional(),
    faultStatus: z.string().optional(),
  });
  type StationFormValues = z.infer<typeof stationFormSchema>;

  const { register, handleSubmit, control, formState: { errors }, watch, reset, setValue } = useForm<StationFormValues>({
    resolver: zodResolver(stationFormSchema),
    defaultValues: {
      remarks: "",
      faultDescription: "",
      actionTaken: "",
      faultStatus: "Open",
    },
  });

  // Status config
  const STATUS_OPTIONS = [
    { value: "OK" as StationStatus, label: "OK", icon: CheckCircle2, color: "bg-emerald-500", border: "border-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-500" },
    { value: "Maintenance" as StationStatus, label: "Maintenance", icon: Radio, color: "bg-yellow-500", border: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/40", text: "text-yellow-700 dark:text-yellow-400", ring: "ring-yellow-500" },
    { value: "Fault" as StationStatus, label: "Fault", icon: ShieldAlert, color: "bg-amber-500", border: "border-amber-500", bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", ring: "ring-amber-500" },
    { value: "Signal Loss" as StationStatus, label: "Signal Loss", icon: AlertTriangle, color: "bg-orange-500", border: "border-orange-500", bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400", ring: "ring-orange-500" },
    { value: "Off Air" as StationStatus, label: "Off Air", icon: X, color: "bg-red-500", border: "border-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400", ring: "ring-red-500" },
    { value: "Emergency" as StationStatus, label: "Emergency", icon: AlertCircle, color: "bg-rose-600", border: "border-rose-600", bg: "bg-rose-50 dark:bg-rose-950/40", text: "text-rose-700 dark:text-rose-400", ring: "ring-rose-600" },
  ];

  // Custom status option: technicians can type their own status when selected
  const CUSTOM_STATUS_VALUE: string = "__custom__";
  const isPredefinedStatus = (s: string) => s !== CUSTOM_STATUS_VALUE && STATUS_OPTIONS.some(o => o.value === s);
  const customStatusLabel = selectedStatus === CUSTOM_STATUS_VALUE && customStatus.trim()
    ? customStatus.trim()
    : selectedStatus === CUSTOM_STATUS_VALUE
    ? "Custom Status"
    : selectedStatus;

  // Auto-fill text applied to the Remarks field whenever the Broadcast Status changes
  const STATUS_REMARKS: Record<string, string> = {
    OK: "All systems operating normally",
    Fault: "Station reporting a fault",
    Maintenance: "Station undergoing scheduled maintenance",
    "Off Air": "Station is off air",
    "Signal Loss": "Station experiencing signal loss",
    Emergency: "Station in emergency condition",
  };
  const applyStatusRemarks = (status: string) => {
    const auto = STATUS_REMARKS[status] || "";
    setRemarks(auto);
    setValue("remarks", auto, { shouldValidate: true });
    setRemarksError(false);
  };

  const SEVERITY_OPTIONS = [
    { value: "Low" as FaultPriority, label: "Low", color: "bg-emerald-500", border: "border-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400" },
    { value: "Medium" as FaultPriority, label: "Medium", color: "bg-yellow-500", border: "border-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950/40", text: "text-yellow-700 dark:text-yellow-400" },
    { value: "High" as FaultPriority, label: "High", color: "bg-orange-500", border: "border-orange-500", bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-700 dark:text-orange-400" },
    { value: "Critical" as FaultPriority, label: "Critical", color: "bg-red-500", border: "border-red-500", bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-400" },
  ];

  const FAULT_CATEGORIES = ["Transmitter", "Microwave Link", "Studio Console", "Power Supply", "Telecom / Fiber"];

  const FAULT_STATUS_OPTIONS = ["Open", "Working", "Monitoring", "Resolved", "Escalated"] as const;

  const SHOW_INCIDENT = selectedStatus !== "OK";

  const t = useThemeColors();

  React.useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("shift_")) loadData(); };
    const onShiftDataChanged = () => loadData();
    const interval = setInterval(loadData, 4000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    window.addEventListener("shift_data_changed", onShiftDataChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("shift_data_changed", onShiftDataChanged);
    };
  }, []);

  const loadData = async () => {
    try {
      const active = await db.shifts.getActive();
      setActiveShift(active);

      const stationsList = await db.stations.list();
      setStations(stationsList);

      const usersList = await db.users.list();
      setEngineers(usersList);

      if (active) {
        const attRecords = await db.attendance.getForShift(active.id);
        setAttendance(attRecords);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load shift records");
    } finally {
      setLoading(false);
    }
  };

  // Explicit check-in — attendance is only ever recorded on this confirmation
  const handleCheckIn = async () => {
    if (!user || checkingIn) return;
    setCheckingIn(true);
    try {
      const created = await recordCheckIn(user.id);
      await loadData();
      if (created) {
        toast.success("You have been checked in for this shift.");
        window.dispatchEvent(new CustomEvent("shift_data_changed"));
      } else {
        toast("No check-in recorded — you are already checked in or were on the previous shift.");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to check in");
    } finally {
      setCheckingIn(false);
    }
  };

  const handleStationClick = async (station: Station) => {
    setActiveStationId(station.id);
    setSelectedStatus(station.current_status);
    const initRemarks = station.remarks || "";
    setRemarks(initRemarks);
    setValue("remarks", initRemarks);
    setRemarksError(false);
    // Reset fault fields
    setFaultDescription("");
    setActionTaken("");
    setTimeDetected("");
    setFaultStatus("Open");
    setFaultPriority("Medium");
    setActiveFaultState(null);
    setActiveFaultTimeline([]);

    // Load existing active fault for this station
    const allFaults = await db.faults.list();
    const activeFault = allFaults.find(
      f => f.station_id === station.id && f.status !== "Resolved"
    );
    if (activeFault) {
      setActiveFaultState(activeFault);
      setFaultDescription(activeFault.description || "");
      setActionTaken(activeFault.action_taken || "");
      // Format time_detected for datetime-local input
      if (activeFault.time_detected) {
        const dt = new Date(activeFault.time_detected);
        const localISO = dt.toISOString().slice(0, 16);
        setTimeDetected(localISO);
      }
      setFaultStatus(activeFault.status || "Open");
      setFaultPriority((activeFault.priority as FaultPriority) || "Medium");

      try {
        const timeline = await db.faults.getTimeline(activeFault.id);
        setActiveFaultTimeline(timeline || []);
      } catch (err) {
        console.warn("Failed to fetch fault timeline:", err);
      }
    }
  };

  const handleStatusChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeStationId || !activeShift) return;

    try {
      // Determine effective station status based on fault status.
      // Custom (typed) statuses are always honored; the OK override only applies to predefined statuses.
      const customText = customStatus.trim();
      const usingCustomStatus = !STATUS_OPTIONS.some(o => o.value === selectedStatus);
      const effectiveStatus = usingCustomStatus
        ? ((customText || selectedStatus) as StationStatus)
        : ((faultStatus === "Resolved" || selectedStatus === "OK") ? "OK" : selectedStatus);

      // 1. Update the station status
      await db.stations.updateStatus(activeStationId, effectiveStatus, remarks);

      // 2. Log broadcast status history
      const statusLogs = JSON.parse(localStorage.getItem("shift_broadcast_status") || "[]");
      statusLogs.push({
        id: `bc-${Date.now()}`,
        shift_id: activeShift.id,
        station_id: activeStationId,
        status: effectiveStatus,
        remarks,
        updated_at: new Date().toISOString()
      });
      localStorage.setItem("shift_broadcast_status", JSON.stringify(statusLogs));

      // 3. Update or create fault entry
      if (effectiveStatus !== "OK") {
        // Check if there's already an active fault for this station
        const existingFaults = (await db.faults.list()).filter(
          f => f.station_id === activeStationId && f.status !== "Resolved"
        );
        if (existingFaults.length > 0) {
          await db.faults.update(
            existingFaults[0].id,
            {
              description: faultDescription,
              action_taken: actionTaken,
              time_detected: timeDetected ? new Date(timeDetected).toISOString() : undefined,
              status: faultStatus || "Open",
              priority: faultPriority || "Medium"
            },
            activeShift.incoming_staff_id
          );
        } else {
          await db.faults.create({
            shift_id: activeShift.id,
            station_id: activeStationId,
            description: faultDescription || remarks || "Fault reported",
            reported_by_id: activeShift.incoming_staff_id,
            action_taken: actionTaken,
            time_detected: timeDetected ? new Date(timeDetected).toISOString() : new Date().toISOString(),
            category: "Transmitter",
            priority: faultPriority || "Medium",
            status: faultStatus || "Open"
          });
        }
      } else {
        // If status is OK or fault is Resolved, resolve all active faults for this station
        const activeFaultsForStation = (await db.faults.list()).filter(
          f => f.station_id === activeStationId && f.status !== "Resolved"
        );
        for (const f of activeFaultsForStation) {
          await db.faults.update(
            f.id,
            {
              status: "Resolved",
              action_taken: actionTaken || remarks || "Resolved during broadcast status update"
            },
            activeShift.incoming_staff_id
          );
        }
      }

      toast.success("Broadcast station status updated successfully!");
      setShowSaveConfirm(true);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  // Section B record shows only duty engineers (Technicians) — no admins/supervisors
  const dutyAttendance = React.useMemo(
    () => attendance.filter(a => !a.is_absent && engineers.find(e => e.id === a.user_id)?.role === "Technician"),
    [attendance, engineers]
  );

  if (loading) {
    return <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">Loading active shift...</div>;
  }

  // Browsing technicians see a simplified view — no duty engineer data
  if (browsing) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground">
          <Eye className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-base">Browsing — No Duty Engineer</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            You&apos;re signed in as Just Browsing. Current Shift monitoring is only available for engineers on duty.
          </p>
        </div>
        <Link
          href="/handover"
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-white text-xs font-semibold rounded-lg shadow-sm"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> Go to Handover
        </Link>
      </div>
    );
  }

  if (!activeShift) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground">
          <UserX className="w-6 h-6" />
        </div>
        <div>
          <h3 className="font-bold text-base">No Shift Session Active</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            No active handover session. Please proceed to the handover portal to start the shift handover process.
          </p>
        </div>
        <Link
          href="/handover"
          className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-white text-xs font-semibold rounded-lg shadow-sm"
        >
          <ArrowRightLeft className="w-3.5 h-3.5" /> Go to Handover
        </Link>
      </div>
    );
  }

  const shiftUser = engineers.find(e => e.id === activeShift.incoming_staff_id);
  const currentAtt = attendance.find(a => a.user_id === activeShift.incoming_staff_id);
  const myAtt = user ? attendance.find(a => a.user_id === user.id) : undefined;

  return (
    <div className="space-y-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Active Shift Monitor</h2>
          <p className="text-xs text-muted-foreground mt-1">Section B & Section C logs for the current active rotation.</p>
        </div>
        <button
          onClick={() => router.push("/handover")}
          disabled={browsing}
          className="px-4 py-2 bg-primary hover:bg-primary/95 text-white font-semibold text-xs rounded-xl shadow-md cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title={browsing ? "Browsing session — handovers are not available" : undefined}
        >
          Proceed to Handover &amp; End Shift
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 & 2: Station Status Dashboard (Section C) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass border border-border/60 rounded-2xl p-5 md:p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold">Section C: Broadcast Channel Status</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Click a station card below to change its broadcast status or report a channel fault.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stations.map((station) => {
                const getStatusTheme = (s: StationStatus) => {
                  if (s === "OK") return "border-success/30 bg-success/10 dark:bg-success/5 hover:border-success/50";
                  if (s === "Fault" || s === "Maintenance") return "border-warning/30 bg-warning/10 dark:bg-warning/5 hover:border-warning/50";
                  return "border-destructive/30 bg-destructive/10 dark:bg-destructive/5 hover:border-destructive/50";
                };

                return (
                  <button
                    key={station.id}
                    onClick={() => { if (!browsing) handleStationClick(station); }}
                    disabled={browsing}
                    className={`p-4 rounded-xl border text-left transition-all ${getStatusTheme(station.current_status)} ${
                      activeStationId === station.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""
                    } ${browsing ? "cursor-default opacity-90" : ""}`}
                    title={browsing ? "Browsing session — status is view-only" : "Update station status"}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-white border border-border/50 overflow-hidden flex items-center justify-center shrink-0 p-1 shadow-xs">
                          {station.logo_url ? (
                            <img 
                              src={station.logo_url} 
                              alt={station.name} 
                              className="w-full h-full object-contain" 
                            />
                          ) : (
                            <span className="font-bold text-xs text-muted-foreground">{station.name.substring(0, 2)}</span>
                          )}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-foreground">{station.name}</h4>
                          <span className="text-[10px] text-foreground/60 dark:text-muted-foreground uppercase font-semibold">Health Check</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold my-2">
                      <span className={`w-2 h-2 rounded-full ${
                        station.current_status === "OK" ? "bg-success" : 
                        station.current_status === "Fault" || station.current_status === "Maintenance" ? "bg-warning" : "bg-destructive animate-pulse"
                      }`} />
                      <span className="capitalize">{station.current_status}</span>
                    </div>
                    <p className="text-[10px] text-foreground/60 dark:text-muted-foreground truncate">{station.remarks || "Broadcasting smoothly"}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form to Update selected station status — hidden in browsing sessions */}
          <AnimatePresence>
          {activeStationId && !browsing && (
            <motion.div
              key="status-form"
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                background: t.card,
                borderRadius: "16px",
                border: `2px solid ${t.info}40`,
                boxShadow: t.shadowLg,
                overflow: "hidden",
              }}
            >
              {/* Modal Header - Gradient */}
              <div style={{
                background: `linear-gradient(135deg, ${t.info}, ${t.info}cc)`,
                padding: "24px 32px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "44px", height: "44px", borderRadius: "12px",
                    background: "rgba(255,255,255,.2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Radio style={{ width: "22px", height: "22px", color: "#fff" }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.2 }}>
                      Update Broadcast Status
                    </h3>
                    <p style={{ fontSize: "13px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
                      {stations.find(s => s.id === activeStationId)?.name} — {customStatusLabel}
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!remarks?.trim()) {
                  setRemarksError(true);
                  toast.error("Please enter remarks before saving changes!");
                  return;
                }
                if (selectedStatus === CUSTOM_STATUS_VALUE && !customStatus.trim()) {
                  toast.error("Please enter a custom broadcast status.");
                  return;
                }
                setRemarksError(false);
                setSaving(true);
                try {
                  await handleStatusChangeSubmit(e);
                } finally {
                  setSaving(false);
                }
              }} style={{ padding: "24px 32px 32px" }}>

                {/* ⚠️ Ongoing Incident Context Banner & Quick Actions */}
                {activeFaultState && (
                  <div style={{
                    marginBottom: "20px", padding: "16px 20px", borderRadius: "12px",
                    background: `${t.warning}15`, border: `1px solid ${t.warning}40`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <TriangleAlert style={{ width: "16px", height: "16px", color: t.warning }} />
                        <span style={{ fontSize: "13px", fontWeight: 700, color: t.text }}>
                          Ongoing Incident Detected
                        </span>
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px",
                          background: `${t.warning}30`, color: t.warning, textTransform: "uppercase"
                        }}>
                          {activeFaultState.status}
                        </span>
                      </div>
                      <span style={{ fontSize: "11px", color: t.muted }}>
                        Reported: {new Date(activeFaultState.time_detected).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <p style={{ fontSize: "12px", color: t.text, fontWeight: 500, margin: "8px 0 0", lineHeight: 1.4 }}>
                      "{activeFaultState.description}"
                    </p>

                    {/* Quick Action Buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "12px", paddingTop: "12px", borderTop: `1px solid ${t.warning}25`, flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        Quick Actions:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedStatus("OK");
                          setFaultStatus("Resolved");
                          if (!actionTaken) setActionTaken("Restored to normal operation");
                          // Always clear remarks so technician enters a fresh resolution note
                          setRemarks("");
                          setValue("remarks", "");
                          setRemarksError(false);
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px",
                          fontSize: "12px", fontWeight: 600, color: t.success, background: t.successBg,
                          border: `1px solid ${t.success}40`, cursor: "pointer", transition: "all 0.15s",
                        }}
                      >
                        <CheckCircle2 style={{ width: "14px", height: "14px" }} />
                        Mark Resolved &amp; Restored
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setFaultStatus("Working");
                          if (selectedStatus === "OK") {
                            setSelectedStatus("Fault");
                            // Status moved away from OK — auto-fill the fault remark
                            applyStatusRemarks("Fault");
                          }
                          setIncidentExpanded(true);
                          if (!actionTaken) setActionTaken("Engineers troubleshooting incident");
                          // Keep existing remarks for ongoing fault states
                        }}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px",
                          fontSize: "12px", fontWeight: 600, color: t.warning, background: t.warningBg,
                          border: `1px solid ${t.warning}40`, cursor: "pointer", transition: "all 0.15s",
                        }}
                      >
                        <Clock style={{ width: "14px", height: "14px" }} />
                        Log In-Progress Progress
                      </button>
                    </div>

                    {/* Mini Timeline History */}
                    {activeFaultTimeline.length > 0 && (
                      <div style={{ marginTop: "10px", paddingTop: "10px", borderTop: `1px solid ${t.warning}25`, fontSize: "11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: t.muted, fontWeight: 600, marginBottom: "4px" }}>
                          <History style={{ width: "13px", height: "13px" }} /> Recent Incident Timeline:
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          {activeFaultTimeline.slice(-3).map((up, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", color: t.text2 }}>
                              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: t.warning, flexShrink: 0 }} />
                              <span style={{ fontWeight: 700 }}>{up.status}:</span>
                              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{up.action_taken || up.remarks || "Status updated"}</span>
                              <span style={{ fontSize: "10px", color: t.muted, fontFamily: "monospace" }}>{new Date(up.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Row 1: Status + Remarks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Broadcast Status Dropdown */}
                  <div className="space-y-2">
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>
                      Broadcast Status <span style={{ color: t.danger }}>*</span>
                    </label>
<select
  value={selectedStatus}
  onChange={(e) => {
    const val = e.target.value as StationStatus;
    if (val === CUSTOM_STATUS_VALUE) {
      setDraftCustomStatus(customStatus);
      setCustomModalOpen(true);
      return;
    }
    setSelectedStatus(val);
    if (val === "OK") {
      setCustomStatus("");
      setFaultStatus("Resolved");
    } else {
      setFaultStatus(prev => prev === "Resolved" ? "Open" : prev);
    }
    // Auto-fill the Remarks field with the text for the chosen status
    applyStatusRemarks(val);
  }}
  style={{
    width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
    border: `1px solid ${t.border}`, background: t.card, color: t.text,
    outline: "none", cursor: "pointer",
  }}
>
  {STATUS_OPTIONS.map(opt => (
    <option key={opt.value} value={opt.value}>{opt.label}</option>
  ))}
  {!isPredefinedStatus(selectedStatus) && (
    <option value={selectedStatus}>{customStatusLabel}</option>
  )}
  <option value={CUSTOM_STATUS_VALUE}>Custom Status</option>
</select>
                  </div>

                  {/* Remarks */}
                  <div className="space-y-2">
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>
                      Remarks <span style={{ color: t.danger }}>*</span>
                    </label>
                    <input
                      type="text"
                      name="remarks"
                      value={remarks}
                      onChange={(e) => {
                        setRemarks(e.target.value);
                        setValue("remarks", e.target.value, { shouldValidate: true });
                        if (e.target.value.trim()) setRemarksError(false);
                      }}
                      style={{
                        width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                        border: `1px solid ${remarksError || errors.remarks ? t.danger : t.border}`, background: t.card, color: t.text, outline: "none",
                      }}
                      placeholder={
                        selectedStatus === "OK"
                          ? "e.g. Transmitting at 99.7 MHz normally, signal clear"
                          : faultStatus === "Resolved"
                          ? "e.g. Replaced power cable; broadcast fully restored"
                          : "e.g. Audio silence on transmitter link; investigating site"
                      }
                    />
                    {(remarksError || errors.remarks) && (
                      <p style={{ fontSize: "11px", color: t.danger, marginTop: "4px", fontWeight: 600 }}>
                        <AlertCircle style={{ width: "14px", height: "14px", display: "inline-block", verticalAlign: "middle", marginRight: "4px" }} />
                        Remarks are required before saving changes.
                      </p>
                    )}
                  </div>
                </div>

                {/* Incident Report Section */}
                <AnimatePresence>
                {SHOW_INCIDENT && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div style={{
                      background: t.card,
                      borderRadius: "16px",
                      border: `2px solid ${t.warning}40`,
                      boxShadow: t.shadowLg,
                      overflow: "hidden",
                    }}>
                      {/* Incident Header */}
                      <button
                        type="button"
                        onClick={() => setIncidentExpanded(!incidentExpanded)}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "16px 24px", borderBottom: `1px solid ${t.border}`,
                          background: "transparent", border: "none", cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <div style={{
                            width: "36px", height: "36px", borderRadius: "10px",
                            background: `${t.warning}18`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            <TriangleAlert style={{ width: "18px", height: "18px", color: t.warning }} />
                          </div>
                          <div style={{ textAlign: "left" }}>
                            <p style={{ fontSize: "15px", fontWeight: 600, color: t.text, margin: 0, lineHeight: 1.3 }}>
                              SECTION D — ACTIVE FAULT / ACTIVITY
                            </p>
                            <p style={{ fontSize: "12px", color: t.muted, margin: "2px 0 0" }}>
                              Outgoing Staff logs fault details for handover
                            </p>
                          </div>
                        </div>
                        <motion.div animate={{ rotate: incidentExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                          <ChevronDown style={{ width: "20px", height: "20px", color: t.muted }} />
                        </motion.div>
                      </button>

                      {/* Incident Content */}
                      <AnimatePresence>
                      {incidentExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
<div style={{
                      padding: "24px 32px 32px",
                    }}>
                            {/* Section D: Active Fault / Activity */}
                            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {/* Describe Fault / Activity */}
                                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>
                                    Describe Fault / Activity <span style={{ color: t.danger }}>*</span>
                                  </label>
                                  <textarea
                                    value={faultDescription}
                                    onChange={(e) => { if (e.target.value.length <= 500) setFaultDescription(e.target.value); }}
                                    rows={4}
                                    style={{
                                      width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                                      border: `1px solid ${errors.faultDescription ? t.danger : t.border}`, background: t.card, color: t.text,
                                      outline: "none", resize: "none", minHeight: "120px",
                                    }}
                                    placeholder="Describe the fault or activity..."
                                  />
                                  {errors.faultDescription && (
                                    <p style={{ fontSize: "11px", color: t.danger, marginTop: "4px" }}><AlertCircle style={{ width: "14px", height: "14px", display: "inline-block", verticalAlign: "middle" }} />{errors.faultDescription.message}</p>
                                  )}
                                </div>

                                {/* Time Detected / Reported To You */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "5px" }}>
                                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                      Time Detected / Reported
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const now = new Date();
                                        const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                                        setTimeDetected(localISO);
                                      }}
                                      style={{
                                        fontSize: "10px", fontWeight: 700, padding: "3px 8px", borderRadius: "6px",
                                        color: t.info, background: t.infoBg, border: `1px solid ${t.info}40`,
                                        cursor: "pointer", letterSpacing: "0.03em",
                                      }}
                                    >
                                      ⏱ Now
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => { setDraftTimeDetected(timeDetected || ""); setTimeModalOpen(true); }}
                                    style={{
                                      width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                                      textAlign: "left", cursor: "pointer",
                                      border: `1px solid ${timeDetected ? t.info : t.border}`,
                                      background: t.card, color: timeDetected ? t.text : t.muted, outline: "none",
                                    }}
                                  >
                                    {timeDetected
                                      ? `✓ ${new Date(timeDetected).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`
                                      : "Tap to set time detected / reported"}
                                  </button>
                                </div>

                                {/* Action Taken */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>
                                    Action Taken
                                  </label>
                                  <input
                                    type="text"
                                    value={actionTaken}
                                    onChange={(e) => setActionTaken(e.target.value)}
                                    style={{
                                      width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                                      border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none",
                                    }}
                                    placeholder={
                                      faultStatus === "Resolved"
                                        ? "e.g., Switched to backup exciter and aligned dish"
                                        : faultStatus === "Working"
                                        ? "e.g., Power cycled transmitter, checking RSSI margin"
                                        : "e.g., Monitoring, Reset, Escalated to Senior Engineer"
                                    }
                                  />
                                </div>

                                {/* Priority */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>
                                    Fault Priority
                                  </label>
                                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                    {SEVERITY_OPTIONS.map(opt => (
                                      <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setFaultPriority(opt.value)}
                                        style={{
                                          flex: 1, minWidth: "60px",
                                          padding: "8px 10px",
                                          borderRadius: "8px",
                                          fontSize: "12px",
                                          fontWeight: 700,
                                          border: `2px solid ${faultPriority === opt.value ? (
                                            opt.value === "Critical" ? "#ef4444" :
                                            opt.value === "High" ? "#f97316" :
                                            opt.value === "Medium" ? "#eab308" :
                                            "#10b981"
                                          ) : t.border}`,
                                          background: faultPriority === opt.value ? (
                                            opt.value === "Critical" ? "rgba(239,68,68,0.15)" :
                                            opt.value === "High" ? "rgba(249,115,22,0.15)" :
                                            opt.value === "Medium" ? "rgba(234,179,8,0.15)" :
                                            "rgba(16,185,129,0.15)"
                                          ) : t.card2,
                                          color: faultPriority === opt.value ? (
                                            opt.value === "Critical" ? "#ef4444" :
                                            opt.value === "High" ? "#f97316" :
                                            opt.value === "Medium" ? "#eab308" :
                                            "#10b981"
                                          ) : t.muted,
                                          cursor: "pointer",
                                          transition: "all 0.15s",
                                          textAlign: "center",
                                        }}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {/* Status */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>
                                    Status
                                  </label>
                                  <select
                                    value={faultStatus}
                                    onChange={(e) => {
                                      const newFs = e.target.value as FaultStatus;
                                      setFaultStatus(newFs);
                                      if (newFs === "Resolved") {
                                        setSelectedStatus("OK");
                                        // Clear remarks to prompt fresh resolution note
                                        setRemarks("");
                                        setValue("remarks", "");
                                        setRemarksError(false);
                                      }
                                    }}
                                    style={{
                                      width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                                      border: `1px solid ${t.border}`, background: t.card, color: t.text,
                                      outline: "none", cursor: "pointer", appearance: "none",
                                    }}
                                  >
                                    {FAULT_STATUS_OPTIONS.map(s => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>

                {/* Action Buttons */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "12px", paddingTop: "20px", borderTop: `1px solid ${t.border}` }}>
                  <button
                    type="button"
                    onClick={() => { setActiveStationId(null); reset(); }}
                    style={{
                      padding: "10px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 500,
                      background: "transparent", color: t.muted, border: `1px solid ${t.border}`,
                      cursor: "pointer", transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = t.card2; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    style={{
                      display: "flex", alignItems: "center", gap: "8px", padding: "12px 28px", borderRadius: "12px",
                      fontSize: "14px", fontWeight: 600, color: "#fff", background: t.brand,
                      border: "none", cursor: saving ? "not-allowed" : "pointer", minHeight: "44px",
                      transition: "background 0.2s, transform 0.1s", opacity: saving ? 0.6 : 1,
                    }}
                  >
                    {saving ? (
                      <>
                        <span style={{ width: "16px", height: "16px", border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save style={{ width: "16px", height: "16px" }} />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
          </AnimatePresence>
        </div>

        {/* Column 3: Attendance Details & Active Shift Log info (Section B) */}
        <div className="space-y-6">
          <div
            className="rounded-2xl p-5 md:p-6 text-xs space-y-4"
            style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
          >
            <div style={{ borderBottom: `1px solid ${t.border}`, paddingBottom: 12 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Section B: Duty Attendance Record</h3>
              <p style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>Automated timestamp logs for engineering rotations.</p>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span style={{ color: t.muted }}>Duty Pair Team:</span>
                <DutyPairBadge name={shiftUser?.name} size="sm" variant="badge" />
              </div>

              {/* My check-in status — technicians check in explicitly */}
              {user?.role === "Technician" && (
                <div
                  className="p-3 rounded-xl"
                  style={{ background: myAtt ? t.successBg : t.warningBg, border: `1px solid ${myAtt ? t.success : t.warning}33` }}
                >
                  {myAtt ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-bold uppercase" style={{ color: t.success, fontSize: 10 }}>
                        <UserCheck className="w-3.5 h-3.5" /> You are checked in
                      </span>
                      <span className="font-mono" style={{ color: t.text2, fontSize: 10 }}>
                        {new Date(myAtt.time_reported).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span style={{ color: t.warning, fontSize: 11, fontWeight: 600 }}>
                        {browsing ? "Browsing session — check-in is not recorded" : "You haven&apos;t checked in for this shift"}
                      </span>
                      {!browsing && (
                      <button
                        type="button"
                        onClick={handleCheckIn}
                        disabled={checkingIn}
                        style={{
                          display: "flex", alignItems: "center", gap: "6px", padding: "8px 14px", borderRadius: "10px",
                          fontSize: "11px", fontWeight: 700, color: "#fff", background: t.brand,
                          border: "none", cursor: checkingIn ? "not-allowed" : "pointer", opacity: checkingIn ? 0.6 : 1,
                          transition: "background 0.2s", whiteSpace: "nowrap",
                        }}
                      >
                        {checkingIn ? (
                          <>
                            <span style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,.3)", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 1s linear infinite", display: "inline-block" }} />
                            Checking in...
                          </>
                        ) : (
                          <>
                            <Play style={{ width: "13px", height: "13px" }} />
                            Check In
                          </>
                        )}
                      </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Pair Member Attendance List */}
              <div className="space-y-1.5 pt-1">
                <span className="block" style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: t.muted }}>Engineers On Duty ({dutyAttendance.length}):</span>
                {dutyAttendance.length === 0 ? (
                  <div className="italic" style={{ fontSize: 11, color: t.muted }}>No active attendance logged</div>
                ) : (
                  dutyAttendance.map((attRecord) => {
                    const engUser = engineers.find(e => e.id === attRecord.user_id);
                    return (
                      <div key={attRecord.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: t.card2, border: `1px solid ${t.border}`, fontSize: 11 }}>
                        <span className="font-semibold flex items-center gap-1.5" style={{ color: t.text }}>
                          <UserCheck className="w-3.5 h-3.5" style={{ color: t.success }} />
                          <span className="capitalize">{engUser ? engUser.email.split("@")[0] : "Engineer"}</span>
                          <span className="font-normal" style={{ fontSize: 10, color: t.muted }}>({engUser?.role || "Duty"})</span>
                        </span>
                        <span className="font-mono" style={{ color: t.text2 }}>
                          {new Date(attRecord.time_reported).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="flex justify-between items-center pt-2">
                <span style={{ color: t.muted }}>Shift Started:</span>
                <span className="font-semibold" style={{ color: t.text }}>
                  {new Date(activeShift.start_time).toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span style={{ color: t.muted }}>Lateness Status:</span>
                <span
                  className="px-2 py-0.5 rounded-full font-bold"
                  style={{
                    fontSize: 9,
                    background: currentAtt?.is_absent ? t.dangerBg : currentAtt?.is_late ? t.dangerBg : t.successBg,
                    color: currentAtt?.is_absent ? t.danger : currentAtt?.is_late ? t.danger : t.success,
                    border: `1px solid ${currentAtt?.is_absent || currentAtt?.is_late ? t.danger : t.success}33`
                  }}
                >
                  {currentAtt?.is_absent ? "ABSENT" : currentAtt?.is_late ? "LATE ARRIVAL" : "ON TIME"}
                </span>
              </div>

              {currentAtt?.is_absent && (
                <div className="p-3 rounded-lg space-y-1" style={{ background: t.dangerBg, border: `1px solid ${t.danger}33` }}>
                  <span className="uppercase font-bold" style={{ fontSize: 9, color: t.danger }}>Supervisor Marked Absent:</span>
                  <p className="leading-normal italic" style={{ fontSize: 10, color: t.muted }}>
                    {currentAtt.absent_marked_by ? `Authorized by ${currentAtt.absent_marked_by}` : "Authorized absence"}
                    {currentAtt.absent_marked_at ? ` at ${new Date(currentAtt.absent_marked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                  </p>
                </div>
              )}

              {currentAtt?.is_late && (
                <div className="p-3 rounded-lg space-y-1" style={{ background: t.dangerBg, border: `1px solid ${t.danger}33` }}>
                  <span className="uppercase font-bold" style={{ fontSize: 9, color: t.danger }}>Lateness Reason Logged:</span>
                  <p className="leading-normal italic" style={{ fontSize: 10, color: t.muted }}>
                    &ldquo;{currentAtt.late_reason || "No explanation provided"}&rdquo;
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Shift Notes / Log Details (Section A Summary) */}
          <div
            className="rounded-2xl p-5 md:p-6 text-xs space-y-3"
            style={{ background: t.card, border: `1px solid ${t.border}`, boxShadow: t.shadow }}
          >
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: t.text }}>Section A: Shift Notes</h3>
              <p style={{ fontSize: 10, color: t.muted, marginTop: 2 }}>Initial briefing notes logged at shift launch.</p>
            </div>
            <p
              className="leading-normal whitespace-pre-line p-3 rounded-lg"
              style={{ fontSize: 11, color: t.muted, background: t.card2, border: `1px solid ${t.border}` }}
            >
              {activeShift.notes || "No initial briefing notes entered."}
            </p>
          </div>
        </div>
      </div>

      {/* Save Confirmation Modal — modal only closes when technician clicks OK */}
    <AnimatePresence>
    {showSaveConfirm && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(2,6,23,.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: t.card, borderRadius: "16px", border: `1px solid ${t.border}`,
            boxShadow: t.shadowLg, width: "100%", maxWidth: "380px", overflow: "hidden",
          }}
        >
          <div style={{ padding: "28px 28px 0", textAlign: "center" }}>
            <div style={{
              width: "52px", height: "52px", margin: "0 auto", borderRadius: "50%",
              background: t.successBg, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <CheckCircle2 style={{ width: "26px", height: "26px", color: t.success }} />
            </div>
            <h4 style={{ fontSize: "16px", fontWeight: 700, color: t.text, margin: "14px 0 6px" }}>
              Broadcast Status Updated
            </h4>
            <p style={{ fontSize: "13px", fontWeight: 600, color: t.text2, margin: 0, lineHeight: 1.5 }}>
              {stations.find(s => s.id === activeStationId)?.name} — {customStatusLabel}
            </p>
            <p style={{ fontSize: "12px", color: t.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
              Your changes have been saved. Click OK to close.
            </p>
          </div>
          <div style={{ padding: "20px 28px 28px" }}>
            <button
              type="button"
              onClick={() => { setShowSaveConfirm(false); setActiveStationId(null); reset(); }}
              style={{
                width: "100%", padding: "12px 0", borderRadius: "10px", fontSize: "14px", fontWeight: 700,
                color: "#fff", background: t.brand, border: "none", cursor: "pointer", transition: "background 0.2s",
              }}
            >
              OK
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
    </AnimatePresence>

    {/* Time Detected / Reported Picker Modal */}
    <AnimatePresence>
    {timeModalOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed", inset: 0, zIndex: 70,
          background: "rgba(2,6,23,.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: t.card, borderRadius: "16px", border: `1px solid ${t.border}`,
            boxShadow: t.shadowLg, width: "100%", maxWidth: "400px", overflow: "hidden",
          }}
        >
          <div style={{
            background: `linear-gradient(135deg, ${t.info}, ${t.info}cc)`,
            padding: "20px 24px",
          }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.3 }}>
              Time Detected / Reported
            </p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Enter the time the fault was detected or reported.
            </p>
          </div>

          <div style={{ padding: "24px 24px 0" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="date"
                value={draftTimeDetected ? draftTimeDetected.slice(0, 10) : ""}
                onChange={(e) => {
                  const datePart = e.target.value;
                  const timePart = draftTimeDetected ? draftTimeDetected.slice(11, 16) : new Date().toTimeString().slice(0, 5);
                  setDraftTimeDetected(`${datePart}T${timePart}`);
                }}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: "8px", fontSize: "13px",
                  border: `1px solid ${t.border}`, background: t.card2, color: t.text,
                  outline: "none", cursor: "pointer",
                }}
              />
              <input
                type="time"
                value={draftTimeDetected ? draftTimeDetected.slice(11, 16) : ""}
                onChange={(e) => {
                  const timePart = e.target.value;
                  const datePart = draftTimeDetected ? draftTimeDetected.slice(0, 10) : new Date().toISOString().slice(0, 10);
                  setDraftTimeDetected(`${datePart}T${timePart}`);
                }}
                style={{
                  width: "120px", padding: "10px 12px", borderRadius: "8px", fontSize: "13px",
                  border: `1px solid ${t.border}`, background: t.card2, color: t.text,
                  outline: "none", cursor: "pointer",
                }}
              />
            </div>

            {draftTimeDetected && (
              <p style={{ fontSize: "11px", color: t.info, marginTop: "8px", fontWeight: 600 }}>
                ✓ {new Date(draftTimeDetected).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                const now = new Date();
                const localISO = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                setDraftTimeDetected(localISO);
              }}
              style={{
                marginTop: "10px", fontSize: "10px", fontWeight: 700, padding: "6px 12px", borderRadius: "6px",
                color: t.info, background: t.infoBg, border: `1px solid ${t.info}40`,
                cursor: "pointer", letterSpacing: "0.03em",
              }}
            >
              ⏱ Now
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", padding: "24px" }}>
            <button
              type="button"
              onClick={() => setTimeModalOpen(false)}
              style={{
                padding: "10px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 500,
                background: "transparent", color: t.muted, border: `1px solid ${t.border}`, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftTimeDetected}
              onClick={() => {
                if (!draftTimeDetected) return;
                setTimeDetected(draftTimeDetected);
                setTimeModalOpen(false);
              }}
              style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", borderRadius: "12px",
                fontSize: "13px", fontWeight: 700, color: "#fff", background: t.info,
                border: "none", cursor: draftTimeDetected ? "pointer" : "not-allowed", opacity: draftTimeDetected ? 1 : 0.5,
              }}
            >
              <CheckCircle2 style={{ width: "15px", height: "15px" }} />
              OK
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
    </AnimatePresence>

    {/* Custom Status Confirmation Modal */}
    <AnimatePresence>
    {customModalOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: "fixed", inset: 0, zIndex: 80,
          background: "rgba(2,6,23,.55)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "20px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          style={{
            background: t.card, borderRadius: "16px", border: `1px solid ${t.border}`,
            boxShadow: t.shadowLg, width: "100%", maxWidth: "400px", overflow: "hidden",
          }}
        >
          <div style={{
            background: `linear-gradient(135deg, ${t.brand}, ${t.brand}cc)`,
            padding: "20px 24px",
          }}>
            <p style={{ fontSize: "15px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.3 }}>
              Custom Broadcast Status
            </p>
            <p style={{ fontSize: "12px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Type your own status for this station.
            </p>
          </div>

          <div style={{ padding: "24px 24px 0" }}>
            <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "6px" }}>
              Broadcast Status <span style={{ color: t.danger }}>*</span>
            </label>
            <input
              type="text"
              value={draftCustomStatus}
              onChange={(e) => setDraftCustomStatus(e.target.value)}
              placeholder="e.g. Testing on standby transmitter"
              autoFocus
              style={{
                width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                border: `1px solid ${t.border}`, background: t.card2, color: t.text, outline: "none",
              }}
            />
            {draftCustomStatus.trim() && (
              <p style={{ fontSize: "11px", color: t.success, marginTop: "8px", fontWeight: 600 }}>
                ✓ Will be saved as: &ldquo;{draftCustomStatus.trim()}&rdquo;
              </p>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", padding: "24px" }}>
            <button
              type="button"
              onClick={() => setCustomModalOpen(false)}
              style={{
                padding: "10px 20px", borderRadius: "12px", fontSize: "13px", fontWeight: 500,
                background: "transparent", color: t.muted, border: `1px solid ${t.border}`, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draftCustomStatus.trim()}
              onClick={() => {
                const v = draftCustomStatus.trim();
                if (!v) return;
                setCustomStatus(v);
                setSelectedStatus(v as StationStatus);
                // Custom statuses have no preset text — leave Remarks for the technician to fill
                setRemarks("");
                setValue("remarks", "", { shouldValidate: true });
                setRemarksError(false);
                setCustomModalOpen(false);
              }}
              style={{
                display: "flex", alignItems: "center", gap: "8px", padding: "10px 24px", borderRadius: "12px",
                fontSize: "13px", fontWeight: 700, color: "#fff", background: t.brand,
                border: "none", cursor: draftCustomStatus.trim() ? "pointer" : "not-allowed",
                opacity: draftCustomStatus.trim() ? 1 : 0.5,
              }}
            >
              <CheckCircle2 style={{ width: "15px", height: "15px" }} />
              OK
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
    </AnimatePresence>
    </div>
  );
}

