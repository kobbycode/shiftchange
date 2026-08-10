import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

function loadFirebaseTokens() {
  const candidates = [
    join(process.env.APPDATA || "", "firebase", "tokens.json"),
    join(process.env.USERPROFILE || "", ".config", "configstore", "firebase-tools.json"),
    join(process.env.HOME || "", ".config", "configstore", "firebase-tools.json"),
  ];
  for (const p of candidates) {
    try {
      const cfg = JSON.parse(readFileSync(p, "utf8"));
      const t = cfg.tokens;
      const azp = cfg.user?.azp;
      if (t?.access_token && t?.expires_at) {
        return {
          accessToken: t.access_token,
          expiresAt: t.expires_at,
          refreshToken: t.refresh_token,
          clientId: azp,
        };
      }
    } catch {}
  }
  throw new Error("No firebase CLI token found. Run `firebase login` first.");
}

async function mintAccessToken(refreshToken, clientId) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) throw new Error(`Token mint failed: ${resp.status} ${await resp.text()}`);
  const data = await resp.json();
  return data.access_token;
}

async function fetchAllRows(supabaseUrl, serviceKey, table) {
  const rows = [];
  let rangeStart = 0;
  const step = 1000;
  for (;;) {
    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        Range: `${rangeStart}-${rangeStart + step - 1}`,
      },
    });
    if (!resp.ok) {
      throw new Error(`GET ${table} failed: ${resp.status} ${await resp.text()}`);
    }
    const batch = await resp.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    rows.push(...batch);
    if (batch.length < step) break;
    rangeStart += step;
  }
  return rows;
}

// Firestore REST field encoding for JSON values
function encodeValue(v) {
  if (v === undefined) return null;
  if (v === null) return { nullValue: null };
  const t = typeof v;
  if (t === "string") return { stringValue: v };
  if (t === "boolean") return { booleanValue: v };
  if (t === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue).filter(Boolean) } };
  if (t === "object") return { mapValue: { fields: encodeFields(v) } };
  return { stringValue: String(v) };
}

function encodeFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const enc = encodeValue(v);
    if (enc) fields[k] = enc;
  }
  return fields;
}

const PROJECT = "sonicstream-radio-2026";
const DB_PATH = "projects/sonicstream-radio-2026/databases/(default)/documents";

// tables to migrate (Supabase REST table name → Firestore collection)
const TABLES = [
  "users", "stations", "shifts", "attendance", "faults", "fault_updates",
  "outside_broadcasts", "tasks", "handovers", "notifications", "reports",
  "audit_logs", "jobs", "equipment", "attachments",
];

async function commitBatch(token, writes) {
  const resp = await fetch(
    `https://firestore.googleapis.com/v1/${DB_PATH}:commit?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ writes }),
    }
  );
  if (!resp.ok) {
    throw new Error(`commit failed: ${resp.status} ${await resp.text()}`);
  }
  await resp.json();
}

const MAX_DOC_SIZE = 900 * 1024; // Firestore hard limit is 1 MiB — stay under

async function migrate() {
  const env = loadEnvLocal();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error(".env.local missing SUPABASE_URL/SERVICE_ROLE_KEY");
  if (!env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== PROJECT) {
    throw new Error("Firebase project mismatch in .env.local");
  }

  const tokens = loadFirebaseTokens();
  let token = Date.now() < tokens.expiresAt ? tokens.accessToken : null;
  if (!token) {
    token = await mintAccessToken(tokens.refreshToken, tokens.clientId);
    console.log("Access token refreshed.");
  } else {
    console.log("Using stored access token.");
  }

  const summary = {};
  for (const table of TABLES) {
    let rows;
    try {
      rows = await fetchAllRows(supabaseUrl, serviceKey, table);
    } catch (e) {
      console.warn(`[${table}] SKIPPED: ${e.message}`);
      summary[table] = "skipped";
      continue;
    }
    console.log(`[${table}] ${rows.length} rows fetched`);

    let written = 0;
    let skipped = 0;
    const batch = [];
    for (const row of rows) {
      const id = String(row.id ?? `doc-${table}-${written}`);
      const fields = encodeFields(row);
      const size = JSON.stringify(fields).length;
      if (size > MAX_DOC_SIZE) {
        skipped++;
        console.warn(`[${table}] doc ${id} too large (${size} bytes) — skipped`);
        continue;
      }
      batch.push({ update: { name: `${DB_PATH}/${table}/${id}`, fields } });
      if (batch.length >= 400) {
        await commitBatch(token, batch);
        written += batch.length;
        batch.length = 0;
        console.log(`[${table}] committed ${written} / ${rows.length}`);
      }
    }
    if (batch.length > 0) {
      await commitBatch(token, batch);
      written += batch.length;
    }
    summary[table] = `${written} written${skipped ? `, ${skipped} skipped (too large)` : ""}`;
    console.log(`[${table}] done: ${summary[table]}`);
  }

  console.log("\n=== MIGRATION SUMMARY ===");
  for (const [t, s] of Object.entries(summary)) console.log(`${t}: ${s}`);
}

migrate().catch((e) => {
  console.error("MIGRATION FAILED:", e);
  process.exit(1);
});
