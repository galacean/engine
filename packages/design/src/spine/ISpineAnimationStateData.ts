import type { ISpineSkeletonData } from "./ISpineSkeletonData";

/** Shared mixing configuration. */
export interface ISpineAnimationStateData {
  readonly skeletonData: ISpineSkeletonData;
  defaultMix: number;
  setMix(from: string, to: string, duration: number): void;
}
