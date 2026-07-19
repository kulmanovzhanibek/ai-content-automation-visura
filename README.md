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

## GitHub Actions (scheduled daily run)

`.github/workflows/daily-content.yml` runs the "Daily automation" plan from
`CLAUDE.md` on a cron (04:00 UTC = 09:00 Asia/Almaty) via
[`anthropics/claude-code-action`](https://github.com/anthropics/claude-code-action),
plus `workflow_dispatch` for an on-demand run. It produces STYLE → COLOR → SLIDES
(each bilingual, each sent to Telegram + the RU cut posted to Instagram), then stops
at the Kling-approval-photos gate — **Kling itself only ever runs in an interactive
Claude Code session** (the action's runner has no Kling MCP connector), so reply
"go" there after reviewing the approval photos to finish that last video.

Add these as **repository secrets** (Settings → Secrets and variables → Actions) —
same values as your local `.env`:

| Secret | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | authenticates the Claude Code Action itself |
| `GCP_SERVICE_ACCOUNT` | Vertex image gen + GCS upload (Instagram hosting) |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | voiceover |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Telegram delivery |
| `IG_USER_ID`, `IG_ACCESS_TOKEN` | Instagram publishing |
| `GCS_BUCKET` | hosting assets for Instagram to fetch |
| `GCP_PROJECT_ID`, `GCP_LOCATION`, `GEMINI_IMAGE_MODEL` | optional overrides, only if you set them locally too |

The runner also needs outbound access to `aiplatform.googleapis.com`,
`api.elevenlabs.io`, `api.telegram.org`, `graph.facebook.com` and
`storage.googleapis.com` — all reachable by default on GitHub-hosted runners.

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
