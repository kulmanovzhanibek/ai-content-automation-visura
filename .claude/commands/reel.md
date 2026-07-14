---
description: WITH Kling AI — voiceover + images + Kling timelapse transitions + captions → mp4, sent to Telegram as a file. Costs Kling credits.
argument-hint: <idea> [--images N] [--preset name]
---

Produce ONE finished **Kling reel** (voiceover + Kling timelapse transitions) for:
**$ARGUMENTS**

Follow the **Viral content direction** rules in `CLAUDE.md` (pain hook <8 words →
magic transition → rapid style beats → aggressive app CTA) and the Hard rules.
Everything under `jobs/<job_id>/`. Every step IDEMPOTENT: skip existing outputs,
one status line each. **Image-approval gate:** after images, STOP, show them to the
user, wait for "go" before spending Kling credits.

- `job_id` = topic slug + date (resume if it matches an existing job). Preset:
  `--preset <name>` (default `default`) → copy `presets/<name>.json` →
  `jobs/<job_id>/preset.json`. N images (`--images N`, else preset) → N−1 clips →
  (N−1)×5s.

1. **Script + prompts** → `jobs/<job_id>/script.json`
   `{ "script": "...", "image_prompts": [...] }`: voiceover sized to (N−1)×5s
   (~2.2 words/sec), N image prompts in one consistent style (each a keyframe of a
   continuous scene). Prefix with preset `image_style_preamble`.
2. **Images** — `npx tsx src/gen-images.ts <job_id> [--base-first] "<p1>" ...` then
   `npx tsx src/telegram.ts --images <job_id>`. **Show images, wait for "go".**
3. **Voice** — `npx tsx src/tts.ts <job_id> "<script>"`. Check timestamps.json final
   time vs (N−1)×5s; if off >~1.5s fix the script and rerun BEFORE Kling.
4. **Captions** — `npx tsx src/captions.ts <job_id> --phrases --gap 400` for
   break-paced "hook + idea names" scripts (ONE subtitle per phrase, each name on
   its own page). Ensure preset caption_style has `combineTokensWithinMilliseconds`
   ~500 and `bottomOffset` ~430 (see CLAUDE.md Captions rules).
5. **Kling** (follow `docs/kling-bridge.md` EXACTLY): check credits (need (N−1)×25);
   upload PNGs, cache URLs in `kling.json`; `image_to_video` per pair
   (`kling-video-v2_5`, `first_image`+`tail_image`, `duration=5`,
   `enable_audio=false`, prompt = preset `transition_prompt_template` with
   {WHAT_CHANGES} filled); record generation_ids BEFORE polling; poll `query_tasks`
   on background timers (never foreground); download `url_without_watermark`. On
   failure relay it and STOP — never auto-resubmit.
6. **App outro (optional)** — to append the Visura screen recording as a CTA payoff:
   copy `app.mp4`+`app-bg.mp4` into the job (transcode/copy per CLAUDE.md "App outro
   asset") and add `jobs/<job_id>/outro.json` `{video,videoBg,seconds,text}` — `text`
   renders a white CTA pill (emoji ok). Put the app CTA HERE, not as an extra spoken
   line (that desyncs the idea names — see CLAUDE.md Voice rules).
   For big timed labels (BEFORE/AFTER) add `labels.json` instead of captions.
7. **Render** — `npx tsx src/build-props.ts <job_id>` →
   `npx remotion render Reel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props.json`.
8. **Telegram as file** — `npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"`
   (preset `telegram_caption` if set) and send `out.mp4` to the user in chat.

**Final report:** job id, N images, clips generated vs reused, voice duration vs
target, Kling credits spent this run + remaining, steps skipped as already done.
