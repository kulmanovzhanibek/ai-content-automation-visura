import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { z } from "zod";
import { Captions } from "./Captions";
import "@fontsource/montserrat/800.css";

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
  // optional CTA text shown on a pill under the outro video
  outroText: z.string().nullable().default(null),
  // optional big timed labels (e.g. BEFORE / AFTER) rendered directly by time,
  // bypassing createTikTokStyleCaptions (which merges long labels into one page)
  bigLabels: z
    .array(z.object({ text: z.string(), fromMs: z.number(), toMs: z.number() }))
    .default([]),
});

export type ReelProps = z.infer<typeof reelSchema>;

/** Appended outro video, letterboxed on a blurred fill so a narrow phone
 *  recording has no black bars. Falls back to a dark background. When `text`
 *  is set, the video is lifted to leave a bottom band for a CTA pill. */
const OutroVideo: React.FC<{ src: string; bgSrc: string | null; text: string | null }> = ({
  src,
  bgSrc,
  text,
}) => (
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
          filter: "blur(48px) brightness(0.5)",
          transform: "scale(1.15)",
          zIndex: 0,
        }}
      />
    ) : null}
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: text ? 300 : 0, zIndex: 1 }}>
      <OffthreadVideo
        src={staticFile(src)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
    {text ? (
      <AbsoluteFill
        style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120, zIndex: 2 }}
      >
        <div
          style={{
            maxWidth: "88%",
            background: "#ffffff",
            borderRadius: 30,
            padding: "26px 44px",
            boxShadow: "0 0 0 10px rgba(255,255,255,0.25)",
            textAlign: "center",
            fontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
            fontWeight: 800,
            color: "#0d0d0d",
            fontSize: 46,
            lineHeight: 1.22,
            letterSpacing: "-0.5px",
          }}
        >
          {text}
        </div>
      </AbsoluteFill>
    ) : null}
  </AbsoluteFill>
);

/** Big timed labels (BEFORE / AFTER) — plain time-gated overlay, one at a time. */
const BigLabels: React.FC<{ labels: { text: string; fromMs: number; toMs: number }[] }> = ({
  labels,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const timeMs = (frame / fps) * 1000;
  const active = labels.find((l) => timeMs >= l.fromMs && timeMs < l.toMs);
  if (!active) return null;
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div
        style={{
          fontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
          fontWeight: 800,
          fontSize: 150,
          letterSpacing: "2px",
          color: "white",
          WebkitTextStroke: "9px black",
          paintOrder: "stroke fill",
          textShadow: "0 6px 26px rgba(0,0,0,0.5)",
          textTransform: "uppercase",
        }}
      >
        {active.text}
      </div>
    </AbsoluteFill>
  );
};

export const Reel: React.FC<ReelProps> = ({
  clips,
  voice,
  captions,
  captionStyle,
  outroVideo,
  outroVideoBg,
  outroDurationInFrames,
  outroText,
  bigLabels,
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
            <OutroVideo src={outroVideo} bgSrc={outroVideoBg ?? null} text={outroText ?? null} />
          </Series.Sequence>
        ) : null}
      </Series>
      {voice ? <Audio src={staticFile(voice)} /> : null}
      {captions.length > 0 ? <Captions captions={captions} styleOverrides={captionStyle} /> : null}
      {bigLabels.length > 0 ? <BigLabels labels={bigLabels} /> : null}
    </AbsoluteFill>
  );
};
