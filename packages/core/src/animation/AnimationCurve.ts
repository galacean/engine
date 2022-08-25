import { Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { InterpolationType } from "./enums/InterpolationType";
import {
  FloatArrayKeyframe,
  FloatKeyframe,
  InterpolableValue,
  QuaternionKeyframe,
  UnionInterpolableKeyframe,
  Vector2Keyframe,
  Vector3Keyframe,
  Vector4Keyframe
} from "./KeyFrame";

/**
 * Store a collection of Keyframes that can be evaluated over time.
 */
export class AnimationCurve {
  /** All keys defined in the animation curve. */
  keys: UnionInterpolableKeyframe[] = [];
  /** The interpolationType of the animation curve. */
  interpolation: InterpolationType;

  /** @internal */
  _valueSize: number;
  /** @internal */
  _valueType: InterpolableValueType;
  /** @internal */
  _baseOutValue: Exclude<InterpolableValue, number>;
  /** @internal */
  _crossOutValue: Exclude<InterpolableValue, number>;

  private _length: number = 0;
  private _currentIndex: number = 0;

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
  addKey(key: UnionInterpolableKeyframe): void {
    const { time } = key;
    this.keys.push(key);
    if (time > this._length) {
      this._length = time;
    }

    if (!this._valueSize) {
      if (typeof key.value == "number") {
        this._valueSize = 1;
        this._valueType = InterpolableValueType.Float;
      }
      if (key.value instanceof Vector2) {
        this._valueSize = 2;
        this._valueType = InterpolableValueType.Vector2;
        this._baseOutValue = new Vector2();
        this._crossOutValue = new Vector2();
      }
      if (key.value instanceof Vector3) {
        this._valueSize = 3;
        this._valueType = InterpolableValueType.Vector3;
        this._baseOutValue = new Vector3();
        this._crossOutValue = new Vector3();
      }
      if (key.value instanceof Vector4) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Vector4;
        this._baseOutValue = new Vector4();
        this._crossOutValue = new Vector4();
      }
      if (key.value instanceof Quaternion) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Quaternion;
        this._baseOutValue = new Quaternion();
        this._crossOutValue = new Quaternion();
      }

      if (key.value instanceof Float32Array) {
        const size = key.value.length;
        this._valueSize = size;
        this._valueType = InterpolableValueType.FloatArray;
        this._baseOutValue == new Float32Array(size);
        this._crossOutValue = new Float32Array(size);
      }
    }
    this.keys.sort((a, b) => a.time - b.time);
  }

  /**
   * Evaluate the curve at time.
   * @param time - The time within the curve you want to evaluate
   */
  evaluate(time: number): InterpolableValue {
    return this._evaluate(time, this._baseOutValue);
  }

  /**
   * Removes the keyframe at index and inserts key.
   * @param index - The index of the key to move
   * @param key - The key to insert
   */
  moveKey(index: number, key: UnionInterpolableKeyframe): void {
    this.keys[index] = key;
  }

  /**
   * Removes a key.
   * @param index - The index of the key to remove
   */
  removeKey(index: number): void {
    this.keys.splice(index, 1);
    const { keys } = this;
    const count = this.keys.length;
    let newLength = 0;
    for (let i = count - 1; i >= 0; i--) {
      if (keys[i].time > length) {
        newLength = keys[i].time;
      }
    }
    this._length = newLength;
  }

  /**
   * @internal
   * Samples an animation at a given time.
   * @param time - The time to sample an animation
   * @param out - The value calculated
   */
  _evaluate(time: number, out?: Exclude<InterpolableValue, number>) {
    const { keys, interpolation } = this;
    const { length } = this.keys;

    // Compute curIndex and nextIndex.
    let curIndex = this._currentIndex;

    // Reset loop.
    if (curIndex !== -1 && time < keys[curIndex].time) {
      curIndex = -1;
    }

    let nextIndex = curIndex + 1;
    while (nextIndex < length) {
      if (time < keys[nextIndex].time) {
        break;
      }
      curIndex++;
      nextIndex++;
    }
    this._currentIndex = curIndex;
    // Evaluate value.
    let value: InterpolableValue;
    if (curIndex === -1) {
      value = this._evaluateStep(0, out);
    } else if (nextIndex === length) {
      value = this._evaluateStep(curIndex, out);
    } else {
      // Time between first frame and end frame.
      const curFrameTime = keys[curIndex].time;
      const duration = keys[nextIndex].time - curFrameTime;
      const t = (time - curFrameTime) / duration;
      const dur = duration;

      switch (interpolation) {
        case InterpolationType.Linear:
          value = this._evaluateLinear(curIndex, nextIndex, t, out);
          break;
        case InterpolationType.Step:
          value = this._evaluateStep(curIndex, out);
          break;
        case InterpolationType.CubicSpine:
        case InterpolationType.Hermite:
          value = this._evaluateHermite(curIndex, nextIndex, t, dur, out);
      }
    }
    return value;
  }

  private _evaluateLinear(
    frameIndex: number,
    nextFrameIndex: number,
    t: number,
    out: Exclude<InterpolableValue, number>
  ): InterpolableValue {
    const { _valueType, keys } = this;
    switch (_valueType) {
      case InterpolableValueType.Float:
        return (<FloatKeyframe>keys[frameIndex]).value * (1 - t) + (<FloatKeyframe>keys[nextFrameIndex]).value * t;
      case InterpolableValueType.FloatArray:
        const value = (<FloatArrayKeyframe>keys[frameIndex]).value;
        const nextValue = (<FloatArrayKeyframe>keys[nextFrameIndex]).value;
        for (let i = 0, n = value.length; i < n; i++) {
          out[i] = value[i] * (1 - t) + nextValue[i] * t;
        }
        return out;
      case InterpolableValueType.Vector2:
        Vector2.lerp(
          (<Vector2Keyframe>keys[frameIndex]).value,
          (<Vector2Keyframe>keys[nextFrameIndex]).value,
          t,
          <Vector2>out
        );
        return out;
      case InterpolableValueType.Vector3:
        Vector3.lerp(
          (<Vector3Keyframe>keys[frameIndex]).value,
          (<Vector3Keyframe>keys[nextFrameIndex]).value,
          t,
          <Vector3>out
        );
        return out;
      case InterpolableValueType.Vector4:
        Vector4.lerp(
          (<Vector4Keyframe>keys[frameIndex]).value,
          (<Vector4Keyframe>keys[nextFrameIndex]).value,
          t,
          <Vector4>out
        );
        return out;
      case InterpolableValueType.Quaternion:
        Quaternion.slerp(
          (<QuaternionKeyframe>keys[frameIndex]).value,
          (<QuaternionKeyframe>keys[nextFrameIndex]).value,
          t,
          <Quaternion>out
        );
        return out;
    }
  }

  private _evaluateStep(frameIndex: number, out: Exclude<InterpolableValue, number>): InterpolableValue {
    const { _valueType, keys } = this;
    switch (_valueType) {
      case InterpolableValueType.Float:
        return (<FloatArrayKeyframe>keys[frameIndex]).value;
      case InterpolableValueType.FloatArray:
        const value = (<FloatArrayKeyframe>keys[frameIndex]).value;
        for (let i = 0, n = value.length; i < n; i++) {
          out[i] = value[i];
        }
        return out;
      case InterpolableValueType.Vector2:
      case InterpolableValueType.Vector3:
      case InterpolableValueType.Vector4:
      case InterpolableValueType.Quaternion:
        (<Vector4>out).copyFrom(<Vector4>keys[frameIndex].value);
        return out;
    }
  }

  private _evaluateHermite(
    frameIndex: number,
    nextFrameIndex: number,
    t: number,
    dur: number,
    out: Exclude<InterpolableValue, number>
  ): InterpolableValue {
    const { _valueSize, keys } = this;
    const curKey = keys[frameIndex];
    const nextKey = keys[nextFrameIndex];
    switch (_valueSize) {
      case 1: {
        const t0 = (<FloatKeyframe>curKey).outTangent,
          t1 = (<FloatKeyframe>nextKey).inTangent,
          p0 = (<FloatKeyframe>curKey).value,
          p1 = (<FloatKeyframe>nextKey).value;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          const t2 = t * t;
          const t3 = t2 * t;
          const a = 2.0 * t3 - 3.0 * t2 + 1.0;
          const b = t3 - 2.0 * t2 + t;
          const c = t3 - t2;
          const d = -2.0 * t3 + 3.0 * t2;
          return a * p0 + b * t0 * dur + c * t1 * dur + d * p1;
        } else {
          return (<FloatKeyframe>curKey).value;
        }
      }
      case 2: {
        const p0 = (<Vector2Keyframe>curKey).value;
        const tan0 = (<Vector2Keyframe>curKey).outTangent;
        const p1 = (<Vector2Keyframe>nextKey).value;
        const tan1 = (<Vector2Keyframe>nextKey).inTangent;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector2>out).x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        } else {
          (<Vector2>out).x = p0.x;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1))
          (<Vector2>out).y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        else {
          (<Vector2>out).y = p0.y;
        }
        return out;
      }
      case 3: {
        const p0 = (<Vector3Keyframe>curKey).value;
        const tan0 = (<Vector3Keyframe>curKey).outTangent;
        const p1 = (<Vector3Keyframe>nextKey).value;
        const tan1 = (<Vector3Keyframe>nextKey).inTangent;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector3>out).x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        } else {
          (<Vector3>out).x = p0.x;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector3>out).y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        } else {
          (<Vector3>out).y = p0.y;
        }

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector3>out).z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
        } else {
          (<Vector3>out).z = p0.z;
        }
        return <Vector3>out;
      }
      case 4: {
        const p0 = (<QuaternionKeyframe>curKey).value;
        const tan0 = (<QuaternionKeyframe>curKey).outTangent;
        const p1 = (<QuaternionKeyframe>nextKey).value;
        const tan1 = (<QuaternionKeyframe>nextKey).inTangent;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>out).x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        } else {
          (<Quaternion>out).x = p0.x;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>out).y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        } else {
          (<Quaternion>out).y = p0.y;
        }

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>out).z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
        } else {
          (<Quaternion>out).z = p0.z;
        }

        (t0 = tan0.w), (t1 = tan1.w);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>out).w = a * p0.w + b * t0 * dur + c * t1 * dur + d * p1.w;
        } else {
          (<Quaternion>out).w = p0.w;
        }
        return <Quaternion>out;
      }
    }
  }
}
