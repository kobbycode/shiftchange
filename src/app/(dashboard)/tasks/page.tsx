"use client";

import * as React from "react";
import { db } from "@/lib/firestore";
import { Task, User, Station, TaskStatus, FaultPriority, Shift, Attendance } from "@/lib/mock-db";
import { 
  ClipboardList, Plus, CheckCircle, Clock, AlertTriangle, 
  UserCheck, PlusCircle, Check, X, Calendar, Play, Camera, Wrench, Replace, Eye
} from "lucide-react";
import toast from "react-hot-toast";
import { formatPairName, getAssignableStaffTeams } from "@/lib/pair-utils";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { useBrowsingMode } from "@/lib/browsing-mode";

export default function TasksPage() {
  // DB States
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);
  const [stations, setStations] = React.useState<Station[]>([]);
  const [activeShift, setActiveShift] = React.useState<Shift | null>(null);
  const [attendance, setAttendance] = React.useState<Attendance[]>([]);

  // Technicians marked absent for the active shift — never assignable
  const absentTechIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (activeShift) {
      for (const a of attendance) {
        if (a.shift_id === activeShift.id && a.is_absent) ids.add(a.user_id);
      }
    }
    return ids;
  }, [attendance, activeShift]);
  const assignableUsers = React.useMemo(
    () => users.filter(u => !absentTechIds.has(u.id)),
    [users, absentTechIds]
  );

  // Form State
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [taskName, setTaskName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignedToId, setAssignedToId] = React.useState("");
  const [priority, setPriority] = React.useState<FaultPriority>("Medium");
  const [dueDate, setDueDate] = React.useState("");
  const [stationId, setStationId] = React.useState("");
  
  const [saving, setSaving] = React.useState(false);

  // "My Tasks" filter — activated by the duty banner's ?assigned=1 link
  const [myTasksOnly, setMyTasksOnly] = React.useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("assigned") === "1";
    } catch {
      return false;
    }
  });
  const currentUserId = db.auth.getUser()?.id;
  const browsing = useBrowsingMode() && db.auth.getUser()?.role === "Technician";

  const loadData = async () => {
    db.tasks.list().then(setTasks);
    db.users.list().then(setUsers);
    db.stations.list().then(setStations);
    db.shifts.getActive().then(async (as) => {
      setActiveShift(as);
      if (as) {
        try {
          const att = await db.attendance.getForShift(as.id);
          setAttendance(att);
        } catch {}
      } else {
        setAttendance([]);
      }
    }).catch(() => {});
  };

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

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskName) {
      toast.error("Task title is required");
      return;
    }

    setSaving(true);
    try {
      const currentShift = await db.shifts.getActive();
      await db.tasks.create({
        shift_id: currentShift?.id || undefined,
        task_name: taskName,
        description: description || undefined,
        assigned_to_id: assignedToId || undefined,
        priority,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        station_id: stationId || undefined,
        status: "Todo"
      });

      toast.success("Task logged successfully!");
      setShowAddForm(false);
      // Reset
      setTaskName("");
      setDescription("");
      setAssignedToId("");
      setDueDate("");
      setStationId("");
      loadData();
    } catch (err: any) {
      toast.error(err.message || "Failed to create task");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: TaskStatus) => {
    try {
      await db.tasks.update(id, { status: newStatus });
      toast.success(`Task status updated to ${newStatus}`);
      loadData();
    } catch (err: any) {
      toast.error("Failed to update status");
    }
  };

  const handleResolveEquipment = async (taskId: string, resolutionType: "repaired" | "replaced") => {
    try {
      await db.tasks.update(taskId, { 
        status: "Completed", 
        resolution_type: resolutionType 
      });
      toast.success(`Equipment ${resolutionType === "repaired" ? "repaired" : "replaced"} successfully`);
      loadData();
    } catch (err: any) {
      toast.error("Failed to update task");
    }
  };

  // Helper to determine if a task is overdue
  const isTaskOverdue = (task: Task) => {
    if (task.status === "Completed") return false;
    if (!task.due_date) return false;
    return new Date(task.due_date).getTime() < Date.now();
  };

  const getPriorityColor = (p: FaultPriority) => {
    switch (p) {
      case "Critical":
        return "text-destructive bg-destructive/10 border-destructive/25";
      case "High":
        return "text-orange-400 bg-orange-400/10 border-orange-400/25";
      case "Medium":
        return "text-amber-400 bg-amber-400/10 border-amber-400/25";
      default:
        return "text-zinc-400 bg-zinc-500/10 border-zinc-500/25";
    }
  };

  // Grouping tasks (respecting the My Tasks filter)
  const isMine = (t: Task) => !myTasksOnly || t.assigned_to_id === currentUserId;
  const todoTasks = tasks.filter(t => t.status === "Todo" && !isTaskOverdue(t) && isMine(t));
  const inProgressTasks = tasks.filter(t => t.status === "In Progress" && !isTaskOverdue(t) && isMine(t));
  const completedTasks = tasks.filter(t => t.status === "Completed" && isMine(t));
  const overdueTasks = tasks.filter(t => isTaskOverdue(t) && isMine(t));

  return (
    <div className="space-y-6 text-left">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">SECTION F — PENDING TASK</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Task planner for preventative engineering maintenance and shift handovers.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMyTasksOnly(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl transition-colors cursor-pointer border ${
              myTasksOnly
                ? "bg-primary/15 border-primary/40 text-primary"
                : "bg-secondary/50 border-border text-muted-foreground hover:text-foreground"
            }`}
            title={myTasksOnly ? "Show all tasks" : "Show only tasks assigned to me"}
          >
            <UserCheck className="w-4 h-4" /> {myTasksOnly ? "My Tasks" : "All Tasks"}
          </button>
          {browsing ? (
            <span className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold rounded-xl bg-warning/10 text-warning border border-warning/30">
              <Eye className="w-3.5 h-3.5" /> Browsing — viewing only, tasks are not recorded
            </span>
          ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 text-white text-xs font-semibold rounded-xl cursor-pointer shadow-md self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" /> Create New Task
          </button>
          )}
        </div>
      </div>

      {/* Add Task Modal overlay */}
      {showAddForm && !browsing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-card border border-border/80 rounded-2xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95 duration-150 text-left text-xs">
            <button
              onClick={() => setShowAddForm(false)}
              className="absolute top-4 right-4 p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-primary" /> Create Maintenance Task
            </h3>

            <form onSubmit={handleCreateTask} className="space-y-4">
              <div className="space-y-1">
                <label className="font-semibold text-zinc-400">Task Title *</label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-secondary/35 border border-border rounded-lg text-sm"
                  placeholder="e.g. Service transmitter generator room AC"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Assign To Engineer</label>
                  <select
                    value={assignedToId}
                    onChange={(e) => setAssignedToId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-secondary/35 border border-border rounded-lg"
                  >
                    <option value="">Choose engineer pair...</option>
                    {getAssignableStaffTeams(assignableUsers).map(team => (
                      <option key={team.pairName} value={team.users[0].id}>{team.formattedName} ({team.roles})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Associated Station</label>
                  <select
                    value={stationId}
                    onChange={(e) => setStationId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-secondary/35 border border-border rounded-lg"
                  >
                    <option value="">Optional...</option>
                    {stations.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Task Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as FaultPriority)}
                    className="w-full px-3 py-1.5 bg-secondary/35 border border-border rounded-lg"
                  >
                    <option value="Low">Low Priority</option>
                    <option value="Medium">Medium Priority</option>
                    <option value="High">High Priority</option>
                    <option value="Critical">Critical Priority</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-zinc-400">Due Date & Time</label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-secondary/35 border border-border rounded-lg text-foreground [color-scheme:light] dark:[color-scheme:dark]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-zinc-400">Task Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/35 border border-border rounded-lg text-sm"
                  rows={3}
                  placeholder="Detail clean-up parameters, spare filter types, safety goggles, etc."
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 bg-primary hover:bg-primary/95 text-white font-semibold text-sm rounded-xl"
              >
                Log task
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Overdue Alert Section */}
      {overdueTasks.length > 0 && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl">
          <div className="flex items-center gap-2 text-destructive font-bold text-xs mb-3">
            <AlertTriangle className="w-4.5 h-4.5 animate-pulse" />
            <span>CRITICAL: OVERDUE SHIFT MAINTENANCE ITEMS DETECTED ({overdueTasks.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {overdueTasks.map(task => (
              <div key={task.id} className="p-3 bg-card border border-destructive/30 rounded-xl flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <h4 className="font-bold text-foreground truncate">{task.task_name}</h4>
                  <p className="text-[10px] text-destructive/80 font-medium mt-1">
                    Missed deadline: {new Date(task.due_date!).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleUpdateStatus(task.id, "Completed")}
                  disabled={browsing}
                  className="p-1.5 bg-success text-success-foreground rounded-lg hover:bg-success/90 shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Resolve Task"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Column 1: TODO */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <ClipboardList className="w-4.5 h-4.5 text-muted-foreground" /> Todo ({todoTasks.length})
            </h3>
          </div>
          <div className="space-y-3">
            {todoTasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground glass rounded-xl">No tasks pending</div>
            ) : (
              todoTasks.map(task => (
                <div key={task.id} className="glass p-4 border border-border/60 rounded-xl space-y-3 text-xs relative">
                  {task.image_url && (
                    <div className="w-full h-32 rounded-lg overflow-hidden border border-border/40 mb-2">
                      <img src={task.image_url} alt="Equipment fault" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-3">
                    <h4 className="font-bold text-foreground leading-snug">{task.task_name}</h4>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{task.description}</p>}
                  
                  <div className="flex items-center gap-2 pt-2 border-t border-border/20">
                    {task.equipment_id ? (
                      <>
                        <button
                          onClick={() => handleResolveEquipment(task.id, "repaired")}
                          disabled={browsing}
                          className="flex-1 py-1 bg-success/20 hover:bg-success/30 border border-success/40 text-success font-semibold text-[10px] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Wrench className="w-3 h-3" /> Repaired
                        </button>
                        <button
                          onClick={() => handleResolveEquipment(task.id, "replaced")}
                          disabled={browsing}
                          className="flex-1 py-1 bg-warning/20 hover:bg-warning/30 border border-warning/40 text-warning font-semibold text-[10px] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Replace className="w-3 h-3" /> Replaced
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(task.id, "In Progress")}
                        disabled={browsing}
                        className="flex-1 py-1 bg-secondary/50 hover:bg-secondary border border-border/40 text-foreground font-semibold text-[10px] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Play className="w-3 h-3 text-success" /> Start Work
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 2: IN PROGRESS */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <Clock className="w-4.5 h-4.5 text-warning animate-pulse" /> In Progress ({inProgressTasks.length})
            </h3>
          </div>
          <div className="space-y-3">
            {inProgressTasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground glass rounded-xl">No tasks in progress</div>
            ) : (
              inProgressTasks.map(task => (
                <div key={task.id} className="glass p-4 border border-warning/30 bg-warning/5 rounded-xl space-y-3 text-xs relative">
                  {task.image_url && (
                    <div className="w-full h-32 rounded-lg overflow-hidden border border-border/40 mb-2">
                      <img src={task.image_url} alt="Equipment fault" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-3">
                    <h4 className="font-bold text-foreground leading-snug">{task.task_name}</h4>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                  </div>
                  {task.description && <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{task.description}</p>}
                  
                  <div className="flex items-center gap-2 pt-2 border-t border-border/20">
                    {task.equipment_id ? (
                      <>
                        <button
                          onClick={() => handleResolveEquipment(task.id, "repaired")}
                          disabled={browsing}
                          className="flex-1 py-1 bg-success/20 hover:bg-success/30 border border-success/40 text-success font-semibold text-[10px] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Wrench className="w-3 h-3" /> Repaired
                        </button>
                        <button
                          onClick={() => handleResolveEquipment(task.id, "replaced")}
                          disabled={browsing}
                          className="flex-1 py-1 bg-warning/20 hover:bg-warning/30 border border-warning/40 text-warning font-semibold text-[10px] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Replace className="w-3 h-3" /> Replaced
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleUpdateStatus(task.id, "Completed")}
                        disabled={browsing}
                        className="flex-1 py-1 bg-success text-success-foreground font-semibold text-[10px] rounded-md flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Check className="w-3 h-3" /> Complete Task
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Column 3: COMPLETED */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5">
              <CheckCircle className="w-4.5 h-4.5 text-success" /> Completed ({completedTasks.length})
            </h3>
          </div>
          <div className="space-y-3">
            {completedTasks.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground glass rounded-xl">No tasks completed yet</div>
            ) : (
              completedTasks.map(task => (
                <div key={task.id} className="glass p-4 border border-success/20 bg-success/2 opacity-75 rounded-xl space-y-3 text-xs relative">
                  {task.image_url && (
                    <div className="w-full h-24 rounded-lg overflow-hidden border border-border/40 mb-2 opacity-60">
                      <img src={task.image_url} alt="Equipment fault" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex justify-between items-start gap-3">
                    <h4 className="font-bold text-zinc-400 line-through leading-snug">{task.task_name}</h4>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {task.resolution_type && (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                          task.resolution_type === "repaired" 
                            ? "text-success bg-success/10 border-success/30" 
                            : "text-warning bg-warning/10 border-warning/30"
                        }`}>
                          {task.resolution_type === "repaired" ? "Repaired" : "Replaced"}
                        </span>
                      )}
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-secondary text-zinc-500 border border-border">
                        Done
                      </span>
                    </div>
                  </div>
                  {task.description && <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-2">{task.description}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
