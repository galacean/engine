import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";
import {
  Keyframe,
  FloatKeyframe,
  Vector2Keyframe,
  Vector3Keyframe,
  Vector4Keyframe,
  QuaternionKeyframe,
  InterpolableValue
} from "./KeyFrame";
import { InterpolationType } from "./enums/InterpolationType";
import { InterpolableValueType } from "./enums/InterpolableValueType";

interface IFrameInfo {
  frameIndex: number;
  nextFrameIndex: number;
  alpha: number;
  dur: number;
}
/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export class AnimationCurve {
  /** All keys defined in the animation curve. */
  keys: Keyframe[] = [];
  /** The interpolationType of the animation curve. */
  interpolation: InterpolationType;

  /** @internal */
  _valueSize: number;
  /** @internal */
  _valueType: InterpolableValueType;
  /** @internal */
  _firstFrameValue: InterpolableValue;

  private _length: number = 0;

  /**
   * Animation curve length in seconds.
   */
  get length(): number {
    return this._length;
  }

  /**
   * Add a new key to the curve.
   * @param key - The keyframe
   */
  addKey(key: Keyframe): void {
    const { time } = key;
    this.keys.push(key);
    if (time > this._length) {
      this._length = time;
    }

    if (!this._valueSize) {
      if (key instanceof FloatKeyframe) {
        this._valueSize = 1;
        this._valueType = InterpolableValueType.Float;
      }
      if (key instanceof Vector2Keyframe) {
        this._valueSize = 2;
        this._valueType = InterpolableValueType.Vector2;
      }
      if (key instanceof Vector3Keyframe) {
        this._valueSize = 3;
        this._valueType = InterpolableValueType.Vector3;
      }
      if (key instanceof Vector4Keyframe) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Vector4;
      }
      if (key instanceof QuaternionKeyframe) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Quaternion;
      }
    }
  }

  /**
   * Evaluate the curve at time.
   * @param time - The time within the curve you want to evaluate
   */
  evaluate(time: number): InterpolableValue {
    const { keys, interpolation } = this;
    const { frameIndex, nextFrameIndex, alpha, dur } = this._getFrameInfo(time);
    let val: InterpolableValue;
    switch (interpolation) {
      case InterpolationType.CUBICSPLINE:
        val = this._evaluateCubicSpline(frameIndex, nextFrameIndex, alpha);
        break;
      case InterpolationType.LINEAR:
        val = this._evaluateLinear(frameIndex, nextFrameIndex, alpha);
        break;
      case InterpolationType.STEP:
        val = this._evaluateStep(nextFrameIndex);
        break;
      case InterpolationType.HERMITE:
        val = this._evaluateHermite(frameIndex, nextFrameIndex, alpha, dur);
    }
    if (!this._firstFrameValue) {
      this._firstFrameValue = keys[0].value;
    }
    return val;
  }

  /**
   * Removes the keyframe at index and inserts key.
   * @param index - The index of the key to move
   * @param key - The key to insert
   */
  moveKey(index: number, key: Keyframe): void {
    this.keys[index] = key;
  }

  /**
   * Removes a key.
   * @param index - The index of the key to remove
   */
  removeKey(index: number): void {
    this.keys.splice(index, 1);
  }

  private _evaluateLinear(frameIndex: number, nextFrameIndex: number, alpha: number): InterpolableValue {
    const { _valueType, keys } = this;
    switch (_valueType) {
      case InterpolableValueType.Float: {
        const p0 = keys[frameIndex].value as number;
        const p1 = keys[nextFrameIndex].value as number;
        return p0 * (1 - alpha) + p1 * alpha;
      }
      case InterpolableValueType.Vector2: {
        let a = new Vector2();
        let b = new Vector2();
        Vector2.scale(keys[frameIndex].value as Vector2, 1 - alpha, a);
        Vector2.scale(keys[nextFrameIndex].value as Vector2, alpha, b);
        return a.add(b);
      }
      case InterpolableValueType.Vector3: {
        let a = new Vector3();
        let b = new Vector3();
        Vector3.scale(keys[frameIndex].value as Vector3, 1 - alpha, a);
        Vector3.scale(keys[nextFrameIndex].value as Vector3, alpha, b);
        return a.add(b);
      }
      case InterpolableValueType.Quaternion: {
        const out: Quaternion = new Quaternion();
        const startValue = keys[frameIndex].value as Vector4;
        const startQuaternion = new Quaternion(startValue.x, startValue.y, startValue.z, startValue.w);
        const endValue = keys[nextFrameIndex].value as Vector4;
        const endQuaternion = new Quaternion(endValue.x, endValue.y, endValue.z, endValue.w);
        Quaternion.slerp(startQuaternion, endQuaternion, alpha, out);
        return out;
      }
    }
  }

  private _evaluateCubicSpline(frameIndex: number, nextFrameIndex: number, alpha: number): Vector3 {
    const { keys } = this;
    const squared = alpha * alpha;
    const cubed = alpha * squared;
    const part1 = 2.0 * cubed - 3.0 * squared + 1.0;
    const part2 = -2.0 * cubed + 3.0 * squared;
    const part3 = cubed - 2.0 * squared + alpha;
    const part4 = cubed - squared;

    const t1: Vector3 = keys[frameIndex].value as Vector3;
    const v1: Vector3 = keys[frameIndex + 1].value as Vector3;
    const t2: Vector3 = keys[frameIndex + 2].value as Vector3;
    const v2: Vector3 = keys[nextFrameIndex + 1].value as Vector3;

    return v1.scale(part1).add(v2.scale(part2)).add(t1.scale(part3)).add(t2.scale(part4)).clone();
  }

  private _evaluateStep(nextFrameIndex: number): InterpolableValue {
    const { _valueSize, keys } = this;
    if (_valueSize === 1) {
      return keys[nextFrameIndex].value;
    } else {
      return keys[nextFrameIndex].value;
    }
  }

  private _evaluateHermite(frameIedex: number, nextFrameIndex: number, t: number, dur: number): InterpolableValue {
    const { _valueSize, keys } = this;
    const curKey = keys[frameIedex];
    const nextKey = keys[nextFrameIndex];
    switch (_valueSize) {
      case 1: {
        const t0 = curKey.outTangent as number,
          t1 = nextKey.inTangent as number,
          p0 = curKey.value as number,
          p1 = nextKey.value as number;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          const t2 = t * t;
          const t3 = t2 * t;
          const a = 2.0 * t3 - 3.0 * t2 + 1.0;
          const b = t3 - 2.0 * t2 + t;
          const c = t3 - t2;
          const d = -2.0 * t3 + 3.0 * t2;
          return a * p0 + b * t0 * dur + c * t1 * dur + d * p1;
        } else return curKey.value;
      }
      case 2: {
        const out = new Vector2();
        const p0 = curKey.value as Vector2;
        const tan0 = curKey.outTangent as Vector2;
        const p1 = nextKey.value as Vector2;
        const tan1 = nextKey.inTangent as Vector2;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        else out.x = p0.x;

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        else out.y = p0.y;
        return out;
      }
      case 3: {
        const out = new Vector3();
        const p0 = curKey.value as Vector3;
        const tan0 = curKey.outTangent as Vector3;
        const p1 = nextKey.value as Vector3;
        const tan1 = nextKey.inTangent as Vector3;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        else out.x = p0.x;

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        else out.y = p0.y;

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
        else out.z = p0.z;
        return out;
      }
      case 4: {
        const out = new Quaternion();
        const p0 = curKey.value as Quaternion;
        const tan0 = curKey.outTangent as Vector4;
        const p1 = nextKey.value as Quaternion;
        const tan1 = nextKey.inTangent as Vector4;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        else out.x = p0.x;

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        else out.y = p0.y;

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
        else out.z = p0.z;

        (t0 = tan0.w), (t1 = tan1.w);
        if (Number.isFinite(t0) && Number.isFinite(t1)) out.w = a * p0.w + b * t0 * dur + c * t1 * dur + d * p1.w;
        else out.w = p0.w;
        return out;
      }
    }
  }

  private _getFrameInfo(time: number): IFrameInfo {
    let keyTime = 0;
    let frameIndex = 0;
    let nextFrameIndex = 1;
    const { keys } = this;
    const { length } = keys;

    for (let i = length - 1; i >= 0; i--) {
      if (time >= keys[i].time) {
        keyTime = time - keys[i].time;
        frameIndex = i;
        break;
      }
    }
    nextFrameIndex = frameIndex + 1;

    if (nextFrameIndex >= length) {
      nextFrameIndex = frameIndex;
      if (length === 1) {
        nextFrameIndex = frameIndex = 0;
      }
    }

    const dur = keys[nextFrameIndex].time - keys[frameIndex].time;
    const alpha = nextFrameIndex === frameIndex || dur < 0.00001 ? 1 : keyTime / dur;

    return {
      frameIndex,
      nextFrameIndex,
      alpha,
      dur
    };
  }
}
