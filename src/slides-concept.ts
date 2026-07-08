/**
 * slides-concept: brief → jobs/<job_id>/slides.json (a TikTok photo-slideshow
 * concept — 5 slides of hook + text + background image_prompt).
 *
 * Ported from the SlideLab web tool into this repo's CLI idiom. A viral
 * slideshow = a hook slide + pain → insight → solution + a soft native CTA,
 * each slide a vertical photo with big text on top. Backgrounds are generated
 * later by gen-images from the per-slide image_prompt; slides are rendered to
 * PNG by render-slides.
 *
 * Concept generation uses Claude (Anthropic Messages API) when ANTHROPIC_API_KEY
 * is set, otherwise falls back to offline template concepts. It writes THREE
 * concepts (different hook formats) to concepts.json and the selected one
 * (default #1, or --format N) to slides.json.
 *
 * Usage:
 *   npx tsx src/slides-concept.ts <job_id> --niche "..." --app "..." --pain "..." \
 *       [--lang ru|en] [--audience "..."] [--features "..."] [--format 1|2|3]
 */
import "dotenv/config";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fetch } from "./proxy.ts";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";

const HOOK_FORMATS = [
  "POV / от первого лица",
  "негатив или шок → решение",
  "storytime / listicle («3 вещи которые…»)",
];

export interface Brief {
  niche: string;
  app: string;
  pain: string;
  lang: "ru" | "en";
  audience?: string;
  features?: string;
}

export interface ConceptSlide {
  text: string;
  image_prompt: string;
  show_app?: boolean;
}

export interface Concept {
  title: string;
  format: string;
  caption?: string;
  hashtags?: string[];
  slides: ConceptSlide[];
}

function conceptPrompt(brief: Brief, formatHint: string): string {
  const extra = [
    brief.audience?.trim() && `- Целевая аудитория: ${brief.audience.trim()}`,
    brief.features?.trim() && `- Ключевые фишки приложения: ${brief.features.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const imagePromptRules = `Фоны серии должны выглядеть как снятые за один раз одним человеком. Сначала мысленно выбери ЕДИНЫЙ сеттинг: один персонаж (пол/возраст под аудиторию), одно место, одно время суток, съёмка на iPhone. Потом напиши для каждого слайда image_prompt на английском (до 30 слов) в ЭТОМ сеттинге — разные моменты и ракурсы одной сцены, по смыслу слайда. Стиль каждого: photorealistic candid amateur iPhone photo, vertical 9:16, UGC aesthetic, imperfect natural lighting, no text in image.`;

  return `Ты — креатор виральных TikTok photo-slideshows для продвижения мобильных приложений (серия вертикальных фото с крупным текстом поверх). Твои слайдшоу выглядят как честный пост реального человека, а не реклама.

Данные:
- Ниша: ${brief.niche}
- Приложение: ${brief.app}
- Боль, которую решает: ${brief.pain}
${extra ? extra + "\n" : ""}- Язык текста на слайдах и caption: ${brief.lang === "en" ? "английский (US/UK аудитория)" : "русский"}

Сгенерируй ОДИН концепт слайдшоу из ровно 5 слайдов в формате: ${formatHint}.

Правила виральности (обязательны):
1. Слайд 1 = хук: максимум 10 слов, читается за секунду, создаёт curiosity gap — недосказанность, из-за которой невозможно не свайпнуть.
2. Слайды 2–4 = боль → инсайт → как решает приложение. Каждый слайд обрывается так, что тянет свайпнуть дальше (мини-клиффхэнгер).
3. Слайд 5 = мягкий нативный CTA: название приложения подаётся как личная находка («оставлю тут», «пока не завирусилось»), никаких «скачай сейчас!!!».
4. Пиши как реальный человек в TikTok: разговорно, lowercase допустим, конкретика вместо общих слов, без канцелярита, без эмодзи и хэштегов в тексте слайдов.
5. Один слайд (обычно 4-й, где показываешь решение) пометь "show_app": true — туда автор вставит реальный скриншот приложения.

${imagePromptRules}

Также напиши caption для поста (1–2 разговорных предложения с лёгкой интригой, можно упомянуть, что название/ссылка в профиле) и 4–6 хэштегов: 2–3 нишевых, 1–2 широких виральных, на языке аудитории.

Ответь ТОЛЬКО валидным JSON без markdown:
{"title":"короткое название концепта на русском","format":"тип хука","caption":"...","hashtags":["#...","#..."],"slides":[{"text":"...","image_prompt":"...","show_app":false}]}`;
}

function parseConceptJSON(text: string): Concept {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("model returned non-JSON");
  const parsed = JSON.parse(clean.slice(start, end + 1));
  if (!parsed?.slides?.length) throw new Error("no slides in response");
  return parsed as Concept;
}

async function generateOneConcept(
  apiKey: string,
  brief: Brief,
  formatHint: string
): Promise<Concept> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content: conceptPrompt(brief, formatHint) }],
    }),
  });
  const data: any = await res.json().catch(() => {
    throw new Error(`API response unreadable (HTTP ${res.status})`);
  });
  if (data.error) throw new Error(data.error.message || `API error (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = (data.content || [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
  return parseConceptJSON(text);
}

/** Offline template concept when no ANTHROPIC_API_KEY — a placeholder to edit. */
function fallbackConcept(brief: Brief, formatHint: string): Concept {
  const appName = (brief.app.split(/[,—–:-]/)[0] || brief.app).trim() || "приложение";
  const pain = (brief.pain || "").trim().replace(/[.!]+$/, "");
  const en = brief.lang === "en";
  const bg = (i: number) =>
    "photorealistic candid amateur iPhone photo, vertical 9:16, UGC aesthetic, imperfect natural lighting, no text in image, scene " +
    (i + 1);
  const slides = en
    ? [
        `POV: you finally fixed ${pain}`,
        `${pain} — sound familiar?`,
        `turns out the fix was stupidly simple`,
        `${appName} just does it for you`,
        `it's called ${appName} — leaving it here before it blows up`,
      ]
    : [
        `POV: ты наконец решил проблему — ${pain}`,
        `${pain} — знакомо?`,
        `оказалось, решение до смешного простое`,
        `${appName} просто делает это за тебя`,
        `называется ${appName}, оставлю тут, пока не завирусилось`,
      ];
  return {
    title: `${formatHint} (шаблон)`,
    format: formatHint,
    caption: en
      ? `honestly this helped more than any advice. name's in the last slide (and bio)`
      : `честно, помогло больше любых советов. название на последнем слайде (и в профиле)`,
    hashtags: en
      ? ["#fyp", "#app", "#lifehack"]
      : ["#рек", "#приложения", "#лайфхак"],
    slides: slides.map((text, i) => ({ text, image_prompt: bg(i), show_app: i === 3 })),
  };
}

export async function slidesConcept(jobId: string, brief: Brief, selectFormat = 1): Promise<string> {
  const jobDir = path.join("jobs", jobId);
  mkdirSync(jobDir, { recursive: true });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  let concepts: Concept[];
  if (apiKey) {
    const results = await Promise.allSettled(
      HOOK_FORMATS.map((f) => generateOneConcept(apiKey, brief, f))
    );
    concepts = results
      .filter((r): r is PromiseFulfilledResult<Concept> => r.status === "fulfilled")
      .map((r) => r.value);
    if (concepts.length === 0) {
      const err = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
      console.error(
        `[slides-concept] all API calls failed (${err?.reason?.message ?? "?"}); using offline fallback`
      );
      concepts = HOOK_FORMATS.map((f) => fallbackConcept(brief, f));
    } else {
      console.log(`[slides-concept] Claude generated ${concepts.length}/3 concept(s) via ${MODEL}`);
    }
  } else {
    console.log("[slides-concept] no ANTHROPIC_API_KEY — offline fallback concepts");
    concepts = HOOK_FORMATS.map((f) => fallbackConcept(brief, f));
  }

  writeFileSync(path.join(jobDir, "concepts.json"), JSON.stringify({ brief, concepts }, null, 2));
  const idx = Math.min(Math.max(1, selectFormat), concepts.length) - 1;
  const chosen = concepts[idx];
  writeFileSync(path.join(jobDir, "slides.json"), JSON.stringify(chosen, null, 2));
  console.log(
    `[slides-concept] wrote concepts.json (${concepts.length}) and slides.json ` +
      `("${chosen.title}", ${chosen.slides.length} slides) → jobs/${jobId}/`
  );
  return path.join(jobDir, "slides.json");
}

// --- CLI ---
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const jobId = args[0];
  const val = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (!jobId || jobId.startsWith("--")) {
    console.log(
      'Usage: tsx src/slides-concept.ts <job_id> --niche "..." --app "..." --pain "..." [--lang ru|en] [--audience "..."] [--features "..."] [--format 1|2|3]'
    );
    process.exit(1);
  }
  const brief: Brief = {
    niche: val("--niche") ?? "",
    app: val("--app") ?? "",
    pain: val("--pain") ?? "",
    lang: val("--lang") === "en" ? "en" : "ru",
    audience: val("--audience"),
    features: val("--features"),
  };
  if (!brief.niche || !brief.app || !brief.pain) {
    console.error("[slides-concept] --niche, --app and --pain are required");
    process.exit(1);
  }
  const selectFormat = Number(val("--format") ?? "1");
  slidesConcept(jobId, brief, selectFormat).catch((e) => {
    console.error("[slides-concept] FAILED:", (e as Error).message);
    process.exit(1);
  });
}
