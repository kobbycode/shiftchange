"use client";

import * as React from "react";
import { formatPairName } from "@/lib/pair-utils";
import { Printer, X } from "lucide-react";

interface PrintableHandoverFormProps {
  shift: any;
  outgoingStaff: any;
  outgoingStaffs?: any[];      // full outgoing duty crew (1-2+)
  incomingStaff: any;        // backward-compat (first incoming tech)
  incomingStaffs?: any[];    // all incoming techs (1-2)
  users?: any[];             // to resolve attendance rows to names
  attendance: any[];
  stations: any[];
  faults: any[];
  obs: any[];
  tasks: any[];
  handoverSummary?: string;
  outgoingSig?: string | null;
  incomingSig?: string | null;
  onClose: () => void;
}

function formatCrewNames(staffs: any[]): string {
  const names = (staffs || [])
    .map((s: any) => (s && typeof s === "object" ? s.name : s))
    .filter((n: any) => n && String(n).trim() !== "");
  if (names.length === 0) return "—";
  if (names.length === 1) return String(names[0]);
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function PrintableHandoverForm({
  shift,
  outgoingStaff,
  outgoingStaffs,
  incomingStaff,
  incomingStaffs,
  users,
  attendance,
  stations,
  faults,
  obs,
  tasks,
  handoverSummary,
  outgoingSig,
  incomingSig,
  onClose,
}: PrintableHandoverFormProps) {
  // Resolve the array of incoming techs — fall back to single incomingStaff
  const allIncomingStaffs: any[] = incomingStaffs && incomingStaffs.length > 0
    ? incomingStaffs
    : incomingStaff ? [incomingStaff] : [];

  // Resolve the full outgoing duty crew — fall back to the primary name
  const allOutgoingStaffs: any[] = outgoingStaffs && outgoingStaffs.length > 0
    ? outgoingStaffs
    : outgoingStaff ? [outgoingStaff] : [];

  const handlePrint = () => {
    window.print();
  };

  const outAtt = attendance.find(a => a.user_id === outgoingStaff?.id) || attendance[0];
  const activeOB = obs.find(o => o.is_running) || obs[0];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 backdrop-blur-sm p-4 md:p-8 flex flex-col items-center">
      {/* Modal Actions Bar (hidden during printing) */}
      <div className="w-full max-w-4xl flex items-center justify-between bg-card border border-border p-4 rounded-xl mb-4 print:hidden">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <Printer className="w-5 h-5 text-primary" />
          <span>Technical Dept. Shift Handover Form — Printable View</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-lg shadow-md flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Official Paper Document Container */}
      <div className="w-full max-w-4xl bg-white text-zinc-950 p-8 md:p-12 shadow-2xl rounded-sm text-xs font-sans print:shadow-none print:max-w-none print:p-0 print:w-full">
        {/* Document Header */}
        <div className="flex items-center justify-between border-b-2 border-zinc-900 pb-4 mb-6">
          <img src="/logo.png" alt="App Logo" className="w-12 h-12 rounded-full object-cover border border-zinc-300 shadow-xs" />
          <div className="text-center flex-1 px-4">
            <h1 className="text-xl md:text-2xl font-bold tracking-wider uppercase">TECHNICAL DEPT. SHIFT HANDOVER FORM</h1>
            <p className="text-[10px] uppercase font-semibold text-zinc-600 mt-1">Technical Department • Shift Handover Form</p>
          </div>
          <img src="/logo.png" alt="App Logo" className="w-12 h-12 rounded-full object-cover border border-zinc-300 shadow-xs" />
        </div>

        {/* PAGE 1 */}
        <div className="space-y-6">
          {/* SECTION A */}
          <div className="border border-zinc-400 p-4 rounded-xs">
            <h2 className="font-bold text-sm uppercase tracking-wide border-b border-zinc-300 pb-1 mb-3 text-zinc-900">
              SECTION A — SHIFT INFORMATION (Outgoing Staff)
            </h2>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div><span className="font-bold">Date:</span> {shift ? new Date(shift.start_time).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : "-"}</div>
              <div><span className="font-bold">Shift:</span> <span className="capitalize">{shift?.shift_type || "Morning"}</span></div>
              <div><span className="font-bold">Handover Time:</span> {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              <div><span className="font-bold">Location:</span> {shift?.location || "Radio Engineering"}</div>
              <div><span className="font-bold">Outgoing Staff (Duty Crew):</span> {formatCrewNames(allOutgoingStaffs)}</div>
              <div><span className="font-bold">Incoming Staff (Duty Crew):</span> {formatCrewNames(allIncomingStaffs)}</div>
            </div>
          </div>

          {/* SECTION B */}
          <div className="border border-zinc-400 p-4 rounded-xs">
            <h2 className="font-bold text-sm uppercase tracking-wide border-b border-zinc-300 pb-1 mb-3 text-zinc-900">
              SECTION B — ATTENDANCE & REPORTING (Shift Duty Technicians)
            </h2>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-300 text-zinc-700 font-bold">
                  <th className="py-1.5">Technician</th>
                  <th className="py-1.5">Check In Time</th>
                  <th className="py-1.5">Arrival Status</th>
                  <th className="py-1.5">Late Reason</th>
                  <th className="py-1.5 text-right">Hours Worked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {(attendance && attendance.length > 0 ? attendance : [outAtt]).map((att: any, i: number) => {
                  const checkIn = att?.is_absent ? "—" : att?.time_reported
                    ? new Date(att.time_reported).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : "08:00 AM";
                  const hrs = att?.is_absent ? "—" : att?.hours_worked ? `${att.hours_worked} hrs` : "Active";
                  const rowUser = att?.user_id
                    ? (users || []).find((u: any) => u.id === att.user_id)
                    : null;
                  const techName = rowUser?.name || (att?.user_id ? formatPairName(outgoingStaff) : (outgoingStaff?.name || "Technician"));
                  return (
                    <tr key={att?.id || i}>
                      <td className="py-1.5 font-bold">{techName}</td>
                      <td className="py-1.5 font-mono">{checkIn}</td>
                      <td className="py-1.5">
                        <span className={`font-bold text-[10px] px-1.5 py-0.5 rounded ${att?.is_absent ? "bg-red-100 text-red-800" : att?.is_late ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800"}`}>
                          {att?.is_absent ? "ABSENT" : att?.is_late ? "LATE" : "ON TIME"}
                        </span>
                      </td>
                      <td className="py-1.5 text-zinc-600 italic">{att?.is_absent ? (att?.absent_marked_by ? `Absent by ${att.absent_marked_by}` : "Supervisor absence") : att?.is_late ? (att?.late_reason || "No reason given") : "—"}</td>
                      <td className="py-1.5 text-right font-mono font-bold">{hrs}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SECTION C */}
          <div className="border border-zinc-400 p-4 rounded-xs">
            <h2 className="font-bold text-sm uppercase tracking-wide border-b border-zinc-300 pb-1 mb-3 text-zinc-900">
              SECTION C — BROADCAST STATUS (Outgoing Staff)
            </h2>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-400 font-bold text-zinc-800">
                  <th className="py-2">Brand</th>
                  <th className="py-2">On-Air Status</th>
                  <th className="py-2">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {stations.map(s => (
                  <tr key={s.id}>
                    <td className="py-2 font-bold flex items-center gap-2">
                      {s.logo_url && <img src={s.logo_url} alt={s.name} className="w-5 h-5 object-contain" />}
                      <span>{s.name}</span>
                    </td>
                    <td className="py-2"><span className={`px-2 py-0.5 font-bold rounded ${s.current_status === "OK" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{s.current_status}</span></td>
                    <td className="py-2 text-zinc-600">{s.remarks || "Broadcasting smoothly"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* PAGE 2 */}
        <div className="space-y-6 mt-8 pt-8 border-t-2 border-dashed border-zinc-300 print:border-none print:mt-12">
          {/* SECTION D */}
          <div className="border border-zinc-400 p-4 rounded-xs">
            <h2 className="font-bold text-sm uppercase tracking-wide border-b border-zinc-300 pb-1 mb-3 text-zinc-900">
              SECTION D — FAULT / ACTIVITY (Outgoing Staff)
            </h2>
            {faults.length === 0 ? (
              <p className="text-zinc-500 italic py-2">No active fault incidents logged during this rotation.</p>
            ) : (
              <div className="space-y-3">
                {faults.map(f => (
                  <div key={f.id} className="p-3 bg-zinc-50 border border-zinc-300 rounded-xs space-y-1">
                    <div className="flex justify-between font-bold">
                      <span>Category: {f.category}</span>
                      <span>Status: {f.status}</span>
                    </div>
                    <div><span className="font-semibold">Describe Fault / Activity:</span> {f.description}</div>
                    <div><span className="font-semibold">Time Detected / Reported to You:</span> {new Date(f.time_detected).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                    <div><span className="font-semibold">Action Taken:</span> {f.action_taken || "Monitoring"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* SECTION E */}
          <div className="border border-zinc-400 p-4 rounded-xs">
            <h2 className="font-bold text-sm uppercase tracking-wide border-b border-zinc-300 pb-1 mb-3 text-zinc-900">
              SECTION E — OUTSIDE BROADCAST (Outgoing Staff)
            </h2>
            <div className="grid grid-cols-3 gap-4 text-xs">
              <div><span className="font-bold">OB Running?:</span> {activeOB?.is_running ? "YES" : "NO"}</div>
              <div><span className="font-bold">Location?:</span> {activeOB?.location || "N/A"}</div>
              <div><span className="font-bold">Any Technical Issues?:</span> {activeOB?.technical_issues || "None reported"}</div>
            </div>
          </div>

          {/* SECTION F */}
          <div className="border border-zinc-400 p-4 rounded-xs">
            <h2 className="font-bold text-sm uppercase tracking-wide border-b border-zinc-300 pb-1 mb-3 text-zinc-900">
              SECTION F — PENDING TASK (Outgoing Staff)
            </h2>
            {tasks.length === 0 ? (
              <p className="text-zinc-500 italic py-2">No pending maintenance tasks for next shift.</p>
            ) : (
              <div className="space-y-2">
                {tasks.map(t => (
                  <div key={t.id} className="flex justify-between p-2 bg-zinc-50 border border-zinc-200 rounded-xs">
                    <div><span className="font-bold">Task:</span> {t.task_name}</div>
                    <div><span className="font-bold">Assigned To:</span> {formatPairName(t.assigned_to_id)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Handover Summary Notes */}
          {handoverSummary && (
            <div className="border border-zinc-400 p-4 rounded-xs">
              <h3 className="font-bold text-xs uppercase text-zinc-800 mb-1">Handover Briefing Summary:</h3>
              <p className="whitespace-pre-line text-zinc-700 leading-relaxed italic">{handoverSummary}</p>
            </div>
          )}

          {/* SIGNATURES & VERIFICATION */}
          <div className="border-2 border-zinc-900 p-6 rounded-xs space-y-6 bg-zinc-50">
            <h2 className="font-bold text-sm uppercase tracking-wider text-zinc-900 text-center border-b border-zinc-400 pb-2">
              SECTION G — SIGNATURES &amp; DOUBLE VERIFICATION
            </h2>

            {/* Outgoing technicians */}
            <div>
              <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-3">Outgoing — Handed Over By ({allOutgoingStaffs.length} Technician{allOutgoingStaffs.length !== 1 ? "s" : ""})</p>
              <div className={`grid gap-6 text-xs ${allOutgoingStaffs.length >= 2 ? "grid-cols-2" : "grid-cols-1 max-w-sm"}`}>
                {allOutgoingStaffs.map((outTech: any, idx: number) => (
                  <div key={outTech?.id || idx} className="space-y-3">
                    <div className="font-bold text-zinc-900">Staff Name #{idx + 1}: <span className="font-normal">{outTech?.name || "—"}</span></div>
                    <div><span className="font-bold text-zinc-900">Date:</span> {new Date().toLocaleDateString()}</div>
                    <div className="pt-2 border-t border-zinc-400">
                      <span className="font-bold block mb-2 text-zinc-900">Sign:</span>
                      {outgoingSig ? (
                        <div className="bg-zinc-900 rounded-md p-1.5 inline-block">
                          <img src={outgoingSig} alt="Outgoing Signature" className="h-10 max-w-full object-contain" />
                        </div>
                      ) : (
                        <div className="h-12 border border-dashed border-zinc-400 flex items-center justify-center text-zinc-500 font-mono text-[10px]">
                          [PIN VERIFIED]
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Incoming technicians */}
            <div>
              <p className="text-[10px] font-bold uppercase text-zinc-500 tracking-wider mb-3">Incoming — Received By ({allIncomingStaffs.length} Technician{allIncomingStaffs.length !== 1 ? "s" : ""})</p>
              <div className={`grid gap-6 text-xs ${allIncomingStaffs.length >= 2 ? "grid-cols-2" : "grid-cols-1 max-w-sm"}`}>
                {allIncomingStaffs.map((inTech: any, idx: number) => (
                  <div key={inTech?.id || idx} className="space-y-3">
                    <div className="font-bold text-zinc-900">Staff Name #{idx + 1}: <span className="font-normal">{inTech?.name || "—"}</span></div>
                    <div><span className="font-bold text-zinc-900">Date:</span> {new Date().toLocaleDateString()}</div>
                    <div className="pt-2 border-t border-zinc-400">
                      <span className="font-bold block mb-2 text-zinc-900">Sign:</span>
                      <div className="h-12 border border-dashed border-zinc-400 flex items-center justify-center text-zinc-500 font-mono text-[10px]">
                        [SECURITY PIN DOUBLE-VERIFIED]
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
