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
| telegram (sendVideo) | `npx tsx src/telegram.ts <path/to/video.mp4> ["caption"]` | run with any local mp4 |

All job artifacts live under `jobs/<job_id>/`: `images/`, `clips/`, `voice.mp3`,
`timestamps.json`, `captions.json`, `props.json`, `out.mp4`. Every step is
idempotent — outputs that already exist are skipped.
