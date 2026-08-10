"use client";

import * as React from "react";
import { db } from "@/lib/firestore";
import { Attendance, User, Shift } from "@/lib/mock-db";
import { Users, CheckCircle2, Clock, AlertTriangle, Filter, Calendar, RotateCcw, UserPlus, LogIn, X } from "lucide-react";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { ClockInPartnerModal } from "@/components/clock-in-partner-modal";
import { useAuth } from "@/components/auth-context";

export default function AttendancePage() {
  const { user } = useAuth();
  const [attendance, setAttendance] = React.useState<Attendance[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dateFilter, setDateFilter] = React.useState("");
  const [showClockInModal, setShowClockInModal] = React.useState(false);
  const [sessions, setSessions] = React.useState<{ id: string; user_id: string; mode: "shift" | "browsing"; created_at: string }[]>([]);

  // Sign-in audit trail — which technicians logged in for duty vs browsing
  // (visible to supervisors/admins only)
  React.useEffect(() => {
    if (!user || (user.role !== "Supervisor" && user.role !== "Admin")) return;
    let mounted = true;
    const load = () => db.sessions.list().then((s) => {
      if (mounted) setSessions((prev) => JSON.stringify(prev) === JSON.stringify(s) ? prev : s);
    }).catch(() => {});
    load();
    const handleSync = () => load();
    window.addEventListener("storage", handleSync);
    window.addEventListener("shift_data_changed", handleSync);
    const interval = setInterval(load, 15000);
    return () => {
      mounted = false;
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("shift_data_changed", handleSync);
      clearInterval(interval);
    };
  }, [user]);

  const loadAttendance = React.useCallback(() => {
    Promise.all([db.attendance.list(), db.users.list(), db.shifts.getActive()]).then(([att, usrs, shift]) => {
      // Only update state when data actually changed — this polling loop runs
      // every 4s, and fresh references re-render every card (visible flicker).
      setAttendance((prev) => (JSON.stringify(prev) === JSON.stringify(att) ? prev : att));
      setUsers((prev) => (JSON.stringify(prev) === JSON.stringify(usrs) ? prev : usrs));
      setActiveShift((prev) => (JSON.stringify(prev) === JSON.stringify(shift) ? prev : shift));
      setLoading(false);
    });
  }, []);

  React.useEffect(() => {
    loadAttendance();
    const handleSync = () => loadAttendance();
    window.addEventListener("storage", handleSync);
    window.addEventListener("shift_data_changed", handleSync);
    const interval = setInterval(loadAttendance, 4000);
    return () => {
      window.removeEventListener("storage", handleSync);
      window.removeEventListener("shift_data_changed", handleSync);
      clearInterval(interval);
    };
  }, [loadAttendance]);

  const filtered = attendance.filter((a) => {
    if (!dateFilter) return true;
    return a.time_reported.startsWith(dateFilter);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card border border-border/60 p-4 rounded-2xl shadow-xs">
        <div>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2 text-foreground">
            <Users className="w-5 h-5 text-violet-500 shrink-0" />
            <span>Attendance Log</span>
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">Engineer shift check-in and arrival logs.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Calendar className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none top-1/2 -translate-y-1/2" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full bg-secondary/50 border border-border rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
            />
          </div>
          {dateFilter && (
            <button
              onClick={() => setDateFilter("")}
              className="p-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors shrink-0 flex items-center gap-1"
              title="Reset Filter"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          )}
          {/* Partner Clock-In Button - visible for ALL users */}
          <button
            onClick={() => setShowClockInModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/15 hover:bg-primary/25 border border-primary/30 text-primary font-bold text-xs transition-all cursor-pointer shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Partner</span>
          </button>
        </div>
      </div>

      {/* Clock In Partner Modal */}
      <ClockInPartnerModal
        isOpen={showClockInModal}
        onClose={() => setShowClockInModal(false)}
        activeShift={activeShift}
        currentUserId={user?.id || ""}
        alreadyCheckedInUserIds={activeShift ? attendance.filter(a => a.shift_id === activeShift.id && !a.is_absent).map(a => a.user_id) : []}
        absentUserIds={activeShift ? attendance.filter(a => a.shift_id === activeShift.id && a.is_absent).map(a => a.user_id) : []}
        onSuccess={loadAttendance}
      />

      {/* MOBILE VIEW (Cards Layout) */}
      <div className="block md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground bg-card border border-border/50 rounded-2xl">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-40 text-muted-foreground" />
            <p className="text-xs font-semibold text-foreground">No attendance records found.</p>
            <p className="text-[11px] text-muted-foreground mt-1">Try clearing your date filter.</p>
          </div>
        ) : (
          filtered.map((att) => {
            const user = users.find((u) => u.id === att.user_id);
            const checkInMins =
              new Date(att.time_reported).getHours() * 60 +
              new Date(att.time_reported).getMinutes();
            const lateBy = Math.max(0, checkInMins - 8 * 60);

            return (
              <div key={att.id} className="bg-card border border-border/60 rounded-2xl p-4 space-y-3 shadow-xs">
                {/* Card Top: Pair Badge + Arrival Status Pill */}
                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-3">
                  <DutyPairBadge name={user?.name} size="sm" />
                  {att.is_absent ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/15 text-destructive border border-destructive/20 font-bold text-[10px] uppercase">
                      <X className="w-3 h-3" /> Absent
                    </span>
                  ) : user?.role === "Technician" && (att.is_late ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-destructive/15 text-destructive border border-destructive/20 font-bold text-[10px] uppercase">
                      <AlertTriangle className="w-3 h-3" /> Late (+{lateBy}m)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-success/15 text-success border border-success/20 font-bold text-[10px] uppercase">
                      <CheckCircle2 className="w-3 h-3" /> On Time
                    </span>
                  ))}
                </div>

                {/* Absence Banner */}
                {att.is_absent && (
                  <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-0.5">
                    <span className="font-bold text-[10px] uppercase block tracking-wider">Marked Absent:</span>
                    <p className="italic font-medium leading-normal text-xs">
                      {att.absent_marked_by ? `Authorized by ${att.absent_marked_by}` : "Supervisor-authorized absence"}
                      {att.absent_marked_at ? ` at ${new Date(att.absent_marked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                )}

                {/* Late Reason Banner */}
                {user?.role === "Technician" && att.is_late && att.late_reason && (
                  <div className="p-2.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs space-y-0.5">
                    <span className="font-bold text-[10px] uppercase block tracking-wider">Late Reporting Reason:</span>
                    <p className="italic font-medium leading-normal text-xs">{att.late_reason}</p>
                  </div>
                )}

                {/* Grid Details */}
                <div className="grid grid-cols-2 gap-2.5 text-xs bg-secondary/30 p-3 rounded-xl border border-border/30">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Date</span>
                    <span className="font-semibold text-foreground">{new Date(att.time_reported).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Check In Time</span>
                    <span className="font-semibold font-mono text-foreground">{new Date(att.time_reported).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Check Out Departure</span>
                    <span className="font-semibold font-mono text-foreground">
                      {att.time_leaving ? new Date(att.time_leaving).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Active Shift"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Total Hours</span>
                    <span className="font-bold font-mono text-primary">{att.hours_worked.toFixed(1)} hrs</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DESKTOP VIEW (Table Layout) */}
      <div className="hidden md:block border border-border/60 rounded-2xl bg-card overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border/40 bg-secondary/30 text-muted-foreground text-[10px] uppercase font-bold">
                <th className="py-3.5 px-4">Technician</th>
                <th className="py-3.5 px-4">Date</th>
                <th className="py-3.5 px-4">Check In</th>
                <th className="py-3.5 px-4">Arrival Status</th>
                <th className="py-3.5 px-4">Check Out</th>
                <th className="py-3.5 px-4">Departure</th>
                <th className="py-3.5 px-4 text-right">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground">
                    <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
                    No attendance records found for this date.
                  </td>
                </tr>
              ) : (
                filtered.map((att) => {
                  const user = users.find((u) => u.id === att.user_id);
                  const checkInMins =
                    new Date(att.time_reported).getHours() * 60 +
                    new Date(att.time_reported).getMinutes();
                  const lateBy = Math.max(0, checkInMins - 8 * 60);
                  const checkOutMins = att.time_leaving
                    ? new Date(att.time_leaving).getHours() * 60 +
                      new Date(att.time_leaving).getMinutes()
                    : null;

                  return (
                    <tr key={att.id} className="hover:bg-secondary/15 transition-colors">
                      <td className="py-3.5 px-4">
                        <DutyPairBadge name={user?.name} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 font-mono text-muted-foreground">
                        {new Date(att.time_reported).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-semibold text-foreground">
                        {att.is_absent ? "—" : new Date(att.time_reported).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs">
                        {att.is_absent ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-destructive font-bold text-[10px] uppercase">
                              <X className="w-3 h-3 shrink-0" /> ABSENT
                            </span>
                            {att.absent_marked_by && (
                              <p className="text-[11px] text-muted-foreground italic truncate" title={`Authorized by ${att.absent_marked_by}`}>
                                by {att.absent_marked_by}
                              </p>
                            )}
                          </div>
                        ) : user?.role !== "Technician" ? (
                          <span className="text-muted-foreground font-semibold text-[10px] uppercase">—</span>
                        ) : att.is_late ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-destructive font-bold text-[10px] uppercase">
                              <AlertTriangle className="w-3 h-3 shrink-0" /> LATE (+{lateBy}m)
                            </span>
                            {att.late_reason && (
                              <p className="text-[11px] text-muted-foreground italic truncate" title={att.late_reason}>
                                {att.late_reason}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-success font-bold text-[10px] uppercase">
                            <CheckCircle2 className="w-3 h-3" /> ON TIME
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-foreground">
                        {att.is_absent
                          ? "—"
                          : att.time_leaving
                          ? new Date(att.time_leaving).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="py-3.5 px-4">
                        {att.is_absent ? (
                          <span className="text-muted-foreground text-[10px] font-semibold italic">Absent</span>
                        ) : checkOutMins === null ? (
                          <span className="text-muted-foreground text-[10px] font-semibold italic">Active Shift</span>
                        ) : att.is_early_departure ? (
                          <span className="text-warning font-bold text-[10px] uppercase">EARLY</span>
                        ) : att.overtime_minutes && att.overtime_minutes > 0 ? (
                          <span className="text-info font-bold text-[10px] uppercase">
                            OVERTIME +{att.overtime_minutes}m
                          </span>
                        ) : (
                          <span className="text-success font-bold text-[10px] uppercase">ON TIME</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-foreground">
                        {att.is_absent ? "—" : `${att.hours_worked.toFixed(1)}h`}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-right font-medium">
        {filtered.length} record{filtered.length !== 1 ? "s" : ""}
      </p>

      {/* Recent Technician Sign-ins — who logged in for duty vs who browsed */}
      {user && (user.role === "Supervisor" || user.role === "Admin") && sessions.length > 0 && (
        <div className="border border-border/60 rounded-2xl bg-card overflow-hidden shadow-xs">
          <div className="px-4 py-3 border-b border-border/40 bg-secondary/30">
            <h3 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
              <LogIn className="w-3.5 h-3.5 text-violet-500" /> Recent Technician Sign-ins
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Who logged in to start their shift vs who only browsed — attendance is recorded only on "Start Shift".
            </p>
          </div>
          <div className="divide-y divide-border/20 max-h-80 overflow-y-auto">
            {sessions.slice(0, 12).map((s) => {
              const u = users.find(x => x.id === s.user_id);
              return (
                <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                      {(u?.name || "?").charAt(0)}
                    </span>
                    <div>
                      <p className="text-xs font-semibold capitalize">{u?.name || "Unknown"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">
                        {new Date(s.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] uppercase ${s.mode === "shift" ? "bg-success/15 text-success border border-success/20" : "bg-secondary text-muted-foreground border border-border"}`}>
                    {s.mode === "shift" ? "On Duty" : "Browsing"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
