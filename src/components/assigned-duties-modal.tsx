"use client";

import * as React from "react";
import { ClipboardCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { db } from "@/lib/firestore";
import { MockDB, mockRealtime } from "@/lib/mock-db";
import type { Fault, Task } from "@/lib/mock-db";

interface DutyItem {
  kind: "fault" | "task";
  id: string;
  title: string;
  meta: string;
  priority: string;
  status: string;
}

export function AssignedDutiesModal() {
  const { user } = useAuth();
  const [items, setItems] = React.useState<DutyItem[]>([]);
  const [accepting, setAccepting] = React.useState(false);

  const loadDuties = React.useCallback(async () => {
    if (!user || user.role !== "Technician") return;
    try {
      // Cloud-synced acknowledgment: accepting on one device holds everywhere
      const acked = new Set(await db.dutyAcks.getAcknowledged(user.id));
      const [faults, tasks] = await Promise.all([
        db.faults.list().catch(() => [] as Fault[]),
        db.tasks.list().catch(() => [] as Task[]),
      ]);
      const mine: DutyItem[] = [
        ...faults
          .filter(f => f.assigned_engineer_id === user.id && f.status !== "Resolved")
          .map(f => ({
            kind: "fault" as const,
            id: f.id,
            title: f.description,
            meta: `Category: ${f.category}`,
            priority: f.priority,
            status: f.status,
          })),
        ...tasks
          .filter(t => t.assigned_to_id === user.id && t.status !== "Completed")
          .map(t => ({
            kind: "task" as const,
            id: t.id,
            title: t.task_name,
            meta: t.description || "",
            priority: t.priority,
            status: t.status,
          })),
      ].filter(i => !acked.has(i.id));
      setItems(prev =>
        JSON.stringify(prev.map(i => i.id)) === JSON.stringify(mine.map(i => i.id)) ? prev : mine
      );
    } catch {}
  }, [user]);

  React.useEffect(() => {
    loadDuties();
    const unsubscribe = mockRealtime.subscribe("shift", () => loadDuties());
    window.addEventListener("storage", loadDuties);
    const onShiftDataChanged = () => loadDuties();
    window.addEventListener("shift_data_changed", onShiftDataChanged);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", loadDuties);
      window.removeEventListener("shift_data_changed", onShiftDataChanged);
    };
  }, [loadDuties]);

  const accept = async () => {
    if (!user || accepting) return;
    setAccepting(true);
    try {
      const acked = await db.dutyAcks.getAcknowledged(user.id);
      const merged = [...new Set([...acked, ...items.map(i => i.id)])];
      await db.dutyAcks.acknowledge(user.id, merged);
      try {
        // The bell badge must not keep nagging about duties that were just
        // accepted — mark all of this user's assignment notifications as read.
        const notifications = await db.notifications.list().catch(() => []);
        const mine = notifications.filter(
          n => (n.type === "fault_assign" || n.type === "task_assign") && !n.is_read && n.user_id === user.id
        );
        await Promise.all(mine.map(n => db.notifications.markAsRead(n.id)));
      } catch {}
      try {
        MockDB.logAudit(user.id, "ACCEPT_DUTIES", "tasks", "", `Accepted ${items.length} assigned duty item(s)`);
      } catch {}
      setItems([]);
    } finally {
      setAccepting(false);
    }
  };

  if (items.length === 0 || !user) return null;

  const faultCount = items.filter(i => i.kind === "fault").length;
  const taskCount = items.filter(i => i.kind === "task").length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-card text-card-foreground rounded-2xl border border-border shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        <div className="px-5 py-4 border-b border-border flex items-start gap-3">
          <div className="p-2 rounded-xl bg-warning/15 text-warning shrink-0 mt-0.5">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold">Assigned Duties — Review & Acknowledge</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              The following fault{faultCount === 1 ? "" : "s"} and task{taskCount === 1 ? "" : "s"} have been assigned to you.
              Read through them, then accept to proceed to your dashboard.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[52vh] overflow-y-auto">
          {faultCount > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Assigned Faults ({faultCount})
              </h4>
              <div className="space-y-2">
                {items.filter(i => i.kind === "fault").map(i => (
                  <div key={i.id} className="rounded-xl border border-border bg-secondary/30 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-destructive">
                        Fault
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        i.priority === "Critical" ? "bg-destructive/15 text-destructive" :
                        i.priority === "High" ? "bg-warning/15 text-warning" :
                        i.priority === "Medium" ? "bg-amber-500/15 text-amber-600" : "bg-secondary text-muted-foreground"
                      }`}>
                        {i.priority}
                      </span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed">{i.title}</p>
                    {i.meta && <p className="text-[11px] text-muted-foreground leading-relaxed">{i.meta}</p>}
                    <p className="text-[10px] text-muted-foreground">Status: {i.status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {taskCount > 0 && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
                Assigned Tasks ({taskCount})
              </h4>
              <div className="space-y-2">
                {items.filter(i => i.kind === "task").map(i => (
                  <div key={i.id} className="rounded-xl border border-border bg-secondary/30 p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
                        Task
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        i.priority === "Critical" ? "bg-destructive/15 text-destructive" :
                        i.priority === "High" ? "bg-warning/15 text-warning" :
                        i.priority === "Medium" ? "bg-amber-500/15 text-amber-600" : "bg-secondary text-muted-foreground"
                      }`}>
                        {i.priority}
                      </span>
                    </div>
                    <p className="text-xs font-semibold leading-relaxed">{i.title}</p>
                    {i.meta && <p className="text-[11px] text-muted-foreground leading-relaxed">{i.meta}</p>}
                    <p className="text-[10px] text-muted-foreground">Status: {i.status}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border">
          <button
            onClick={accept}
            disabled={accepting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/95 transition-colors cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            {accepting ? "Recording..." : "I accept these duties"}
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Acceptance is logged and can be reviewed by supervisors.
          </p>
        </div>
      </div>
    </div>
  );
}
