import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Series, staticFile } from "remotion";
import { z } from "zod";
import "@fontsource/montserrat/800.css";
import "@fontsource/montserrat/700.css";

export const FPS = 30;

/**
 * ColorReel: static-frame slideshow with a standing text pill on each frame.
 *
 * Replicates the "how wall color changes the same room" reel format: one
 * "before" frame with a title, then N frames of the SAME room in different
 * colors, each labelled with the colour name on a white rounded pill.
 * Hard cuts, no motion, no audio — the frame just stands with its text.
 * Per-frame durations are arbitrary (title frame usually a touch longer).
 */
export const colorReelSchema = z.object({
  frames: z.array(
    z.object({
      src: z.string(),
      label: z.string(),
      kind: z.enum(["title", "color"]).default("color"),
      durationInFrames: z.number(),
    })
  ),
  // optional CTA plaque shown on every frame near the bottom (dark translucent
  // rounded box, white bold text). Use "\n" to split into lines.
  footer: z.string().nullable().default(null),
  // optional voiceover played across the whole reel (styles + outro)
  voice: z.string().nullable().default(null),
  // optional video appended after the frames (e.g. an app screen recording as
  // the CTA payoff). Shown letterboxed over a blurred fill of itself.
  outroVideo: z.string().nullable().default(null),
  outroDurationInFrames: z.number().default(0),
});

export type ColorReelProps = z.infer<typeof colorReelSchema>;

/** The white rounded "sticker" pill, Instagram/TikTok text-sticker style. */
const Pill: React.FC<{ label: string; kind: "title" | "color" }> = ({ label, kind }) => {
  const isTitle = kind === "title";
  return (
    <AbsoluteFill
      style={{
        justifyContent: "flex-start",
        alignItems: "center",
        // title sits around the upper-middle, colour labels lower-centre
        paddingTop: isTitle ? 690 : 1170,
      }}
    >
      <div
        style={{
          maxWidth: isTitle ? "78%" : "82%",
          background: "#ffffff",
          borderRadius: 46,
          padding: isTitle ? "40px 52px" : "28px 60px",
          // soft translucent halo around the pill, like the reference stickers
          boxShadow: "0 0 0 12px rgba(255,255,255,0.30)",
          textAlign: "center",
          fontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
          fontWeight: 800,
          color: "#0d0d0d",
          fontSize: isTitle ? 74 : 96,
          lineHeight: 1.14,
          letterSpacing: "-0.5px",
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

/** Standing dark CTA plaque near the bottom, shown on every frame. */
const Footer: React.FC<{ text: string }> = ({ text }) => (
  <AbsoluteFill
    style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 430 }}
  >
    <div
      style={{
        maxWidth: "90%",
        background: "rgba(20,20,22,0.5)",
        borderRadius: 22,
        padding: "22px 46px",
        textAlign: "center",
        whiteSpace: "pre-line",
        fontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
        fontWeight: 700,
        color: "#ffffff",
        fontSize: 34,
        lineHeight: 1.4,
        textShadow: "0 2px 10px rgba(0,0,0,0.45)",
      }}
    >
      {text}
    </div>
  </AbsoluteFill>
);

/** The appended outro video (e.g. app screen recording), letterboxed on a
 *  blurred fill of itself so a narrow phone recording has no black bars. */
const OutroVideo: React.FC<{ src: string }> = ({ src }) => (
  <AbsoluteFill style={{ backgroundColor: "black" }}>
    <OffthreadVideo
      src={staticFile(src)}
      muted
      style={{
        position: "absolute",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        filter: "blur(48px) brightness(0.6)",
        transform: "scale(1.15)",
      }}
    />
    <OffthreadVideo
      src={staticFile(src)}
      muted
      style={{ width: "100%", height: "100%", objectFit: "contain" }}
    />
  </AbsoluteFill>
);

export const ColorReel: React.FC<ColorReelProps> = ({
  frames,
  footer,
  voice,
  outroVideo,
  outroDurationInFrames,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {frames.map((f, i) => (
          <Series.Sequence key={i} durationInFrames={Math.max(1, f.durationInFrames)}>
            <AbsoluteFill style={{ backgroundColor: "black" }}>
              <Img
                src={staticFile(f.src)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <Pill label={f.label} kind={f.kind} />
            </AbsoluteFill>
          </Series.Sequence>
        ))}
        {outroVideo && outroDurationInFrames > 0 ? (
          <Series.Sequence durationInFrames={outroDurationInFrames}>
            <OutroVideo src={outroVideo} />
          </Series.Sequence>
        ) : null}
      </Series>
      {footer ? <Footer text={footer} /> : null}
      {voice ? <Audio src={staticFile(voice)} /> : null}
    </AbsoluteFill>
  );
};
