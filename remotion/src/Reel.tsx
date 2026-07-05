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
});

export type ReelProps = z.infer<typeof reelSchema>;

export const Reel: React.FC<ReelProps> = ({ clips, voice, captions, captionStyle }) => {
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
      </Series>
      {voice ? <Audio src={staticFile(voice)} /> : null}
      {captions.length > 0 ? <Captions captions={captions} styleOverrides={captionStyle} /> : null}
    </AbsoluteFill>
  );
};
