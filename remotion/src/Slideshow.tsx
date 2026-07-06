import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  staticFile,
  useCurrentFrame,
  interpolate,
  Easing,
} from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { z } from "zod";
import { Captions } from "./Captions";

export const FPS = 30;

/**
 * Slideshow: a Kling-free montage. Static images with smooth page-slide
 * transitions (alternating direction — like turning pages left→right, then
 * right→left) plus a subtle Ken Burns drift so each frame feels alive. Same
 * voice + TikTok captions as the Reel composition.
 *
 * Total length = images.length * imageDurationInFrames
 *              - (images.length - 1) * transitionDurationInFrames
 * (transitions overlap the adjacent images). build-slideshow-props.ts sizes
 * imageDurationInFrames to fit the voiceover.
 */
export const slideshowSchema = z.object({
  images: z.array(z.string()),
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
  imageDurationInFrames: z.number().default(120),
  transitionDurationInFrames: z.number().default(18),
});

export type SlideshowProps = z.infer<typeof slideshowSchema>;

/** Full-bleed image with a slow zoom so a still doesn't look frozen. */
const KenBurns: React.FC<{ src: string; durationInFrames: number; zoomIn: boolean }> = ({
  src,
  durationInFrames,
  zoomIn,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    zoomIn ? [1.03, 1.1] : [1.1, 1.03],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Img
        src={staticFile(src)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
};

export const Slideshow: React.FC<SlideshowProps> = ({
  images,
  voice,
  captions,
  captionStyle,
  imageDurationInFrames,
  transitionDurationInFrames,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <TransitionSeries>
        {images.flatMap((img, i) => {
          const nodes: React.ReactNode[] = [
            <TransitionSeries.Sequence key={`img-${i}`} durationInFrames={imageDurationInFrames}>
              <KenBurns src={img} durationInFrames={imageDurationInFrames} zoomIn={i % 2 === 0} />
            </TransitionSeries.Sequence>,
          ];
          if (i < images.length - 1) {
            // alternate the slide direction: page turns right→left, then left→right
            const direction = i % 2 === 0 ? "from-right" : "from-left";
            nodes.push(
              <TransitionSeries.Transition
                key={`trans-${i}`}
                presentation={slide({ direction })}
                timing={linearTiming({
                  durationInFrames: transitionDurationInFrames,
                  easing: Easing.inOut(Easing.cubic),
                })}
              />
            );
          }
          return nodes;
        })}
      </TransitionSeries>
      {voice ? <Audio src={staticFile(voice)} /> : null}
      {captions.length > 0 ? <Captions captions={captions} styleOverrides={captionStyle} /> : null}
    </AbsoluteFill>
  );
};
