# Telegram trigger — headless /reel from a bot command (Phase 5)

Goal: message the bot → VPS runs the pipeline headless → finished reel arrives in
the Telegram channel (pipeline step 7 sends it as an uncompressed document).

This reuses the existing "Telegram → Claude Code on VPS" bot setup — only the
command hook is described here, not the bot itself.

## One-time VPS setup

1. Clone the repo, `npm install`, fill `.env` (all 5 keys from .env.example).
2. Connect the Kling MCP to Claude Code (user scope — available in every run):
   ```bash
   claude mcp add --transport http kling https://kling.ai/mcp --scope user
   claude mcp login kling
   ```
   On a headless VPS `claude mcp login` prints an auth link: open it on your
   laptop, log in to Kling, paste the full redirect URL back into the terminal
   (connect over `ssh -t` so the paste step has an interactive TTY).
   The OAuth token is stored under `~/.claude` and persists for headless runs —
   no re-login needed until it's revoked.
   Verify: `claude mcp list` shows kling as authenticated.
3. Smoke-test once interactively: `claude` → `/reel test topic --images 2`.

## The command hook

Bot command handler (e.g. `/reel <topic>` in your bot) executes:

```bash
cd /path/to/reels-machine && \
claude -p "/reel ${TOPIC} --preset ${PRESET:-default}" \
  --permission-mode acceptEdits \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep,mcp__kling__*" \
  >> logs/reel-$(date +%Y%m%d-%H%M%S).log 2>&1
```

Notes:
- `claude -p` = non-interactive (headless) run; the `/reel` skill loads from
  `.claude/commands/reel.md` in the repo.
- Run it under the same UNIX user that did `claude mcp login kling`, or the MCP
  OAuth token won't be found.
- The pipeline is idempotent per job_id: if a run dies mid-way, firing the same
  topic again the same day resumes the job instead of re-spending Kling credits.
- Delivery to the channel is pipeline step 7 (`src/telegram.ts`, sendDocument —
  no compression). The bot doesn't need to send anything itself.
- Guard the bot command with a user-id allowlist — each run costs Kling credits.

## Presets

`presets/<name>.json` — one preset per content type:
`language`, `images_default`, `gen_images_mode` (`--base-first` for same-space
ideas reels), `image_style_preamble`, `script_structure`,
`transition_prompt_template` ({WHAT_CHANGES} placeholder), `caption_style`
(overrides remotion caption defaults via props), `telegram_caption`,
optional `voice_id` (falls back to ELEVENLABS_VOICE_ID from .env).

Available now: `default` (independent keyframes, smooth morph),
`space-ideas` (one space, N furnishing ideas, stop-motion, English hook).

Add a new content type = add one JSON file, no code changes.
