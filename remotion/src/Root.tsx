import React from "react";
import { Composition } from "remotion";
import { Reel, reelSchema, CLIP_DURATION_S, FPS } from "./Reel";

export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
