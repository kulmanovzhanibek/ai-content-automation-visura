import React from "react";
import { Composition } from "remotion";
import { Reel, reelSchema, CLIP_DURATION_S, FPS } from "./Reel";
import { Slideshow, slideshowSchema } from "./Slideshow";

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
        }}
        calculateMetadata={({ props }) => {
          const n = Math.max(1, props.images.length);
          const total =
            n * props.imageDurationInFrames - (n - 1) * props.transitionDurationInFrames;
          return { durationInFrames: Math.max(1, total) };
        }}
      />
    </>
  );
};
