import {
  EngineObject,
  Component,
  Transform,
  AnimationCurve,
  AnimationClipCurveData,
  FloatKeyframe,
  Vector2Keyframe,
  Vector3Keyframe,
  QuaternionKeyframe,
  AnimateProperty,
  InterpolationType
} from "@oasis-engine/core";
import { Vector2, Vector3, Vector4, Quaternion } from "@oasis-engine/math";

export interface IChannelState {
  frameTime: number;
  currentFrame: number;
  currentValue: Value;
  mixWeight?: number;
}

export interface IChannel {
  sampler: ISample;
  target: ITarget;
}

export interface ISample {
  input: List;
  output: List;
  outputSize: number;
  interpolation: InterpolationType;
}

export interface ITarget {
  pathType: AnimateProperty;
  path: string;
  id: string;
}

export type List = number[] | Float32Array;

export type Value = number | List | Quaternion;

export enum TagetType {
  position = 0,
  rotation = 1,
  scale = 2,
  other = 3
}

/**
 * Data for an animation, set of Samples and Channels.
 */
export class AnimationClipParser extends EngineObject {
  private static _tagetTypeMap: Object = {
    position: TagetType.position,
    rotation: TagetType.rotation,
    scale: TagetType.scale
  };

  public duration: number;

  public durationIndex: number;

  public samplers: ISample[];

  public channels: IChannel[];
  /**
   * @param name - The AnimationClip's name.
   */
  constructor() {
    super(null);
    this.samplers = [];

    this.channels = [];
  }

  /**
   * Add sampler to samplers of the AnimationClip.
   * @param _input - The index of an accessor containing keyframe input values.
   * @param _output - The index of an accessor containing keyframe output values.
   * @param _outputSize - The length of the output values.
   * @param _interpolation - Interpolation algorithm.
   */
  public addSampler(
    _input: List,
    _output: List,
    _outputSize: number,
    _interpolation: InterpolationType = InterpolationType.Linear
  ) {
    // FIXME - adapt old error animation export file
    if (_interpolation === InterpolationType.CubicSpine) {
      if (_outputSize <= 4) {
        _interpolation = InterpolationType.Linear;
      } else {
        _outputSize /= 3;
      }
    }

    // The sampler object, defines an curve
    const sampler = {
      input: _input,
      output: _output,
      outputSize: _outputSize,
      interpolation: _interpolation
    };
    this.samplers.push(sampler);
  }

  /**
   * Add channel to channels of the AnimationClip.
   * @param samplerIndex - The sampler's index in channel's sampler property.
   * @param targetID - Entity name.
   * @param targetPath - Transform property name: position, rotation, scale.
   */
  public addChannel(samplerIndex: number, targetID: string, targetPath: string) {
    const bindSampler = this.samplers[samplerIndex];

    let pathType = AnimateProperty[targetPath] ?? AnimateProperty.Other;
    // The channel object, bind a Sample to an Object property.
    const channel = {
      sampler: bindSampler,
      target: {
        id: targetID,
        path: targetPath,
        pathType
      }
    };

    this.channels.push(channel);
  }

  /**
   * Get length of the channel.
   * @return {number} Number of channels.
   */
  public getChannelCount(): number {
    return this.channels.length;
  }

  /**
   * Get the object which the channel acting on.
   * @return Channel objects.
   * @param channelIndex - The channel's index in AnimationClip's channels property.
   */
  public getChannelObject(channelIndex: number) {
    return this.channels[channelIndex];
  }

  /**
   * Get frame count of the channel.
   * @return Channel frame count.
   * @param channelIndex - The channel's index in AnimationClip's channels property.
   */
  public getFrameCount(channelIndex: number): number {
    const sampler = this.channels[channelIndex].sampler;
    return sampler.input.length;
  }

  /**
   * Get frame time of the channel by channelIndex and frameIndex.
   * @return channel frame time
   * @param channelIndex - The channel's index in AnimationClip's channels property.
   * @param frameIndex - The keyframe's index in sampler.input.
   */
  public getFrameTime(channelIndex: number, frameIndex: number): number {
    const sampler = this.channels[channelIndex].sampler;
    return sampler.input[frameIndex];
  }

  /**
   * Get length of the channel.
   * @return channel time length
   * @param channelIndex - The channel's index in AnimationClip's channels property.
   */
  public getChannelTimeLength(channelIndex: number): number {
    const sampler = this.channels[channelIndex].sampler;
    const frameCount = sampler.input.length;
    return sampler.input[frameCount - 1];
  }

  /**
   * Get the channel value.
   * @return channel value
   * @param channelIndex - The channel's index in AnimationClip's channels property.
   */
  public createChannelValue(channelIndex: number): number | Float32Array | number[] {
    const sampler = this.channels[channelIndex].sampler;

    return new Float32Array(sampler.outputSize);
  }

  /**
   * @param outValue - The output value after interpolation.
   * @param channelIndex - The channel's index in AnimationClip's channels property.
   * @param frameIndex - The keyframe's index in sampler.input.
   * @param nextFrameIndex - The next keyframe's index in sampler.input.
   * @param alpha - The weight of the next keyframe in interpolation algorithm.
   */
  public evaluate(
    outValue: Value,
    channelIndex: number,
    frameIndex: number,
    nextFrameIndex: number,
    alpha: number
  ): Value {
    const channel = this.channels[channelIndex];
    const output = channel.sampler.output;
    const outputSize = channel.sampler.outputSize;

    switch (channel.sampler.interpolation) {
      case InterpolationType.CubicSpine:
        this.evaluateCubicSpline(outValue, output, outputSize, frameIndex, nextFrameIndex, alpha);
        break;
      case InterpolationType.Linear:
        this.evaluateLinear(outValue, output, outputSize, frameIndex, nextFrameIndex, alpha);
        break;
    }

    return outValue;
  }

  public evaluateCubicSpline(
    outValue: Value,
    output: List,
    outputSize: number,
    frameIndex: number,
    nextFrameIndex: number,
    alpha: number
  ) {
    const squared = alpha * alpha;
    const cubed = alpha * squared;
    const part1 = 2.0 * cubed - 3.0 * squared + 1.0;
    const part2 = -2.0 * cubed + 3.0 * squared;
    const part3 = cubed - 2.0 * squared + alpha;
    const part4 = cubed - squared;

    for (let i = outputSize; i >= 0; i--) {
      const t1 = output[frameIndex * outputSize * 3 + i];
      const v1 = output[frameIndex * outputSize * 3 + outputSize + i];
      const t2 = output[frameIndex * outputSize * 3 + outputSize * 2 + i];
      const v2 = output[nextFrameIndex * outputSize * 3 + outputSize + i];

      outValue[i] = v1 * part1 + v2 * part2 + t1 * part3 + t2 * part4;
    }
  }

  public evaluateLinear(
    outValue: Value,
    output: List,
    outputSize: number,
    frameIndex: number,
    nextFrameIndex: number,
    alpha: number
  ) {
    switch (outputSize) {
      case 1:
        outValue[0] = output[frameIndex] * (1 - alpha) + output[nextFrameIndex] * alpha;
        break;
      case 4:
        // const start = new Quaternion(
        //   output[frameIndex * outputSize],
        //   output[frameIndex * outputSize + 1],
        //   output[frameIndex * outputSize + 2],
        //   output[frameIndex * outputSize + 3]
        // );
        // const end = new Quaternion(
        //   output[nextFrameIndex * outputSize],
        //   output[nextFrameIndex * outputSize + 1],
        //   output[nextFrameIndex * outputSize + 2],
        //   output[nextFrameIndex * outputSize + 3]
        // );
        // Quaternion.slerp(start, end, alpha, <Quaternion>outValue);
        this._quaSlerp(outValue, output, frameIndex * outputSize, output, nextFrameIndex * outputSize, alpha);
        break;
      default:
        for (let i = outputSize; i >= 0; i--) {
          outValue[i] =
            output[frameIndex * outputSize + i] * (1 - alpha) + output[nextFrameIndex * outputSize + i] * alpha;
        }
        break;
    } // End of switch
  }

  public getCurveDatas(): AnimationClipCurveData<Component>[] {
    const channelCount = this.getChannelCount();
    const curveDatas: AnimationClipCurveData<Transform>[] = [];
    for (let i = channelCount - 1; i >= 0; i--) {
      const channel = this.getChannelObject(i);
      const { target } = channel;
      const sampler = channel.sampler;
      const curve = new AnimationCurve();
      const frameCount = this.getFrameCount(i);
      curve.interpolation = sampler.interpolation;
      for (let j = 0; j < frameCount; j++) {
        const { outputSize } = sampler;
        const output = [];
        for (let k = 0; k < outputSize; k++) {
          output.push(sampler.output[j * outputSize + k]);
        }
        if (outputSize === 1) {
          const keyframe = new FloatKeyframe();
          keyframe.time = sampler.input[j];
          keyframe.value = output[0];
          keyframe.inTangent = 0;
          keyframe.outTangent = 0;
          curve.addKey(keyframe);
        }
        if (outputSize === 2) {
          const keyframe = new Vector2Keyframe();
          keyframe.time = sampler.input[j];
          keyframe.value = new Vector2(...output);
          keyframe.inTangent = new Vector2();
          keyframe.outTangent = new Vector2();
          curve.addKey(keyframe);
        }
        if (outputSize === 3) {
          const keyframe = new Vector3Keyframe();
          keyframe.time = sampler.input[j];
          keyframe.value = new Vector3(...output);
          keyframe.inTangent = new Vector3();
          keyframe.outTangent = new Vector3();
          curve.addKey(keyframe);
        }
        if (outputSize === 4) {
          const keyframe = new QuaternionKeyframe();
          keyframe.time = sampler.input[j];
          keyframe.value = new Quaternion(...output);
          keyframe.inTangent = new Vector4();
          keyframe.outTangent = new Vector4();
          curve.addKey(keyframe);
        }
      }
      curveDatas.push({
        curve,
        relativePath: target.id,
        type: Transform,
        propertyName: target.path
      });
    }
    return curveDatas;
  }

  private _quaSlerp(out, a, aIndex, b, bIndex, t) {
    // Benchmarks:
    //    http://jsperf.com/quaternion-slerp-implementations
    let ax = a[0 + aIndex],
      ay = a[1 + aIndex],
      az = a[2 + aIndex],
      aw = a[3 + aIndex];
    let bx = b[0 + bIndex],
      by = b[1 + bIndex],
      bz = b[2 + bIndex],
      bw = b[3 + bIndex];

    let omega, cosom, sinom, scale0, scale1;

    // Calc cosine.
    cosom = ax * bx + ay * by + az * bz + aw * bw;
    // Adjust signs (if necessary).
    if (cosom < 0.0) {
      cosom = -cosom;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    // Calculate coefficients.
    if (1.0 - cosom > 0.000001) {
      // Standard case (slerp)
      omega = Math.acos(cosom);
      sinom = Math.sin(omega);
      scale0 = Math.sin((1.0 - t) * omega) / sinom;
      scale1 = Math.sin(t * omega) / sinom;
    } else {
      // The "from" quaternions and the "to" quaternions are very close, so we can do a linear interpolation.
      scale0 = 1.0 - t;
      scale1 = t;
    }
    // Calculate final values.
    out[0] = scale0 * ax + scale1 * bx;
    out[1] = scale0 * ay + scale1 * by;
    out[2] = scale0 * az + scale1 * bz;
    out[3] = scale0 * aw + scale1 * bw;

    return out;
  }
}
