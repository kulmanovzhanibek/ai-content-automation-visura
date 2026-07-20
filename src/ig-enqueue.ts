/**
 * ig-enqueue: add a finished RU reel to the scheduled-Instagram post queue.
 *
 * Called by the morning content routine for each RU reel it renders. It uploads
 * the mp4 to the GCS bucket under a stable object name and appends it to the
 * rolling queue (_ig/queue.json). The scheduled posters (ig-post-next.ts) then
 * publish one per time slot through the day.
 *
 * Instagram = RUSSIAN ONLY — only enqueue the RU cut of a video (never the EN one).
 *
 * Usage:
 *   npx tsx src/ig-enqueue.ts <path/to/out.mp4> "RU caption"     # upload + enqueue
 *   npx tsx src/ig-enqueue.ts --object <bucket/object> "caption" # enqueue existing object
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { uploadToGcs } from "./gcs.ts";
import { enqueueObject } from "./ig-queue.ts";

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let objectName: string;
  let caption: string;

  if (args[0] === "--object") {
    objectName = args[1];
    caption = args[2] ?? "";
    if (!objectName) throw new Error('Usage: --object <bucket/object> "caption"');
  } else {
    const localPath = args[0];
    caption = args[1] ?? "";
    if (!localPath) {
      console.log('Usage: tsx src/ig-enqueue.ts <path/to/out.mp4> "RU caption"');
      console.log('       tsx src/ig-enqueue.ts --object <bucket/object> "caption"');
      process.exit(1);
    }
    if (!existsSync(localPath)) throw new Error(`File not found: ${localPath}`);
    objectName = `ig-queue/${stamp()}-${path.basename(localPath)}`;
    await uploadToGcs(localPath, objectName); // uploads the bytes; we keep the object name
    console.log(`[ig-enqueue] uploaded → ${objectName}`);
  }

  const item = await enqueueObject(objectName, caption, "ru");
  console.log(`[ig-enqueue] queued ${item.objectName} (id ${item.id})`);
}

main().catch((e) => {
  console.error("[ig-enqueue] FAILED:", e.message);
  process.exit(1);
});
