import type {
  AssemblyAudioClip,
  AssemblyAudioSync,
  AssemblyAudioTrack,
  AssemblyRemotionProps,
  AssemblySegmentClip,
} from "./assembly.types";
import {
  ASSEMBLY_CANVAS_HEIGHT,
  ASSEMBLY_CANVAS_WIDTH,
} from "./assembly.constants";
import { getDefaultAudioSync, projectLegacyAudioSync } from "./timeline-state";

const DEFAULT_FPS = 30;

export function buildRemotionProps(input: {
  segments: AssemblySegmentClip[];
  audioTrack: AssemblyAudioTrack | null;
  audioClips: AssemblyAudioClip[];
  /** Defaults to true (editor preview). Cloud export passes false. */
  showSegmentTitles?: boolean;
}): AssemblyRemotionProps {
  const hasMusic = input.audioClips.length > 0;
  return {
    fps: DEFAULT_FPS,
    width: ASSEMBLY_CANVAS_WIDTH,
    height: ASSEMBLY_CANVAS_HEIGHT,
    segments: input.segments,
    audio: hasMusic ? input.audioTrack : null,
    audioSync: legacyFromAudioClips(input.audioClips),
    audioClips: input.audioClips,
    showSegmentTitles: input.showSegmentTitles ?? true,
  };
}

function legacyFromAudioClips(
  audioClips: AssemblyAudioClip[],
): AssemblyAudioSync {
  if (audioClips.length === 0) {
    return getDefaultAudioSync();
  }
  return projectLegacyAudioSync(audioClips);
}
