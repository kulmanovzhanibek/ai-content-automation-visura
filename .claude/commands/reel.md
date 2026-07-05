---
description: Full reel pipeline — script → images → voice → captions → Kling clips → Remotion render → Telegram
argument-hint: <topic or reference> [--images N]
---

Produce one finished reel for: **$ARGUMENTS**

Follow CLAUDE.md hard rules at every step. Everything lives under `jobs/<job_id>/`.
Every step is IDEMPOTENT: if its output already exists, print it as skipped and move
on — a crash at clip 6 must never regenerate clips 1–5. Print one status line per
step: `[3/7] tts: voice.mp3 exists — skip`.

## 0. Job setup
- `job_id` = short topic slug + date, e.g. `hidden-room-2026-07-05`. If the topic
  clearly refers to an existing job, RESUME that job instead of starting a new one.
- N images: from `--images N`, default 5. N images → N−1 clips → (N−1)×5s video.

## 1. Script + image prompts → `jobs/<job_id>/script.json`
Write (yourself, no API) and save `{ "script": "...", "image_prompts": ["...", ...] }`:
- Voiceover script sized to (N−1)×5 seconds: roughly 2.2 words/sec → ~11 words per
  5s segment. Hook in the first 3 seconds, punchline/CTA at the end.
- N image prompts in ONE consistent visual style (same medium, palette, lighting,
  camera angle language). Each prompt describes a KEYFRAME of one continuous scene
  so consecutive frames can morph into each other. Vertical 9:16 composition.

## 2. Images
`npx tsx src/gen-images.ts <job_id> "<prompt 1>" "<prompt 2>" ...`
(script skips images that exist). Eyeball that they came out 9:16 and on-style.

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
  arguments duration="5", enable_audio="false", prompt = the approved stop-motion
  template adapted to what actually changes between frame i and i+1:
  > "Playful stop-motion style timelapse in one single continuous shot:
  > <scene-specific: what appears/assembles/transforms>, piece by piece.
  > Dynamic but seamless, evenly paced across the whole clip, ending exactly at
  > the final frame. No scene cuts, no flashes. Camera perfectly static on a
  > tripod, identical framing throughout. Constant natural lighting. No people."
- Record generation_ids in kling.json BEFORE polling. Poll `query_tasks` ~every
  60–90s (use background sleep timers, never foreground). On failure: relay the
  exact error and STOP — never auto-resubmit (credits).
- Download `url_without_watermark` via `npx tsx src/download.ts <url> jobs/<job_id>/clips/clip_i.mp4`.

## 6. Render
`npx tsx src/build-props.ts <job_id>`
`npx remotion render Reel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props.json`

## 7. Telegram
`npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<one-line caption for the channel>"`
(sends as document — no compression). Also send out.mp4 to the user in chat.

## Final report
Job id, N images, clips generated vs reused, voice duration vs target, credits
spent this run, remaining credits, which steps were skipped as already done.
