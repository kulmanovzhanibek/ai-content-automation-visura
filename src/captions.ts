/**
 * captions: ElevenLabs char-level timestamps → word tokens for @remotion/captions
 *
 * PURE conversion — no API calls. Words are grouped on whitespace:
 *   startMs = first char start, endMs = last char end, timestampMs = startMs.
 * Per @remotion/captions convention, every token after the first carries a
 * leading space in `text` so pages concatenate cleanly.
 *
 * Usage:
 *   npx tsx src/captions.ts --test        # unit test, zero API calls
 *   npx tsx src/captions.ts <job_id>      # jobs/<job_id>/timestamps.json → captions.json
 */
import type { Caption } from "@remotion/captions";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ElevenLabsAlignment } from "./tts.ts";

export function alignmentToCaptions(alignment: ElevenLabsAlignment): Caption[] {
  const { characters, character_start_times_seconds: starts, character_end_times_seconds: ends } = alignment;
  if (characters.length !== starts.length || characters.length !== ends.length) {
    throw new Error("Alignment arrays have mismatched lengths");
  }

  const captions: Caption[] = [];
  let word = "";
  let wordStart = 0;
  let wordEnd = 0;

  const flush = () => {
    if (!word) return;
    captions.push({
      text: (captions.length > 0 ? " " : "") + word,
      startMs: Math.round(wordStart * 1000),
      endMs: Math.round(wordEnd * 1000),
      timestampMs: Math.round(wordStart * 1000),
      confidence: null,
    });
    word = "";
  };

  // Skip anything inside an angle-bracket tag, e.g. ElevenLabs `<break time="2.5s" />`
  // pause directives — they carry timestamps but must never appear as caption text.
  let inTag = false;
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (c === "<") {
      flush();
      inTag = true;
      continue;
    }
    if (inTag) {
      if (c === ">") inTag = false;
      continue;
    }
    if (/\s/.test(c)) {
      flush();
      continue;
    }
    if (!word) wordStart = starts[i];
    word += c;
    wordEnd = ends[i];
  }
  flush();
  return captions;
}

/**
 * Merge word tokens into phrase-level captions: wherever the silence gap between
 * one word's end and the next word's start exceeds `gapMs`, a new phrase starts.
 * Each returned caption is one whole phrase — with `<break>`-paced voiceovers
 * this makes every idea name its own subtitle. Each phrase after the first keeps
 * a leading space so pages concatenate cleanly (matching the word-token convention).
 */
export function mergeIntoPhrases(captions: Caption[], gapMs = 700): Caption[] {
  const phrases: Caption[] = [];
  for (const c of captions) {
    const last = phrases[phrases.length - 1];
    const raw = c.text.replace(/^ /, "");
    if (last && c.startMs - last.endMs <= gapMs) {
      last.text += " " + raw;
      last.endMs = c.endMs;
    } else {
      phrases.push({
        text: (phrases.length > 0 ? " " : "") + raw,
        startMs: c.startMs,
        endMs: c.endMs,
        timestampMs: c.startMs,
        confidence: null,
      });
    }
  }
  return phrases;
}

// --- self-test (hardcoded sample, zero API calls) ---
function runTest() {
  const sample: ElevenLabsAlignment = {
    characters: ["H", "i", " ", "t", "h", "e", "r", "e", ",", " ", "w", "o", "r", "l", "d"],
    character_start_times_seconds: [0.0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1.0],
  };
  const got = alignmentToCaptions(sample);
  const want: Caption[] = [
    { text: "Hi", startMs: 0, endMs: 200, timestampMs: 0, confidence: null },
    { text: " there,", startMs: 300, endMs: 600, timestampMs: 300, confidence: null },
    { text: " world", startMs: 700, endMs: 1000, timestampMs: 700, confidence: null },
  ];
  const gotJson = JSON.stringify(got, null, 2);
  if (gotJson !== JSON.stringify(want, null, 2)) {
    console.error("[captions] TEST FAILED. Got:\n" + gotJson);
    process.exit(1);
  }
  console.log("[captions] TEST OK — 3 word tokens with correct timings:\n" + gotJson);
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv[2];
  if (arg === "--test") {
    runTest();
  } else if (arg) {
    const args = process.argv.slice(2);
    const phrasesMode = args.includes("--phrases");
    const gapIdx = args.indexOf("--gap");
    const gapMs = gapIdx >= 0 ? Number(args[gapIdx + 1]) : 700;
    const jobDir = path.join("jobs", arg);
    const timestamps = JSON.parse(readFileSync(path.join(jobDir, "timestamps.json"), "utf8"));
    let captions = alignmentToCaptions(timestamps.alignment);
    if (phrasesMode) captions = mergeIntoPhrases(captions, gapMs);
    const outPath = path.join(jobDir, "captions.json");
    writeFileSync(outPath, JSON.stringify(captions, null, 2));
    console.log(
      `[captions] wrote ${outPath} (${captions.length} ${phrasesMode ? "phrase" : "word"} tokens)`
    );
  } else {
    console.log("Usage: tsx src/captions.ts <job_id> [--phrases] [--gap 700]   # or --test");
    process.exit(1);
  }
}
