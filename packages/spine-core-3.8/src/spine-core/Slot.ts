import { SlotData } from "./SlotData";
import { Bone } from "./Bone";
import { Color } from "./Utils";
import { Attachment } from "./attachments/Attachment";
import { Skeleton } from "./Skeleton";

/** Stores a slot's current pose. Slots organize attachments for {@link Skeleton#drawOrder} purposes and provide a place to store
 * state for an attachment. State cannot be stored in an attachment itself because attachments are stateless and may be shared
 * across multiple skeletons. */
export class Slot {
  /** The slot's setup pose data. */
  data: SlotData;

  /** The bone this slot belongs to. */
  bone: Bone;

  /** The color used to tint the slot's attachment. If {@link #getDarkColor()} is set, this is used as the light color for two
   * color tinting. */
  color: Color;

  /** The dark color used to tint the slot's attachment for two color tinting, or null if two color tinting is not used. The dark
   * color's alpha is not used. */
  darkColor: Color;

  attachment: Attachment;

  private attachmentTime: number;

  attachmentState: number;

  /** Values to deform the slot's attachment. For an unweighted mesh, the entries are local positions for each vertex. For a
   * weighted mesh, the entries are an offset for each vertex which will be added to the mesh's local vertex positions.
   *
   * See {@link VertexAttachment#computeWorldVertices()} and {@link DeformTimeline}. */
  deform = new Array<number>();

  constructor(data: SlotData, bone: Bone) {
    if (data == null) throw new Error("data cannot be null.");
    if (bone == null) throw new Error("bone cannot be null.");
    this.data = data;
    this.bone = bone;
    this.color = new Color();
    this.darkColor = data.darkColor == null ? null : new Color();
    this.setToSetupPose();
  }

  /** The skeleton this slot belongs to. */
  getSkeleton(): Skeleton {
    return this.bone.skeleton;
  }

  /** The current attachment for the slot, or null if the slot has no attachment. */
  getAttachment(): Attachment {
    return this.attachment;
  }

  /** Sets the slot's attachment and, if the attachment changed, resets {@link #attachmentTime} and clears {@link #deform}.
   * @param attachment May be null. */
  setAttachment(attachment: Attachment) {
    if (this.attachment == attachment) return;
    this.attachment = attachment;
    this.attachmentTime = this.bone.skeleton.time;
    this.deform.length = 0;
  }

  setAttachmentTime(time: number) {
    this.attachmentTime = this.bone.skeleton.time - time;
  }

  /** The time that has elapsed since the last time the attachment was set or cleared. Relies on Skeleton
   * {@link Skeleton#time}. */
  getAttachmentTime(): number {
    return this.bone.skeleton.time - this.attachmentTime;
  }

  /** Sets this slot to the setup pose. */
  setToSetupPose() {
    this.color.setFromColor(this.data.color);
    if (this.darkColor != null) this.darkColor.setFromColor(this.data.darkColor);
    if (this.data.attachmentName == null) this.attachment = null;
    else {
      this.attachment = null;
      this.setAttachment(this.bone.skeleton.getAttachment(this.data.index, this.data.attachmentName));
    }
  }
}
