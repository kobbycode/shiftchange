// Local Storage Mock Database Engine for Shift Handover System
// Simulates Supabase client-side interface when credentials are not present.

export type UserRole = "Technician" | "Supervisor" | "Admin";
export type ShiftType = "Morning" | "Night";
// Shift schedule: Morning = 08:00 AM – 05:00 PM, Night = 05:00 PM – 08:00 AM.
// Single source of truth for clock-based shift derivation (login, clock-in, handover).
export function getShiftTypeForTime(date: Date = new Date()): ShiftType {
  const hour = date.getHours();
  return hour >= 8 && hour < 17 ? "Morning" : "Night";
}
// Arrival status is anchored to the scheduled shift start, not the wall-clock time
// of the check-in: Morning shifts officially start 08:00, Night shifts 17:00.
// A check-in is LATE only when it exceeds the scheduled start by more than the grace period.
export function isLateCheckIn(checkIn: Date, shift: { shift_type: ShiftType; date: string }, graceMinutes: number = 30): boolean {
  const startHour = shift.shift_type === "Night" ? 17 : 8;
  const dateStr = shift.date && !isNaN(new Date(`${shift.date}T00:00:00`).getTime())
    ? shift.date
    : checkIn.toISOString().split("T")[0];
  const scheduledStart = new Date(`${dateStr}T${String(startHour).padStart(2, "0")}:00:00`);
  if (isNaN(scheduledStart.getTime())) return false;
  return checkIn.getTime() - scheduledStart.getTime() > graceMinutes * 60 * 1000;
}
export type StationStatus = "OK" | "Fault" | "Maintenance" | "Off Air" | "Signal Loss" | "Emergency";
export type FaultPriority = "Low" | "Medium" | "High" | "Critical";
export type FaultStatus = "Open" | "Working" | "Monitoring" | "Resolved" | "Escalated";
export type SignalMethod = "Fiber" | "Microwave" | "Satellite" | "IP" | "Cellular";
export type TaskStatus = "Todo" | "In Progress" | "Completed" | "Overdue";
export type ReportType = "Daily" | "Weekly" | "Monthly" | "Custom";
export type JobCategory = "Transmission" | "Equipment" | "Maintenance" | "Installation" | "Inspection" | "Other";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  pin: string; // Used for signature PIN verification (e.g. "1234")
  avatar_url?: string;
  created_at: string;
  is_default?: boolean; // false if user has changed their credentials
  business_id?: string; // Multi-tenant: which business this user belongs to
  auth_id?: string;     // Links to Supabase auth.users.id
}

export interface Station {
  id: string;
  name: string;
  logo_url?: string;
  current_status: StationStatus;
  remarks?: string;
  frequency?: string;
  updated_at: string | null;
}

export interface Shift {
  id: string;
  date: string;
  shift_type: ShiftType;
  location: string;
  outgoing_staff_id?: string;
  incoming_staff_id: string;
  start_time: string;
  end_time?: string;
  status: "Active" | "Completed";
  notes?: string;
  created_at: string;
}

export interface Attendance {
  id: string;
  shift_id: string;
  user_id: string;
  time_reported: string;
  time_leaving?: string;
  hours_worked: number;
  is_late: boolean;
  late_reason?: string | null;
  supervisor_notes?: string;
  is_early_departure?: boolean;   // Left before 5:00 PM
  overtime_minutes?: number;      // Minutes worked past 5:00 PM
  is_absent?: boolean;            // Marked absent by a supervisor for this shift
  absent_marked_by?: string | null;      // Supervisor name who authorized the absence
  absent_marked_at?: string | null;      // ISO timestamp of the absence authorization
  absence_only?: boolean;         // Row created by the absence console for a tech
                                  // who never checked in — unmarking it deletes it
}

export interface BroadcastStatus {
  id: string;
  shift_id: string;
  station_id: string;
  status: StationStatus;
  remarks?: string;
  updated_at: string;
}

export interface Fault {
  id: string;
  shift_id?: string;
  station_id: string;
  category: string;
  description: string;
  time_detected: string;
  reported_by_id: string;
  priority: FaultPriority;
  action_taken?: string;
  assigned_engineer_id?: string;
  status: FaultStatus;
  resolved_time?: string;
  created_at: string;
  updated_at: string;
}

export interface FaultUpdate {
  id: string;
  fault_id: string;
  user_id: string;
  status: FaultStatus;
  action_taken?: string;
  remarks?: string;
  created_at: string;
}

export interface OutsideBroadcast {
  id: string;
  shift_id: string;
  is_running: boolean;
  program_name: string;
  location: string;
  gps_coordinates?: string;
  vehicle?: string;
  technical_crew: string[];
  equipment_used: string[];
  signal_method: SignalMethod;
  technical_issues?: string;
  status: "Active" | "Completed" | "Interrupted";
  expected_end_time?: string;
  created_at: string;
}

export interface Task {
  id: string;
  shift_id?: string;
  task_name: string;
  description?: string;
  assigned_to_id?: string;
  priority: FaultPriority;
  due_date?: string;
  station_id?: string;
  status: TaskStatus;
  image_url?: string;
  equipment_id?: string;
  resolution_type?: "repaired" | "replaced";
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  location: string;
  station_id?: string;
  status: "Operational" | "Needs Service" | "Faulty";
  created_at: string;
}

export interface Handover {
  id: string;
  shift_id: string;
  outgoing_staff_id: string;
  incoming_staff_id: string;
  outgoing_staff_ids?: string[];
  incoming_staff_ids?: string[];
  handover_time: string;
  summary?: string;
  outgoing_signature_url?: string;
  incoming_signature_url?: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id?: string; // Empty means public broadcast
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  fault_id?: string;
}

export interface Report {
  id: string;
  report_type: ReportType;
  start_date: string;
  end_date: string;
  generated_by_id: string;
  summary?: string;
  data: any;
  pdf_url?: string;
  created_at: string;
}

export interface JobRecord {
  id: string;
  user_id: string;
  shift_id?: string;
  station_id?: string;
  title: string;
  description: string;
  category: JobCategory;
  start_time: string;
  end_time?: string;
  duration_minutes?: number;
  date: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  action: string;
  target_table: string;
  target_id?: string;
  details?: string;
  created_at: string;
}

export interface Announcement {
  id: string;
  text: string;
  author_id?: string;
  author_name?: string;
  created_at: string;
}

export interface Attachment {
  id: string;
  parent_type: "Fault" | "OutsideBroadcast" | "Task";
  parent_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_by_id?: string;
  created_at: string;
}

// SEED DATA
export const seedUsers: User[] = [
  // Management
  { id: "11111111-1111-1111-1111-111111111111",    email: "admin@broadcast.com",      name: "Kwabena Debrah",  role: "Admin",           pin: "1111", created_at: new Date().toISOString(), is_default: true },
  { id: "22222222-2222-2222-2222-222222222201",    email: "boat@broadcast.com",       name: "Boat",            role: "Supervisor",      pin: "2201", created_at: new Date().toISOString(), is_default: true },
  { id: "22222222-2222-2222-2222-222222222202",    email: "mohammed@broadcast.com",   name: "Mohammed",        role: "Supervisor",      pin: "2202", created_at: new Date().toISOString(), is_default: true },
  // Engineers on shift rota (individuals)
  { id: "33333333-3333-3333-3333-333333333301",    email: "enoch@broadcast.com",     name: "Enoch",           role: "Technician",      pin: "3301", created_at: new Date().toISOString(), is_default: true },
  { id: "33333333-3333-3333-3333-333333333302",    email: "ransford@broadcast.com",  name: "Ransford",        role: "Technician",      pin: "3302", created_at: new Date().toISOString(), is_default: true },
  { id: "33333333-3333-3333-3333-333333333303",    email: "seth@broadcast.com",      name: "Seth",            role: "Technician",      pin: "3303", created_at: new Date().toISOString(), is_default: true },
  { id: "33333333-3333-3333-3333-333333333304",    email: "jona@broadcast.com",      name: "Jona",            role: "Technician",      pin: "3304", created_at: new Date().toISOString(), is_default: true },
  { id: "33333333-3333-3333-3333-333333333305",    email: "willie@broadcast.com",    name: "Willie",          role: "Technician",      pin: "3305", created_at: new Date().toISOString(), is_default: true },
  { id: "33333333-3333-3333-3333-333333333306",    email: "alex@broadcast.com",      name: "Alex",            role: "Technician",      pin: "3306", created_at: new Date().toISOString(), is_default: true },
];


export const seedStations: Station[] = [
  { id: "88888888-8888-8888-8888-888888888801", name: "Joy FM", logo_url: "/stations/joy.png", current_status: "OK", remarks: "All systems operating normally", updated_at: "" },
  { id: "88888888-8888-8888-8888-888888888802", name: "Adom FM", logo_url: "/stations/adom.png", current_status: "OK", remarks: "All systems operating normally", updated_at: "" },
  { id: "88888888-8888-8888-8888-888888888803", name: "Asempa FM", logo_url: "/stations/asempa.png", current_status: "OK", remarks: "All systems operating normally", updated_at: "" },
  { id: "88888888-8888-8888-8888-888888888804", name: "Hitz FM", logo_url: "/stations/hitz.png", current_status: "OK", remarks: "All systems operating normally", updated_at: "" },
];

const seedFaults: Fault[] = [];
const seedTasks: Task[] = [];
const seedOBs: OutsideBroadcast[] = [];
const seedJobs: JobRecord[] = [];

const seedEquipment: Equipment[] = [
  {
    id: "eq-tx-01",
    name: "Joy FM Primary Transmitter Exciter (GatesAir)",
    location: "Transmission Site - Tower Room A",
    station_id: undefined,
    status: "Operational",
    created_at: "2026-01-01T00:00:00Z"
  },
  {
    id: "eq-console-03",
    name: "Adom FM Axia Fusion Audio Console",
    location: "Studio 1 - Broadcast Center",
    station_id: undefined,
    status: "Needs Service",
    created_at: "2026-01-01T00:00:00Z"
  },
  {
    id: "eq-link-m1",
    name: "High-Gain Microwave Dish Transceiver",
    location: "NOC Headquarters Roof Peak",
    station_id: undefined,
    status: "Operational",
    created_at: "2026-01-01T00:00:00Z"
  }
];

const seedAuditLogs: AuditLog[] = [];

// Simple Client-side Event Emitter for Realtime Simulations
type Listener = (data: any) => void;
class MockRealtime {
  private listeners: { [event: string]: Listener[] } = {};

  subscribe(event: string, callback: Listener) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  emit(event: string, data: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }
}

export const mockRealtime = new MockRealtime();

const getStorageItem = <T>(key: string, seed: T): T => {
  if (typeof window === "undefined") return seed;

  const data = localStorage.getItem(key);
  if (!data) {
    return seed;
  }
  try {
    return JSON.parse(data) as T;
  } catch {
    return seed;
  }
};

let broadcastChan: BroadcastChannel | null = null;
if (typeof window !== "undefined" && typeof BroadcastChannel !== "undefined") {
  try {
    broadcastChan = new BroadcastChannel("shiftchange_realtime_sync");
    broadcastChan.onmessage = (ev) => {
      if (ev.data && ev.data.key) {
        window.dispatchEvent(new CustomEvent("shift_data_changed", { detail: { key: ev.data.key } }));
      }
    };
  } catch (e) {
    console.warn("BroadcastChannel init failed:", e);
  }
}

const setStorageItem = <T>(key: string, data: T) => {
  if (typeof window === "undefined") return;
  const next = JSON.stringify(data);
  // Only write + notify when the value actually changed. Cloud reads that
  // mirror back identical data must not dispatch shift_data_changed, or every
  // page listening for that event re-loads, re-mirrors, and re-dispatches in
  // an unbounded loop.
  const prev = localStorage.getItem(key);
  if (prev === next) return;
  if (key === "shift_tasks") {
    console.info("[shift_tasks write]", { previous: prev, next });
    console.trace("[shift_tasks write caller]");
  }
  localStorage.setItem(key, next);
  if (key === "shift_tasks") {
    // Persist the latest task snapshot in sessionStorage too. This protects
    // user-authored tasks from an unexpected localStorage removal while the
    // current tab is alive and gives getTasks() a self-healing source.
    sessionStorage.setItem("shift_tasks_session_backup", next);
  }
  if (key.startsWith("shift_")) {
    window.dispatchEvent(new CustomEvent("shift_data_changed", { detail: { key } }));
    if (broadcastChan) {
      try { broadcastChan.postMessage({ key }); } catch {}
    }
  }
};

export const getSeedPin = (userId: string): string | undefined =>
  seedUsers.find(u => u.id === userId)?.pin;

export class MockDB {
  static getUsers(): User[] {
    const stored = getStorageItem("shift_users", seedUsers);
    if (!stored || stored.length === 0) return seedUsers;
    const merged = [...stored];
    for (const seed of seedUsers) {
      const idx = merged.findIndex(u => u.id === seed.id || u.email.toLowerCase() === seed.email.toLowerCase());
      if (idx === -1) {
        merged.push(seed);
      } else if (merged[idx].is_default === true || (merged[idx].is_default === undefined && merged[idx].pin === seed.pin)) {
        // Enforce exact seed PIN only when the user is confirmed on the default —
        // never clobber a customized PIN (that would resurrect the old default)
        merged[idx] = { ...merged[idx], pin: seed.pin, role: seed.role, name: seed.name, is_default: true };
      }
    }
    // Normalize is_default against seed defaults so drifted copies can't show a
    // changed user as "default" (or vice versa) in any store
    return merged.map(u => {
      if (u.is_default === false) return u;
      const seedPin = getSeedPin(u.id);
      if (seedPin === undefined) return u;
      return seedPin === u.pin ? { ...u, is_default: true } : { ...u, is_default: false };
    });
  }

  static saveUsers(users: User[]) {
    setStorageItem("shift_users", users);
  }

  static getStations(): Station[] {
    const stored = getStorageItem("shift_stations", seedStations) as Station[];
    const hasSeedId = stored.length > 0 && stored.some(s => typeof s.id === "string" && s.id.startsWith("88888888-8888-8888-8888-"));
    if (!hasSeedId && stored.length > 0) {
      // Stored stations have different IDs (e.g. Supabase UUIDs). Merge by name to preserve
      // user-set status/remarks while correcting IDs to match seed expectations.
      const merged = seedStations.map(seed => {
        const match = stored.find(s => s.name === seed.name);
        return match
          ? { ...seed, current_status: match.current_status, remarks: match.remarks, updated_at: match.updated_at || seed.updated_at }
          : seed;
      });
      setStorageItem("shift_stations", merged);
      return merged;
    }
    return stored;
  }

  static saveStations(stations: Station[]) {
    setStorageItem("shift_stations", stations);
  }

  static getShifts(): Shift[] {
    return getStorageItem("shift_shifts", []);
  }

  static saveShifts(shifts: Shift[]) {
    setStorageItem("shift_shifts", shifts);
  }

  static getAttendance(): Attendance[] {
    return getStorageItem("shift_attendance", []);
  }

  static saveAttendance(attendance: Attendance[]) {
    setStorageItem("shift_attendance", attendance);
  }

  static getBroadcastStatus(): BroadcastStatus[] {
    return getStorageItem("shift_broadcast_status", []);
  }

  static saveBroadcastStatus(status: BroadcastStatus[]) {
    setStorageItem("shift_broadcast_status", status);
  }

  static getFaults(): Fault[] {
    return getStorageItem("shift_faults", seedFaults);
  }

  static saveFaults(faults: Fault[]) {
    setStorageItem("shift_faults", faults);
  }

  static getFaultUpdates(): FaultUpdate[] {
    return getStorageItem("shift_fault_updates", []);
  }

  static saveFaultUpdates(updates: FaultUpdate[]) {
    setStorageItem("shift_fault_updates", updates);
  }

  static getOBs(): OutsideBroadcast[] {
    const obs = getStorageItem("shift_obs", seedOBs);
    // Replace active-shift-placeholder with actual active shift if any
    const active = this.getActiveShift();
    if (active) {
      obs.forEach(o => {
        if (o.shift_id === "active-shift-placeholder") {
          o.shift_id = active.id;
        }
      });
    }
    return obs;
  }

  static saveOBs(obs: OutsideBroadcast[]) {
    setStorageItem("shift_obs", obs);
  }

  static getTasks(): Task[] {
    const tasks = getStorageItem("shift_tasks", seedTasks);
    if (tasks.length > 0 || typeof window === "undefined") return tasks;

    // If localStorage was unexpectedly removed during this tab's lifetime,
    // recover the last task snapshot. A legitimate explicit save of [] updates
    // this backup too, so intentional empty task sets stay empty.
    try {
      const raw = sessionStorage.getItem("shift_tasks_session_backup");
      if (!raw) return tasks;
      const backup = JSON.parse(raw) as Task[];
      if (!Array.isArray(backup) || backup.length === 0) return tasks;
      localStorage.setItem("shift_tasks", raw);
      console.warn("[shift_tasks] recovered", backup.length, "task(s) from session backup");
      return backup;
    } catch {
      return tasks;
    }
  }

  static saveTasks(tasks: Task[]) {
    setStorageItem("shift_tasks", tasks);
  }

  static getHandovers(): Handover[] {
    return getStorageItem("shift_handovers", []);
  }

  static saveHandovers(handovers: Handover[]) {
    setStorageItem("shift_handovers", handovers);
  }

  static getJobs(): JobRecord[] {
    return getStorageItem("shift_jobs", seedJobs);
  }

  static saveJobs(jobs: JobRecord[]) {
    setStorageItem("shift_jobs", jobs);
  }

  static getNotifications(): Notification[] {
    return getStorageItem("shift_notifications", []);
  }

  static saveNotifications(notifications: Notification[]) {
    setStorageItem("shift_notifications", notifications);
  }

  static getAnnouncements(): Announcement[] {
    return getStorageItem("shift_announcements", []);
  }

  static saveAnnouncements(announcements: Announcement[]) {
    setStorageItem("shift_announcements", announcements);
  }

  static getReports(): Report[] {
    return getStorageItem("shift_reports", []);
  }

  static saveReports(reports: Report[]) {
    setStorageItem("shift_reports", reports);
  }

  static getAuditLogs(): AuditLog[] {
    return getStorageItem("shift_audit_logs", seedAuditLogs);
  }

  static saveAuditLogs(logs: AuditLog[]) {
    setStorageItem("shift_audit_logs", logs);
  }

  static getAttachments(): Attachment[] {
    return getStorageItem("shift_attachments", []);
  }

  static saveAttachments(attachments: Attachment[]) {
    setStorageItem("shift_attachments", attachments);
  }

  static getEquipment(): Equipment[] {
    return getStorageItem("shift_equipment", seedEquipment);
  }

  static saveEquipment(equipment: Equipment[]) {
    setStorageItem("shift_equipment", equipment);
  }

  // Active shift helpers
  static getActiveShift(): Shift | null {
    const shifts = this.getShifts();
    return shifts.find(s => s.status === "Active") || null;
  }

  // Logic Operations
  static logAudit(userId: string | undefined, action: string, table: string, id?: string, details?: string) {
    const logs = this.getAuditLogs();
    const log: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      user_id: userId,
      action,
      target_table: table,
      target_id: id,
      details,
      created_at: new Date().toISOString()
    };
    logs.unshift(log);
    this.saveAuditLogs(logs);
  }

  static notify(title: string, message: string, type: string, userId?: string, faultId?: string): Notification {
    const notifications = this.getNotifications();
    const notification: Notification = {
      id: `notif-${Date.now()}`,
      user_id: userId,
      title,
      message,
      type,
      is_read: false,
      created_at: new Date().toISOString(),
      fault_id: faultId
    };
    notifications.unshift(notification);
    this.saveNotifications(notifications);
    mockRealtime.emit("notification", notification);
    return notification;
  }
}
