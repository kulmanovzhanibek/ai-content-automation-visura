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

export type CaptionStyleOverrides = Partial<{
  combineTokensWithinMilliseconds: number;
  fontSize: number;
  color: string;
  strokeWidth: number;
  bottomOffset: number;
  maxWidthPercent: number;
}>;

export const Captions: React.FC<{
  captions: Caption[];
  styleOverrides?: CaptionStyleOverrides;
}> = ({ captions, styleOverrides }) => {
  const style = { ...CAPTION_STYLE, ...styleOverrides };
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: style.combineTokensWithinMilliseconds,
      }),
    [captions, style.combineTokensWithinMilliseconds]
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
        paddingBottom: style.bottomOffset,
      }}
    >
      <div
        style={{
          maxWidth: `${style.maxWidthPercent}%`,
          textAlign: "center",
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          color: style.color,
          WebkitTextStroke: `${style.strokeWidth}px ${style.strokeColor}`,
          paintOrder: "stroke fill",
          textShadow: style.shadow,
        }}
      >
        {page.text}
      </div>
    </AbsoluteFill>
  );
};
