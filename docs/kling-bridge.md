# Kling bridge — agent procedure (Phase 2)

Turns `jobs/<job_id>/images/img_1..img_N.png` into `jobs/<job_id>/clips/clip_1..clip_{N-1}.mp4`.
This step is AGENT-driven (Kling MCP tools) with two deterministic glue scripts for
byte transfer. **Every generation costs credits — check credits first, never fire
throwaway jobs.**

## Facts verified against the live MCP (who_am_i, 2026-07)

- `file_upload` does NOT accept a file path. It returns a one-time
  `{ ticket, upload_url, expire_at }`; the agent then POSTs the bytes itself
  (multipart fields `ticket` + `file`) — that's `src/kling-upload.ts`. The upload
  response contains the hosted file URL. Tickets are single-use; reuse the returned
  URL for unchanged files instead of re-uploading.
- The upload endpoint rejects Node/undici multipart encoding
  (HTTP.MissingServletRequestParameter, HTTP 500) — kling-upload.ts shells out to
  `curl -F` instead, which works. Successful response:
  `{"status":200,"result":1,"data":{"url":"https://s15-kling.klingai.com/kimg/...","fileType":"image","fileSize":N}}`.
- In sandboxed cloud environments, Node's global fetch ignores HTTPS_PROXY; all
  fetch-based scripts import proxy-aware fetch from `src/proxy.ts`. The env's
  network allowlist must include kling.ai, *.kling.ai, *.klingai.com (plus
  generativelanguage.googleapis.com, api.elevenlabs.io, api.telegram.org for the
  other pipeline steps).
- `kling-video-v2_5` (image_to_video): inputs `first_image` (required) +
  `tail_image` (optional) — both MUST be URLs returned by the upload flow, no local
  paths or external URLs. Arguments: `duration` ("5"/"10", default "5"),
  `enable_audio` (default **"true"** — always pass "false", voice comes from
  ElevenLabs), `resolution` (free tier: "720p" only), optional `prompt`.
- v2.6 requires 1080p for tail_image; v3_0_turbo has NO tail_image. v2_5 stays the
  transition model (as per CLAUDE.md hard rules).
- `image_to_video` returns a `generation_id` immediately; poll `query_tasks`
  with it. Successful result contains video + cover URLs. **URLs expire in 24h** —
  download promptly.
- Credits: `query_membership_and_credits` → `availableRemainCredits`.

## Procedure (per job)

0. `query_membership_and_credits` — abort if credits are insufficient
   (~N-1 clip generations needed).
1. For each `img_i.png` (skip if its clip already exists AND its URL is cached):
   a. MCP `file_upload` {filename, contentType: "image/png", size} → ticket + upload_url
   b. `npx tsx src/kling-upload.ts jobs/<job_id>/images/img_i.png <upload_url> <ticket>`
      → hosted URL. Record it in `jobs/<job_id>/kling.json` (`{"uploads": {"img_1.png": "<url>"}}`)
      so re-runs reuse URLs instead of re-uploading.
2. For each consecutive pair (i, i+1), skip if `jobs/<job_id>/clips/clip_i.mp4` exists:
   MCP `image_to_video`:
   - model: `kling-video-v2_5`
   - inputs: `[{name: "first_image", inputType: "URL", url: URL[i]}, {name: "tail_image", inputType: "URL", url: URL[i+1]}]`
   - arguments: `[{name: "duration", value: "5"}, {name: "enable_audio", value: "false"}]`
   → record `generation_id` in `kling.json` (`{"clips": {"clip_1": {"generation_id": "..."}}}`).
3. Poll MCP `query_tasks` {generationId} until done (space polls ~30s apart;
   generation typically takes minutes). On failure, relay the exact error and STOP —
   ask before resubmitting (credits!).
4. `npx tsx src/download.ts <video_url> jobs/<job_id>/clips/clip_i.mp4`

Idempotency lives in three places: uploads cached in `kling.json`, generation ids
recorded before polling, and `download.ts` skipping existing files. A crash after
clip 6 must not regenerate clips 1-5.

## Phase 2 acceptance test (run ONCE, minimum spend)

2 images → 1 clip. Upload both, one `image_to_video` call, poll, download,
eyeball the transition smoothness before scaling to N.
