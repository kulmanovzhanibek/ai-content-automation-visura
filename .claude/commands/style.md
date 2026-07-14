---
description: WITHOUT Kling — "Pick your style" / "Выбери свой стиль". One room, N interior styles as fast pill-labelled cuts + voiceover, optional app-recording outro → mp4 to Telegram. 0 Kling credits.
argument-hint: <room> [--styles N] [--lang en|ru]
---

Produce ONE finished **style-picker reel** (same room shown in N interior styles) for:
**$ARGUMENTS**

Uses the **ColorReel** composition (static frames + standing pills + hard cuts) with
a voiceover and an optional app outro — NOT Kling. Follow `CLAUDE.md`
(**Composition inputs & session-hardened rules**, Halal, Viral direction).
Everything under `jobs/<job_id>/`. Idempotent. **Image-approval gate:** show images,
wait for "go".

Default = raw "before" shell + 7 styles (Minimalism, Modern, Scandinavian, Japandi,
Industrial/Loft, Mid-century, Coastal — swap any). `job_id` = `style-picker-<slug>-<date>`.

1. **Prompts** → `jobs/<job_id>/script.json` `{ "image_prompts": [...] }`, generated
   `--base-first`: prompt 1 = raw/empty room (title frame); every other prompt = the
   SAME room fully furnished in one style. Demand a **COMPLETE, fully-furnished,
   LIVED-IN** room (sofa, armchairs, TV/media, shelves, rug, curtains, plants, art,
   lamps) — not sparse; **finished ceiling/floor** (no exposed concrete/pipes/debris)
   except Loft; **solid walls, no doorway/openings**. Keep architecture/window/camera
   identical.
2. **Images** — `npx tsx src/gen-images.ts <job_id> --base-first "<raw>" "<style1>" ...`
   (retry on 429). `npx tsx src/telegram.ts --images <job_id>`. **Wait for "go".**
3. **Voice** — hook "Pick your style" + each style NAME with `<break>` pacing, ending
   with a CTA line (spoken CTA is OK here since the outro plays under it). 
   `npx tsx src/tts.ts <job_id> "<script>"`. Read phrase starts:
   `npx tsx src/captions.ts <job_id> --phrases --gap 400` then inspect timestamps.
4. **App outro** — transcode the recording once (see CLAUDE.md "App outro asset"),
   copy `app.mp4`+`app-bg.mp4` into the job.
5. **Plan** → `jobs/<job_id>/color-plan.json`: `fps`, `voice:"voice.mp3"`,
   `outroVideo:"app.mp4"`, `outroVideoBg:"app-bg.mp4"`, `outroSeconds`, and `frames`
   = title frame ("Pick your style", `kind:"title"`, ~2.2s) + one `kind:"color"`
   frame per style (`label`=style name). **Sync each frame's `seconds` to the voice**
   so each style NAME lands on its frame (use the phrase starts from step 3: frame i
   spans from name i's start to name i+1's start).
6. **Render** — `npx tsx src/build-color-props.ts <job_id>` →
   `npx remotion render ColorReel jobs/<job_id>/out.mp4 --props=jobs/<job_id>/props-color.json`.
7. **Telegram as file** — `npx tsx src/telegram.ts jobs/<job_id>/out.mp4 "<caption>"`
   and send `out.mp4` to the user.

**Final report:** job id, N styles, voice duration, total length, steps skipped.
