/**
 * build-props: assemble jobs/<job_id>/props.json for the Remotion render.
 *
 * Scans jobs/<job_id>/clips/clip_*.mp4 (natural order), picks up voice.mp3 and
 * captions.json when present. Paths in props are relative to the Remotion
 * public dir (jobs/).
 *
 * Usage:
 *   npx tsx src/build-props.ts <job_id>
 * Then:
 *   npx remotion render Reel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props.json
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const FPS = 30; // matches remotion/src/Reel.tsx

export function buildProps(jobId: string): string {
  const jobDir = path.join("jobs", jobId);
  const clipsDir = path.join(jobDir, "clips");
  if (!existsSync(clipsDir)) throw new Error(`No clips dir: ${clipsDir}`);

  const clips = readdirSync(clipsDir)
    .filter((f) => /^clip_\d+\.mp4$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]))
    .map((f) => `${jobId}/clips/${f}`);
  if (clips.length === 0) throw new Error(`No clip_N.mp4 files in ${clipsDir}`);

  const voice = existsSync(path.join(jobDir, "voice.mp3")) ? `${jobId}/voice.mp3` : null;
  const captions = existsSync(path.join(jobDir, "captions.json"))
    ? JSON.parse(readFileSync(path.join(jobDir, "captions.json"), "utf8"))
    : [];

  // preset.json is copied into the job dir by /reel; its caption_style
  // overrides the defaults baked into remotion/src/Captions.tsx
  const presetPath = path.join(jobDir, "preset.json");
  const captionStyle = existsSync(presetPath)
    ? (JSON.parse(readFileSync(presetPath, "utf8")).caption_style ?? {})
    : {};

  // optional outro video (e.g. app screen recording) appended after the clips.
  // Configured via jobs/<job>/outro.json: { video, videoBg?, seconds }.
  // videoBg must be a SEPARATE file copy (Remotion dedupes identical srcs).
  let outroVideo: string | null = null;
  let outroVideoBg: string | null = null;
  let outroDurationInFrames = 0;
  let outroText: string | null = null;
  const outroPath = path.join(jobDir, "outro.json");
  if (existsSync(outroPath)) {
    const cfg = JSON.parse(readFileSync(outroPath, "utf8")) as {
      video: string;
      videoBg?: string;
      seconds?: number;
      text?: string;
    };
    if (cfg.video && existsSync(path.join(jobDir, cfg.video))) {
      outroVideo = `${jobId}/${cfg.video}`;
      outroDurationInFrames = Math.max(1, Math.round((cfg.seconds ?? 5) * FPS));
      if (cfg.videoBg && existsSync(path.join(jobDir, cfg.videoBg)))
        outroVideoBg = `${jobId}/${cfg.videoBg}`;
      outroText = cfg.text ?? null;
    }
  }

  // optional big timed labels (BEFORE/AFTER) from jobs/<job>/labels.json
  const labelsPath = path.join(jobDir, "labels.json");
  const bigLabels = existsSync(labelsPath)
    ? JSON.parse(readFileSync(labelsPath, "utf8"))
    : [];

  const props = { clips, voice, captions, captionStyle, outroVideo, outroVideoBg, outroDurationInFrames, outroText, bigLabels };
  const outPath = path.join(jobDir, "props.json");
  writeFileSync(outPath, JSON.stringify(props, null, 2));
  console.log(
    `[build-props] wrote ${outPath}: ${clips.length} clip(s)` +
      (outroVideo ? ` + outro ${(outroDurationInFrames / FPS).toFixed(1)}s` : "") +
      `, voice=${voice ?? "none"}, ${captions.length} caption tokens`
  );
  return outPath;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const jobId = process.argv[2];
  if (!jobId) {
    console.log("Usage: tsx src/build-props.ts <job_id>");
    process.exit(1);
  }
  try {
    buildProps(jobId);
  } catch (e) {
    console.error("[build-props] FAILED:", (e as Error).message);
    process.exit(1);
  }
}
