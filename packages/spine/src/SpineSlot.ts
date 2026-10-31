import type { ISpineSkeleton, ISpineSlot } from "@galacean/engine-design";
import type { SpineBone } from "./SpineBone";

/** An attachment slot owned by one skeleton instance. */
export class SpineSlot {
  private constructor(
    private _native: ISpineSlot,
    private _skeleton: ISpineSkeleton,
    readonly bone: SpineBone
  ) {}

  /** @internal */
  static _create(native: ISpineSlot, skeleton: ISpineSkeleton, bone: SpineBone): SpineSlot {
    return new SpineSlot(native, skeleton, bone);
  }

  get name(): string {
    return this._native.data.name;
  }

  /** Select an attachment by its skin entry name, or clear the slot with null. */
  setAttachment(name: string | null): void {
    this._skeleton.setAttachment(this.name, name);
  }

  /** Restore the setup color and attachment, using the current skin. */
  setToSetupPose(): void {
    this._native.setToSetupPose();
  }
}
