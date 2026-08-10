"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { db } from "@/lib/firestore";
import { Station, Fault, User, Shift, FaultStatus, FaultPriority, FaultUpdate, Attendance } from "@/lib/mock-db";
import { AIService } from "@/lib/ai";
import { VoiceNotes } from "@/components/voice-notes";
import { PhotoAnnotator } from "@/components/photo-annotator";
import { 
  AlertTriangle, Check, CheckCircle2, ShieldAlert, Cpu, Sparkles, Clock, 
  MessageSquare, UserCheck, Plus, Filter, Search, User as UserIcon, X, Paperclip,
  Download, FileText, Calendar, ChevronUp, ChevronDown, Eye, Edit, Trash2, Flag, Mail
} from "lucide-react";
import toast from "react-hot-toast";
import { formatPairName, getAssignableStaffTeams } from "@/lib/pair-utils";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { useAuth } from "@/components/auth-context";
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

function FaultsContent() {
  const t = useThemeColors();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const browsing = useBrowsingMode() && user?.role === "Technician";
  
  // Params
  const queryId = searchParams.get("id");
  const queryAction = searchParams.get("action");
  const queryAssigned = searchParams.get("assigned");

  // DB States
  const [stations, setStations] = React.useState<Station[]>([]);
  const [faults, setFaults] = React.useState<Fault[]>([]);
  const [engineers, setEngineers] = React.useState<User[]>([]);
  const [timeline, setTimeline] = React.useState<FaultUpdate[]>([]);
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [attendance, setAttendance] = React.useState<Attendance[]>([]);

  // Technicians marked absent for the active shift — never assignable
  const absentEngineerIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (activeShift) {
      for (const a of attendance) {
        if (a.shift_id === activeShift.id && a.is_absent) ids.add(a.user_id);
      }
    }
    return ids;
  }, [attendance, activeShift]);
  const availableEngineers = React.useMemo(
    () => engineers.filter(u => !absentEngineerIds.has(u.id)),
    [engineers, absentEngineerIds]
  );

  // Page layout state
  const [selectedFault, setSelectedFault] = React.useState<Fault | null>(null);
  const [showNewForm, setShowNewForm] = React.useState(queryAction === "new");

  // Filters — ?assigned=1 (from the duty banner) opens filtered to "Assigned to me"
  const [statusFilter, setStatusFilter] = React.useState<string>("All");
  const [priorityFilter, setPriorityFilter] = React.useState<string>("All");
  const [categoryFilter, setCategoryFilter] = React.useState<string>("All");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>(() =>
    queryAssigned === "1" ? (db.auth.getUser()?.id || "All") : "All"
  );
  const [dateRangeFilter, setDateRangeFilter] = React.useState<{from: string, to: string}>({from: "", to: ""});
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);
  const [showBulkActions, setShowBulkActions] = React.useState(false);
  const [selectedFaultIds, setSelectedFaultIds] = React.useState<string[]>([]);

  // New Fault Form State
  const [newStationId, setNewStationId] = React.useState("");
  const [newCategory, setNewCategory] = React.useState("Transmitter");
  const [newDesc, setNewDesc] = React.useState("");
  const [newPriority, setNewPriority] = React.useState<FaultPriority>("Medium");
  const [newAssigneeId, setNewAssigneeId] = React.useState("");
  const [annotatedFile, setAnnotatedFile] = React.useState<string | null>(null);

  // Update Fault Form State
  const [updateStatus, setUpdateStatus] = React.useState<FaultStatus>("Open");
  const [updateAction, setUpdateAction] = React.useState("");
  const [updating, setUpdating] = React.useState(false);

  // AI suggestions state
  const [aiSuggestions, setAiSuggestions] = React.useState<any | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  React.useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    const onVisible = () => { if (document.visibilityState === "visible") loadData(); };
    const onStorage = (e: StorageEvent) => { if (e.key?.startsWith("shift_")) loadData(); };
    const onShiftDataChanged = () => loadData();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    window.addEventListener("shift_data_changed", onShiftDataChanged);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("shift_data_changed", onShiftDataChanged);
    };
  }, []);

  React.useEffect(() => {
    if (queryId && faults.length > 0) {
      const fault = faults.find(f => f.id === queryId);
      if (fault) {
        handleSelectFault(fault);
      }
    }
  }, [queryId, faults]);

  React.useEffect(() => {
    setShowNewForm(queryAction === "new");
  }, [queryAction]);

  const loadData = async () => {
    const st = await db.stations.list();
    setStations(st);
    const fl = await db.faults.list();
    setFaults(fl);
    const eng = await db.users.list();
    setEngineers(eng);
    const as = await db.shifts.getActive();
    setActiveShift(as);
    const att = as ? await db.attendance.getForShift(as.id) : [];
    setAttendance(att);
  };

  const handleSelectFault = async (fault: Fault) => {
    setSelectedFault(fault);
    setUpdateStatus(fault.status);
    setUpdateAction(fault.action_taken || "");
    setAiSuggestions(null); // Clear suggestions

    // Load timeline
    const tl = await db.faults.getTimeline(fault.id);
    setTimeline(tl);
  };

  const handleCreateFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStationId || !newDesc.trim()) {
      toast.error("Please fill in the required fields");
      return;
    }

    const currentShift = await db.shifts.getActive();
    const reporterId = currentShift?.incoming_staff_id || "33333333-3333-3333-3333-333333333302";

    try {
      const created = await db.faults.create({
        shift_id: currentShift?.id,
        station_id: newStationId,
        category: newCategory,
        description: newDesc,
        reported_by_id: reporterId,
        priority: newPriority,
        action_taken: "Reported new incident",
        assigned_engineer_id: newAssigneeId || undefined,
        status: "Open"
      });

      // Save annotated photo as attachment if exists
      if (annotatedFile) {
        const currentAttachments = JSON.parse(localStorage.getItem("shift_attachments") || "[]");
        currentAttachments.push({
          id: `attach-${Date.now()}`,
          parent_type: "Fault",
          parent_id: created.id,
          file_name: "fault-annotation.png",
          file_url: annotatedFile,
          file_type: "image/png",
          uploaded_by_id: reporterId,
          created_at: new Date().toISOString()
        });
        localStorage.setItem("shift_attachments", JSON.stringify(currentAttachments));
      }

      toast.success("Incident fault logged successfully!");
      setShowNewForm(false);
      setNewDesc("");
      setAnnotatedFile(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to log fault");
    }
  };

  const handleUpdateFault = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFault) return;

    if (!updateAction?.trim()) {
      toast.error("Please enter actions taken or resolution comments before saving!");
      return;
    }

    setUpdating(true);
    try {
      const currentShift = await db.shifts.getActive();
      const userId = currentShift?.incoming_staff_id || "33333333-3333-3333-3333-333333333302";

      const updated = await db.faults.update(
        selectedFault.id,
        {
          status: updateStatus,
          action_taken: updateAction
        },
        userId
      );

      toast.success("Fault record updated successfully!");
      handleSelectFault(updated);
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to update fault");
    } finally {
      setUpdating(false);
    }
  };

  const handleTriggerAI = () => {
    if (!selectedFault) return;
    setAiLoading(true);
    setTimeout(() => {
      const res = AIService.getFaultSuggestions(selectedFault.category, selectedFault.description);
      setAiSuggestions(res);
      setAiLoading(false);
      toast.success("Diagnostic resolution checklist generated!");
    }, 800);
  };

  // Filtered faults list is defined below after all state/derived values

  const getPriorityColor = (p: FaultPriority) => {
    switch (p) {
      case "Critical":
        return "bg-destructive/15 text-destructive border-destructive/25";
      case "High":
        return "bg-orange-500/10 text-orange-400 border-orange-500/25";
      case "Medium":
        return "bg-amber-500/10 text-amber-400 border-amber-500/25";
      case "Low":
        return "bg-zinc-500/15 text-zinc-400 border-zinc-500/25";
    }
  };

  const getStatusColor = (s: FaultStatus) => {
    switch (s) {
      case "Resolved":
        return "bg-success/15 text-success border-success/20";
      case "Working":
        return "bg-primary/15 text-primary border-primary/20";
      case "Monitoring":
        return "bg-info/15 text-info border-info/20";
      case "Escalated":
        return "bg-destructive/15 text-destructive border-destructive/20";
      default:
        return "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
    }
  };

  // Retrieve attachments
  const attachments = JSON.parse(typeof window !== "undefined" ? (localStorage.getItem("shift_attachments") || "[]") : "[]")
    .filter((a: any) => a.parent_type === "Fault" && a.parent_id === selectedFault?.id);

  // Summary stats
  const activeFaultsList = faults.filter(f => f.status !== "Resolved");
  const criticalCount = activeFaultsList.filter(f => f.priority === "Critical").length;
  const highCount = activeFaultsList.filter(f => f.priority === "High").length;
  const mediumCount = activeFaultsList.filter(f => f.priority === "Medium").length;
  const lowCount = activeFaultsList.filter(f => f.priority === "Low").length;
  const overdueCount = activeFaultsList.filter(f => {
    if (f.resolved_time) return false;
    const detected = new Date(f.time_detected);
    const daysSince = (Date.now() - detected.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 1;
  }).length;
  const resolvedToday = faults.filter(f => {
    if (!f.resolved_time) return false;
    const resolved = new Date(f.resolved_time);
    const today = new Date();
    return resolved.toDateString() === new Date().toDateString();
  }).length;

  // Filter faults list
  const filteredFaults = faults.filter(fault => {
    const station = stations.find(s => s.id === fault.station_id);
    const reporter = engineers.find((u) => u.id === fault.reported_by_id);
    const assignee = engineers.find((u) => u.id === fault.assigned_engineer_id);

    const qRaw = searchQuery.toLowerCase().trim();
    let matchesSearch = true;

    if (qRaw) {
      const blob = [
        fault.description || "",
        fault.category || "",
        fault.action_taken || "",
        station?.name || "",
        reporter?.name || "",
        formatPairName(reporter),
        reporter?.email || "",
        assignee?.name || "",
        formatPairName(assignee),
        assignee?.email || "",
      ].join(" ").toLowerCase();

      if (blob.includes(qRaw)) {
        matchesSearch = true;
      } else {
        const qTokens = qRaw.split(/[\s&,/]+/).filter((tok) => tok.length > 1);
        matchesSearch = qTokens.length > 0 && qTokens.every((tok) => blob.includes(tok));
      }
    }

    const matchesStatus = statusFilter === "All" || fault.status === statusFilter;
    const matchesPriority = priorityFilter === "All" || fault.priority === priorityFilter;
    const matchesCategory = categoryFilter === "All" || fault.category === categoryFilter;
    const matchesAssignee = assigneeFilter === "All" || fault.assigned_engineer_id === assigneeFilter;

    let matchesDateRange = true;
    if (dateRangeFilter.from || dateRangeFilter.to) {
      const detected = new Date(fault.time_detected);
      if (dateRangeFilter.from && detected < new Date(dateRangeFilter.from)) matchesDateRange = false;
      if (dateRangeFilter.to && detected > new Date(dateRangeFilter.to)) matchesDateRange = false;
    }

    return matchesSearch && matchesStatus && matchesPriority && matchesCategory && matchesAssignee && matchesDateRange;
  });

  // Bulk actions handlers
  const toggleFaultSelection = (faultId: string) => {
    setSelectedFaultIds(prev => prev.includes(faultId) 
      ? prev.filter(id => id !== faultId) 
      : [...prev, faultId]);
  };

  const selectAllFiltered = () => {
    setSelectedFaultIds(filteredFaults.map(f => f.id));
  };

  const clearSelection = () => {
    setSelectedFaultIds([]);
  };

  const bulkUpdateStatus = async (newStatus: FaultStatus) => {
    if (selectedFaultIds.length === 0) return;
    try {
      const currentShift = await db.shifts.getActive();
      const userId = currentShift?.incoming_staff_id || "33333333-3333-3333-3333-333333333302";
      for (const id of selectedFaultIds) {
        await db.faults.update(id, { status: newStatus }, userId);
      }
      toast.success(`${selectedFaultIds.length} faults updated to ${newStatus}`);
      clearSelection();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Bulk update failed");
    }
  };

  const bulkAssignEngineer = async (engineerId: string) => {
    if (selectedFaultIds.length === 0) return;
    try {
      const currentShift = await db.shifts.getActive();
      const userId = currentShift?.incoming_staff_id || "33333333-3333-3333-3333-333333333302";
      for (const id of selectedFaultIds) {
        await db.faults.update(id, { assigned_engineer_id: engineerId }, userId);
      }
      toast.success(`${selectedFaultIds.length} faults assigned`);
      clearSelection();
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Bulk assign failed");
    }
  };

  const exportToCSV = () => {
    const headers = ["ID", "Station", "Category", "Description", "Priority", "Status", "Assigned To", "Detected", "Resolved", "Action Taken"];
    const rows = filteredFaults.map(fault => {
      const station = stations.find(s => s.id === fault.station_id);
      const assignee = engineers.find(u => u.id === fault.assigned_engineer_id);
      return [
        fault.id,
        station?.name || "",
        fault.category || "",
        `"${(fault.description || "").replace(/"/g, '""')}"`,
        fault.priority,
        fault.status,
        assignee ? formatPairName(assignee.name) : "",
        new Date(fault.time_detected).toISOString(),
        fault.resolved_time || "",
        `"${(fault.action_taken || "").replace(/"/g, '""')}"`
      ].join(",");
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `faults-export-${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Faults exported to CSV");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-left">
      {/* Column 1 & 2: Fault list and Filters */}
      <div className="lg:col-span-2 space-y-4">
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: "16px", padding: "20px 24px", boxShadow: t.shadow }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight" style={{ color: t.text }}>SECTION D — FAULT / ACTIVITY</h2>
              <p className="text-xs mt-0.5" style={{ color: t.muted }}>Log of faults, activities, and engineering updates for shift handover.</p>
            </div>
            {browsing ? (
              <span className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl"
                style={{ background: t.warningBg, color: t.warning, border: `1px solid ${t.warning}40` }}
              >
                <Eye className="w-4 h-4" /> Browsing — viewing only
              </span>
            ) : (
            <button
              onClick={() => {
                setShowNewForm(true);
                setSelectedFault(null);
              }}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl cursor-pointer"
              style={{ background: t.brand, color: "#fff", boxShadow: t.shadow }}
            >
              <Plus className="w-4 h-4" /> Report Fault
            </button>
            )}
          </div>
        </div>

        {/* Summary Stats Cards — one per fault priority + overdue + resolved, matching the fault system */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
          <div style={{ background: t.card, border: `2px solid ${t.danger}40`, borderRadius: "14px", padding: "16px", boxShadow: t.shadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Critical</span>
              <AlertTriangle style={{ width: "18px", height: "18px", color: t.danger }} />
            </div>
            <p style={{ fontSize: "24px", fontWeight: 700, color: t.danger, margin: "4px 0 0" }}>{criticalCount}</p>
            <p style={{ fontSize: "10px", color: t.muted, marginTop: "2px" }}>Active faults</p>
          </div>
          <div style={{ background: t.card, border: `2px solid ${t.warning}40`, borderRadius: "14px", padding: "16px", boxShadow: t.shadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>High Priority</span>
              <Flag style={{ width: "18px", height: "18px", color: t.warning }} />
            </div>
            <p style={{ fontSize: "24px", fontWeight: 700, color: t.warning, margin: "4px 0 0" }}>{highCount}</p>
            <p style={{ fontSize: "10px", color: t.muted, marginTop: "2px" }}>Active faults</p>
          </div>
          <div style={{ background: t.card, border: "2px solid #F59E0B40", borderRadius: "14px", padding: "16px", boxShadow: t.shadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Medium Priority</span>
              <ChevronUp style={{ width: "18px", height: "18px", color: "#F59E0B" }} />
            </div>
            <p style={{ fontSize: "24px", fontWeight: 700, color: "#F59E0B", margin: "4px 0 0" }}>{mediumCount}</p>
            <p style={{ fontSize: "10px", color: t.muted, marginTop: "2px" }}>Active faults</p>
          </div>
          <div style={{ background: t.card, border: `2px solid ${t.info}40`, borderRadius: "14px", padding: "16px", boxShadow: t.shadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Low Priority</span>
              <ChevronDown style={{ width: "18px", height: "18px", color: t.info }} />
            </div>
            <p style={{ fontSize: "24px", fontWeight: 700, color: t.info, margin: "4px 0 0" }}>{lowCount}</p>
            <p style={{ fontSize: "10px", color: t.muted, marginTop: "2px" }}>Active faults</p>
          </div>
          <div style={{ background: t.card, border: `2px solid ${t.danger}40`, borderRadius: "14px", padding: "16px", boxShadow: t.shadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Overdue</span>
              <Clock style={{ width: "18px", height: "18px", color: t.danger }} />
            </div>
            <p style={{ fontSize: "24px", fontWeight: 700, color: t.danger, margin: "4px 0 0" }}>{overdueCount}</p>
            <p style={{ fontSize: "10px", color: t.muted, marginTop: "2px" }}>Past due date</p>
          </div>
          <div style={{ background: t.card, border: `2px solid ${t.success}40`, borderRadius: "14px", padding: "16px", boxShadow: t.shadow }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "10px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Resolved Today</span>
              <Check style={{ width: "18px", height: "18px", color: t.success }} />
            </div>
            <p style={{ fontSize: "24px", fontWeight: 700, color: t.success, margin: "4px 0 0" }}>{resolvedToday}</p>
            <p style={{ fontSize: "10px", color: t.muted, marginTop: "2px" }}>Resolved faults</p>
          </div>
        </div>

        {/* Filters Panel */}
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: "16px", padding: "16px 20px", boxShadow: t.shadow }}>
          <div className="relative flex-1 flex items-center">
            <Search className="absolute left-2.5 w-4 h-4" style={{ color: t.muted }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, outline: "none" }}
              className="w-full pl-9 pr-4 py-1.5 text-xs placeholder:"
              placeholder="Search description, category, or station..."
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text }}
              className="px-2.5 py-1.5 text-xs"
            >
              <option value="All">All Statuses</option>
              <option value="Open">Open</option>
              <option value="Working">Working</option>
              <option value="Monitoring">Monitoring</option>
              <option value="Escalated">Escalated</option>
              <option value="Resolved">Resolved</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text }}
              className="px-2.5 py-1.5 text-xs"
            >
              <option value="All">All Priorities</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
              <option value="Critical">Critical</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text }}
              className="px-2.5 py-1.5 text-xs"
            >
              <option value="All">All Categories</option>
              <option value="Transmitter">Transmitter</option>
              <option value="Microwave Link">Microwave Link</option>
              <option value="Studio Console">Studio Console</option>
              <option value="Power Supply">Power Supply</option>
              <option value="Telecom / Fiber">Telecom / Fiber</option>
            </select>

            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text }}
              className="px-2.5 py-1.5 text-xs"
            >
              <option value="All">All Engineers</option>
              <option value="Unassigned">Unassigned</option>
              {getAssignableStaffTeams(availableEngineers).map(team => (
                <option key={team.pairName} value={team.users[0].id}>{team.formattedName}</option>
              ))}
            </select>

            <div className="flex gap-1.5">
              <input
                type="date"
                value={dateRangeFilter.from}
                onChange={(e) => setDateRangeFilter(prev => ({...prev, from: e.target.value}))}
                style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, outline: "none" }}
                className="px-2.5 py-1.5 text-xs"
                placeholder="From"
              />
              <input
                type="date"
                value={dateRangeFilter.to}
                onChange={(e) => setDateRangeFilter(prev => ({...prev, to: e.target.value}))}
                style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, outline: "none" }}
                className="px-2.5 py-1.5 text-xs"
                placeholder="To"
              />
            </div>

            <button
              onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
              style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.muted }}
              className="px-2.5 py-1.5 text-xs hover:opacity-80 transition-opacity"
            >
              {showAdvancedFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

{showBulkActions && !browsing && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs" style={{ color: t.muted }}>{selectedFaultIds.length} selected</span>
                <select
                  onChange={(e) => bulkUpdateStatus(e.target.value as FaultStatus)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text }}
                  className="px-2 py-1 text-xs"
                  defaultValue=""
                >
                  <option value="" disabled>Update Status...</option>
                  <option value="Open">Open</option>
                  <option value="Working">Working</option>
                  <option value="Monitoring">Monitoring</option>
                  <option value="Escalated">Escalated</option>
                  <option value="Resolved">Resolved</option>
                </select>
                <select
                  onChange={(e) => bulkAssignEngineer(e.target.value)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text }}
                  className="px-2 py-1 text-xs"
                  defaultValue=""
                >
                  <option value="" disabled>Assign Engineer...</option>
                  <option value="Unassigned">Unassign</option>
                  {getAssignableStaffTeams(availableEngineers).map(team => (
                    <option key={team.pairName} value={team.users[0].id}>{team.formattedName}</option>
                  ))}
                </select>
                <button
                  onClick={exportToCSV}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.muted }}
                  className="px-2.5 py-1.5 text-xs hover:opacity-80 transition-opacity"
                  title="Export CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={clearSelection}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.muted }}
                  className="px-2.5 py-1.5 text-xs hover:opacity-80 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
              </div>
            </div>

      {/* Fault List */}
        <div className="space-y-3">
          {filteredFaults.length === 0 ? (
            <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: "16px", boxShadow: t.shadow, color: t.muted }} className="py-12 text-center text-xs">
              No logged faults matched these filters.
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
                {filteredFaults.map(fault => {
                  const station = stations.find(s => s.id === fault.station_id);
                  const assignee = engineers.find(u => u.id === fault.assigned_engineer_id);
                  const isSelected = selectedFaultIds.includes(fault.id);
                  const isDetailSelected = selectedFault?.id === fault.id;
                  const faultCardBorder = isDetailSelected ? `2px solid ${t.brand}` : `1px solid ${t.border}`;
                  const faultCardBg = isDetailSelected ? t.brandLight : t.card;

                  return (
                    <div
                      key={fault.id}
                      onClick={() => handleSelectFault(fault)}
                      style={{ background: faultCardBg, border: faultCardBorder, borderRadius: "14px", boxShadow: t.shadow, cursor: "pointer", transition: "all 0.15s" }}
                      className="p-3"
                    >
                      <div className="flex items-center gap-2">
                        {showBulkActions && !browsing && (
                          <div className="flex items-center justify-center shrink-0">
                            <input
                              type="checkbox"
                              checked={selectedFaultIds.includes(fault.id)}
                              onChange={(e) => { e.stopPropagation(); toggleFaultSelection(fault.id); }}
                              className="w-3.5 h-3.5 rounded cursor-pointer"
                              style={{ accentColor: t.brand }}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: t.card2, border: `1px solid ${t.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <span className="font-bold text-[10px]" style={{ color: t.brand }}>{station?.name?.substring(0, 2) || "ST"}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs" style={{ color: t.text }}>{station?.name || "Station"}</h4>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${getStatusColor(fault.status)}`}>
                                {fault.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px]" style={{ color: t.muted }}>{fault.category}</span>
                              <span className={`text-[8px] font-bold px-1 py-0.5 rounded-full border ${getPriorityColor(fault.priority)}`}>
                                {fault.priority}
                              </span>
                              <span className="text-[9px]" style={{ color: t.muted }}>{new Date(fault.time_detected).toLocaleDateString([], { month: "short", day: "numeric", hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSelectFault(fault); }}
                            className="p-1.5 rounded-lg transition-colors"
                            style={{ color: t.brand }}
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {fault.description && (
                        <p className="text-[10px] mt-1.5 truncate" style={{ color: t.muted }}>{fault.description}</p>
                      )}
                      {assignee && (
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[9px]" style={{ color: t.muted }}>Assigned:</span>
                          <span className="text-[9px] font-semibold" style={{ color: t.text2 }}>
                            {assignee ? formatPairName(assignee.name) : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  );
})}
            </div>
          </>)}
      </div>
    </div>
        {showNewForm && !browsing ? (
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: "16px", padding: "20px 24px", boxShadow: t.shadowLg }} className="space-y-5 sticky top-20">
            <div className="flex justify-between items-center" style={{ borderBottom: `1px solid ${t.border}`, paddingBottom: "12px" }}>
              <h3 className="font-bold text-sm" style={{ color: t.text }}>Log Operational Fault</h3>
              <button 
                onClick={() => setShowNewForm(false)}
                className="p-1 rounded transition-colors" style={{ color: t.muted }} 
                onMouseOver={e => (e.currentTarget.style.background = t.card2)} 
                onMouseOut={e => (e.currentTarget.style.background = "transparent")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFault} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Target Broadcast Station *</label>
                <select
                  value={newStationId}
                  onChange={(e) => setNewStationId(e.target.value)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, width: "100%", padding: "6px 12px" }}
                  required
                >
                  <option value="">Select Channel...</option>
                  {stations.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Fault Category *</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, width: "100%", padding: "6px 12px" }}
                >
                  <option value="Transmitter">Transmitter Exciter/AMP</option>
                  <option value="Microwave Link">Microwave Receiver Dish</option>
                  <option value="Studio Mixer">Axia Console Fader</option>
                  <option value="UPS / Mains Power">UPS battery/Generator</option>
                  <option value="Telecom / Fiber">Internet gateway server</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Severity Priority *</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as FaultPriority)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, width: "100%", padding: "6px 12px" }}
                >
                  <option value="Low">Low Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="High">High Priority</option>
                  <option value="Critical">Critical Priority</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Assign Engineer</label>
                <select
                  value={newAssigneeId}
                  onChange={(e) => setNewAssigneeId(e.target.value)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, width: "100%", padding: "6px 12px" }}
                >
                  <option value="">Assign later...</option>
                  {getAssignableStaffTeams(availableEngineers).map(team => (
                    <option key={team.pairName} value={team.users[0].id}>{team.formattedName} ({team.roles})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-muted-foreground">Fault Description *</label>
                  <VoiceNotes onTranscript={(txt) => setNewDesc(prev => (prev ? prev + " " + txt : txt))} />
                </div>
                <textarea
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, width: "100%", padding: "8px 12px", outline: "none" }}
                  rows={4}
                  placeholder="Detail the signal drop metrics, equipment alarm codes, etc..."
                  required
                />
              </div>

              {/* Photo Evidence with Marker */}
              <PhotoAnnotator onSave={setAnnotatedFile} />

              <button
                type="submit"
                className="w-full py-2 font-semibold text-xs rounded-xl cursor-pointer" 
                style={{ background: t.brand, color: "#fff", boxShadow: t.shadow }}
                onMouseOver={e => (e.currentTarget.style.opacity = "0.9")} 
                onMouseOut={e => (e.currentTarget.style.opacity = "1")}
              >
                Log Fault Report
              </button>
            </form>
          </div>
        ) : selectedFault ? (
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: "16px", padding: "20px 24px", boxShadow: t.shadowLg }} className="space-y-6 sticky top-20 max-h-[85vh] overflow-y-auto">
            {/* Header info */}
            <div style={{ borderBottom: `1px solid ${t.border}`, paddingBottom: "12px" }} className="text-left">
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border uppercase ${getPriorityColor(selectedFault.priority)}`}>
                {selectedFault.priority}
              </span>
              <h3 className="font-bold text-sm mt-2" style={{ color: t.text }}>{selectedFault.category}</h3>
              <div className="text-[10px] mt-1 flex items-center gap-1.5" style={{ color: t.muted }}>
                <span>Reported by:</span>
                <DutyPairBadge name={engineers.find(e => e.id === selectedFault.reported_by_id)?.name} size="sm" />
              </div>
            </div>

            {/* Fault Details */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Station</span>
                  <p className="font-semibold text-foreground mt-0.5">{stations.find(s => s.id === selectedFault.station_id)?.name || "Unknown"}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Category</span>
                  <p className="font-semibold text-foreground mt-0.5">{selectedFault.category}</p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Status</span>
                  <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${getStatusColor(selectedFault.status)}`}>
                    {selectedFault.status}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Priority</span>
                  <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${getPriorityColor(selectedFault.priority)}`}>
                    {selectedFault.priority}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Assigned To</span>
                  <p className="font-semibold text-foreground mt-0.5">
                    {engineers.find(e => e.id === selectedFault.assigned_engineer_id)?.name ? (
                      <DutyPairBadge name={engineers.find(e => e.id === selectedFault.assigned_engineer_id)?.name} size="sm" />
                    ) : (
                      <span className="italic text-muted-foreground">Unassigned</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Detected</span>
                  <p className="font-semibold text-foreground mt-0.5">{new Date(selectedFault.time_detected).toLocaleString()}</p>
                </div>
                {selectedFault.resolved_time && (
                  <div>
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Resolved</span>
                    <p className="font-semibold text-foreground mt-0.5">{new Date(selectedFault.resolved_time).toLocaleString()}</p>
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-muted-foreground">Description</span>
                <p className="text-xs mt-1 leading-relaxed whitespace-pre-wrap p-3 rounded-lg" style={{ background: t.card2, border: `1px solid ${t.border}`, color: t.text }}>
                  {selectedFault.description}
                </p>
              </div>

              {selectedFault.action_taken && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Action Taken</span>
                  <p className="text-xs mt-1 leading-relaxed whitespace-pre-wrap p-3 rounded-lg" style={{ background: t.card2, border: `1px solid ${t.border}`, color: t.text }}>
                    {selectedFault.action_taken}
                  </p>
                </div>
              )}
            </div>

            {/* Attachments */}
            {attachments.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                  <Paperclip className="w-3.5 h-3.5" /> Photo Evidence
                </span>
                {attachments.map((attach: any) => (
                  <div key={attach.id} className="rounded-lg overflow-hidden p-1" style={{ border: `1px solid ${t.border}`, background: t.card2 }}>
                    <img 
                      src={attach.file_url} 
                      alt="Fault annotation" 
                      className="max-h-48 w-full object-contain"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Update Form — hidden in browsing sessions */}
            {!browsing && (
            <form onSubmit={handleUpdateFault} className="space-y-3.5 pt-4 text-xs" style={{ borderTop: `1px solid ${t.border}` }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold block" style={{ color: t.text }}>Manage Status & Actions</span>
                
                {/* Quick Action Shortcuts */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setUpdateStatus("Resolved");
                      setUpdateAction("");
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
                    style={{ background: t.successBg, color: t.success, border: `1px solid ${t.success}40` }}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    Mark Resolved
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUpdateStatus("Working");
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors"
                    style={{ background: t.warningBg, color: t.warning, border: `1px solid ${t.warning}40` }}
                  >
                    <Clock className="w-3 h-3" />
                    In-Progress
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold" style={{ color: t.muted }}>Fault Status</label>
                <select
                  value={updateStatus}
                  onChange={(e) => {
                    const newStatus = e.target.value as FaultStatus;
                    setUpdateStatus(newStatus);
                    if (newStatus === "Resolved") {
                      setUpdateAction("");
                    }
                  }}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, width: "100%", padding: "6px 12px" }}
                >
                  <option value="Open">Open</option>
                  <option value="Working">Working</option>
                  <option value="Monitoring">Monitoring</option>
                  <option value="Escalated">Escalated</option>
                  <option value="Resolved">Resolved</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="font-semibold" style={{ color: t.muted }}>Actions Taken & Comments</label>
                  <VoiceNotes onTranscript={(txt) => setUpdateAction(prev => (prev ? prev + " " + txt : txt))} />
                </div>
                <textarea
                  value={updateAction}
                  onChange={(e) => setUpdateAction(e.target.value)}
                  style={{ background: t.card2, border: `1px solid ${t.border}`, borderRadius: "8px", color: t.text, width: "100%", padding: "8px 12px", outline: "none" }}
                  rows={3}
                  placeholder={
                    updateStatus === "Resolved"
                      ? "Describe resolution steps (e.g., Replaced power supply unit; channel restored 100%)..."
                      : updateStatus === "Working"
                      ? "Detail active troubleshooting steps, test results, or next actions..."
                      : "Detail active fixes, engineering steps, aligned links..."
                  }
                  required
                />
              </div>

              <button
                type="submit"
                disabled={updating}
                className="w-full py-2 font-semibold text-xs rounded-xl cursor-pointer disabled:opacity-50" 
                style={{ background: t.brand, color: "#fff", boxShadow: t.shadow }}
              >
                {updating ? "Saving..." : "Submit Log Update"}
              </button>
            </form>
            )}

            {browsing && (
              <div className="pt-4 border-t border-border/40 text-center text-xs" style={{ color: t.muted }}>
                <Eye className="w-4 h-4 mx-auto mb-1 opacity-60" />
                Browsing session — fault status updates are not recorded.
              </div>
            )}

            {/* Timeline updates */}
            {timeline.length > 0 && (
              <div className="space-y-3.5 pt-4 border-t border-border/40">
                <span className="text-[10px] uppercase font-bold text-foreground block">Update Logs Timeline</span>
                <div className="space-y-3 relative border-l border-border pl-4">
                  {timeline.map((update) => (
                    <div key={update.id} className="relative text-xs">
                      <span className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-background" />
                      <div className="flex justify-between items-center text-muted-foreground text-[10px] mb-0.5">
<span className="font-semibold text-foreground">
                          {engineers.find(e => e.id === update.user_id)?.name || "Engineer"}
                        </span>
                        <span>{new Date(update.created_at).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-foreground">Status: {update.status}</p>
                      {update.action_taken && (
                        <p className="text-[11px] text-muted-foreground italic mt-0.5 leading-normal">
                          &ldquo;{update.action_taken}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ background: t.card, border: `1px solid ${t.border}`, borderRadius: "16px", padding: "32px", boxShadow: t.shadow, color: t.muted }} className="text-center text-xs sticky top-20">
            Select a fault ticket on the left to view active timelines, annotate photos, trigger AI Suggestions, or submit status updates.
          </div>
        )}
    </div>
  );
}

export default function FaultsPage() {
  return (
    <React.Suspense fallback={<div className="py-12 text-center text-xs text-muted-foreground">Loading Incident console...</div>}>
      <FaultsContent />
    </React.Suspense>
  );
}



