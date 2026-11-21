import type { ISpineSkin } from "./ISpineSkin";
import type { ISpineAnimation } from "./ISpineAnimation";

/** Shared setup pose, skins and animations. */
export interface ISpineSkeletonData {
  readonly name?: string | null;
  readonly version?: string | null;
  readonly skins: readonly ISpineSkin[];
  readonly animations: readonly ISpineAnimation[];
  readonly defaultSkin?: ISpineSkin | null;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  findSkin(name: string): ISpineSkin | null;
}
