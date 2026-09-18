import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, signInAnonymously, createUserWithEmailAndPassword, signInWithEmailAndPassword, reauthenticateWithCredential, updatePassword, EmailAuthProvider } from "firebase/auth";
import {
  initializeFirestore, collection, doc, getDoc, getDocs, setDoc, deleteDoc,
  Firestore
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, FirebaseStorage } from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { MockDB, getSeedPin, User, Shift, Attendance, Station, Fault, FaultUpdate, OutsideBroadcast, Task, Handover, Notification, Report, AuditLog, ShiftType, JobRecord, Equipment, Announcement, mockRealtime, isLateCheckIn, getShiftTypeForTime } from "./mock-db";

const firebaseApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "";
const firebaseProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: firebaseProjectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ""
};

export const isFirestoreConfigured = !!(firebaseApiKey && firebaseProjectId);

const FIRESTORE_DEGRADED_KEY = "shift_firestore_degraded";

// Persisted with a timestamp so a page reload within the window starts
// degraded instantly, and a stale flag self-heals once the window passes.
function readPersistedDegraded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(FIRESTORE_DEGRADED_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (Number.isNaN(ts)) return false;
    return Date.now() - ts < DEGRADED_WINDOW_MS;
  } catch {
    return false;
  }
}

export let firestoreDegraded = readPersistedDegraded();
let degradedRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
const DEGRADED_WINDOW_MS = 45000;

// After a Firestore failure, skip the cloud for a short window so the app
// answers instantly from the local store (no repeated multi-second hangs on
// a slow/flaky connection), then automatically retry the cloud.
function setFirestoreDegraded() {
  firestoreDegraded = true;
  try { localStorage.setItem(FIRESTORE_DEGRADED_KEY, String(Date.now())); } catch {}
  if (degradedRecoveryTimer) clearTimeout(degradedRecoveryTimer);
  degradedRecoveryTimer = setTimeout(() => {
    firestoreDegraded = false;
    degradedRecoveryTimer = null;
    try { localStorage.removeItem(FIRESTORE_DEGRADED_KEY); } catch {}
  }, DEGRADED_WINDOW_MS);
}

export function resetFirestoreDegraded() {
  firestoreDegraded = false;
  if (degradedRecoveryTimer) {
    clearTimeout(degradedRecoveryTimer);
    degradedRecoveryTimer = null;
  }
  if (typeof window !== "undefined") localStorage.removeItem(FIRESTORE_DEGRADED_KEY);
}

// ────────────────────────────────────────────────────────────────
// Cloud Function bridge (verifyPin / setPin). Returns null when the
// function can't be reached or the caller is offline/degraded, so the
// caller can fall back to its local store.
// ────────────────────────────────────────────────────────────────
let _fns: ReturnType<typeof getFunctions> | null = null;

async function callCloudFunction(name: string, data: any): Promise<any | null> {
  if (!isFirestoreConfigured || typeof window === "undefined" || firestoreDegraded) return null;
  try {
    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    if (!_fns) _fns = getFunctions(app);
    const callable = httpsCallable(_fns, name);
    const res = await withTimeout(callable(data), `cloud function ${name}`);
    return res.data as any;
  } catch (e) {
    console.warn(`Cloud function ${name} failed:`, (e as any)?.message || e);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// PIN sync status. `setPin` only reaches the server when the caller
// is email-linked; otherwise the change is local-only. `markPinSync`
// attaches the status as a NON-enumerable property so it survives
// JSON.stringify (session/localStorage) but stays readable by the
// UI to warn users when a change didn't reach the server.
// ────────────────────────────────────────────────────────────────
export type PinSyncStatus = "server" | "local";

function markPinSync<T extends User>(user: T, status: PinSyncStatus): T & { pinSync: PinSyncStatus } {
  Object.defineProperty(user, "pinSync", { value: status, enumerable: false, configurable: true, writable: true });
  return user as T & { pinSync: PinSyncStatus };
}

async function pushPinToServer(userId: string, pin: string | undefined): Promise<PinSyncStatus | null> {
  if (pin === undefined) return null;
  const res = await db.auth.setPin(userId, pin);
  if (res?.ok === true) return "server";
  if (res && res.error !== "unavailable") {
    console.warn("setPin denied:", res.error);
  }
  return "local";
}

// ────────────────────────────────────────────────────────────────
// Anonymous Firebase Auth. Security rules require an authenticated
// request, so every cloud call signs in anonymously first. The
// promise is cached per session; a slow/offline network times out
// rather than blocking — the caller's own timeout/degraded logic
// handles the failure.
// ────────────────────────────────────────────────────────────────
let _anonAuthPromise: Promise<void> | null = null;

function ensureAnonymousAuth(): Promise<void> {
  if (!isFirestoreConfigured) return Promise.resolve();
  if (typeof window === "undefined") return Promise.resolve();
  if (!_anonAuthPromise) {
    _anonAuthPromise = (async () => {
      try {
        const auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
        // Wait for the persisted session (e.g. a signed-in email user) to be
        // restored before deciding to go anonymous — otherwise a full-page
        // reload after email login lets the anonymous sign-in win the race
        // and silently cancel the restore of the email identity.
        await auth.authStateReady();
        if (!auth.currentUser) {
          await withTimeout(signInAnonymously(auth), "anonymous sign-in");
        }
      } catch (e) {
        console.warn("Anonymous sign-in failed:", (e as any)?.message);
      }
    })();
  }
  return _anonAuthPromise;
}

// ────────────────────────────────────────────────────────────────
// Lazy Firestore client. Initialized on first use so the module
// stays SSR-safe and never connects when env vars are absent.
// ────────────────────────────────────────────────────────────────
let _fs: Firestore | null = null;
let _storage: FirebaseStorage | null = null;

function getFS(): Firestore {
  if (!isFirestoreConfigured) throw new Error("Firestore not configured");
  if (_fs) return _fs;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  // Long-polling transport instead of the streaming (WebChannel) transport:
  // on networks/proxies where the gRPC-Web stream stalls, streaming requests
  // hang indefinitely while long-polling still delivers responses.
  _fs = initializeFirestore(app, { experimentalForceLongPolling: true });
  return _fs;
}

function getFBStorage(): FirebaseStorage {
  if (!isFirestoreConfigured) throw new Error("Firebase Storage not configured");
  if (_storage) return _storage;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  _storage = getStorage(app);
  return _storage;
}

// Firestore rejects `undefined` field values, while the app's write paths
// routinely pass optional fields — strip them so cloud writes behave like
// the old Supabase `.update()` (which ignored undefined keys).
function clean(obj: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// One check-in row per (shift, user) — racing auto-check-ins used to create
// duplicate rows; collapse any that slipped through by keeping the earliest.
function dedupeAttendance(rows: Attendance[]): Attendance[] {
  const seen = new Map<string, Attendance>();
  for (const a of rows) {
    const key = `${a.shift_id}|${a.user_id}`;
    const prev = seen.get(key);
    if (!prev || new Date(a.time_reported).getTime() < new Date(prev.time_reported).getTime()) {
      seen.set(key, a);
    }
  }
  return [...seen.values()];
}

const FIRESTORE_TIMEOUT_MS = 5000;
// Critical writes (shift start, check-in, absence marks) always try the cloud
// even inside a degraded window — a per-browser local shift would silently
// break every other device. They get a much longer budget because they are
// user-initiated and must not be skipped just because an unrelated read hung.
const FIRESTORE_WRITE_TIMEOUT_MS = 20000;

// A truly offline device (navigator.onLine false) skips the cloud write
// entirely — no 20s hang — and goes straight to the local store. Flaky
// connections still report online and thus keep the always-attempt behavior.
function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// 5s timeout on every request so slow/unreachable Firestore never blocks the
// UI. Failure (or timeout) arms the degradation window; recovery is purely
// time-based because a single fast query must not cancel the window mid-cycle.
function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs: number = FIRESTORE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      setFirestoreDegraded();
      reject(new Error(`Firestore ${label} timed out`));
    }, timeoutMs);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); setFirestoreDegraded(); reject(e); }
    );
  });
}

async function fsGetAll(collectionName: string): Promise<any[]> {
  await ensureAnonymousAuth();
  const snap = await getDocs(collection(getFS(), collectionName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fsGet(collectionName: string, id: string): Promise<any | null> {
  await ensureAnonymousAuth();
  const snap = await getDoc(doc(getFS(), collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function fsSet(collectionName: string, id: string, data: any, merge = false): Promise<void> {
  await ensureAnonymousAuth();
  const ref = doc(getFS(), collectionName, id);
  if (merge) {
    await setDoc(ref, clean(data), { merge: true });
  } else {
    await setDoc(ref, clean(data));
  }
}

async function fsDelete(collectionName: string, id: string): Promise<void> {
  await ensureAnonymousAuth();
  await deleteDoc(doc(getFS(), collectionName, id));
}

// ────────────────────────────────────────────────────────────────
// Pending cloud write queue. On slow/flaky networks a critical write
// (shift start, check-in) can time out and land only in the local
// MockDB mirror. Those rows are queued here and pushed to Firestore
// opportunistically on the next successful read (or focus/online) —
// WITHOUT blocking the UI. Rows deleted by an admin are never in the
// queue, so they can't be resurrected.
// ────────────────────────────────────────────────────────────────
const PENDING_WRITES_KEY = "shift_pending_writes";
const PENDING_WRITES_MAX = 50;

interface PendingWrite {
  collection: string;
  id: string;
  data: any;
  merge?: boolean;
}

function queuePendingWrite(collection: string, id: string, data: any, merge = false) {
  if (typeof window === "undefined" || !isFirestoreConfigured) return;
  try {
    const raw = localStorage.getItem(PENDING_WRITES_KEY);
    const queue: PendingWrite[] = raw ? JSON.parse(raw) : [];
    if (queue.some(w => w.collection === collection && w.id === id)) return;
    queue.push({ collection, id, data, merge });
    localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(queue.slice(-PENDING_WRITES_MAX)));
  } catch { /* queue is best-effort */ }
}

// Drop a queued write (used when a doc is deleted locally — a queued create or
// update must never resurrect a row the user just removed).
function dropPendingWrite(collection: string, id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PENDING_WRITES_KEY);
    if (!raw) return;
    const queue: PendingWrite[] = JSON.parse(raw);
    const remaining = queue.filter(w => !(w.collection === collection && w.id === id));
    localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(remaining.slice(-PENDING_WRITES_MAX)));
  } catch { /* queue is best-effort */ }
}

let flushingWrites = false;
async function flushPendingWrites(): Promise<void> {
  if (typeof window === "undefined" || !isFirestoreConfigured || isOffline() || flushingWrites) return;
  let queue: PendingWrite[] = [];
  try {
    const raw = localStorage.getItem(PENDING_WRITES_KEY);
    queue = raw ? JSON.parse(raw) : [];
    if (queue.length === 0) return;
  } catch { return; }
  flushingWrites = true;
  try {
    const remaining: PendingWrite[] = [];
    for (const w of queue) {
      try {
        await fsSet(w.collection, w.id, w.data, w.merge);
      } catch (e) {
        remaining.push(w); // keep for the next flush — the network may recover
        console.warn(`Firestore pending write ${w.collection}/${w.id} still failing:`, (e as any)?.message);
      }
    }
    try { localStorage.setItem(PENDING_WRITES_KEY, JSON.stringify(remaining.slice(-PENDING_WRITES_MAX))); } catch {}
    if (remaining.length === 0) resetFirestoreDegraded();
  } finally {
    flushingWrites = false;
  }
}

if (typeof window !== "undefined" && isFirestoreConfigured) {
  window.addEventListener("focus", () => { flushPendingWrites(); });
  window.addEventListener("online", () => { flushPendingWrites(); });
}

const ORIGINAL_PINS_KEY = "shift_original_pins";

function getOriginalPins(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(ORIGINAL_PINS_KEY) || "{}");
  } catch { return {}; }
}

function saveOriginalPins(users: User[]) {
  if (typeof window === "undefined") return;
  const pins = getOriginalPins();
  let changed = false;
  for (const u of users) {
    if (!(u.id in pins)) {
      pins[u.id] = u.pin;
      changed = true;
    }
  }
  if (changed) localStorage.setItem(ORIGINAL_PINS_KEY, JSON.stringify(pins));
}

// A user is "default" only while their PIN still matches the seeded default —
// deterministic, so a stale pins map can never re-expose changed credentials
function patchIsDefault(user: User): User {
  const seedPin = getSeedPin(user.id);
  return { ...user, is_default: seedPin !== undefined && seedPin === user.pin };
}

// Keep the local MockDB store in sync with credential changes so a stale
// default PIN can never remain valid in one store while the other is updated.
// Empty email/pin values are skipped — a partial update (e.g. email only) must
// never blank the other credential.
function mirrorUserCredentials(id: string, email: string, pin: string) {
  if (typeof window === "undefined") return;
  const mockUsers = MockDB.getUsers();
  const idx = mockUsers.findIndex(u => u.id === id);
  if (idx !== -1) {
    mockUsers[idx] = {
      ...mockUsers[idx],
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(pin ? { pin } : {}),
      is_default: false
    };
    MockDB.saveUsers(mockUsers);
  }
}

// If a credential change only made it to the local store (cloud update failed
// transiently), the local copy is authoritative for that user — otherwise the
// old default PIN would remain valid via the cloud row
function overlayLocalUserChanges(users: User[]): User[] {
  const localUsers = MockDB.getUsers();
  return users.map(su => {
    const local = localUsers.find(mu => mu.id === su.id);
    if (local && local.is_default === false) {
      return { ...su, pin: local.pin, is_default: false };
    }
    return su;
  });
}

// ────────────────────────────────────────────────────────────────
// Factory reset auto-sync: when an admin wipes the cloud DB, every
// device detects the new reset marker, purges its stale local
// mirrors, and signs out (sessions are wiped data and must not
// survive a factory reset).
// ────────────────────────────────────────────────────────────────
const RESET_MARKER_KEY = "shift_reset_marker";
const RESET_RELOADED_KEY = "shift_reset_reloaded";

// The reset marker lives in the unused `attachments` collection (doc id =
// zero UUID, file_url = version). The app's anon key can read it, and the
// doc never surfaces in any UI list.
const RESET_MARKER_ROW_ID = "00000000-0000-0000-0000-000000000000";

const OPERATIONAL_CACHE_KEYS = [
  "shift_faults", "shift_fault_updates", "shift_tasks", "shift_obs",
  "shift_shifts", "shift_attendance", "shift_handovers",
  "shift_notifications", "shift_jobs", "shift_audit_logs",
  "shift_broadcast_status", "shift_reports", "shift_attachments",
  "shift_equipment", "start_shift_draft", "shift_maintenance_schedules_v2",
  "shift_firestore_degraded"
];

export function rememberResetVersion(version: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RESET_MARKER_KEY, version);
  sessionStorage.setItem(RESET_RELOADED_KEY, version);
}

async function checkFactoryResetMarker() {
  if (!isFirestoreConfigured || firestoreDegraded || typeof window === "undefined") return;
  let cloudVersion = "";
  try {
    const data = await withTimeout(fsGet("attachments", RESET_MARKER_ROW_ID), "marker check", FIRESTORE_WRITE_TIMEOUT_MS);
    cloudVersion = (data?.file_url as string) || "";
  } catch (e) {
    // Flaky networks frequently fail this read — retry shortly so the version
    // eventually gets recorded (and a real wipe gets detected) without having
    // to rely on a lucky full-page reload.
    console.warn("Factory reset marker check failed:", (e as any)?.message);
    window.setTimeout(checkFactoryResetMarker, 10_000);
    return;
  }
  if (!cloudVersion) return; // marker never stamped — nothing to detect
  const storedVersion = localStorage.getItem(RESET_MARKER_KEY);
  if (storedVersion === cloudVersion) return;
  if (sessionStorage.getItem(RESET_RELOADED_KEY) === cloudVersion) return;
  if (storedVersion === null) {
    // This device has never observed a reset marker before. Treat the current
    // cloud marker as its baseline instead of deleting local operational data:
    // there is no previous marker on this device to prove those local rows
    // pre-date the reset. Purging here can erase a task/job created moments
    // earlier while this asynchronous marker check is still in flight.
    //
    // A real future reset is still detected below because storedVersion will
    // then differ from the newly fetched cloudVersion.
    rememberResetVersion(cloudVersion);
    return;
  }
  // Cloud DB was wiped since our last visit — drop stale local mirrors AND the
  // session so every device is logged out after a factory reset.
  OPERATIONAL_CACHE_KEYS.forEach(k => localStorage.removeItem(k));
  localStorage.removeItem("shift_session");
  localStorage.removeItem(SWITCH_ORIGIN_KEY);
  document.cookie = "shift_session=; path=/; max-age=0; SameSite=Lax";
  rememberResetVersion(cloudVersion);
  window.location.reload();
}

checkFactoryResetMarker();

// The marker check must not rely on full page loads alone — a device left open
// (or using client-side navigation) would never notice an admin's cloud wipe.
// Re-check on a timer and whenever the tab regains focus. A failing check arms
// the degradation window, which skips the next attempts; once it expires the
// next interval run retries, so this stays cheap on a flaky network.
if (typeof window !== "undefined") {
  window.setInterval(() => {
    if (!document.hidden) checkFactoryResetMarker();
  }, 60_000);
  window.addEventListener("focus", () => checkFactoryResetMarker());
}

// ────────────────────────────────────────────────────────────────
// Storage hygiene: one-time background migration that downsizes
// oversized base64 photo attachments (the old annotator saved PNGs
// that could weigh hundreds of KB each — enough to trip the browser's
// "site is using a lot of space" warning and slow down page loads).
// Runs once per device on app start; never blocks the UI.
// ────────────────────────────────────────────────────────────────
function downscaleImageDataUrl(dataUrl: string, maxDim: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function pruneOversizedAttachments() {
  if (typeof window === "undefined") return;
  const PRUNED_FLAG = "shift_attachments_pruned";
  try {
    if (localStorage.getItem(PRUNED_FLAG)) return; // ran once on this device
    const raw = localStorage.getItem("shift_attachments");
    if (!raw) { localStorage.setItem(PRUNED_FLAG, "1"); return; }
    const attachments: any[] = JSON.parse(raw);
    if (!Array.isArray(attachments)) { localStorage.setItem(PRUNED_FLAG, "1"); return; }
    let changed = false;
    const pruned = await Promise.all(
      attachments.map(async (att) => {
        const url = att?.file_url;
        if (typeof url !== "string" || !url.startsWith("data:image") || url.length < 250_000) return att;
        try {
          // Yield to the event loop between heavy decodes so first paint isn't blocked
          await new Promise((r) => setTimeout(r, 0));
          const small = await downscaleImageDataUrl(url, 800, 0.85);
          if (!small || small.length >= url.length) return att;
          changed = true;
          return {
            ...att,
            file_url: small,
            file_type: "image/jpeg",
            file_name: (att.file_name || "photo").replace(/\.png$/i, ".jpg"),
          };
        } catch {
          return att;
        }
      })
    );
    if (changed) localStorage.setItem("shift_attachments", JSON.stringify(pruned));
  } catch {} finally {
    try { localStorage.setItem(PRUNED_FLAG, "1"); } catch {}
  }
}

pruneOversizedAttachments();

// Helpers to guarantee User and Shift records exist in Firestore before
// creating dependent child records (e.g. attendance, faults)
async function ensureUserInFirestore(userId: string) {
  if (!isFirestoreConfigured || firestoreDegraded) return;
  try {
    const users = MockDB.getUsers();
    const user = users.find(u => u.id === userId);
    if (user) {
      await withTimeout(fsSet("users", user.id, {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        pin: user.pin,
        created_at: user.created_at || new Date().toISOString()
      }, true), "users ensure");
    }
  } catch (e) {
    console.warn("ensureUserInFirestore warning:", (e as any)?.message);
  }
}

async function ensureShiftInFirestore(shiftId: string) {
  if (!isFirestoreConfigured || firestoreDegraded) return;
  try {
    const shifts = MockDB.getShifts();
    const shift = shifts.find(s => s.id === shiftId);
    if (shift) {
      if (shift.incoming_staff_id) {
        await ensureUserInFirestore(shift.incoming_staff_id);
      }
      await withTimeout(fsSet("shifts", shift.id, {
        id: shift.id,
        date: shift.date,
        shift_type: shift.shift_type,
        location: shift.location,
        incoming_staff_id: shift.incoming_staff_id,
        outgoing_staff_id: shift.outgoing_staff_id,
        start_time: shift.start_time,
        status: shift.status,
        notes: shift.notes,
        created_at: shift.created_at || new Date().toISOString()
      }, true), "shifts ensure");
    }
  } catch (e) {
    console.warn("ensureShiftInFirestore warning:", (e as any)?.message);
  }
}

// Helper to create notifications in both Firestore and mock modes
async function createNotification(title: string, message: string, type: string, userId?: string, faultId?: string) {
  if (isFirestoreConfigured && !firestoreDegraded) {
    try {
      const notification: Notification = {
        id: `n-${Date.now()}`,
        user_id: userId || undefined,
        title,
        message,
        type,
        is_read: false,
        created_at: new Date().toISOString(),
        fault_id: faultId
      };
      await withTimeout(fsSet("notifications", notification.id, notification), "notification create");
      // Emit client-side event for real-time UI updates (sound, toast, bell badge)
      if (typeof window !== "undefined") {
        mockRealtime.emit("notification", notification);
      }
      return notification;
    } catch (e) {
      console.warn("Firestore notification create failed, falling back to MockDB:", (e as any)?.message);
    }
  }
  // Mock mode: MockDB.notify() already emits the event
  return MockDB.notify(title, message, type, userId, faultId);
}

// Notify the assigned engineer with the details of the fault / work
function notifyFaultAssigned(fault: { id?: string; assigned_engineer_id?: string; description?: string; priority?: string; status?: string; station_id?: string }) {
  if (!fault.assigned_engineer_id) return;
  const station = MockDB.getStations().find(s => s.id === fault.station_id);
  const message = `[${fault.priority || "Medium"}] ${fault.description || "Fault"} — ${station?.name || "Station"} (${fault.status || "Open"}). Please review and take action.`;
  return createNotification("Fault Assigned To You", message, "fault_assign", fault.assigned_engineer_id, fault.id);
}

// Mark a technician's unread fault-assignment notification as read once the fault is resolved
async function markFaultAssignNotificationsRead(faultId: string) {
  if (isFirestoreConfigured && !firestoreDegraded) {
    try {
      const all = await withTimeout(fsGetAll("notifications"), "notifications read");
      const targets = all.filter(n =>
        n.type === "fault_assign" &&
        !n.is_read &&
        ((n.metadata && n.metadata.fault_id === faultId) || n.fault_id === faultId)
      );
      if (targets.length > 0) {
        await Promise.all(targets.map(t => fsSet("notifications", t.id, { is_read: true }, true)));
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("shift_data_changed"));
      }
      return;
    } catch (e) {
      console.warn("Firestore notifications markFaultAssignRead failed, falling back to MockDB:", (e as any)?.message);
    }
  }
  const notifications = MockDB.getNotifications();
  let changed = false;
  for (const n of notifications) {
    if (n.type === "fault_assign" && n.fault_id === faultId && !n.is_read) {
      n.is_read = true;
      changed = true;
    }
  }
  if (changed) {
    MockDB.saveNotifications(notifications);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("shift_data_changed"));
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Dashboard user switcher: let a technician operating the shared
// terminal hop between checked-in duty partners' dashboards, while
// remembering the original session so they can switch back.
// ────────────────────────────────────────────────────────────────
const SWITCH_ORIGIN_KEY = "shift_switch_origin";

export function getSwitchOriginUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SWITCH_ORIGIN_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch { return null; }
}

export function switchToUser(user: User): void {
  if (typeof window === "undefined") return;
  const current = db.auth.getUser();
  if (current && current.id !== user.id && !localStorage.getItem(SWITCH_ORIGIN_KEY)) {
    localStorage.setItem(SWITCH_ORIGIN_KEY, JSON.stringify(current));
  }
  localStorage.setItem("shift_session", JSON.stringify(user));
  document.cookie = `shift_session=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=86400; SameSite=Lax`;
  MockDB.logAudit(user.id, "SWITCH_USER", "users", user.id, `Session switched to ${user.name}`);
  window.location.href = "/";
}

export function switchBackToOrigin(): void {
  if (typeof window === "undefined") return;
  const origin = getSwitchOriginUser();
  localStorage.removeItem(SWITCH_ORIGIN_KEY);
  if (origin) {
    localStorage.setItem("shift_session", JSON.stringify(origin));
    document.cookie = `shift_session=${encodeURIComponent(JSON.stringify(origin))}; path=/; max-age=86400; SameSite=Lax`;
  }
  window.location.href = "/";
}

// Unified DB Interface that resolves to Firestore or MockDB
export const db = {
  auth: {
    async signIn(email: string, pin: string): Promise<{ user: User | null; error: string | null }> {
      const users = await db.users.list();
      if (typeof window !== "undefined") {
        localStorage.removeItem(SWITCH_ORIGIN_KEY); // fresh login resets any switch origin
      }
      
      if (email) {
        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
        if (!user) return { user: null, error: "User not found" };
        if (user.pin !== pin) return { user: null, error: "Invalid security PIN" };
        if (typeof window !== "undefined") {
          localStorage.setItem("shift_session", JSON.stringify(user));
          document.cookie = `shift_session=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=86400; SameSite=Lax`;
          MockDB.logAudit(user.id, "LOGIN", "users", user.id, `User logged in: ${user.name}`);
        }
        return { user, error: null };
      }
      
      // PIN-only login. When the cloud is reachable the PIN is verified by the
      // rate-limited `verifyPin` Cloud Function (server-side credentials). The
      // local mirror is the fallback for offline/degraded use.
      const pinUser = users.find(u => u.pin === pin);
      if (isFirestoreConfigured && !firestoreDegraded) {
        const res = await db.auth.verifyPin(pinUser?.id || "", pin);
        if (res.locked) return { user: null, error: res.error || "Too many failed attempts — try again later." };
        if (res.ok && res.user) {
          const verifiedUser = res.user;
          const sessionUser = users.find(u => u.id === verifiedUser.id)
            || ({ id: verifiedUser.id, name: verifiedUser.name, role: verifiedUser.role, email: verifiedUser.email } as User);
          if (typeof window !== "undefined") {
            localStorage.setItem("shift_session", JSON.stringify(sessionUser));
            document.cookie = `shift_session=${encodeURIComponent(JSON.stringify(sessionUser))}; path=/; max-age=86400; SameSite=Lax`;
            MockDB.logAudit(sessionUser.id, "LOGIN", "users", sessionUser.id, `User logged in: ${sessionUser.name}`);
          }
          return { user: sessionUser, error: null };
        }
        if (!res.unavailable && !pinUser) {
          return { user: null, error: res.error || "Invalid PIN." };
        }
        // Function unreachable, or the local mirror knows this PIN but the
        // server doesn't (offline credential change) — trusted-device fallback.
      }
      if (!pinUser) return { user: null, error: "Invalid PIN." };
      if (typeof window !== "undefined") {
        localStorage.setItem("shift_session", JSON.stringify(pinUser));
        document.cookie = `shift_session=${encodeURIComponent(JSON.stringify(pinUser))}; path=/; max-age=86400; SameSite=Lax`;
        MockDB.logAudit(pinUser.id, "LOGIN", "users", pinUser.id, `User logged in: ${pinUser.name}`);
      }
      return { user: pinUser, error: null };
    },

    // Server-side, rate-limited PIN verification (Cloud Function). When the
    // function can't be reached, `unavailable` is set and callers fall back to
    // their local store.
    async verifyPin(userId: string, pin: string): Promise<{ ok: boolean; locked?: boolean; unavailable?: boolean; error?: string; user?: Partial<User> }> {
      const res = await callCloudFunction("verifyPin", { userId, pin });
      if (res === null) return { ok: false, unavailable: true };
      if (res.locked) return { ok: false, locked: true, error: res.error };
      if (res.ok && res.user) return { ok: true, user: res.user };
      return { ok: false, error: res.error || "Invalid PIN." };
    },

    // Server-side PIN set (admin-or-self, Cloud Function). Callers with an
    // email-linked account can change their own PIN; admins can reset anyone's.
    // Returns ok:false when the caller isn't allowed or offline.
    async setPin(userId: string, pin: string): Promise<{ ok: boolean; error?: string }> {
      const res = await callCloudFunction("setPin", { userId, pin });
      if (res === null) return { ok: false, error: "unavailable" };
      return { ok: !!res.ok, error: res.error };
    },

    // Whether the CURRENT Firebase session (this browser) is linked to an app
    // user via auth_uids — i.e. an email account exists for this device. PIN
    // changes only reach the server when this is true.
    async isEmailLinked(): Promise<boolean> {
      if (!isFirestoreConfigured || typeof window === "undefined") return false;
      try {
        const auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
        // Wait for the persisted session to restore first — checking
        // `currentUser` immediately after a reload would miss an email user
        // still being hydrated and wrongly report "not linked".
        await auth.authStateReady();
        if (!auth.currentUser) return false;
        const mapping = await withTimeout(fsGet("auth_uids", auth.currentUser.uid), "auth_uids read");
        return !!mapping?.user_id;
      } catch (e) {
        console.warn("auth_uids check failed:", (e as any)?.message);
        return false;
      }
    },

    // Email + password sign-in. Resolves the Firebase Auth UID to an app user
    // via the auth_uids mapping collection, then starts a normal session.
    async signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
      if (!isFirestoreConfigured || typeof window === "undefined") {
        return { user: null, error: "Email sign-in is unavailable offline — use your PIN." };
      }
      try {
        const auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
        const cred = await withTimeout(signInWithEmailAndPassword(auth, email, password), "email sign-in");
        const mapping = await withTimeout(fsGet("auth_uids", cred.user.uid), "auth_uids read");
        if (!mapping?.user_id) {
          return { user: null, error: "This account is not linked to a station user." };
        }
        const users = await db.users.list();
        const user = users.find(u => u.id === mapping.user_id);
        if (!user) return { user: null, error: "Linked station user not found." };
        localStorage.setItem("shift_session", JSON.stringify(user));
        document.cookie = `shift_session=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=86400; SameSite=Lax`;
        MockDB.logAudit(user.id, "LOGIN", "users", user.id, `User logged in: ${user.name} (email)`);
        return { user, error: null };
      } catch (e) {
        const code = (e as any)?.code || "";
        if (code === "auth/invalid-credential" || code === "auth/user-not-found" || code === "auth/wrong-password") {
          return { user: null, error: "Invalid email or password." };
        }
        return { user: null, error: `Email sign-in failed: ${(e as any)?.message || "Unknown error"}` };
      }
    },

    // Admin-side: create a Firebase email/password account and link it to an
    // app user. Also stamps the email onto the user record.
    async linkEmail(userId: string, email: string, password: string): Promise<{ ok: boolean; error: string | null }> {
      if (!isFirestoreConfigured || typeof window === "undefined") {
        return { ok: false, error: "Email accounts need a live connection." };
      }
      try {
        const auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
        const cred = await withTimeout(createUserWithEmailAndPassword(auth, email, password), "account create");
        await withTimeout(fsSet("auth_uids", cred.user.uid, {
          user_id: userId,
          email,
          created_at: new Date().toISOString()
        }), "auth_uids write");
        await db.users.update(userId, { email });
        return { ok: true, error: null };
      } catch (e) {
        const code = (e as any)?.code || "";
        if (code === "auth/email-already-in-use") return { ok: false, error: "That email is already in use." };
        if (code === "auth/weak-password") return { ok: false, error: "Password is too weak — use at least 6 characters." };
        if (code === "auth/invalid-email") return { ok: false, error: "That email address is invalid." };
        return { ok: false, error: `Failed to create account: ${(e as any)?.message || "Unknown error"}` };
      }
    },

    // Self-service password change for users with a linked email account.
    // Re-authenticates with the current password first (Firebase requires a
    // recent sign-in for updatePassword), then applies the new password.
    async changeEmailPassword(currentPassword: string, newPassword: string): Promise<{ ok: boolean; error: string | null }> {
      if (!isFirestoreConfigured || typeof window === "undefined") {
        return { ok: false, error: "Email password changes need a live connection." };
      }
      const sessionUser = db.auth.getUser();
      if (!sessionUser?.email) {
        return { ok: false, error: "No email account is linked to this user." };
      }
      try {
        const auth = getAuth(getApps().length ? getApp() : initializeApp(firebaseConfig));
        if (!auth.currentUser) {
          return { ok: false, error: "Not signed in to Firebase — sign in with your email first." };
        }
        const credential = EmailAuthProvider.credential(sessionUser.email, currentPassword);
        await withTimeout(reauthenticateWithCredential(auth.currentUser, credential), "password re-auth");
        await withTimeout(updatePassword(auth.currentUser, newPassword), "password update");
        MockDB.logAudit(sessionUser.id, "CHANGE_EMAIL_PASSWORD", "users", sessionUser.id, `${sessionUser.name} changed their email password`);
        return { ok: true, error: null };
      } catch (e) {
        const code = (e as any)?.code || "";
        if (code === "auth/invalid-credential" || code === "auth/wrong-password") {
          return { ok: false, error: "Current password is incorrect." };
        }
        if (code === "auth/weak-password") return { ok: false, error: "New password is too weak — use at least 6 characters." };
        return { ok: false, error: `Password change failed: ${(e as any)?.message || "Unknown error"}` };
      }
    },

    async signOut(): Promise<void> {
      if (typeof window !== "undefined") {
        const session = localStorage.getItem("shift_session");
        if (session) {
          const user = JSON.parse(session) as User;
          if (isFirestoreConfigured && !firestoreDegraded) {
            try {
              await withTimeout(fsSet("audit_logs", `log-${Date.now()}`, {
                user_id: user.id,
                action: "LOGOUT",
                target_table: "users",
                target_id: user.id,
                details: `User logged out: ${user.name}`,
                created_at: new Date().toISOString()
              }), "audit_logs insert");
            } catch (e) {
              console.warn("Firestore logout audit failed:", (e as any)?.message);
            }
          } else {
            MockDB.logAudit(user.id, "LOGOUT", "users", user.id, `User logged out: ${user.name}`);
          }
        }
        document.cookie = "shift_session=; path=/; max-age=0; SameSite=Lax";
        localStorage.removeItem("shift_session");
        localStorage.removeItem(SWITCH_ORIGIN_KEY);
      }
    },

    getUser(): User | null {
      if (typeof window === "undefined") return null;
      const session = localStorage.getItem("shift_session");
      if (!session) return null;
      try {
        return JSON.parse(session) as User;
      } catch {
        return null;
      }
    },
  },

  users: {
    async list(): Promise<User[]> {
      const mockUsers = MockDB.getUsers();
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("users"), "users list");
          // Seed missing users to Firestore to prevent orphaned references
          const existingIds = new Set(data.map(u => u.id));
          const missing = mockUsers.filter(u => !existingIds.has(u.id));
          if (missing.length > 0) {
            await Promise.all(missing.map(u => fsSet("users", u.id, {
              id: u.id,
              email: u.email,
              name: u.name,
              role: u.role,
              created_at: u.created_at || new Date().toISOString()
            }, true)));
            const updated = await withTimeout(fsGetAll("users"), "users re-list");
            saveOriginalPins(updated as User[]);
            return overlayLocalUserChanges(updated as User[]).map(u => patchIsDefault(u));
          }
          saveOriginalPins(data as User[]);
          return overlayLocalUserChanges(data as User[]).map(u => patchIsDefault(u));
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore users list failed, falling back:", (e as any)?.message);
        }
      }
      return mockUsers;
    },
    async create(user: Omit<User, "id" | "created_at">): Promise<User & { pinSync?: PinSyncStatus }> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const newUser: User = {
            ...user,
            id: `u-${Date.now()}`,
            created_at: new Date().toISOString()
          };
          // Never write the PIN to the client-readable users doc — credentials
          // live server-side in `user_credentials` (Cloud Function setPin).
          const { pin, ...cloudUser } = newUser;
          await withTimeout(fsSet("users", newUser.id, cloudUser), "users create");
          const synced = await pushPinToServer(newUser.id, pin);
          if (synced === "local") {
            console.warn("users.create: PIN saved locally only (setPin unavailable/denied)");
          }
          return markPinSync(newUser, synced === "server" ? "server" : "local");
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore users create failed, falling back:", (e as any)?.message);
        }
      }
      const users = MockDB.getUsers();
      const newUser: User = {
        ...user,
        id: `u-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      users.push(newUser);
      MockDB.saveUsers(users);
      const currentUser = db.auth.getUser();
      MockDB.logAudit(currentUser?.id, "CREATE_USER", "users", newUser.id, `Created user ${newUser.name}`);
      return markPinSync(newUser, "local");
    },
    async update(id: string, updates: Partial<User>): Promise<User & { pinSync?: PinSyncStatus }> {
      const isCredentialChange = "email" in updates || "pin" in updates;
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          // The PIN never touches the client-readable users doc — route it to
          // the server-side credentials store instead.
          const { pin, ...cloudUpdates } = updates;
          await withTimeout(fsSet("users", id, cloudUpdates, true), "users update");
          const synced = await pushPinToServer(id, pin);
          if (isCredentialChange) {
            mirrorUserCredentials(id, (updates.email as string) || "", (updates.pin as string) || "");
          }
          const merged = { ...MockDB.getUsers().find(u => u.id === id), ...updates } as User;
          const result = patchIsDefault(merged);
          return synced ? markPinSync(result, synced) : result;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore users update failed, falling back:", (e as any)?.message);
        }
      }
      const users = MockDB.getUsers();
      const index = users.findIndex(u => u.id === id);
      if (index === -1) throw new Error("User not found");
      users[index] = { ...users[index], ...updates, is_default: isCredentialChange ? false : users[index].is_default };
      MockDB.saveUsers(users);
      const currentUser = db.auth.getUser();
      MockDB.logAudit(currentUser?.id, "UPDATE_USER", "users", id, `Updated user ${users[index].name}`);
      // Refresh session if the updated user is the current user
      if (currentUser?.id === id && (isCredentialChange || "name" in updates || "role" in updates)) {
        localStorage.setItem("shift_session", JSON.stringify(users[index]));
      }
      const result = users[index];
      return "pin" in updates ? markPinSync(result, "local") : result;
    },
    async delete(id: string): Promise<void> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsDelete("users", id), "users delete");
          return;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore users delete failed, falling back:", (e as any)?.message);
        }
      }
      const users = MockDB.getUsers();
      const updated = users.filter(u => u.id !== id);
      MockDB.saveUsers(updated);
      const currentUser = db.auth.getUser();
      MockDB.logAudit(currentUser?.id, "DELETE_USER", "users", id, `Deleted user ${id}`);
    },
    async changeCredentials(id: string, newEmail: string, newPin: string): Promise<User & { pinSync?: PinSyncStatus }> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("users", id, { email: newEmail.toLowerCase() }, true), "users credentials");
          const synced = await pushPinToServer(id, newPin);
          // Mirror to the local store so the old default PIN can't remain valid
          mirrorUserCredentials(id, newEmail, newPin);
          const local = MockDB.getUsers().find(u => u.id === id);
          const result = patchIsDefault({ ...(local || {}), id, email: newEmail.toLowerCase(), pin: newPin } as User);
          localStorage.setItem("shift_session", JSON.stringify(result));
          return markPinSync(result, synced === "server" ? "server" : "local");
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore users changeCredentials failed, falling back:", (e as any)?.message);
        }
      }
      const users = MockDB.getUsers();
      const index = users.findIndex(u => u.id === id);
      if (index === -1) throw new Error("User not found");
      users[index] = { ...users[index], email: newEmail.toLowerCase(), pin: newPin, is_default: false };
      MockDB.saveUsers(users);
      const updatedUser = users[index];
      // Refresh session
      localStorage.setItem("shift_session", JSON.stringify(updatedUser));
      MockDB.logAudit(id, "CHANGE_CREDENTIALS", "users", id, `User ${updatedUser.name} changed their email/pin`);
      return markPinSync(updatedUser, "local");
    }
  },

  stations: {
    async list(): Promise<Station[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("stations"), "stations list");
          if (data && data.length > 0) {
            // Cloud is authoritative for status/remarks so a change on one
            // device (e.g. restoring Joy FM to OK) propagates to every device.
            const local = MockDB.getStations();
            const cloudByName = new Map(data.map(c => [c.name, c]));
            const missing = local.filter(s => !cloudByName.has(s.name));
            if (missing.length > 0) {
              // Seed any stations the cloud doesn't have yet (mirror of the
              // users.list behaviour) so statuses stay syncable for all stations
              await Promise.all(missing.map(s => withTimeout(fsSet("stations", s.id, {
                id: s.id, name: s.name, logo_url: s.logo_url,
                current_status: s.current_status, remarks: s.remarks, updated_at: s.updated_at || ""
              }, true), "stations seed")));
            }
            const merged = local.map(s => {
              const cloud = cloudByName.get(s.name);
              return cloud
                ? { ...s, current_status: cloud.current_status, remarks: cloud.remarks, updated_at: cloud.updated_at || s.updated_at }
                : s;
            });
            MockDB.saveStations(merged);
            return merged;
          }
          const local = MockDB.getStations();
          if (local.length > 0) {
            await Promise.all(local.map(s => withTimeout(fsSet("stations", s.id, {
              id: s.id, name: s.name, logo_url: s.logo_url,
              current_status: s.current_status, remarks: s.remarks, updated_at: s.updated_at || ""
            }, true), "stations seed")));
          }
          return local;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore stations list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getStations();
    },
    async updateStatus(id: string, status: Station["current_status"], remarks?: string): Promise<Station> {
      const stations = MockDB.getStations();
      const idx = stations.findIndex(s => s.id === id);
      if (idx === -1) throw new Error("Station not found");
      
      const oldStatus = stations[idx].current_status;
      stations[idx].current_status = status;
      stations[idx].remarks = remarks;
      stations[idx].updated_at = new Date().toISOString();
      MockDB.saveStations(stations);
      
      const currentUser = db.auth.getUser();
      
      // Also try to update Firestore if configured (by matching name)
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const all = await withTimeout(fsGetAll("stations"), "stations list");
          const target = all.find(s => s.name === stations[idx].name);
          if (target) {
            await withTimeout(fsSet("stations", target.id, {
              current_status: status, remarks, updated_at: new Date().toISOString()
            }, true), "stations update");
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore stations sync failed (non-critical):", (e as any)?.message);
        }
      }
      
      // Log audit
      MockDB.logAudit(
        currentUser?.id,
        "STATION_STATUS_CHANGE",
        "stations",
        id,
        `Station ${stations[idx].name} status changed from ${oldStatus} to ${status}. Remarks: ${remarks}`
      );
      
      // Trigger notifications for critical faults
      if (status === "Off Air" || status === "Emergency" || status === "Signal Loss") {
        createNotification(
          `CRITICAL: ${stations[idx].name} is ${status}!`,
          remarks || `Station is reporting ${status} status. Please check.`,
          "critical_fault"
        );
      }
      
      return stations[idx];
    },
    async updateFrequency(id: string, frequency: string): Promise<Station> {
      const stations = MockDB.getStations();
      const idx = stations.findIndex(s => s.id === id);
      if (idx === -1) throw new Error("Station not found");

      stations[idx].frequency = frequency;
      stations[idx].updated_at = new Date().toISOString();
      MockDB.saveStations(stations);

      const currentUser = db.auth.getUser();

      // Mirror to Firestore (by matching name) so every device sees the change
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const all = await withTimeout(fsGetAll("stations"), "stations list");
          const target = all.find(s => s.name === stations[idx].name);
          if (target) {
            await withTimeout(fsSet("stations", target.id, {
              frequency, updated_at: new Date().toISOString()
            }, true), "stations freq update");
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore stations frequency sync failed (non-critical):", (e as any)?.message);
        }
      }

      MockDB.logAudit(
        currentUser?.id,
        "STATION_FREQ_CHANGE",
        "stations",
        id,
        `Station ${stations[idx].name} transmission frequency set to ${frequency}`
      );

      return stations[idx];
    }
  },

  shifts: {
    // `timeoutMs` lets the check-in path wait out a slow connection before
    // concluding "no shift running" — a premature null would start a SECOND
    // shift and complete the first technician's shift out from under them.
    async getActive(timeoutMs: number = FIRESTORE_TIMEOUT_MS): Promise<Shift | null> {
      // Firestore is authoritative for shift state — reconcile the local mirror
      // so stale "Active" shifts from other devices never win
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const all = await withTimeout(fsGetAll("shifts"), "shifts getActive", timeoutMs);
          const data = all
            .filter(s => s.status === "Active")
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
          if (data) {
            // Self-heal local mirror: complete stale local actives, upsert the cloud one
            const mockShifts = MockDB.getShifts();
            let changed = false;
            for (const s of mockShifts) {
              if (s.status === "Active" && s.id !== data.id) {
                s.status = "Completed";
                changed = true;
              }
            }
            const idx = mockShifts.findIndex(s => s.id === data.id);
            if (idx === -1) {
              mockShifts.unshift(data as Shift);
              changed = true;
            } else {
              mockShifts[idx] = { ...mockShifts[idx], ...(data as Shift) };
            }
            if (changed) MockDB.saveShifts(mockShifts);
            return data as Shift;
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore getActive failed, falling back:", (e as any)?.message);
        }
      }

      return MockDB.getActiveShift();
    },
    async getPreviousCompleted(): Promise<Shift | null> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const all = await withTimeout(fsGetAll("shifts"), "shifts getPreviousCompleted");
          const data = all
            .filter(s => s.status === "Completed")
            .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime())[0];
          if (data) return data as Shift;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore getPreviousCompleted failed, falling back:", (e as any)?.message);
        }
      }
      const completed = MockDB.getShifts()
        .filter(s => s.status === "Completed" && s.end_time)
        .sort((a, b) => new Date(b.end_time!).getTime() - new Date(a.end_time!).getTime());
      return completed[0] || null;
    },
    async list(): Promise<Shift[]> {
      // Reconcile with Firestore so status changes (completed shifts, new shifts
      // started on other devices) propagate to this device's local mirror
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("shifts"), "shifts list");
          if (data) {
            const local = MockDB.getShifts();
            const cloudIds = new Set(data.map(s => s.id));
            const localOnly = local.filter(s => !cloudIds.has(s.id));
            const merged = [...(data as Shift[]), ...localOnly]
              .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
            // Update local mirror statuses so getActive()/MockDB stay in sync,
            // while preserving local-only rows created during degraded periods
            const saved = merged.map(cloud =>
              local.find(l => l.id === cloud.id)
                ? { ...local.find(l => l.id === cloud.id), ...cloud }
                : cloud
            );
            MockDB.saveShifts(saved);
            flushPendingWrites();
            return saved;
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore shifts list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getShifts();
    },
      // Explicit technician check-in — called ONLY on user confirmation (the
      // login "Start Shift" choice or the dashboard Check In button). Browsing
      // sessions never reach this path, so attendance can't be recorded by just
      // logging in to look around.
      async recordCheckIn(userId: string): Promise<boolean> {
        const users = await db.users.list();
        const u = users.find(x => x.id === userId);
        if (!u || u.role === "Admin") return false; // Admins don't generate shift attendance

        // The active-shift read gets the full write window: concluding "no
        // shift" from a timed-out read is what caused duplicate shifts (each
        // browser started its own, and the second start completed the first
        // technician's shift mid-shift).
        const active = await db.shifts.getActive(FIRESTORE_WRITE_TIMEOUT_MS);
        if (active) {
          // Guard against stale local mirrors: if the "active" shift no longer
          // exists in the cloud (deleted/completed since this device last
          // synced), don't check anyone into a ghost shift — let the start
          // path create/join the real one.
          if (isFirestoreConfigured && !isOffline() && !firestoreDegraded) {
            try {
              const exists = await withTimeout(fsGet("shifts", active.id), "shift exists check", FIRESTORE_WRITE_TIMEOUT_MS);
              if (!exists) {
                console.warn("Check-in target shift", active.id, "not found in cloud — self-healing mirror");
                const mockShifts = MockDB.getShifts();
                mockShifts.forEach(s => { if (s.status === "Active") { s.status = "Completed"; s.end_time = new Date().toISOString(); } });
                MockDB.saveShifts(mockShifts);
                const now = new Date();
                await db.shifts.start(getShiftTypeForTime(now), "Radio Engineering", userId, "Shift started on login");
                return true;
              }
            } catch (e) {
              console.warn("Shift existence check failed (non-critical):", (e as any)?.message);
            }
          }
          // Shift running: record a check-in only if this user has none yet
          const attRecords = await db.attendance.getForShift(active.id);
          const existing = attRecords.find(a => a.user_id === userId);
          if (existing) return false;

          // Outgoing technicians from the just-completed shift must not be
          // checked into the new shift — only the incoming roster belongs here
          const prev = await db.shifts.getPreviousCompleted();
          if (prev && prev.id !== active.id) {
            const prevAtt = await db.attendance.getForShift(prev.id);
            if (prevAtt.some(a => a.user_id === userId)) return false;
          }

          const now = new Date();
          const isLate = isLateCheckIn(now, active);
          await db.attendance.create({
            shift_id: active.id,
            user_id: userId,
            time_reported: now.toISOString(),
            hours_worked: 0,
            is_late: isLate,
            late_reason: isLate ? "Shift rotation check-in" : undefined
          });
          return true; // created a check-in — pages should refresh
        }

      // No shift running — start one for this engineer
      const now = new Date();
      await db.shifts.start(getShiftTypeForTime(now), "Radio Engineering", userId, "Shift started on login");
      return true; // started a shift — pages should refresh
    },
    async start(shift_type: ShiftType, location: string, incoming_staff_id: string, notes?: string, completeExisting = false): Promise<Shift> {
      // The cloud write always runs (even inside a degraded window): a shift
      // started in one browser must be visible to every other device, so a
      // local-only shift is the last resort, not the degraded default.
      if (isFirestoreConfigured && !isOffline()) {
        try {
          try { await ensureUserInFirestore(incoming_staff_id); }
          catch (e) { console.warn("Firestore ensureUserInFirestore failed (non-critical):", (e as any)?.message); }

          // A shift may already be running (started on another device, or by a
          // concurrent caller like the login page + auth sync both auto-starting
          // at sign-in). By default REUSE it — rotation (completeExisting) is
          // done explicitly by the handover submit. Creating a duplicate would
          // complete the first technician's shift out from under them.
          const joinShift = async (running: Shift): Promise<Shift> => {
            // Self-heal the local mirror: keep only the cloud shift active
            const mockShifts = MockDB.getShifts();
            let changed = false;
            for (const s of mockShifts) {
              if (s.status === "Active" && s.id !== running.id) { s.status = "Completed"; changed = true; }
            }
            const idx = mockShifts.findIndex(s => s.id === running.id);
            if (idx === -1) { mockShifts.unshift(running); changed = true; }
            if (changed) MockDB.saveShifts(mockShifts);
            // Attendance row is idempotent (deterministic id) — the caller joins
            // the running shift even when it was started by another device.
            const attRow: Attendance = {
              id: `att-${running.id}-${incoming_staff_id}`,
              shift_id: running.id,
              user_id: incoming_staff_id,
              time_reported: new Date().toISOString(),
              hours_worked: 0,
              is_late: isLateCheckIn(new Date(), running)
            };
            try {
              await withTimeout(fsSet("attendance", attRow.id, attRow), "attendance join", FIRESTORE_WRITE_TIMEOUT_MS);
              const mockAtt = MockDB.getAttendance();
              mockAtt.unshift(attRow);
              MockDB.saveAttendance(mockAtt);
            } catch (e) {
              console.warn("Firestore attendance join failed (non-critical):", (e as any)?.message);
              queuePendingWrite("attendance", attRow.id, attRow);
              const mockAtt = MockDB.getAttendance();
              mockAtt.unshift(attRow);
              MockDB.saveAttendance(mockAtt);
            }
            resetFirestoreDegraded();
            return running;
          };
          try {
            const all = await withTimeout(fsGetAll("shifts"), "shifts start list", FIRESTORE_WRITE_TIMEOUT_MS);
            const actives = (all || []).filter(s => s.status === "Active");
            if (actives.length > 0) {
              const running = actives.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] as Shift;
              if (completeExisting) {
                // Deliberate rotation (handover submit): close the running shift
                await Promise.all(actives.map(a => fsSet("shifts", a.id, { status: "Completed", end_time: new Date().toISOString() }, true)));
              } else {
                return await joinShift(running);
              }
            }
          } catch (e) {
            console.warn("Firestore shift start list failed (non-critical):", (e as any)?.message);
          }

          // A concurrent caller may have started a shift after our snapshot —
          // reuse it instead of creating a duplicate (which would also double
          // the attendance check-in row for the same technician)
          try {
            const nowAll = await withTimeout(fsGetAll("shifts"), "shifts start recheck", FIRESTORE_WRITE_TIMEOUT_MS);
            const nowActive = (nowAll || []).filter(s => s.status === "Active");
            if (nowActive.length > 0) {
              const racing = nowActive.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] as Shift;
              if (completeExisting) {
                await Promise.all(nowActive.map(a => fsSet("shifts", a.id, { status: "Completed", end_time: new Date().toISOString() }, true)));
              } else {
                return await joinShift(racing);
              }
            }
          } catch (e) {
            console.warn("Firestore shift recheck failed (non-critical):", (e as any)?.message);
          }

          let outgoing: string | undefined;
          try {
            const prevShifts = await withTimeout(fsGetAll("shifts"), "shifts start prev", FIRESTORE_WRITE_TIMEOUT_MS);
            const sorted = [...(prevShifts || [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            outgoing = sorted.length > 0 ? sorted[0].incoming_staff_id : undefined;
          } catch (e) {
            console.warn("Firestore shifts prev read failed (non-critical):", (e as any)?.message);
          }

          const activeShift: Shift = {
            id: `shift-${Date.now()}`,
            date: new Date().toISOString().split("T")[0],
            shift_type,
            location,
            outgoing_staff_id: outgoing,
            incoming_staff_id,
            start_time: new Date().toISOString(),
            status: "Active",
            notes,
            created_at: new Date().toISOString()
          };
          try {
            await withTimeout(fsSet("shifts", activeShift.id, activeShift), "shifts start", FIRESTORE_WRITE_TIMEOUT_MS);
          } catch (e) {
            // The shift itself is the critical row — queue it so a later
            // successful read pushes it to the cloud for other devices.
            console.warn("Firestore shift start write failed, queueing:", (e as any)?.message);
            queuePendingWrite("shifts", activeShift.id, activeShift);
          }

          const attRow: Attendance = {
            // Deterministic id — matches the check-in row recordCheckIn would
            // create, so racing start + check-in paths converge on ONE row.
            id: `att-${activeShift.id}-${incoming_staff_id}`,
            shift_id: activeShift.id,
            user_id: incoming_staff_id,
            time_reported: new Date().toISOString(),
            hours_worked: 0,
            is_late: isLateCheckIn(new Date(), { shift_type: activeShift.shift_type, date: activeShift.date })
          };
          try {
            await withTimeout(fsSet("attendance", attRow.id, attRow), "attendance start", FIRESTORE_WRITE_TIMEOUT_MS);
          } catch (e) {
            console.warn("Firestore attendance start failed (non-critical):", (e as any)?.message);
            queuePendingWrite("attendance", attRow.id, attRow);
          }

          resetFirestoreDegraded();

          // Mirror the new shift into MockDB so getActive() can find it
          const mockShifts = MockDB.getShifts();
          mockShifts.unshift(activeShift);
          MockDB.saveShifts(mockShifts);

          const mockAtt = MockDB.getAttendance();
          mockAtt.unshift(attRow);
          MockDB.saveAttendance(mockAtt);

          return activeShift;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore shift start failed, falling back to MockDB:", (e as any)?.message);
        }
      }
      const active = MockDB.getActiveShift();
      if (active) throw new Error("There is already an active shift running!");
      
      const shifts = MockDB.getShifts();
      const outgoing = shifts.length > 0 ? shifts[0].incoming_staff_id : undefined;
      
      const newShift: Shift = {
        id: `shift-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        shift_type,
        location,
        outgoing_staff_id: outgoing,
        incoming_staff_id,
        start_time: new Date().toISOString(),
        status: "Active",
        notes,
        created_at: new Date().toISOString()
      };
      
      shifts.unshift(newShift);
      MockDB.saveShifts(shifts);
      // The cloud write failed (or we're offline) — queue the shift so it
      // reaches other devices as soon as the connection recovers.
      if (isFirestoreConfigured) queuePendingWrite("shifts", newShift.id, newShift);
      
      // Create attendance record for the incoming engineer
      const attRow: Attendance = {
        id: `att-${newShift.id}-${incoming_staff_id}`,
        shift_id: newShift.id,
        user_id: incoming_staff_id,
        time_reported: new Date().toISOString(),
        hours_worked: 0,
        is_late: isLateCheckIn(new Date(), newShift)
      };
      const attendance = MockDB.getAttendance();
      attendance.unshift(attRow);
      MockDB.saveAttendance(attendance);
      if (isFirestoreConfigured) queuePendingWrite("attendance", attRow.id, attRow);
      
      const user = MockDB.getUsers().find(u => u.id === incoming_staff_id);
      createNotification(
        "Shift Started",
        `${user?.name || "Staff"} has started the ${shift_type} shift at ${location}.`,
        "shift_start"
      );
      
      MockDB.logAudit(incoming_staff_id, "START_SHIFT", "shifts", newShift.id, `Started ${shift_type} shift`);
      return newShift;
    },
    async end(id: string, notes?: string): Promise<Shift> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("shifts", id, {
            status: "Completed", end_time: new Date().toISOString(), notes
          }, true), "shifts end");
          const endTime = new Date().toISOString();

          const shiftRecord = await withTimeout(fsGet("shifts", id), "shifts get");
          const attList = (await withTimeout(fsGetAll("attendance"), "attendance list"))
            .filter(a => a.shift_id === id && a.user_id === shiftRecord?.incoming_staff_id);
          const att = attList?.[0];
          if (att) {
            const checkIn = new Date(att.time_reported).getTime();
            const checkOut = new Date().getTime();
            const hours = parseFloat(((checkOut - checkIn) / 3600000).toFixed(2));
            
            const checkOutDate = new Date();
            const shiftEndDate = new Date(checkOutDate);
            shiftEndDate.setHours(17, 0, 0, 0);
            const minutesDiff = Math.round((checkOut - shiftEndDate.getTime()) / 60000);

            await withTimeout(fsSet("attendance", att.id, {
              time_leaving: checkOutDate.toISOString(),
              hours_worked: hours,
              is_early_departure: minutesDiff < 0,
              overtime_minutes: minutesDiff > 0 ? minutesDiff : 0
            }, true), "attendance end");
          }

          // Mirror end to MockDB
          const mockShifts = MockDB.getShifts();
          const mockIdx = mockShifts.findIndex(s => s.id === id);
          if (mockIdx !== -1) {
            mockShifts[mockIdx].status = "Completed";
            mockShifts[mockIdx].end_time = endTime;
            mockShifts[mockIdx].notes = notes || mockShifts[mockIdx].notes;
            MockDB.saveShifts(mockShifts);
          }

          const shift = mockIdx !== -1 ? mockShifts[mockIdx] : { id, status: "Completed", end_time: endTime } as Shift;
          return shift;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore shift end failed, falling back to MockDB:", (e as any)?.message);
          // Fall through to MockDB
        }
      }
      const shifts = MockDB.getShifts();
      const idx = shifts.findIndex(s => s.id === id);
      if (idx === -1) throw new Error("Shift not found");
      
      shifts[idx].end_time = new Date().toISOString();
      shifts[idx].status = "Completed";
      shifts[idx].notes = notes || shifts[idx].notes;
      MockDB.saveShifts(shifts);
      
      // Update attendance end time and compute early departure / overtime against 5:00 PM
      const attendance = MockDB.getAttendance();
      const attIdx = attendance.findIndex(a => a.shift_id === id && a.user_id === shifts[idx].incoming_staff_id);
      if (attIdx !== -1) {
        const checkOutDate = new Date();
        const checkIn = new Date(attendance[attIdx].time_reported).getTime();
        const checkOut = checkOutDate.getTime();
        const hours = parseFloat(((checkOut - checkIn) / 3600000).toFixed(2));

        // Shift ends at 17:00 (5:00 PM)
        const shiftEndDate = new Date(checkOutDate);
        shiftEndDate.setHours(17, 0, 0, 0);
        const shiftEndMs = shiftEndDate.getTime();

        const minutesDiff = Math.round((checkOut - shiftEndMs) / 60000);
        const isEarlyDeparture = minutesDiff < 0;     // Left before 5 PM
        const overtimeMinutes = minutesDiff > 0 ? minutesDiff : 0; // Extra minutes past 5 PM

        attendance[attIdx].time_leaving = checkOutDate.toISOString();
        attendance[attIdx].hours_worked = hours;
        attendance[attIdx].is_early_departure = isEarlyDeparture;
        attendance[attIdx].overtime_minutes = overtimeMinutes;
        MockDB.saveAttendance(attendance);
      }
      
      const user = MockDB.getUsers().find(u => u.id === shifts[idx].incoming_staff_id);
      createNotification(
        "Shift Ended",
        `${user?.name || "Staff"} has completed their shift. Handover pending.`,
        "shift_end"
      );
      
      MockDB.logAudit(shifts[idx].incoming_staff_id, "END_SHIFT", "shifts", id, `Ended active shift`);
      return shifts[idx];
    },
    async update(id: string, updates: Partial<Shift>): Promise<Shift> {
      // Critical write — the active shift must look the same on every device
      if (isFirestoreConfigured && !isOffline()) {
        try {
          await withTimeout(fsSet("shifts", id, updates, true), "shifts update", FIRESTORE_WRITE_TIMEOUT_MS);
          resetFirestoreDegraded();
          const mockShifts = MockDB.getShifts();
          const mockIdx = mockShifts.findIndex(s => s.id === id);
          if (mockIdx !== -1) {
            mockShifts[mockIdx] = { ...mockShifts[mockIdx], ...updates };
            MockDB.saveShifts(mockShifts);
          }
          return { ...(mockIdx !== -1 ? mockShifts[mockIdx] : {}), ...updates, id } as Shift;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore shift update failed, falling back to MockDB:", (e as any)?.message);
          queuePendingWrite("shifts", id, updates, true);
        }
      }
      const shifts = MockDB.getShifts();
      const idx = shifts.findIndex(s => s.id === id);
      if (idx === -1) throw new Error("Shift not found");
      shifts[idx] = { ...shifts[idx], ...updates };
      MockDB.saveShifts(shifts);
      return shifts[idx];
    }
  },

  attendance: {
    async list(): Promise<Attendance[]> {
      // Firestore is authoritative — stale local mirrors (e.g. phantom check-ins
      // removed in the cloud) must never reappear on this device
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("attendance"), "attendance list");
          if (data) {
            // Keep the local mirror in sync with the cloud so fallback reads
            // return the same state and counts never flip-flop between sources
            const mockAtt = MockDB.getAttendance();
            const cloudIds = new Set(data.map(a => a.id));
            const merged = [...(data as Attendance[]), ...mockAtt.filter(a => !cloudIds.has(a.id))]
              .sort((a, b) => new Date(b.time_reported).getTime() - new Date(a.time_reported).getTime());
            MockDB.saveAttendance(merged);
            flushPendingWrites();
            return dedupeAttendance(merged);
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore attendance list failed, falling back:", (e as any)?.message);
        }
      }
      return dedupeAttendance(MockDB.getAttendance());
    },
    async getForShift(shiftId: string): Promise<Attendance[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("attendance"), "attendance getForShift");
          if (data) {
            // Keep the local mirror in sync with the cloud (same as list()) so
            // degraded fallback reads never show a stale roster — e.g. a
            // supervisor's device must see a partner's check-in the first time
            // ANY read succeeds, not just after a full list().
            const mockAtt = MockDB.getAttendance();
            const cloudIds = new Set(data.map(a => a.id));
            const merged = [...(data as Attendance[]), ...mockAtt.filter(a => !cloudIds.has(a.id))]
              .sort((a, b) => new Date(b.time_reported).getTime() - new Date(a.time_reported).getTime());
            MockDB.saveAttendance(merged);
            flushPendingWrites();
            return dedupeAttendance((data as Attendance[]).filter(a => a.shift_id === shiftId));
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore attendance getForShift failed, falling back:", (e as any)?.message);
        }
      }
      return dedupeAttendance(MockDB.getAttendance().filter(a => a.shift_id === shiftId));
    },
    async create(att: Omit<Attendance, "id">): Promise<Attendance> {
      // Deterministic ID per (shift, user) — a user has exactly one check-in
      // row per shift, so racing creates (login sync vs 5s poll vs partner
      // modal) all write the same doc instead of producing duplicate rows.
      const id = `att-${att.shift_id}-${att.user_id}`;
      // Critical write: always attempt the cloud so check-ins and absence
      // marks land on every device, even inside a degraded window.
      if (isFirestoreConfigured && !isOffline()) {
        try {
          try { await ensureUserInFirestore(att.user_id); }
          catch (e) { console.warn("Firestore ensureUserInFirestore failed (non-critical):", (e as any)?.message); }
          try { await ensureShiftInFirestore(att.shift_id); }
          catch (e) { console.warn("Firestore ensureShiftInFirestore failed (non-critical):", (e as any)?.message); }
          const newAtt: Attendance = { ...att, id };
          await withTimeout(fsSet("attendance", newAtt.id, newAtt), "attendance create", FIRESTORE_WRITE_TIMEOUT_MS);
          resetFirestoreDegraded();
          const mockAtt = MockDB.getAttendance();
          const idx = mockAtt.findIndex(a => a.id === newAtt.id);
          if (idx === -1) mockAtt.push(newAtt);
          else mockAtt[idx] = newAtt;
          MockDB.saveAttendance(mockAtt);
          return newAtt;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore attendance create failed, falling back to MockDB:", (e as any)?.message);
          queuePendingWrite("attendance", id, { ...att, id });
        }
      }
      const attendance = MockDB.getAttendance();
      const newAtt: Attendance = {
        ...att,
        id
      };
      const idx = attendance.findIndex(a => a.id === id);
      if (idx === -1) attendance.push(newAtt);
      else attendance[idx] = newAtt;
      MockDB.saveAttendance(attendance);
      return newAtt;
    },
    async update(id: string, updates: Partial<Attendance>): Promise<Attendance> {
      // Critical write (check-in edits, absence marks/unmarks) — always try
      // the cloud so one device's supervisor actions reach every device.
      if (isFirestoreConfigured && !isOffline()) {
        try {
          await withTimeout(fsSet("attendance", id, updates, true), "attendance update", FIRESTORE_WRITE_TIMEOUT_MS);
          resetFirestoreDegraded();
          const attendance = MockDB.getAttendance();
          const idx = attendance.findIndex(a => a.id === id);
          if (idx !== -1) {
            attendance[idx] = { ...attendance[idx], ...updates };
            MockDB.saveAttendance(attendance);
            return attendance[idx];
          }
          return { ...updates, id } as Attendance;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore attendance update failed, falling back:", (e as any)?.message);
          queuePendingWrite("attendance", id, updates, true);
        }
      }
      const attendance = MockDB.getAttendance();
      const idx = attendance.findIndex(a => a.id === id);
      if (idx === -1) throw new Error("Attendance record not found");
      attendance[idx] = { ...attendance[idx], ...updates };
      MockDB.saveAttendance(attendance);
      return attendance[idx];
    },
    async remove(id: string): Promise<void> {
      // Critical write: deleting an absence-only row (unmarking a tech who
      // never checked in) must reach the cloud so the "duty engineer" roster
      // doesn't resurrect them on other devices.
      if (isFirestoreConfigured && !isOffline()) {
        try {
          await withTimeout(fsDelete("attendance", id), "attendance delete", FIRESTORE_WRITE_TIMEOUT_MS);
          resetFirestoreDegraded();
          const attendance = MockDB.getAttendance();
          MockDB.saveAttendance(attendance.filter(a => a.id !== id));
          dropPendingWrite("attendance", id);
          return;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore attendance delete failed, removing locally:", (e as any)?.message);
        }
      }
      const attendance = MockDB.getAttendance();
      MockDB.saveAttendance(attendance.filter(a => a.id !== id));
      dropPendingWrite("attendance", id);
    }
  },

  faults: {
    async list(): Promise<Fault[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("faults"), "faults list");
          if (data && data.length > 0) {
            // Merge Firestore data into MockDB, preserving fields Firestore doesn't have.
            // Local-first: return the merged union so local-only faults (e.g. created
            // while sync was down) are never shadowed by the cloud copy.
            const mockFaults = MockDB.getFaults();
            for (const sf of data) {
              const localIdx = mockFaults.findIndex(f => f.id === sf.id);
              if (localIdx !== -1) {
                mockFaults[localIdx] = { ...mockFaults[localIdx], ...(sf as Fault) };
              } else {
                mockFaults.unshift(sf as Fault);
              }
            }
            MockDB.saveFaults(mockFaults);
            return mockFaults;
          }
          return MockDB.getFaults();
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore faults list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getFaults();
    },
    async create(fault: Omit<Fault, "id" | "time_detected" | "created_at" | "updated_at"> & { time_detected?: string }): Promise<Fault> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          // Strip fields the cloud schema doesn't have
          const { shift_id, ...dbFault } = fault as any;
          const newFault: Fault = {
            ...fault,
            id: `fault-${Date.now()}`,
            time_detected: fault.time_detected || new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          await withTimeout(fsSet("faults", newFault.id, { ...dbFault, ...newFault }), "faults create");

          // Mirror to MockDB
          const faults = MockDB.getFaults();
          faults.unshift(newFault);
          MockDB.saveFaults(faults);

          // Notify the assigned engineer with the work details
          if (newFault.assigned_engineer_id) {
            try { await notifyFaultAssigned(newFault); } catch {}
          }

          return newFault;
        } catch (e) {
          setFirestoreDegraded(); console.warn("Firestore fault create failed, falling back to MockDB:", (e as any)?.message);
        }
      }
      const faults = MockDB.getFaults();
      const newFault: Fault = {
        ...fault,
        id: `fault-${Date.now()}`,
        time_detected: fault.time_detected || new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      faults.unshift(newFault);
      MockDB.saveFaults(faults);
      
      const reporter = MockDB.getUsers().find(u => u.id === fault.reported_by_id);
      const station = MockDB.getStations().find(s => s.id === fault.station_id);
      
      // Notify
      createNotification(
        `New Fault: ${station?.name || "Station"}`,
        `[${fault.priority}] ${fault.category}: ${fault.description} (Reported by ${reporter?.name || "Staff"})`,
        "fault_new"
      );
      
      // Notify the assigned engineer with the work details
      if (newFault.assigned_engineer_id) {
        notifyFaultAssigned(newFault);
      }
      
      // Auto-update station status if a new active fault is logged
      if (newFault.station_id && newFault.status !== "Resolved") {
        try {
          const station = MockDB.getStations().find(s => s.id === newFault.station_id);
          if (station && station.current_status === "OK") {
            await db.stations.updateStatus(newFault.station_id, "Fault", `Fault reported: ${newFault.description}`);
          }
        } catch (err) {
          console.warn("Failed to auto-update station status on fault create:", err);
        }
      }

      MockDB.logAudit(fault.reported_by_id, "CREATE_FAULT", "faults", newFault.id, `Reported fault in ${station?.name}`);
      return newFault;
    },
    async update(id: string, updates: Partial<Fault>, userId: string): Promise<Fault> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const { shift_id, ...dbUpdates } = updates as any;
          const payload = {
            ...dbUpdates,
            updated_at: new Date().toISOString(),
            resolved_time: updates.status === "Resolved" ? new Date().toISOString() : undefined
          };
          await withTimeout(fsSet("faults", id, payload, true), "faults update");

          await withTimeout(fsSet("fault_updates", `fup-${Date.now()}`, {
            fault_id: id,
            user_id: userId,
            status: updates.status,
            action_taken: updates.action_taken,
            remarks: updates.description,
            created_at: new Date().toISOString()
          }), "fault_updates insert");

          // Notify the newly assigned engineer with the work details
          if (updates.assigned_engineer_id !== undefined) {
            try { await notifyFaultAssigned({ ...updates, id } as Fault); } catch {}
          }

          // Mark the technician's assignment notification as read when the fault is resolved
          if (updates.status === "Resolved") {
            try { await markFaultAssignNotificationsRead(id); } catch {}
          }

          // Mirror to MockDB
          const faults = MockDB.getFaults();
          const fIdx = faults.findIndex(f => f.id === id);
          const updatedFault = {
            ...(fIdx !== -1 ? faults[fIdx] : { id }),
            ...payload
          } as Fault;
          if (fIdx !== -1) {
            faults[fIdx] = updatedFault;
            MockDB.saveFaults(faults);
          }

          // Auto-sync station status
          if (updatedFault?.station_id) {
            const allFaults = MockDB.getFaults();
            const remainingActive = allFaults.filter(f => f.station_id === updatedFault.station_id && f.status !== "Resolved");
            const station = MockDB.getStations().find(s => s.id === updatedFault.station_id);
            if (remainingActive.length === 0 && station && station.current_status !== "OK") {
              await db.stations.updateStatus(
                updatedFault.station_id,
                "OK",
                updates.action_taken ? `Resolved: ${updates.action_taken}` : "All active faults resolved"
              );
            } else if (remainingActive.length > 0 && station && station.current_status === "OK") {
              await db.stations.updateStatus(
                updatedFault.station_id,
                "Fault",
                `Active fault (${remainingActive[0].status}): ${remainingActive[0].description}`
              );
            }
          }

          return updatedFault;
        } catch (e) {
          setFirestoreDegraded(); console.warn("Firestore fault update failed, falling back to MockDB:", (e as any)?.message);
        }
      }
      const faults = MockDB.getFaults();
      const idx = faults.findIndex(f => f.id === id);
      if (idx === -1) throw new Error("Fault not found");
      
      const oldStatus = faults[idx].status;
      const newStatus = updates.status || oldStatus;
      
      faults[idx] = {
        ...faults[idx],
        ...updates,
        updated_at: new Date().toISOString(),
        resolved_time: newStatus === "Resolved" ? new Date().toISOString() : faults[idx].resolved_time
      };
      MockDB.saveFaults(faults);
      
      // Log update history
      const logUpdates = MockDB.getFaultUpdates();
      logUpdates.push({
        id: `fup-${Date.now()}`,
        fault_id: id,
        user_id: userId,
        status: newStatus,
        action_taken: updates.action_taken,
        remarks: updates.description,
        created_at: new Date().toISOString()
      });
      MockDB.saveFaultUpdates(logUpdates);
      
      if (newStatus !== oldStatus) {
        createNotification(
          `Fault Status Updated`,
          `Fault status changed to ${newStatus} for fault id ${id}.`,
          "fault_update"
        );
      }

      // Notify the newly assigned engineer with the work details
      if (updates.assigned_engineer_id !== undefined) {
        notifyFaultAssigned(faults[idx]);
      }

      // Mark the technician's assignment notification as read when the fault is resolved
      if (newStatus === "Resolved") {
        try { await markFaultAssignNotificationsRead(id); } catch {}
      }

      // Auto-sync station status when faults are resolved or re-opened
      const updatedFault = faults[idx];
      if (updatedFault.station_id) {
        const remainingActive = faults.filter(f => f.station_id === updatedFault.station_id && f.status !== "Resolved");
        const station = MockDB.getStations().find(s => s.id === updatedFault.station_id);
        if (remainingActive.length === 0 && station && station.current_status !== "OK") {
          await db.stations.updateStatus(
            updatedFault.station_id,
            "OK",
            updates.action_taken ? `Resolved: ${updates.action_taken}` : "All active faults resolved"
          );
        } else if (remainingActive.length > 0 && station && station.current_status === "OK") {
          await db.stations.updateStatus(
            updatedFault.station_id,
            "Fault",
            `Active fault (${remainingActive[0].status}): ${remainingActive[0].description}`
          );
        }
      }
      
      MockDB.logAudit(userId, "UPDATE_FAULT", "faults", id, `Updated fault status from ${oldStatus} to ${newStatus}`);
      return faults[idx];
    },
    async getTimeline(faultId: string): Promise<FaultUpdate[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("fault_updates"), "fault_updates list");
          if (data) {
            return data
              .filter(u => u.fault_id === faultId)
              .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) as FaultUpdate[];
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore faults getTimeline failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getFaultUpdates().filter(u => u.fault_id === faultId);
    }
  },

  outsideBroadcasts: {
    async list(): Promise<OutsideBroadcast[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("outside_broadcasts"), "obs list");
          if (data) {
            // Sync the local mirror so fallback reads match the cloud
            const mockObs = MockDB.getOBs();
            const cloudIds = new Set(data.map(o => o.id));
            const merged = [...(data as OutsideBroadcast[]).map(o => ({ ...o, technical_crew: o.technical_crew ?? [] })), ...mockObs.filter(o => !cloudIds.has(o.id))]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            MockDB.saveOBs(merged);
            return merged;
          }
          return MockDB.getOBs();
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore outsideBroadcasts list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getOBs();
    },
    async create(ob: Omit<OutsideBroadcast, "id" | "created_at">): Promise<OutsideBroadcast> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const newOb: OutsideBroadcast = {
            ...ob,
            id: `ob-${Date.now()}`,
            created_at: new Date().toISOString()
          };
          await withTimeout(fsSet("outside_broadcasts", newOb.id, newOb), "obs create");
          // Mirror into the local store so degraded fallback reads stay consistent
          const mockObs = MockDB.getOBs();
          if (!mockObs.some(o => o.id === newOb.id)) mockObs.unshift(newOb);
          MockDB.saveOBs(mockObs);
          return newOb;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore outsideBroadcasts create failed, falling back:", (e as any)?.message);
        }
      }
      const obs = MockDB.getOBs();
      const newOb: OutsideBroadcast = {
        ...ob,
        id: `ob-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      obs.unshift(newOb);
      MockDB.saveOBs(obs);
      
      createNotification(
        "OB Broadcast Started",
        `Outside broadcast "${ob.program_name}" running at ${ob.location} via ${ob.signal_method}.`,
        "ob_start"
      );
      
      const user = db.auth.getUser();
      MockDB.logAudit(user?.id, "START_OB", "outside_broadcasts", newOb.id, `Started OB: ${ob.program_name}`);
      return newOb;
    },
    async update(id: string, updates: Partial<OutsideBroadcast>): Promise<OutsideBroadcast> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("outside_broadcasts", id, updates, true), "obs update");
          const mockObs = MockDB.getOBs();
          const idx = mockObs.findIndex(o => o.id === id);
          if (idx === -1) {
            mockObs.unshift({ ...updates, id } as OutsideBroadcast);
          } else {
            mockObs[idx] = { ...mockObs[idx], ...updates };
          }
          MockDB.saveOBs(mockObs);
          return mockObs.find(o => o.id === id) as OutsideBroadcast;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore outsideBroadcasts update failed, falling back:", (e as any)?.message);
        }
      }
      const obs = MockDB.getOBs();
      const idx = obs.findIndex(o => o.id === id);
      if (idx === -1) throw new Error("OB session not found");
      
      obs[idx] = { ...obs[idx], ...updates };
      MockDB.saveOBs(obs);
      
      if (updates.is_running === false) {
        createNotification(
          "OB Broadcast Ended",
          `Outside broadcast "${obs[idx].program_name}" has finished.`,
          "ob_end"
        );
      }
      
      const user = db.auth.getUser();
      MockDB.logAudit(user?.id, "UPDATE_OB", "outside_broadcasts", id, `Updated OB ${obs[idx].program_name}`);
      return obs[idx];
    }
  },

  tasks: {
    async list(): Promise<Task[]> {
      const localAtStart = MockDB.getTasks();
      console.info("[tasks.list] start", {
        localCount: localAtStart.length,
        localIds: localAtStart.map(t => t.id),
        firestoreConfigured: isFirestoreConfigured,
        firestoreDegraded,
        offline: isOffline(),
      });
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("tasks"), "tasks list");
          if (data) {
            // Merge cloud tasks with the local mirror. Re-read the mirror immediately
            // before saving because other concurrent list() calls can complete while the
            // Firestore request is in flight and local/offline task creation must never be
            // overwritten by an older snapshot.
            const mergeWithLocal = (cloudTasks: Task[]) => {
              const localTasks = MockDB.getTasks();
              const byId = new Map<string, Task>();
              for (const task of cloudTasks) byId.set(task.id, task);
              for (const task of localTasks) {
                if (!byId.has(task.id)) byId.set(task.id, task);
              }
              return Array.from(byId.values()).sort(
                (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
            };

            let merged = mergeWithLocal(data as Task[]);
            console.info("[tasks.list] cloud merge", {
              cloudCount: data.length,
              localCount: MockDB.getTasks().length,
              mergedCount: merged.length,
              cloudIds: data.map((t: any) => t.id),
              mergedIds: merged.map(t => t.id),
            });
            // Yield once and merge again so a local task written by another in-flight
            // operation in this turn is included before we update the mirror.
            await Promise.resolve();
            merged = mergeWithLocal(merged);
            MockDB.saveTasks(merged);
            return merged;
          }
          return MockDB.getTasks();
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore tasks list failed, falling back:", (e as any)?.message);
        }
      }
      const fallbackTasks = MockDB.getTasks();
      console.info("[tasks.list] local fallback", {
        count: fallbackTasks.length,
        ids: fallbackTasks.map(t => t.id),
      });
      return fallbackTasks;
    },
    async create(task: Omit<Task, "id" | "created_at" | "updated_at">): Promise<Task> {
      // Build and persist the local record first. Tasks are user-authored data and
      // must survive navigation even when Firestore is slow, offline, or degraded.
      const newTask: Task = {
        ...task,
        id: `task-${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      const tasks = MockDB.getTasks();
      if (!tasks.some(t => t.id === newTask.id)) tasks.unshift(newTask);
      MockDB.saveTasks(tasks);

      if (isFirestoreConfigured && !isOffline()) {
        try {
          await withTimeout(fsSet("tasks", newTask.id, newTask), "tasks create", FIRESTORE_WRITE_TIMEOUT_MS);
          resetFirestoreDegraded();
          return newTask;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore tasks create failed, queueing for sync:", (e as any)?.message);
          queuePendingWrite("tasks", newTask.id, newTask);
        }
      } else if (isFirestoreConfigured) {
        queuePendingWrite("tasks", newTask.id, newTask);
      }
      
      if (task.assigned_to_id) {
        createNotification(
          "Task Assigned",
          `You have been assigned task: "${task.task_name}"`,
          "task_assign",
          task.assigned_to_id
        );
      }
      
      const user = db.auth.getUser();
      MockDB.logAudit(user?.id, "CREATE_TASK", "tasks", newTask.id, `Created task: ${task.task_name}`);
      return newTask;
    },
    async update(id: string, updates: Partial<Task>): Promise<Task> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const payload = { ...updates, updated_at: new Date().toISOString() };
          await withTimeout(fsSet("tasks", id, payload, true), "tasks update");
          const mockTasks = MockDB.getTasks();
          const idx = mockTasks.findIndex(t => t.id === id);
          if (idx !== -1) {
            mockTasks[idx] = { ...mockTasks[idx], ...payload };
            MockDB.saveTasks(mockTasks);
            return mockTasks[idx];
          }
          return { ...payload, id } as Task;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore tasks update failed, falling back:", (e as any)?.message);
        }
      }
      const tasks = MockDB.getTasks();
      const idx = tasks.findIndex(t => t.id === id);
      if (idx === -1) throw new Error("Task not found");
      
      tasks[idx] = {
        ...tasks[idx],
        ...updates,
        updated_at: new Date().toISOString()
      };
      MockDB.saveTasks(tasks);
      
      const user = db.auth.getUser();
      MockDB.logAudit(user?.id, "UPDATE_TASK", "tasks", id, `Updated task: ${tasks[idx].task_name} status to ${tasks[idx].status}`);
      return tasks[idx];
    }
  },

  handovers: {
    async create(handover: Omit<Handover, "id" | "created_at" | "handover_time">): Promise<Handover> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const newHandover: Handover = {
            ...handover,
            id: `handover-${Date.now()}`,
            handover_time: new Date().toISOString(),
            created_at: new Date().toISOString()
          };
          await withTimeout(fsSet("handovers", newHandover.id, newHandover), "handovers create");
          const mockHandovers = MockDB.getHandovers();
          if (!mockHandovers.some(h => h.id === newHandover.id)) mockHandovers.push(newHandover);
          MockDB.saveHandovers(mockHandovers);
          await db.shifts.end(handover.shift_id, handover.summary);
          return newHandover;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore handovers create failed, falling back to MockDB:", (e as any)?.message);
        }
      }
      const handovers = MockDB.getHandovers();
      const newHandover: Handover = {
        ...handover,
        id: `handover-${Date.now()}`,
        handover_time: new Date().toISOString(),
        created_at: new Date().toISOString()
      };
      handovers.push(newHandover);
      MockDB.saveHandovers(handovers);
      
      // Update shift to complete
      await db.shifts.end(handover.shift_id, handover.summary);
      
      createNotification(
        "Shift Handover Signed",
        `Handover signed between ${MockDB.getUsers().find(u => u.id === handover.outgoing_staff_id)?.name} and ${MockDB.getUsers().find(u => u.id === handover.incoming_staff_id)?.name}`,
        "handover"
      );
      
      return newHandover;
    },
    async list(): Promise<Handover[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("handovers"), "handovers list");
          if (data) {
            return data
              .sort((a, b) => new Date(b.handover_time).getTime() - new Date(a.handover_time).getTime()) as Handover[];
          }
          return [];
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore handovers list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getHandovers();
    }
  },

  notifications: {
    async list(): Promise<Notification[]> {
      const user = db.auth.getUser();
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("notifications"), "notifications list");
          if (data) {
            // Sync the local mirror so fallback reads match the cloud
            const mockN = MockDB.getNotifications();
            const cloudIds = new Set(data.map(n => n.id));
            const merged = [...(data as Notification[]), ...mockN.filter(n => !cloudIds.has(n.id))]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            MockDB.saveNotifications(merged);
            return merged.filter(n => !n.user_id || n.user_id === user?.id);
          }
          return MockDB.getNotifications().filter(n => !n.user_id || n.user_id === user?.id);
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore notifications list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getNotifications().filter(n => !n.user_id || n.user_id === user?.id);
    },
    async markAsRead(id: string): Promise<void> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("notifications", id, { is_read: true }, true), "notifications markAsRead");
          return;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore notifications markAsRead failed, falling back:", (e as any)?.message);
        }
      }
      const notifications = MockDB.getNotifications();
      const idx = notifications.findIndex(n => n.id === id);
      if (idx !== -1) {
        notifications[idx].is_read = true;
        MockDB.saveNotifications(notifications);
      }
    }
  },

  reports: {
    async list(): Promise<Report[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("reports"), "reports list");
          if (data) {
            return data
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as Report[];
          }
          return [];
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore reports list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getReports();
    },
    async create(report: Omit<Report, "id" | "created_at">): Promise<Report> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const newReport: Report = {
            ...report,
            id: `rep-${Date.now()}`,
            created_at: new Date().toISOString()
          };
          await withTimeout(fsSet("reports", newReport.id, newReport), "reports create");
          const mockReports = MockDB.getReports();
          if (!mockReports.some(r => r.id === newReport.id)) mockReports.unshift(newReport);
          MockDB.saveReports(mockReports);
          return newReport;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore reports create failed, falling back:", (e as any)?.message);
        }
      }
      const reports = MockDB.getReports();
      const newReport: Report = {
        ...report,
        id: `rep-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      reports.unshift(newReport);
      MockDB.saveReports(reports);
      return newReport;
    }
  },

  jobs: {
    async list(): Promise<JobRecord[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("jobs"), "jobs list");
          if (data) {
            return data
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as JobRecord[];
          }
          return [];
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore jobs list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getJobs();
    },
    async create(job: Omit<JobRecord, "id" | "created_at">): Promise<JobRecord> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const newJob: JobRecord = {
            ...job,
            id: `job-${Date.now()}`,
            created_at: new Date().toISOString()
          };
          await withTimeout(fsSet("jobs", newJob.id, newJob), "jobs create");
          const mockJobs = MockDB.getJobs();
          if (!mockJobs.some(j => j.id === newJob.id)) mockJobs.unshift(newJob);
          MockDB.saveJobs(mockJobs);
          return newJob;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore jobs create failed, falling back:", (e as any)?.message);
        }
      }
      const jobs = MockDB.getJobs();
      const newJob: JobRecord = {
        ...job,
        id: `job-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      jobs.unshift(newJob);
      MockDB.saveJobs(jobs);
      return newJob;
    },
    async update(id: string, updates: Partial<JobRecord>): Promise<JobRecord> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("jobs", id, updates, true), "jobs update");
          const mockJobs = MockDB.getJobs();
          const idx = mockJobs.findIndex(j => j.id === id);
          if (idx !== -1) {
            mockJobs[idx] = { ...mockJobs[idx], ...updates };
            MockDB.saveJobs(mockJobs);
            return mockJobs[idx];
          }
          return { ...updates, id } as JobRecord;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore jobs update failed, falling back:", (e as any)?.message);
        }
      }
      const jobs = MockDB.getJobs();
      const idx = jobs.findIndex(j => j.id === id);
      if (idx === -1) throw new Error("Job record not found");
      jobs[idx] = { ...jobs[idx], ...updates };
      MockDB.saveJobs(jobs);
      return jobs[idx];
    }
  },

  auditLogs: {
    async list(): Promise<AuditLog[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("audit_logs"), "audit_logs list");
          if (data) {
            return data
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as AuditLog[];
          }
          return [];
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore auditLogs list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getAuditLogs();
    }
  },

  equipment: {
    async list(): Promise<Equipment[]> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("equipment"), "equipment list");
          if (data) {
            return data
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as Equipment[];
          }
          return [];
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore equipment list failed, falling back:", (e as any)?.message);
        }
      }
      return MockDB.getEquipment();
    },
    async create(equipment: Omit<Equipment, "id" | "created_at">): Promise<Equipment> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const newEq: Equipment = {
            ...equipment,
            id: `eq-${Date.now()}`,
            created_at: new Date().toISOString()
          };
          await withTimeout(fsSet("equipment", newEq.id, newEq), "equipment create");
          const eq = MockDB.getEquipment();
          if (!eq.some(e => e.id === newEq.id)) eq.unshift(newEq);
          MockDB.saveEquipment(eq);
          return newEq;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore equipment create failed, falling back:", (e as any)?.message);
        }
      }
      const eq = MockDB.getEquipment();
      const newEq: Equipment = {
        ...equipment,
        id: `eq-${Date.now()}`,
        created_at: new Date().toISOString()
      };
      eq.unshift(newEq);
      MockDB.saveEquipment(eq);
      return newEq;
    },
    async update(id: string, updates: Partial<Equipment>): Promise<Equipment> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("equipment", id, updates, true), "equipment update");
          const eq = MockDB.getEquipment();
          const idx = eq.findIndex(e => e.id === id);
          if (idx !== -1) {
            eq[idx] = { ...eq[idx], ...updates };
            MockDB.saveEquipment(eq);
            return eq[idx];
          }
          return { ...updates, id } as Equipment;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore equipment update failed, falling back:", (e as any)?.message);
        }
      }
      const eq = MockDB.getEquipment();
      const idx = eq.findIndex(e => e.id === id);
      if (idx === -1) throw new Error("Equipment not found");
      eq[idx] = { ...eq[idx], ...updates };
      MockDB.saveEquipment(eq);
      return eq[idx];
    }
  },

  sessions: {
    // Append-only sign-in audit: every technician login records whether they
    // confirmed they are starting their shift ("shift") or just browsing
    // ("browsing") — supervisors use this to see who logged in for duty vs
    // who was only checking on things.
    async log(userId: string, mode: "shift" | "browsing"): Promise<void> {
      const session = {
        id: `session-${Date.now()}-${userId}`,
        user_id: userId,
        mode,
        created_at: new Date().toISOString()
      };
      const pushLocal = () => {
        const local: any[] = JSON.parse(localStorage.getItem("shift_sessions") || "[]");
        local.unshift(session);
        localStorage.setItem("shift_sessions", JSON.stringify(local.slice(0, 50)));
      };
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("sessions", session.id, session), "sessions log");
          pushLocal();
          return;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore sessions log failed, falling back:", (e as any)?.message);
        }
      }
      pushLocal();
    },
    async list(): Promise<{ id: string; user_id: string; mode: "shift" | "browsing"; created_at: string }[]> {
      let local: any[] = [];
      try { local = JSON.parse(localStorage.getItem("shift_sessions") || "[]"); } catch {}
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("sessions"), "sessions list");
          if (data) {
            const cloudIds = new Set(data.map(s => s.id));
            const merged = [...(data as any[]), ...local.filter(s => !cloudIds.has(s.id))]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            return merged.slice(0, 50);
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore sessions list failed, falling back:", (e as any)?.message);
        }
      }
      return local.slice(0, 50);
    }
  },

  storage: {
    async uploadPhoto(file: File): Promise<string> {
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await ensureAnonymousAuth();
          const ext = file.name.split(".").pop() || "jpg";
          const path = `equipment-photos/${Date.now()}.${ext}`;
          const uploadResult = await withTimeout(uploadBytes(ref(getFBStorage(), path), file), "storage upload");
          const url = await withTimeout(getDownloadURL(uploadResult.ref), "storage url");
          return url;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firebase Storage uploadPhoto failed, falling back:", (e as any)?.message);
        }
      }
      // Mock: convert to data URL
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
    }
  },

  dutyAcks: {
    // Accepted "I accept these duties" — stored per user in the cloud so an
    // acknowledgment made on one device holds on every other device too.
    // Local mirror only serves as an offline fallback.
    async getAcknowledged(userId: string): Promise<string[]> {
      const local = (() => { try { return JSON.parse(localStorage.getItem(`shift_duties_ack_${userId}`) || "[]") as string[]; } catch { return []; } })();
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const doc = await withTimeout(fsGet("duty_acknowledgements", `duty-ack-${userId}`), "dutyAcks get");
          const ids = doc?.acknowledged_ids as string[] | undefined;
          if (ids) {
            try { localStorage.setItem(`shift_duties_ack_${userId}`, JSON.stringify(ids)); } catch {}
            return ids;
          }
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore dutyAcks get failed, falling back:", (e as any)?.message);
        }
      }
      return local;
    },
    async acknowledge(userId: string, ids: string[]): Promise<void> {
      const merged = [...new Set(ids)];
      try { localStorage.setItem(`shift_duties_ack_${userId}`, JSON.stringify(merged)); } catch {}
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("duty_acknowledgements", `duty-ack-${userId}`, {
            user_id: userId,
            acknowledged_ids: merged,
            updated_at: new Date().toISOString(),
          }, true), "dutyAcks acknowledge");
          return;
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore dutyAcks acknowledge failed, keeping local:", (e as any)?.message);
        }
      }
    }
  },

  announcements: {
    // Station-wide notices posted by admins, shown as a banner on every
    // dashboard. Cloud-synced so one post reaches every device.
    async list(): Promise<Announcement[]> {
      const local = MockDB.getAnnouncements();
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          const data = await withTimeout(fsGetAll("announcements"), "announcements list");
          if (data && data.length > 0) {
            const sorted = [...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            try { localStorage.setItem("shift_announcements", JSON.stringify(sorted)); } catch {}
            return sorted as Announcement[];
          }
          if (local.length > 0) {
            await Promise.all(local.map(a => fsSet("announcements", a.id, a, true)));
            return local;
          }
          return [];
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore announcements list failed, falling back:", (e as any)?.message);
        }
      }
      return local;
    },
    async create(text: string, authorId?: string, authorName?: string): Promise<Announcement> {
      const announcement: Announcement = {
        id: `ann-${Date.now()}`,
        text: text.trim(),
        author_id: authorId,
        author_name: authorName,
        created_at: new Date().toISOString()
      };
      const local = MockDB.getAnnouncements();
      MockDB.saveAnnouncements([announcement, ...local]);
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsSet("announcements", announcement.id, announcement), "announcements create");
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore announcements create failed, keeping local:", (e as any)?.message);
        }
      }
      MockDB.logAudit(authorId, "CREATE_ANNOUNCEMENT", "announcements", announcement.id, `Posted announcement: ${announcement.text.slice(0, 60)}`);
      return announcement;
    },
    async remove(id: string, actorId?: string): Promise<void> {
      const local = MockDB.getAnnouncements();
      MockDB.saveAnnouncements(local.filter(a => a.id !== id));
      if (isFirestoreConfigured && !firestoreDegraded) {
        try {
          await withTimeout(fsDelete("announcements", id), "announcements delete");
        } catch (e) {
          setFirestoreDegraded();
          console.warn("Firestore announcements delete failed, keeping local:", (e as any)?.message);
        }
      }
      MockDB.logAudit(actorId, "DELETE_ANNOUNCEMENT", "announcements", id, "Removed announcement");
    }
  }
};
