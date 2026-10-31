import { Updatable } from "./Updatable";
import { IkConstraintData } from "./IkConstraintData";
import { Bone } from "./Bone";
import { Skeleton } from "./Skeleton";
import { TransformMode } from "./BoneData";
import { MathUtils } from "./Utils";

/** Stores the current pose for an IK constraint. An IK constraint adjusts the rotation of 1 or 2 constrained bones so the tip of
 * the last bone is as close to the target bone as possible.
 *
 * See [IK constraints](http://esotericsoftware.com/spine-ik-constraints) in the Spine User Guide. */
export class IkConstraint implements Updatable {
  /** The IK constraint's setup pose data. */
  data: IkConstraintData;

  /** The bones that will be modified by this IK constraint. */
  bones: Array<Bone>;

  /** The bone that is the IK target. */
  target: Bone;

  /** Controls the bend direction of the IK bones, either 1 or -1. */
  bendDirection = 0;

  /** When true and only a single bone is being constrained, if the target is too close, the bone is scaled to reach it. */
  compress = false;

  /** When true, if the target is out of range, the parent bone is scaled to reach it. If more than one bone is being constrained
   * and the parent bone has local nonuniform scale, stretch is not applied. */
  stretch = false;

  /** A percentage (0-1) that controls the mix between the constrained and unconstrained rotations. */
  mix = 1;

  /** For two bone IK, the distance from the maximum reach of the bones that rotation will slow. */
  softness = 0;
  active = false;

  constructor(data: IkConstraintData, skeleton: Skeleton) {
    if (data == null) throw new Error("data cannot be null.");
    if (skeleton == null) throw new Error("skeleton cannot be null.");
    this.data = data;
    this.mix = data.mix;
    this.softness = data.softness;
    this.bendDirection = data.bendDirection;
    this.compress = data.compress;
    this.stretch = data.stretch;

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
    const target = this.target;
    const bones = this.bones;
    switch (bones.length) {
      case 1:
        this.apply1(bones[0], target.worldX, target.worldY, this.compress, this.stretch, this.data.uniform, this.mix);
        break;
      case 2:
        this.apply2(
          bones[0],
          bones[1],
          target.worldX,
          target.worldY,
          this.bendDirection,
          this.stretch,
          this.softness,
          this.mix
        );
        break;
    }
  }

  /** Applies 1 bone IK. The target is specified in the world coordinate system. */
  apply1(
    bone: Bone,
    targetX: number,
    targetY: number,
    compress: boolean,
    stretch: boolean,
    uniform: boolean,
    alpha: number
  ) {
    if (!bone.appliedValid) bone.updateAppliedTransform();
    const p = bone.parent;

    let pa = p.a,
      pb = p.b,
      pc = p.c,
      pd = p.d;
    let rotationIK = -bone.ashearX - bone.arotation,
      tx = 0,
      ty = 0;

    switch (bone.data.transformMode) {
      case TransformMode.OnlyTranslation:
        tx = targetX - bone.worldX;
        ty = targetY - bone.worldY;
        break;
      case TransformMode.NoRotationOrReflection:
        const s = Math.abs(pa * pd - pb * pc) / (pa * pa + pc * pc);
        const sa = pa / bone.skeleton.scaleX;
        const sc = pc / bone.skeleton.scaleY;
        pb = -sc * s * bone.skeleton.scaleX;
        pd = sa * s * bone.skeleton.scaleY;
        rotationIK += Math.atan2(sc, sa) * MathUtils.radDeg;
      // Fall through
      default:
        const x = targetX - p.worldX,
          y = targetY - p.worldY;
        const d = pa * pd - pb * pc;
        tx = (x * pd - y * pb) / d - bone.ax;
        ty = (y * pa - x * pc) / d - bone.ay;
    }
    rotationIK += Math.atan2(ty, tx) * MathUtils.radDeg;
    if (bone.ascaleX < 0) rotationIK += 180;
    if (rotationIK > 180) rotationIK -= 360;
    else if (rotationIK < -180) rotationIK += 360;
    let sx = bone.ascaleX,
      sy = bone.ascaleY;
    if (compress || stretch) {
      switch (bone.data.transformMode) {
        case TransformMode.NoScale:
        case TransformMode.NoScaleOrReflection:
          tx = targetX - bone.worldX;
          ty = targetY - bone.worldY;
      }
      const b = bone.data.length * sx,
        dd = Math.sqrt(tx * tx + ty * ty);
      if ((compress && dd < b) || (stretch && dd > b && b > 0.0001)) {
        const s = (dd / b - 1) * alpha + 1;
        sx *= s;
        if (uniform) sy *= s;
      }
    }
    bone.updateWorldTransformWith(
      bone.ax,
      bone.ay,
      bone.arotation + rotationIK * alpha,
      sx,
      sy,
      bone.ashearX,
      bone.ashearY
    );
  }

  /** Applies 2 bone IK. The target is specified in the world coordinate system.
   * @param child A direct descendant of the parent bone. */
  apply2(
    parent: Bone,
    child: Bone,
    targetX: number,
    targetY: number,
    bendDir: number,
    stretch: boolean,
    softness: number,
    alpha: number
  ) {
    if (alpha == 0) {
      child.updateWorldTransform();
      return;
    }
    if (!parent.appliedValid) parent.updateAppliedTransform();
    if (!child.appliedValid) child.updateAppliedTransform();
    let px = parent.ax,
      py = parent.ay,
      psx = parent.ascaleX,
      sx = psx,
      psy = parent.ascaleY,
      csx = child.ascaleX;
    let os1 = 0,
      os2 = 0,
      s2 = 0;
    if (psx < 0) {
      psx = -psx;
      os1 = 180;
      s2 = -1;
    } else {
      os1 = 0;
      s2 = 1;
    }
    if (psy < 0) {
      psy = -psy;
      s2 = -s2;
    }
    if (csx < 0) {
      csx = -csx;
      os2 = 180;
    } else os2 = 0;
    let cx = child.ax,
      cy = 0,
      cwx = 0,
      cwy = 0,
      a = parent.a,
      b = parent.b,
      c = parent.c,
      d = parent.d;
    const u = Math.abs(psx - psy) <= 0.0001;
    if (!u) {
      cy = 0;
      cwx = a * cx + parent.worldX;
      cwy = c * cx + parent.worldY;
    } else {
      cy = child.ay;
      cwx = a * cx + b * cy + parent.worldX;
      cwy = c * cx + d * cy + parent.worldY;
    }
    const pp = parent.parent;
    a = pp.a;
    b = pp.b;
    c = pp.c;
    d = pp.d;
    let id = 1 / (a * d - b * c),
      x = cwx - pp.worldX,
      y = cwy - pp.worldY;
    const dx = (x * d - y * b) * id - px,
      dy = (y * a - x * c) * id - py;
    let l1 = Math.sqrt(dx * dx + dy * dy),
      l2 = child.data.length * csx,
      a1,
      a2;
    if (l1 < 0.0001) {
      this.apply1(parent, targetX, targetY, false, stretch, false, alpha);
      child.updateWorldTransformWith(cx, cy, 0, child.ascaleX, child.ascaleY, child.ashearX, child.ashearY);
      return;
    }
    x = targetX - pp.worldX;
    y = targetY - pp.worldY;
    let tx = (x * d - y * b) * id - px,
      ty = (y * a - x * c) * id - py;
    let dd = tx * tx + ty * ty;
    if (softness != 0) {
      softness *= (psx * (csx + 1)) / 2;
      const td = Math.sqrt(dd),
        sd = td - l1 - l2 * psx + softness;
      if (sd > 0) {
        let p = Math.min(1, sd / (softness * 2)) - 1;
        p = (sd - softness * (1 - p * p)) / td;
        tx -= p * tx;
        ty -= p * ty;
        dd = tx * tx + ty * ty;
      }
    }
    outer: if (u) {
      l2 *= psx;
      let cos = (dd - l1 * l1 - l2 * l2) / (2 * l1 * l2);
      if (cos < -1) cos = -1;
      else if (cos > 1) {
        cos = 1;
        if (stretch) sx *= (Math.sqrt(dd) / (l1 + l2) - 1) * alpha + 1;
      }
      a2 = Math.acos(cos) * bendDir;
      a = l1 + l2 * cos;
      b = l2 * Math.sin(a2);
      a1 = Math.atan2(ty * a - tx * b, tx * a + ty * b);
    } else {
      a = psx * l2;
      b = psy * l2;
      const aa = a * a,
        bb = b * b,
        ta = Math.atan2(ty, tx);
      c = bb * l1 * l1 + aa * dd - aa * bb;
      const c1 = -2 * bb * l1,
        c2 = bb - aa;
      d = c1 * c1 - 4 * c2 * c;
      if (d >= 0) {
        let q = Math.sqrt(d);
        if (c1 < 0) q = -q;
        q = -(c1 + q) / 2;
        const r0 = q / c2,
          r1 = c / q;
        const r = Math.abs(r0) < Math.abs(r1) ? r0 : r1;
        if (r * r <= dd) {
          y = Math.sqrt(dd - r * r) * bendDir;
          a1 = ta - Math.atan2(y, r);
          a2 = Math.atan2(y / psy, (r - l1) / psx);
          break outer;
        }
      }
      let minAngle = MathUtils.PI,
        minX = l1 - a,
        minDist = minX * minX,
        minY = 0;
      let maxAngle = 0,
        maxX = l1 + a,
        maxDist = maxX * maxX,
        maxY = 0;
      c = (-a * l1) / (aa - bb);
      if (c >= -1 && c <= 1) {
        c = Math.acos(c);
        x = a * Math.cos(c) + l1;
        y = b * Math.sin(c);
        d = x * x + y * y;
        if (d < minDist) {
          minAngle = c;
          minDist = d;
          minX = x;
          minY = y;
        }
        if (d > maxDist) {
          maxAngle = c;
          maxDist = d;
          maxX = x;
          maxY = y;
        }
      }
      if (dd <= (minDist + maxDist) / 2) {
        a1 = ta - Math.atan2(minY * bendDir, minX);
        a2 = minAngle * bendDir;
      } else {
        a1 = ta - Math.atan2(maxY * bendDir, maxX);
        a2 = maxAngle * bendDir;
      }
    }
    const os = Math.atan2(cy, cx) * s2;
    let rotation = parent.arotation;
    a1 = (a1 - os) * MathUtils.radDeg + os1 - rotation;
    if (a1 > 180) a1 -= 360;
    else if (a1 < -180) a1 += 360;
    parent.updateWorldTransformWith(px, py, rotation + a1 * alpha, sx, parent.ascaleY, 0, 0);
    rotation = child.arotation;
    a2 = ((a2 + os) * MathUtils.radDeg - child.ashearX) * s2 + os2 - rotation;
    if (a2 > 180) a2 -= 360;
    else if (a2 < -180) a2 += 360;
    child.updateWorldTransformWith(
      cx,
      cy,
      rotation + a2 * alpha,
      child.ascaleX,
      child.ascaleY,
      child.ashearX,
      child.ashearY
    );
  }
}
