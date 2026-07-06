/**
 * build-slideshow-props: assemble props for the Kling-free `Slideshow` render.
 *
 * Uses the job's IMAGES (not clips) with page-slide transitions. Sizes each
 * image's on-screen time so the whole montage fits the voiceover: total length
 * targets the voice duration (from timestamps.json) + a short tail, or a
 * `--seconds N` override. Falls back to 20s when there's no voice.
 *
 * Usage:
 *   npx tsx src/build-slideshow-props.ts <job_id> [--seconds N] [--transition F]
 * Then:
 *   npx remotion render Slideshow jobs/<job_id>/slideshow.mp4 --props=jobs/<job_id>/props-slideshow.json
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const FPS = 30;

export function buildSlideshowProps(
  jobId: string,
  opts: { seconds?: number; transitionFrames?: number } = {}
): string {
  const jobDir = path.join("jobs", jobId);
  const imagesDir = path.join(jobDir, "images");
  if (!existsSync(imagesDir)) throw new Error(`No images dir: ${imagesDir}`);

  const imgs = readdirSync(imagesDir)
    .filter((f) => /^img_\d+\.png$/.test(f))
    .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]));
  if (imgs.length === 0) throw new Error(`No img_*.png in ${imagesDir}`);
  const images = imgs.map((f) => `${jobId}/images/${f}`);

  const voice = existsSync(path.join(jobDir, "voice.mp3")) ? `${jobId}/voice.mp3` : null;
  const captions = existsSync(path.join(jobDir, "captions.json"))
    ? JSON.parse(readFileSync(path.join(jobDir, "captions.json"), "utf8"))
    : [];
  const presetPath = path.join(jobDir, "preset.json");
  const captionStyle = existsSync(presetPath)
    ? JSON.parse(readFileSync(presetPath, "utf8")).caption_style ?? {}
    : {};

  // Determine target total length (seconds).
  let targetSeconds = opts.seconds ?? 20;
  if (opts.seconds === undefined) {
    const tsPath = path.join(jobDir, "timestamps.json");
    if (existsSync(tsPath)) {
      const a = JSON.parse(readFileSync(tsPath, "utf8")).alignment;
      const ends = a?.character_end_times_seconds ?? [];
      const voiceDur = ends.length ? ends[ends.length - 1] : 0;
      if (voiceDur > 0) targetSeconds = voiceDur + 1.0; // small tail after the CTA
    }
  }

  const n = images.length;
  const transitionDurationInFrames = opts.transitionFrames ?? 18; // 0.6s page slide
  const targetFrames = Math.round(targetSeconds * FPS);
  // total = n*D - (n-1)*T  =>  D = (total + (n-1)*T) / n
  let imageDurationInFrames = Math.round(
    (targetFrames + (n - 1) * transitionDurationInFrames) / n
  );
  // each image must outlast a transition on both sides
  imageDurationInFrames = Math.max(imageDurationInFrames, transitionDurationInFrames * 2 + 1);

  const totalFrames = n * imageDurationInFrames - (n - 1) * transitionDurationInFrames;
  const props = {
    images,
    voice,
    captions,
    captionStyle,
    imageDurationInFrames,
    transitionDurationInFrames,
  };
  const outPath = path.join(jobDir, "props-slideshow.json");
  writeFileSync(outPath, JSON.stringify(props, null, 2));
  console.log(
    `[build-slideshow-props] wrote ${outPath}: ${n} image(s), ` +
      `${(imageDurationInFrames / FPS).toFixed(2)}s each, ${transitionDurationInFrames}f slide, ` +
      `total ${(totalFrames / FPS).toFixed(2)}s (target ${targetSeconds.toFixed(1)}s), voice=${voice ?? "none"}`
  );
  return outPath;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const jobId = args[0];
  if (!jobId) {
    console.log("Usage: tsx src/build-slideshow-props.ts <job_id> [--seconds N] [--transition F]");
    process.exit(1);
  }
  const sIdx = args.indexOf("--seconds");
  const tIdx = args.indexOf("--transition");
  try {
    buildSlideshowProps(jobId, {
      seconds: sIdx >= 0 ? Number(args[sIdx + 1]) : undefined,
      transitionFrames: tIdx >= 0 ? Number(args[tIdx + 1]) : undefined,
    });
  } catch (e) {
    console.error("[build-slideshow-props] FAILED:", (e as Error).message);
    process.exit(1);
  }
}
