import type { ISpineBone } from "./ISpineBone";

/** Per-instance attachment slot. Materials are owned by the renderer. */
export interface ISpineSlot {
  readonly data: { readonly name: string };
  readonly bone: ISpineBone;
  setToSetupPose(): void;
}
