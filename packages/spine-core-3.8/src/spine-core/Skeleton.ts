import { SkeletonData } from "./SkeletonData";
import { Bone } from "./Bone";
import { Slot } from "./Slot";
import { IkConstraint } from "./IkConstraint";
import { TransformConstraint } from "./TransformConstraint";
import { PathConstraint } from "./PathConstraint";
import { Updatable } from "./Updatable";
import { Skin } from "./Skin";
import { Color, Utils, Vector2 } from "./Utils";
import { PathAttachment } from "./attachments/PathAttachment";
import { Attachment } from "./attachments/Attachment";
import { RegionAttachment } from "./attachments/RegionAttachment";
import { MeshAttachment } from "./attachments/MeshAttachment";

/** Stores the current pose for a skeleton.
 *
 * See [Instance objects](http://esotericsoftware.com/spine-runtime-architecture#Instance-objects) in the Spine Runtimes Guide. */
export class Skeleton {
  /** The skeleton's setup pose data. */
  data: SkeletonData;

  /** The skeleton's bones, sorted parent first. The root bone is always the first bone. */
  bones: Array<Bone>;

  /** The skeleton's slots. */
  slots: Array<Slot>;

  /** The skeleton's slots in the order they should be drawn. The returned array may be modified to change the draw order. */
  drawOrder: Array<Slot>;

  /** The skeleton's IK constraints. */
  ikConstraints: Array<IkConstraint>;

  /** The skeleton's transform constraints. */
  transformConstraints: Array<TransformConstraint>;

  /** The skeleton's path constraints. */
  pathConstraints: Array<PathConstraint>;

  /** The list of bones and constraints, sorted in the order they should be updated, as computed by {@link #updateCache()}. */
  _updateCache = new Array<Updatable>();
  updateCacheReset = new Array<Updatable>();

  /** The skeleton's current skin. May be null. */
  skin: Skin;

  /** The color to tint all the skeleton's attachments. */
  color: Color;

  /** Returns the skeleton's time. This can be used for tracking, such as with Slot {@link Slot#attachmentTime}.
   * <p>
   * See {@link #update()}. */
  time = 0;

  /** Scales the entire skeleton on the X axis. This affects all bones, even if the bone's transform mode disallows scale
   * inheritance. */
  scaleX = 1;

  /** Scales the entire skeleton on the Y axis. This affects all bones, even if the bone's transform mode disallows scale
   * inheritance. */
  scaleY = 1;

  /** Sets the skeleton X position, which is added to the root bone worldX position. */
  x = 0;

  /** Sets the skeleton Y position, which is added to the root bone worldY position. */
  y = 0;

  constructor(data: SkeletonData) {
    if (data == null) throw new Error("data cannot be null.");
    this.data = data;

    this.bones = new Array<Bone>();
    for (let i = 0; i < data.bones.length; i++) {
      const boneData = data.bones[i];
      let bone: Bone;
      if (boneData.parent == null) bone = new Bone(boneData, this, null);
      else {
        const parent = this.bones[boneData.parent.index];
        bone = new Bone(boneData, this, parent);
        parent.children.push(bone);
      }
      this.bones.push(bone);
    }

    this.slots = new Array<Slot>();
    this.drawOrder = new Array<Slot>();
    for (let i = 0; i < data.slots.length; i++) {
      const slotData = data.slots[i];
      const bone = this.bones[slotData.boneData.index];
      const slot = new Slot(slotData, bone);
      this.slots.push(slot);
      this.drawOrder.push(slot);
    }

    this.ikConstraints = new Array<IkConstraint>();
    for (let i = 0; i < data.ikConstraints.length; i++) {
      const ikConstraintData = data.ikConstraints[i];
      this.ikConstraints.push(new IkConstraint(ikConstraintData, this));
    }

    this.transformConstraints = new Array<TransformConstraint>();
    for (let i = 0; i < data.transformConstraints.length; i++) {
      const transformConstraintData = data.transformConstraints[i];
      this.transformConstraints.push(new TransformConstraint(transformConstraintData, this));
    }

    this.pathConstraints = new Array<PathConstraint>();
    for (let i = 0; i < data.pathConstraints.length; i++) {
      const pathConstraintData = data.pathConstraints[i];
      this.pathConstraints.push(new PathConstraint(pathConstraintData, this));
    }

    this.color = new Color(1, 1, 1, 1);
    this.updateCache();
  }

  /** Caches information about bones and constraints. Must be called if the {@link #getSkin()} is modified or if bones,
   * constraints, or weighted path attachments are added or removed. */
  updateCache() {
    const updateCache = this._updateCache;
    updateCache.length = 0;
    this.updateCacheReset.length = 0;

    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i];
      bone.sorted = bone.data.skinRequired;
      bone.active = !bone.sorted;
    }

    if (this.skin != null) {
      const skinBones = this.skin.bones;
      for (let i = 0, n = this.skin.bones.length; i < n; i++) {
        let bone = this.bones[skinBones[i].index];
        do {
          bone.sorted = false;
          bone.active = true;
          bone = bone.parent;
        } while (bone != null);
      }
    }

    // IK first, lowest hierarchy depth first.
    const ikConstraints = this.ikConstraints;
    const transformConstraints = this.transformConstraints;
    const pathConstraints = this.pathConstraints;
    const ikCount = ikConstraints.length,
      transformCount = transformConstraints.length,
      pathCount = pathConstraints.length;
    const constraintCount = ikCount + transformCount + pathCount;

    outer: for (let i = 0; i < constraintCount; i++) {
      for (let ii = 0; ii < ikCount; ii++) {
        const constraint = ikConstraints[ii];
        if (constraint.data.order == i) {
          this.sortIkConstraint(constraint);
          continue outer;
        }
      }
      for (let ii = 0; ii < transformCount; ii++) {
        const constraint = transformConstraints[ii];
        if (constraint.data.order == i) {
          this.sortTransformConstraint(constraint);
          continue outer;
        }
      }
      for (let ii = 0; ii < pathCount; ii++) {
        const constraint = pathConstraints[ii];
        if (constraint.data.order == i) {
          this.sortPathConstraint(constraint);
          continue outer;
        }
      }
    }

    for (let i = 0, n = bones.length; i < n; i++) this.sortBone(bones[i]);
  }

  sortIkConstraint(constraint: IkConstraint) {
    constraint.active =
      constraint.target.isActive() &&
      (!constraint.data.skinRequired ||
        (this.skin != null && Utils.contains(this.skin.constraints, constraint.data, true)));
    if (!constraint.active) return;

    const target = constraint.target;
    this.sortBone(target);

    const constrained = constraint.bones;
    const parent = constrained[0];
    this.sortBone(parent);

    if (constrained.length > 1) {
      const child = constrained[constrained.length - 1];
      if (!(this._updateCache.indexOf(child) > -1)) this.updateCacheReset.push(child);
    }

    this._updateCache.push(constraint);

    this.sortReset(parent.children);
    constrained[constrained.length - 1].sorted = true;
  }

  sortPathConstraint(constraint: PathConstraint) {
    constraint.active =
      constraint.target.bone.isActive() &&
      (!constraint.data.skinRequired ||
        (this.skin != null && Utils.contains(this.skin.constraints, constraint.data, true)));
    if (!constraint.active) return;

    const slot = constraint.target;
    const slotIndex = slot.data.index;
    const slotBone = slot.bone;
    if (this.skin != null) this.sortPathConstraintAttachment(this.skin, slotIndex, slotBone);
    if (this.data.defaultSkin != null && this.data.defaultSkin != this.skin)
      this.sortPathConstraintAttachment(this.data.defaultSkin, slotIndex, slotBone);
    for (let i = 0, n = this.data.skins.length; i < n; i++)
      this.sortPathConstraintAttachment(this.data.skins[i], slotIndex, slotBone);

    const attachment = slot.getAttachment();
    if (attachment instanceof PathAttachment) this.sortPathConstraintAttachmentWith(attachment, slotBone);

    const constrained = constraint.bones;
    const boneCount = constrained.length;
    for (let i = 0; i < boneCount; i++) this.sortBone(constrained[i]);

    this._updateCache.push(constraint);

    for (let i = 0; i < boneCount; i++) this.sortReset(constrained[i].children);
    for (let i = 0; i < boneCount; i++) constrained[i].sorted = true;
  }

  sortTransformConstraint(constraint: TransformConstraint) {
    constraint.active =
      constraint.target.isActive() &&
      (!constraint.data.skinRequired ||
        (this.skin != null && Utils.contains(this.skin.constraints, constraint.data, true)));
    if (!constraint.active) return;

    this.sortBone(constraint.target);

    const constrained = constraint.bones;
    const boneCount = constrained.length;
    if (constraint.data.local) {
      for (let i = 0; i < boneCount; i++) {
        const child = constrained[i];
        this.sortBone(child.parent);
        if (!(this._updateCache.indexOf(child) > -1)) this.updateCacheReset.push(child);
      }
    } else {
      for (let i = 0; i < boneCount; i++) {
        this.sortBone(constrained[i]);
      }
    }

    this._updateCache.push(constraint);

    for (let ii = 0; ii < boneCount; ii++) this.sortReset(constrained[ii].children);
    for (let ii = 0; ii < boneCount; ii++) constrained[ii].sorted = true;
  }

  sortPathConstraintAttachment(skin: Skin, slotIndex: number, slotBone: Bone) {
    const attachments = skin.attachments[slotIndex];
    if (!attachments) return;
    for (const key in attachments) {
      this.sortPathConstraintAttachmentWith(attachments[key], slotBone);
    }
  }

  sortPathConstraintAttachmentWith(attachment: Attachment, slotBone: Bone) {
    if (!(attachment instanceof PathAttachment)) return;
    const pathBones = (<PathAttachment>attachment).bones;
    if (pathBones == null) this.sortBone(slotBone);
    else {
      const bones = this.bones;
      let i = 0;
      while (i < pathBones.length) {
        const boneCount = pathBones[i++];
        for (let n = i + boneCount; i < n; i++) {
          const boneIndex = pathBones[i];
          this.sortBone(bones[boneIndex]);
        }
      }
    }
  }

  sortBone(bone: Bone) {
    if (bone.sorted) return;
    const parent = bone.parent;
    if (parent != null) this.sortBone(parent);
    bone.sorted = true;
    this._updateCache.push(bone);
  }

  sortReset(bones: Array<Bone>) {
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i];
      if (!bone.active) continue;
      if (bone.sorted) this.sortReset(bone.children);
      bone.sorted = false;
    }
  }

  /** Updates the world transform for each bone and applies all constraints.
   *
   * See [World transforms](http://esotericsoftware.com/spine-runtime-skeletons#World-transforms) in the Spine
   * Runtimes Guide. */
  updateWorldTransform() {
    const updateCacheReset = this.updateCacheReset;
    for (let i = 0, n = updateCacheReset.length; i < n; i++) {
      const bone = updateCacheReset[i] as Bone;
      bone.ax = bone.x;
      bone.ay = bone.y;
      bone.arotation = bone.rotation;
      bone.ascaleX = bone.scaleX;
      bone.ascaleY = bone.scaleY;
      bone.ashearX = bone.shearX;
      bone.ashearY = bone.shearY;
      bone.appliedValid = true;
    }
    const updateCache = this._updateCache;
    for (let i = 0, n = updateCache.length; i < n; i++) updateCache[i].update();
  }

  /** Sets the bones, constraints, and slots to their setup pose values. */
  setToSetupPose() {
    this.setBonesToSetupPose();
    this.setSlotsToSetupPose();
  }

  /** Sets the bones and constraints to their setup pose values. */
  setBonesToSetupPose() {
    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) bones[i].setToSetupPose();

    const ikConstraints = this.ikConstraints;
    for (let i = 0, n = ikConstraints.length; i < n; i++) {
      const constraint = ikConstraints[i];
      constraint.mix = constraint.data.mix;
      constraint.softness = constraint.data.softness;
      constraint.bendDirection = constraint.data.bendDirection;
      constraint.compress = constraint.data.compress;
      constraint.stretch = constraint.data.stretch;
    }

    const transformConstraints = this.transformConstraints;
    for (let i = 0, n = transformConstraints.length; i < n; i++) {
      const constraint = transformConstraints[i];
      const data = constraint.data;
      constraint.rotateMix = data.rotateMix;
      constraint.translateMix = data.translateMix;
      constraint.scaleMix = data.scaleMix;
      constraint.shearMix = data.shearMix;
    }

    const pathConstraints = this.pathConstraints;
    for (let i = 0, n = pathConstraints.length; i < n; i++) {
      const constraint = pathConstraints[i];
      const data = constraint.data;
      constraint.position = data.position;
      constraint.spacing = data.spacing;
      constraint.rotateMix = data.rotateMix;
      constraint.translateMix = data.translateMix;
    }
  }

  /** Sets the slots and draw order to their setup pose values. */
  setSlotsToSetupPose() {
    const slots = this.slots;
    Utils.arrayCopy(slots, 0, this.drawOrder, 0, slots.length);
    for (let i = 0, n = slots.length; i < n; i++) slots[i].setToSetupPose();
  }

  /** @returns May return null. */
  getRootBone() {
    if (this.bones.length == 0) return null;
    return this.bones[0];
  }

  /** @returns May be null. */
  findBone(boneName: string) {
    if (boneName == null) throw new Error("boneName cannot be null.");
    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i];
      if (bone.data.name == boneName) return bone;
    }
    return null;
  }

  /** @returns -1 if the bone was not found. */
  findBoneIndex(boneName: string) {
    if (boneName == null) throw new Error("boneName cannot be null.");
    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) if (bones[i].data.name == boneName) return i;
    return -1;
  }

  /** Finds a slot by comparing each slot's name. It is more efficient to cache the results of this method than to call it
   * repeatedly.
   * @returns May be null. */
  findSlot(slotName: string) {
    if (slotName == null) throw new Error("slotName cannot be null.");
    const slots = this.slots;
    for (let i = 0, n = slots.length; i < n; i++) {
      const slot = slots[i];
      if (slot.data.name == slotName) return slot;
    }
    return null;
  }

  /** @returns -1 if the bone was not found. */
  findSlotIndex(slotName: string) {
    if (slotName == null) throw new Error("slotName cannot be null.");
    const slots = this.slots;
    for (let i = 0, n = slots.length; i < n; i++) if (slots[i].data.name == slotName) return i;
    return -1;
  }

  /** Sets a skin by name.
   *
   * See {@link #setSkin()}. */
  setSkinByName(skinName: string) {
    const skin = this.data.findSkin(skinName);
    if (skin == null) throw new Error("Skin not found: " + skinName);
    this.setSkin(skin);
  }

  /** Sets the skin used to look up attachments before looking in the {@link SkeletonData#defaultSkin default skin}. If the
   * skin is changed, {@link #updateCache()} is called.
   *
   * Attachments from the new skin are attached if the corresponding attachment from the old skin was attached. If there was no
   * old skin, each slot's setup mode attachment is attached from the new skin.
   *
   * After changing the skin, the visible attachments can be reset to those attached in the setup pose by calling
   * {@link #setSlotsToSetupPose()}. Also, often {@link AnimationState#apply()} is called before the next time the
   * skeleton is rendered to allow any attachment keys in the current animation(s) to hide or show attachments from the new skin.
   * @param newSkin May be null. */
  setSkin(newSkin: Skin) {
    if (newSkin == this.skin) return;
    if (newSkin != null) {
      if (this.skin != null) newSkin.attachAll(this, this.skin);
      else {
        const slots = this.slots;
        for (let i = 0, n = slots.length; i < n; i++) {
          const slot = slots[i];
          const name = slot.data.attachmentName;
          if (name != null) {
            const attachment: Attachment = newSkin.getAttachment(i, name);
            if (attachment != null) slot.setAttachment(attachment);
          }
        }
      }
    }
    this.skin = newSkin;
    this.updateCache();
  }

  /** Finds an attachment by looking in the {@link #skin} and {@link SkeletonData#defaultSkin} using the slot name and attachment
   * name.
   *
   * See {@link #getAttachment()}.
   * @returns May be null. */
  getAttachmentByName(slotName: string, attachmentName: string): Attachment {
    return this.getAttachment(this.data.findSlotIndex(slotName), attachmentName);
  }

  /** Finds an attachment by looking in the {@link #skin} and {@link SkeletonData#defaultSkin} using the slot index and
   * attachment name. First the skin is checked and if the attachment was not found, the default skin is checked.
   *
   * See [Runtime skins](http://esotericsoftware.com/spine-runtime-skins) in the Spine Runtimes Guide.
   * @returns May be null. */
  getAttachment(slotIndex: number, attachmentName: string): Attachment {
    if (attachmentName == null) throw new Error("attachmentName cannot be null.");
    if (this.skin != null) {
      const attachment: Attachment = this.skin.getAttachment(slotIndex, attachmentName);
      if (attachment != null) return attachment;
    }
    if (this.data.defaultSkin != null) return this.data.defaultSkin.getAttachment(slotIndex, attachmentName);
    return null;
  }

  /** A convenience method to set an attachment by finding the slot with {@link #findSlot()}, finding the attachment with
   * {@link #getAttachment()}, then setting the slot's {@link Slot#attachment}.
   * @param attachmentName May be null to clear the slot's attachment. */
  setAttachment(slotName: string, attachmentName: string) {
    if (slotName == null) throw new Error("slotName cannot be null.");
    const slots = this.slots;
    for (let i = 0, n = slots.length; i < n; i++) {
      const slot = slots[i];
      if (slot.data.name == slotName) {
        let attachment: Attachment = null;
        if (attachmentName != null) {
          attachment = this.getAttachment(i, attachmentName);
          if (attachment == null)
            throw new Error("Attachment not found: " + attachmentName + ", for slot: " + slotName);
        }
        slot.setAttachment(attachment);
        return;
      }
    }
    throw new Error("Slot not found: " + slotName);
  }

  /** Finds an IK constraint by comparing each IK constraint's name. It is more efficient to cache the results of this method
   * than to call it repeatedly.
   * @return May be null. */
  findIkConstraint(constraintName: string) {
    if (constraintName == null) throw new Error("constraintName cannot be null.");
    const ikConstraints = this.ikConstraints;
    for (let i = 0, n = ikConstraints.length; i < n; i++) {
      const ikConstraint = ikConstraints[i];
      if (ikConstraint.data.name == constraintName) return ikConstraint;
    }
    return null;
  }

  /** Finds a transform constraint by comparing each transform constraint's name. It is more efficient to cache the results of
   * this method than to call it repeatedly.
   * @return May be null. */
  findTransformConstraint(constraintName: string) {
    if (constraintName == null) throw new Error("constraintName cannot be null.");
    const transformConstraints = this.transformConstraints;
    for (let i = 0, n = transformConstraints.length; i < n; i++) {
      const constraint = transformConstraints[i];
      if (constraint.data.name == constraintName) return constraint;
    }
    return null;
  }

  /** Finds a path constraint by comparing each path constraint's name. It is more efficient to cache the results of this method
   * than to call it repeatedly.
   * @return May be null. */
  findPathConstraint(constraintName: string) {
    if (constraintName == null) throw new Error("constraintName cannot be null.");
    const pathConstraints = this.pathConstraints;
    for (let i = 0, n = pathConstraints.length; i < n; i++) {
      const constraint = pathConstraints[i];
      if (constraint.data.name == constraintName) return constraint;
    }
    return null;
  }

  /** Returns the axis aligned bounding box (AABB) of the region and mesh attachments for the current pose.
   * @param offset An output value, the distance from the skeleton origin to the bottom left corner of the AABB.
   * @param size An output value, the width and height of the AABB.
   * @param temp Working memory to temporarily store attachments' computed world vertices. */
  getBounds(offset: Vector2, size: Vector2, temp: Array<number> = new Array<number>(2)) {
    if (offset == null) throw new Error("offset cannot be null.");
    if (size == null) throw new Error("size cannot be null.");
    const drawOrder = this.drawOrder;
    let minX = Number.POSITIVE_INFINITY,
      minY = Number.POSITIVE_INFINITY,
      maxX = Number.NEGATIVE_INFINITY,
      maxY = Number.NEGATIVE_INFINITY;
    for (let i = 0, n = drawOrder.length; i < n; i++) {
      const slot = drawOrder[i];
      if (!slot.bone.active) continue;
      let verticesLength = 0;
      let vertices: ArrayLike<number> = null;
      const attachment = slot.getAttachment();
      if (attachment instanceof RegionAttachment) {
        verticesLength = 8;
        vertices = Utils.setArraySize(temp, verticesLength, 0);
        (<RegionAttachment>attachment).computeWorldVertices(slot.bone, vertices, 0, 2);
      } else if (attachment instanceof MeshAttachment) {
        const mesh = <MeshAttachment>attachment;
        verticesLength = mesh.worldVerticesLength;
        vertices = Utils.setArraySize(temp, verticesLength, 0);
        mesh.computeWorldVertices(slot, 0, verticesLength, vertices, 0, 2);
      }
      if (vertices != null) {
        for (let ii = 0, nn = vertices.length; ii < nn; ii += 2) {
          const x = vertices[ii],
            y = vertices[ii + 1];
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }
    offset.set(minX, minY);
    size.set(maxX - minX, maxY - minY);
  }

  /** Increments the skeleton's {@link #time}. */
  update(delta: number) {
    this.time += delta;
  }
}
