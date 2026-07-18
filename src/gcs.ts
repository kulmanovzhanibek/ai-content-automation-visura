/**
 * gcs: upload a local file to a Google Cloud Storage bucket and return a URL
 * that Instagram can fetch.
 *
 * WHY: the Instagram Graph API cannot accept a local file upload — it publishes
 * media by fetching a `video_url` / `image_url` itself. So every asset we want to
 * post has to live at a fetchable URL first. We reuse the GCP service account
 * already configured for Vertex image generation (GCP_SERVICE_ACCOUNT) and upload
 * to GCS_BUCKET.
 *
 * TWO URL MODES:
 *   - default: a V4 SIGNED URL, signed locally with the service-account private
 *     key. The bucket stays PRIVATE — no public access needed (works when the org
 *     enforces public-access-prevention / uniform bucket-level access). The link
 *     is time-limited (GCS_SIGNED_URL_EXPIRES seconds, default 3600) — plenty for
 *     Instagram to fetch during container processing.
 *   - GCS_PUBLIC=true: return the plain public object URL instead (only works if
 *     the bucket grants public read to allUsers).
 *
 * ONE-TIME BUCKET SETUP:
 *   - create a bucket (any name WITHOUT dots, uniform access is fine), put it in
 *     GCS_BUCKET
 *   - grant the service account (client_email in GCP_SERVICE_ACCOUNT) the
 *     "Storage Object Admin" role on the bucket (write access). That's all the
 *     signed-URL mode needs — the signature itself authorizes the read.
 *   - (Optional) a lifecycle rule to auto-delete objects after a day — Instagram
 *     only needs to fetch each once.
 *
 * The upload uses the JSON API simple media upload (uploadType=media): the raw
 * file bytes are the request body (NOT multipart), which sidesteps the undici
 * FormData/Blob streaming bug that telegram.ts and kling-upload.ts document.
 */
import "dotenv/config";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fetch } from "./proxy.ts";
import { getGoogleAccessToken } from "./gcp-auth.ts";

const GCS_HOST = "storage.googleapis.com";

/** Content-Type from file extension, for the upload body. */
function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
    }[ext] ?? "application/octet-stream"
  );
}

// ---- V4 signed URL helpers ----

/** RFC 3986 encoding (encodeURIComponent also escapes !*'()). */
function rfc3986(s: string): string {
  return encodeURIComponent(s).replace(/[!*'()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
/** Encode an object path, keeping the "/" separators. */
function encodePath(s: string): string {
  return s.split("/").map(rfc3986).join("/");
}
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
async function sha256Hex(str: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)));
}
async function importPkcs8(pem: string): Promise<CryptoKey> {
  const der = Uint8Array.from(
    atob(pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "")),
    (c) => c.charCodeAt(0)
  );
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

/**
 * Build a V4 signed GET URL for gs://{bucket}/{objectName}, signed locally with
 * the service-account private key. No network, no extra IAM permission.
 * `now` is injectable for testing; defaults to the current time.
 */
export async function signedGetUrl(
  bucket: string,
  objectName: string,
  expiresSeconds = Number(process.env.GCS_SIGNED_URL_EXPIRES ?? 3600),
  now: Date = new Date()
): Promise<string> {
  const saJson = process.env.GCP_SERVICE_ACCOUNT;
  if (!saJson) throw new Error("GCP_SERVICE_ACCOUNT is not set (see .env.example)");
  const sa = JSON.parse(saJson);

  const iso = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, ""); // YYYYMMDDTHHMMSSZ
  const datestamp = iso.slice(0, 8);
  const scope = `${datestamp}/auto/storage/goog4_request`;
  const canonicalUri = `/${bucket}/${encodePath(objectName)}`;

  const query: Record<string, string> = {
    "X-Goog-Algorithm": "GOOG4-RSA-SHA256",
    "X-Goog-Credential": `${sa.client_email}/${scope}`,
    "X-Goog-Date": iso,
    "X-Goog-Expires": String(expiresSeconds),
    "X-Goog-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k])}`)
    .join("&");

  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    `host:${GCS_HOST}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = ["GOOG4-RSA-SHA256", iso, scope, await sha256Hex(canonicalRequest)].join("\n");

  const key = await importPkcs8(sa.private_key);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(stringToSign));

  return `https://${GCS_HOST}${canonicalUri}?${canonicalQuery}&X-Goog-Signature=${toHex(sig)}`;
}

/** Plain public object URL (only reachable if the bucket grants public read). */
function publicUrl(bucket: string, objectName: string): string {
  return `https://${GCS_HOST}/${bucket}/${encodePath(objectName)}`;
}

/**
 * Upload `localPath` to GCS_BUCKET and return a fetchable URL (signed by default,
 * or the plain public URL when GCS_PUBLIC=true). `destName` is the object name
 * inside the bucket; when omitted a timestamped name under `ig-uploads/` is used
 * so re-uploads never collide and Instagram never serves a stale cached copy.
 */
export async function uploadToGcs(localPath: string, destName?: string): Promise<string> {
  if (!existsSync(localPath)) throw new Error(`File not found: ${localPath}`);

  const saJson = process.env.GCP_SERVICE_ACCOUNT;
  if (!saJson) throw new Error("GCP_SERVICE_ACCOUNT is not set (see .env.example)");
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) throw new Error("GCS_BUCKET is not set (see .env.example)");

  const objectName = destName ?? `ig-uploads/${Date.now()}-${path.basename(localPath)}`;

  const token = await getGoogleAccessToken(saJson);
  const body = readFileSync(localPath);
  const uploadUrl =
    `https://${GCS_HOST}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectName)}`;

  console.log(`[gcs] uploading ${localPath} → gs://${bucket}/${objectName} ...`);
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": mimeFor(localPath) },
    body,
  });
  const data: any = await res.json();
  if (!res.ok) throw new Error(`GCS upload failed (HTTP ${res.status}): ${JSON.stringify(data)}`);

  const url =
    process.env.GCS_PUBLIC === "true"
      ? publicUrl(bucket, objectName)
      : await signedGetUrl(bucket, objectName);
  console.log(`[gcs] ${process.env.GCS_PUBLIC === "true" ? "public" : "signed"} URL ready`);
  return url;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === "--sign") {
    // Debug: print a signed URL for an object without uploading.
    const bucket = process.env.GCS_BUCKET;
    if (!bucket || !args[1]) {
      console.log("Usage: GCS_BUCKET=... tsx src/gcs.ts --sign <object/name>");
      process.exit(1);
    }
    signedGetUrl(bucket, args[1])
      .then((u) => console.log(u))
      .catch((e) => {
        console.error("[gcs] FAILED:", e.message);
        process.exit(1);
      });
  } else {
    const [localPath, destName] = args;
    if (!localPath) {
      console.log("Usage: tsx src/gcs.ts <path/to/file> [dest/object/name]");
      console.log("       tsx src/gcs.ts --sign <object/name>   # print a signed URL (no upload)");
      process.exit(1);
    }
    uploadToGcs(localPath, destName)
      .then((u) => console.log(u))
      .catch((e) => {
        console.error("[gcs] FAILED:", e.message);
        process.exit(1);
      });
  }
}
