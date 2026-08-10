"use client";

import * as React from "react";
import { MaintenanceCalendar } from "@/components/maintenance-calendar";
import { db } from "@/lib/firestore";
import { Station } from "@/lib/mock-db";
import { getSystemSettings, saveSystemSettings, DEFAULT_SETTINGS } from "@/lib/system-settings";
import { Settings as SettingsIcon, Radio, Calendar, Sliders, Bell, ShieldCheck, Check, Save } from "lucide-react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = React.useState<"general" | "stations" | "maintenance">("maintenance");
  const [stations, setStations] = React.useState<Station[]>([]);

  // System Settings State — loaded once from device storage, saved on submit
  const [smtpServer, setSmtpServer] = React.useState<string>(DEFAULT_SETTINGS.smtpServer);
  const [sessionTimeout, setSessionTimeout] = React.useState<string>(String(DEFAULT_SETTINGS.sessionTimeout));
  const [allowPinSignature, setAllowPinSignature] = React.useState(DEFAULT_SETTINGS.allowPinSignature);
  const [emailAlerts, setEmailAlerts] = React.useState(DEFAULT_SETTINGS.emailAlerts);

  React.useEffect(() => {
    const s = getSystemSettings();
    setSmtpServer(s.smtpServer);
    setSessionTimeout(String(s.sessionTimeout));
    setAllowPinSignature(s.allowPinSignature);
    setEmailAlerts(s.emailAlerts);
    db.stations.list().then(setStations);
  }, []);

  const handleSaveGeneralSettings = (e: React.FormEvent) => {
    e.preventDefault();
    saveSystemSettings({
      smtpServer,
      sessionTimeout: Math.max(0, Number(sessionTimeout) || 0),
      allowPinSignature,
      emailAlerts,
    });
    toast.success("System configurations saved on this device!");
  };

  const handleUpdateStationFreq = async (station: Station) => {
    const freq = prompt(`Enter transmission frequency for ${station.name} (e.g. 97.3 FM):`);
    if (!freq || !freq.trim()) return;
    try {
      await db.stations.updateFrequency(station.id, freq.trim());
      const updated = await db.stations.list();
      setStations(updated);
      toast.success(`${station.name} transmission frequency set to ${freq.trim()}!`);
    } catch {
      toast.error(`Failed to update ${station.name} frequency`);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div>
        <h2 className="text-xl font-bold tracking-tight">System Settings &amp; Maintenance</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Configure station frequencies, transmission rules, and review the scheduled maintenance calendar.</p>
      </div>

      {/* Tabs list */}
      <div className="flex items-center gap-2 border-b border-border text-xs overflow-x-auto whitespace-nowrap scrollbar-none pb-0.5">
        <button
          onClick={() => setActiveTab("maintenance")}
          className={`px-4 py-2 font-bold border-b-2 -mb-[2px] transition-colors cursor-pointer ${
            activeTab === "maintenance" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          } flex items-center gap-1.5`}
        >
          <Calendar className="w-4 h-4 shrink-0" /> Maintenance Scheduler
        </button>
        <button
          onClick={() => setActiveTab("stations")}
          className={`px-4 py-2 font-bold border-b-2 -mb-[2px] transition-colors cursor-pointer ${
            activeTab === "stations" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          } flex items-center gap-1.5`}
        >
          <Radio className="w-4 h-4 shrink-0" /> Station Management
        </button>
        <button
          onClick={() => setActiveTab("general")}
          className={`px-4 py-2 font-bold border-b-2 -mb-[2px] transition-colors cursor-pointer ${
            activeTab === "general" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          } flex items-center gap-1.5`}
        >
          <Sliders className="w-4 h-4 shrink-0" /> System Configurations
        </button>
      </div>

      {/* Content wrapper */}
      <div className="mt-4">
        {activeTab === "maintenance" && (
          <div className="space-y-6">
            <MaintenanceCalendar />
          </div>
        )}

        {activeTab === "stations" && (
          <div className="bg-card text-card-foreground border border-border/60 rounded-2xl p-5 md:p-6 space-y-4 shadow-xs">
            <div>
              <h3 className="font-bold text-sm text-foreground">Broadcast Channels</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Manage live frequencies, transmission power thresholds, and coverage parameters.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stations.map(station => (
                <div key={station.id} className="p-4 border border-border/60 bg-secondary/30 rounded-xl flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground">{station.name}</h4>
                    <p className="text-[10px] text-muted-foreground font-semibold">Status: {station.current_status}</p>
                    <p className="text-[10px] text-muted-foreground font-semibold">Freq: {station.frequency || "—"}</p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-xs">{station.remarks || "No active issues"}</p>
                  </div>
                  <button
                    onClick={() => handleUpdateStationFreq(station)}
                    className="px-2.5 py-1.5 bg-secondary border border-border hover:border-primary/40 text-foreground font-semibold text-[10px] rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    Adjust Freq
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "general" && (
          <form onSubmit={handleSaveGeneralSettings} className="bg-card text-card-foreground border border-border/60 rounded-2xl p-5 md:p-6 max-w-2xl space-y-6 text-xs shadow-xs">
            <div>
              <h3 className="font-bold text-sm text-foreground">Operational Configurations</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Global parameters governing security overrides and logging schedules.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">NOC SMTP Relay Server</label>
                <input
                  type="text"
                  value={smtpServer}
                  onChange={(e) => setSmtpServer(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Session Idle Timeout (Minutes)</label>
                <input
                  type="number"
                  value={sessionTimeout}
                  onChange={(e) => setSessionTimeout(e.target.value)}
                  className="w-full px-3 py-2 bg-secondary/50 border border-border rounded-lg text-foreground focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground">Allow PIN Code Handovers</h4>
                  <p className="text-[10px] text-muted-foreground">Allows technicians to sign off shift using security PINs if canvas drawing fails.</p>
                </div>
                <input
                  type="checkbox"
                  checked={allowPinSignature}
                  onChange={(e) => setAllowPinSignature(e.target.checked)}
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-border bg-secondary"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground">Critical Incident Email Alerts</h4>
                  <p className="text-[10px] text-muted-foreground">Sends automated email notification to engineers and supervisors for critical off-air faults.</p>
                </div>
                <input
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  className="w-4 h-4 rounded text-primary focus:ring-primary border-border bg-secondary"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-xl flex items-center justify-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" /> Save Configuration Settings
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
