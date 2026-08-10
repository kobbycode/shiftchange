"use client";

import * as React from "react";
import { db } from "@/lib/firestore";
import { MockDB, Fault, Task, Attendance, OutsideBroadcast, Station, User } from "@/lib/mock-db";
import { formatPairName } from "@/lib/pair-utils";
import { DutyPairBadge } from "@/components/duty-pair-badge";
import { 
  FileBarChart, Calendar, Download, Printer, Search, 
  Users, AlertTriangle, Compass, ClipboardList, CheckCircle, Radio
} from "lucide-react";
import toast from "react-hot-toast";

export default function ReportsPage() {
  const [reportType, setReportType] = React.useState<"Daily" | "Weekly" | "Monthly" | "Custom">("Daily");
  const [startDate, setStartDate] = React.useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = React.useState(new Date().toISOString().split("T")[0]);

  // DB Aggregations
  const [stations, setStations] = React.useState<Station[]>([]);
  const [faults, setFaults] = React.useState<Fault[]>([]);
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [obs, setObs] = React.useState<OutsideBroadcast[]>([]);
  const [attendance, setAttendance] = React.useState<Attendance[]>([]);
  const [users, setUsers] = React.useState<User[]>([]);

  const [generating, setGenerating] = React.useState(false);
  const [reportData, setReportData] = React.useState<any | null>(null);

  // Attendance records belonging to Technicians only — Supervisors/Admins
  // must never appear on the engineers' shift attendance report
  const technicianAttendance = attendance.filter(att => {
    const u = users.find(x => x.id === att.user_id);
    return u && u.role === "Technician";
  });

  const compileReportData = React.useCallback(async (notify = false) => {
    setGenerating(true);
    try {
      const [allFaults, allTasks, allObs, allUsers, allStations] = await Promise.all([
        db.faults.list(),
        db.tasks.list(),
        db.outsideBroadcasts.list(),
        db.users.list(),
        db.stations.list()
      ]);
      
      setStations(allStations);
      setUsers(allUsers);
      const realAttendance = MockDB.getAttendance();

      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime() + 86400000; // end of day

      const filteredFaults = allFaults.filter(f => {
        const t = new Date(f.time_detected).getTime();
        return t >= start && t <= end;
      });

      const filteredObs = allObs.filter(o => {
        const t = new Date(o.created_at).getTime();
        return t >= start && t <= end;
      });

      const filteredTasks = allTasks.filter(tk => {
        const t = new Date(tk.created_at || Date.now()).getTime();
        return t >= start && t <= end;
      });

      const filteredAttendance = realAttendance.filter(att => {
        const t = new Date(att.time_reported).getTime();
        return t >= start && t <= end;
      });

      setFaults(filteredFaults);
      setTasks(filteredTasks.length > 0 ? filteredTasks : allTasks);
      setObs(filteredObs);
      setAttendance(filteredAttendance.length > 0 ? filteredAttendance : realAttendance);

      setReportData({
        generatedAt: new Date().toLocaleString(),
        summary: `This operational report details the technical department logs, transmission health indexes, and engineer shifts recorded between ${startDate} and ${endDate}.`,
      });

      if (notify) toast.success("Operations report generated from live database!");
    } catch (err) {
      if (notify) toast.error("Failed to compile report metrics.");
    } finally {
      setGenerating(false);
    }
  }, [startDate, endDate]);

  React.useEffect(() => {
    db.stations.list().then(setStations);
    db.users.list().then(setUsers);
    compileReportData(false);
  }, []);

  const handleGenerateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    await compileReportData(true);
  };

  const handlePrint = () => {
    if (!reportData) return;
    window.print();
  };

  const handleExportPDF = () => {
    if (!reportData) return;
    
    // Open dedicated printable window formatted specifically for saving/printing to PDF
    const printWindow = window.open("", "_blank", "width=900,height=800");
    if (!printWindow) {
      toast.error("Please allow popups to download the PDF report");
      window.print();
      return;
    }

    const docTitle = `NOC_Operations_Report_${startDate}_to_${endDate}`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${docTitle}</title>
          <style>
            @page { size: A4; margin: 15mm; }
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; color: #111827; background: #fff; margin: 0; padding: 20px; line-height: 1.5; }
            .header { border-bottom: 2px solid #7C3AED; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
            .header h1 { margin: 0; font-size: 18pt; font-weight: 700; color: #111827; }
            .header p { margin: 4px 0 0; font-size: 9pt; color: #6B7280; text-transform: uppercase; font-weight: 600; }
            .meta { text-align: right; font-size: 9pt; color: #4B5563; }
            .section { margin-bottom: 24px; page-break-inside: avoid; }
            .section-title { font-size: 12pt; font-weight: 700; color: #111827; border-bottom: 1px solid #E5E7EB; padding-bottom: 4px; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10pt; }
            th { text-align: left; background: #F3F4F6; padding: 6px 8px; font-size: 8pt; text-transform: uppercase; color: #374151; font-weight: 700; border-bottom: 1px solid #D1D5DB; }
            td { padding: 6px 8px; border-bottom: 1px solid #E5E7EB; color: #1F2937; }
            .tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8pt; font-weight: 700; text-transform: uppercase; }
            .tag-success { background: #DCFCE7; color: #15803D; }
            .tag-warning { background: #FEF3C7; color: #B45309; }
            .tag-danger { background: #FEE2E2; color: #B91C1C; }
            .footer { margin-top: 30px; border-top: 1px solid #E5E7EB; padding-top: 10px; font-size: 8pt; color: #9CA3AF; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>NOC Broadcast Engineering Handover Log</h1>
              <p>Technical Operations Department — Operational Report</p>
            </div>
            <div class="meta">
              <div><strong>Generated:</strong> ${reportData.generatedAt}</div>
              <div><strong>Range:</strong> ${startDate} to ${endDate}</div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">1. Executive Summary</div>
            <p>${reportData.summary}</p>
          </div>

          <div class="section">
            <div class="section-title">2. Engineer Shift Attendance (${technicianAttendance.length} Records)</div>
            <table>
              <thead>
                <tr>
                  <th>Technician</th>
                  <th>Check In</th>
                  <th>Arrival Status</th>
                  <th>Check Out</th>
                  <th>Hours</th>
                </tr>
              </thead>
              <tbody>
                ${technicianAttendance.map(att => {
                  const tech = users.find(u => u.id === att.user_id)?.name || "Technician";
                  const checkIn = new Date(att.time_reported).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  const checkOut = att.time_leaving ? new Date(att.time_leaving).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Active";
                  const statusTag = att.is_absent ? '<span class="tag tag-danger">ABSENT</span>' : att.is_late ? '<span class="tag tag-danger">LATE</span>' : '<span class="tag tag-success">ON TIME</span>';
                  return `
                    <tr>
                      <td><strong>${tech}</strong></td>
                      <td>${checkIn}</td>
                      <td>${statusTag}</td>
                      <td>${checkOut}</td>
                      <td>${att.hours_worked || 0} hrs</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">3. Fault & Incident Logs (${faults.length} Tickets)</div>
            <table>
              <thead>
                <tr>
                  <th>Station / Category</th>
                  <th>Description & Action Taken</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${faults.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#9CA3AF;">No faults recorded in this date range.</td></tr>' : faults.map(f => {
                  const st = stations.find(s => s.id === f.station_id)?.name || "Station";
                  const statusClass = f.status === "Resolved" ? "tag-success" : "tag-warning";
                  return `
                    <tr>
                      <td><strong>${st}</strong><br><small style="color:#6B7280">${f.category}</small></td>
                      <td><strong>${f.description}</strong>${f.action_taken ? `<br><small style="color:#059669">Action: ${f.action_taken}</small>` : ""}</td>
                      <td><span class="tag">${f.priority}</span></td>
                      <td><span class="tag ${statusClass}">${f.status}</span></td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">4. Outside Broadcast Summary</div>
            <table>
              <thead>
                <tr><th>Program</th><th>Location</th><th>Signal Method</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${obs.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:#9CA3AF;">No OB events tracked.</td></tr>' : obs.map(ob => `
                  <tr>
                    <td><strong>${ob.program_name}</strong></td>
                    <td>${ob.location}</td>
                    <td>${ob.signal_method}</td>
                    <td><strong>${ob.status}</strong></td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">5. Maintenance Tasks Progress</div>
            <table>
              <thead>
                <tr><th>Task</th><th>Assigned To</th><th>Priority</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${tasks.map(t => {
                  const assignee = users.find(u => u.id === t.assigned_to_id)?.name || "Unassigned";
                  return `<tr><td><strong>${t.task_name}</strong></td><td>${assignee}</td><td>${t.priority}</td><td><strong>${t.status}</strong></td></tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>

          <div class="section">
            <div class="section-title">6. Supervisor Audit: Individual Technician Performance Breakdown</div>
            ${users.filter(u => u.role === "Technician").map(tech => {
              const techFaults = faults.filter(f => f.reported_by_id === tech.id);
              const techAtt = technicianAttendance.filter(a => a.user_id === tech.id);
              const totalHours = techAtt.reduce((sum, a) => sum + (a.hours_worked || 0), 0);
              const techTasks = tasks.filter(t => t.assigned_to_id === tech.id);
              return `
                <div style="border:1px solid #E5E7EB;border-radius:8px;padding:12px;margin-bottom:12px;page-break-inside:avoid;">
                  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #E5E7EB;padding-bottom:6px;margin-bottom:8px;">
                    <strong>${tech.name} (${tech.role})</strong>
                    <small style="color:#6B7280;">${techAtt.length} Shifts (${totalHours} hrs)</small>
                  </div>
                  <table style="margin-top:4px;font-size:9pt;">
                    <tbody>
                      <tr>
                        <td style="width:33%;text-align:center;border:1px solid #F3F4F6;background:#F9FAFB;"><small style="color:#6B7280;">Faults Logged</small><br><strong>${techFaults.length}</strong></td>
                        <td style="width:33%;text-align:center;border:1px solid #F3F4F6;background:#F9FAFB;"><small style="color:#6B7280;">Tasks Assigned</small><br><strong>${techTasks.length}</strong></td>
                        <td style="width:33%;text-align:center;border:1px solid #F3F4F6;background:#F9FAFB;"><small style="color:#6B7280;">Attendance</small><br><strong>${techAtt.filter(a => !a.is_late && !a.is_absent).length} On-time</strong></td>
                      </tr>
                    </tbody>
                  </table>
                  ${techFaults.length > 0 ? `
                    <div style="margin-top:8px;">
                      <small style="font-weight:700;color:#374151;">Incidents Logged by ${tech.name}:</small>
                      <ul style="margin:4px 0 0 18px;padding:0;font-size:9pt;color:#4B5563;">
                        ${techFaults.slice(0, 3).map(tf => `<li>${tf.category}: ${tf.description} (${tf.status})</li>`).join("")}
                      </ul>
                    </div>
                  ` : ""}
                </div>
              `;
            }).join("")}
          </div>

          <div class="footer">
            Official Technical Operations Department PDF Report · Generated from NOC Wallboard System
          </div>

          <script>
            window.onload = function() {
              window.focus();
              setTimeout(function() { window.print(); }, 300);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleExportCSV = () => {
    if (!reportData) return;
    let csv = "REPORT INCIDENT LOGS\n";
    csv += "Fault ID,Station,Category,Priority,Status,Time Detected,Description,Action Taken / Remarks,Reported By\n";
    faults.forEach(f => {
      const st = stations.find(s => s.id === f.station_id)?.name || "";
      const reporter = users.find(u => u.id === f.reported_by_id)?.name || "";
      const desc = (f.description || "").replace(/"/g, '""');
      const action = (f.action_taken || "").replace(/"/g, '""');
      csv += `"${f.id}","${st}","${f.category}","${f.priority}","${f.status}","${f.time_detected}","${desc}","${action}","${reporter}"\n`;
    });

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `noc-operations-report-${startDate}-to-${endDate}.csv`;
    link.click();
    toast.success("CSV report table downloaded!");
  };

  return (
    <div className="space-y-6 text-left print:p-0 print:bg-white print:text-black">
      {/* Header - Hidden in Print */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Technical Reports Center</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Compile, print, or download operational summaries and incident records.</p>
        </div>
        
        {reportData && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-primary hover:bg-primary/90 text-white font-semibold text-xs rounded-xl cursor-pointer shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" /> Download PDF Report
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs rounded-xl cursor-pointer shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" /> Print View
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-secondary hover:bg-secondary/80 border border-border text-foreground font-semibold text-xs rounded-xl cursor-pointer shadow-xs transition-colors"
            >
              <Download className="w-4 h-4 text-emerald-500" /> Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Form Settings Card - Hidden in Print */}
      <div className="glass border border-border/60 rounded-2xl p-5 md:p-6 print:hidden">
        <form onSubmit={handleGenerateReport} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end text-xs">
          <div className="space-y-1">
            <label className="font-semibold text-foreground">Report Schedule Type</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-foreground font-medium outline-none"
            >
              <option value="Daily" className="bg-card text-foreground">Daily Report</option>
              <option value="Weekly" className="bg-card text-foreground">Weekly Report</option>
              <option value="Monthly" className="bg-card text-foreground">Monthly Report</option>
              <option value="Custom" className="bg-card text-foreground">Custom Date Range</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-foreground flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-primary" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-foreground font-medium cursor-pointer outline-none"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="font-semibold text-foreground flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-primary" /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-foreground font-medium cursor-pointer outline-none"
              required
            />
          </div>

          <button
            type="submit"
            disabled={generating}
            className="py-2 bg-primary hover:bg-primary/95 text-white font-semibold rounded-lg"
          >
            {generating ? "Compiling..." : "Generate Report"}
          </button>
        </form>
      </div>

      {/* Compiled Report Paper Sheet */}
      {reportData ? (
        <div className="bg-card print:bg-white text-card-foreground print:text-black border border-border/60 print:border-0 rounded-2xl print:rounded-none p-6 md:p-8 space-y-6 max-w-4xl mx-auto shadow-xl">
          {/* Official Letterhead */}
          <div className="flex justify-between items-start border-b-2 border-primary/40 pb-4">
            <div>
              <h1 className="text-lg font-bold text-foreground print:text-black tracking-tight">NOC Broadcast Engineering Handover Log</h1>
              <p className="text-[10px] text-muted-foreground uppercase font-semibold">Technical Operations Department</p>
            </div>
            <div className="text-right text-[10px] text-muted-foreground">
              <p>Generated: {reportData.generatedAt}</p>
              <p>Range: {startDate} to {endDate}</p>
            </div>
          </div>

          {/* Section 1: Executive Summary */}
          <div className="space-y-2 text-xs">
            <h3 className="text-sm font-bold text-foreground print:text-black flex items-center gap-1.5 border-b border-border pb-1">
              <FileBarChart className="w-4 h-4 text-primary" /> 1. Executive Summary
            </h3>
            <p className="text-muted-foreground print:text-zinc-700 leading-relaxed">
              {reportData.summary}
            </p>
          </div>

          {/* Section 2: Attendance log sheet */}
          <div className="space-y-3 text-xs">
            <h3 className="text-sm font-bold text-foreground print:text-black flex items-center gap-1.5 border-b border-border pb-1">
              <Users className="w-4 h-4 text-success" /> 2. Engineer Shift Attendance
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase font-bold">
                  <th className="py-2">Technician</th>
                  <th className="py-2">Check In (8:00 AM)</th>
                  <th className="py-2">Arrival Status</th>
                  <th className="py-2">Check Out (5:00 PM)</th>
                  <th className="py-2">Departure Status</th>
                  <th className="py-2 text-right">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-muted-foreground">
                {technicianAttendance.map((att) => {
                  const checkInMins = new Date(att.time_reported).getHours() * 60 + new Date(att.time_reported).getMinutes();
                  const lateBy = checkInMins - (8 * 60);
                  const checkOutMins = att.time_leaving
                    ? new Date(att.time_leaving).getHours() * 60 + new Date(att.time_leaving).getMinutes()
                    : null;
                  return (
                    <tr key={att.id}>
                      <td className="py-2 text-foreground font-semibold">
                        {users.find(u => u.id === att.user_id)?.name}
                      </td>
                      <td className="py-2 font-mono">
                        {new Date(att.time_reported).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2">
                        {att.is_absent ? (
                          <span className="text-destructive font-bold text-[9px] uppercase">
                            ABSENT{att.absent_marked_by ? ` — by ${att.absent_marked_by}` : ""}
                          </span>
                        ) : att.is_late ? (
                          <span className="text-destructive font-bold text-[9px] uppercase">
                            LATE +{lateBy}min{att.late_reason ? ` — ${att.late_reason}` : ""}
                          </span>
                        ) : (
                          <span className="text-success font-bold text-[9px] uppercase">ON TIME</span>
                        )}
                      </td>
                      <td className="py-2 font-mono">
                        {att.time_leaving
                          ? new Date(att.time_leaving).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : <span className="italic text-zinc-500">Still active</span>}
                      </td>
                      <td className="py-2">
                        {checkOutMins === null ? (
                          <span className="text-zinc-500 text-[9px] italic">—</span>
                        ) : att.is_early_departure ? (
                          <span className="text-warning font-bold text-[9px] uppercase">
                            EARLY -{Math.abs((checkOutMins ?? 0) - 17 * 60)}min
                          </span>
                        ) : att.overtime_minutes && att.overtime_minutes > 0 ? (
                          <span className="text-indigo-400 font-bold text-[9px] uppercase">
                            OT +{att.overtime_minutes}min
                          </span>
                        ) : (
                          <span className="text-success font-bold text-[9px] uppercase">ON TIME</span>
                        )}
                      </td>
                      <td className="py-2 text-right">{att.hours_worked} hrs</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Section 3: Fault incident tickets */}
          <div className="space-y-3 text-xs">
            <h3 className="text-sm font-bold text-foreground print:text-black flex items-center gap-1.5 border-b border-border pb-1">
              <AlertTriangle className="w-4 h-4 text-warning" /> 3. Fault &amp; Incident Logs
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase font-bold">
                  <th className="py-2 w-1/5">Station / Cat</th>
                  <th className="py-2 w-1/2">Incident Description &amp; Actions Taken</th>
                  <th className="py-2">Priority</th>
                  <th className="py-2">Status</th>
                  <th className="py-2 text-right">Time Logged</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-muted-foreground">
                {faults.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-3 text-center text-zinc-500 italic">No faults logged in this date range.</td>
                  </tr>
                ) : (
                  faults.map((f) => {
                    const stationName = stations.find(s => s.id === f.station_id)?.name || "Station";
                    const reporterName = users.find(u => u.id === f.reported_by_id)?.name || "Staff";
                    return (
                      <tr key={f.id} className="align-top">
                        <td className="py-2.5">
                          <p className="font-bold text-foreground print:text-black">{stationName}</p>
                          <p className="text-[10px] text-muted-foreground">{f.category}</p>
                        </td>
                        <td className="py-2.5 space-y-1 pr-4">
                          <p className="text-foreground print:text-black font-medium">{f.description}</p>
                          {f.action_taken && (
                            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 print:text-zinc-800 font-normal">
                              <span className="font-bold">Action Taken:</span> {f.action_taken}
                            </p>
                          )}
                          <p className="text-[9px] text-zinc-500">Reported by: {reporterName}</p>
                        </td>
                        <td className="py-2.5">
                          <span className="uppercase font-bold text-[9px] px-1.5 py-0.5 rounded border border-border">
                            {f.priority}
                          </span>
                        </td>
                        <td className="py-2.5 font-semibold">
                          <span className={f.status === "Resolved" ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}>
                            {f.status}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono text-[11px]">
                          {new Date(f.time_detected).toLocaleDateString([], { month: "short", day: "numeric" })}
                          <br />
                          <span className="text-[10px] text-zinc-500">
                            {new Date(f.time_detected).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Section 4: OB feeds */}
          <div className="space-y-3 text-xs">
            <h3 className="text-sm font-bold text-foreground print:text-black flex items-center gap-1.5 border-b border-border pb-1">
              <Compass className="w-4 h-4 text-indigo-400" /> 4. Outside Broadcast Summary
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase font-bold">
                  <th className="py-2">Program</th>
                  <th className="py-2">Location</th>
                  <th className="py-2">Signal Method</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-muted-foreground">
                {obs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-zinc-500 italic">No OB events tracked.</td>
                  </tr>
                ) : (
                  obs.map((ob) => (
                    <tr key={ob.id}>
                      <td className="py-2 font-semibold text-foreground">{ob.program_name}</td>
                      <td className="py-2">{ob.location}</td>
                      <td className="py-2">{ob.signal_method}</td>
                      <td className="py-2 text-right font-bold uppercase">{ob.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Section 5: Tasks summary */}
          <div className="space-y-3 text-xs">
            <h3 className="text-sm font-bold text-foreground print:text-black flex items-center gap-1.5 border-b border-border pb-1">
              <ClipboardList className="w-4 h-4 text-primary" /> 5. Maintenance Tasks Progress
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground text-[10px] uppercase font-bold">
                  <th className="py-2">Task</th>
                  <th className="py-2">Assigned To</th>
                  <th className="py-2">Priority</th>
                  <th className="py-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20 text-muted-foreground">
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td className="py-2 font-semibold text-foreground">{task.task_name}</td>
                    <td className="py-2">
                      {users.find(u => u.id === task.assigned_to_id)?.name || "Unassigned"}
                    </td>
                    <td className="py-2 font-bold text-[9px] uppercase">{task.priority}</td>
                    <td className="py-2 text-right font-bold uppercase">{task.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 6: Individual Technician Activity & Performance Breakdown */}
          <div className="space-y-4 text-xs pt-2">
            <h3 className="text-sm font-bold text-foreground print:text-black flex items-center gap-1.5 border-b border-border pb-1">
              <Users className="w-4 h-4 text-purple-500" /> 6. Supervisor Audit: Individual Technician Performance Breakdown
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {users.filter(u => u.role === "Technician").map(tech => {
                const techFaults = faults.filter(f => f.reported_by_id === tech.id);
                const techAtt = attendance.filter(a => a.user_id === tech.id);
                const totalHours = techAtt.reduce((sum, a) => sum + (a.hours_worked || 0), 0);
                const techTasks = tasks.filter(t => t.assigned_to_id === tech.id);

                return (
                  <div key={tech.id} className="p-3.5 rounded-xl border border-border/60 bg-card/40 space-y-2.5">
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                      <div className="flex items-center gap-2">
                        <DutyPairBadge name={tech.name} role={tech.role} size="sm" />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase bg-secondary px-2 py-0.5 rounded">
                        {techAtt.length} Shifts ({totalHours} hrs)
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="p-1.5 rounded bg-muted/30">
                        <p className="text-muted-foreground font-semibold">Faults Logged</p>
                        <p className="text-sm font-bold text-amber-500">{techFaults.length}</p>
                      </div>
                      <div className="p-1.5 rounded bg-muted/30">
                        <p className="text-muted-foreground font-semibold">Tasks Assigned</p>
                        <p className="text-sm font-bold text-blue-500">{techTasks.length}</p>
                      </div>
                      <div className="p-1.5 rounded bg-muted/30">
                        <p className="text-muted-foreground font-semibold">Attendance</p>
                        <p className="text-sm font-bold text-emerald-500">{techAtt.filter(a => !a.is_late && !a.is_absent).length} On-time</p>
                      </div>
                    </div>

                    {techFaults.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Incidents Logged by {tech.name}:</p>
                        <ul className="space-y-1 text-[11px] list-disc list-inside text-muted-foreground">
                          {techFaults.slice(0, 3).map(tf => (
                            <li key={tf.id} className="truncate">
                              <span className="font-semibold text-foreground">{tf.category}:</span> {tf.description} ({tf.status})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="glass border border-border/40 p-12 text-center text-xs text-muted-foreground">
          Input dates and click &ldquo;Generate Report&rdquo; to compile the operations letterhead summary.
        </div>
      )}
    </div>
  );
}

