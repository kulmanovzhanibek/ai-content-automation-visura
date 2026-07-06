---
description: Full reel pipeline — script → images → voice → captions → Kling clips → Remotion render → Telegram
argument-hint: <topic or reference> [--images N] [--preset name]
---

Produce one finished reel for: **$ARGUMENTS**

Follow CLAUDE.md hard rules at every step. Everything lives under `jobs/<job_id>/`.
Every step is IDEMPOTENT: if its output already exists, print it as skipped and move
on — a crash at clip 6 must never regenerate clips 1–5. Print one status line per
step: `[3/7] tts: voice.mp3 exists — skip`.

## 0. Job setup
- `job_id` = short topic slug + date, e.g. `hidden-room-2026-07-05`. If the topic
  clearly refers to an existing job, RESUME that job instead of starting a new one.
- Preset: from `--preset <name>` (default `default`), read `presets/<name>.json`
  and COPY it to `jobs/<job_id>/preset.json` (skip if it exists — the job keeps the
  preset it started with). The preset drives: language, images_default,
  gen_images_mode, image_style_preamble, script_structure,
  transition_prompt_template, caption_style (picked up by build-props),
  telegram_caption, and optional voice_id (pass as
  `ELEVENLABS_VOICE_ID=<id> npx tsx src/tts.ts ...` — env default otherwise).
- N images: from `--images N`, else preset `images_default`. N images → N−1 clips
  → (N−1)×5s video.

## 1. Script + image prompts → `jobs/<job_id>/script.json`
Write (yourself, no API) and save `{ "script": "...", "image_prompts": ["...", ...] }`:
- Voiceover script in the preset language, following preset `script_structure`,
  sized to (N−1)×5 seconds: roughly 2.2 words/sec → ~11 words per 5s segment.
- N image prompts prefixed by the preset `image_style_preamble`, in ONE consistent
  visual style. Each prompt describes a KEYFRAME of one continuous scene so
  consecutive frames can morph into each other. Vertical 9:16 composition.

## 2. Images
Two formats, pick per concept:
- Independent scenes: `npx tsx src/gen-images.ts <job_id> "<prompt 1>" "<prompt 2>" ...`
- SAME SPACE, different contents (e.g. "ideas for this room" reels):
  `npx tsx src/gen-images.ts <job_id> --base-first "<base scene prompt>" "<edit 1>" ...`
  Prompt 1 generates the base frame; each edit prompt receives the base image and
  must say what to ADD/CHANGE and that architecture, walls, floor, lighting and
  camera angle stay EXACTLY identical.
(script skips images that exist). Eyeball that they came out 9:16 and on-style.

Then send ALL generated images to Telegram as uncompressed files AND to the user
in chat, right away — don't wait for the finished video:
`npx tsx src/telegram.ts --images <job_id>`
(sends every img_*.png as a document in frame order; idempotent via a `.tg-sent`
sentinel so resuming a job never re-posts them). Also surface the same images to
the user in chat via the file-send tool.

## 3. Voice
`npx tsx src/tts.ts <job_id> "<script text>"`
Then read the final duration from timestamps.json (last character_end_times_seconds)
and compare with (N−1)×5s. If off by more than ~1.5s, adjust the script and rerun
(delete voice.mp3 + timestamps.json first) BEFORE spending Kling credits.

## 4. Captions
`npx tsx src/captions.ts <job_id>` → captions.json

## 5. Kling clips — follow docs/kling-bridge.md EXACTLY
- Check credits (`query_membership_and_credits`): need (N−1)×25. Abort if short.
- Upload images (MCP `file_upload` ticket → `npx tsx src/kling-upload.ts`), cache
  URLs in `jobs/<job_id>/kling.json`; reuse cached URLs on resume.
- For each pair (i, i+1) without an existing `clips/clip_i.mp4`: MCP `image_to_video`,
  model `kling-video-v2_5`, inputs first_image=URL[i] + tail_image=URL[i+1],
  arguments duration="5", enable_audio="false", prompt = the preset
  `transition_prompt_template` with {WHAT_CHANGES} replaced by a scene-specific
  description of what appears/assembles/transforms between frame i and i+1.
- Record generation_ids in kling.json BEFORE polling. Poll `query_tasks` ~every
  60–90s (use background sleep timers, never foreground). On failure: relay the
  exact error and STOP — never auto-resubmit (credits).
- Download `url_without_watermark` via `npx tsx src/download.ts <url> jobs/<job_id>/clips/clip_i.mp4`.

## 6. Render
`npx tsx src/build-props.ts <job_id>`
`npx remotion render Reel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props.json`

## 7. Telegram
`npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"` — use preset
`telegram_caption` if set, else write a one-liner for the topic.
(sends as document — no compression). Also send out.mp4 to the user in chat.

## Final report
Job id, N images, clips generated vs reused, voice duration vs target, credits
spent this run, remaining credits, which steps were skipped as already done.
