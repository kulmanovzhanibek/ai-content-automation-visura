import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Series, staticFile } from "remotion";
import { z } from "zod";
import { Captions } from "./Captions";

export const FPS = 30;
export const CLIP_DURATION_S = 5; // hard rule: every Kling transition clip is 5s

export const reelSchema = z.object({
  // paths relative to the public dir (jobs/), e.g. "test-kling/clips/clip_1.mp4"
  clips: z.array(z.string()),
  voice: z.string().nullable(),
  captions: z.array(
    z.object({
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
      timestampMs: z.number().nullable(),
      confidence: z.number().nullable(),
    })
  ),
  // optional per-preset overrides merged over CAPTION_STYLE
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
  // optional video appended after the clips (e.g. an app screen recording as
  // the CTA payoff), letterboxed over a blurred fill (a separate file copy).
  outroVideo: z.string().nullable().default(null),
  outroVideoBg: z.string().nullable().default(null),
  outroDurationInFrames: z.number().default(0),
});

export type ReelProps = z.infer<typeof reelSchema>;

/** Appended outro video, letterboxed on a blurred fill so a narrow phone
 *  recording has no black bars. Falls back to a dark background. */
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

export const Reel: React.FC<ReelProps> = ({
  clips,
  voice,
  captions,
  captionStyle,
  outroVideo,
  outroVideoBg,
  outroDurationInFrames,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Series>
        {clips.map((clip) => (
          <Series.Sequence key={clip} durationInFrames={CLIP_DURATION_S * FPS}>
            <OffthreadVideo
              src={staticFile(clip)}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Series.Sequence>
        ))}
        {outroVideo && outroDurationInFrames > 0 ? (
          <Series.Sequence durationInFrames={outroDurationInFrames}>
            <OutroVideo src={outroVideo} bgSrc={outroVideoBg ?? null} />
          </Series.Sequence>
        ) : null}
      </Series>
      {voice ? <Audio src={staticFile(voice)} /> : null}
      {captions.length > 0 ? <Captions captions={captions} styleOverrides={captionStyle} /> : null}
    </AbsoluteFill>
  );
};
