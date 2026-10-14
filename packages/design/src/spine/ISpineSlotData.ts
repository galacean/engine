import type { ISpineColor } from "./ISpineColor";
import type { ISpineBoneData } from "./ISpineBoneData";

export interface ISpineSlotData {
  readonly index: number;
  readonly name: string;
  readonly boneData: ISpineBoneData;
  readonly color: ISpineColor;
  attachmentName: string | null;
}
