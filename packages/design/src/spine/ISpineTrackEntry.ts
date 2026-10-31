import type { ISpineAnimation } from "./ISpineAnimation";
import type { ISpineAnimationStateListener } from "./ISpineAnimationStateListener";

/** A playback entry is pooled by the runtime. Do not retain it after its dispose event. */
export interface ISpineTrackEntry {
  readonly animation: ISpineAnimation | null;
  readonly trackIndex: number;
  readonly next?: ISpineTrackEntry | null;
  readonly mixingFrom?: ISpineTrackEntry | null;
  readonly mixingTo?: ISpineTrackEntry | null;
  listener?: ISpineAnimationStateListener | null;
  loop: boolean;
  delay: number;
  trackTime: number;
  trackEnd: number;
  timeScale: number;
  alpha: number;
  animationStart: number;
  animationEnd: number;
  mixTime: number;
  mixDuration: number;
  getAnimationTime(): number;
  isComplete(): boolean;
}
