---
description: JUST SCREENSHOTS — photo + hook + text slides as a PNG carousel (no video, no voice), sent to Telegram as files.
argument-hint: <idea or brief> [--niche "..."] [--app "..."] [--pain "..."] [--lang ru|en] [--style white|black|plain] [--position top|center|bottom]
---

Produce ONE finished **photo-slideshow carousel** (vertical photos with big text
plaques, exported as PNG slides — no video, no voice) for: **$ARGUMENTS**

Follow the **Viral content direction** rules AND the **Slides pipeline rules** in
`CLAUDE.md`. Key ones: text in ENGLISH, hook < 8 words; the SAME room/subject in
every slide (generate with `--base-first`, never let it drift); generate the AFTER
first and reuse that same file for the full after-slide AND inside the phone on the
result slide; keep the `appShot` phone small so the room stays visible; last slide =
the renovated after room + App Store phone. Everything under `jobs/<job_id>/`. Every
step IDEMPOTENT. **Image-approval gate:** after backgrounds, STOP, show them to the
user, wait for "go" before finalizing.

- `job_id` = topic slug + date (resume if it matches).
- **Proven 5-slide flow:** before/pain hook → "snapped a photo" → result on phone
  (the after image inside the mockup, over the still-old room) → full after photo →
  after + App Store phone (soft CTA).

1. **Concept** — `npx tsx src/slides-concept.ts <job_id> --niche "..." --app "..." --pain "..." [--lang ru|en] [--format 1-3]`
   → `concepts.json` (3 hook formats) + `slides.json` (5 slides, each `text` +
   `image_prompt`). Uses Claude if `ANTHROPIC_API_KEY` is set, else offline
   templates — either way, refine the slide texts to the viral rules (hook, mini
   cliffhangers, soft CTA). Add `position`/`textStyle` to a slide in `slides.json`
   to override placement (default center + white plaque).
2. **Backgrounds** — `npx tsx src/gen-images.ts <job_id> --base-first "<base scene>" "<edit 1>" ...`
   so every slide shares the SAME room and only the added element changes.
   Generate the AFTER frame here too, then reuse it (see below). **Show images,
   wait for "go".**
3. **Render** — `npx tsx src/render-slides.ts <job_id> [--style white|black|plain] [--position top|center|bottom]`
   → `jobs/<job_id>/slides/slide_N.png` (1080×1920). Per-slide overrides in
   `slides.json`: `img` (background filename — reuse the after photo on two
   slides), `appShot` (a job-relative image shown in an iPhone mockup over the
   bg — put the after photo here on the "result" slide and the App Store
   screenshot on the CTA slide), `position`, `textStyle`.
   - To embed a user-provided screenshot that isn't on disk, extract it from the
     session transcript base64 into the job dir first, then set it as `appShot`.
4. **Telegram as files** — `npx tsx src/telegram.ts --slides <job_id>` (carousel, in
   order) and send the slide PNGs to the user in chat. Post the concept `caption` +
   `hashtags` from `slides.json` alongside.

**Final report:** job id, N slides, concept title/format, whether Claude or offline
templates were used, steps skipped.
