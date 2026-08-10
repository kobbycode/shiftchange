"use client";

import * as React from "react";
import { Shift, User, ShiftType, getShiftTypeForTime } from "@/lib/mock-db";
import { DutyPairBadge } from "@/components/duty-pair-badge";

export interface SectionAData {
  date: string;
  shift: ShiftType;
  handoverTime: string;
  outgoingStaffName: string;
  incomingStaffId: string;       // kept for backward-compat (first selected)
  incomingStaffIds: string[];    // all selected incoming techs (1–2)
  location: string;
}

interface HandoverSectionAProps {
  activeShift: Shift;
  currentUser: User;
  activeOutgoingUsers?: User[];
  users: User[];
  absentTechIds?: Set<string>;   // technicians marked absent — never selectable
  onComplete: (data: SectionAData) => void;
  theme: Record<string, string>;
}

export function HandoverSectionA({ activeShift, currentUser, activeOutgoingUsers, users, absentTechIds, onComplete, theme: t }: HandoverSectionAProps) {
  const [incomingStaffIds, setIncomingStaffIds] = React.useState<string[]>([]);
  // Legacy shifts stored "Engineering" — normalize to "Radio Engineering"
  const [location, setLocation] = React.useState(
    () => (!activeShift.location || activeShift.location === "Engineering") ? "Radio Engineering" : activeShift.location
  );

  // Exclude outgoing technicians from the incoming selection list
  const outgoingIds = new Set((activeOutgoingUsers ?? [currentUser]).map(u => u.id));
  const eligibleIncoming = users.filter(u =>
    !outgoingIds.has(u.id) &&
    u.role !== "Admin" && u.role !== "Supervisor" &&
    !absentTechIds?.has(u.id)
  );

  const dateStr = new Date().toLocaleDateString([], {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
  const handoverTimeStr = new Date().toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit"
  });
  const [shiftType, setShiftType] = React.useState<ShiftType>(
    () => activeShift.shift_type || getShiftTypeForTime()
  );

  const canProceed = incomingStaffIds.length >= 1;

  const toggleIncoming = (userId: string) => {
    setIncomingStaffIds(prev => {
      if (prev.includes(userId)) return prev.filter(id => id !== userId);
      if (prev.length >= 2) return prev; // max 2 incoming techs
      return [...prev, userId];
    });
  };

  const handleProceed = () => {
    if (!canProceed) return;
    onComplete({
      date: dateStr,
      shift: shiftType,
      handoverTime: handoverTimeStr,
      outgoingStaffName: currentUser.name,
      incomingStaffId: incomingStaffIds[0],
      incomingStaffIds,
      location,
    });
  };

  return (
    <div style={{
      background: t.card,
      borderRadius: "16px",
      border: `2px solid ${t.brand}40`,
      boxShadow: t.shadowLg,
      overflow: "hidden",
    }}>
      {/* Header */}
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
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#fff", margin: 0, lineHeight: 1.2 }}>
              SECTION A — SHIFT INFORMATION
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Outgoing staff fills in shift details — select up to 2 incoming technicians
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "28px 32px 32px" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Date */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>Date</label>
            <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 500, background: t.card2, border: `1px solid ${t.border}`, color: t.text }}>
              {dateStr}
            </div>
          </div>

          {/* Shift */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>Shift</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {(["Morning", "Night"] as ShiftType[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setShiftType(s)}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 600,
                    border: `2px solid ${shiftType === s ? t.brand : t.border}`,
                    background: shiftType === s ? t.brandLight : t.card2,
                    color: shiftType === s ? t.brand : t.text,
                    cursor: "pointer", transition: "all 0.18s",
                  }}
                >
                  {s} {s === "Night" && <span style={{ fontSize: "10px", fontWeight: 500, opacity: 0.8 }}>— after 05:00 PM</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Handover Time */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>Handover Time</label>
            <div style={{ padding: "12px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 500, background: t.card2, border: `1px solid ${t.border}`, color: t.text }}>
              {handoverTimeStr}
            </div>
          </div>

          {/* Location */}
          <div>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "6px" }}>Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: "10px", fontSize: "14px", fontWeight: 500,
                background: t.card, border: `1px solid ${t.border}`, color: t.text, outline: "none",
              }}
              placeholder="Radio Engineering"
            />
          </div>
        </div>

        {/* Outgoing Technicians */}
        <div style={{ marginTop: "24px" }}>
          <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: "8px" }}>
            Outgoing Shift Technicians
          </label>
          <div style={{
            padding: "10px 16px", borderRadius: "10px",
            background: t.card2, border: `1px solid ${t.border}`,
            display: "flex", gap: "8px", flexWrap: "wrap"
          }}>
            {(activeOutgoingUsers && activeOutgoingUsers.length > 0 ? activeOutgoingUsers : [currentUser]).filter(u => !absentTechIds?.has(u.id)).map(u => (
              <DutyPairBadge key={u.id} name={u.name} role={u.role} size="md" />
            ))}
          </div>
        </div>

        {/* Incoming Technicians Multi-Select */}
        <div style={{ marginTop: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
            <label style={{ fontSize: "12px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Incoming Shift Technicians <span style={{ color: "#EF4444" }}>*</span>
            </label>
            <span style={{
              fontSize: "11px", fontWeight: 600, padding: "2px 10px", borderRadius: "9999px",
              background: incomingStaffIds.length > 0 ? t.successBg : t.card2,
              color: incomingStaffIds.length > 0 ? t.success : t.muted,
              border: `1px solid ${incomingStaffIds.length > 0 ? t.success + "40" : t.border}`,
            }}>
              {incomingStaffIds.length} / 2 selected
            </span>
          </div>

          {eligibleIncoming.length === 0 ? (
            <div style={{ padding: "16px", borderRadius: "12px", background: t.card2, border: `1px solid ${t.border}`, textAlign: "center", color: t.muted, fontSize: "13px" }}>
              No available incoming technicians found.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "10px" }}>
              {eligibleIncoming.map(u => {
                const selected = incomingStaffIds.includes(u.id);
                const maxReached = incomingStaffIds.length >= 2 && !selected;
                return (
                  <button
                    key={u.id}
                    type="button"
                    disabled={maxReached}
                    onClick={() => toggleIncoming(u.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "12px 14px", borderRadius: "12px", textAlign: "left",
                      border: `2px solid ${selected ? t.brand : t.border}`,
                      background: selected ? t.brandLight : t.card2,
                      cursor: maxReached ? "not-allowed" : "pointer",
                      opacity: maxReached ? 0.45 : 1,
                      transition: "all 0.18s",
                      boxShadow: selected ? `0 0 0 3px ${t.brandLight}` : "none",
                    }}
                  >
                    {/* Checkbox indicator */}
                    <div style={{
                      width: "20px", height: "20px", borderRadius: "6px", flexShrink: 0,
                      border: `2px solid ${selected ? t.brand : t.border}`,
                      background: selected ? t.brand : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      transition: "all 0.18s",
                    }}>
                      {selected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: "13px", fontWeight: 600, color: selected ? t.brand : t.text, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {u.name}
                      </p>
                      <p style={{ fontSize: "11px", color: t.muted, margin: "2px 0 0" }}>{u.role}</p>
                    </div>
                    {selected && (
                      <span style={{ fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "9999px", background: t.brand, color: "#fff", flexShrink: 0 }}>
                        #{incomingStaffIds.indexOf(u.id) + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {incomingStaffIds.length === 2 && (
            <p style={{ fontSize: "11px", color: t.success, marginTop: "8px", fontWeight: 600 }}>
              ✓ Both incoming technicians selected. Maximum of 2 reached.
            </p>
          )}
          {incomingStaffIds.length === 0 && (
            <p style={{ fontSize: "11px", color: t.muted, marginTop: "8px", fontStyle: "italic" }}>
              Select 1 or 2 incoming technicians who will take over this shift.
            </p>
          )}
        </div>

        {/* Proceed Button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "28px", paddingTop: "20px", borderTop: `1px solid ${t.border}` }}>
          <button
            type="button"
            disabled={!canProceed}
            onClick={handleProceed}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "12px 32px", borderRadius: "12px",
              fontSize: "14px", fontWeight: 600,
              color: "#fff",
              background: canProceed ? t.brand : t.muted,
              border: "none", cursor: canProceed ? "pointer" : "not-allowed",
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
