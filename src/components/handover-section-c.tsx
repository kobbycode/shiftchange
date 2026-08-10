"use client";

import * as React from "react";
import { Station, StationStatus, Fault } from "@/lib/mock-db";

export interface SectionCStationData {
  stationId: string;
  stationName: string;
  status: StationStatus;
  remarks: string;
}

export interface SectionCData {
  stations: SectionCStationData[];
}

interface HandoverSectionCProps {
  stations: Station[];
  faults?: Fault[];
  onComplete: (data: SectionCData) => void;
  onBack: () => void;
  theme: Record<string, string>;
}

const STATUS_OPTIONS: StationStatus[] = ["OK", "Fault", "Maintenance", "Off Air", "Signal Loss", "Emergency"];

const DEFAULT_OK_REMARKS = "All systems operating normally";

const STATUS_COLORS: Record<StationStatus, { bg: string; text: string; dot: string }> = {
  "OK": { bg: "rgba(16,185,129,.12)", text: "#10B981", dot: "#10B981" },
  "Fault": { bg: "rgba(245,158,11,.12)", text: "#F59E0B", dot: "#F59E0B" },
  "Maintenance": { bg: "rgba(245,158,11,.12)", text: "#F59E0B", dot: "#F59E0B" },
  "Off Air": { bg: "rgba(239,68,68,.12)", text: "#EF4444", dot: "#EF4444" },
  "Signal Loss": { bg: "rgba(239,68,68,.12)", text: "#EF4444", dot: "#EF4444" },
  "Emergency": { bg: "rgba(239,68,68,.12)", text: "#EF4444", dot: "#EF4444" },
};

export function HandoverSectionC({
  stations,
  faults = [],
  onComplete,
  onBack,
  theme: t,
}: HandoverSectionCProps) {
  // Remarks for the station's current (unresolved) fault — any shift, so carried-over faults are found
  const faultRemarksFor = (stationId: string): string | undefined => {
    const fault = faults.find(f => f.station_id === stationId && f.status !== "Resolved");
    return fault?.description;
  };

  // For a non-OK card, show the fault remarks — never the "all OK" boilerplate text
  const remarksFor = (station: Station): string => {
    if (station.current_status === "OK") return station.remarks || "";
    const faultRemarks = faultRemarksFor(station.id);
    if (faultRemarks) return faultRemarks;
    return station.remarks && station.remarks !== DEFAULT_OK_REMARKS ? station.remarks : "";
  };

  const [stationData, setStationData] = React.useState<SectionCStationData[]>(
    () => stations.map(s => ({
      stationId: s.id,
      stationName: s.name,
      status: s.current_status,
      remarks: remarksFor(s),
    }))
  );

  const updateStation = (stationId: string, field: keyof SectionCStationData, value: string) => {
    setStationData(prev => prev.map(s => {
      if (s.stationId !== stationId) return s;
      const next = { ...s, [field]: value };
      if (field === "status" && value !== "OK" && (!s.remarks.trim() || s.remarks === DEFAULT_OK_REMARKS)) {
        const faultRemarks = faultRemarksFor(stationId);
        if (faultRemarks) next.remarks = faultRemarks;
        else next.remarks = "";
      }
      return next;
    }));
  };

  const handleProceed = () => {
    onComplete({ stations: stationData });
  };

  const logoMap: Record<string, string> = {
    "Joy FM": "/stations/joy.png",
    "Adom FM": "/stations/adom.png",
    "Asempa FM": "/stations/asempa.png",
    "Hitz FM": "/stations/hitz.png",
  };

  return (
    <div style={{
      background: t.card,
      borderRadius: "16px",
      border: `2px solid ${t.info}40`,
      boxShadow: t.shadowLg,
      overflow: "hidden",
    }}>
      <div style={{
        background: `linear-gradient(135deg, ${t.info}, ${t.info}cc)`,
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
              SECTION C — BROADCAST STATUS
            </h2>
            <p style={{ fontSize: "13px", color: "rgba(255,255,255,.75)", margin: "4px 0 0" }}>
              Outgoing Staff reviews and updates on-air status for each channel
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: "24px 32px 32px" }}>
        <div className="space-y-4">
          {stationData.map((sd) => {
            // Custom statuses (set from Current Shift) are free text — never crash on unknown values
            const colors = STATUS_COLORS[sd.status] ?? STATUS_COLORS["Maintenance"];
            const statusOptions = STATUS_OPTIONS.includes(sd.status)
              ? STATUS_OPTIONS
              : [...STATUS_OPTIONS, sd.status];
            return (
              <div key={sd.stationId} style={{
                background: t.card2,
                borderRadius: "12px",
                border: `1px solid ${t.border}`,
                overflow: "hidden",
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "14px",
                  padding: "16px 20px",
                  borderBottom: `1px solid ${t.border}`,
                }}>
                  <div style={{
                    width: "40px", height: "40px", borderRadius: "10px",
                    background: "#fff", border: `1px solid ${t.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: "4px",
                  }}>
                    <img
                      src={logoMap[sd.stationName] || "/stations/joy.png"}
                      alt={sd.stationName}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: "15px", fontWeight: 700, color: t.text, margin: 0 }}>{sd.stationName}</p>
                    <p style={{ fontSize: "11px", color: t.muted, margin: "2px 0 0" }}>Broadcasting</p>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    padding: "4px 12px", borderRadius: "9999px",
                    background: colors.bg, color: colors.text,
                    fontSize: "11px", fontWeight: 700,
                  }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: colors.dot }} />
                    {sd.status}
                  </div>
                </div>

                <div style={{ padding: "16px 20px" }}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>On-Air Status</label>
                      <select
                        value={sd.status}
                        onChange={(e) => updateStation(sd.stationId, "status", e.target.value)}
                        style={{
                          width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                          border: `1px solid ${t.border}`, background: t.card, color: t.text,
                          outline: "none", cursor: "pointer",
                        }}
                      >
                        {statusOptions.map(opt => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: t.muted, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: "5px" }}>Remarks</label>
                      <input
                        value={sd.remarks}
                        onChange={(e) => updateStation(sd.stationId, "remarks", e.target.value)}
                        placeholder="Station remarks..."
                        style={{
                          width: "100%", padding: "10px 14px", borderRadius: "8px", fontSize: "13px",
                          border: `1px solid ${t.border}`, background: t.card, color: t.text,
                          outline: "none",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
            Back to Section B
          </button>
          <button
            type="button"
            onClick={handleProceed}
            style={{
              display: "flex", alignItems: "center", gap: "8px",
              padding: "12px 32px", borderRadius: "12px",
              fontSize: "14px", fontWeight: 600,
              color: "#fff", background: t.info,
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
