/**
 * gcs: upload a local file to a Google Cloud Storage bucket and return its
 * public HTTPS URL.
 *
 * WHY: the Instagram Graph API cannot accept a local file upload — it publishes
 * media by fetching a PUBLIC `video_url` / `image_url` itself. So every asset we
 * want to post has to live at a public URL first. We reuse the GCP service
 * account already configured for Vertex image generation (GCP_SERVICE_ACCOUNT)
 * and upload to GCS_BUCKET.
 *
 * ONE-TIME BUCKET SETUP (see .env.example / README):
 *   - create a bucket, put its name in GCS_BUCKET
 *   - grant the service account (client_email in GCP_SERVICE_ACCOUNT) the
 *     "Storage Object Admin" role on the bucket (write access)
 *   - make objects publicly readable so Instagram can fetch them: grant
 *     `allUsers` the "Storage Object Viewer" role on the bucket. The uploaded
 *     files are public marketing videos/images destined for a public IG feed,
 *     so public-read is fine. (Optional: set a lifecycle rule to auto-delete
 *     objects after a day — Instagram only needs to fetch them once.)
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

/**
 * Upload `localPath` to GCS_BUCKET and return the public URL.
 * `destName` is the object name (path) inside the bucket; when omitted a
 * timestamped name under `ig-uploads/` is used so re-uploads never collide and
 * Instagram never serves a stale cached copy.
 */
export async function uploadToGcs(localPath: string, destName?: string): Promise<string> {
  if (!existsSync(localPath)) throw new Error(`File not found: ${localPath}`);

  const saJson = process.env.GCP_SERVICE_ACCOUNT;
  if (!saJson) throw new Error("GCP_SERVICE_ACCOUNT is not set (see .env.example)");
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) throw new Error("GCS_BUCKET is not set (see .env.example)");

  const objectName =
    destName ?? `ig-uploads/${Date.now()}-${path.basename(localPath)}`;

  const token = await getGoogleAccessToken(saJson);
  const body = readFileSync(localPath);
  const url =
    `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
    `?uploadType=media&name=${encodeURIComponent(objectName)}`;

  console.log(`[gcs] uploading ${localPath} → gs://${bucket}/${objectName} ...`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mimeFor(localPath),
    },
    body,
  });
  const data: any = await res.json();
  if (!res.ok) {
    throw new Error(`GCS upload failed (HTTP ${res.status}): ${JSON.stringify(data)}`);
  }

  // Public object URL. Requires the bucket to grant public read (see header).
  const publicUrl = `https://storage.googleapis.com/${bucket}/${objectName
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
  console.log(`[gcs] public URL: ${publicUrl}`);
  return publicUrl;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , localPath, destName] = process.argv;
  if (!localPath) {
    console.log("Usage: tsx src/gcs.ts <path/to/file> [dest/object/name]");
    process.exit(1);
  }
  uploadToGcs(localPath, destName)
    .then((u) => console.log(u))
    .catch((e) => {
      console.error("[gcs] FAILED:", e.message);
      process.exit(1);
    });
}
