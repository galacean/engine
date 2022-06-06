import { Color, Quaternion, Vector2, Vector3, Vector4 } from "@oasis-engine/math";
import { InterpolableValueType } from "./enums/InterpolableValueType";
import { InterpolationType } from "./enums/InterpolationType";
import {
  ColorKeyframe,
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

  private _currentValue: InterpolableValue;
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
      //CM: It's not reasonable to write here.
      if (typeof key.value == "number") {
        this._valueSize = 1;
        this._valueType = InterpolableValueType.Float;
        this._currentValue = 0;
      }
      if (key.value instanceof Vector2) {
        this._valueSize = 2;
        this._valueType = InterpolableValueType.Vector2;
        this._currentValue = new Vector2();
      }
      if (key.value instanceof Vector3) {
        this._valueSize = 3;
        this._valueType = InterpolableValueType.Vector3;
        this._currentValue = new Vector3();
      }
      if (key.value instanceof Vector4) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Vector4;
        this._currentValue = new Vector4();
      }
      if (key.value instanceof Quaternion) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Quaternion;
        this._currentValue = new Quaternion();
      }
      if (key.value instanceof Color) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Color;
        this._currentValue = new Color();
      }
      if (key.value instanceof Float32Array) {
        const size = key.value.length;
        this._valueSize = size;
        this._valueType = InterpolableValueType.FloatArray;
        this._currentValue = new Float32Array(size);
      }
    }
    this.keys.sort((a, b) => a.time - b.time);
  }

  /**
   * Evaluate the curve at time.
   * @param time - The time within the curve you want to evaluate
   */
  evaluate(time: number): InterpolableValue {
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
      value = (<UnionInterpolableKeyframe>keys[0]).value;
    } else if (nextIndex === length) {
      value = (<UnionInterpolableKeyframe>keys[curIndex]).value;
    } else {
      // Time between first frame and end frame.
      const curFrameTime = keys[curIndex].time;
      const duration = keys[nextIndex].time - curFrameTime;
      const t = (time - curFrameTime) / duration;
      const dur = duration;
      switch (interpolation) {
        case InterpolationType.Linear:
          value = this._evaluateLinear(curIndex, nextIndex, t);
          break;
        case InterpolationType.Step:
          value = this._evaluateStep(curIndex);
          break;
        case InterpolationType.CubicSpine:
        case InterpolationType.Hermite:
          value = this._evaluateHermite(curIndex, nextIndex, t, dur);
      }
    }
    return value;
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

  private _evaluateLinear(frameIndex: number, nextFrameIndex: number, t: number): InterpolableValue {
    const { _valueType, keys } = this;
    switch (_valueType) {
      case InterpolableValueType.Float:
        return (<FloatKeyframe>keys[frameIndex]).value * (1 - t) + (<FloatKeyframe>keys[nextFrameIndex]).value * t;
      case InterpolableValueType.Vector2:
        Vector2.lerp(
          (<Vector2Keyframe>keys[frameIndex]).value,
          (<Vector2Keyframe>keys[nextFrameIndex]).value,
          t,
          <Vector2>this._currentValue
        );
        return this._currentValue;
      case InterpolableValueType.Vector3:
        Vector3.lerp(
          (<Vector3Keyframe>keys[frameIndex]).value,
          (<Vector3Keyframe>keys[nextFrameIndex]).value,
          t,
          <Vector3>this._currentValue
        );
        return this._currentValue;
      case InterpolableValueType.Vector4:
        Vector4.lerp(
          (<Vector4Keyframe>keys[frameIndex]).value,
          (<Vector4Keyframe>keys[nextFrameIndex]).value,
          t,
          <Vector4>this._currentValue
        );
        return this._currentValue;
      case InterpolableValueType.Quaternion:
        Quaternion.slerp(
          (<QuaternionKeyframe>keys[frameIndex]).value,
          (<QuaternionKeyframe>keys[nextFrameIndex]).value,
          t,
          <Quaternion>this._currentValue
        );
        return this._currentValue;
      case InterpolableValueType.Color:
        Color.lerp(
          (<ColorKeyframe>keys[frameIndex]).value,
          (<ColorKeyframe>keys[nextFrameIndex]).value,
          t,
          <Color>this._currentValue
        );
        return this._currentValue;
      case InterpolableValueType.FloatArray:
        const curValue = this._currentValue;
        const value = (<FloatArrayKeyframe>keys[frameIndex]).value;
        const nextValue = (<FloatArrayKeyframe>keys[nextFrameIndex]).value;
        for (let i = 0, n = value.length; i < n; i++) {
          curValue[i] = value[i] * (1 - t) + nextValue[i] * t;
        }
        return curValue;
    }
  }

  private _evaluateStep(frameIndex: number): InterpolableValue {
    return (<UnionInterpolableKeyframe>this.keys[frameIndex]).value;
  }

  private _evaluateHermite(frameIndex: number, nextFrameIndex: number, t: number, dur: number): InterpolableValue {
    const { _valueType, keys } = this;
    const curKey = keys[frameIndex];
    const nextKey = keys[nextFrameIndex];
    switch (_valueType) {
      case InterpolableValueType.Float: {
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
      case InterpolableValueType.Vector2: {
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
          (<Vector2>this._currentValue).x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        } else {
          (<Vector2>this._currentValue).x = p0.x;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1))
          (<Vector2>this._currentValue).y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        else {
          (<Vector2>this._currentValue).y = p0.y;
        }
        return this._currentValue;
      }
      case InterpolableValueType.Vector3: {
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
          (<Vector3>this._currentValue).x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        } else {
          (<Vector3>this._currentValue).x = p0.x;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector3>this._currentValue).y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        } else {
          (<Vector3>this._currentValue).y = p0.y;
        }

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector3>this._currentValue).z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
        } else {
          (<Vector3>this._currentValue).z = p0.z;
        }
        return <Vector3>this._currentValue;
      }
      case InterpolableValueType.Vector4:
      case InterpolableValueType.Quaternion: {
        const p0 = (<Vector4Keyframe | QuaternionKeyframe>curKey).value;
        const tan0 = (<Vector4Keyframe | QuaternionKeyframe>curKey).outTangent;
        const p1 = (<Vector4Keyframe | QuaternionKeyframe>nextKey).value;
        const tan1 = (<Vector4Keyframe | QuaternionKeyframe>nextKey).inTangent;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector4 | Quaternion>this._currentValue).x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        } else {
          (<Vector4 | Quaternion>this._currentValue).x = p0.x;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector4 | Quaternion>this._currentValue).y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        } else {
          (<Vector4 | Quaternion>this._currentValue).y = p0.y;
        }

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector4 | Quaternion>this._currentValue).z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
        } else {
          (<Vector4 | Quaternion>this._currentValue).z = p0.z;
        }

        (t0 = tan0.w), (t1 = tan1.w);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Vector4 | Quaternion>this._currentValue).w = a * p0.w + b * t0 * dur + c * t1 * dur + d * p1.w;
        } else {
          (<Vector4 | Quaternion>this._currentValue).w = p0.w;
        }
        return <Vector4 | Quaternion>this._currentValue;
      }
      case InterpolableValueType.Color: {
        const p0 = (<ColorKeyframe>curKey).value;
        const tan0 = (<ColorKeyframe>curKey).outTangent;
        const p1 = (<ColorKeyframe>nextKey).value;
        const tan1 = (<ColorKeyframe>nextKey).inTangent;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Color>this._currentValue).r = a * p0.r + b * t0 * dur + c * t1 * dur + d * p1.r;
        } else {
          (<Color>this._currentValue).r = p0.r;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Color>this._currentValue).g = a * p0.g + b * t0 * dur + c * t1 * dur + d * p1.g;
        } else {
          (<Color>this._currentValue).g = p0.g;
        }

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Color>this._currentValue).b = a * p0.b + b * t0 * dur + c * t1 * dur + d * p1.b;
        } else {
          (<Color>this._currentValue).b = p0.b;
        }

        (t0 = tan0.w), (t1 = tan1.w);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Color>this._currentValue).a = a * p0.a + b * t0 * dur + c * t1 * dur + d * p1.a;
        } else {
          (<Color>this._currentValue).a = p0.a;
        }
        return <Color>this._currentValue;
      }
      case InterpolableValueType.FloatArray: {
        const t0 = (<FloatArrayKeyframe>curKey).outTangent,
          t1 = (<FloatArrayKeyframe>nextKey).inTangent,
          p0 = (<FloatArrayKeyframe>curKey).value,
          p1 = (<FloatArrayKeyframe>nextKey).value,
          length = p0.length;

        for (let i = 0; i < length; ++i) {
          if (Number.isFinite(t0[i]) && Number.isFinite(t1[i])) {
            const t2 = t * t;
            const t3 = t2 * t;
            const a = 2.0 * t3 - 3.0 * t2 + 1.0;
            const b = t3 - 2.0 * t2 + t;
            const c = t3 - t2;
            const d = -2.0 * t3 + 3.0 * t2;
            this._currentValue[i] = a * p0[i] + b * t0[i] * dur + c * t1[i] * dur + d * p1[i];
          } else {
            this._currentValue[i] = (<FloatKeyframe>curKey).value[i];
          }
        }

        return <FloatKeyframe>this._currentValue;
      }
    }
  }
}
