/**
 * ig-queue: shared state for the scheduled Instagram poster, kept in GCS so it
 * survives across the ephemeral daily sessions (the repo is re-cloned each run,
 * jobs/ does NOT persist — but a GCS object does).
 *
 * Two objects live under the `_ig/` prefix of the GCS bucket (private):
 *   _ig/token.json  { access_token, expires_at, refreshed_at }
 *       the long-lived Instagram (Instagram-Login) access token. The one-time
 *       short→long exchange needs the Instagram APP SECRET; after that the token
 *       auto-refreshes here on each run WITHOUT the secret (ig_refresh_token),
 *       so it never expires as long as the poster keeps running.
 *   _ig/queue.json  { items: [{ id, objectName, caption, lang, posted, ... }] }
 *       a rolling FIFO of RU reels waiting to be posted. The morning content
 *       routine appends to it (via ig-enqueue.ts); the scheduled posters pop the
 *       next unposted item (ig-post-next.ts).
 *
 * Instagram-Login tokens only work against graph.instagram.com — the poster sets
 * GRAPH_API_HOST=graph.instagram.com before publishing.
 */
import "dotenv/config";
import { fetch } from "./proxy.ts";
import { getGoogleAccessToken } from "./gcp-auth.ts";

const GCS_HOST = "storage.googleapis.com";
const IG_HOST = "graph.instagram.com";
const API_VERSION = process.env.GRAPH_API_VERSION ?? "v23.0";

export const TOKEN_OBJECT = "_ig/token.json";
export const QUEUE_OBJECT = "_ig/queue.json";

export interface TokenRec {
  access_token: string;
  expires_at: number; // unix seconds
  refreshed_at: number; // unix seconds
}
export interface QueueItem {
  id: string;
  objectName: string; // object in the bucket (the reel mp4)
  caption: string;
  lang: string;
  enqueued_at: number;
  posted: boolean;
  media_id?: string;
  permalink?: string;
  posted_at?: number;
  error?: string;
}
export interface Queue {
  items: QueueItem[];
}

function bucket(): string {
  const b = process.env.IG_QUEUE_BUCKET ?? process.env.GCS_BUCKET;
  if (!b) throw new Error("GCS_BUCKET (or IG_QUEUE_BUCKET) is not set");
  return b;
}
async function saToken(): Promise<string> {
  const sa = process.env.GCP_SERVICE_ACCOUNT;
  if (!sa) throw new Error("GCP_SERVICE_ACCOUNT is not set");
  return getGoogleAccessToken(sa);
}
const now = () => Math.floor(Date.now() / 1000);

// ---- GCS JSON get/put (private bucket, SA-authenticated) ----

/** Read a JSON object from gs://bucket/name, or null if it does not exist. */
export async function gcsGetJson<T = any>(name: string): Promise<T | null> {
  const tok = await saToken();
  const url = `https://${GCS_HOST}/storage/v1/b/${encodeURIComponent(bucket())}/o/${encodeURIComponent(name)}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GCS get ${name} failed (HTTP ${res.status}): ${await res.text()}`);
  return (await res.json()) as T;
}

/** Write a JSON object to gs://bucket/name (overwrites). */
export async function gcsPutJson(name: string, obj: unknown): Promise<void> {
  const tok = await saToken();
  const url =
    `https://${GCS_HOST}/upload/storage/v1/b/${encodeURIComponent(bucket())}/o` +
    `?uploadType=media&name=${encodeURIComponent(name)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
    body: JSON.stringify(obj),
  });
  if (!res.ok) throw new Error(`GCS put ${name} failed (HTTP ${res.status}): ${await res.text()}`);
}

// ---- Instagram token store ----

/** GET a graph.instagram.com endpoint with query params. */
async function igGet(pathSeg: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params);
  const res = await fetch(`https://${IG_HOST}/${pathSeg}?${qs}`);
  const data: any = await res.json();
  if (!res.ok || data.error) {
    const e = data.error;
    throw new Error(e ? `${e.message} [code ${e.code}]` : `HTTP ${res.status}`);
  }
  return data;
}

/** Resolve the numeric IG user id that a token belongs to (for /{id}/media). */
export async function resolveIgUserId(token: string): Promise<string> {
  const me = await igGet(`${API_VERSION}/me`, { fields: "user_id,username", access_token: token });
  return me.user_id as string;
}

/**
 * One-time bootstrap: exchange a short-lived Instagram-Login token for a
 * long-lived (~60d) one using the Instagram APP SECRET, and store it in GCS.
 */
export async function bootstrapExchange(shortToken: string, appSecret: string): Promise<TokenRec> {
  const j = await igGet("access_token", {
    grant_type: "ig_exchange_token",
    client_secret: appSecret,
    access_token: shortToken,
  });
  const rec: TokenRec = {
    access_token: j.access_token,
    expires_at: now() + (j.expires_in ?? 60 * 24 * 3600),
    refreshed_at: now(),
  };
  await gcsPutJson(TOKEN_OBJECT, rec);
  return rec;
}

/** Store an already-long-lived token directly (no exchange). */
export async function bootstrapLong(longToken: string, expiresInDays = 55): Promise<TokenRec> {
  const rec: TokenRec = {
    access_token: longToken,
    expires_at: now() + expiresInDays * 24 * 3600,
    refreshed_at: now(),
  };
  await gcsPutJson(TOKEN_OBJECT, rec);
  return rec;
}

/**
 * Return a currently-valid access token + the IG user id, refreshing the stored
 * long-lived token when it's >24h old and within 10 days of expiry (a refresh
 * extends it another 60d and needs no app secret). Throws if no token is stored
 * or the stored one has already expired.
 */
export async function ensureToken(): Promise<{ token: string; userId: string }> {
  const rec = await gcsGetJson<TokenRec>(TOKEN_OBJECT);
  if (!rec?.access_token) {
    throw new Error(
      `No Instagram token stored at ${TOKEN_OBJECT}. Bootstrap once with the app secret:\n` +
        `  npx tsx src/ig-queue.ts --bootstrap-exchange <shortToken> <appSecret>`
    );
  }
  const t = now();
  if (rec.expires_at && rec.expires_at <= t) {
    throw new Error(`Stored Instagram token expired ${Math.round((t - rec.expires_at) / 86400)}d ago — re-bootstrap.`);
  }
  let { access_token, expires_at, refreshed_at } = rec;
  const ageOk = !refreshed_at || t - refreshed_at > 24 * 3600;
  const nearExpiry = !expires_at || expires_at - t < 10 * 24 * 3600;
  if (ageOk && nearExpiry) {
    try {
      const j = await igGet("refresh_access_token", { grant_type: "ig_refresh_token", access_token });
      if (j.access_token) {
        access_token = j.access_token;
        expires_at = t + (j.expires_in ?? 60 * 24 * 3600);
        refreshed_at = t;
        await gcsPutJson(TOKEN_OBJECT, { access_token, expires_at, refreshed_at });
        console.log(`[ig] token refreshed — valid ~${Math.round((expires_at - t) / 86400)}d`);
      }
    } catch (e: any) {
      console.warn(`[ig] token refresh skipped (${e.message}) — using existing token`);
    }
  }
  const userId = await resolveIgUserId(access_token);
  return { token: access_token, userId };
}

// ---- Post queue ----

export async function loadQueue(): Promise<Queue> {
  return (await gcsGetJson<Queue>(QUEUE_OBJECT)) ?? { items: [] };
}
export async function saveQueue(q: Queue): Promise<void> {
  await gcsPutJson(QUEUE_OBJECT, q);
}

/** Append a reel to the queue. Deduped by objectName among not-yet-posted items. */
export async function enqueueObject(objectName: string, caption: string, lang = "ru"): Promise<QueueItem> {
  const q = await loadQueue();
  const dup = q.items.find((i) => i.objectName === objectName && !i.posted);
  if (dup) return dup;
  const item: QueueItem = {
    id: `${now()}-${objectName.replace(/[^a-zA-Z0-9]+/g, "_")}`,
    objectName,
    caption,
    lang,
    enqueued_at: now(),
    posted: false,
  };
  q.items.push(item);
  await saveQueue(q);
  return item;
}

export function nextPending(q: Queue): QueueItem | undefined {
  return q.items.find((i) => !i.posted);
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fail = (e: Error) => {
    console.error("[ig-queue] FAILED:", e.message);
    process.exit(1);
  };
  (async () => {
    if (args[0] === "--bootstrap-exchange") {
      const [, shortToken, appSecret] = args;
      if (!shortToken || !appSecret) throw new Error("Usage: --bootstrap-exchange <shortToken> <appSecret>");
      const rec = await bootstrapExchange(shortToken, appSecret);
      console.log(`[ig-queue] long-lived token stored — valid ~${Math.round((rec.expires_at - now()) / 86400)}d`);
    } else if (args[0] === "--bootstrap-long") {
      const [, longToken, days] = args;
      if (!longToken) throw new Error("Usage: --bootstrap-long <longToken> [expiresInDays]");
      const rec = await bootstrapLong(longToken, days ? Number(days) : undefined);
      console.log(`[ig-queue] token stored — assuming ~${Math.round((rec.expires_at - now()) / 86400)}d`);
    } else if (args[0] === "--status") {
      const rec = await gcsGetJson<TokenRec>(TOKEN_OBJECT);
      const q = await loadQueue();
      const pending = q.items.filter((i) => !i.posted);
      if (rec) {
        console.log(`token: valid ~${Math.round((rec.expires_at - now()) / 86400)}d (refreshed ${Math.round((now() - rec.refreshed_at) / 3600)}h ago)`);
      } else {
        console.log("token: NOT bootstrapped");
      }
      console.log(`queue: ${pending.length} pending / ${q.items.length} total`);
      for (const i of pending) console.log(`  • ${i.objectName}  "${i.caption.slice(0, 40).replace(/\n/g, " ")}…"`);
    } else if (args[0] === "--enqueue") {
      const [, objectName, caption] = args;
      if (!objectName) throw new Error('Usage: --enqueue <objectName> "caption"');
      const it = await enqueueObject(objectName, caption ?? "");
      console.log(`[ig-queue] enqueued ${it.objectName}`);
    } else {
      console.log("ig-queue — scheduled Instagram poster state (token + queue in GCS)");
      console.log("  --bootstrap-exchange <shortToken> <appSecret>   one-time: mint the 60d token");
      console.log("  --bootstrap-long <longToken> [days]             store an already-long token");
      console.log("  --status                                        show token expiry + queue");
      console.log('  --enqueue <objectName> "caption"                add a bucket object to the queue');
      process.exit(1);
    }
  })().catch(fail);
}
