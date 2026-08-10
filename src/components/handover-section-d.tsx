"use client";

import * as React from "react";
import toast from "react-hot-toast";
import { Fault, FaultStatus, FaultPriority, Station, User } from "@/lib/mock-db";

export interface SectionDFaultData {
  id: string;
  description: string;
  timeDetected: string;
  actionTaken: string;
  status: FaultStatus;
  assignedToId?: string;
}

export interface SectionDData {
  faults: SectionDFaultData[];
}

interface HandoverSectionDProps {
  faults: Fault[];
  stations: Station[];
  users: User[];
  currentUserId: string;
  onSave: (data: SectionDData) => void;
  onBack: () => void;
  theme: Record<string, string>;
}

const FAULT_CATEGORIES = [
  "Transmitter", "Microwave Link", "Studio Console", "Power Supply",
  "Telecom / Fiber", "Antenna System", "Audio Processor", "Other",
];

const STATUS_OPTIONS: FaultStatus[] = ["Open", "Working", "Monitoring", "Resolved", "Escalated"];
const PRIORITY_OPTIONS: FaultPriority[] = ["Low", "Medium", "High", "Critical"];

const STATUS_COLORS: Record<FaultStatus, string> = {
  "Open": "#EF4444",
  "Working": "#F59E0B",
  "Monitoring": "#3B82F6",
  "Resolved": "#10B981",
  "Escalated": "#8B5CF6",
};

export function HandoverSectionD({
  faults: existingFaults,
  stations,
  users,
  currentUserId,
  onSave,
  onBack,
  theme: t,
}: HandoverSectionDProps) {
  const [faults, setFaults] = React.useState<SectionDFaultData[]>(
    () => existingFaults.map(f => ({
      id: f.id,
      stationId: f.station_id,
      category: f.category,
      description: f.description,
      timeDetected: new Date(f.time_detected).toLocaleString([], {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
      actionTaken: f.action_taken || "",
      status: f.status,
      priority: f.priority,
      assignedToId: f.assigned_engineer_id || "",
    }))
  );

  const [isAdding, setIsAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [showAssignmentError, setShowAssignmentError] = React.useState(false);

  const needsAssignment = (f: SectionDFaultData) => f.status !== "Resolved" && !f.assignedToId;

  const [newFault, setNewFault] = React.useState({
    description: "",
    timeDetected: new Date().toLocaleString([], {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
    actionTaken: "",
    status: "Open" as FaultStatus,
    assignedToId: "",
  });

  const handleAddFault = () => {
    if (!newFault.description.trim()) return;
    const id = `fault-temp-${Date.now()}`;
    setFaults(prev => [...prev, {
      id,
      description: newFault.description,
      timeDetected: newFault.timeDetected || new Date().toLocaleString([], {
        year: "numeric", month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      }),
      actionTaken: newFault.actionTaken,
      status: newFault.status,
      assignedToId: newFault.assignedToId,
    }]);
    setNewFault({ description: "", timeDetected: new Date().toLocaleString([], {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    }), actionTaken: "", status: "Open", assignedToId: "" });
    setIsAdding(false);
  };

  const handleProceed = () => {
    const unassigned = faults.filter(needsAssignment);
    if (unassigned.length > 0) {
      setShowAssignmentError(true);
      toast.error(`${unassigned.length} open fault(s) need a technician assigned before proceeding`);
      return;
    }
    onSave({ faults });
  };

  const getStationName = (stationId: string) =>
    stations.find(s => s.id === stationId)?.name || "Unknown";

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
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              SECTION D — ACTIVE FAULT / ACTIVITY
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Outgoing Staff logs faults and activities detected during the shift
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 32px 32px" }}>
        {faults.length === 0 && !isAdding ? (
          <div style={{
            textAlign: "center", padding: "40px 20px",
            background: t.card2, borderRadius: "12px",
            border: `1px dashed ${t.border}`,
          }}>
            <p style={{ fontSize: "14px", color: t.muted, marginBottom: "12px" }}>No faults logged during this shift.</p>
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
              Log Fault / Activity
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {faults.map((f, idx) => {
              const statColor = STATUS_COLORS[f.status];
              return (
                <div key={f.id} style={{
                  background: t.card2, borderRadius: "12px",
                  border: `1px solid ${needsAssignment(f) && showAssignmentError ? "#EF4444" : t.border}`,
                  boxShadow: needsAssignment(f) && showAssignmentError ? "0 0 0 3px #EF444422" : "none",
                  overflow: "hidden",
                }}>
                    <div style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "14px 20px",
                      borderBottom: `1px solid ${t.border}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          background: `${t.warning}20`, color: t.warning,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 700,
                        }}>{idx + 1}</span>
                        <div>
                          <p style={{ fontSize: "13px", fontWeight: 600, color: t.text, margin: 0 }}>{f.description.substring(0, 60) || "Fault / Activity"}</p>
                          <p style={{ fontSize: "11px", color: t.muted, margin: "1px 0 0" }}>{f.timeDetected}</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <select
                          value={f.status}
                          onChange={(e) => {
                            const newStatus = e.target.value as FaultStatus;
                            setFaults(prev => prev.map(f2 => f2.id === f.id ? { ...f2, status: newStatus } : f2));
                          }}
                          style={{
                            padding: "4px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 700,
                            background: `${statColor}18`, color: statColor,
                            border: `1px solid ${statColor}40`, outline: "none", cursor: "pointer",
                          }}
                        >
                          {STATUS_OPTIONS.map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  <div style={{ padding: "16px 20px" }}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Describe Fault / Activity</label>
                        <p style={{ fontSize: "13px", color: t.text, margin: 0, lineHeight: 1.5 }}>{f.description}</p>
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Time Detected / Reported</label>
                        <p style={{ fontSize: "13px", color: t.text, margin: 0 }}>{f.timeDetected}</p>
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Action Taken</label>
                        <p style={{ fontSize: "13px", color: t.text, margin: 0 }}>{f.actionTaken || "None"}</p>
                      </div>
                      <div>
                        <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>
                          Assign Fix To (Technician) {f.status !== "Resolved" && <span style={{ color: "#EF4444" }}>*</span>}
                        </label>
                        <select
                          value={f.assignedToId || ""}
                          onChange={(e) => {
                            setShowAssignmentError(false);
                            setFaults(prev => prev.map(f2 => f2.id === f.id ? { ...f2, assignedToId: e.target.value } : f2));
                          }}
                          style={{
                            width: "100%", padding: "8px 12px", borderRadius: "8px", fontSize: "13px",
                            border: `1px solid ${needsAssignment(f) && showAssignmentError ? "#EF4444" : t.border}`,
                            background: t.card, color: t.text, outline: "none", cursor: "pointer",
                          }}
                        >
                          <option value="">{f.status !== "Resolved" ? "Unassigned — Required" : "Unassigned"}</option>
                          {users.map(u => (
                            <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                          ))}
                        </select>
                        {needsAssignment(f) && showAssignmentError && (
                          <p style={{ fontSize: "11px", color: "#EF4444", margin: "4px 0 0", fontWeight: 600 }}>
                            Assign a technician to this fault before proceeding
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isAdding && (
              <div style={{
                background: t.card, borderRadius: "12px",
                border: `2px dashed ${t.warning}`, padding: "20px 24px",
              }}>
                <h4 style={{ fontSize: "14px", fontWeight: 600, color: t.text, marginBottom: "16px" }}>New Fault / Activity</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Describe Fault / Activity</label>
                    <textarea value={newFault.description} onChange={(e) => setNewFault(p => ({ ...p, description: e.target.value }))} rows={2}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none", resize: "vertical" }}
                      placeholder="Describe the fault or activity..." />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Time Detected / Reported To You</label>
                    <input type="datetime-local" value={newFault.timeDetected} onChange={(e) => setNewFault(p => ({ ...p, timeDetected: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Action Taken</label>
                    <input value={newFault.actionTaken} onChange={(e) => setNewFault(p => ({ ...p, actionTaken: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}
                      placeholder="e.g., Monitoring, Reset, Escalated" />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Status</label>
                    <select value={newFault.status} onChange={(e) => setNewFault(p => ({ ...p, status: e.target.value as FaultStatus }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Assigned To (Technician)</label>
                    <select value={newFault.assignedToId} onChange={(e) => setNewFault(p => ({ ...p, assignedToId: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}>
                      <option value="">Unassigned</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                  <button
                    type="button"
                    onClick={handleAddFault}
                    disabled={!newFault.description.trim()}
                    style={{
                      padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
                      color: "#fff", background: newFault.description.trim() ? t.warning : t.muted,
                      border: "none", cursor: newFault.description.trim() ? "pointer" : "not-allowed",
                    }}
                  >
                    Add to Log
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

            {!isAdding && (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600,
                  color: t.warning, background: "transparent",
                  border: `1px dashed ${t.warning}`, cursor: "pointer",
                  width: "100%", justifyContent: "center",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add Another Fault / Activity
              </button>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", paddingTop: "20px", borderTop: `1px solid ${t.border}` }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "12px 24px", borderRadius: "12px",
              fontSize: "14px", fontWeight: 600,
              color: t.text, background: "transparent",
              border: `1px solid ${t.border}`, cursor: "pointer",
              minHeight: "44px",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Back to Section C
          </button>
          <button
            type="button"
            onClick={handleProceed}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "12px 32px", borderRadius: "12px",
              fontSize: "14px", fontWeight: 600,
              color: "#fff", background: t.warning,
              border: "none", cursor: "pointer",
              minHeight: "44px",
            }}
          >
            Proceed to Handover
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
