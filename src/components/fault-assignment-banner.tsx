"use client";

import * as React from "react";
import { Wrench, ClipboardList, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { db } from "@/lib/firestore";
import { mockRealtime } from "@/lib/mock-db";
import type { Fault, Task } from "@/lib/mock-db";

// Persistent duty banner: stays visible while the logged-in technician has any
// assigned fault (not Resolved) or task (not Completed). Disappears on its own
// only when ALL assigned duties have been resolved — no manual dismissal.
export function FaultAssignmentBanner() {
  const { user } = useAuth();
  const router = useRouter();
  const [faults, setFaults] = React.useState<Fault[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);

  const loadAssignments = React.useCallback(async () => {
    if (!user || user.role !== "Technician") {
      setFaults([]);
      setTasks([]);
      return;
    }
    try {
      const [allFaults, allTasks] = await Promise.all([
        db.faults.list().catch(() => [] as Fault[]),
        db.tasks.list().catch(() => [] as Task[]),
      ]);
      const mineF = allFaults.filter(f => f.assigned_engineer_id === user.id && f.status !== "Resolved");
      const mineT = allTasks.filter(t => t.assigned_to_id === user.id && t.status !== "Completed");
      setFaults(prev =>
        JSON.stringify(prev.map(f => `${f.id}:${f.status}`)) === JSON.stringify(mineF.map(f => `${f.id}:${f.status}`))
          ? prev
          : mineF
      );
      setTasks(prev =>
        JSON.stringify(prev.map(t => `${t.id}:${t.status}`)) === JSON.stringify(mineT.map(t => `${t.id}:${t.status}`))
          ? prev
          : mineT
      );
    } catch {}
  }, [user]);

  React.useEffect(() => {
    loadAssignments();
    const unsubscribe = mockRealtime.subscribe("shift", () => loadAssignments());
    window.addEventListener("storage", loadAssignments);
    const onShiftDataChanged = () => loadAssignments();
    window.addEventListener("shift_data_changed", onShiftDataChanged);
    const interval = setInterval(loadAssignments, 5000);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", loadAssignments);
      window.removeEventListener("shift_data_changed", onShiftDataChanged);
      clearInterval(interval);
    };
  }, [loadAssignments]);

  const total = faults.length + tasks.length;
  if (total === 0) return null;

  const openItem = (kind: "fault" | "task") => {
    router.push(kind === "fault" ? "/faults?assigned=1" : "/tasks?assigned=1");
  };

  return (
    <div className="px-4 md:px-6 pt-4 pb-0 max-w-7xl w-full mx-auto">
      <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 animate-in slide-in-from-top-2 duration-300">
        <div className="p-1.5 rounded-lg bg-warning/20 text-warning shrink-0 mt-0.5">
          <Wrench className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-bold text-foreground">
            {total === 1
              ? "You have 1 unresolved assigned duty"
              : `You have ${total} unresolved assigned duties`}
          </h4>
          <p className="text-[11px] text-muted-foreground font-medium mt-0.5 leading-relaxed line-clamp-2">
            {faults.length > 0 && `${faults.length} assigned fault${faults.length !== 1 ? "s" : ""} open`}
            {faults.length > 0 && tasks.length > 0 && " · "}
            {tasks.length > 0 && `${tasks.length} assigned task${tasks.length !== 1 ? "s" : ""} pending`}
            {` — this banner clears automatically once everything is resolved.`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {faults.length > 0 && (
            <button
              onClick={() => openItem("fault")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning text-white text-[11px] font-bold hover:bg-warning/90 transition-colors cursor-pointer"
            >
              View Faults <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          {tasks.length > 0 && (
            <button
              onClick={() => openItem("task")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold hover:bg-primary/90 transition-colors cursor-pointer"
            >
              <ClipboardList className="w-3.5 h-3.5" /> View Tasks <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
