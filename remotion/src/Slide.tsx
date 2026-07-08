import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { z } from "zod";
import "@fontsource/montserrat/800.css";

/**
 * Slide: one still frame of a TikTok photo-slideshow — a vertical photo
 * background with big text on top, in the classic per-line plaque style.
 * Rendered to PNG one slide at a time by render-slides (via `remotion still`),
 * matching the SlideLab export (1080x1920 carousel for TikTok).
 *
 * textStyle: white plaque / black plaque / plain (shadowed, no box).
 * position:  top / center / bottom.
 * bg: a staticFile-relative image path ("<job>/images/img_N.png"); when null a
 *     dark gradient is drawn instead.
 */
export const slideSchema = z.object({
  bg: z.string().nullable(),
  text: z.string(),
  textStyle: z.enum(["white", "black", "plain"]).default("white"),
  position: z.enum(["top", "center", "bottom"]).default("center"),
});

export type SlideProps = z.infer<typeof slideSchema>;

const STYLES = {
  white: { box: "#ffffff", color: "#0d0d0d" },
  black: { box: "rgba(0,0,0,0.85)", color: "#ffffff" },
  plain: { box: null as string | null, color: "#ffffff" },
};

export const Slide: React.FC<SlideProps> = ({ bg, text, textStyle, position }) => {
  const s = STYLES[textStyle] ?? STYLES.white;
  const justify =
    position === "top" ? "flex-start" : position === "bottom" ? "flex-end" : "center";
  const padTop = position === "top" ? 260 : 0;
  const padBottom = position === "bottom" ? 300 : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#16161d" }}>
      {bg ? (
        <Img
          src={staticFile(bg)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <AbsoluteFill
          style={{ background: "linear-gradient(160deg, #16161d 0%, #3b2a4d 100%)" }}
        />
      )}
      <AbsoluteFill
        style={{
          justifyContent: justify,
          alignItems: "center",
          paddingTop: padTop,
          paddingBottom: padBottom,
          paddingLeft: 90,
          paddingRight: 90,
        }}
      >
        <div
          style={{
            textAlign: "center",
            fontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
            fontWeight: 800,
            fontSize: 72,
            lineHeight: 1.5,
            color: s.color,
            maxWidth: "100%",
          }}
        >
          <span
            style={{
              // per-line plaque: each wrapped line gets its own rounded box
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
              padding: s.box ? "8px 26px" : 0,
              borderRadius: s.box ? 16 : 0,
              background: s.box ?? "transparent",
              textShadow: s.box ? "none" : "0 4px 22px rgba(0,0,0,0.8)",
            } as React.CSSProperties}
          >
            {text}
          </span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
