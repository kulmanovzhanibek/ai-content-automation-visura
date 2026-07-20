/**
 * telegram: send a local file to TELEGRAM_CHAT_ID via Bot API.
 *
 * Default is sendDocument — the file arrives AS-IS, no Telegram re-encoding
 * (uncompressed). Works for any file type (mp4, png, ...); the MIME type is
 * inferred from the extension. Pass --as-video to use sendVideo instead (inline
 * player, but Telegram may transcode/compress it).
 *
 * Uses curl for the multipart POST: in sandboxed/cloud environments Node's
 * undici FormData/Blob body does not stream correctly through the HTTPS_PROXY
 * dispatcher (Telegram replies 400 "there is no document in the request"),
 * the same failure class kling-upload.ts documents. curl -F encodes multipart
 * reliably and honors HTTPS_PROXY.
 *
 * Usage:
 *   npx tsx src/telegram.ts <path/to/file> ["optional caption"] [--as-video]
 *   npx tsx src/telegram.ts --images <job_id> [--force]
 *     └─ send every jobs/<job_id>/images/img_*.png as an uncompressed document,
 *        in order, captioned "frame i/N". Idempotent: writes a .tg-sent sentinel
 *        and skips on re-run unless --force (so resuming a reel never re-sends).
 */
import "dotenv/config";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

/** MIME type from file extension, for the multipart `type=` hint. */
function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return (
    {
      ".mp4": "video/mp4",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".gif": "image/gif",
    }[ext] ?? "application/octet-stream"
  );
}

/** POST a multipart form to the Bot API via curl. `fields` are extra -F args. */
function callBotApi(method: string, caption: string | undefined, fields: string[]): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set (see .env.example)");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not set (see .env.example)");

  const args = ["-sS", "-X", "POST", `https://api.telegram.org/bot${token}/${method}`, "-F", `chat_id=${chatId}`];
  if (caption) args.push("-F", `caption=${caption}`);
  for (const f of fields) args.push("-F", f);

  const body = execFileSync("curl", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  const data = JSON.parse(body) as { ok: boolean; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram: ${data.description ?? body}`);
  }
}

function assertFile(videoPath: string): void {
  if (!existsSync(videoPath)) throw new Error(`File not found: ${videoPath}`);
}

/**
 * Send as document: file arrives uncompressed, exactly as rendered.
 * `disable_content_type_detection=true` stops Telegram from auto-detecting an
 * mp4 document as a streamable video and showing an inline player — it arrives
 * as a plain downloadable file attachment.
 */
export async function sendDocument(filePath: string, caption?: string): Promise<void> {
  assertFile(filePath);
  console.log(`[telegram] sendDocument (uncompressed) ${filePath} ...`);
  callBotApi("sendDocument", caption, [
    `document=@${filePath};type=${mimeFor(filePath)}`,
    "disable_content_type_detection=true",
  ]);
  console.log("[telegram] sent OK (as file, no compression)");
}

/**
 * Send every generated image of a job as an uncompressed document, in frame
 * order. Idempotent: a `.tg-sent` sentinel in the images dir means "already
 * sent" and the call is a no-op unless `force` is set — so resuming a reel
 * (where images already exist) never double-posts them.
 */
export async function sendImages(jobId: string, force = false): Promise<void> {
  const dir = path.join("jobs", jobId, "images");
  if (!existsSync(dir)) throw new Error(`No images dir: ${dir}`);
  const sentinel = path.join(dir, ".tg-sent");
  if (existsSync(sentinel) && !force) {
    console.log(`[telegram] images already sent (${sentinel}) — skip`);
    return;
  }
  const imgs = readdirSync(dir)
    .filter((f) => /^img_\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (imgs.length === 0) throw new Error(`No img_*.png in ${dir}`);
  console.log(`[telegram] sending ${imgs.length} image(s) as files ...`);
  for (let i = 0; i < imgs.length; i++) {
    await sendDocument(path.join(dir, imgs[i]), `${jobId} — frame ${i + 1}/${imgs.length}`);
  }
  writeFileSync(sentinel, `sent ${imgs.length} images\n`);
  console.log(`[telegram] all ${imgs.length} images sent (wrote ${sentinel})`);
}

/**
 * Send a rendered slide carousel (jobs/<job>/slides/slide_*.png) as uncompressed
 * documents, in order. Idempotent via a `.tg-sent` sentinel in the slides dir.
 */
export async function sendSlides(jobId: string, force = false): Promise<void> {
  const dir = path.join("jobs", jobId, "slides");
  if (!existsSync(dir)) throw new Error(`No slides dir: ${dir}`);
  const sentinel = path.join(dir, ".tg-sent");
  if (existsSync(sentinel) && !force) {
    console.log(`[telegram] slides already sent (${sentinel}) — skip`);
    return;
  }
  const slides = readdirSync(dir)
    .filter((f) => /^slide_\d+\.png$/.test(f))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
  if (slides.length === 0) throw new Error(`No slide_*.png in ${dir}`);
  console.log(`[telegram] sending ${slides.length} slide(s) as files ...`);
  for (let i = 0; i < slides.length; i++) {
    await sendDocument(path.join(dir, slides[i]), `${jobId} — slide ${i + 1}/${slides.length}`);
  }
  writeFileSync(sentinel, `sent ${slides.length} slides\n`);
  console.log(`[telegram] all ${slides.length} slides sent (wrote ${sentinel})`);
}

/** Send a plain text status message (no file) to the chat. */
export async function sendText(text: string): Promise<void> {
  callBotApi("sendMessage", undefined, [`text=${text}`, "disable_web_page_preview=true"]);
}

/** Send as video: inline player, but Telegram may transcode it. */
export async function sendVideo(videoPath: string, caption?: string): Promise<void> {
  assertFile(videoPath);
  console.log(`[telegram] sendVideo ${videoPath} ...`);
  callBotApi("sendVideo", caption, [
    `video=@${videoPath};type=video/mp4`,
    "supports_streaming=true",
    "width=1080",
    "height=1920",
  ]);
  console.log("[telegram] sent OK (as video)");
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fail = (e: Error) => {
    console.error("[telegram] FAILED:", e.message);
    process.exit(1);
  };

  if (args[0] === "--images") {
    const jobId = args[1];
    const force = args.includes("--force");
    if (!jobId) {
      console.log("Usage: tsx src/telegram.ts --images <job_id> [--force]");
      process.exit(1);
    }
    sendImages(jobId, force).catch(fail);
  } else if (args[0] === "--slides") {
    const jobId = args[1];
    const force = args.includes("--force");
    if (!jobId) {
      console.log("Usage: tsx src/telegram.ts --slides <job_id> [--force]");
      process.exit(1);
    }
    sendSlides(jobId, force).catch(fail);
  } else {
    const asVideo = args.includes("--as-video");
    const [filePath, caption] = args.filter((a) => a !== "--as-video");
    if (!filePath) {
      console.log('Usage: tsx src/telegram.ts <path/to/file> ["caption"] [--as-video]');
      console.log('       tsx src/telegram.ts --images <job_id> [--force]');
      console.log("Default sends as document (file, no compression); --as-video uses sendVideo.");
      process.exit(1);
    }
    (asVideo ? sendVideo(filePath, caption) : sendDocument(filePath, caption)).catch(fail);
  }
}
