import type { ISpineSkin } from "@galacean/engine-design";
import type { SpineSkeletonData } from "./SpineSkeletonData";

/** A shared skin belonging to one Spine resource. Create composite skins with SpineResource.createSkin. */
export class SpineSkin {
  /** @internal */
  readonly _native: ISpineSkin;
  /** @internal */
  readonly _owner: SpineSkeletonData;

  private constructor(native: ISpineSkin, owner: SpineSkeletonData) {
    this._native = native;
    this._owner = owner;
  }

  /** @internal */
  static _create(native: ISpineSkin, owner: SpineSkeletonData): SpineSkin {
    return new SpineSkin(native, owner);
  }

  get name(): string {
    return this._native.name;
  }

  /** Add all attachments and required bones/constraints from another skin of this resource. */
  addSkin(skin: SpineSkin): void {
    if (skin._owner !== this._owner) throw new Error("Cannot combine skins from different Spine resources.");
    this._native.addSkin(skin._native);
  }
}
