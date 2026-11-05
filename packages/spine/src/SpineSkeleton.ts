import type { ISpineSkeleton } from "@galacean/engine-design";
import { SpineBone } from "./SpineBone";
import { SpineSlot } from "./SpineSlot";
import type { SpineSkin } from "./SpineSkin";
import type { SpineSkeletonData } from "./SpineSkeletonData";

/** The editable pose of one renderer. Bone and slot wrappers are created once and reused. */
export class SpineSkeleton {
  readonly data: SpineSkeletonData;
  readonly bones: readonly SpineBone[];
  /** Slots in setup order, independent of the animated draw order. */
  readonly slots: readonly SpineSlot[];

  private constructor(
    private _native: ISpineSkeleton,
    data: SpineSkeletonData
  ) {
    this.data = data;
    this.bones = Object.freeze(_native.bones.map((bone) => SpineBone._create(bone)));
    const bones = new Map(_native.bones.map((bone, index) => [bone, this.bones[index]]));
    this.slots = Object.freeze(_native.slots.map((slot) => SpineSlot._create(slot, _native, bones.get(slot.bone)!)));
  }
  /** @internal */
  static _create(native: ISpineSkeleton, data: SpineSkeletonData): SpineSkeleton {
    return new SpineSkeleton(native, data);
  }
  get x(): number {
    return this._native.x;
  }
  set x(value: number) {
    this._native.x = value;
  }
  get y(): number {
    return this._native.y;
  }
  set y(value: number) {
    this._native.y = value;
  }
  get scaleX(): number {
    return this._native.scaleX;
  }
  set scaleX(value: number) {
    this._native.scaleX = value;
  }
  get scaleY(): number {
    return this._native.scaleY;
  }
  set scaleY(value: number) {
    this._native.scaleY = value;
  }

  get skin(): SpineSkin | null {
    return this.data._wrapSkin(this._native.skin);
  }
  findBone(name: string): SpineBone | null {
    return this.bones.find((bone) => bone.name === name) ?? null;
  }
  findSlot(name: string): SpineSlot | null {
    return this.slots.find((slot) => slot.name === name) ?? null;
  }
  setSkinByName(name: string): void {
    this._native.setSkinByName(name);
  }
  /** Assign a skin from this resource, or clear the current skin. */
  setSkin(skin: SpineSkin | null): void {
    if (skin && skin._owner !== this.data) throw new Error("Cannot assign a skin from another Spine resource.");
    this._native.setSkin(skin?._native ?? null);
  }
  setAttachment(slotName: string, attachmentName: string | null): void {
    this._native.setAttachment(slotName, attachmentName);
  }
  setToSetupPose(): void {
    this._native.setToSetupPose();
  }
  setBonesToSetupPose(): void {
    this._native.setBonesToSetupPose();
  }
  setSlotsToSetupPose(): void {
    this._native.setSlotsToSetupPose();
  }
}
