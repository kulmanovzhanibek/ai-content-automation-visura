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
  // optional small persistent CTA footer (e.g. "comment X for the link"),
  // shown low on the frame so it's visible but never covers the scene or captions
  footer: z.string().nullable().optional(),
  // px from the bottom of the 1920-tall frame for the footer. Kept high enough
  // by default to clear the Instagram/TikTok bottom UI (username, music, caption).
  footerBottomOffset: z.number().nullable().optional(),
});

export type ReelProps = z.infer<typeof reelSchema>;

export const Reel: React.FC<ReelProps> = ({
  clips,
  voice,
  captions,
  captionStyle,
  footer,
  footerBottomOffset,
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
      </Series>
      {voice ? <Audio src={staticFile(voice)} /> : null}
      {captions.length > 0 ? <Captions captions={captions} styleOverrides={captionStyle} /> : null}
      {footer ? <Footer text={footer} bottomOffset={footerBottomOffset ?? undefined} /> : null}
    </AbsoluteFill>
  );
};

/**
 * Small persistent CTA footer pinned in the lower part of the frame. Sits well
 * below the captions (which live near center via bottomOffset) yet high enough
 * to clear the Instagram/TikTok bottom UI (username, music, caption) so it reads
 * clearly without being covered. A soft translucent pill keeps it legible over
 * any background. Each line of `text` is split on \n.
 */
const FOOTER_BOTTOM_OFFSET = 340;
const Footer: React.FC<{ text: string; bottomOffset?: number }> = ({ text, bottomOffset }) => (
  <AbsoluteFill
    style={{
      justifyContent: "flex-end",
      alignItems: "center",
      paddingBottom: bottomOffset ?? FOOTER_BOTTOM_OFFSET,
    }}
  >
    <div
      style={{
        maxWidth: "88%",
        textAlign: "center",
        fontFamily: "'Montserrat', Arial, Helvetica, sans-serif",
        fontSize: 34,
        fontWeight: 600,
        lineHeight: 1.32,
        color: "white",
        WebkitTextStroke: "3px black",
        paintOrder: "stroke fill",
        textShadow: "0 2px 10px rgba(0,0,0,0.55)",
        background: "rgba(0,0,0,0.32)",
        borderRadius: 18,
        padding: "12px 22px",
      }}
    >
      {text.split("\n").map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  </AbsoluteFill>
);
