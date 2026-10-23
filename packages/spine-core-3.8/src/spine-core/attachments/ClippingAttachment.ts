import { VertexAttachment, Attachment } from "./Attachment";
import { SlotData } from "../SlotData";
import { Color } from "../Utils";

/** An attachment with vertices that make up a polygon used for clipping the rendering of other attachments. */
export class ClippingAttachment extends VertexAttachment {
  /** Clipping is performed between the clipping polygon's slot and the end slot. Returns null if clipping is done until the end of
   * the skeleton's rendering. */
  endSlot: SlotData;

  // Nonessential.
  /** The color of the clipping polygon as it was in Spine. Available only when nonessential data was exported. Clipping polygons
   * are not usually rendered at runtime. */
  color = new Color(0.2275, 0.2275, 0.8078, 1); // ce3a3aff

  constructor(name: string) {
    super(name);
  }

  copy(): Attachment {
    const copy = new ClippingAttachment(this.name);
    this.copyTo(copy);
    copy.endSlot = this.endSlot;
    copy.color.setFromColor(this.color);
    return copy;
  }
}
