/**
 * telegram: send a local mp4 to TELEGRAM_CHAT_ID via Bot API.
 *
 * Default is sendDocument — the file arrives AS-IS, no Telegram re-encoding
 * (uncompressed). Pass --as-video to use sendVideo instead (inline player,
 * but Telegram may transcode/compress it).
 *
 * Usage:
 *   npx tsx src/telegram.ts <path/to/video.mp4> ["optional caption"] [--as-video]
 */
import "dotenv/config";
import { openAsBlob } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fetch } from "./proxy.ts";

async function callBotApi(method: string, form: FormData): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set (see .env.example)");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram ${res.status}: ${data.description ?? JSON.stringify(data)}`);
  }
}

function baseForm(videoPath: string, caption?: string): FormData {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not set (see .env.example)");
  if (!existsSync(videoPath)) throw new Error(`File not found: ${videoPath}`);
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  return form;
}

/** Send as document: file arrives uncompressed, exactly as rendered. */
export async function sendDocument(videoPath: string, caption?: string): Promise<void> {
  const form = baseForm(videoPath, caption);
  form.append("document", await openAsBlob(videoPath, { type: "video/mp4" }), path.basename(videoPath));
  console.log(`[telegram] sendDocument (uncompressed) ${videoPath} ...`);
  await callBotApi("sendDocument", form);
  console.log("[telegram] sent OK (as file, no compression)");
}

/** Send as video: inline player, but Telegram may transcode it. */
export async function sendVideo(videoPath: string, caption?: string): Promise<void> {
  const form = baseForm(videoPath, caption);
  form.append("video", await openAsBlob(videoPath, { type: "video/mp4" }), path.basename(videoPath));
  form.append("supports_streaming", "true");
  form.append("width", "1080");
  form.append("height", "1920");
  console.log(`[telegram] sendVideo ${videoPath} ...`);
  await callBotApi("sendVideo", form);
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
