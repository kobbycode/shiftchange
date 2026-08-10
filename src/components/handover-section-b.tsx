"use client";

import * as React from "react";
import { Shift, Attendance, User } from "@/lib/mock-db";
import { DutyPairBadge } from "@/components/duty-pair-badge";

export interface SectionBData {
  timeReported: string;
  timeShiftStarts: string;
  timeLeaving: string;
  totalHours: string;
  // Per-technician lateness — one flag + reason per engineer, never one
  // shared reason for the whole shift
  lateFlags: Record<string, { is_late: boolean; reason: string }>;
}

interface HandoverSectionBProps {
  activeShift: Shift;
  currentUserName: string;
  attendance: Attendance[];
  users?: User[];
  onComplete: (data: SectionBData) => void;
  onBack: () => void;
  theme: Record<string, string>;
}

export function HandoverSectionB({
  activeShift,
  currentUserName,
  attendance,
  users = [],
  onComplete,
  onBack,
  theme: t,
}: HandoverSectionBProps) {
  // Ledger shows only duty engineers (Technicians) — admin/supervisor records excluded
  const techAttList = attendance.filter(a => {
    if (a.is_absent) return false; // supervisor-authorized absences are not on duty
    const u = users.find(usr => usr.id === a.user_id);
    return !u || u.role === "Technician";
  });

  const defaultAtt: Attendance | undefined = (() => {
    const u = users.find(usr => usr.id === activeShift.incoming_staff_id);
    if (u && u.role !== "Technician") return undefined;
    return {
      id: "att-default",
      shift_id: activeShift.id,
      user_id: activeShift.incoming_staff_id,
      time_reported: activeShift.start_time,
      hours_worked: 9.0,
      is_late: false,
    };
  })();

  const shiftAttList = techAttList.length > 0 ? techAttList : (defaultAtt ? [defaultAtt] : []);

  const primaryAtt = shiftAttList[0];
  const timeReported = primaryAtt
    ? new Date(primaryAtt.time_reported).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : new Date(activeShift.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const timeLeaving = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const shiftStart = new Date(primaryAtt?.time_reported || activeShift.start_time).getTime();
  const totalHours = ((Date.now() - shiftStart) / 3600000).toFixed(1);

  // Per-technician late flags, pre-filled from each attendance record so
  // reasons entered earlier (check-in, Section B revisit) are never lost
  const [lateFlags, setLateFlags] = React.useState<Record<string, { is_late: boolean; reason: string }>>(() => {
    const init: Record<string, { is_late: boolean; reason: string }> = {};
    for (const att of shiftAttList) {
      init[att.user_id] = { is_late: !!att.is_late, reason: att.late_reason || "" };
    }
    return init;
  });

  const handleProceed = () => {
    onComplete({
      timeReported,
      timeShiftStarts: timeReported,
      timeLeaving,
      totalHours,
      lateFlags,
    });
  };

  return (
    <div style={{
      background: t.card,
      borderRadius: "16px",
      border: `2px solid ${t.success}40`,
      boxShadow: t.shadowLg,
      overflow: "hidden",
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${t.success}, ${t.success}cc)`,
        padding: "24px 32px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "rgba(255,255,255,.2)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              SECTION B — ATTENDANCE & REPORTING
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Shift Duty Attendance Ledger ({shiftAttList.length} Technicians Checked In)
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 32px 32px" }}>
        {/* Duty Technicians Attendance Table */}
        <div style={{ marginBottom: "24px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "10px" }}>
            Shift Technicians Check-In Ledger
          </label>
          <div style={{ borderRadius: "12px", border: `1px solid ${t.border}`, overflow: "hidden", background: t.card2 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${t.border}`, background: t.card, color: t.muted, fontSize: "11px", textTransform: "uppercase" }}>
                  <th style={{ padding: "10px 16px" }}>Technician</th>
                  <th style={{ padding: "10px 16px" }}>Check In</th>
                  <th style={{ padding: "10px 16px" }}>Arrival Status</th>
                  <th style={{ padding: "10px 16px", textAlign: "right" }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {shiftAttList.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: "16px", textAlign: "center", fontSize: "12px", color: t.muted }}>
                      No technician check-ins recorded for this shift.
                    </td>
                  </tr>
                )}
                {shiftAttList.map((att) => {
                  const u = users.find(usr => usr.id === att.user_id);
                  const name = u ? u.name : "Technician";
                  const role = u ? u.role : "Technician";
                  const checkIn = new Date(att.time_reported).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                  const hrs = att.hours_worked > 0 ? `${att.hours_worked} hrs` : "Active";

                  return (
                    <tr key={att.id} style={{ borderBottom: `1px solid ${t.border}40` }}>
                      <td style={{ padding: "12px 16px" }}>
                        <DutyPairBadge name={name} role={role} size="sm" />
                      </td>
                      <td style={{ padding: "12px 16px", fontFamily: "monospace", color: t.text }}>{checkIn}</td>
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "9999px",
                          background: att.is_late ? t.warningBg : t.successBg,
                          color: att.is_late ? t.warning : t.success,
                        }}>
                          {att.is_late ? "LATE" : "ON TIME"}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right", fontWeight: 600, color: t.text }}>{hrs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>Time Shift Starts</label>
            <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 500, background: t.card2, border: `1px solid ${t.border}`, color: t.text }}>{timeReported}</div>
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>Time Leaving Duty</label>
            <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 500, background: t.card2, border: `1px solid ${t.border}`, color: t.text }}>{timeLeaving}</div>
          </div>

          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>Total Hours Worked</label>
            <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "20px", fontWeight: 700, background: t.successBg, border: `1px solid ${t.success}40`, color: t.success }}>{totalHours} hrs</div>
          </div>
        </div>

        <div style={{ marginTop: "24px", paddingTop: "20px", borderTop: `1px solid ${t.border}` }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: t.text, marginBottom: "16px" }}>Late Reporting</h3>
          <div style={{ background: t.card2, borderRadius: "12px", border: `1px solid ${t.border}`, padding: "20px 24px" }}>
            <p style={{ fontSize: "12px", color: t.muted, margin: "0 0 16px", lineHeight: 1.5 }}>
              Flag each technician individually and log their late reason — one entry per engineer, not one shared reason for the whole shift.
            </p>
            <div className="space-y-4">
              {shiftAttList.map((att) => {
                const u = users.find(usr => usr.id === att.user_id);
                const name = u ? u.name : "Technician";
                const flag = lateFlags[att.user_id] || { is_late: false, reason: "" };
                return (
                  <div key={att.id} style={{ background: t.card, borderRadius: "12px", border: `1px solid ${flag.is_late ? t.warning : t.border}`, padding: "16px 20px", transition: "border-color 0.2s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: flag.is_late ? "14px" : "0" }}>
                      <button
                        type="button"
                        onClick={() => setLateFlags(prev => ({
                          ...prev,
                          [att.user_id]: flag.is_late
                            ? { is_late: false, reason: "" }
                            : { is_late: true, reason: flag.reason }
                        }))}
                        style={{
                          width: "22px", height: "22px", borderRadius: "6px", border: `2px solid ${flag.is_late ? t.warning : t.border}`,
                          background: flag.is_late ? t.warning : "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.2s", flexShrink: 0,
                        }}
                        aria-label={`Toggle late reporting for ${name}`}
                      >
                        {flag.is_late && (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                          <DutyPairBadge name={name} size="sm" />
                          <span style={{ fontSize: "14px", fontWeight: 600, color: t.text }}>was late</span>
                        </div>
                        <p style={{ fontSize: "12px", color: t.muted, margin: "2px 0 0" }}>
                          {flag.is_late
                            ? `Flagged · ${name} will provide reason`
                            : "Check if this technician arrived late for handover"}
                        </p>
                      </div>
                    </div>

                    {flag.is_late && (
                      <div style={{ paddingTop: "14px", borderTop: `1px solid ${t.border}` }}>
                        <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
                          Reason provided by {name}
                        </label>
                        <textarea
                          value={flag.reason}
                          onChange={(e) => setLateFlags(prev => ({ ...prev, [att.user_id]: { ...prev[att.user_id], reason: e.target.value } }))}
                          rows={3}
                          placeholder={`${name} explains reason for lateness (leave blank if not provided)`}
                          style={{
                            width: "100%", padding: "12px 16px", borderRadius: "10px", fontSize: "14px", lineHeight: 1.6,
                            border: `1px solid ${t.border}`, background: t.card, color: t.text, outline: "none",
                            resize: "vertical", minHeight: "80px",
                          }}
                        />
                        {!flag.reason.trim() && (
                          <p style={{ fontSize: "11px", color: t.muted, marginTop: "6px", fontStyle: "italic" }}>
                            Reason left blank — supervisor may follow up directly.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

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
              minHeight: "44px", transition: "all 0.2s",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Section A
          </button>
          <button
            type="button"
            onClick={handleProceed}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "12px 32px", borderRadius: "12px",
              fontSize: "14px", fontWeight: 600,
              color: "#fff", background: t.success,
              border: "none", cursor: "pointer",
              minHeight: "44px", transition: "background 0.2s",
            }}
          >
            Proceed to Handover
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
