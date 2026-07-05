/**
 * tts: text + job_id → jobs/<job_id>/voice.mp3 + jobs/<job_id>/timestamps.json
 *
 * ElevenLabs POST /v1/text-to-speech/{voice_id}/with-timestamps
 *   headers: xi-api-key
 *   body:    { text, model_id }
 *   returns: { audio_base64, alignment, normalized_alignment }
 *   alignment: { characters[], character_start_times_seconds[], character_end_times_seconds[] }
 *
 * Voice is FIXED via ELEVENLABS_VOICE_ID — never regenerate the voice.
 *
 * Usage:
 *   npx tsx src/tts.ts <job_id> "Text to speak ..."
 */
import "dotenv/config";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const MODEL_ID = process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2";
const OUTPUT_FORMAT = "mp3_44100_128";

export type ElevenLabsAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

export async function tts(
  jobId: string,
  text: string
): Promise<{ voicePath: string; timestampsPath: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set (see .env.example)");
  if (!voiceId) throw new Error("ELEVENLABS_VOICE_ID is not set (see .env.example)");

  const jobDir = path.join("jobs", jobId);
  mkdirSync(jobDir, { recursive: true });
  const voicePath = path.join(jobDir, "voice.mp3");
  const timestampsPath = path.join(jobDir, "timestamps.json");

  if (existsSync(voicePath) && existsSync(timestampsPath)) {
    console.log(`[tts] skip (exists): ${voicePath} + ${timestampsPath}`);
    return { voicePath, timestampsPath };
  }

  console.log(`[tts] model=${MODEL_ID} voice=${voiceId} chars=${text.length} ...`);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=${OUTPUT_FORMAT}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: MODEL_ID }),
  });
  if (!res.ok) {
    throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    audio_base64: string;
    alignment: ElevenLabsAlignment;
    normalized_alignment: ElevenLabsAlignment | null;
  };
  if (!data.audio_base64 || !data.alignment) {
    throw new Error(`Unexpected response shape, keys: ${Object.keys(data).join(", ")}`);
  }

  writeFileSync(voicePath, Buffer.from(data.audio_base64, "base64"));
  writeFileSync(
    timestampsPath,
    JSON.stringify(
      { text, model_id: MODEL_ID, alignment: data.alignment, normalized_alignment: data.normalized_alignment },
      null,
      2
    )
  );

  const n = data.alignment.character_end_times_seconds.length;
  const duration = data.alignment.character_end_times_seconds[n - 1] ?? 0;
  console.log(`[tts] wrote ${voicePath} (${duration.toFixed(2)}s) + ${timestampsPath}`);
  return { voicePath, timestampsPath };
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , jobId, ...textParts] = process.argv;
  const text = textParts.join(" ").trim();
  if (!jobId || !text) {
    console.log('Usage: tsx src/tts.ts <job_id> "Text to speak ..."');
    process.exit(1);
  }
  tts(jobId, text).catch((e) => {
    console.error("[tts] FAILED:", e.message);
    process.exit(1);
  });
}
