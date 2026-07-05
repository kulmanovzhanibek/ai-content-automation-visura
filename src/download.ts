/**
 * download: fetch a URL to a local path. Idempotent — skips if the file exists.
 * Used to save Kling clip URLs (they expire in ~24h) into jobs/<job_id>/clips/.
 *
 * Usage:
 *   npx tsx src/download.ts <url> <out_path>
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fetch } from "./proxy.ts";

export async function download(url: string, outPath: string): Promise<string> {
  if (existsSync(outPath)) {
    console.log(`[download] skip (exists): ${outPath}`);
    return outPath;
  }
  mkdirSync(path.dirname(outPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status} for ${url}`);
  writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
  console.log(`[download] wrote ${outPath}`);
  return outPath;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , url, outPath] = process.argv;
  if (!url || !outPath) {
    console.log("Usage: tsx src/download.ts <url> <out_path>");
    process.exit(1);
  }
  download(url, outPath).catch((e) => {
    console.error("[download] FAILED:", e.message);
    process.exit(1);
  });
}
