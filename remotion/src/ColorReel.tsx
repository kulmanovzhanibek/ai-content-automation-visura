import React from "react";
import { AbsoluteFill, Img, Series, staticFile } from "remotion";
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

export const ColorReel: React.FC<ColorReelProps> = ({ frames }) => {
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
      </Series>
    </AbsoluteFill>
  );
};
