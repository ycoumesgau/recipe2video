import type { ComponentType } from "react";
import { Composition, registerRoot } from "remotion";

import type { AssemblyRemotionProps } from "@/modules/assembly/assembly.types";
import {
  getAssemblyDurationInFrames,
  RecipeAssemblyComposition,
} from "./compositions/recipe-assembly";

const defaultAssemblyProps: AssemblyRemotionProps = {
  fps: 30,
  width: 1080,
  height: 1920,
  segments: [],
  audio: null,
  audioSync: {
    offsetSeconds: 0,
    cutFromSeconds: 0,
    fadeInSeconds: 0,
    fadeOutSeconds: 0,
  },
  audioClips: [],
};

function RemotionRoot() {
  return (
    <Composition
      id="RecipeAssembly"
      component={
        RecipeAssemblyComposition as unknown as ComponentType<
          Record<string, unknown>
        >
      }
      defaultProps={defaultAssemblyProps as unknown as Record<string, unknown>}
      calculateMetadata={async ({ props }) => {
        const p = props as unknown as AssemblyRemotionProps;
        return {
          durationInFrames: Math.max(
            getAssemblyDurationInFrames({
              fps: p.fps,
              segments: p.segments,
              audioClips: p.audioClips,
            }),
            1,
          ),
          fps: p.fps,
          width: p.width,
          height: p.height,
        };
      }}
    />
  );
};

registerRoot(RemotionRoot);
