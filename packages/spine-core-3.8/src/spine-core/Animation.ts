import { Skeleton } from "./Skeleton";
import { Utils, MathUtils, ArrayLike } from "./Utils";
import { Slot } from "./Slot";
import { VertexAttachment, Attachment } from "./attachments/Attachment";
import { IkConstraint } from "./IkConstraint";
import { TransformConstraint } from "./TransformConstraint";
import { PathConstraint } from "./PathConstraint";
import { Event } from "./Event";

/** A simple container for a list of timelines and a name. */
export class Animation {
  /** The animation's name, which is unique across all animations in the skeleton. */
  name: string;
  timelines: Array<Timeline>;
  timelineIds: Array<boolean>;

  /** The duration of the animation in seconds, which is the highest time of all keys in the timeline. */
  duration: number;

  constructor(name: string, timelines: Array<Timeline>, duration: number) {
    if (name == null) throw new Error("name cannot be null.");
    if (timelines == null) throw new Error("timelines cannot be null.");
    this.name = name;
    this.timelines = timelines;
    this.timelineIds = [];
    for (let i = 0; i < timelines.length; i++) this.timelineIds[timelines[i].getPropertyId()] = true;
    this.duration = duration;
  }

  hasTimeline(id: number) {
    return this.timelineIds[id] == true;
  }

  /** Applies all the animation's timelines to the specified skeleton.
   *
   * See Timeline {@link Timeline#apply(Skeleton, float, float, Array, float, MixBlend, MixDirection)}.
   * @param loop If true, the animation repeats after {@link #getDuration()}.
   * @param events May be null to ignore fired events. */
  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    loop: boolean,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    if (skeleton == null) throw new Error("skeleton cannot be null.");

    if (loop && this.duration != 0) {
      time %= this.duration;
      if (lastTime > 0) lastTime %= this.duration;
    }

    const timelines = this.timelines;
    for (let i = 0, n = timelines.length; i < n; i++)
      timelines[i].apply(skeleton, lastTime, time, events, alpha, blend, direction);
  }

  /** @param target After the first and before the last value.
   * @returns index of first value greater than the target. */
  static binarySearch(values: ArrayLike<number>, target: number, step: number = 1) {
    let low = 0;
    let high = values.length / step - 2;
    if (high == 0) return step;
    let current = high >>> 1;
    while (true) {
      if (values[(current + 1) * step] <= target) low = current + 1;
      else high = current;
      if (low == high) return (low + 1) * step;
      current = (low + high) >>> 1;
    }
  }

  static linearSearch(values: ArrayLike<number>, target: number, step: number) {
    for (let i = 0, last = values.length - step; i <= last; i += step) if (values[i] > target) return i;
    return -1;
  }
}

/** The interface for all timelines. */
export interface Timeline {
  /** Applies this timeline to the skeleton.
   * @param skeleton The skeleton the timeline is being applied to. This provides access to the bones, slots, and other
   *           skeleton components the timeline may change.
   * @param lastTime The time this timeline was last applied. Timelines such as {@link EventTimeline}} trigger only at specific
   *           times rather than every frame. In that case, the timeline triggers everything between `lastTime`
   *           (exclusive) and `time` (inclusive).
   * @param time The time within the animation. Most timelines find the key before and the key after this time so they can
   *           interpolate between the keys.
   * @param events If any events are fired, they are added to this list. Can be null to ignore fired events or if the timeline
   *           does not fire events.
   * @param alpha 0 applies the current or setup value (depending on `blend`). 1 applies the timeline value.
   *           Between 0 and 1 applies a value between the current or setup value and the timeline value. By adjusting
   *           `alpha` over time, an animation can be mixed in or out. `alpha` can also be useful to
   *           apply animations on top of each other (layering).
   * @param blend Controls how mixing is applied when `alpha` < 1.
   * @param direction Indicates whether the timeline is mixing in or out. Used by timelines which perform instant transitions,
   *           such as {@link DrawOrderTimeline} or {@link AttachmentTimeline}. */
  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ): void;

  /** Uniquely encodes both the type of this timeline and the skeleton property that it affects. */
  getPropertyId(): number;
}

/** Controls how a timeline value is mixed with the setup pose value or current pose value when a timeline's `alpha`
 * < 1.
 *
 * See Timeline {@link Timeline#apply(Skeleton, float, float, Array, float, MixBlend, MixDirection)}. */
export enum MixBlend {
  /** Transitions from the setup value to the timeline value (the current value is not used). Before the first key, the setup
   * value is set. */
  setup,
  /** Transitions from the current value to the timeline value. Before the first key, transitions from the current value to
   * the setup value. Timelines which perform instant transitions, such as {@link DrawOrderTimeline} or
   * {@link AttachmentTimeline}, use the setup value before the first key.
   *
   * `first` is intended for the first animations applied, not for animations layered on top of those. */
  first,
  /** Transitions from the current value to the timeline value. No change is made before the first key (the current value is
   * kept until the first key).
   *
   * `replace` is intended for animations layered on top of others, not for the first animations applied. */
  replace,
  /** Transitions from the current value to the current value plus the timeline value. No change is made before the first key
   * (the current value is kept until the first key).
   *
   * `add` is intended for animations layered on top of others, not for the first animations applied. Properties
   * keyed by additive animations must be set manually or by another animation before applying the additive animations, else
   * the property values will increase continually. */
  add
}

/** Indicates whether a timeline's `alpha` is mixing out over time toward 0 (the setup or current pose value) or
 * mixing in toward 1 (the timeline's value).
 *
 * See Timeline {@link Timeline#apply(Skeleton, float, float, Array, float, MixBlend, MixDirection)}. */
export enum MixDirection {
  mixIn,
  mixOut
}

export enum TimelineType {
  rotate,
  translate,
  scale,
  shear,
  attachment,
  color,
  deform,
  event,
  drawOrder,
  ikConstraint,
  transformConstraint,
  pathConstraintPosition,
  pathConstraintSpacing,
  pathConstraintMix,
  twoColor
}

/** The base class for timelines that use interpolation between key frame values. */
export abstract class CurveTimeline implements Timeline {
  static LINEAR = 0;
  static STEPPED = 1;
  static BEZIER = 2;
  static BEZIER_SIZE = 10 * 2 - 1;

  private curves: ArrayLike<number>; // type, x, y, ...

  abstract getPropertyId(): number;

  constructor(frameCount: number) {
    if (frameCount <= 0) throw new Error("frameCount must be > 0: " + frameCount);
    this.curves = Utils.newFloatArray((frameCount - 1) * CurveTimeline.BEZIER_SIZE);
  }

  /** The number of key frames for this timeline. */
  getFrameCount() {
    return this.curves.length / CurveTimeline.BEZIER_SIZE + 1;
  }

  /** Sets the specified key frame to linear interpolation. */
  setLinear(frameIndex: number) {
    this.curves[frameIndex * CurveTimeline.BEZIER_SIZE] = CurveTimeline.LINEAR;
  }

  /** Sets the specified key frame to stepped interpolation. */
  setStepped(frameIndex: number) {
    this.curves[frameIndex * CurveTimeline.BEZIER_SIZE] = CurveTimeline.STEPPED;
  }

  /** Returns the interpolation type for the specified key frame.
   * @returns Linear is 0, stepped is 1, Bezier is 2. */
  getCurveType(frameIndex: number): number {
    const index = frameIndex * CurveTimeline.BEZIER_SIZE;
    if (index == this.curves.length) return CurveTimeline.LINEAR;
    const type = this.curves[index];
    if (type == CurveTimeline.LINEAR) return CurveTimeline.LINEAR;
    if (type == CurveTimeline.STEPPED) return CurveTimeline.STEPPED;
    return CurveTimeline.BEZIER;
  }

  /** Sets the specified key frame to Bezier interpolation. `cx1` and `cx2` are from 0 to 1,
   * representing the percent of time between the two key frames. `cy1` and `cy2` are the percent of the
   * difference between the key frame's values. */
  setCurve(frameIndex: number, cx1: number, cy1: number, cx2: number, cy2: number) {
    const tmpx = (-cx1 * 2 + cx2) * 0.03,
      tmpy = (-cy1 * 2 + cy2) * 0.03;
    const dddfx = ((cx1 - cx2) * 3 + 1) * 0.006,
      dddfy = ((cy1 - cy2) * 3 + 1) * 0.006;
    let ddfx = tmpx * 2 + dddfx,
      ddfy = tmpy * 2 + dddfy;
    let dfx = cx1 * 0.3 + tmpx + dddfx * 0.16666667,
      dfy = cy1 * 0.3 + tmpy + dddfy * 0.16666667;

    let i = frameIndex * CurveTimeline.BEZIER_SIZE;
    const curves = this.curves;
    curves[i++] = CurveTimeline.BEZIER;

    let x = dfx,
      y = dfy;
    for (let n = i + CurveTimeline.BEZIER_SIZE - 1; i < n; i += 2) {
      curves[i] = x;
      curves[i + 1] = y;
      dfx += ddfx;
      dfy += ddfy;
      ddfx += dddfx;
      ddfy += dddfy;
      x += dfx;
      y += dfy;
    }
  }

  /** Returns the interpolated percentage for the specified key frame and linear percentage. */
  getCurvePercent(frameIndex: number, percent: number) {
    percent = MathUtils.clamp(percent, 0, 1);
    const curves = this.curves;
    let i = frameIndex * CurveTimeline.BEZIER_SIZE;
    const type = curves[i];
    if (type == CurveTimeline.LINEAR) return percent;
    if (type == CurveTimeline.STEPPED) return 0;
    i++;
    let x = 0;
    for (let start = i, n = i + CurveTimeline.BEZIER_SIZE - 1; i < n; i += 2) {
      x = curves[i];
      if (x >= percent) {
        let prevX: number, prevY: number;
        if (i == start) {
          prevX = 0;
          prevY = 0;
        } else {
          prevX = curves[i - 2];
          prevY = curves[i - 1];
        }
        return prevY + ((curves[i + 1] - prevY) * (percent - prevX)) / (x - prevX);
      }
    }
    const y = curves[i - 1];
    return y + ((1 - y) * (percent - x)) / (1 - x); // Last point is 1,1.
  }

  abstract apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ): void;
}

/** Changes a bone's local {@link Bone#rotation}. */
export class RotateTimeline extends CurveTimeline {
  static ENTRIES = 2;
  static PREV_TIME = -2;
  static PREV_ROTATION = -1;
  static ROTATION = 1;

  /** The index of the bone in {@link Skeleton#bones} that will be changed. */
  boneIndex: number;

  /** The time in seconds and rotation in degrees for each key frame. */
  frames: ArrayLike<number>; // time, degrees, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount << 1);
  }

  getPropertyId() {
    return (TimelineType.rotate << 24) + this.boneIndex;
  }

  /** Sets the time and angle of the specified keyframe. */
  setFrame(frameIndex: number, time: number, degrees: number) {
    frameIndex <<= 1;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + RotateTimeline.ROTATION] = degrees;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;

    const bone = skeleton.bones[this.boneIndex];
    if (!bone.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          bone.rotation = bone.data.rotation;
          return;
        case MixBlend.first:
          const r = bone.data.rotation - bone.rotation;
          bone.rotation += (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * alpha;
      }
      return;
    }

    if (time >= frames[frames.length - RotateTimeline.ENTRIES]) {
      // Time is after last frame.
      let r = frames[frames.length + RotateTimeline.PREV_ROTATION];
      switch (blend) {
        case MixBlend.setup:
          bone.rotation = bone.data.rotation + r * alpha;
          break;
        case MixBlend.first:
        case MixBlend.replace:
          r += bone.data.rotation - bone.rotation;
          r -= (16384 - ((16384.499999999996 - r / 360) | 0)) * 360; // Wrap within -180 and 180.
        case MixBlend.add:
          bone.rotation += r * alpha;
      }
      return;
    }

    // Interpolate between the previous frame and the current frame.
    const frame = Animation.binarySearch(frames, time, RotateTimeline.ENTRIES);
    const prevRotation = frames[frame + RotateTimeline.PREV_ROTATION];
    const frameTime = frames[frame];
    const percent = this.getCurvePercent(
      (frame >> 1) - 1,
      1 - (time - frameTime) / (frames[frame + RotateTimeline.PREV_TIME] - frameTime)
    );

    let r = frames[frame + RotateTimeline.ROTATION] - prevRotation;
    r = prevRotation + (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * percent;
    switch (blend) {
      case MixBlend.setup:
        bone.rotation = bone.data.rotation + (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * alpha;
        break;
      case MixBlend.first:
      case MixBlend.replace:
        r += bone.data.rotation - bone.rotation;
      case MixBlend.add:
        bone.rotation += (r - (16384 - ((16384.499999999996 - r / 360) | 0)) * 360) * alpha;
    }
  }
}

/** Changes a bone's local {@link Bone#x} and {@link Bone#y}. */
export class TranslateTimeline extends CurveTimeline {
  static ENTRIES = 3;
  static PREV_TIME = -3;
  static PREV_X = -2;
  static PREV_Y = -1;
  static X = 1;
  static Y = 2;

  /** The index of the bone in {@link Skeleton#bones} that will be changed. */
  boneIndex: number;

  /** The time in seconds, x, and y values for each key frame. */
  frames: ArrayLike<number>; // time, x, y, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount * TranslateTimeline.ENTRIES);
  }

  getPropertyId() {
    return (TimelineType.translate << 24) + this.boneIndex;
  }

  /** Sets the time in seconds, x, and y values for the specified key frame. */
  setFrame(frameIndex: number, time: number, x: number, y: number) {
    frameIndex *= TranslateTimeline.ENTRIES;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + TranslateTimeline.X] = x;
    this.frames[frameIndex + TranslateTimeline.Y] = y;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;

    const bone = skeleton.bones[this.boneIndex];
    if (!bone.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          bone.x = bone.data.x;
          bone.y = bone.data.y;
          return;
        case MixBlend.first:
          bone.x += (bone.data.x - bone.x) * alpha;
          bone.y += (bone.data.y - bone.y) * alpha;
      }
      return;
    }

    let x = 0,
      y = 0;
    if (time >= frames[frames.length - TranslateTimeline.ENTRIES]) {
      // Time is after last frame.
      x = frames[frames.length + TranslateTimeline.PREV_X];
      y = frames[frames.length + TranslateTimeline.PREV_Y];
    } else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, TranslateTimeline.ENTRIES);
      x = frames[frame + TranslateTimeline.PREV_X];
      y = frames[frame + TranslateTimeline.PREV_Y];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / TranslateTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + TranslateTimeline.PREV_TIME] - frameTime)
      );

      x += (frames[frame + TranslateTimeline.X] - x) * percent;
      y += (frames[frame + TranslateTimeline.Y] - y) * percent;
    }
    switch (blend) {
      case MixBlend.setup:
        bone.x = bone.data.x + x * alpha;
        bone.y = bone.data.y + y * alpha;
        break;
      case MixBlend.first:
      case MixBlend.replace:
        bone.x += (bone.data.x + x - bone.x) * alpha;
        bone.y += (bone.data.y + y - bone.y) * alpha;
        break;
      case MixBlend.add:
        bone.x += x * alpha;
        bone.y += y * alpha;
    }
  }
}

/** Changes a bone's local {@link Bone#scaleX)} and {@link Bone#scaleY}. */
export class ScaleTimeline extends TranslateTimeline {
  constructor(frameCount: number) {
    super(frameCount);
  }

  override getPropertyId() {
    return (TimelineType.scale << 24) + this.boneIndex;
  }

  override apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;

    const bone = skeleton.bones[this.boneIndex];
    if (!bone.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          bone.scaleX = bone.data.scaleX;
          bone.scaleY = bone.data.scaleY;
          return;
        case MixBlend.first:
          bone.scaleX += (bone.data.scaleX - bone.scaleX) * alpha;
          bone.scaleY += (bone.data.scaleY - bone.scaleY) * alpha;
      }
      return;
    }

    let x = 0,
      y = 0;
    if (time >= frames[frames.length - ScaleTimeline.ENTRIES]) {
      // Time is after last frame.
      x = frames[frames.length + ScaleTimeline.PREV_X] * bone.data.scaleX;
      y = frames[frames.length + ScaleTimeline.PREV_Y] * bone.data.scaleY;
    } else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, ScaleTimeline.ENTRIES);
      x = frames[frame + ScaleTimeline.PREV_X];
      y = frames[frame + ScaleTimeline.PREV_Y];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / ScaleTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + ScaleTimeline.PREV_TIME] - frameTime)
      );

      x = (x + (frames[frame + ScaleTimeline.X] - x) * percent) * bone.data.scaleX;
      y = (y + (frames[frame + ScaleTimeline.Y] - y) * percent) * bone.data.scaleY;
    }
    if (alpha == 1) {
      if (blend == MixBlend.add) {
        bone.scaleX += x - bone.data.scaleX;
        bone.scaleY += y - bone.data.scaleY;
      } else {
        bone.scaleX = x;
        bone.scaleY = y;
      }
    } else {
      let bx = 0,
        by = 0;
      if (direction == MixDirection.mixOut) {
        switch (blend) {
          case MixBlend.setup:
            bx = bone.data.scaleX;
            by = bone.data.scaleY;
            bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bx) * alpha;
            bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - by) * alpha;
            break;
          case MixBlend.first:
          case MixBlend.replace:
            bx = bone.scaleX;
            by = bone.scaleY;
            bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bx) * alpha;
            bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - by) * alpha;
            break;
          case MixBlend.add:
            bx = bone.scaleX;
            by = bone.scaleY;
            bone.scaleX = bx + (Math.abs(x) * MathUtils.signum(bx) - bone.data.scaleX) * alpha;
            bone.scaleY = by + (Math.abs(y) * MathUtils.signum(by) - bone.data.scaleY) * alpha;
        }
      } else {
        switch (blend) {
          case MixBlend.setup:
            bx = Math.abs(bone.data.scaleX) * MathUtils.signum(x);
            by = Math.abs(bone.data.scaleY) * MathUtils.signum(y);
            bone.scaleX = bx + (x - bx) * alpha;
            bone.scaleY = by + (y - by) * alpha;
            break;
          case MixBlend.first:
          case MixBlend.replace:
            bx = Math.abs(bone.scaleX) * MathUtils.signum(x);
            by = Math.abs(bone.scaleY) * MathUtils.signum(y);
            bone.scaleX = bx + (x - bx) * alpha;
            bone.scaleY = by + (y - by) * alpha;
            break;
          case MixBlend.add:
            bx = MathUtils.signum(x);
            by = MathUtils.signum(y);
            bone.scaleX = Math.abs(bone.scaleX) * bx + (x - Math.abs(bone.data.scaleX) * bx) * alpha;
            bone.scaleY = Math.abs(bone.scaleY) * by + (y - Math.abs(bone.data.scaleY) * by) * alpha;
        }
      }
    }
  }
}

/** Changes a bone's local {@link Bone#shearX} and {@link Bone#shearY}. */
export class ShearTimeline extends TranslateTimeline {
  constructor(frameCount: number) {
    super(frameCount);
  }

  override getPropertyId() {
    return (TimelineType.shear << 24) + this.boneIndex;
  }

  override apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;

    const bone = skeleton.bones[this.boneIndex];
    if (!bone.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          bone.shearX = bone.data.shearX;
          bone.shearY = bone.data.shearY;
          return;
        case MixBlend.first:
          bone.shearX += (bone.data.shearX - bone.shearX) * alpha;
          bone.shearY += (bone.data.shearY - bone.shearY) * alpha;
      }
      return;
    }

    let x = 0,
      y = 0;
    if (time >= frames[frames.length - ShearTimeline.ENTRIES]) {
      // Time is after last frame.
      x = frames[frames.length + ShearTimeline.PREV_X];
      y = frames[frames.length + ShearTimeline.PREV_Y];
    } else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, ShearTimeline.ENTRIES);
      x = frames[frame + ShearTimeline.PREV_X];
      y = frames[frame + ShearTimeline.PREV_Y];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / ShearTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + ShearTimeline.PREV_TIME] - frameTime)
      );

      x = x + (frames[frame + ShearTimeline.X] - x) * percent;
      y = y + (frames[frame + ShearTimeline.Y] - y) * percent;
    }
    switch (blend) {
      case MixBlend.setup:
        bone.shearX = bone.data.shearX + x * alpha;
        bone.shearY = bone.data.shearY + y * alpha;
        break;
      case MixBlend.first:
      case MixBlend.replace:
        bone.shearX += (bone.data.shearX + x - bone.shearX) * alpha;
        bone.shearY += (bone.data.shearY + y - bone.shearY) * alpha;
        break;
      case MixBlend.add:
        bone.shearX += x * alpha;
        bone.shearY += y * alpha;
    }
  }
}

/** Changes a slot's {@link Slot#color}. */
export class ColorTimeline extends CurveTimeline {
  static ENTRIES = 5;
  static PREV_TIME = -5;
  static PREV_R = -4;
  static PREV_G = -3;
  static PREV_B = -2;
  static PREV_A = -1;
  static R = 1;
  static G = 2;
  static B = 3;
  static A = 4;

  /** The index of the slot in {@link Skeleton#slots} that will be changed. */
  slotIndex: number;

  /** The time in seconds, red, green, blue, and alpha values for each key frame. */
  frames: ArrayLike<number>; // time, r, g, b, a, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount * ColorTimeline.ENTRIES);
  }

  getPropertyId() {
    return (TimelineType.color << 24) + this.slotIndex;
  }

  /** Sets the time in seconds, red, green, blue, and alpha for the specified key frame. */
  setFrame(frameIndex: number, time: number, r: number, g: number, b: number, a: number) {
    frameIndex *= ColorTimeline.ENTRIES;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + ColorTimeline.R] = r;
    this.frames[frameIndex + ColorTimeline.G] = g;
    this.frames[frameIndex + ColorTimeline.B] = b;
    this.frames[frameIndex + ColorTimeline.A] = a;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const slot = skeleton.slots[this.slotIndex];
    if (!slot.bone.active) return;
    const frames = this.frames;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          slot.color.setFromColor(slot.data.color);
          return;
        case MixBlend.first:
          const color = slot.color,
            setup = slot.data.color;
          color.add(
            (setup.r - color.r) * alpha,
            (setup.g - color.g) * alpha,
            (setup.b - color.b) * alpha,
            (setup.a - color.a) * alpha
          );
      }
      return;
    }

    let r = 0,
      g = 0,
      b = 0,
      a = 0;
    if (time >= frames[frames.length - ColorTimeline.ENTRIES]) {
      // Time is after last frame.
      const i = frames.length;
      r = frames[i + ColorTimeline.PREV_R];
      g = frames[i + ColorTimeline.PREV_G];
      b = frames[i + ColorTimeline.PREV_B];
      a = frames[i + ColorTimeline.PREV_A];
    } else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, ColorTimeline.ENTRIES);
      r = frames[frame + ColorTimeline.PREV_R];
      g = frames[frame + ColorTimeline.PREV_G];
      b = frames[frame + ColorTimeline.PREV_B];
      a = frames[frame + ColorTimeline.PREV_A];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / ColorTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + ColorTimeline.PREV_TIME] - frameTime)
      );

      r += (frames[frame + ColorTimeline.R] - r) * percent;
      g += (frames[frame + ColorTimeline.G] - g) * percent;
      b += (frames[frame + ColorTimeline.B] - b) * percent;
      a += (frames[frame + ColorTimeline.A] - a) * percent;
    }
    if (alpha == 1) slot.color.set(r, g, b, a);
    else {
      const color = slot.color;
      if (blend == MixBlend.setup) color.setFromColor(slot.data.color);
      color.add((r - color.r) * alpha, (g - color.g) * alpha, (b - color.b) * alpha, (a - color.a) * alpha);
    }
  }
}

/** Changes a slot's {@link Slot#color} and {@link Slot#darkColor} for two color tinting. */
export class TwoColorTimeline extends CurveTimeline {
  static ENTRIES = 8;
  static PREV_TIME = -8;
  static PREV_R = -7;
  static PREV_G = -6;
  static PREV_B = -5;
  static PREV_A = -4;
  static PREV_R2 = -3;
  static PREV_G2 = -2;
  static PREV_B2 = -1;
  static R = 1;
  static G = 2;
  static B = 3;
  static A = 4;
  static R2 = 5;
  static G2 = 6;
  static B2 = 7;

  /** The index of the slot in {@link Skeleton#slots()} that will be changed. The {@link Slot#darkColor()} must not be
   * null. */
  slotIndex: number;

  /** The time in seconds, red, green, blue, and alpha values of the color, red, green, blue of the dark color, for each key frame. */
  frames: ArrayLike<number>; // time, r, g, b, a, r2, g2, b2, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount * TwoColorTimeline.ENTRIES);
  }

  getPropertyId() {
    return (TimelineType.twoColor << 24) + this.slotIndex;
  }

  /** Sets the time in seconds, light, and dark colors for the specified key frame. */
  setFrame(
    frameIndex: number,
    time: number,
    r: number,
    g: number,
    b: number,
    a: number,
    r2: number,
    g2: number,
    b2: number
  ) {
    frameIndex *= TwoColorTimeline.ENTRIES;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + TwoColorTimeline.R] = r;
    this.frames[frameIndex + TwoColorTimeline.G] = g;
    this.frames[frameIndex + TwoColorTimeline.B] = b;
    this.frames[frameIndex + TwoColorTimeline.A] = a;
    this.frames[frameIndex + TwoColorTimeline.R2] = r2;
    this.frames[frameIndex + TwoColorTimeline.G2] = g2;
    this.frames[frameIndex + TwoColorTimeline.B2] = b2;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const slot = skeleton.slots[this.slotIndex];
    if (!slot.bone.active) return;
    const frames = this.frames;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          slot.color.setFromColor(slot.data.color);
          slot.darkColor.setFromColor(slot.data.darkColor);
          return;
        case MixBlend.first:
          const light = slot.color,
            dark = slot.darkColor,
            setupLight = slot.data.color,
            setupDark = slot.data.darkColor;
          light.add(
            (setupLight.r - light.r) * alpha,
            (setupLight.g - light.g) * alpha,
            (setupLight.b - light.b) * alpha,
            (setupLight.a - light.a) * alpha
          );
          dark.add((setupDark.r - dark.r) * alpha, (setupDark.g - dark.g) * alpha, (setupDark.b - dark.b) * alpha, 0);
      }
      return;
    }

    let r = 0,
      g = 0,
      b = 0,
      a = 0,
      r2 = 0,
      g2 = 0,
      b2 = 0;
    if (time >= frames[frames.length - TwoColorTimeline.ENTRIES]) {
      // Time is after last frame.
      const i = frames.length;
      r = frames[i + TwoColorTimeline.PREV_R];
      g = frames[i + TwoColorTimeline.PREV_G];
      b = frames[i + TwoColorTimeline.PREV_B];
      a = frames[i + TwoColorTimeline.PREV_A];
      r2 = frames[i + TwoColorTimeline.PREV_R2];
      g2 = frames[i + TwoColorTimeline.PREV_G2];
      b2 = frames[i + TwoColorTimeline.PREV_B2];
    } else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, TwoColorTimeline.ENTRIES);
      r = frames[frame + TwoColorTimeline.PREV_R];
      g = frames[frame + TwoColorTimeline.PREV_G];
      b = frames[frame + TwoColorTimeline.PREV_B];
      a = frames[frame + TwoColorTimeline.PREV_A];
      r2 = frames[frame + TwoColorTimeline.PREV_R2];
      g2 = frames[frame + TwoColorTimeline.PREV_G2];
      b2 = frames[frame + TwoColorTimeline.PREV_B2];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / TwoColorTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + TwoColorTimeline.PREV_TIME] - frameTime)
      );

      r += (frames[frame + TwoColorTimeline.R] - r) * percent;
      g += (frames[frame + TwoColorTimeline.G] - g) * percent;
      b += (frames[frame + TwoColorTimeline.B] - b) * percent;
      a += (frames[frame + TwoColorTimeline.A] - a) * percent;
      r2 += (frames[frame + TwoColorTimeline.R2] - r2) * percent;
      g2 += (frames[frame + TwoColorTimeline.G2] - g2) * percent;
      b2 += (frames[frame + TwoColorTimeline.B2] - b2) * percent;
    }
    if (alpha == 1) {
      slot.color.set(r, g, b, a);
      slot.darkColor.set(r2, g2, b2, 1);
    } else {
      const light = slot.color,
        dark = slot.darkColor;
      if (blend == MixBlend.setup) {
        light.setFromColor(slot.data.color);
        dark.setFromColor(slot.data.darkColor);
      }
      light.add((r - light.r) * alpha, (g - light.g) * alpha, (b - light.b) * alpha, (a - light.a) * alpha);
      dark.add((r2 - dark.r) * alpha, (g2 - dark.g) * alpha, (b2 - dark.b) * alpha, 0);
    }
  }
}

/** Changes a slot's {@link Slot#attachment}. */
export class AttachmentTimeline implements Timeline {
  /** The index of the slot in {@link Skeleton#slots} that will be changed. */
  slotIndex: number;

  /** The time in seconds for each key frame. */
  frames: ArrayLike<number>; // time, ...

  /** The attachment name for each key frame. May contain null values to clear the attachment. */
  attachmentNames: Array<string>;

  constructor(frameCount: number) {
    this.frames = Utils.newFloatArray(frameCount);
    this.attachmentNames = new Array<string>(frameCount);
  }

  getPropertyId() {
    return (TimelineType.attachment << 24) + this.slotIndex;
  }

  /** The number of key frames for this timeline. */
  getFrameCount() {
    return this.frames.length;
  }

  /** Sets the time in seconds and the attachment name for the specified key frame. */
  setFrame(frameIndex: number, time: number, attachmentName: string) {
    this.frames[frameIndex] = time;
    this.attachmentNames[frameIndex] = attachmentName;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    events: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const slot = skeleton.slots[this.slotIndex];
    if (!slot.bone.active) return;
    if (direction == MixDirection.mixOut) {
      if (blend == MixBlend.setup) this.setAttachment(skeleton, slot, slot.data.attachmentName);
      return;
    }

    const frames = this.frames;
    if (time < frames[0]) {
      if (blend == MixBlend.setup || blend == MixBlend.first)
        this.setAttachment(skeleton, slot, slot.data.attachmentName);
      return;
    }

    let frameIndex = 0;
    if (time >= frames[frames.length - 1])
      // Time is after last frame.
      frameIndex = frames.length - 1;
    else frameIndex = Animation.binarySearch(frames, time, 1) - 1;

    const attachmentName = this.attachmentNames[frameIndex];
    skeleton.slots[this.slotIndex].setAttachment(
      attachmentName == null ? null : skeleton.getAttachment(this.slotIndex, attachmentName)
    );
  }

  setAttachment(skeleton: Skeleton, slot: Slot, attachmentName: string) {
    slot.attachment = attachmentName == null ? null : skeleton.getAttachment(this.slotIndex, attachmentName);
  }
}

let zeros: ArrayLike<number> = null;

/** Changes a slot's {@link Slot#deform} to deform a {@link VertexAttachment}. */
export class DeformTimeline extends CurveTimeline {
  /** The index of the slot in {@link Skeleton#getSlots()} that will be changed. */
  slotIndex: number;

  /** The attachment that will be deformed. */
  attachment: VertexAttachment;

  /** The time in seconds for each key frame. */
  frames: ArrayLike<number>; // time, ...

  /** The vertices for each key frame. */
  frameVertices: Array<ArrayLike<number>>;

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount);
    this.frameVertices = new Array<ArrayLike<number>>(frameCount);
    if (zeros == null) zeros = Utils.newFloatArray(64);
  }

  getPropertyId() {
    return (TimelineType.deform << 27) + +this.attachment.id + this.slotIndex;
  }

  /** Sets the time in seconds and the vertices for the specified key frame.
   * @param vertices Vertex positions for an unweighted VertexAttachment, or deform offsets if it has weights. */
  setFrame(frameIndex: number, time: number, vertices: ArrayLike<number>) {
    this.frames[frameIndex] = time;
    this.frameVertices[frameIndex] = vertices;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const slot: Slot = skeleton.slots[this.slotIndex];
    if (!slot.bone.active) return;
    const slotAttachment: Attachment = slot.getAttachment();
    if (
      !(slotAttachment instanceof VertexAttachment) ||
      !((<VertexAttachment>slotAttachment).deformAttachment == this.attachment)
    )
      return;

    const deformArray: Array<number> = slot.deform;
    if (deformArray.length == 0) blend = MixBlend.setup;

    const frameVertices = this.frameVertices;
    const vertexCount = frameVertices[0].length;

    const frames = this.frames;
    if (time < frames[0]) {
      const vertexAttachment = <VertexAttachment>slotAttachment;
      switch (blend) {
        case MixBlend.setup:
          deformArray.length = 0;
          return;
        case MixBlend.first:
          if (alpha == 1) {
            deformArray.length = 0;
            break;
          }
          const deform: Array<number> = Utils.setArraySize(deformArray, vertexCount);
          if (vertexAttachment.bones == null) {
            // Unweighted vertex positions.
            const setupVertices = vertexAttachment.vertices;
            for (var i = 0; i < vertexCount; i++) deform[i] += (setupVertices[i] - deform[i]) * alpha;
          } else {
            // Weighted deform offsets.
            alpha = 1 - alpha;
            for (var i = 0; i < vertexCount; i++) deform[i] *= alpha;
          }
      }
      return;
    }

    const deform: Array<number> = Utils.setArraySize(deformArray, vertexCount);
    if (time >= frames[frames.length - 1]) {
      // Time is after last frame.
      const lastVertices = frameVertices[frames.length - 1];
      if (alpha == 1) {
        if (blend == MixBlend.add) {
          const vertexAttachment = slotAttachment as VertexAttachment;
          if (vertexAttachment.bones == null) {
            // Unweighted vertex positions, with alpha.
            const setupVertices = vertexAttachment.vertices;
            for (let i = 0; i < vertexCount; i++) {
              deform[i] += lastVertices[i] - setupVertices[i];
            }
          } else {
            // Weighted deform offsets, with alpha.
            for (let i = 0; i < vertexCount; i++) deform[i] += lastVertices[i];
          }
        } else {
          Utils.arrayCopy(lastVertices, 0, deform, 0, vertexCount);
        }
      } else {
        switch (blend) {
          case MixBlend.setup: {
            const vertexAttachment = slotAttachment as VertexAttachment;
            if (vertexAttachment.bones == null) {
              // Unweighted vertex positions, with alpha.
              const setupVertices = vertexAttachment.vertices;
              for (let i = 0; i < vertexCount; i++) {
                const setup = setupVertices[i];
                deform[i] = setup + (lastVertices[i] - setup) * alpha;
              }
            } else {
              // Weighted deform offsets, with alpha.
              for (let i = 0; i < vertexCount; i++) deform[i] = lastVertices[i] * alpha;
            }
            break;
          }
          case MixBlend.first:
          case MixBlend.replace:
            for (let i = 0; i < vertexCount; i++) deform[i] += (lastVertices[i] - deform[i]) * alpha;
            break;
          case MixBlend.add:
            const vertexAttachment = slotAttachment as VertexAttachment;
            if (vertexAttachment.bones == null) {
              // Unweighted vertex positions, with alpha.
              const setupVertices = vertexAttachment.vertices;
              for (let i = 0; i < vertexCount; i++) {
                deform[i] += (lastVertices[i] - setupVertices[i]) * alpha;
              }
            } else {
              // Weighted deform offsets, with alpha.
              for (let i = 0; i < vertexCount; i++) deform[i] += lastVertices[i] * alpha;
            }
        }
      }
      return;
    }

    // Interpolate between the previous frame and the current frame.
    const frame = Animation.binarySearch(frames, time);
    const prevVertices = frameVertices[frame - 1];
    const nextVertices = frameVertices[frame];
    const frameTime = frames[frame];
    const percent = this.getCurvePercent(frame - 1, 1 - (time - frameTime) / (frames[frame - 1] - frameTime));

    if (alpha == 1) {
      if (blend == MixBlend.add) {
        const vertexAttachment = slotAttachment as VertexAttachment;
        if (vertexAttachment.bones == null) {
          // Unweighted vertex positions, with alpha.
          const setupVertices = vertexAttachment.vertices;
          for (let i = 0; i < vertexCount; i++) {
            const prev = prevVertices[i];
            deform[i] += prev + (nextVertices[i] - prev) * percent - setupVertices[i];
          }
        } else {
          // Weighted deform offsets, with alpha.
          for (let i = 0; i < vertexCount; i++) {
            const prev = prevVertices[i];
            deform[i] += prev + (nextVertices[i] - prev) * percent;
          }
        }
      } else {
        for (let i = 0; i < vertexCount; i++) {
          const prev = prevVertices[i];
          deform[i] = prev + (nextVertices[i] - prev) * percent;
        }
      }
    } else {
      switch (blend) {
        case MixBlend.setup: {
          const vertexAttachment = slotAttachment as VertexAttachment;
          if (vertexAttachment.bones == null) {
            // Unweighted vertex positions, with alpha.
            const setupVertices = vertexAttachment.vertices;
            for (let i = 0; i < vertexCount; i++) {
              const prev = prevVertices[i],
                setup = setupVertices[i];
              deform[i] = setup + (prev + (nextVertices[i] - prev) * percent - setup) * alpha;
            }
          } else {
            // Weighted deform offsets, with alpha.
            for (let i = 0; i < vertexCount; i++) {
              const prev = prevVertices[i];
              deform[i] = (prev + (nextVertices[i] - prev) * percent) * alpha;
            }
          }
          break;
        }
        case MixBlend.first:
        case MixBlend.replace:
          for (let i = 0; i < vertexCount; i++) {
            const prev = prevVertices[i];
            deform[i] += (prev + (nextVertices[i] - prev) * percent - deform[i]) * alpha;
          }
          break;
        case MixBlend.add:
          const vertexAttachment = slotAttachment as VertexAttachment;
          if (vertexAttachment.bones == null) {
            // Unweighted vertex positions, with alpha.
            const setupVertices = vertexAttachment.vertices;
            for (let i = 0; i < vertexCount; i++) {
              const prev = prevVertices[i];
              deform[i] += (prev + (nextVertices[i] - prev) * percent - setupVertices[i]) * alpha;
            }
          } else {
            // Weighted deform offsets, with alpha.
            for (let i = 0; i < vertexCount; i++) {
              const prev = prevVertices[i];
              deform[i] += (prev + (nextVertices[i] - prev) * percent) * alpha;
            }
          }
      }
    }
  }
}

/** Fires an {@link Event} when specific animation times are reached. */
export class EventTimeline implements Timeline {
  /** The time in seconds for each key frame. */
  frames: ArrayLike<number>; // time, ...

  /** The event for each key frame. */
  events: Array<Event>;

  constructor(frameCount: number) {
    this.frames = Utils.newFloatArray(frameCount);
    this.events = new Array<Event>(frameCount);
  }

  getPropertyId() {
    return TimelineType.event << 24;
  }

  /** The number of key frames for this timeline. */
  getFrameCount() {
    return this.frames.length;
  }

  /** Sets the time in seconds and the event for the specified key frame. */
  setFrame(frameIndex: number, event: Event) {
    this.frames[frameIndex] = event.time;
    this.events[frameIndex] = event;
  }

  /** Fires events for frames > `lastTime` and <= `time`. */
  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    if (firedEvents == null) return;
    const frames = this.frames;
    const frameCount = this.frames.length;

    if (lastTime > time) {
      // Fire events after last time for looped animations.
      this.apply(skeleton, lastTime, Number.MAX_VALUE, firedEvents, alpha, blend, direction);
      lastTime = -1;
    } else if (lastTime >= frames[frameCount - 1])
      // Last time is after last frame.
      return;
    if (time < frames[0]) return; // Time is before first frame.

    let frame = 0;
    if (lastTime < frames[0]) frame = 0;
    else {
      frame = Animation.binarySearch(frames, lastTime);
      const frameTime = frames[frame];
      while (frame > 0) {
        // Fire multiple events with the same frame.
        if (frames[frame - 1] != frameTime) break;
        frame--;
      }
    }
    for (; frame < frameCount && time >= frames[frame]; frame++) firedEvents.push(this.events[frame]);
  }
}

/** Changes a skeleton's {@link Skeleton#drawOrder}. */
export class DrawOrderTimeline implements Timeline {
  /** The time in seconds for each key frame. */
  frames: ArrayLike<number>; // time, ...

  /** The draw order for each key frame. See {@link #setFrame(int, float, int[])}. */
  drawOrders: Array<Array<number>>;

  constructor(frameCount: number) {
    this.frames = Utils.newFloatArray(frameCount);
    this.drawOrders = new Array<Array<number>>(frameCount);
  }

  getPropertyId() {
    return TimelineType.drawOrder << 24;
  }

  /** The number of key frames for this timeline. */
  getFrameCount() {
    return this.frames.length;
  }

  /** Sets the time in seconds and the draw order for the specified key frame.
   * @param drawOrder For each slot in {@link Skeleton#slots}, the index of the new draw order. May be null to use setup pose
   *           draw order. */
  setFrame(frameIndex: number, time: number, drawOrder: Array<number>) {
    this.frames[frameIndex] = time;
    this.drawOrders[frameIndex] = drawOrder;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const drawOrder: Array<Slot> = skeleton.drawOrder;
    const slots: Array<Slot> = skeleton.slots;
    if (direction == MixDirection.mixOut) {
      if (blend == MixBlend.setup) Utils.arrayCopy(skeleton.slots, 0, skeleton.drawOrder, 0, skeleton.slots.length);
      return;
    }

    const frames = this.frames;
    if (time < frames[0]) {
      if (blend == MixBlend.setup || blend == MixBlend.first)
        Utils.arrayCopy(skeleton.slots, 0, skeleton.drawOrder, 0, skeleton.slots.length);
      return;
    }

    let frame = 0;
    if (time >= frames[frames.length - 1])
      // Time is after last frame.
      frame = frames.length - 1;
    else frame = Animation.binarySearch(frames, time) - 1;

    const drawOrderToSetupIndex = this.drawOrders[frame];
    if (drawOrderToSetupIndex == null) Utils.arrayCopy(slots, 0, drawOrder, 0, slots.length);
    else {
      for (let i = 0, n = drawOrderToSetupIndex.length; i < n; i++) drawOrder[i] = slots[drawOrderToSetupIndex[i]];
    }
  }
}

/** Changes an IK constraint's {@link IkConstraint#mix}, {@link IkConstraint#softness},
 * {@link IkConstraint#bendDirection}, {@link IkConstraint#stretch}, and {@link IkConstraint#compress}. */
export class IkConstraintTimeline extends CurveTimeline {
  static ENTRIES = 6;
  static PREV_TIME = -6;
  static PREV_MIX = -5;
  static PREV_SOFTNESS = -4;
  static PREV_BEND_DIRECTION = -3;
  static PREV_COMPRESS = -2;
  static PREV_STRETCH = -1;
  static MIX = 1;
  static SOFTNESS = 2;
  static BEND_DIRECTION = 3;
  static COMPRESS = 4;
  static STRETCH = 5;

  /** The index of the IK constraint slot in {@link Skeleton#ikConstraints} that will be changed. */
  ikConstraintIndex: number;

  /** The time in seconds, mix, softness, bend direction, compress, and stretch for each key frame. */
  frames: ArrayLike<number>; // time, mix, softness, bendDirection, compress, stretch, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount * IkConstraintTimeline.ENTRIES);
  }

  getPropertyId() {
    return (TimelineType.ikConstraint << 24) + this.ikConstraintIndex;
  }

  /** Sets the time in seconds, mix, softness, bend direction, compress, and stretch for the specified key frame. */
  setFrame(
    frameIndex: number,
    time: number,
    mix: number,
    softness: number,
    bendDirection: number,
    compress: boolean,
    stretch: boolean
  ) {
    frameIndex *= IkConstraintTimeline.ENTRIES;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + IkConstraintTimeline.MIX] = mix;
    this.frames[frameIndex + IkConstraintTimeline.SOFTNESS] = softness;
    this.frames[frameIndex + IkConstraintTimeline.BEND_DIRECTION] = bendDirection;
    this.frames[frameIndex + IkConstraintTimeline.COMPRESS] = compress ? 1 : 0;
    this.frames[frameIndex + IkConstraintTimeline.STRETCH] = stretch ? 1 : 0;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;
    const constraint: IkConstraint = skeleton.ikConstraints[this.ikConstraintIndex];
    if (!constraint.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          constraint.mix = constraint.data.mix;
          constraint.softness = constraint.data.softness;
          constraint.bendDirection = constraint.data.bendDirection;
          constraint.compress = constraint.data.compress;
          constraint.stretch = constraint.data.stretch;
          return;
        case MixBlend.first:
          constraint.mix += (constraint.data.mix - constraint.mix) * alpha;
          constraint.softness += (constraint.data.softness - constraint.softness) * alpha;
          constraint.bendDirection = constraint.data.bendDirection;
          constraint.compress = constraint.data.compress;
          constraint.stretch = constraint.data.stretch;
      }
      return;
    }

    if (time >= frames[frames.length - IkConstraintTimeline.ENTRIES]) {
      // Time is after last frame.
      if (blend == MixBlend.setup) {
        constraint.mix =
          constraint.data.mix + (frames[frames.length + IkConstraintTimeline.PREV_MIX] - constraint.data.mix) * alpha;
        constraint.softness =
          constraint.data.softness +
          (frames[frames.length + IkConstraintTimeline.PREV_SOFTNESS] - constraint.data.softness) * alpha;
        if (direction == MixDirection.mixOut) {
          constraint.bendDirection = constraint.data.bendDirection;
          constraint.compress = constraint.data.compress;
          constraint.stretch = constraint.data.stretch;
        } else {
          constraint.bendDirection = frames[frames.length + IkConstraintTimeline.PREV_BEND_DIRECTION];
          constraint.compress = frames[frames.length + IkConstraintTimeline.PREV_COMPRESS] != 0;
          constraint.stretch = frames[frames.length + IkConstraintTimeline.PREV_STRETCH] != 0;
        }
      } else {
        constraint.mix += (frames[frames.length + IkConstraintTimeline.PREV_MIX] - constraint.mix) * alpha;
        constraint.softness +=
          (frames[frames.length + IkConstraintTimeline.PREV_SOFTNESS] - constraint.softness) * alpha;
        if (direction == MixDirection.mixIn) {
          constraint.bendDirection = frames[frames.length + IkConstraintTimeline.PREV_BEND_DIRECTION];
          constraint.compress = frames[frames.length + IkConstraintTimeline.PREV_COMPRESS] != 0;
          constraint.stretch = frames[frames.length + IkConstraintTimeline.PREV_STRETCH] != 0;
        }
      }
      return;
    }

    // Interpolate between the previous frame and the current frame.
    const frame = Animation.binarySearch(frames, time, IkConstraintTimeline.ENTRIES);
    const mix = frames[frame + IkConstraintTimeline.PREV_MIX];
    const softness = frames[frame + IkConstraintTimeline.PREV_SOFTNESS];
    const frameTime = frames[frame];
    const percent = this.getCurvePercent(
      frame / IkConstraintTimeline.ENTRIES - 1,
      1 - (time - frameTime) / (frames[frame + IkConstraintTimeline.PREV_TIME] - frameTime)
    );

    if (blend == MixBlend.setup) {
      constraint.mix =
        constraint.data.mix +
        (mix + (frames[frame + IkConstraintTimeline.MIX] - mix) * percent - constraint.data.mix) * alpha;
      constraint.softness =
        constraint.data.softness +
        (softness + (frames[frame + IkConstraintTimeline.SOFTNESS] - softness) * percent - constraint.data.softness) *
          alpha;
      if (direction == MixDirection.mixOut) {
        constraint.bendDirection = constraint.data.bendDirection;
        constraint.compress = constraint.data.compress;
        constraint.stretch = constraint.data.stretch;
      } else {
        constraint.bendDirection = frames[frame + IkConstraintTimeline.PREV_BEND_DIRECTION];
        constraint.compress = frames[frame + IkConstraintTimeline.PREV_COMPRESS] != 0;
        constraint.stretch = frames[frame + IkConstraintTimeline.PREV_STRETCH] != 0;
      }
    } else {
      constraint.mix += (mix + (frames[frame + IkConstraintTimeline.MIX] - mix) * percent - constraint.mix) * alpha;
      constraint.softness +=
        (softness + (frames[frame + IkConstraintTimeline.SOFTNESS] - softness) * percent - constraint.softness) * alpha;
      if (direction == MixDirection.mixIn) {
        constraint.bendDirection = frames[frame + IkConstraintTimeline.PREV_BEND_DIRECTION];
        constraint.compress = frames[frame + IkConstraintTimeline.PREV_COMPRESS] != 0;
        constraint.stretch = frames[frame + IkConstraintTimeline.PREV_STRETCH] != 0;
      }
    }
  }
}

/** Changes a transform constraint's {@link TransformConstraint#rotateMix}, {@link TransformConstraint#translateMix},
 * {@link TransformConstraint#scaleMix}, and {@link TransformConstraint#shearMix}. */
export class TransformConstraintTimeline extends CurveTimeline {
  static ENTRIES = 5;
  static PREV_TIME = -5;
  static PREV_ROTATE = -4;
  static PREV_TRANSLATE = -3;
  static PREV_SCALE = -2;
  static PREV_SHEAR = -1;
  static ROTATE = 1;
  static TRANSLATE = 2;
  static SCALE = 3;
  static SHEAR = 4;

  /** The index of the transform constraint slot in {@link Skeleton#transformConstraints} that will be changed. */
  transformConstraintIndex: number;

  /** The time in seconds, rotate mix, translate mix, scale mix, and shear mix for each key frame. */
  frames: ArrayLike<number>; // time, rotate mix, translate mix, scale mix, shear mix, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount * TransformConstraintTimeline.ENTRIES);
  }

  getPropertyId() {
    return (TimelineType.transformConstraint << 24) + this.transformConstraintIndex;
  }

  /** The time in seconds, rotate mix, translate mix, scale mix, and shear mix for the specified key frame. */
  setFrame(
    frameIndex: number,
    time: number,
    rotateMix: number,
    translateMix: number,
    scaleMix: number,
    shearMix: number
  ) {
    frameIndex *= TransformConstraintTimeline.ENTRIES;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + TransformConstraintTimeline.ROTATE] = rotateMix;
    this.frames[frameIndex + TransformConstraintTimeline.TRANSLATE] = translateMix;
    this.frames[frameIndex + TransformConstraintTimeline.SCALE] = scaleMix;
    this.frames[frameIndex + TransformConstraintTimeline.SHEAR] = shearMix;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;

    const constraint: TransformConstraint = skeleton.transformConstraints[this.transformConstraintIndex];
    if (!constraint.active) return;
    if (time < frames[0]) {
      const data = constraint.data;
      switch (blend) {
        case MixBlend.setup:
          constraint.rotateMix = data.rotateMix;
          constraint.translateMix = data.translateMix;
          constraint.scaleMix = data.scaleMix;
          constraint.shearMix = data.shearMix;
          return;
        case MixBlend.first:
          constraint.rotateMix += (data.rotateMix - constraint.rotateMix) * alpha;
          constraint.translateMix += (data.translateMix - constraint.translateMix) * alpha;
          constraint.scaleMix += (data.scaleMix - constraint.scaleMix) * alpha;
          constraint.shearMix += (data.shearMix - constraint.shearMix) * alpha;
      }
      return;
    }

    let rotate = 0,
      translate = 0,
      scale = 0,
      shear = 0;
    if (time >= frames[frames.length - TransformConstraintTimeline.ENTRIES]) {
      // Time is after last frame.
      const i = frames.length;
      rotate = frames[i + TransformConstraintTimeline.PREV_ROTATE];
      translate = frames[i + TransformConstraintTimeline.PREV_TRANSLATE];
      scale = frames[i + TransformConstraintTimeline.PREV_SCALE];
      shear = frames[i + TransformConstraintTimeline.PREV_SHEAR];
    } else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, TransformConstraintTimeline.ENTRIES);
      rotate = frames[frame + TransformConstraintTimeline.PREV_ROTATE];
      translate = frames[frame + TransformConstraintTimeline.PREV_TRANSLATE];
      scale = frames[frame + TransformConstraintTimeline.PREV_SCALE];
      shear = frames[frame + TransformConstraintTimeline.PREV_SHEAR];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / TransformConstraintTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + TransformConstraintTimeline.PREV_TIME] - frameTime)
      );

      rotate += (frames[frame + TransformConstraintTimeline.ROTATE] - rotate) * percent;
      translate += (frames[frame + TransformConstraintTimeline.TRANSLATE] - translate) * percent;
      scale += (frames[frame + TransformConstraintTimeline.SCALE] - scale) * percent;
      shear += (frames[frame + TransformConstraintTimeline.SHEAR] - shear) * percent;
    }
    if (blend == MixBlend.setup) {
      const data = constraint.data;
      constraint.rotateMix = data.rotateMix + (rotate - data.rotateMix) * alpha;
      constraint.translateMix = data.translateMix + (translate - data.translateMix) * alpha;
      constraint.scaleMix = data.scaleMix + (scale - data.scaleMix) * alpha;
      constraint.shearMix = data.shearMix + (shear - data.shearMix) * alpha;
    } else {
      constraint.rotateMix += (rotate - constraint.rotateMix) * alpha;
      constraint.translateMix += (translate - constraint.translateMix) * alpha;
      constraint.scaleMix += (scale - constraint.scaleMix) * alpha;
      constraint.shearMix += (shear - constraint.shearMix) * alpha;
    }
  }
}

/** Changes a path constraint's {@link PathConstraint#position}. */
export class PathConstraintPositionTimeline extends CurveTimeline {
  static ENTRIES = 2;
  static PREV_TIME = -2;
  static PREV_VALUE = -1;
  static VALUE = 1;

  /** The index of the path constraint slot in {@link Skeleton#pathConstraints} that will be changed. */
  pathConstraintIndex: number;

  /** The time in seconds and path constraint position for each key frame. */
  frames: ArrayLike<number>; // time, position, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount * PathConstraintPositionTimeline.ENTRIES);
  }

  getPropertyId() {
    return (TimelineType.pathConstraintPosition << 24) + this.pathConstraintIndex;
  }

  /** Sets the time in seconds and path constraint position for the specified key frame. */
  setFrame(frameIndex: number, time: number, value: number) {
    frameIndex *= PathConstraintPositionTimeline.ENTRIES;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + PathConstraintPositionTimeline.VALUE] = value;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;
    const constraint: PathConstraint = skeleton.pathConstraints[this.pathConstraintIndex];
    if (!constraint.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          constraint.position = constraint.data.position;
          return;
        case MixBlend.first:
          constraint.position += (constraint.data.position - constraint.position) * alpha;
      }
      return;
    }

    let position = 0;
    if (time >= frames[frames.length - PathConstraintPositionTimeline.ENTRIES])
      // Time is after last frame.
      position = frames[frames.length + PathConstraintPositionTimeline.PREV_VALUE];
    else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, PathConstraintPositionTimeline.ENTRIES);
      position = frames[frame + PathConstraintPositionTimeline.PREV_VALUE];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / PathConstraintPositionTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + PathConstraintPositionTimeline.PREV_TIME] - frameTime)
      );

      position += (frames[frame + PathConstraintPositionTimeline.VALUE] - position) * percent;
    }
    if (blend == MixBlend.setup)
      constraint.position = constraint.data.position + (position - constraint.data.position) * alpha;
    else constraint.position += (position - constraint.position) * alpha;
  }
}

/** Changes a path constraint's {@link PathConstraint#spacing}. */
export class PathConstraintSpacingTimeline extends PathConstraintPositionTimeline {
  constructor(frameCount: number) {
    super(frameCount);
  }

  override getPropertyId() {
    return (TimelineType.pathConstraintSpacing << 24) + this.pathConstraintIndex;
  }

  override apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;
    const constraint: PathConstraint = skeleton.pathConstraints[this.pathConstraintIndex];
    if (!constraint.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          constraint.spacing = constraint.data.spacing;
          return;
        case MixBlend.first:
          constraint.spacing += (constraint.data.spacing - constraint.spacing) * alpha;
      }
      return;
    }

    let spacing = 0;
    if (time >= frames[frames.length - PathConstraintSpacingTimeline.ENTRIES])
      // Time is after last frame.
      spacing = frames[frames.length + PathConstraintSpacingTimeline.PREV_VALUE];
    else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, PathConstraintSpacingTimeline.ENTRIES);
      spacing = frames[frame + PathConstraintSpacingTimeline.PREV_VALUE];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / PathConstraintSpacingTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + PathConstraintSpacingTimeline.PREV_TIME] - frameTime)
      );

      spacing += (frames[frame + PathConstraintSpacingTimeline.VALUE] - spacing) * percent;
    }

    if (blend == MixBlend.setup)
      constraint.spacing = constraint.data.spacing + (spacing - constraint.data.spacing) * alpha;
    else constraint.spacing += (spacing - constraint.spacing) * alpha;
  }
}

/** Changes a transform constraint's {@link PathConstraint#rotateMix} and
 * {@link TransformConstraint#translateMix}. */
export class PathConstraintMixTimeline extends CurveTimeline {
  static ENTRIES = 3;
  static PREV_TIME = -3;
  static PREV_ROTATE = -2;
  static PREV_TRANSLATE = -1;
  static ROTATE = 1;
  static TRANSLATE = 2;

  /** The index of the path constraint slot in {@link Skeleton#getPathConstraints()} that will be changed. */
  pathConstraintIndex: number;

  /** The time in seconds, rotate mix, and translate mix for each key frame. */
  frames: ArrayLike<number>; // time, rotate mix, translate mix, ...

  constructor(frameCount: number) {
    super(frameCount);
    this.frames = Utils.newFloatArray(frameCount * PathConstraintMixTimeline.ENTRIES);
  }

  getPropertyId() {
    return (TimelineType.pathConstraintMix << 24) + this.pathConstraintIndex;
  }

  /** The time in seconds, rotate mix, and translate mix for the specified key frame. */
  setFrame(frameIndex: number, time: number, rotateMix: number, translateMix: number) {
    frameIndex *= PathConstraintMixTimeline.ENTRIES;
    this.frames[frameIndex] = time;
    this.frames[frameIndex + PathConstraintMixTimeline.ROTATE] = rotateMix;
    this.frames[frameIndex + PathConstraintMixTimeline.TRANSLATE] = translateMix;
  }

  apply(
    skeleton: Skeleton,
    lastTime: number,
    time: number,
    firedEvents: Array<Event>,
    alpha: number,
    blend: MixBlend,
    direction: MixDirection
  ) {
    const frames = this.frames;
    const constraint: PathConstraint = skeleton.pathConstraints[this.pathConstraintIndex];
    if (!constraint.active) return;
    if (time < frames[0]) {
      switch (blend) {
        case MixBlend.setup:
          constraint.rotateMix = constraint.data.rotateMix;
          constraint.translateMix = constraint.data.translateMix;
          return;
        case MixBlend.first:
          constraint.rotateMix += (constraint.data.rotateMix - constraint.rotateMix) * alpha;
          constraint.translateMix += (constraint.data.translateMix - constraint.translateMix) * alpha;
      }
      return;
    }

    let rotate = 0,
      translate = 0;
    if (time >= frames[frames.length - PathConstraintMixTimeline.ENTRIES]) {
      // Time is after last frame.
      rotate = frames[frames.length + PathConstraintMixTimeline.PREV_ROTATE];
      translate = frames[frames.length + PathConstraintMixTimeline.PREV_TRANSLATE];
    } else {
      // Interpolate between the previous frame and the current frame.
      const frame = Animation.binarySearch(frames, time, PathConstraintMixTimeline.ENTRIES);
      rotate = frames[frame + PathConstraintMixTimeline.PREV_ROTATE];
      translate = frames[frame + PathConstraintMixTimeline.PREV_TRANSLATE];
      const frameTime = frames[frame];
      const percent = this.getCurvePercent(
        frame / PathConstraintMixTimeline.ENTRIES - 1,
        1 - (time - frameTime) / (frames[frame + PathConstraintMixTimeline.PREV_TIME] - frameTime)
      );

      rotate += (frames[frame + PathConstraintMixTimeline.ROTATE] - rotate) * percent;
      translate += (frames[frame + PathConstraintMixTimeline.TRANSLATE] - translate) * percent;
    }

    if (blend == MixBlend.setup) {
      constraint.rotateMix = constraint.data.rotateMix + (rotate - constraint.data.rotateMix) * alpha;
      constraint.translateMix = constraint.data.translateMix + (translate - constraint.data.translateMix) * alpha;
    } else {
      constraint.rotateMix += (rotate - constraint.rotateMix) * alpha;
      constraint.translateMix += (translate - constraint.translateMix) * alpha;
    }
  }
}
