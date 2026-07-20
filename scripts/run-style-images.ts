import { readFileSync } from "node:fs";
import { genImages } from "../src/gen-images.ts";

const jobId = process.argv[2];
const { image_prompts } = JSON.parse(readFileSync(`jobs/${jobId}/script.json`, "utf8"));

async function main() {
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await genImages(jobId, image_prompts, { baseFirst: true });
      console.log("DONE");
      return;
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`[attempt ${attempt}] ${msg}`);
      if (!/429|RESOURCE_EXHAUSTED/i.test(msg) || attempt === 6) throw e;
      const wait = attempt * 5000;
      console.log(`retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}
main();
