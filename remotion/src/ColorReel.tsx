import React from "react";
import { AbsoluteFill, Audio, Img, OffthreadVideo, Series, staticFile } from "remotion";
import { z } from "zod";
import { Captions } from "./Captions";
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
  // the CTA payoff). Shown letterboxed (objectFit contain).
  outroVideo: z.string().nullable().default(null),
  // optional SECOND copy of the outro video used as a blurred full-bleed fill
  // behind the letterboxed one (must be a different file path — Remotion
  // dedupes two OffthreadVideo with an identical src). Falls back to a dark
  // background when null.
  outroVideoBg: z.string().nullable().default(null),
  outroDurationInFrames: z.number().default(0),
  // optional burned-in subtitles (word or phrase tokens), same shape as Reel
  captions: z
    .array(
      z.object({
        text: z.string(),
        startMs: z.number(),
        endMs: z.number(),
        timestampMs: z.number().nullable(),
        confidence: z.number().nullable(),
      })
    )
    .default([]),
  captionStyle: z
    .object({
      combineTokensWithinMilliseconds: z.number().optional(),
      fontSize: z.number().optional(),
      color: z.string().optional(),
      strokeWidth: z.number().optional(),
      bottomOffset: z.number().optional(),
      maxWidthPercent: z.number().optional(),
    })
    .optional(),
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
 *  blurred fill (a second copy of the file) so a narrow phone recording has no
 *  black bars. Falls back to a dark background when no bg copy is given. */
const OutroVideo: React.FC<{ src: string; bgSrc: string | null }> = ({ src, bgSrc }) => (
  <AbsoluteFill style={{ backgroundColor: "#141416" }}>
    {bgSrc ? (
      <OffthreadVideo
        src={staticFile(bgSrc)}
        muted
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(48px) brightness(0.55)",
          transform: "scale(1.15)",
          zIndex: 0,
        }}
      />
    ) : null}
    <OffthreadVideo
      src={staticFile(src)}
      muted
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        zIndex: 1,
      }}
    />
  </AbsoluteFill>
);

export const ColorReel: React.FC<ColorReelProps> = ({
  frames,
  footer,
  voice,
  outroVideo,
  outroVideoBg,
  outroDurationInFrames,
  captions,
  captionStyle,
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
            <OutroVideo src={outroVideo} bgSrc={outroVideoBg ?? null} />
          </Series.Sequence>
        ) : null}
      </Series>
      {footer ? <Footer text={footer} /> : null}
      {voice ? <Audio src={staticFile(voice)} /> : null}
      {captions.length > 0 ? <Captions captions={captions} styleOverrides={captionStyle} /> : null}
    </AbsoluteFill>
  );
};
