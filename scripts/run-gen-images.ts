import { genImages } from "../src/gen-images.ts";

const jobId = process.argv[2];
const mode = process.argv[3]; // --base-first | --chain | ""
const scriptPath = process.argv[4];

async function main() {
  const { readFileSync } = await import("node:fs");
  const script = JSON.parse(readFileSync(scriptPath, "utf8"));
  const prompts: string[] = script.image_prompts;
  const opts = mode === "--base-first" ? { baseFirst: true } : mode === "--chain" ? { chain: true } : {};
  let attempt = 0;
  while (true) {
    try {
      const files = await genImages(jobId, prompts, opts);
      console.log("DONE", files);
      return;
    } catch (e: any) {
      attempt++;
      if (attempt > 8 || !/RESOURCE_EXHAUSTED|429/.test(String(e.message))) {
        throw e;
      }
      const wait = Math.min(60000, 2000 * 2 ** attempt);
      console.log(`[retry] attempt ${attempt} failed (${e.message}); waiting ${wait}ms`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
