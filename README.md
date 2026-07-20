# Reels Machine

Automated short-form video pipeline: reference → voiceover + images (Nano Banana) →
Kling timelapse transitions → Remotion montage with TikTok-style captions → Telegram.

See `CLAUDE.md` for pipeline rules and architecture. Current status: **Phase 1**
(deterministic helper scripts). Kling bridge, Remotion composition, and orchestration
come in later phases.

## Setup

```bash
npm install
cp .env.example .env   # fill in your keys
```

## Helper scripts (each independently runnable)

| Script | Run | Test |
|---|---|---|
| gen-images (Gemini 9:16 PNG) | `npx tsx src/gen-images.ts <job_id> "prompt 1" "prompt 2"` | `npm run test:gen-images` — generates ONE image to `jobs/test-image/images/img_1.png` to eyeball |
| tts (ElevenLabs + timestamps) | `npx tsx src/tts.ts <job_id> "Text to speak"` | run it once with a short text; writes `voice.mp3` + `timestamps.json` |
| captions (pure conversion) | `npx tsx src/captions.ts <job_id>` | `npm run test:captions` — unit test, zero API calls |
| telegram (send file, no compression) | `npx tsx src/telegram.ts <path/to/video.mp4> ["caption"]` — sends as document (uncompressed); add `--as-video` for inline player (Telegram may compress) | run with any local mp4 |
| instagram (publish via Graph API) | `npx tsx src/instagram.ts --reel <job_id> "caption"` (Reel) / `--carousel <job_id>` (slides) — hosts the asset on GCS then publishes | `npx tsx src/instagram.ts --whoami` verifies the token (spends no post) |

All job artifacts live under `jobs/<job_id>/`: `images/`, `clips/`, `voice.mp3`,
`timestamps.json`, `captions.json`, `props.json`, `out.mp4`. Every step is
idempotent — outputs that already exist are skipped.

## Daily content + Instagram delivery

The daily package (STYLE → COLOR → SLIDES → gated KLING MORPH) is produced by
Claude itself in a scheduled Claude Code Routine session — see "Daily automation"
in `CLAUDE.md`. There is no separate CI/cron system generating content: Claude
always does the generation. Instagram delivery is a simple GCS drop, not an
automated publish — Claude uploads each finished RU artifact to
`gs://visura-reels-public/_ig/` (`npx tsx src/gcs.ts <file> "_ig/<name>"`) plus a
caption `.txt`, and a human posts it from there. A fully automated Graph API
publish path also exists (`src/instagram.ts`, `docs/instagram-publishing.md`) for
one-off runs if you want it, but the daily plan doesn't use it.

## Slides pipeline (photo + hook + text carousel)

A second, video-free output: a TikTok photo-slideshow — vertical photos with big
text plaques, exported as PNG slides (no voice, no Kling). Ported from the
SlideLab tool.

1. **Concept** — `npx tsx src/slides-concept.ts <job_id> --niche "..." --app "..." --pain "..." [--lang ru|en] [--audience "..."] [--features "..."] [--format 1|2|3]`
   → writes `concepts.json` (3 hook formats) and the chosen `slides.json`
   (5 slides: hook → pain → insight → solution → soft CTA, each with `text` +
   `image_prompt`). Uses Claude (`ANTHROPIC_API_KEY`, model `claude-sonnet-5`)
   when set; otherwise offline template concepts.
2. **Backgrounds** — `npx tsx src/gen-images.ts <job_id> "<image_prompt 1>" ...`
   (the per-slide prompts from `slides.json`) → `images/img_N.png`.
3. **Render** — `npx tsx src/render-slides.ts <job_id> [--style white|black|plain] [--position top|center|bottom]`
   → `slides/slide_N.png` (1080×1920) via the Remotion `Slide` composition.
   Per-slide `position`/`textStyle` in `slides.json` override the defaults.
4. **Send** — `npx tsx src/telegram.ts --slides <job_id>` posts the carousel as
   uncompressed documents, in order.
