import { EngineObject } from "../base/EngineObject";
import { InterpolationType } from "./AnimationConst";
import { IChannel, ISample, List, Value } from "./types";

export enum TagetType {
  position = 0,
  rotation = 1,
  scale = 2,
  other = 3
}

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class AnimationClip extends EngineObject {
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
   * @constructor
   * @param {string} name
   */
  constructor(public readonly name: string) {
    super(null);

    /** @member {Array} */
    this.samplers = [];

    /** @member {Array} */
    this.channels = [];
  }

  /**
   * 添加一个 sampler
   * @param {Float32Array} _input
   * @param {Float32Array} _output
   * @param {number} _outputSize
   * @param {constant} _interpolation
   */
  public addSampler(
    _input: List,
    _output: List,
    _outputSize: number,
    _interpolation: InterpolationType = InterpolationType.LINEAR
  ) {
    // FIXME - adapt old error animation export file
    if (_interpolation === InterpolationType.CUBICSPLINE) {
      if (_outputSize <= 4) {
        _interpolation = InterpolationType.LINEAR;
      } else {
        _outputSize /= 3;
      }
    }

    // sampler object, defines an curve
    const sampler = {
      input: _input,
      output: _output,
      outputSize: _outputSize,
      interpolation: _interpolation
    };
    this.samplers.push(sampler);
  }

  /**
   * 添加 channel
   * @param {number} samplerIndex
   * @param {string} targetID, Entity name
   * @param {string} targetPath, Transform property name: position, rotation, scale
   */
  public addChannel(samplerIndex: number, targetID: string, targetPath: string) {
    const bindSampler = this.samplers[samplerIndex];

    let tagetType: TagetType = AnimationClip._tagetTypeMap[targetPath];
    // channel object, bind a Sample to an Object property
    const channel = {
      sampler: bindSampler,
      target: {
        id: targetID,
        path: targetPath,
        pathType: tagetType ?? TagetType.other
      }
    };

    this.channels.push(channel);
  }

  /**
   * 取得 channel 的总数
   * @return {number} number of channels
   */
  public getChannelCount(): number {
    return this.channels.length;
  }

  /**
   * 取得 channel 的作用的 object
   * @return channel objects
   * @param {number} channelIndex
   */
  public getChannelObject(channelIndex: number) {
    return this.channels[channelIndex];
  }

  /**
   * 取得 channel 的 frame count
   * @return channel frame count
   * @param {number} channelIndex
   */
  public getFrameCount(channelIndex: number): number {
    const sampler = this.channels[channelIndex].sampler;
    return sampler.input.length;
  }

  /**
   * 取得 channel 的 frame time
   * @return channel frame time
   * @param {number} channelIndex
   * @param {number} frameIndex
   */
  public getFrameTime(channelIndex: number, frameIndex: number): number {
    const sampler = this.channels[channelIndex].sampler;
    return sampler.input[frameIndex];
  }

  /**
   * 取得 channel 的时间长度
   * @return channel time length
   * @param {number} channelIndex
   */
  public getChannelTimeLength(channelIndex: number): number {
    const sampler = this.channels[channelIndex].sampler;
    const frameCount = sampler.input.length;
    return sampler.input[frameCount - 1];
  }

  /**
   * 取得 channel 的值
   * @return channel value
   * @param {number} channelIndex
   */
  public createChannelValue(channelIndex: number): number | Float32Array | number[] {
    const sampler = this.channels[channelIndex].sampler;

    return new Float32Array(sampler.outputSize);
  }

  /**
   * @private
   * @param {Value} outValue
   * @param {number} channelIndex
   * @param {number} frameIndex
   * @param {number} nextFrameIndex
   * @param {number} alpha
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
      case InterpolationType.CUBICSPLINE:
        this.evaluateCubicSpline(outValue, output, outputSize, frameIndex, nextFrameIndex, alpha);
        break;
      case InterpolationType.LINEAR:
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
    } // end of switch
  }

  private _quaSlerp(out, a, aIndex, b, bIndex, t) {
    // benchmarks:
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

    // calc cosine
    cosom = ax * bx + ay * by + az * bz + aw * bw;
    // adjust signs (if necessary)
    if (cosom < 0.0) {
      cosom = -cosom;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    // calculate coefficients
    if (1.0 - cosom > 0.000001) {
      // standard case (slerp)
      omega = Math.acos(cosom);
      sinom = Math.sin(omega);
      scale0 = Math.sin((1.0 - t) * omega) / sinom;
      scale1 = Math.sin(t * omega) / sinom;
    } else {
      // "from" and "to" quaternions are very close
      //  ... so we can do a linear interpolation
      scale0 = 1.0 - t;
      scale1 = t;
    }
    // calculate final values
    out[0] = scale0 * ax + scale1 * bx;
    out[1] = scale0 * ay + scale1 * by;
    out[2] = scale0 * az + scale1 * bz;
    out[3] = scale0 * aw + scale1 * bw;

    return out;
  }
}
