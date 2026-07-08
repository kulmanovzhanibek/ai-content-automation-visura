import React from "react";
import { Composition } from "remotion";
import { Reel, reelSchema, CLIP_DURATION_S, FPS } from "./Reel";
import { Slideshow, slideshowSchema } from "./Slideshow";
import { ColorReel, colorReelSchema } from "./ColorReel";
import { Slide, slideSchema } from "./Slide";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Reel"
        component={Reel}
        schema={reelSchema}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={5 * FPS}
        defaultProps={{ clips: [], voice: null, captions: [] }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(1, props.clips.length) * CLIP_DURATION_S * FPS,
        })}
      />
      <Composition
        id="Slideshow"
        component={Slideshow}
        schema={slideshowSchema}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={20 * FPS}
        defaultProps={{
          images: [],
          voice: null,
          captions: [],
          imageDurationInFrames: 120,
          transitionDurationInFrames: 18,
          transition: "slide" as const,
          motion: "kenburns" as const,
          wipeDirection: "from-left" as const,
        }}
        calculateMetadata={({ props }) => {
          const n = Math.max(1, props.images.length);
          const total =
            n * props.imageDurationInFrames - (n - 1) * props.transitionDurationInFrames;
          return { durationInFrames: Math.max(1, total) };
        }}
      />
      <Composition
        id="ColorReel"
        component={ColorReel}
        schema={colorReelSchema}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={11 * FPS}
        defaultProps={{ frames: [] }}
        calculateMetadata={({ props }) => ({
          durationInFrames: Math.max(
            1,
            props.frames.reduce((s, f) => s + Math.max(1, f.durationInFrames), 0)
          ),
        })}
      />
      <Composition
        id="Slide"
        component={Slide}
        schema={slideSchema}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={1}
        defaultProps={{
          bg: null,
          text: "Your hook goes here",
          textStyle: "white" as const,
          position: "center" as const,
        }}
      />
    </>
  );
};
