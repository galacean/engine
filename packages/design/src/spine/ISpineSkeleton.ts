import type { ISpineBone } from "./ISpineBone";
import type { ISpineSkin } from "./ISpineSkin";
import type { ISpineSkeletonData } from "./ISpineSkeletonData";

/** Per-instance pose. World-transform evaluation is owned by the backend. */
export interface ISpineSkeleton {
  readonly data: ISpineSkeletonData;
  readonly bones: readonly ISpineBone[];
  readonly skin?: ISpineSkin | null;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  setSkinByName(name: string): void;
  setSkin(skin: ISpineSkin | null): void;
  setAttachment(slotName: string, attachmentName: string | null): void;
  setToSetupPose(): void;
  setBonesToSetupPose(): void;
  setSlotsToSetupPose(): void;
}
