"use client";

import * as React from "react";
import { OutsideBroadcast } from "@/lib/mock-db";

export interface SectionEOBData {
  id: string;
  programName: string;
  isRunning: boolean;
  location: string;
  technicalIssues: string;
  status: string;
}

export interface SectionEData {
  obs: SectionEOBData[];
}

interface HandoverSectionEProps {
  obs: OutsideBroadcast[];
  onSave: (data: SectionEData) => void;
  onBack: () => void;
  theme: Record<string, string>;
}

export function HandoverSectionE({
  obs: existingObs,
  onSave,
  onBack,
  theme: t,
}: HandoverSectionEProps) {
  const [obs, setObs] = React.useState<SectionEOBData[]>(
    () => existingObs.map(o => ({
      id: o.id,
      programName: o.program_name,
      isRunning: o.is_running,
      location: o.location || "",
      technicalIssues: o.technical_issues || "",
      status: o.status,
    }))
  );

  const [isAdding, setIsAdding] = React.useState(false);
  const [newOB, setNewOB] = React.useState({
    programName: "",
    location: "",
    technicalIssues: "",
    signalMethod: "Fiber" as string,
  });

  const handleAddOB = () => {
    if (!newOB.programName.trim()) return;
    const id = `ob-temp-${Date.now()}`;
    setObs(prev => [...prev, {
      id,
      programName: newOB.programName,
      isRunning: true,
      location: newOB.location,
      technicalIssues: newOB.technicalIssues,
      status: "Active",
    }]);
    setNewOB({ programName: "", location: "", technicalIssues: "", signalMethod: "Fiber" });
    setIsAdding(false);
  };

  const toggleRunning = (id: string) => {
    setObs(prev => prev.map(o =>
      o.id === id ? { ...o, isRunning: !o.isRunning, status: !o.isRunning ? "Active" : "Completed" } : o
    ));
  };

  const updateField = (id: string, field: keyof SectionEOBData, value: any) => {
    setObs(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
  };

  return (
    <div style={{
      background: t.card,
      borderRadius: "16px",
      border: `2px solid ${t.brand}40`,
      boxShadow: t.shadowLg,
      overflow: "hidden",
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${t.brand}, ${t.brand}cc)`,
        padding: "24px 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(255,255,255,.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              SECTION E — OUTSIDE BROADCAST
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Outgoing Staff reports on outside broadcast activities
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 32px 32px" }}>
        {obs.length === 0 && !isAdding ? (
          <div style={{
            textAlign: "center", padding: "40px 20px",
            background: t.card2, borderRadius: "12px",
            border: `1px dashed ${t.border}`,
          }}>
            <p style={{ fontSize: "14px", color: t.muted, marginBottom: "12px" }}>No outside broadcasts logged for this shift.</p>
            <button
              type="button"
              onClick={() => setIsAdding(true)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "10px 20px", borderRadius: "10px",
                fontSize: "13px", fontWeight: 600,
                color: "#fff", background: t.brand, border: "none", cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              Add Outside Broadcast
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {obs.map((ob) => (
              <div key={ob.id} style={{
                background: t.card2, borderRadius: "12px",
                border: `1px solid ${t.border}`, overflow: "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: `1px solid ${t.border}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      width: "8px", height: "8px", borderRadius: "50%",
                      background: ob.isRunning ? t.success : t.muted,
                    }} />
                    <p style={{ fontSize: "14px", fontWeight: 600, color: t.text, margin: 0 }}>
                      {ob.programName || "Outside Broadcast"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleRunning(ob.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: "5px",
                      padding: "4px 12px", borderRadius: "8px",
                      fontSize: "11px", fontWeight: 600,
                      background: ob.isRunning ? `${t.success}18` : t.card,
                      color: ob.isRunning ? t.success : t.muted,
                      border: `1px solid ${ob.isRunning ? `${t.success}40` : t.border}`,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor" }} />
                    {ob.isRunning ? "Running" : "Completed"}
                  </button>
                </div>

                <div style={{ padding: "16px 20px" }}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>OB Running?</label>
                      <div style={{
                        padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                        background: t.card, border: `1px solid ${t.border}`, color: t.text,
                      }}>
                        {ob.isRunning ? "YES" : "NO"}
                      </div>
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>Location</label>
                      <input
                        value={ob.location}
                        onChange={(e) => updateField(ob.id, "location", e.target.value)}
                        placeholder="OB location"
                        style={{
                          width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                          border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none",
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>Any Technical Issues?</label>
                      <input
                        value={ob.technicalIssues}
                        onChange={(e) => updateField(ob.id, "technicalIssues", e.target.value)}
                        placeholder="e.g., Signal interference, power fluctuation"
                        style={{
                          width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                          border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {isAdding && (
              <div style={{
                background: t.card, borderRadius: "12px",
                border: `2px dashed ${t.brand}`, padding: "20px 24px",
              }}>
                <h4 style={{ fontSize: "14px", fontWeight: 600, color: t.text, marginBottom: "16px" }}>New Outside Broadcast</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Program Name</label>
                    <input value={newOB.programName} onChange={(e) => setNewOB(p => ({ ...p, programName: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}
                      placeholder="Program name" />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Location</label>
                    <input value={newOB.location} onChange={(e) => setNewOB(p => ({ ...p, location: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}
                      placeholder="OB location" />
                  </div>
                  <div>
                    <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, display: "block", marginBottom: "4px" }}>Technical Issues</label>
                    <input value={newOB.technicalIssues} onChange={(e) => setNewOB(p => ({ ...p, technicalIssues: e.target.value }))}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px", border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none" }}
                      placeholder="Any issues?" />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                  <button type="button" onClick={handleAddOB} disabled={!newOB.programName.trim()}
                    style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, color: "#fff", background: newOB.programName.trim() ? t.brand : t.muted, border: "none", cursor: newOB.programName.trim() ? "pointer" : "not-allowed" }}>
                    Add to Log
                  </button>
                  <button type="button" onClick={() => setIsAdding(false)}
                    style={{ padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, color: t.text, background: "transparent", border: `1px solid ${t.border}`, cursor: "pointer" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!isAdding && (
              <button type="button" onClick={() => setIsAdding(true)}
                style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 20px", borderRadius: "10px", fontSize: "13px", fontWeight: 600, color: t.brand, background: "transparent", border: `1px dashed ${t.brand}`, cursor: "pointer", width: "100%", justifyContent: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add Another Outside Broadcast
              </button>
            )}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "28px", paddingTop: "20px", borderTop: `1px solid ${t.border}` }}>
          <button type="button" onClick={onBack}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 24px", borderRadius: "12px", fontSize: "14px", fontWeight: 600, color: t.text, background: "transparent", border: `1px solid ${t.border}`, cursor: "pointer", minHeight: "44px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>
            Back to Section D
          </button>
          <button type="button" onClick={() => onSave({ obs })}
            style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 32px", borderRadius: "12px", fontSize: "14px", fontWeight: 600, color: "#fff", background: t.brand, border: "none", cursor: "pointer", minHeight: "44px" }}>
            Proceed to Section F — Pending Task
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
