const { onRequest, onCall } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const crypto = require("crypto");

initializeApp();

const db = getFirestore();

// Seed default PINs (public by design — they ship in the client bundle as the
// factory defaults). Users whose PIN was never personalized have no
// `user_credentials` doc and verify against this map; personalized PINs live
// only in `user_credentials`, which client rules deny.
const SEED_PINS = {
  "11111111-1111-1111-1111-111111111111": "1111",
  "22222222-2222-2222-2222-222222222201": "2201",
  "22222222-2222-2222-2222-222222222202": "2202",
  "33333333-3333-3333-3333-333333333301": "3301",
  "33333333-3333-3333-3333-333333333302": "3302",
  "33333333-3333-3333-3333-333333333303": "3303",
  "33333333-3333-3333-3333-333333333304": "3304",
  "33333333-3333-3333-3333-333333333305": "3305",
  "33333333-3333-3333-3333-333333333306": "3306"
};

const MAX_FAILS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCK_MS = 10 * 60 * 1000;

// In-memory per-IP throttle (resets on cold start — a second layer on top of
// the per-user bucket).
const ipHits = new Map();
const IP_CAP = 20;
const IP_WINDOW_MS = 60 * 1000;

function constantTimeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function ipOf(req) {
  return String(req.headers["x-forwarded-for"] || req.ip || "unknown").split(",")[0].trim();
}

function throttledByIp(ip) {
  const now = Date.now();
  const hits = (ipHits.get(ip) || []).filter(t => now - t < IP_WINDOW_MS);
  if (hits.length >= IP_CAP) {
    ipHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  ipHits.set(ip, hits);
  return false;
}

function audit(userId, action, targetTable, targetId, details) {
  return db.collection("audit_logs").add({
    user_id: userId || null,
    action,
    target_table: targetTable,
    target_id: targetId || null,
    details: details || "",
    created_at: new Date().toISOString()
  }).catch((err) => console.error("Audit write failed:", err.message));
}

// Resolve a Firebase Auth UID to an app user record via auth_uids mapping.
async function userForUid(uid) {
  if (!uid) return null;
  const mapping = await db.collection("auth_uids").doc(uid).get();
  if (!mapping.exists) return null;
  const userDoc = await db.collection("users").doc(mapping.data().user_id).get();
  return userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;
}

async function readStoredPin(userId) {
  const cred = await db.collection("user_credentials").doc(userId).get();
  if (cred.exists && cred.data().pin) return { pin: cred.data().pin, personalized: true };
  return { pin: SEED_PINS[userId] || null, personalized: false };
}

async function recordFailure(userId) {
  const ref = db.collection("pin_attempts").doc(userId || "unknown");
  const now = Date.now();
  const snap = await ref.get();
  const data = snap.exists ? snap.data() : null;
  let count = 0;
  let windowStart = now;
  if (data && now - (data.windowStart || 0) < WINDOW_MS && !(data.lockedUntil && now < data.lockedUntil)) {
    count = data.count || 0;
    windowStart = data.windowStart || now;
  }
  count += 1;
  let lockedUntil = null;
  if (count >= MAX_FAILS) {
    lockedUntil = now + LOCK_MS;
    count = 0;
  }
  await ref.set({ count, windowStart, lockedUntil, updated_at: new Date().toISOString() }, { merge: true });
  return lockedUntil;
}

// ────────────────────────────────────────────────────────────────
// verifyPin — server-side, rate-limited PIN verification used by
// login and dashboard-switch. Returns the matched app user when OK.
// ────────────────────────────────────────────────────────────────
exports.verifyPin = onCall(
  { cors: true, maxInstances: 10 },
  async (req) => {
    if (!req.auth) {
      return { ok: false, error: "Authentication required." };
    }
    const { userId, pin } = req.data || {};
    if (typeof pin !== "string" || !pin) throw new Error("PIN is required.");
    if (pin.length < 4 || pin.length > 6) throw new Error("Invalid PIN format.");

    const ip = ipOf(req.rawRequest);
    if (throttledByIp(ip)) {
      return { ok: false, error: "Too many attempts from this network — try again later." };
    }

    // Per-user lockout check (applies to known users only)
    if (userId) {
      const bucket = await db.collection("pin_attempts").doc(userId).get();
      const lockedUntil = bucket.exists ? bucket.data().lockedUntil : null;
      if (lockedUntil && Date.now() < lockedUntil) {
        const mins = Math.ceil((lockedUntil - Date.now()) / 60000);
        return { ok: false, locked: true, error: `Too many failed attempts — locked for ${mins} more minute(s).` };
      }
    }

    // Find the candidate user: known userId first, else scan for the pin.
    let candidateUserId = userId;
    if (candidateUserId) {
      const userDoc = await db.collection("users").doc(candidateUserId).get();
      if (!userDoc.exists) {
        // Unknown ID — record the attempt so bogus IDs can't bypass the lockout.
        await recordFailure(candidateUserId);
        return { ok: false, error: "Invalid PIN." };
      }
    } else {
      const snap = await db.collection("user_credentials").limit(500).get();
      let found = null;
      for (const docSnap of snap.docs) {
        if (constantTimeEqual(docSnap.data().pin, pin)) { found = docSnap.id; break; }
      }
      if (!found) {
        for (const [seedId, seedPin] of Object.entries(SEED_PINS)) {
          if (constantTimeEqual(seedPin, pin)) { found = seedId; break; }
        }
      }
      if (!found) {
        await recordFailure("unknown");
        return { ok: false, error: "Invalid PIN." };
      }
      candidateUserId = found;
    }

    const stored = await readStoredPin(candidateUserId);
    if (!stored.pin || !constantTimeEqual(stored.pin, pin)) {
      await recordFailure(candidateUserId);
      return { ok: false, error: "Invalid PIN." };
    }

    // Success — clear the failure bucket and report the user.
    await db.collection("pin_attempts").doc(candidateUserId).delete().catch(() => {});
    const userDoc = await db.collection("users").doc(candidateUserId).get();
    if (!userDoc.exists) return { ok: false, error: "User not found." };
    const u = userDoc.data();
    // Promote the verified app identity into a Firebase Auth identity.
    // The caller begins as an anonymous Firebase user so it can invoke this
    // function before app login. After the PIN is verified, mint a custom
    // token whose role claim satisfies the operational Firestore rules.
    //
    // Use a deterministic UID derived from the app user id instead of the
    // temporary anonymous UID. This gives the same station user one Firebase
    // identity across browsers/devices and lets server-side mappings resolve
    // the authenticated caller reliably.
    const authUid = `shift_${candidateUserId}`;
    const auth = getAuth();
    try {
      await auth.getUser(authUid);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        await auth.createUser({
          uid: authUid,
          displayName: u.name || candidateUserId,
          ...(u.email ? { email: u.email } : {})
        });
      } else {
        throw err;
      }
    }
    await auth.setCustomUserClaims(authUid, {
      role: u.role,
      appUserId: candidateUserId
    });
    await db.collection("auth_uids").doc(authUid).set({
      user_id: candidateUserId,
      updated_at: new Date().toISOString()
    }, { merge: true });
    const customToken = await auth.createCustomToken(authUid, {
      role: u.role,
      appUserId: candidateUserId
    });

    audit(candidateUserId, "PIN_VERIFIED", "users", candidateUserId, "PIN verified server-side");
    return {
      ok: true,
      customToken,
      user: { id: userDoc.id, name: u.name, role: u.role, email: u.email || "" }
    };
  }
);

// ────────────────────────────────────────────────────────────────
// setPin — admin-or-self PIN change. Writes the authoritative pin to
// `user_credentials` and strips any pin from the client-visible user
// doc. Callers must be authenticated with an email-linked account.
// ────────────────────────────────────────────────────────────────
exports.setPin = onCall(
  { cors: true, maxInstances: 10 },
  async (req) => {
    if (!req.auth) {
      return { ok: false, error: "Authentication required." };
    }
    const { userId, pin } = req.data || {};
    if (typeof userId !== "string" || !userId) throw new Error("userId is required.");
    if (typeof pin !== "string" || pin.length < 4 || pin.length > 6) {
      throw new Error("PIN must be 4-6 characters.");
    }

    const caller = await userForUid(req.auth.uid);
    if (!caller) {
      return { ok: false, error: "Your account is not linked to a station user — ask an admin." };
    }
    const isAdmin = caller.role === "Admin";
    const isSelf = caller.id === userId;
    if (!isAdmin && !isSelf) {
      return { ok: false, error: "Only admins or the account owner can change this PIN." };
    }

    await db.collection("user_credentials").doc(userId).set({
      pin,
      is_default: false,
      updated_at: new Date().toISOString()
    }, { merge: true });

    // Never keep a pin on the client-readable user doc.
    await db.collection("users").doc(userId).update({ pin: FieldValue.delete() }).catch(() => {});

    audit(caller.id, "SET_PIN", "users", userId, `${caller.name} ${isAdmin && !isSelf ? "reset" : "changed"} a PIN`);
    return { ok: true };
  }
);

// ────────────────────────────────────────────────────────────────
// migrateCredentials — one-time migration: copy any personalized pin
// from client-readable `users` docs into `user_credentials` and strip
// the pin fields. Idempotent; safe to re-run.
// ────────────────────────────────────────────────────────────────
exports.migrateCredentials = onCall(
  { cors: true, maxInstances: 1 },
  async (req) => {
    if (!req.auth) throw new Error("Authentication required.");
    let copied = 0;
    let stripped = 0;
    const snap = await db.collection("users").get();
    const batch = db.batch();
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const hasPin = typeof data.pin === "string" && data.pin.length > 0;
      const seedPin = SEED_PINS[docSnap.id] || null;
      if (hasPin && data.pin !== seedPin) {
        batch.set(db.collection("user_credentials").doc(docSnap.id), {
          pin: data.pin,
          is_default: false,
          updated_at: new Date().toISOString()
        });
        copied++;
      }
      if (hasPin) {
        batch.update(docSnap.ref, { pin: FieldValue.delete() });
        stripped++;
      }
    }
    if (copied > 0 || stripped > 0) await batch.commit();
    return { ok: true, copied, stripped };
  }
);

// ────────────────────────────────────────────────────────────────
// cleanupAnonymousAccounts — housekeeping for the anonymous Firebase
// Auth accounts that every browser session creates. Anonymous accounts
// with an auth_uids mapping are left alone (they're linked to app
// users); everything else is an orphan from a device that signed in
// anonymously and never linked an email — safe to delete (the app
// silently creates a fresh anonymous session on next load).
// ────────────────────────────────────────────────────────────────
exports.cleanupAnonymousAccounts = onCall(
  { cors: true, maxInstances: 1 },
  async (req) => {
    if (!req.auth) return { ok: false, error: "Authentication required." };
    const caller = await userForUid(req.auth.uid);
    if (!caller) return { ok: false, error: "Your account is not linked to a station user — ask an admin." };
    if (caller.role !== "Admin") return { ok: false, error: "Only admins can run account cleanup." };

    const recentMs = Number(req.data && req.data.recentMs) || 5 * 60 * 1000;
    const now = Date.now();
    let total = 0;
    let deleted = 0;
    let skippedRecent = 0;
    let linked = 0;
    const deletedIds = [];
    let pageToken;

    do {
      const list = pageToken
        ? await getAuth().listUsers(1000, pageToken)
        : await getAuth().listUsers(1000);
      for (const u of list.users) {
        total++;
        // Anonymous accounts have no provider entries (no email/phone/password)
        const isAnonymous = !u.providerData || u.providerData.length === 0;
        if (!isAnonymous) continue;
        const lastSignIn = u.lastSignInAt
          || (u.metadata && u.metadata.lastSignInTime ? new Date(u.metadata.lastSignInTime).getTime() : null);
        if (lastSignIn && now - lastSignIn < recentMs) {
          skippedRecent++;
          continue;
        }
        const mapping = await db.collection("auth_uids").doc(u.uid).get();
        if (mapping.exists) {
          linked++;
          continue;
        }
        await getAuth().deleteUser(u.uid);
        deleted++;
        deletedIds.push(u.uid);
      }
      pageToken = list.pageToken;
    } while (pageToken);

    return { ok: true, total, deleted, skippedRecent, linked, deletedIds };
  }
);

const RESET_MARKER_ROW_ID = "00000000-0000-0000-0000-000000000000";

// Operational collections wiped on factory reset (attachments is handled
// separately so the reset marker survives the wipe).
const COLLECTIONS = [
  "shifts", "attendance", "faults", "fault_updates",
  "outside_broadcasts", "tasks", "handovers",
  "notifications", "reports", "audit_logs", "jobs", "equipment",
  "transactions", "daily_rewards", "broadcast_status",
  "announcements", "user_credentials", "pin_attempts"
];

const BATCH_SIZE = 400;

async function deleteCollection(name, keepId) {
  let total = 0;
  for (;;) {
    let query = db.collection(name).limit(500);
    if (total > 0) query = query.offset(total);
    const snap = await query.get();
    if (snap.empty) break;
    const batch = db.batch();
    let added = 0;
    snap.docs.forEach((docSnap) => {
      if (keepId && docSnap.id === keepId) return;
      batch.delete(docSnap.ref);
      added++;
    });
    total += added;
    if (added > 0) await batch.commit();
    if (snap.size < 500) break;
  }
  return total;
}

async function resetStations() {
  let total = 0;
  for (;;) {
    const snap = await db.collection("stations").limit(500).get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((docSnap) => {
      batch.set(docSnap.ref, { current_status: "OK", remarks: null, updated_at: null }, { merge: true });
    });
    await batch.commit();
    total += snap.size;
    if (snap.size < 500) break;
  }
  return total;
}

exports.factoryReset = onRequest(
  { cors: true, minInstances: 0 },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    try {
      const results = {};
      // Stamp the reset marker FIRST: every device uses it to detect the wipe.
      // If the marker were written last, a slow/flaky reset (or function
      // timeout) could wipe the DB without ever propagating the marker — and
      // then no browser would purge its stale mirrors or log out.
      const resetVersion = String(Date.now());
      try {
        await db.collection("attachments").doc(RESET_MARKER_ROW_ID).set({
          id: RESET_MARKER_ROW_ID,
          parent_type: "Task",
          parent_id: RESET_MARKER_ROW_ID,
          file_name: "reset-marker",
          file_url: resetVersion,
          file_type: "text/plain",
          created_at: new Date().toISOString()
        });
        results["marker"] = { marker: resetVersion };
      } catch (err) {
        console.error("Failed to stamp factory reset marker:", err.message);
        results["marker"] = { error: err.message };
      }

      for (const collection of COLLECTIONS) {
        try {
          const deleted = await deleteCollection(collection);
          results[collection] = { deleted };
        } catch (err) {
          console.error(`Failed to wipe ${collection}:`, err.message);
          results[collection] = { error: err.message };
        }
      }

      // Attachments: wipe everything except the reset marker
      try {
        const deleted = await deleteCollection("attachments", RESET_MARKER_ROW_ID);
        results["attachments"] = { deleted };
      } catch (err) {
        console.error("Failed to wipe attachments:", err.message);
        results["attachments"] = { error: err.message };
      }

      // Reset station statuses back to OK
      try {
        const reset = await resetStations();
        results["stations"] = { reset };
      } catch (err) {
        console.error("Failed to reset stations:", err.message);
        results["stations"] = { error: err.message };
      }

      const hasErrors = Object.values(results).some(r => r.error);
      if (hasErrors) {
        res.status(500).json({ success: false, message: "Factory reset completed with errors", results });
      } else {
        res.json({ success: true, message: "Factory reset complete. All data cleared.", reset_version: resetVersion, results });
      }
    } catch (err) {
      console.error("Factory reset error:", err);
      res.status(500).json({ error: err.message });
    }
  }
);
