import type { ISpineColor } from "./ISpineColor";
import type { ISpineBone } from "./ISpineBone";
import type { ISpineAttachment } from "./ISpineAttachment";
import type { ISpineSlot } from "./ISpineSlot";
import type { ISpineSkin } from "./ISpineSkin";
import type { ISpineConstraint } from "./ISpineConstraint";
import type { ISpineSkeletonData } from "./ISpineSkeletonData";

/** Per-instance pose. World-transform evaluation is owned by the backend. */
export interface ISpineSkeleton {
  readonly data: ISpineSkeletonData;
  readonly bones: readonly ISpineBone[];
  readonly slots: readonly ISpineSlot[];
  readonly drawOrder: readonly ISpineSlot[];
  readonly color: ISpineColor;
  readonly skin?: ISpineSkin | null;
  readonly ikConstraints: readonly ISpineConstraint[];
  readonly transformConstraints: readonly ISpineConstraint[];
  readonly pathConstraints: readonly ISpineConstraint[];
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  findBone(name: string): ISpineBone | null;
  findSlot(name: string): ISpineSlot | null;
  setSkinByName(name: string): void;
  setSkin(skin: ISpineSkin | null): void;
  setAttachment(slotName: string, attachmentName: string | null): void;
  getAttachment(slotIndex: number, name: string): ISpineAttachment | null;
  setToSetupPose(): void;
  setBonesToSetupPose(): void;
  setSlotsToSetupPose(): void;
}
