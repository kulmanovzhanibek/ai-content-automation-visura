/**
 * ig-post-next: publish the NEXT queued RU reel to Instagram as a Reel.
 *
 * Runs headless from a scheduled session (one per time slot). It is idempotent
 * and self-limiting: it posts exactly ONE reel per invocation and no-ops when the
 * queue is empty, so an over-scheduled slot simply does nothing.
 *
 *   1. If the queue has no pending item → log and exit 0 (silent, no alert).
 *   2. ensureToken() — a valid long-lived token from GCS (auto-refreshed).
 *   3. sign the reel's GCS object → a fetchable URL for Instagram.
 *   4. publish as a REELS via graph.instagram.com (share_to_feed=true).
 *   5. mark the item posted (media_id + permalink) back in the GCS queue.
 *   6. Telegram status line.
 *
 * Flags:
 *   --dry-run   do everything up to (not including) the actual publish.
 *
 * Usage: npx tsx src/ig-post-next.ts [--dry-run]
 */
import "dotenv/config";
import { ensureToken, loadQueue, saveQueue, nextPending } from "./ig-queue.ts";
import { signedGetUrl } from "./gcs.ts";
import { fetch } from "./proxy.ts";

const IG_HOST = "graph.instagram.com";
const API_VERSION = process.env.GRAPH_API_VERSION ?? "v23.0";

async function tgSafe(text: string): Promise<void> {
  try {
    const { sendText } = await import("./telegram.ts");
    await sendText(text);
  } catch (e: any) {
    console.warn(`[ig-post] telegram note failed: ${e.message}`);
  }
}

async function permalinkOf(mediaId: string, token: string): Promise<string | undefined> {
  try {
    const qs = new URLSearchParams({ fields: "permalink", access_token: token });
    const j: any = await (await fetch(`https://${IG_HOST}/${API_VERSION}/${mediaId}?${qs}`)).json();
    return j.permalink;
  } catch {
    return undefined;
  }
}

async function main(dryRun: boolean): Promise<void> {
  const bucket = process.env.GCS_BUCKET;
  if (!bucket) throw new Error("GCS_BUCKET is not set");

  // 1) anything to post?
  const q = await loadQueue();
  const item = nextPending(q);
  if (!item) {
    console.log("[ig-post] queue empty — nothing to post");
    return;
  }
  console.log(`[ig-post] next: ${item.objectName}`);

  // 2) valid token (+ the id it belongs to). Alert if this fails while a post is due.
  let token: string, userId: string;
  try {
    ({ token, userId } = await ensureToken());
  } catch (e: any) {
    await tgSafe(`⚠️ Instagram: не могу опубликовать (${item.objectName}) — токен: ${e.message}`);
    throw e;
  }
  console.log(`[ig-post] token ok, ig user id ${userId}`);

  // 3) fetchable URL for the reel
  const url = await signedGetUrl(bucket, item.objectName, 3600);

  if (dryRun) {
    console.log(`[ig-post] DRY RUN — would publish REELS for user ${userId}`);
    console.log(`[ig-post]   objectName: ${item.objectName}`);
    console.log(`[ig-post]   caption:    ${item.caption.slice(0, 80).replace(/\n/g, " ")}…`);
    console.log(`[ig-post]   signed url: ${url.slice(0, 90)}…`);
    return;
  }

  // 4) publish via graph.instagram.com — set env BEFORE importing instagram.ts
  //    (it captures GRAPH_API_HOST at module load).
  process.env.GRAPH_API_HOST = IG_HOST;
  process.env.IG_ACCESS_TOKEN = token;
  process.env.IG_USER_ID = userId;
  const { publishReelUrl } = await import("./instagram.ts");
  let mediaId: string;
  try {
    mediaId = await publishReelUrl(url, item.caption, true);
  } catch (e: any) {
    item.error = e.message;
    await saveQueue(q);
    await tgSafe(`⚠️ Instagram: публикация не удалась (${item.objectName}): ${e.message}`);
    throw e;
  }

  // 5) mark posted
  const permalink = await permalinkOf(mediaId, token);
  item.posted = true;
  item.media_id = mediaId;
  item.permalink = permalink;
  item.posted_at = Math.floor(Date.now() / 1000);
  delete item.error;
  await saveQueue(q);

  const remaining = q.items.filter((i) => !i.posted).length;
  console.log(`[ig-post] published media ${mediaId}${permalink ? ` — ${permalink}` : ""}`);
  await tgSafe(`✅ Instagram Reel опубликован${permalink ? `: ${permalink}` : ` (media ${mediaId})`}\nВ очереди осталось: ${remaining}`);
}

const dryRun = process.argv.includes("--dry-run");
main(dryRun).catch((e) => {
  console.error("[ig-post] FAILED:", e.message);
  process.exit(1);
});
