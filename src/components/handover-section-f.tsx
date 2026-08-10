"use client";

import * as React from "react";
import { Task, User, TaskStatus, FaultPriority } from "@/lib/mock-db";
import { DutyPairBadge } from "@/components/duty-pair-badge";

export interface SectionFTaskData {
  id: string;
  taskName: string;
  description: string;
  status: string;
  priority: string;
  assignedToName: string;
  assignedToId?: string;
  dueDate: string;
}

export interface SectionFData {
  tasks: SectionFTaskData[];
}

interface HandoverSectionFProps {
  tasks: Task[];
  users?: User[];
  absentTechIds?: Set<string>;   // technicians marked absent — not assignable
  onSave: (data: SectionFData) => void;
  onBack: () => void;
  theme: Record<string, string>;
}

const STATUS_OPTIONS = ["Todo", "In Progress", "Completed"] as const;
const PRIORITY_OPTIONS: FaultPriority[] = ["Low", "Medium", "High", "Critical"];

export function HandoverSectionF({
  tasks: existingTasks,
  users = [],
  absentTechIds,
  onSave,
  onBack,
  theme: t,
}: HandoverSectionFProps) {
  const [tasks, setTasks] = React.useState<SectionFTaskData[]>(() =>
    existingTasks.map(task => ({
      id: task.id,
      taskName: task.task_name,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      assignedToName: users.find(u => u.id === task.assigned_to_id)?.name || "Unassigned",
      dueDate: task.due_date || "",
    }))
  );

  const [isAdding, setIsAdding] = React.useState(false);
  const [newTask, setNewTask] = React.useState({
    taskName: "",
    description: "",
    priority: "Medium" as FaultPriority,
    assignedToId: "",
    dueDate: "",
  });

  const technicians = users.filter(u => u.role === "Technician" && !absentTechIds?.has(u.id));

  const handleAddTask = () => {
    if (!newTask.taskName.trim()) return;
    const id = `task-temp-${Date.now()}`;
    setTasks(prev => [...prev, {
      id,
      taskName: newTask.taskName.trim(),
      description: newTask.description.trim(),
      status: "Todo",
      priority: newTask.priority,
      assignedToName: technicians.find(u => u.id === newTask.assignedToId)?.name || "Unassigned",
      assignedToId: newTask.assignedToId,
      dueDate: newTask.dueDate,
    }]);
    setNewTask({ taskName: "", description: "", priority: "Medium", assignedToId: "", dueDate: "" });
    setIsAdding(false);
  };

  const pendingCount = tasks.filter(t => t.status !== "Completed").length;

  const setStatus = (id: string, status: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const getPriorityColors = (priority: string) => {
    switch (priority) {
      case "Critical": return { bg: t.dangerBg, color: t.danger, border: `${t.danger}40` };
      case "High": return { bg: t.warningBg, color: t.warning, border: `${t.warning}40` };
      case "Medium": return { bg: t.infoBg, color: t.info, border: `${t.info}40` };
      default: return { bg: t.card2, color: t.muted, border: t.border };
    }
  };

  const getStatusColors = (status: string) => {
    if (status === "Completed") return { bg: t.successBg, color: t.success, border: `${t.success}40` };
    if (status === "In Progress") return { bg: t.infoBg, color: t.info, border: `${t.info}40` };
    if (status === "Overdue") return { bg: t.dangerBg, color: t.danger, border: `${t.danger}40` };
    return { bg: t.warningBg, color: t.warning, border: `${t.warning}40` };
  };

  return (
    <div style={{
      background: t.card,
      borderRadius: "16px",
      border: `2px solid ${t.warning}40`,
      boxShadow: t.shadowLg,
      overflow: "hidden",
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${t.warning}, ${t.warning}cc)`,
        padding: "24px 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(255,255,255,.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" />
              <path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              SECTION F — PENDING TASK
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Outgoing Staff confirms outstanding maintenance tasks before final signing
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 32px 32px" }}>
        {tasks.length === 0 && !isAdding ? (
          <div style={{
            textAlign: "center", padding: "40px 20px",
            background: t.card2, borderRadius: "12px",
            border: `1px dashed ${t.border}`,
          }}>
            <p style={{ fontSize: "14px", color: t.muted, marginBottom: "12px" }}>No pending maintenance tasks for the next shift.</p>
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "10px 20px", borderRadius: "10px",
                fontSize: "13px", fontWeight: 600,
                color: "#fff", background: t.warning, border: "none", cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Log Task
            </button>
          </div>
        ) : (
          <>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "16px",
            }}>
              <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Task Log ({pendingCount} pending · {tasks.length - pendingCount} completed)
              </label>
              {!isAdding && (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    padding: "8px 16px", borderRadius: "10px",
                    fontSize: "12px", fontWeight: 600,
                    color: t.warning, background: "transparent",
                    border: `1px dashed ${t.warning}`, cursor: "pointer",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Log Task
                </button>
              )}
            </div>

            <div className="space-y-4">
              {tasks.map((task) => {
                const pc = getPriorityColors(task.priority);
                const sc = getStatusColors(task.status);
                return (
                  <div key={task.id} style={{
                    background: t.card2, borderRadius: "12px",
                    border: `1px solid ${task.status === "Completed" ? `${t.success}40` : t.border}`,
                    overflow: "hidden",
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 20px",
                      borderBottom: `1px solid ${t.border}`,
                      gap: "12px",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "14px", fontWeight: 600, color: t.text, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {task.taskName}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", flexWrap: "wrap" }}>
                          <span style={{
                            fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px",
                            background: pc.bg, color: pc.color, border: `1px solid ${pc.border}`,
                          }}>
                            {task.priority.toUpperCase()} PRIORITY
                          </span>
                          <DutyPairBadge name={task.assignedToName} size="sm" showAvatars={false} />
                          {task.dueDate && (
                            <span style={{ fontSize: "11px", color: t.muted, fontFamily: "monospace" }}>
                              Due: {new Date(task.dueDate).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        {STATUS_OPTIONS.map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setStatus(task.id, opt)}
                            style={{
                              padding: "4px 10px", borderRadius: "8px",
                              fontSize: "11px", fontWeight: 600,
                              background: task.status === opt ? sc.bg : "transparent",
                              color: task.status === opt ? sc.color : t.muted,
                              border: `1px solid ${task.status === opt ? sc.border : t.border}`,
                              cursor: "pointer",
                              transition: "all 0.15s",
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                    {task.description && (
                      <div style={{ padding: "10px 20px" }}>
                        <p style={{ fontSize: "12px", color: t.muted, margin: 0, lineHeight: 1.5 }}>
                          {task.description}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {isAdding && (
              <div style={{
                background: t.card, borderRadius: "12px",
                border: `2px dashed ${t.warning}`, padding: "20px 24px", marginTop: "16px",
              }}>
                <h4 style={{ fontSize: "14px", fontWeight: 600, color: t.text, margin: "0 0 16px" }}>New Maintenance Task</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Task Name <span style={{ color: "#EF4444" }}>*</span></label>
                    <input value={newTask.taskName} onChange={(e) => setNewTask(p => ({ ...p, taskName: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}
                      placeholder="e.g., Replace backup UPS battery, Re-align microwave dish..." />
                  </div>
                  <div className="md:col-span-2">
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Description</label>
                    <textarea value={newTask.description} onChange={(e) => setNewTask(p => ({ ...p, description: e.target.value }))} rows={2}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none", resize: "vertical" }}
                      placeholder="Details of the outstanding maintenance..." />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Priority</label>
                    <select value={newTask.priority} onChange={(e) => setNewTask(p => ({ ...p, priority: e.target.value as FaultPriority }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}>
                      {PRIORITY_OPTIONS.map(pr => <option key={pr} value={pr}>{pr}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Assign To (Technician)</label>
                    <select value={newTask.assignedToId} onChange={(e) => setNewTask(p => ({ ...p, assignedToId: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}>
                      <option value="">Unassigned</option>
                      {technicians.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Due Date</label>
                    <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask(p => ({ ...p, dueDate: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={handleAddTask}
                    disabled={!newTask.taskName.trim()}
                    style={{
                      padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
                      color: "#fff", background: newTask.taskName.trim() ? t.warning : t.muted,
                      border: "none", cursor: newTask.taskName.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Add to Task Log
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    style={{
                      padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
                      color: t.text, background: "transparent", border: `1px solid ${t.border}`, cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", paddingTop: "20px", borderTop: `1px solid ${t.border}` }}>
          <button type="button" onClick={onBack}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 600, color: t.text, background: "transparent", border: `1px solid ${t.border}`, cursor: "pointer", minHeight: "44px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Back to Section E
          </button>
          <button type="button" onClick={() => onSave({ tasks })}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px " + (pendingCount > 0 ? "24px" : "32px"), borderRadius: "12px", fontSize: "14px", fontWeight: 600, color: "#fff", background: t.brand, border: "none", cursor: "pointer", minHeight: "44px" }}>
            Proceed to Signing & Accepting
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
