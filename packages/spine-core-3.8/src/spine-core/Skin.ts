import { Attachment } from "./attachments/Attachment";
import { BoneData } from "./BoneData";
import { ConstraintData } from "./ConstraintData";
import { Skeleton } from "./Skeleton";
import { MeshAttachment } from "./attachments/MeshAttachment";
import { Map } from "./Utils";

/** Stores an entry in the skin consisting of the slot index, name, and attachment **/
export class SkinEntry {
  constructor(
    public slotIndex: number,
    public name: string,
    public attachment: Attachment
  ) {}
}

/** Stores attachments by slot index and attachment name.
 *
 * See SkeletonData {@link SkeletonData#defaultSkin}, Skeleton {@link Skeleton#skin}, and
 * [Runtime skins](http://esotericsoftware.com/spine-runtime-skins) in the Spine Runtimes Guide. */
export class Skin {
  /** The skin's name, which is unique across all skins in the skeleton. */
  name: string;

  attachments = new Array<Map<Attachment>>();
  bones = Array<BoneData>();
  constraints = new Array<ConstraintData>();

  constructor(name: string) {
    if (name == null) throw new Error("name cannot be null.");
    this.name = name;
  }

  /** Adds an attachment to the skin for the specified slot index and name. */
  setAttachment(slotIndex: number, name: string, attachment: Attachment) {
    if (attachment == null) throw new Error("attachment cannot be null.");
    const attachments = this.attachments;
    if (slotIndex >= attachments.length) attachments.length = slotIndex + 1;
    if (!attachments[slotIndex]) attachments[slotIndex] = {};
    attachments[slotIndex][name] = attachment;
  }

  /** Adds all attachments, bones, and constraints from the specified skin to this skin. */
  addSkin(skin: Skin) {
    for (let i = 0; i < skin.bones.length; i++) {
      const bone = skin.bones[i];
      let contained = false;
      for (let j = 0; j < this.bones.length; j++) {
        if (this.bones[j] == bone) {
          contained = true;
          break;
        }
      }
      if (!contained) this.bones.push(bone);
    }

    for (let i = 0; i < skin.constraints.length; i++) {
      const constraint = skin.constraints[i];
      let contained = false;
      for (let j = 0; j < this.constraints.length; j++) {
        if (this.constraints[j] == constraint) {
          contained = true;
          break;
        }
      }
      if (!contained) this.constraints.push(constraint);
    }

    const attachments = skin.getAttachments();
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      this.setAttachment(attachment.slotIndex, attachment.name, attachment.attachment);
    }
  }

  /** Adds all bones and constraints and copies of all attachments from the specified skin to this skin. Mesh attachments are not
   * copied, instead a new linked mesh is created. The attachment copies can be modified without affecting the originals. */
  copySkin(skin: Skin) {
    for (let i = 0; i < skin.bones.length; i++) {
      const bone = skin.bones[i];
      let contained = false;
      for (let j = 0; j < this.bones.length; j++) {
        if (this.bones[j] == bone) {
          contained = true;
          break;
        }
      }
      if (!contained) this.bones.push(bone);
    }

    for (let i = 0; i < skin.constraints.length; i++) {
      const constraint = skin.constraints[i];
      let contained = false;
      for (let j = 0; j < this.constraints.length; j++) {
        if (this.constraints[j] == constraint) {
          contained = true;
          break;
        }
      }
      if (!contained) this.constraints.push(constraint);
    }

    const attachments = skin.getAttachments();
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i];
      if (attachment.attachment == null) continue;
      if (attachment.attachment instanceof MeshAttachment) {
        attachment.attachment = attachment.attachment.newLinkedMesh();
        this.setAttachment(attachment.slotIndex, attachment.name, attachment.attachment);
      } else {
        attachment.attachment = attachment.attachment.copy();
        this.setAttachment(attachment.slotIndex, attachment.name, attachment.attachment);
      }
    }
  }

  /** Returns the attachment for the specified slot index and name, or null. */
  getAttachment(slotIndex: number, name: string): Attachment {
    const dictionary = this.attachments[slotIndex];
    return dictionary ? dictionary[name] : null;
  }

  /** Removes the attachment in the skin for the specified slot index and name, if any. */
  removeAttachment(slotIndex: number, name: string) {
    const dictionary = this.attachments[slotIndex];
    if (dictionary) dictionary[name] = null;
  }

  /** Returns all attachments in this skin. */
  getAttachments(): Array<SkinEntry> {
    const entries = new Array<SkinEntry>();
    for (let i = 0; i < this.attachments.length; i++) {
      const slotAttachments = this.attachments[i];
      if (slotAttachments) {
        for (const name in slotAttachments) {
          const attachment = slotAttachments[name];
          if (attachment) entries.push(new SkinEntry(i, name, attachment));
        }
      }
    }
    return entries;
  }

  /** Returns all attachments in this skin for the specified slot index. */
  getAttachmentsForSlot(slotIndex: number, attachments: Array<SkinEntry>) {
    const slotAttachments = this.attachments[slotIndex];
    if (slotAttachments) {
      for (const name in slotAttachments) {
        const attachment = slotAttachments[name];
        if (attachment) attachments.push(new SkinEntry(slotIndex, name, attachment));
      }
    }
  }

  /** Clears all attachments, bones, and constraints. */
  clear() {
    this.attachments.length = 0;
    this.bones.length = 0;
    this.constraints.length = 0;
  }

  /** Attach each attachment in this skin if the corresponding attachment in the old skin is currently attached. */
  attachAll(skeleton: Skeleton, oldSkin: Skin) {
    let slotIndex = 0;
    for (let i = 0; i < skeleton.slots.length; i++) {
      const slot = skeleton.slots[i];
      const slotAttachment = slot.getAttachment();
      if (slotAttachment && slotIndex < oldSkin.attachments.length) {
        const dictionary = oldSkin.attachments[slotIndex];
        for (const key in dictionary) {
          const skinAttachment: Attachment = dictionary[key];
          if (slotAttachment == skinAttachment) {
            const attachment = this.getAttachment(slotIndex, key);
            if (attachment != null) slot.setAttachment(attachment);
            break;
          }
        }
      }
      slotIndex++;
    }
  }
}
