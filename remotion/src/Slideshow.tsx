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
import type { TransitionPresentation } from "@remotion/transitions";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { fade } from "@remotion/transitions/fade";
import { z } from "zod";
import { Captions } from "./Captions";

export const FPS = 30;

/**
 * Slideshow: a Kling-free montage straight from the job images.
 *
 * Options:
 *   transition — how one image becomes the next:
 *     "slide" : page-slide, alternating direction (→ then ←)
 *     "wipe"  : a soft line sweeps across (default from the top) revealing the
 *               next image while the current one stays perfectly still
 *     "fade"  : cross-dissolve
 *   motion    — "kenburns" (slow zoom drift) or "none" (image stays put)
 *   voice/captions are optional; pass null / [] to omit (silent montage).
 *
 * Total length = images.length * imageDurationInFrames
 *              - (images.length - 1) * transitionDurationInFrames
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
  transition: z.enum(["slide", "wipe", "fade"]).default("slide"),
  motion: z.enum(["kenburns", "none"]).default("kenburns"),
});

export type SlideshowProps = z.infer<typeof slideshowSchema>;

/** One frame of the montage. With motion "none" the image is perfectly static. */
const Frame: React.FC<{
  src: string;
  durationInFrames: number;
  motion: "kenburns" | "none";
  zoomIn: boolean;
}> = ({ src, durationInFrames, motion, zoomIn }) => {
  const frame = useCurrentFrame();
  const scale =
    motion === "none"
      ? 1
      : interpolate(frame, [0, durationInFrames], zoomIn ? [1.03, 1.1] : [1.1, 1.03], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <Img
        src={staticFile(src)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presentationFor = (
  transition: "slide" | "wipe" | "fade",
  index: number
): TransitionPresentation<Record<string, unknown>> => {
  if (transition === "wipe") return wipe({ direction: "from-top" }) as TransitionPresentation<Record<string, unknown>>;
  if (transition === "fade") return fade() as TransitionPresentation<Record<string, unknown>>;
  // slide: alternate direction so pages turn →, then ←
  return slide({
    direction: index % 2 === 0 ? "from-right" : "from-left",
  }) as TransitionPresentation<Record<string, unknown>>;
};

export const Slideshow: React.FC<SlideshowProps> = ({
  images,
  voice,
  captions,
  captionStyle,
  imageDurationInFrames,
  transitionDurationInFrames,
  transition,
  motion,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <TransitionSeries>
        {images.flatMap((img, i) => {
          const nodes: React.ReactNode[] = [
            <TransitionSeries.Sequence key={`img-${i}`} durationInFrames={imageDurationInFrames}>
              <Frame
                src={img}
                durationInFrames={imageDurationInFrames}
                motion={motion}
                zoomIn={i % 2 === 0}
              />
            </TransitionSeries.Sequence>,
          ];
          if (i < images.length - 1) {
            nodes.push(
              <TransitionSeries.Transition
                key={`trans-${i}`}
                presentation={presentationFor(transition, i)}
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
