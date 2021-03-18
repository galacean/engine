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
import { InterpolationType } from "./AnimationConst";

export class AnimationCurve {
  keys: Keyframe[] = [];
  private _length: number = 0; //时间
  valueSize: number;

  get length() {
    return this._length;
  }

  private _evaluateLinear(frameIndex: number, nextFrameIndex: number, alpha: number) {
    const { valueSize, keys } = this;
    switch (valueSize) {
      case 1: {
        return keys[frameIndex].value * (1 - alpha) + keys[nextFrameIndex].value * alpha;
      }
      case 2: {
        let a = new Vector2();
        let b = new Vector2();
        Vector2.scale(keys[frameIndex].value, 1 - alpha, a);
        Vector2.scale(keys[nextFrameIndex].value, alpha, b);
        return a.add(b);
      }
      case 3: {
        let a = new Vector3();
        let b = new Vector3();
        Vector3.scale(keys[frameIndex].value, 1 - alpha, a);
        Vector3.scale(keys[nextFrameIndex].value, alpha, b);
        return a.add(b);
      }
      case 4: {
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

  private _evaluateCubicSpline(frameIndex: number, nextFrameIndex: number, alpha: number) {
    const { keys } = this;
    const squared = alpha * alpha;
    const cubed = alpha * squared;
    const part1 = 2.0 * cubed - 3.0 * squared + 1.0;
    const part2 = -2.0 * cubed + 3.0 * squared;
    const part3 = cubed - 2.0 * squared + alpha;
    const part4 = cubed - squared;

    const t1: Vector3 = keys[frameIndex].value;
    const v1: Vector3 = keys[frameIndex + 1].value;
    const t2: Vector3 = keys[frameIndex + 2].value;
    const v2: Vector3 = keys[nextFrameIndex + 1].value;

    return v1.scale(part1).add(v2.scale(part2)).add(t1.scale(part3)).add(t2.scale(part4)).clone();
  }

  private _evaluateStep(nextFrameIndex: number) {
    const { valueSize, keys } = this;
    if (valueSize === 1) {
      return keys[nextFrameIndex].value;
    } else {
      return keys[nextFrameIndex].value;
    }
  }

  private _evaluateHermite(frameIedex: number, nextFrameIndex: number, t: number, dur: number) {
    const { valueSize, keys } = this;
    const curKey = keys[frameIedex];
    const nextKey = keys[nextFrameIndex];
    switch (valueSize) {
      case 1: {
        var t0 = curKey.outTangent,
          t1 = nextKey.inTangent;
        if (Number.isFinite(t0) && Number.isFinite(t1)) {
          var t2 = t * t;
          var t3 = t2 * t;
          var a = 2.0 * t3 - 3.0 * t2 + 1.0;
          var b = t3 - 2.0 * t2 + t;
          var c = t3 - t2;
          var d = -2.0 * t3 + 3.0 * t2;
          return a * curKey.value + b * t0 * dur + c * t1 * dur + d * nextKey.value;
        } else return curKey.value;
      }
      case 2: {
        const out = new Vector2();
        const p0 = curKey.value;
        const tan0 = curKey.outTangent;
        const p1 = nextKey.value;
        const tan1 = nextKey.inTangent;

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
        const p0 = curKey.value;
        const tan0 = curKey.outTangent;
        const p1 = nextKey.value;
        const tan1 = nextKey.inTangent;

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
        const p0 = curKey.value;
        const tan0 = curKey.outTangent;
        const p1 = nextKey.value;
        const tan1 = nextKey.inTangent;

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

  private _getFrameInfo(time: number) {
    let keyTime = 0;
    let frameIndex = 0;
    let nextFrameIndex = 0;
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

  addKey(key: Keyframe) {
    const { time } = key;
    this.keys.push(key);
    if (time > this._length) {
      this._length = time;
    }
    if (!this.valueSize) {
      if (key instanceof FloatKeyframe) {
        this.valueSize = 1;
      }
      if (key instanceof Vector2Keyframe) {
        this.valueSize = 2;
      }
      if (key instanceof Vector3Keyframe) {
        this.valueSize = 3;
      }
      if (key instanceof Vector4Keyframe || key instanceof QuaternionKeyframe) {
        this.valueSize = 4;
      }
    }
  }

  evaluate(time: number): InterpolableValue {
    const { keys } = this;
    const { frameIndex, nextFrameIndex, alpha, dur } = this._getFrameInfo(time);
    const { interpolation } = keys[frameIndex];
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
    console.log(interpolation, val);
    return val;
  }

  moveKey(index: number, key: Keyframe) {
    this.keys[index] = key;
  }

  removeKey(index: number) {
    this.keys.splice(index, 1);
  }
}
