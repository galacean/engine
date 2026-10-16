import type { ISpineColor } from "./ISpineColor";
import type { ISpineBone } from "./ISpineBone";
import type { ISpineSlotData } from "./ISpineSlotData";
import type { ISpineAttachment } from "./ISpineAttachment";

export interface ISpineSlot {
  readonly data: ISpineSlotData;
  readonly bone: ISpineBone;
  readonly color: ISpineColor;
  readonly darkColor: ISpineColor | null;
  readonly deform: number[];
  getAttachment(): ISpineAttachment | null;
  setAttachment(attachment: ISpineAttachment | null): void;
  setToSetupPose(): void;
}
