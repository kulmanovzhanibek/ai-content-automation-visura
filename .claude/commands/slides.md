---
description: JUST SCREENSHOTS — photo + hook + text slides as a PNG carousel (no video, no voice), sent to Telegram as files.
argument-hint: <idea or brief> [--niche "..."] [--app "..."] [--pain "..."] [--lang ru|en] [--style white|black|plain] [--position top|center|bottom]
---

Produce ONE finished **photo-slideshow carousel** (vertical photos with big text
plaques, exported as PNG slides — no video, no voice) for: **$ARGUMENTS**

Follow the **Viral content direction** rules in `CLAUDE.md`: hook (<8 words) → pain →
insight → solution → soft native CTA, one idea per slide, big readable plaques, no
emoji/hashtags in on-screen text. Everything under `jobs/<job_id>/`. Every step
IDEMPOTENT. **Image-approval gate:** after backgrounds, STOP, show them to the user,
wait for "go" before finalizing.

- `job_id` = topic slug + date (resume if it matches).

1. **Concept** — `npx tsx src/slides-concept.ts <job_id> --niche "..." --app "..." --pain "..." [--lang ru|en] [--format 1-3]`
   → `concepts.json` (3 hook formats) + `slides.json` (5 slides, each `text` +
   `image_prompt`). Uses Claude if `ANTHROPIC_API_KEY` is set, else offline
   templates — either way, refine the slide texts to the viral rules (hook, mini
   cliffhangers, soft CTA). Add `position`/`textStyle` to a slide in `slides.json`
   to override placement (default center + white plaque).
2. **Backgrounds** — `npx tsx src/gen-images.ts <job_id> "<image_prompt 1>" ...`
   (the per-slide prompts from `slides.json`). For a single consistent scene use
   `--base-first`. **Show images, wait for "go".**
3. **Render** — `npx tsx src/render-slides.ts <job_id> [--style white|black|plain] [--position top|center|bottom]`
   → `jobs/<job_id>/slides/slide_N.png` (1080×1920).
4. **Telegram as files** — `npx tsx src/telegram.ts --slides <job_id>` (carousel, in
   order) and send the slide PNGs to the user in chat. Post the concept `caption` +
   `hashtags` from `slides.json` alongside.

**Final report:** job id, N slides, concept title/format, whether Claude or offline
templates were used, steps skipped.
