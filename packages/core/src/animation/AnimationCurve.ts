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

  private _currentValue: InterpolableValue;
  private _length: number = 0;
  private _currentIndex: number = 0;
  private _frameInfo: IFrameInfo = {
    frameIndex: 0,
    nextFrameIndex: 1,
    alpha: 1,
    dur: 1
  };

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
        this._currentValue = 0;
      }
      if (key instanceof Vector2Keyframe) {
        this._valueSize = 2;
        this._valueType = InterpolableValueType.Vector2;
        this._currentValue = new Vector2();
      }
      if (key instanceof Vector3Keyframe) {
        this._valueSize = 3;
        this._valueType = InterpolableValueType.Vector3;
        this._currentValue = new Vector3();
      }
      if (key instanceof Vector4Keyframe) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Vector4;
        this._currentValue = new Vector4();
      }
      if (key instanceof QuaternionKeyframe) {
        this._valueSize = 4;
        this._valueType = InterpolableValueType.Quaternion;
        this._currentValue = new Quaternion();
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
    const { frameIndex, nextFrameIndex, alpha, dur } = this._getFrameInfo(time);
    let val: InterpolableValue;
    switch (interpolation) {
      case InterpolationType.CubicSpine:
        val = this._evaluateCubicSpline(frameIndex, nextFrameIndex, alpha);
        break;
      case InterpolationType.Linear:
        val = this._evaluateLinear(frameIndex, nextFrameIndex, alpha);
        break;
      case InterpolationType.Step:
        val = this._evaluateStep(nextFrameIndex);
        break;
      case InterpolationType.Hermite:
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

  private _evaluateLinear(frameIndex: number, nextFrameIndex: number, alpha: number): InterpolableValue {
    const { _valueType, keys } = this;
    switch (_valueType) {
      case InterpolableValueType.Float: {
        const p0 = <number>keys[frameIndex].value;
        const p1 = <number>keys[nextFrameIndex].value;
        return p0 * (1 - alpha) + p1 * alpha;
      }
      case InterpolableValueType.Vector2: {
        Vector2.lerp(
          <Vector2>keys[frameIndex].value,
          <Vector2>keys[nextFrameIndex].value,
          alpha,
          <Vector2>this._currentValue
        );
        return this._currentValue;
      }
      case InterpolableValueType.Vector3: {
        Vector3.lerp(
          <Vector3>keys[frameIndex].value,
          <Vector3>keys[nextFrameIndex].value,
          alpha,
          <Vector3>this._currentValue
        );
        return this._currentValue;
      }
      case InterpolableValueType.Quaternion: {
        Quaternion.slerp(
          <Quaternion>keys[frameIndex].value,
          <Quaternion>keys[nextFrameIndex].value,
          alpha,
          <Quaternion>this._currentValue
        );
        return this._currentValue;
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

    const t1: Vector3 = <Vector3>keys[frameIndex].value;
    const v1: Vector3 = <Vector3>keys[frameIndex + 1].value;
    const t2: Vector3 = <Vector3>keys[frameIndex + 2].value;
    const v2: Vector3 = <Vector3>keys[nextFrameIndex + 1].value;

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
        const t0 = <number>curKey.outTangent,
          t1 = <number>nextKey.inTangent,
          p0 = <number>curKey.value,
          p1 = <number>nextKey.value;
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
        const p0 = <Vector2>curKey.value;
        const tan0 = <Vector2>curKey.outTangent;
        const p1 = <Vector2>nextKey.value;
        const tan1 = <Vector2>nextKey.inTangent;

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
      case 3: {
        const p0 = <Vector3>curKey.value;
        const tan0 = <Vector3>curKey.outTangent;
        const p1 = <Vector3>nextKey.value;
        const tan1 = <Vector3>nextKey.inTangent;

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
      case 4: {
        const p0 = <Quaternion>curKey.value;
        const tan0 = <Vector4>curKey.outTangent;
        const p1 = <Quaternion>nextKey.value;
        const tan1 = <Vector4>nextKey.inTangent;

        const t2 = t * t;
        const t3 = t2 * t;
        const a = 2.0 * t3 - 3.0 * t2 + 1.0;
        const b = t3 - 2.0 * t2 + t;
        const c = t3 - t2;
        const d = -2.0 * t3 + 3.0 * t2;

        let t0 = tan0.x,
          t1 = tan1.x;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>this._currentValue).x = a * p0.x + b * t0 * dur + c * t1 * dur + d * p1.x;
        } else {
          (<Quaternion>this._currentValue).x = p0.x;
        }

        (t0 = tan0.y), (t1 = tan1.y);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>this._currentValue).y = a * p0.y + b * t0 * dur + c * t1 * dur + d * p1.y;
        } else {
          (<Quaternion>this._currentValue).y = p0.y;
        }

        (t0 = tan0.z), (t1 = tan1.z);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>this._currentValue).z = a * p0.z + b * t0 * dur + c * t1 * dur + d * p1.z;
        } else {
          (<Quaternion>this._currentValue).z = p0.z;
        }

        (t0 = tan0.w), (t1 = tan1.w);
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          (<Quaternion>this._currentValue).w = a * p0.w + b * t0 * dur + c * t1 * dur + d * p1.w;
        } else {
          (<Quaternion>this._currentValue).w = p0.w;
        }
        return <Quaternion>this._currentValue;
      }
    }
  }

  private _getFrameInfo(time: number): IFrameInfo {
    let keyTime = 0;
    let frameIndex = 0;
    let nextFrameIndex = 0;
    const { keys, _currentIndex } = this;
    const { length } = keys;
    if (time >= keys[_currentIndex].time && time < keys[_currentIndex + 1].time) {
      keyTime = time - keys[_currentIndex].time;
      frameIndex = _currentIndex;
    } else if (time > keys[_currentIndex + 1].time) {
      if (time <= keys[length - 1].time) {
        for (let i = _currentIndex; i < length - 1; ++i) {
          if (time >= keys[i].time && time < keys[i + 1].time) {
            keyTime = time - keys[i].time;
            frameIndex = i;
            this._currentIndex = i;
            break;
          }
        }
      } else {
        keyTime = 0;
        frameIndex = length - 1;
        this._currentIndex = frameIndex;
      }
    } else {
      if (time >= keys[0].time) {
        for (let i = 0; i < _currentIndex - 1; ++i) {
          if (time >= keys[i].time && time < keys[i + 1].time) {
            keyTime = time - keys[i].time;
            frameIndex = i;
            this._currentIndex = i;
            break;
          }
        }
      } else {
        keyTime = time - keys[0].time;
        frameIndex = 0;
        this._currentIndex = 0;
      }
    }

    nextFrameIndex = frameIndex + 1;

    if (nextFrameIndex >= length || keyTime < 0) {
      nextFrameIndex = frameIndex;
      if (length === 1) {
        nextFrameIndex = frameIndex = 0;
      }
    }

    let dur: number;
    if (keyTime < 0) {
      dur = 0;
    } else {
      dur = keys[nextFrameIndex].time - keys[frameIndex].time;
    }

    let alpha = nextFrameIndex === frameIndex || dur < 0.00001 ? 1 : keyTime / dur;

    this._frameInfo.frameIndex = frameIndex;
    this._frameInfo.nextFrameIndex = nextFrameIndex;
    this._frameInfo.alpha = alpha;
    this._frameInfo.dur = dur;

    return this._frameInfo;
  }
}
