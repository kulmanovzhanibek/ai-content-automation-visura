/**
 * build-color-props: assemble props for the `ColorReel` render.
 *
 * Reads jobs/<job_id>/color-plan.json describing the frame order, labels,
 * kinds and per-frame seconds, and writes props-color.json that the ColorReel
 * composition consumes. Static frames, standing text pill, hard cuts, no audio.
 *
 * color-plan.json shape:
 *   {
 *     "fps": 30,
 *     "frames": [
 *       { "img": "img_7.png", "label": "How wall color transforms the same hallway",
 *         "kind": "title", "seconds": 2.0 },
 *       { "img": "img_1.png", "label": "Sage", "kind": "color", "seconds": 1.5 },
 *       ...
 *     ]
 *   }
 *
 * Usage:
 *   npx tsx src/build-color-props.ts <job_id>
 * Then:
 *   npx remotion render ColorReel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props-color.json
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

type PlanFrame = { img: string; label: string; kind?: "title" | "color"; seconds: number };
type Plan = {
  fps?: number;
  frames: PlanFrame[];
  footer?: string | null;
  voice?: string | null;
  outroVideo?: string | null;
  outroVideoBg?: string | null;
  outroSeconds?: number;
};

export function buildColorProps(jobId: string): string {
  const jobDir = path.join("jobs", jobId);
  const planPath = path.join(jobDir, "color-plan.json");
  if (!existsSync(planPath)) throw new Error(`No color-plan.json: ${planPath}`);
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as Plan;
  const fps = plan.fps ?? 30;
  if (!plan.frames?.length) throw new Error("color-plan.json has no frames");

  const frames = plan.frames.map((f) => {
    const src = `${jobId}/images/${f.img}`;
    if (!existsSync(path.join(jobDir, "images", f.img)))
      throw new Error(`Image not found: ${f.img}`);
    return {
      src,
      label: f.label,
      kind: f.kind ?? "color",
      durationInFrames: Math.max(1, Math.round(f.seconds * fps)),
    };
  });

  const outPath = path.join(jobDir, "props-color.json");
  const footer = plan.footer ?? null;

  // optional voiceover audio (played across styles + outro)
  let voice: string | null = null;
  if (plan.voice) {
    if (!existsSync(path.join(jobDir, plan.voice)))
      throw new Error(`Voice not found: ${plan.voice}`);
    voice = `${jobId}/${plan.voice}`;
  }

  // optional appended outro video (e.g. app screen recording)
  let outroVideo: string | null = null;
  let outroVideoBg: string | null = null;
  let outroDurationInFrames = 0;
  if (plan.outroVideo) {
    if (!existsSync(path.join(jobDir, plan.outroVideo)))
      throw new Error(`Outro video not found: ${plan.outroVideo}`);
    outroVideo = `${jobId}/${plan.outroVideo}`;
    outroDurationInFrames = Math.max(1, Math.round((plan.outroSeconds ?? 5) * fps));
    // a separate copy of the outro file for the blurred background layer
    // (Remotion dedupes two OffthreadVideo that share an identical src)
    if (plan.outroVideoBg) {
      if (!existsSync(path.join(jobDir, plan.outroVideoBg)))
        throw new Error(`Outro bg video not found: ${plan.outroVideoBg}`);
      outroVideoBg = `${jobId}/${plan.outroVideoBg}`;
    }
  }

  // optional burned-in subtitles: jobs/<job>/captions.json (+ preset.json caption_style)
  const captions = existsSync(path.join(jobDir, "captions.json"))
    ? JSON.parse(readFileSync(path.join(jobDir, "captions.json"), "utf8"))
    : [];
  const presetPath = path.join(jobDir, "preset.json");
  const captionStyle = existsSync(presetPath)
    ? (JSON.parse(readFileSync(presetPath, "utf8")).caption_style ?? {})
    : {};

  writeFileSync(
    outPath,
    JSON.stringify(
      { frames, footer, voice, outroVideo, outroVideoBg, outroDurationInFrames, captions, captionStyle },
      null,
      2
    )
  );
  const totalS =
    (frames.reduce((s, f) => s + f.durationInFrames, 0) + outroDurationInFrames) / fps;
  console.log(
    `[build-color-props] wrote ${outPath}: ${frames.length} frame(s)` +
      (outroVideo ? ` + outro ${(outroDurationInFrames / fps).toFixed(1)}s` : "") +
      (voice ? " + voice" : "") +
      (captions.length ? ` + ${captions.length} caption tokens` : "") +
      `, total ${totalS.toFixed(1)}s @ ${fps}fps`
  );
  return outPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jobId = process.argv[2];
  if (!jobId) {
    console.log("Usage: tsx src/build-color-props.ts <job_id>");
    process.exit(1);
  }
  try {
    buildColorProps(jobId);
  } catch (e) {
    console.error("[build-color-props] FAILED:", (e as Error).message);
    process.exit(1);
  }
}
