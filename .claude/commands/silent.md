---
description: WITHOUT voice — silent video (no audio). Color-swap ColorReel (same room, N colors, standing text pills) or a silent photo montage → mp4, sent to Telegram as a file. 0 credits.
argument-hint: <idea> [--images N] [--transition wipe|slide|fade]
---

Produce ONE finished **silent video** (no voiceover) for: **$ARGUMENTS**

Follow the **Viral content direction** rules in `CLAUDE.md` and the Hard rules.
Everything under `jobs/<job_id>/`. Every step IDEMPOTENT. **Image-approval gate:**
after images, STOP, show them to the user, wait for "go" before rendering.

## Pick the silent format from the idea
- **Color-swap** ("how wall/cabinet color changes the same room", palette ideas) →
  **ColorReel** (below). This is the usual one.
- **General silent montage** (just photos with text, no color theme) → silent
  Slideshow (`build-slideshow-props --no-voice --no-captions` →
  `remotion render Slideshow`).

## ColorReel (color-swap) — default
1. **Prompts** → `jobs/<job_id>/script.json` `{ "image_prompts": [...] }`: prompt 1 =
   base room OR a "before" concrete shell; then N−1 color edits. ALWAYS
   `--base-first` so architecture/furniture/camera stay identical and only the
   color changes.
2. `npx tsx src/gen-images.ts <job_id> --base-first "<base>" "<edit 1>" ...`.
   **Show images, wait for "go".**
3. **Plan** → `jobs/<job_id>/color-plan.json`: ordered frames
   `{ "img", "label", "kind", "seconds" }` — a `title` "before" frame (~2s) then the
   color frames (~1.5s each), labels = short color names, on-screen text per the
   viral rules. OPTIONAL top-level keys: `footer` (dark CTA plaque on every frame),
   `voice`+`outroVideo`/`outroVideoBg`/`outroSeconds` (add a voiceover and/or an
   app-recording outro — see CLAUDE.md Composition inputs). For a "same room in N
   interior STYLES with voiceover" reel use the dedicated `/style` command.
4. `npx tsx src/build-color-props.ts <job_id>` →
   `npx remotion render ColorReel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props-color.json`.
5. **Telegram as file** — `npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"`
   and send `out.mp4` to the user in chat.

**Final report:** job id, format (ColorReel / silent montage), N images, total
length, steps skipped.
