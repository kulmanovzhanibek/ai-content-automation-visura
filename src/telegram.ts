/**
 * telegram: send a local mp4 to TELEGRAM_CHAT_ID via Bot API sendVideo (multipart).
 *
 * Usage:
 *   npx tsx src/telegram.ts <path/to/video.mp4> ["optional caption"]
 */
import "dotenv/config";
import { openAsBlob } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";

export async function sendVideo(videoPath: string, caption?: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set (see .env.example)");
  if (!chatId) throw new Error("TELEGRAM_CHAT_ID is not set (see .env.example)");
  if (!existsSync(videoPath)) throw new Error(`File not found: ${videoPath}`);

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("video", await openAsBlob(videoPath, { type: "video/mp4" }), path.basename(videoPath));
  form.append("supports_streaming", "true");
  form.append("width", "1080");
  form.append("height", "1920");
  if (caption) form.append("caption", caption);

  console.log(`[telegram] sendVideo ${videoPath} → chat ${chatId} ...`);
  const res = await fetch(`https://api.telegram.org/bot${token}/sendVideo`, {
    method: "POST",
    body: form,
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram ${res.status}: ${data.description ?? JSON.stringify(data)}`);
  }
  console.log("[telegram] sent OK");
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , videoPath, caption] = process.argv;
  if (!videoPath) {
    console.log('Usage: tsx src/telegram.ts <path/to/video.mp4> ["caption"]');
    process.exit(1);
  }
  sendVideo(videoPath, caption).catch((e) => {
    console.error("[telegram] FAILED:", e.message);
    process.exit(1);
  });
}
