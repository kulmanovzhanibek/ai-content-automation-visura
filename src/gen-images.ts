/**
 * gen-images: prompts[] + job_id → jobs/<job_id>/images/img_N.png
 *
 * Gemini image generation (Nano Banana 2), 9:16 vertical.
 * Aspect ratio is set via config.imageConfig.aspectRatio — "9:16" is one of the
 * supported values in the @google/genai ImageConfig type. Kling inherits the
 * aspect ratio from the input image, so this must stay 9:16.
 *
 * Two modes:
 *   default    — each prompt is an independent text-to-image generation
 *   --base-first (edit mode) — prompt 1 generates the BASE image; every following
 *                prompt EDITS the base image (base PNG is sent as input together
 *                with the prompt). Use this when all frames must share the exact
 *                same space/architecture and only the contents change.
 *
 * Usage:
 *   npx tsx src/gen-images.ts <job_id> "prompt 1" "prompt 2" ...
 *   npx tsx src/gen-images.ts <job_id> --base-first "base prompt" "edit 1" "edit 2" ...
 *   npx tsx src/gen-images.ts --test          # ONE image → jobs/test-image/images/img_1.png
 */
import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image";

type GenOptions = { baseFirst?: boolean };

export async function genImages(
  jobId: string,
  prompts: string[],
  options: GenOptions = {}
): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set (see .env.example)");
  if (prompts.length === 0) throw new Error("No prompts given");

  const ai = new GoogleGenAI({ apiKey });
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

    const isEdit = options.baseFirst && i > 0;
    // In edit mode the base image carries composition and aspect ratio;
    // the prompt instructs what to change and what must stay identical.
    const contents = isEdit
      ? [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: readFileSync(basePath).toString("base64"),
                },
              },
              { text: prompts[i] },
            ],
          },
        ]
      : prompts[i];

    console.log(
      `[gen-images] ${i + 1}/${prompts.length} ${isEdit ? "edit-of-base" : "text-to-image"} model=${IMAGE_MODEL} 9:16 ...`
    );
    const response = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents,
      config: {
        imageConfig: { aspectRatio: "9:16" },
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find((p) => p.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      const text = parts.map((p) => p.text).filter(Boolean).join(" ");
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
    const prompts = args.slice(1).filter((a) => a !== "--base-first");
    if (!jobId || prompts.length === 0) {
      console.log('Usage: tsx src/gen-images.ts <job_id> [--base-first] "prompt 1" "prompt 2" ...');
      console.log("       tsx src/gen-images.ts --test");
      process.exit(1);
    }
    genImages(jobId, prompts, { baseFirst }).catch((e) => {
      console.error("[gen-images] FAILED:", e.message);
      process.exit(1);
    });
  }
}
