import type { ISpineBoneData } from "./ISpineBoneData";

export interface ISpineBone {
  readonly data: ISpineBoneData;
  /** Local pose, before constraints. */
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
  /** Evaluated world transform. */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly worldX: number;
  readonly worldY: number;
  isActive(): boolean;
  setToSetupPose(): void;
}
