---
description: WITHOUT Kling AI — Kling-free Remotion montage from photos (wipe/slide/fade) + voiceover + captions → mp4, sent to Telegram as a file. 0 credits.
argument-hint: <idea> [--images N] [--transition wipe|slide|fade] [--still] [--preset name]
---

Produce ONE finished **Kling-free montage** (photos + soft transitions + voiceover +
captions, no Kling) for: **$ARGUMENTS**

Follow the **Viral content direction** rules in `CLAUDE.md` and the Hard rules.
Everything under `jobs/<job_id>/`. Every step IDEMPOTENT. **Image-approval gate:**
after images, STOP, show them to the user, wait for "go" before rendering. Costs no
Kling credits, but be efficient.

- `job_id` = topic slug + date (resume if it matches). N images = `--images N` (else
  preset `images_default`). Unlike the Kling reel there is no N−1 constraint — the
  montage sizes each image's on-screen time to the voice length automatically.

1. **Script + prompts** → `jobs/<job_id>/script.json`
   `{ "script": "...", "image_prompts": [...] }`: voiceover (~2.2 words/sec) and N
   image prompts in one consistent style. Use `--base-first` prompts for
   same-space/"ideas for this room" concepts.
2. **Images** — `npx tsx src/gen-images.ts <job_id> [--base-first] "<p1>" ...` then
   `npx tsx src/telegram.ts --images <job_id>`. **Show images, wait for "go".**
3. **Voice** — `npx tsx src/tts.ts <job_id> "<script>"` (the montage auto-fits image
   timings to the voice, so exact length is less critical than for the Kling reel).
4. **Captions** — `npx tsx src/captions.ts <job_id>`.
5. **Build + render** —
   `npx tsx src/build-slideshow-props.ts <job_id> [--transition wipe|slide|fade] [--still]`
   (default transition `slide`, Ken Burns motion; add `--still` to freeze the image)
   → `npx remotion render Slideshow jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props-slideshow.json`.
6. **Telegram as file** — `npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"`
   and send `out.mp4` to the user in chat.

**Final report:** job id, N images, transition used, voice duration, total montage
length, steps skipped.
