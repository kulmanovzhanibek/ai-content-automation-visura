/**
 * kling-upload: POST a local file to a Kling upload ticket.
 *
 * The Kling MCP tool `file_upload` does NOT take a file path — it returns a
 * one-time { ticket, upload_url, expire_at }. The actual bytes are sent by
 * this script as multipart/form-data with two fields: 'ticket' and 'file'.
 * The response contains the hosted file URL to use as first_image/tail_image.
 *
 * Usage:
 *   npx tsx src/kling-upload.ts <file.png> <upload_url> <ticket>
 *
 * Prints the full response body; the hosted URL is extracted when possible.
 */
import { openAsBlob, existsSync } from "node:fs";
import path from "node:path";

export async function klingUpload(filePath: string, uploadUrl: string, ticket: string): Promise<string> {
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const form = new FormData();
  form.append("ticket", ticket);
  const type = filePath.endsWith(".mp4") ? "video/mp4" : "image/png";
  form.append("file", await openAsBlob(filePath, { type }), path.basename(filePath));

  const res = await fetch(uploadUrl, { method: "POST", body: form });
  const body = await res.text();
  if (!res.ok) throw new Error(`Upload failed ${res.status}: ${body}`);

  console.log(`[kling-upload] response: ${body}`);
  try {
    const data = JSON.parse(body);
    const url = data.url ?? data.file_url ?? data.data?.url ?? data.data?.file_url;
    if (url) {
      console.log(`[kling-upload] URL: ${url}`);
      return url;
    }
  } catch {
    // not JSON — full body already printed above
  }
  return body;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , filePath, uploadUrl, ticket] = process.argv;
  if (!filePath || !uploadUrl || !ticket) {
    console.log("Usage: tsx src/kling-upload.ts <file> <upload_url> <ticket>");
    process.exit(1);
  }
  klingUpload(filePath, uploadUrl, ticket).catch((e) => {
    console.error("[kling-upload] FAILED:", e.message);
    process.exit(1);
  });
}
