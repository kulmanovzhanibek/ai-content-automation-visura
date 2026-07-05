import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";

/**
 * ALL caption styling lives here — tweak this one object.
 */
export const CAPTION_STYLE = {
  // page grouping: how many ms of tokens are combined onto one caption page
  combineTokensWithinMilliseconds: 1200,
  // typography
  fontFamily: "Arial, Helvetica, sans-serif",
  fontSize: 72,
  fontWeight: 900 as const,
  textTransform: "uppercase" as const,
  color: "white",
  highlightColor: "#3CE55E", // active (currently spoken) word
  strokeColor: "black",
  strokeWidth: 10,
  // placement (relative to 1080x1920 frame)
  bottomOffset: 560, // px from the bottom
  maxWidthPercent: 85,
  lineHeight: 1.15,
} as const;

export const Captions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: CAPTION_STYLE.combineTokensWithinMilliseconds,
      }),
    [captions]
  );

  const page = useMemo(() => {
    let active = null;
    for (const p of pages) {
      if (timeMs >= p.startMs) active = p;
    }
    // hide the page once its last token has long finished
    if (active) {
      const lastToken = active.tokens[active.tokens.length - 1];
      if (lastToken && timeMs > lastToken.toMs + 300) return null;
    }
    return active;
  }, [pages, timeMs]);

  if (!page) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: CAPTION_STYLE.bottomOffset,
      }}
    >
      <div
        style={{
          maxWidth: `${CAPTION_STYLE.maxWidthPercent}%`,
          textAlign: "center",
          fontFamily: CAPTION_STYLE.fontFamily,
          fontSize: CAPTION_STYLE.fontSize,
          fontWeight: CAPTION_STYLE.fontWeight,
          textTransform: CAPTION_STYLE.textTransform,
          lineHeight: CAPTION_STYLE.lineHeight,
          WebkitTextStroke: `${CAPTION_STYLE.strokeWidth}px ${CAPTION_STYLE.strokeColor}`,
          paintOrder: "stroke fill",
        }}
      >
        {page.tokens.map((token, i) => {
          const active = timeMs >= token.fromMs && timeMs < token.toMs;
          return (
            <span
              key={i}
              style={{ color: active ? CAPTION_STYLE.highlightColor : CAPTION_STYLE.color }}
            >
              {token.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
