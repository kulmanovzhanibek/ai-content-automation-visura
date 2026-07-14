---
description: WITH Kling AI — Before/After room fill-up. 4 Gemini frames of the SAME room filling up (empty → cozy furnished), Kling morphs the transitions, BEFORE/AFTER labels + optional app outro → mp4 to Telegram. Costs Kling credits.
argument-hint: <room/style> [--clips N]
---

Produce ONE finished **Before/After fill-up reel** (empty room morphs into a cozy
furnished room via Kling) for: **$ARGUMENTS**

Follow `CLAUDE.md` (**Composition inputs & session-hardened rules**, Hard rules,
Halal, Viral direction). Everything under `jobs/<job_id>/`. Idempotent.
**Image-approval gate:** after the 4 frames, STOP, show them, wait for "go" before
spending Kling credits.

Default = 3 clips (15s) from **4 frames** (Kling does 5s/clip → N clips need N+1
frames). `job_id` = `before-after-<slug>-<date>`.

1. **Prompts** → `jobs/<job_id>/script.json` `{ "image_prompts": [4 prompts] }`,
   generated with **`--chain`** (each frame = previous + more furniture, so placed
   items stay put): frame1 = EMPTY finished room; frame2 = + sofa & rug; frame3 =
   + coffee table, armchair, lamp, plants; frame4 = COMPLETE cozy lived-in room
   (art, shelves, cushions, throw, greenery). Same walls/window/floor/camera in all.
2. **Images** — `npx tsx src/gen-images.ts <job_id> --chain "<p1>" ... "<p4>"`
   (retry on Vertex 429). `npx tsx src/telegram.ts --images <job_id>`. **Wait for "go".**
3. **Kling** (per `docs/kling-bridge.md`): credits ≥ N×25; upload 4 imgs → cache in
   `kling.json`; 3 `image_to_video` pairs (img1→2, 2→3, 3→4), `kling-video-v2_5`,
   `first_image`+`tail_image`, `duration=5`, `enable_audio=false`, prompt = smooth
   continuous furnishing timelapse. Record generation_ids BEFORE polling; poll on
   background timers; download `url_without_watermark` → `clips/clip_1..3.mp4`.
4. **Voice** — "Before" at 0s, "After" at ~10s. Make `before.mp3`+`after.mp3` (two
   tts runs, rename), then merge with ffmpeg adelay (see CLAUDE.md "Two timed words").
5. **Labels** → `jobs/<job_id>/labels.json`
   `[{"text":"BEFORE","fromMs":0,"toMs":2000},{"text":"AFTER","fromMs":10000,"toMs":12000}]`.
   Do NOT use captions.json for these (they'd merge). Remove any captions.json.
6. **App outro (optional)** — copy `app.mp4`+`app-bg.mp4` from another job and add
   `outro.json` `{video,videoBg,seconds,text}` with a CTA pill.
7. **Render** — `npx tsx src/build-props.ts <job_id>` →
   `npx remotion render Reel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props.json`.
8. **Telegram as file** — `npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"`
   and send `out.mp4` to the user.

Same 4-frame sets can be re-shot in different STYLES cheaply (only Kling per clip).
**Final report:** job id, frames, clips generated vs reused, Kling credits spent +
remaining, steps skipped.
