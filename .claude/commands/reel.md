---
description: Idea → finished short-form content, delivered to Telegram as a file. Picks the flow (Kling reel / ColorReel color-swap / slides carousel) and runs it end-to-end.
argument-hint: <idea> [--format reel|colors|slides] [--images N] [--preset name]
---

Produce ONE finished, ready-to-post deliverable for: **$ARGUMENTS**

Follow the **Viral content direction** rules in `CLAUDE.md` when writing the hook,
transformation, rapid-slideshow beats and CTA — every concept: pain hook (<8 words)
→ magic transition → 3-4 fast style changes → aggressive app CTA. Follow the Hard
rules too. Everything lives under `jobs/<job_id>/`. Every step is IDEMPOTENT: if an
output exists, print it as skipped and move on. One status line per step:
`[3/7] tts: voice.mp3 exists — skip`.

## Pick the flow (from `--format`, else infer from the idea)
- **`--format colors`** (or ideas like "how wall/cabinet color changes the same
  room", palette swaps): **ColorReel** — Kling-free, 0 credits.
- **`--format slides`** (or app-marketing / before-after / listicle photo posts):
  **Slides carousel** — PNG slides, no video.
- **`--format reel`** / default (voiceover timelapse with Kling transitions):
  **Kling reel** — costs credits, confirm before spending.

## Job setup (all flows)
- `job_id` = short topic slug + date, e.g. `attic-corner-2026-07-08`. If the topic
  clearly matches an existing job, RESUME it.
- Preset (reel/colors): `--preset <name>` (default `default`), copy
  `presets/<name>.json` → `jobs/<job_id>/preset.json` (skip if exists).
- **Image-approval gate (MANDATORY):** after generating images, STOP, send them to
  the user in chat, and wait for their "go" before rendering or spending any Kling
  credits. Regenerate on request.

---

## FLOW A — ColorReel (color-swap), Kling-free
1. Write `script.json` `{ "image_prompts": [...] }`: prompt 1 = base room (or
   "before" concrete shell), then N−1 color edits. Use `--base-first` so every
   frame shares identical architecture/furniture/camera; only the color changes.
2. `npx tsx src/gen-images.ts <job_id> --base-first "<base>" "<edit 1>" ...`
3. **Show images to the user, wait for "go".** Optionally `--images` to Telegram.
4. Write `jobs/<job_id>/color-plan.json`: ordered frames `{img,label,kind,seconds}`
   — a `title` "before" frame (~2s) then the color frames (~1.5s each).
5. `npx tsx src/build-color-props.ts <job_id>`
6. `npx remotion render ColorReel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props-color.json`
7. **Telegram as file:** `npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"`
   and send `out.mp4` to the user in chat.

## FLOW B — Slides carousel (photo + hook + text)
1. `npx tsx src/slides-concept.ts <job_id> --niche "..." --app "..." --pain "..." [--lang ru|en] [--format 1-3]`
   → `slides.json` (hook → pain → insight → solution → soft CTA). Uses Claude if
   `ANTHROPIC_API_KEY` set, else offline template — refine the texts yourself to
   the viral rules.
2. `npx tsx src/gen-images.ts <job_id> "<image_prompt 1>" ...` (the per-slide
   prompts) → backgrounds. **Show images, wait for "go".**
3. `npx tsx src/render-slides.ts <job_id> [--style white|black|plain] [--position top|center|bottom]`
   → `slides/slide_N.png`.
4. **Telegram as file:** `npx tsx src/telegram.ts --slides <job_id>` (carousel),
   and send the slide PNGs to the user in chat.

## FLOW C — Kling reel (voiceover + timelapse transitions)
1. Write `script.json` `{ "script": "...", "image_prompts": [...] }`: voiceover
   sized to (N−1)×5s (~2.2 words/sec), N image prompts, one consistent style.
2. `npx tsx src/gen-images.ts <job_id> [--base-first] "<prompt 1>" ...` then
   `npx tsx src/telegram.ts --images <job_id>`. **Show images, wait for "go".**
3. `npx tsx src/tts.ts <job_id> "<script>"` — check timestamps.json final duration
   vs (N−1)×5s; if off >~1.5s adjust script and rerun BEFORE spending Kling credits.
4. `npx tsx src/captions.ts <job_id>`
5. **Kling** (follow `docs/kling-bridge.md` EXACTLY): check credits (need (N−1)×25),
   upload PNGs (cache URLs in `kling.json`), `image_to_video` per pair
   (`kling-video-v2_5`, `first_image`+`tail_image`, `duration=5`,
   `enable_audio=false`, prompt from preset `transition_prompt_template`), record
   generation_ids BEFORE polling, poll `query_tasks` on background timers (never
   foreground), download `url_without_watermark`. On failure: relay it and STOP.
6. `npx tsx src/build-props.ts <job_id>` →
   `npx remotion render Reel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props.json`
7. **Telegram as file:** `npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"`
   and send `out.mp4` to the user in chat.

---

## Always finish
- The final artifact MUST reach Telegram **as an uncompressed file** (`telegram.ts`
  already uses `sendDocument` + `disable_content_type_detection`) — never
  `--as-video`.
- Also deliver it to the user in chat.
- **Final report:** job id, flow used, N images/slides, clips generated vs reused,
  voice duration vs target (reel), Kling credits spent this run + remaining (reel),
  which steps were skipped as already done.
