import type { ISpineAnimationStateData } from "./ISpineAnimationStateData";
import type { ISpineAnimationStateListener } from "./ISpineAnimationStateListener";
import type { ISpineTrackEntry } from "./ISpineTrackEntry";

export interface ISpineAnimationState {
  readonly data: ISpineAnimationStateData;
  timeScale: number;
  setAnimation(track: number, name: string, loop: boolean): ISpineTrackEntry;
  addAnimation(track: number, name: string, loop: boolean, delay: number): ISpineTrackEntry;
  setEmptyAnimation(track: number, mixDuration: number): ISpineTrackEntry;
  addEmptyAnimation(track: number, mixDuration: number, delay: number): ISpineTrackEntry;
  setEmptyAnimations(mixDuration: number): void;
  getCurrent(track: number): ISpineTrackEntry | null;
  clearTrack(track: number): void;
  clearTracks(): void;
  addListener(listener: ISpineAnimationStateListener): void;
  clearListeners(): void;
}
