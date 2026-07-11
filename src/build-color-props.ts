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
type Plan = { fps?: number; frames: PlanFrame[] };

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
  writeFileSync(outPath, JSON.stringify({ frames }, null, 2));
  const totalS = frames.reduce((s, f) => s + f.durationInFrames, 0) / fps;
  console.log(
    `[build-color-props] wrote ${outPath}: ${frames.length} frame(s), total ${totalS.toFixed(1)}s @ ${fps}fps`
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
