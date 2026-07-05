/**
 * kling-upload: POST a local file to a Kling upload ticket.
 *
 * The Kling MCP tool `file_upload` does NOT take a file path — it returns a
 * one-time { ticket, upload_url, expire_at }. The actual bytes are sent by
 * this script as multipart/form-data with two fields: 'ticket' and 'file'.
 *
 * Uses curl: Kling's endpoint rejects Node/undici multipart encoding with
 * HTTP.MissingServletRequestParameter (verified 2026-07), while curl -F works.
 * curl also honors HTTPS_PROXY in sandboxed environments.
 *
 * Response shape (verified): {"status":200,"result":1,"data":{"url":"...","fileType":"image","fileSize":N}}
 *
 * Usage:
 *   npx tsx src/kling-upload.ts <file.png> <upload_url> <ticket>
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

export function klingUpload(filePath: string, uploadUrl: string, ticket: string): string {
  if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const type = filePath.endsWith(".mp4") ? "video/mp4" : "image/png";
  const body = execFileSync(
    "curl",
    ["-sS", "-X", "POST", uploadUrl, "-F", `ticket=${ticket}`, "-F", `file=@${filePath};type=${type}`],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 }
  );

  console.log(`[kling-upload] response: ${body}`);
  const data = JSON.parse(body);
  if (data.status !== 200 || !data.data?.url) {
    throw new Error(`Upload failed: ${body}`);
  }
  console.log(`[kling-upload] URL: ${data.data.url}`);
  return data.data.url;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , filePath, uploadUrl, ticket] = process.argv;
  if (!filePath || !uploadUrl || !ticket) {
    console.log("Usage: tsx src/kling-upload.ts <file> <upload_url> <ticket>");
    process.exit(1);
  }
  try {
    klingUpload(filePath, uploadUrl, ticket);
  } catch (e) {
    console.error("[kling-upload] FAILED:", (e as Error).message);
    process.exit(1);
  }
}
