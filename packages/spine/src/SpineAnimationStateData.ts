import type { ISpineAnimationStateData } from "@galacean/engine-design";
import type { SpineSkeletonData } from "./SpineSkeletonData";

/** Mixing configuration shared by all instances of a resource. */
export class SpineAnimationStateData {
  /** @internal */
  readonly _native: ISpineAnimationStateData;
  readonly skeletonData: SpineSkeletonData;

  private constructor(native: ISpineAnimationStateData, data: SpineSkeletonData) {
    this._native = native;
    this.skeletonData = data;
  }
  /** @internal */
  static _create(native: ISpineAnimationStateData, data: SpineSkeletonData): SpineAnimationStateData {
    return new SpineAnimationStateData(native, data);
  }
  get defaultMix(): number {
    return this._native.defaultMix;
  }
  set defaultMix(value: number) {
    this._native.defaultMix = value;
  }
  /** Set the transition duration between two named animations. */
  setMix(from: string, to: string, duration: number): void {
    this._native.setMix(from, to, duration);
  }
}
