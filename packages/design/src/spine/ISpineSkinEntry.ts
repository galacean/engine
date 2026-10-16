import type { ISpineAttachment } from "./ISpineAttachment";

export interface ISpineSkinEntry {
  readonly slotIndex: number;
  readonly name: string;
  readonly attachment: ISpineAttachment;
}
