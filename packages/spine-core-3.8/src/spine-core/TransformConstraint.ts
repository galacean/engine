import { Updatable } from "./Updatable";
import { TransformConstraintData } from "./TransformConstraintData";
import { Bone } from "./Bone";
import { Skeleton } from "./Skeleton";
import { MathUtils, Vector2 } from "./Utils";

/** Stores the current pose for a transform constraint. A transform constraint adjusts the world transform of the constrained
 * bones to match that of the target bone.
 *
 * See [Transform constraints](http://esotericsoftware.com/spine-transform-constraints) in the Spine User Guide. */
export class TransformConstraint implements Updatable {
  /** The transform constraint's setup pose data. */
  data: TransformConstraintData;

  /** The bones that will be modified by this transform constraint. */
  bones: Array<Bone>;

  /** The target bone whose world transform will be copied to the constrained bones. */
  target: Bone;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained rotations. */
  rotateMix = 0;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained translations. */
  translateMix = 0;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained scales. */
  scaleMix = 0;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained scales. */
  shearMix = 0;

  temp = new Vector2();
  active = false;

  constructor(data: TransformConstraintData, skeleton: Skeleton) {
    if (data == null) throw new Error("data cannot be null.");
    if (skeleton == null) throw new Error("skeleton cannot be null.");
    this.data = data;
    this.rotateMix = data.rotateMix;
    this.translateMix = data.translateMix;
    this.scaleMix = data.scaleMix;
    this.shearMix = data.shearMix;
    this.bones = new Array<Bone>();
    for (let i = 0; i < data.bones.length; i++) this.bones.push(skeleton.findBone(data.bones[i].name));
    this.target = skeleton.findBone(data.target.name);
  }

  isActive() {
    return this.active;
  }

  /** Applies the constraint to the constrained bones. */
  apply() {
    this.update();
  }

  update() {
    if (this.data.local) {
      if (this.data.relative) this.applyRelativeLocal();
      else this.applyAbsoluteLocal();
    } else {
      if (this.data.relative) this.applyRelativeWorld();
      else this.applyAbsoluteWorld();
    }
  }

  applyAbsoluteWorld() {
    const rotateMix = this.rotateMix,
      translateMix = this.translateMix,
      scaleMix = this.scaleMix,
      shearMix = this.shearMix;
    const target = this.target;
    const ta = target.a,
      tb = target.b,
      tc = target.c,
      td = target.d;
    const degRadReflect = ta * td - tb * tc > 0 ? MathUtils.degRad : -MathUtils.degRad;
    const offsetRotation = this.data.offsetRotation * degRadReflect;
    const offsetShearY = this.data.offsetShearY * degRadReflect;
    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i];
      let modified = false;

      if (rotateMix != 0) {
        const a = bone.a,
          b = bone.b,
          c = bone.c,
          d = bone.d;
        let r = Math.atan2(tc, ta) - Math.atan2(c, a) + offsetRotation;
        if (r > MathUtils.PI) r -= MathUtils.PI2;
        else if (r < -MathUtils.PI) r += MathUtils.PI2;
        r *= rotateMix;
        const cos = Math.cos(r),
          sin = Math.sin(r);
        bone.a = cos * a - sin * c;
        bone.b = cos * b - sin * d;
        bone.c = sin * a + cos * c;
        bone.d = sin * b + cos * d;
        modified = true;
      }

      if (translateMix != 0) {
        const temp = this.temp;
        target.localToWorld(temp.set(this.data.offsetX, this.data.offsetY));
        bone.worldX += (temp.x - bone.worldX) * translateMix;
        bone.worldY += (temp.y - bone.worldY) * translateMix;
        modified = true;
      }

      if (scaleMix > 0) {
        let s = Math.sqrt(bone.a * bone.a + bone.c * bone.c);
        let ts = Math.sqrt(ta * ta + tc * tc);
        if (s > 0.00001) s = (s + (ts - s + this.data.offsetScaleX) * scaleMix) / s;
        bone.a *= s;
        bone.c *= s;
        s = Math.sqrt(bone.b * bone.b + bone.d * bone.d);
        ts = Math.sqrt(tb * tb + td * td);
        if (s > 0.00001) s = (s + (ts - s + this.data.offsetScaleY) * scaleMix) / s;
        bone.b *= s;
        bone.d *= s;
        modified = true;
      }

      if (shearMix > 0) {
        const b = bone.b,
          d = bone.d;
        const by = Math.atan2(d, b);
        let r = Math.atan2(td, tb) - Math.atan2(tc, ta) - (by - Math.atan2(bone.c, bone.a));
        if (r > MathUtils.PI) r -= MathUtils.PI2;
        else if (r < -MathUtils.PI) r += MathUtils.PI2;
        r = by + (r + offsetShearY) * shearMix;
        const s = Math.sqrt(b * b + d * d);
        bone.b = Math.cos(r) * s;
        bone.d = Math.sin(r) * s;
        modified = true;
      }

      if (modified) bone.appliedValid = false;
    }
  }

  applyRelativeWorld() {
    const rotateMix = this.rotateMix,
      translateMix = this.translateMix,
      scaleMix = this.scaleMix,
      shearMix = this.shearMix;
    const target = this.target;
    const ta = target.a,
      tb = target.b,
      tc = target.c,
      td = target.d;
    const degRadReflect = ta * td - tb * tc > 0 ? MathUtils.degRad : -MathUtils.degRad;
    const offsetRotation = this.data.offsetRotation * degRadReflect,
      offsetShearY = this.data.offsetShearY * degRadReflect;
    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i];
      let modified = false;

      if (rotateMix != 0) {
        const a = bone.a,
          b = bone.b,
          c = bone.c,
          d = bone.d;
        let r = Math.atan2(tc, ta) + offsetRotation;
        if (r > MathUtils.PI) r -= MathUtils.PI2;
        else if (r < -MathUtils.PI) r += MathUtils.PI2;
        r *= rotateMix;
        const cos = Math.cos(r),
          sin = Math.sin(r);
        bone.a = cos * a - sin * c;
        bone.b = cos * b - sin * d;
        bone.c = sin * a + cos * c;
        bone.d = sin * b + cos * d;
        modified = true;
      }

      if (translateMix != 0) {
        const temp = this.temp;
        target.localToWorld(temp.set(this.data.offsetX, this.data.offsetY));
        bone.worldX += temp.x * translateMix;
        bone.worldY += temp.y * translateMix;
        modified = true;
      }

      if (scaleMix > 0) {
        let s = (Math.sqrt(ta * ta + tc * tc) - 1 + this.data.offsetScaleX) * scaleMix + 1;
        bone.a *= s;
        bone.c *= s;
        s = (Math.sqrt(tb * tb + td * td) - 1 + this.data.offsetScaleY) * scaleMix + 1;
        bone.b *= s;
        bone.d *= s;
        modified = true;
      }

      if (shearMix > 0) {
        let r = Math.atan2(td, tb) - Math.atan2(tc, ta);
        if (r > MathUtils.PI) r -= MathUtils.PI2;
        else if (r < -MathUtils.PI) r += MathUtils.PI2;
        const b = bone.b,
          d = bone.d;
        r = Math.atan2(d, b) + (r - MathUtils.PI / 2 + offsetShearY) * shearMix;
        const s = Math.sqrt(b * b + d * d);
        bone.b = Math.cos(r) * s;
        bone.d = Math.sin(r) * s;
        modified = true;
      }

      if (modified) bone.appliedValid = false;
    }
  }

  applyAbsoluteLocal() {
    const rotateMix = this.rotateMix,
      translateMix = this.translateMix,
      scaleMix = this.scaleMix,
      shearMix = this.shearMix;
    const target = this.target;
    if (!target.appliedValid) target.updateAppliedTransform();
    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i];
      if (!bone.appliedValid) bone.updateAppliedTransform();

      let rotation = bone.arotation;
      if (rotateMix != 0) {
        let r = target.arotation - rotation + this.data.offsetRotation;
        r -= (16384 - ((16384.499999999996 - r / 360) | 0)) * 360;
        rotation += r * rotateMix;
      }

      let x = bone.ax,
        y = bone.ay;
      if (translateMix != 0) {
        x += (target.ax - x + this.data.offsetX) * translateMix;
        y += (target.ay - y + this.data.offsetY) * translateMix;
      }

      let scaleX = bone.ascaleX,
        scaleY = bone.ascaleY;
      if (scaleMix != 0) {
        if (scaleX > 0.00001)
          scaleX = (scaleX + (target.ascaleX - scaleX + this.data.offsetScaleX) * scaleMix) / scaleX;
        if (scaleY > 0.00001)
          scaleY = (scaleY + (target.ascaleY - scaleY + this.data.offsetScaleY) * scaleMix) / scaleY;
      }

      const shearY = bone.ashearY;
      if (shearMix != 0) {
        let r = target.ashearY - shearY + this.data.offsetShearY;
        r -= (16384 - ((16384.499999999996 - r / 360) | 0)) * 360;
        bone.shearY += r * shearMix;
      }

      bone.updateWorldTransformWith(x, y, rotation, scaleX, scaleY, bone.ashearX, shearY);
    }
  }

  applyRelativeLocal() {
    const rotateMix = this.rotateMix,
      translateMix = this.translateMix,
      scaleMix = this.scaleMix,
      shearMix = this.shearMix;
    const target = this.target;
    if (!target.appliedValid) target.updateAppliedTransform();
    const bones = this.bones;
    for (let i = 0, n = bones.length; i < n; i++) {
      const bone = bones[i];
      if (!bone.appliedValid) bone.updateAppliedTransform();

      let rotation = bone.arotation;
      if (rotateMix != 0) rotation += (target.arotation + this.data.offsetRotation) * rotateMix;

      let x = bone.ax,
        y = bone.ay;
      if (translateMix != 0) {
        x += (target.ax + this.data.offsetX) * translateMix;
        y += (target.ay + this.data.offsetY) * translateMix;
      }

      let scaleX = bone.ascaleX,
        scaleY = bone.ascaleY;
      if (scaleMix != 0) {
        if (scaleX > 0.00001) scaleX *= (target.ascaleX - 1 + this.data.offsetScaleX) * scaleMix + 1;
        if (scaleY > 0.00001) scaleY *= (target.ascaleY - 1 + this.data.offsetScaleY) * scaleMix + 1;
      }

      let shearY = bone.ashearY;
      if (shearMix != 0) shearY += (target.ashearY + this.data.offsetShearY) * shearMix;

      bone.updateWorldTransformWith(x, y, rotation, scaleX, scaleY, bone.ashearX, shearY);
    }
  }
}
