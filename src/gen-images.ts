/**
 * gen-images: prompts[] + job_id → jobs/<job_id>/images/img_N.png
 *
 * Vertex AI image generation (Gemini "Nano Banana 2"), 9:16 vertical.
 * Aspect ratio is set via generationConfig.imageConfig.aspectRatio — "9:16".
 * Kling inherits the aspect ratio from the input image, so this must stay 9:16.
 *
 * Auth: Vertex uses a GCP service account. Put the WHOLE service-account JSON
 * (one line) in GCP_SERVICE_ACCOUNT; we mint a short-lived OAuth access token
 * from it (getGoogleAccessToken) and call the Vertex REST endpoint with it.
 * The project id is read from the service account (override: GCP_PROJECT_ID),
 * the region from GCP_LOCATION (default "global" — where the newer Gemini image
 * models are served; set e.g. "us-central1" for region-pinned models).
 *
 * Three modes:
 *   default    — each prompt is an independent text-to-image generation
 *   --base-first (edit mode) — prompt 1 generates the BASE image; every following
 *                prompt EDITS the base image (base PNG is sent as input together
 *                with the prompt). Use this when all frames must share the exact
 *                same space/architecture and only the contents change.
 *   --chain (edit mode) — prompt 1 generates the first image; every following
 *                prompt EDITS THE PREVIOUS frame (img_{i-1} PNG is sent as input).
 *                Use this when each frame must build on the last with running
 *                continuity — e.g. a renovation timelapse where furniture placed
 *                in one frame must stay in the exact same spot in the next.
 *
 * Usage:
 *   npx tsx src/gen-images.ts <job_id> "prompt 1" "prompt 2" ...
 *   npx tsx src/gen-images.ts <job_id> --base-first "base prompt" "edit 1" "edit 2" ...
 *   npx tsx src/gen-images.ts <job_id> --chain "first prompt" "edit 1" "edit 2" ...
 *   npx tsx src/gen-images.ts --test          # ONE image → jobs/test-image/images/img_1.png
 */
import "dotenv/config";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getGoogleAccessToken } from "./gcp-auth.ts";

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";
const LOCATION = process.env.GCP_LOCATION ?? "global";

/** Vertex generateContent REST endpoint for a publisher model. */
function vertexEndpoint(projectId: string, model: string): string {
  const host =
    LOCATION === "global"
      ? "aiplatform.googleapis.com"
      : `${LOCATION}-aiplatform.googleapis.com`;
  // v1beta1: needed for generationConfig.imageConfig (aspect-ratio) support.
  return `https://${host}/v1beta1/projects/${projectId}/locations/${LOCATION}/publishers/google/models/${model}:generateContent`;
}

type GenOptions = { baseFirst?: boolean; chain?: boolean };

export async function genImages(
  jobId: string,
  prompts: string[],
  options: GenOptions = {}
): Promise<string[]> {
  const saJson = process.env.GCP_SERVICE_ACCOUNT;
  if (!saJson) throw new Error("GCP_SERVICE_ACCOUNT is not set (see .env.example)");
  if (prompts.length === 0) throw new Error("No prompts given");

  const projectId =
    process.env.GCP_PROJECT_ID ?? (JSON.parse(saJson).project_id as string | undefined);
  if (!projectId)
    throw new Error("No GCP project id (set GCP_PROJECT_ID or include project_id in GCP_SERVICE_ACCOUNT)");

  // Mint one access token for the whole run (valid ~1h; a job never runs that long).
  const accessToken = await getGoogleAccessToken(saJson);
  const endpoint = vertexEndpoint(projectId, IMAGE_MODEL);

  const outDir = path.join("jobs", jobId, "images");
  mkdirSync(outDir, { recursive: true });

  const basePath = path.join(outDir, "img_1.png");
  const written: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const outPath = path.join(outDir, `img_${i + 1}.png`);
    if (existsSync(outPath)) {
      console.log(`[gen-images] skip (exists): ${outPath}`);
      written.push(outPath);
      continue;
    }

    const isEdit = (options.baseFirst || options.chain) && i > 0;
    // In --base-first every edit references img_1; in --chain each edit
    // references the immediately previous frame (img_i for output img_{i+1}),
    // so running continuity (e.g. fixed furniture positions) is preserved.
    const inputPath = options.chain ? path.join(outDir, `img_${i}.png`) : basePath;
    if (isEdit && !existsSync(inputPath)) {
      throw new Error(`Edit input missing: ${inputPath} (needed to generate img_${i + 1}.png)`);
    }
    // In edit mode the input image carries composition and aspect ratio;
    // the prompt instructs what to change and what must stay identical.
    const parts = isEdit
      ? [
          {
            inlineData: {
              mimeType: "image/png",
              data: readFileSync(inputPath).toString("base64"),
            },
          },
          { text: prompts[i] },
        ]
      : [{ text: prompts[i] }];

    console.log(
      `[gen-images] ${i + 1}/${prompts.length} ${isEdit ? "edit-of-base" : "text-to-image"} model=${IMAGE_MODEL} 9:16 (vertex ${LOCATION}) ...`
    );
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { imageConfig: { aspectRatio: "9:16" } },
      }),
    });

    const data: any = await response.json();
    if (!response.ok) {
      throw new Error(
        `Vertex error for prompt ${i + 1} (HTTP ${response.status}): ${JSON.stringify(data)}`
      );
    }

    const respParts = data.candidates?.[0]?.content?.parts ?? [];
    const imagePart = respParts.find((p: any) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      const text = respParts.map((p: any) => p.text).filter(Boolean).join(" ");
      throw new Error(
        `No image in response for prompt ${i + 1}. Model said: ${text || "(nothing)"}`
      );
    }

    writeFileSync(outPath, Buffer.from(imagePart.inlineData.data, "base64"));
    console.log(`[gen-images] wrote ${outPath}`);
    written.push(outPath);
  }
  return written;
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args[0] === "--test") {
    genImages("test-image", [
      "A cozy wooden cabin in a snowy forest at dusk, warm light in the windows, cinematic, vertical composition",
    ])
      .then((files) => console.log(`[gen-images] TEST OK → ${files[0]} (eyeball it)`))
      .catch((e) => {
        console.error("[gen-images] FAILED:", e.message);
        process.exit(1);
      });
  } else {
    const jobId = args[0];
    const baseFirst = args.includes("--base-first");
    const chain = args.includes("--chain");
    const prompts = args.slice(1).filter((a) => a !== "--base-first" && a !== "--chain");
    if (!jobId || prompts.length === 0) {
      console.log('Usage: tsx src/gen-images.ts <job_id> [--base-first|--chain] "prompt 1" "prompt 2" ...');
      console.log("       tsx src/gen-images.ts --test");
      process.exit(1);
    }
    genImages(jobId, prompts, { baseFirst, chain }).catch((e) => {
      console.error("[gen-images] FAILED:", e.message);
      process.exit(1);
    });
  }
}
