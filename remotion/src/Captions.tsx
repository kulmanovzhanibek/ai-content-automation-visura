import React, { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import "@fontsource/montserrat/700.css";

/**
 * ALL caption styling lives here — tweak this one object.
 * Style: classic TikTok captions — bold white, black outline, sentence case,
 * NO per-word highlight.
 */
export const CAPTION_STYLE = {
  // page grouping: how many ms of tokens are combined onto one caption page
  combineTokensWithinMilliseconds: 1400,
  // typography
  fontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
  fontSize: 64,
  fontWeight: 700 as const,
  color: "white",
  strokeColor: "black",
  strokeWidth: 8,
  shadow: "0 4px 16px rgba(0,0,0,0.45)",
  // placement (relative to 1080x1920 frame)
  bottomOffset: 780, // px from the bottom (reference style sits near center)
  maxWidthPercent: 82,
  lineHeight: 1.25,
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
          lineHeight: CAPTION_STYLE.lineHeight,
          color: CAPTION_STYLE.color,
          WebkitTextStroke: `${CAPTION_STYLE.strokeWidth}px ${CAPTION_STYLE.strokeColor}`,
          paintOrder: "stroke fill",
          textShadow: CAPTION_STYLE.shadow,
        }}
      >
        {page.text}
      </div>
    </AbsoluteFill>
  );
};
