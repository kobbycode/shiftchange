"use client";

import * as React from "react";
import Link from "next/link";
import { db } from "@/lib/firestore";
import { useAuth } from "@/components/auth-context";
import { Station, Fault, Task, Shift, User, FaultPriority, Attendance } from "@/lib/mock-db";
import { 
  Radio, AlertTriangle, CheckCircle, Clock, Users, ShieldAlert,
  Play, Compass, ClipboardList, ArrowRightLeft, FileBarChart, 
  ArrowUpRight, Activity, Cpu
} from "lucide-react";
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from "recharts";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { formatPairName } from "@/lib/pair-utils";

export default function DashboardPage() {
  const { user } = useAuth();
  const [stations, setStations] = React.useState<Station[]>([]);
  const [faults, setFaults] = React.useState<Fault[]>([]);
  const [pendingTasks, setPendingTasks] = React.useState<Task[]>([]);
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [users, setUsers] = React.useState<User[]>([]);
  const [shiftAttendance, setShiftAttendance] = React.useState<Attendance[]>([]);
  const [allShifts, setAllShifts] = React.useState<Shift[]>([]);
  const [obCount, setObCount] = React.useState(0);

  const activeFaults = React.useMemo(() => faults.filter(f => f.status !== "Resolved"), [faults]);
  const shiftFaults = React.useMemo(
    () => activeFaults.filter(f => f.shift_id === activeShift?.id),
    [activeFaults, activeShift]
  );
  const stationFaults = React.useMemo(() => {
    const map: Record<string, Fault[]> = {};
    for (const f of activeFaults) {
      if (!map[f.station_id]) map[f.station_id] = [];
      map[f.station_id].push(f);
    }
    return map;
  }, [activeFaults]);

  const getFaultPriorityColor = (priority: FaultPriority) => {
    switch (priority) {
      case "Critical": return "bg-destructive text-destructive-foreground";
      case "High": return "bg-orange-500 text-white";
      case "Medium": return "bg-yellow-500 text-black";
      case "Low": return "bg-blue-500 text-white";
    }
  };

  const getWorstFault = (faults: Fault[]) => {
    const order: FaultPriority[] = ["Critical", "High", "Medium", "Low"];
    for (const level of order) {
      const found = faults.find(f => f.priority === level);
      if (found) return found;
    }
    return faults[0];
  };

  const faultPriorityIcon = (priority: FaultPriority) => {
    switch (priority) {
      case "Critical": return "🔴";
      case "High": return "🟠";
      case "Medium": return "🟡";
      case "Low": return "🔵";
    }
  };

  const loadData = React.useCallback(() => {
    // Load every dataset together so no intermediate render shows partial
    // (and therefore flickering / fluctuating) duty engineer data.
    Promise.all([
      db.stations.list(),
      db.faults.list(),
      db.tasks.list(),
      db.shifts.getActive(),
      db.shifts.list(),
      db.attendance.list(),
      db.users.list(),
      db.outsideBroadcasts.list(),
    ])
      .then(([stations, faults, tasks, activeShift, allShifts, attendance, users, obs]) => {
        setStations(stations);
        setFaults(faults);
        setPendingTasks(tasks.filter(task => task.status !== "Completed"));
        setActiveShift(activeShift);
        setAllShifts(allShifts);
        setShiftAttendance(attendance);
        setUsers(users);
        setObCount(obs.filter(o => o.is_running).length);
      })
      .catch(e => console.error("Failed to load dashboard data:", e));
  }, []);

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
    // Poll so devices that are left open (e.g. a supervisor's wallboard) pick
    // up check-ins made on OTHER browsers — cross-browser changes never fire
    // local events, so without this the duty roster stays stale until reload.
    const interval = setInterval(loadData, 10000);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("shift_data_changed", onShiftDataChanged);
      clearInterval(interval);
    };
  }, [loadData]);

  const getStationStatusColor = (status: Station["current_status"]) => {
    switch (status) {
      case "OK":
        return "text-success bg-success/15 border-success/30";
      case "Fault":
      case "Maintenance":
        return "text-warning bg-warning/15 border-warning/30";
      case "Off Air":
      case "Signal Loss":
      case "Emergency":
        return "text-destructive bg-destructive/15 border-destructive/30";
      default:
        return "text-muted-foreground bg-secondary";
    }
  };

  const getStationPulseClass = (status: Station["current_status"]) => {
    switch (status) {
      case "OK":
        return "bg-success";
      case "Fault":
      case "Maintenance":
        return "bg-warning animate-pulse";
      case "Off Air":
      case "Signal Loss":
      case "Emergency":
        return "bg-destructive animate-ping duration-1000";
    }
  };

  // Chart data from actual db reads
  const shiftFaultsAll = React.useMemo(
    () => faults.filter(f => f.shift_id === activeShift?.id),
    [faults, activeShift]
  );
  const faultTrendData = React.useMemo(() => {
    // Derive weekly fault counts from actual fault data
    const weeks: Record<string, number> = {};
    shiftFaultsAll.forEach(f => {
      const date = new Date(f.created_at);
      const weekKey = `W${Math.ceil((date.getDate() + date.getDay() + 1) / 7)} ${date.toLocaleString('default', { month: 'short' })}`;
      weeks[weekKey] = (weeks[weekKey] || 0) + 1;
    });
    const sorted = Object.entries(weeks).sort((a, b) => {
      const aNum = parseInt(a[0].replace(/\D/g, ''));
      const bNum = parseInt(b[0].replace(/\D/g, ''));
      return aNum - bNum;
    });
    return sorted.length > 0 ? sorted.map(([name, Faults]) => ({ name, Faults })) : [{ name: "No Data", Faults: 0 }];
  }, [shiftFaultsAll]);

  const stationUptime = React.useMemo(() => {
    if (stations.length === 0) return "—";
    const ok = stations.filter(s => s.current_status === "OK").length;
    return ((ok / stations.length) * 100).toFixed(1) + "%";
  }, [stations]);

  const activeTechnician = users.find(u => u.id === activeShift?.incoming_staff_id);

  const dutyEngineers = React.useMemo(() => {
    const activeShifts = allShifts
      .filter(s => s.status === "Active")
      .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
    // Only the latest active shift counts — stale/previous shifts must not
    // leak their technicians into the current duty roster
    const current = activeShifts[0] || activeShift;
    if (!current) return [];
    const seen = new Set<string>();
    const checkedIn: User[] = [];
    for (const a of shiftAttendance) {
      if (a.shift_id !== current.id) continue;
      if (a.is_absent) continue; // supervisor-authorized absences are not on duty
      const u = users.find(usr => usr.id === a.user_id);
      if (u && u.role === "Technician" && !seen.has(u.id)) {
        seen.add(u.id);
        checkedIn.push(u);
      }
    }
    if (checkedIn.length === 0 && current.incoming_staff_id) {
      const u = users.find(usr => usr.id === current.incoming_staff_id && usr.role === "Technician");
      // Never resurrect the shift starter via the fallback if a supervisor
      // marked them absent — absence means they are not on duty.
      if (u && !shiftAttendance.some(a => a.shift_id === current.id && a.user_id === u.id && a.is_absent)) {
        checkedIn.push(u);
      }
    }
    return checkedIn;
  }, [shiftAttendance, users, allShifts, activeShift]);

  const dutyEngineerNames = dutyEngineers.map(u => formatPairName(u));
  const dutyEngineerLabel = dutyEngineerNames.length > 1
    ? `${dutyEngineerNames.slice(0, -1).join(", ")} & ${dutyEngineerNames[dutyEngineerNames.length - 1]}`
    : (dutyEngineerNames[0] || "Unassigned");
  const dutyEngineerRole = dutyEngineers.length > 0 ? dutyEngineers[0].role : "None";

  return (
    <div className="space-y-6">
      {/* 1. Header Hero section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-secondary/20 border border-border/40 p-6 rounded-2xl">
        <div>
          {user && user.role === "Technician" && (
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-muted-foreground font-medium">Duty Session:</span>
              <DutyPairBadge name={user.name} role={user.role} size="sm" />
            </div>
          )}
          <h2 className="text-xl font-bold tracking-tight">Network Operations Center (NOC) Wallboard</h2>
          <p className="text-xs text-muted-foreground mt-1">Live status, fault tracking, and active shift logs for radio broadcasting channels.</p>
        </div>
        <div className="flex gap-2">
          {activeShift && user?.role === "Technician" ? (
            <div className="flex items-center gap-2 bg-success/10 text-success border border-success/30 px-3.5 py-1.5 rounded-xl text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-success animate-ping" />
              <span>Shift Active: {activeShift.shift_type}</span>
              {activeTechnician && (
                <div className="border-l border-success/30 pl-2">
                  <DutyPairBadge name={activeTechnician.name} size="sm" />
                </div>
              )}
            </div>
          ) : user?.role !== "Admin" && (
            <Link 
              href="/handover" 
              className="flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-primary/10 transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Handover Shift</span>
            </Link>
          )}
        </div>
      </div>

      {/* 2. Live wallboard station cards with fault overlay */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stations.map(station => {
          const sf = stationFaults[station.id] || [];
          const hasFaults = sf.length > 0;
          const worst = hasFaults ? getWorstFault(sf) : null;
          const criticalCount = sf.filter(f => f.priority === "Critical").length;
          const highCount = sf.filter(f => f.priority === "High").length;
          const mediumCount = sf.filter(f => f.priority === "Medium").length;
          const recentFault = sf.length > 0 ? sf.reduce((a, b) => new Date(a.time_detected) > new Date(b.time_detected) ? a : b) : null;

          const borderAccent = hasFaults
            ? worst?.priority === "Critical" ? "border-l-destructive border-l-4" : worst?.priority === "High" ? "border-l-orange-500 border-l-4" : "border-l-yellow-500 border-l-4"
            : station.current_status !== "OK" ? "border-l-warning border-l-4" : "border-l-transparent border-l-4";

          return (
          <div key={station.id} className={`glass rounded-2xl p-4 border border-border/60 hover:border-border transition-all hover:translate-y-[-2px] duration-200 ${borderAccent}`}>
            {/* Header: logo, name, status */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-white border border-border/50 overflow-hidden flex items-center justify-center shrink-0 p-1 shadow-xs">
                  {station.logo_url ? (
                    <img 
                      src={station.logo_url} 
                      alt={station.name} 
                      className="w-full h-full object-contain"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (station.name.includes("Asempa")) target.src = "/stations/asempa.svg";
                        else if (station.name.includes("Hitz")) target.src = "/stations/hitz.svg";
                        else if (station.name.includes("Joy")) target.src = "/stations/joy.png";
                        else if (station.name.includes("Adom")) target.src = "/stations/adom.png";
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-secondary/80 flex items-center justify-center font-bold text-muted-foreground select-none text-xs">
                      {station.name.substring(0, 2)}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-xs text-foreground truncate">{station.name}</h3>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Broadcasting</p>
                </div>
              </div>
              <div className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getStationStatusColor(station.current_status)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${getStationPulseClass(station.current_status)}`} />
                <span>{station.current_status}</span>
              </div>
            </div>

            {/* Fault alert banner */}
            {hasFaults && (
              <div className={`mb-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 ${
                criticalCount > 0 ? "bg-destructive/15 text-destructive border border-destructive/30" :
                highCount > 0 ? "bg-orange-500/10 text-orange-500 border border-orange-500/20" :
                "bg-yellow-500/10 text-yellow-600 border border-yellow-500/20"
              }`}>
                <span>{faultPriorityIcon(worst!.priority)}</span>
                <span>{sf.length} active fault{sf.length !== 1 ? "s" : ""}</span>
                {recentFault && (
                  <span className="ml-auto font-mono opacity-70">
                    {Math.floor((Date.now() - new Date(recentFault.time_detected).getTime()) / 60000)}m ago
                  </span>
                )}
              </div>
            )}

            {/* Priority breakdown chips */}
            {hasFaults && (
              <div className="flex flex-wrap gap-1 mb-2">
                {criticalCount > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-destructive/20 text-destructive border border-destructive/30">🔴 {criticalCount} Critical</span>}
                {highCount > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/15 text-orange-500 border border-orange-500/30">🟠 {highCount} High</span>}
                {mediumCount > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-yellow-500/15 text-yellow-600 border border-yellow-500/30">🟡 {mediumCount} Med</span>}
              </div>
            )}

            {/* Latest fault description */}
            {recentFault && (
              <p className="text-[11px] text-foreground font-medium leading-snug truncate mb-1" title={recentFault.description}>
                <span className="text-muted-foreground font-normal">Latest: </span>
                {recentFault.description}
              </p>
            )}

            {/* Station remarks */}
            {!recentFault && (
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed h-8">
                {station.remarks || "No remarks reported for this channel."}
              </p>
            )}

            {/* Footer */}
            <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{hasFaults ? `${sf.filter(f => f.status !== "Resolved").length} unresolved` : station.current_status === "OK" ? "All clear" : `Status: ${station.current_status}`}</span>
              {station.updated_at && <span>Updated: {new Date(station.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          </div>
          );
        })}
      </div>

      {/* 3. Operational Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="rounded-2xl p-5 shadow-lg border-2 border-info/30 bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Shift</span>
            <div className="w-9 h-9 rounded-xl bg-info/15 flex items-center justify-center">
              <Clock className="w-[18px] h-[18px] text-info" />
            </div>
          </div>
          <p className="text-[22px] font-bold text-foreground leading-tight">{activeShift ? activeShift.shift_type : "None"}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">Engineering Location</p>
        </div>

        <div className="rounded-2xl p-5 shadow-lg border-2 border-success/30 bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Duty Engineer</span>
            <div className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center">
              <Users className="w-[18px] h-[18px] text-success" />
            </div>
          </div>
          <p className={`font-bold text-foreground leading-tight ${dutyEngineerNames.length > 2 ? "text-sm" : "text-[22px]"}`}>{dutyEngineerLabel || "Unassigned"}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">Role: {dutyEngineerRole}{dutyEngineerNames.length > 1 ? ` • ${dutyEngineerNames.length} on duty` : ""}</p>
        </div>

        <div className="rounded-2xl p-5 shadow-lg border-2 border-warning/30 bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Faults{activeShift ? ` (This Shift)` : ``}</span>
            <div className="w-9 h-9 rounded-xl bg-warning/15 flex items-center justify-center">
              <AlertTriangle className="w-[18px] h-[18px] text-warning" />
            </div>
          </div>
          <p className="text-[28px] font-bold text-warning leading-none">{shiftFaults.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">Immediate actions needed</p>
        </div>

        <div className="rounded-2xl p-5 shadow-lg border-2 border-info/30 bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Pending Tasks</span>
            <div className="w-9 h-9 rounded-xl bg-info/15 flex items-center justify-center">
              <ClipboardList className="w-[18px] h-[18px] text-info" />
            </div>
          </div>
          <p className="text-[28px] font-bold text-info leading-none">{pendingTasks.length}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">In progress or overdue</p>
        </div>

        <div className="rounded-2xl p-5 shadow-lg border-2 border-primary/30 bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">OB Channels</span>
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <Compass className="w-[18px] h-[18px] text-primary" />
            </div>
          </div>
          <p className="text-[28px] font-bold text-primary leading-none">{obCount}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">{obCount === 1 ? "Active feed running" : "Active feeds running"}</p>
        </div>

        <div className="rounded-2xl p-5 shadow-lg border-2 border-success/30 bg-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Station Health</span>
            <div className="w-9 h-9 rounded-xl bg-success/15 flex items-center justify-center">
              <Activity className="w-[18px] h-[18px] text-success" />
            </div>
          </div>
          <p className="text-[28px] font-bold text-success leading-none">{stationUptime}</p>
          <p className="text-[11px] text-muted-foreground mt-1.5">{stations.filter(s => s.current_status === "OK").length}/{stations.length} stations OK</p>
        </div>
      </div>

      {/* 4. Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart A: Station Status Summary */}
        <div className="glass rounded-2xl p-4 md:p-5 border border-border/50 lg:col-span-2 text-left">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Station Status Overview</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Current operational status of all broadcast channels.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {stations.map(s => (
              <div key={s.id} className={`p-3 rounded-xl border text-center ${s.current_status === "OK" ? "bg-success/10 border-success/30" : "bg-warning/10 border-warning/30"}`}>
                <p className="text-xs font-semibold text-foreground truncate">{s.name}</p>
                <div className="flex items-center justify-center gap-1 mt-1">
                  <span className={`w-2 h-2 rounded-full ${s.current_status === "OK" ? "bg-success" : "bg-warning animate-pulse"}`} />
                  <span className="text-[10px] font-bold text-muted-foreground">{s.current_status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chart B: Fault Count Trends */}
        <div className="glass rounded-2xl p-4 md:p-5 border border-border/50 text-left flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold">Weekly Fault Incidents</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Total counts of logged engineering faults per week.</p>
          </div>
          <div className="h-44 my-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={faultTrendData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    borderColor: "hsl(var(--border))",
                    fontSize: "11px",
                    borderRadius: "8px"
                  }} 
                />
                <Bar dataKey="Faults" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="pt-3 border-t border-border/40 text-[10px] text-muted-foreground flex justify-between">
            <span>{faults.length > 0 ? `${faults.length} total fault${faults.length !== 1 ? "s" : ""} logged` : "No fault data"}</span>
            <span>{shiftFaults.length > 0 ? `${shiftFaults.length} active` : "All clear"}</span>
          </div>
        </div>
      </div>

      {/* 5. Quick Actions & Lists Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1 & 2: Recent Active Faults */}
        <div className="glass rounded-2xl p-4 md:p-5 border border-border/50 lg:col-span-2 text-left">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold">Active Operational Faults</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Logged errors requiring engineering support.</p>
            </div>
            <Link href="/faults" className="text-xs text-primary hover:text-primary/80 font-semibold flex items-center gap-0.5">
              <span>View Fault Log</span> <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-border/40 overflow-hidden">
            {shiftFaults.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No active faults! All channels broadcasting clear.
              </div>
            ) : (
              shiftFaults.map(fault => {
                const station = stations.find(s => s.id === fault.station_id);
                return (
                  <div key={fault.id} className="py-3 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-primary px-1.5 py-0.5 bg-primary/10 rounded">
                          {station?.name || "Station"}
                        </span>
                        <span className="text-xs font-semibold text-foreground truncate">
                          {fault.category}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate mt-1">
                        {fault.description}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        fault.priority === "Critical" ? "bg-destructive/15 text-destructive border border-destructive/20" :
                        fault.priority === "High" ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" :
                        "bg-zinc-500/15 text-zinc-400"
                      }`}>
                        {fault.priority}
                      </span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(fault.time_detected).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Column 3: Quick Action shortcuts & Pending Tasks */}
        <div className="space-y-6">
          {/* Quick Actions Panel - Technicians only */}
          {user?.role === "Technician" && (
            <div className="glass rounded-2xl p-4 md:p-5 border border-border/50 text-left">
              <h3 className="text-sm font-semibold mb-3">Operational Shortcuts</h3>
              <div className="grid grid-cols-2 gap-2">
                <Link 
                  href="/handover" 
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/35 hover:bg-secondary border border-border/30 hover:border-border transition-colors text-center group"
                >
                  <ArrowRightLeft className="w-5 h-5 text-violet-500 mb-2 group-hover:scale-105 transition-transform" />
                  <span className="text-[10px] font-semibold">Handover</span>
                </Link>
                <Link 
                  href="/faults?action=new" 
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/35 hover:bg-secondary border border-border/30 hover:border-border transition-colors text-center group"
                >
                  <AlertTriangle className="w-5 h-5 text-destructive mb-2 group-hover:scale-105 transition-transform" />
                  <span className="text-[10px] font-semibold">Log Fault</span>
                </Link>
                <Link 
                  href="/record-job" 
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/35 hover:bg-secondary border border-border/30 hover:border-border transition-colors text-center group"
                >
                  <ClipboardList className="w-5 h-5 text-indigo-400 mb-2 group-hover:scale-105 transition-transform" />
                  <span className="text-[10px] font-semibold">Record Job</span>
                </Link>
                <Link 
                  href="/reports" 
                  className="flex flex-col items-center justify-center p-3 rounded-xl bg-secondary/35 hover:bg-secondary border border-border/30 hover:border-border transition-colors text-center group"
                >
                  <FileBarChart className="w-5 h-5 text-primary mb-2 group-hover:scale-105 transition-transform" />
                  <span className="text-[10px] font-semibold">Reports</span>
                </Link>
              </div>
            </div>
          )}

          {/* Mini Tasks List - hidden for Admin */}
          {user?.role !== "Admin" && (
            <div className="glass rounded-2xl p-4 md:p-5 border border-border/50 text-left">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Shift Task List</h3>
                <Link href="/tasks" className="text-[10px] font-semibold text-primary hover:text-primary/80">
                  View All
                </Link>
              </div>
              <div className="space-y-2">
                {pendingTasks.slice(0, 3).map(task => (
                  <div key={task.id} className="flex items-start gap-2.5 p-2 rounded-lg bg-secondary/20 border border-border/20 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${
                      task.status === "In Progress" ? "bg-orange-400" : "bg-zinc-500"
                    }`} />
                    <span className="flex-1 font-medium truncate">{task.task_name}</span>
                    <span className="text-[9px] text-muted-foreground uppercase">{task.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}