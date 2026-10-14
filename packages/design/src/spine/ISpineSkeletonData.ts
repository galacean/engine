import type { ISpineBoneData } from "./ISpineBoneData";
import type { ISpineSlotData } from "./ISpineSlotData";
import type { ISpineSkin } from "./ISpineSkin";
import type { ISpineAnimation } from "./ISpineAnimation";
import type { ISpineConstraintData } from "./ISpineConstraintData";

/** Shared setup pose, skins and animations. */
export interface ISpineSkeletonData {
  readonly name?: string | null;
  readonly version?: string | null;
  readonly bones: readonly ISpineBoneData[];
  readonly slots: readonly ISpineSlotData[];
  readonly skins: readonly ISpineSkin[];
  readonly animations: readonly ISpineAnimation[];
  readonly defaultSkin?: ISpineSkin | null;
  readonly ikConstraints: readonly ISpineConstraintData[];
  readonly transformConstraints: readonly ISpineConstraintData[];
  readonly pathConstraints: readonly ISpineConstraintData[];
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  findBone(name: string): ISpineBoneData | null;
  findSlot(name: string): ISpineSlotData | null;
  findSkin(name: string): ISpineSkin | null;
  findAnimation(name: string): ISpineAnimation | null;
}
