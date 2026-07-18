/**
 * instagram: publish finished artifacts to an Instagram Business/Creator account
 * via the Instagram Graph API (content publishing).
 *
 * Instagram does NOT accept a local file upload — it publishes media by fetching
 * a PUBLIC url itself. So the flow is always:
 *   1. upload the local asset to GCS  → public URL           (src/gcs.ts)
 *   2. POST /{ig-user-id}/media       → creation container   (video_url/image_url)
 *   3. GET  /{container-id}?fields=status_code  until FINISHED
 *   4. POST /{ig-user-id}/media_publish (creation_id)        → published media id
 *
 * Two output types (matching the pipeline):
 *   - REEL     : a rendered 1080x1920 out.mp4  → media_type=REELS
 *   - CAROUSEL : the /slides slide_*.png set    → media_type=CAROUSEL (2-10 items)
 *
 * Env (see .env.example):
 *   IG_USER_ID          the Instagram Business account id (the "IG user id")
 *   IG_ACCESS_TOKEN     a long-lived access token with instagram_content_publish
 *   GRAPH_API_VERSION   optional, default v23.0
 *   GRAPH_API_HOST      optional, default graph.facebook.com
 *   GCP_SERVICE_ACCOUNT + GCS_BUCKET   for the public-URL hosting (src/gcs.ts)
 *
 * Rate limit: an IG account may publish 100 posts per rolling 24h (all types).
 * Reels spec: 9:16, 5-90s, H.264/HEVC — our renders already comply.
 */
import "dotenv/config";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fetch } from "./proxy.ts";
import { uploadToGcs } from "./gcs.ts";

const API_VERSION = process.env.GRAPH_API_VERSION ?? "v23.0";
const API_HOST = process.env.GRAPH_API_HOST ?? "graph.facebook.com";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function creds(): { igUserId: string; token: string } {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!igUserId) throw new Error("IG_USER_ID is not set (see .env.example)");
  if (!token) throw new Error("IG_ACCESS_TOKEN is not set (see .env.example)");
  return { igUserId, token };
}

function graphUrl(segment: string): string {
  return `https://${API_HOST}/${API_VERSION}/${segment}`;
}

/** Surface the Graph API's structured {error:{...}} body as a readable Error. */
function graphError(where: string, status: number, data: any): Error {
  const e = data?.error;
  if (e) {
    return new Error(
      `Instagram ${where} failed (HTTP ${status}): ${e.message}` +
        `${e.code ? ` [code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""}]` : ""}` +
        `${e.fbtrace_id ? ` (fbtrace_id ${e.fbtrace_id})` : ""}`
    );
  }
  return new Error(`Instagram ${where} failed (HTTP ${status}): ${JSON.stringify(data)}`);
}

/** POST to a Graph edge with x-www-form-urlencoded params (+ access_token). */
async function graphPost(segment: string, params: Record<string, string>, token: string): Promise<any> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(graphUrl(segment), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data: any = await res.json();
  if (!res.ok) throw graphError(`POST ${segment}`, res.status, data);
  return data;
}

/** GET a Graph node/edge with query params (+ access_token). */
async function graphGet(segment: string, params: Record<string, string>, token: string): Promise<any> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${graphUrl(segment)}?${qs}`, { method: "GET" });
  const data: any = await res.json();
  if (!res.ok) throw graphError(`GET ${segment}`, res.status, data);
  return data;
}

/**
 * Poll a creation container until it finishes processing. Meta recommends
 * polling ~once per minute for up to 5 minutes; Reels usually finish in
 * 30s-2min. We poll a little more often (every 5s) so short videos publish
 * promptly, capped at `timeoutMs`.
 */
async function waitForContainer(containerId: string, token: string, timeoutMs = 5 * 60_000): Promise<void> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const data = await graphGet(containerId, { fields: "status_code,status" }, token);
    const code = data.status_code as string;
    if (code !== last) {
      console.log(`[instagram] container ${containerId} status: ${code}${data.status ? ` — ${data.status}` : ""}`);
      last = code;
    }
    if (code === "FINISHED") return;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new Error(`Instagram container ${containerId} ${code}: ${data.status ?? "processing failed"}`);
    }
    await sleep(5_000);
  }
  throw new Error(`Instagram container ${containerId} not FINISHED within ${Math.round(timeoutMs / 1000)}s`);
}

/** Publish a finished container. Returns the published media id. */
async function publishContainer(igUserId: string, creationId: string, token: string): Promise<string> {
  const data = await graphPost(`${igUserId}/media_publish`, { creation_id: creationId }, token);
  console.log(`[instagram] published — media id ${data.id}`);
  return data.id as string;
}

/**
 * Publish a Reel from an ALREADY-PUBLIC video URL.
 * `shareToFeed` (default true) also surfaces the Reel in the main feed grid.
 */
export async function publishReelUrl(videoUrl: string, caption = "", shareToFeed = true): Promise<string> {
  const { igUserId, token } = creds();
  console.log(`[instagram] creating REELS container for ${videoUrl} ...`);
  const container = await graphPost(
    `${igUserId}/media`,
    {
      media_type: "REELS",
      video_url: videoUrl,
      caption,
      share_to_feed: shareToFeed ? "true" : "false",
    },
    token
  );
  await waitForContainer(container.id, token);
  return publishContainer(igUserId, container.id, token);
}

/** Upload a local mp4 to GCS, then publish it as a Reel. */
export async function publishReelFile(localPath: string, caption = ""): Promise<string> {
  if (!existsSync(localPath)) throw new Error(`File not found: ${localPath}`);
  const url = await uploadToGcs(localPath);
  return publishReelUrl(url, caption);
}

/**
 * Publish an image carousel (2-10 items) from ALREADY-PUBLIC image URLs.
 * NOTE: Instagram crops every carousel slide to the first slide's aspect ratio
 * (portrait max 4:5), so 9:16 slides are centre-cropped in the feed.
 */
export async function publishCarouselUrls(imageUrls: string[], caption = ""): Promise<string> {
  const { igUserId, token } = creds();
  if (imageUrls.length < 2 || imageUrls.length > 10) {
    throw new Error(`Carousel needs 2-10 items, got ${imageUrls.length}`);
  }

  console.log(`[instagram] creating ${imageUrls.length} carousel item containers ...`);
  const childIds: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const item = await graphPost(
      `${igUserId}/media`,
      { image_url: imageUrls[i], is_carousel_item: "true" },
      token
    );
    childIds.push(item.id);
    await waitForContainer(item.id, token);
    console.log(`[instagram]   item ${i + 1}/${imageUrls.length} ready (${item.id})`);
  }

  console.log(`[instagram] creating CAROUSEL container ...`);
  const container = await graphPost(
    `${igUserId}/media`,
    { media_type: "CAROUSEL", children: childIds.join(","), caption },
    token
  );
  await waitForContainer(container.id, token);
  return publishContainer(igUserId, container.id, token);
}

// ---- job-aware convenience wrappers (idempotent) ----

/** Publish jobs/<jobId>/out.mp4 as a Reel. Idempotent via a .ig-sent sentinel. */
export async function publishReelJob(jobId: string, caption = "", force = false): Promise<string | null> {
  const mp4 = path.join("jobs", jobId, "out.mp4");
  if (!existsSync(mp4)) throw new Error(`No rendered video: ${mp4}`);
  const sentinel = path.join("jobs", jobId, ".ig-sent");
  if (existsSync(sentinel) && !force) {
    console.log(`[instagram] reel already published (${sentinel}) — skip (use --force to repost)`);
    return null;
  }
  const mediaId = await publishReelFile(mp4, caption);
  writeFileSync(sentinel, `reel media_id ${mediaId}\n`);
  return mediaId;
}

/**
 * Publish jobs/<jobId>/slides/slide_*.png as a carousel, in order.
 * Idempotent via a .ig-sent sentinel in the slides dir.
 */
export async function publishSlidesJob(jobId: string, caption = "", force = false): Promise<string | null> {
  const dir = path.join("jobs", jobId, "slides");
  if (!existsSync(dir)) throw new Error(`No slides dir: ${dir}`);
  const sentinel = path.join(dir, ".ig-sent");
  if (existsSync(sentinel) && !force) {
    console.log(`[instagram] carousel already published (${sentinel}) — skip (use --force to repost)`);
    return null;
  }
  const slides = readdirSync(dir)
    .filter((f) => /^slide_\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (slides.length < 2) throw new Error(`Carousel needs >=2 slides, found ${slides.length} in ${dir}`);

  console.log(`[instagram] uploading ${slides.length} slides to GCS ...`);
  const urls: string[] = [];
  for (const s of slides) urls.push(await uploadToGcs(path.join(dir, s)));

  const mediaId = await publishCarouselUrls(urls, caption);
  writeFileSync(sentinel, `carousel media_id ${mediaId}\n`);
  return mediaId;
}

/** Connectivity check: confirm the token + IG_USER_ID work, spending no post. */
export async function whoami(): Promise<void> {
  const { igUserId, token } = creds();
  const data = await graphGet(
    igUserId,
    { fields: "id,username,account_type,followers_count,media_count" },
    token
  );
  console.log(`[instagram] connected as @${data.username} (${data.account_type})`);
  console.log(`[instagram]   id=${data.id} followers=${data.followers_count ?? "?"} media=${data.media_count ?? "?"}`);
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const rest = args.filter((a) => a !== "--force");
  const fail = (e: Error) => {
    console.error("[instagram] FAILED:", e.message);
    process.exit(1);
  };

  if (rest[0] === "--whoami") {
    whoami().catch(fail);
  } else if (rest[0] === "--reel") {
    const [, jobId, caption] = rest;
    if (!jobId) {
      console.log('Usage: tsx src/instagram.ts --reel <job_id> ["caption"] [--force]');
      process.exit(1);
    }
    publishReelJob(jobId, caption ?? "", force).catch(fail);
  } else if (rest[0] === "--carousel") {
    const [, jobId, caption] = rest;
    if (!jobId) {
      console.log('Usage: tsx src/instagram.ts --carousel <job_id> ["caption"] [--force]');
      process.exit(1);
    }
    publishSlidesJob(jobId, caption ?? "", force).catch(fail);
  } else {
    const [filePath, caption] = rest;
    if (!filePath) {
      console.log("Instagram Graph API publisher. Usage:");
      console.log('  tsx src/instagram.ts <path/to/out.mp4> ["caption"]   # publish an mp4 as a Reel');
      console.log('  tsx src/instagram.ts --reel <job_id> ["caption"]     # publish jobs/<job>/out.mp4');
      console.log('  tsx src/instagram.ts --carousel <job_id> ["caption"] # publish jobs/<job>/slides/*.png');
      console.log("  tsx src/instagram.ts --whoami                        # verify token + IG_USER_ID");
      console.log("  (append --force to repost something already sent)");
      process.exit(1);
    }
    publishReelFile(filePath, caption ?? "").catch(fail);
  }
}
