import type { ISpineAttachment } from "./ISpineAttachment";
import type { ISpineSkinEntry } from "./ISpineSkinEntry";

/** Shared skin definitions. Mutations affect every instance using this skin. */
export interface ISpineSkin {
  readonly name: string;
  getAttachment(slotIndex: number, name: string): ISpineAttachment | null;
  getAttachments(): ISpineSkinEntry[];
  setAttachment(slotIndex: number, name: string, attachment: ISpineAttachment): void;
  removeAttachment(slotIndex: number, name: string): void;
  addSkin(skin: ISpineSkin): void;
}
