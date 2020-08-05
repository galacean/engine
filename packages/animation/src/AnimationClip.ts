import { AssetObject } from "@alipay/o3-core";
import { InterpolationType } from "./AnimationConst";
import { Quaternion } from "@alipay/o3-math";
import { List, Value, ISample, IChannel } from "./types";

/**
 * Data for an animation, set of Samples and Channels
 * @extends AssetObject
 */
export class AnimationClip extends AssetObject {
  public samplers: ISample[];

  public channels: IChannel[];
  /**
   * @constructor
   * @param {string} name
   */
  constructor(public readonly name: string) {
    super();

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

    // channel object, bind a Sample to an Object property
    const channel = {
      sampler: bindSampler,
      target: {
        id: targetID,
        path: targetPath
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
    switch (sampler.outputSize) {
      case 1:
        return 0.0;
      // break;
      default:
        return new Float32Array(sampler.outputSize);
      // break;
    } // end of switch
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
        outValue = output[frameIndex] * (1 - alpha) + output[nextFrameIndex] * alpha;
        break;
      case 4:
        const a = new Quaternion(
          output[frameIndex * outputSize],
          output[frameIndex * outputSize + 1],
          output[frameIndex * outputSize + 2],
          output[frameIndex * outputSize + 3]
        );
        const b = new Quaternion(
          output[nextFrameIndex * outputSize],
          output[nextFrameIndex * outputSize + 1],
          output[nextFrameIndex * outputSize + 2],
          output[nextFrameIndex * outputSize + 3]
        );
        Quaternion.slerp(a, b, alpha, outValue);
        break;
      default:
        for (let i = outputSize; i >= 0; i--) {
          outValue[i] =
            output[frameIndex * outputSize + i] * (1 - alpha) + output[nextFrameIndex * outputSize + i] * alpha;
        }
        break;
    } // end of switch
  }
}
