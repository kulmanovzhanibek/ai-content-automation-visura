/**
 * telegram: send a local mp4 to TELEGRAM_CHAT_ID via Bot API.
 *
 * Default is sendDocument — the file arrives AS-IS, no Telegram re-encoding
 * (uncompressed). Pass --as-video to use sendVideo instead (inline player,
 * but Telegram may transcode/compress it).
 *
 * Uses curl for the multipart POST: in sandboxed/cloud environments Node's
 * undici FormData/Blob body does not stream correctly through the HTTPS_PROXY
 * dispatcher (Telegram replies 400 "there is no document in the request"),
 * the same failure class kling-upload.ts documents. curl -F encodes multipart
 * reliably and honors HTTPS_PROXY.
 *
 * Usage:
 *   npx tsx src/telegram.ts <path/to/video.mp4> ["optional caption"] [--as-video]
 */
import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

/** Send as document: file arrives uncompressed, exactly as rendered. */
export async function sendDocument(videoPath: string, caption?: string): Promise<void> {
  assertFile(videoPath);
  console.log(`[telegram] sendDocument (uncompressed) ${videoPath} ...`);
  callBotApi("sendDocument", caption, [`document=@${videoPath};type=video/mp4`]);
  console.log("[telegram] sent OK (as file, no compression)");
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
  const asVideo = args.includes("--as-video");
  const [videoPath, caption] = args.filter((a) => a !== "--as-video");
  if (!videoPath) {
    console.log('Usage: tsx src/telegram.ts <path/to/video.mp4> ["caption"] [--as-video]');
    console.log("Default sends as document (file, no compression); --as-video uses sendVideo.");
    process.exit(1);
  }
  (asVideo ? sendVideo(videoPath, caption) : sendDocument(videoPath, caption)).catch((e) => {
    console.error("[telegram] FAILED:", e.message);
    process.exit(1);
  });
}
