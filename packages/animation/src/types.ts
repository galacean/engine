import { InterpolationType, WrapMode } from "./AnimationConst";
import { Node, NodeAbility } from "@alipay/o3-core";

export interface AnimationOptions {
  wrapMode?: WrapMode
}

export interface IChannelState {
  frameTime: number,
  currentFrame: number,
  currentValue: Value,
  mixWeight?: number
}

export interface IChannel {
  sampler: ISample
  target: ITarget
}

export interface ISample {
  input: List,
  output: List,
  outputSize: number,
  interpolation: InterpolationType
}

export interface ITarget {
  path: string,
  id: string
}

export interface IChannelTarget {
  targetObject: Node | NodeAbility,
  path: string,
  outputSize: number
}

export type List = number[] | Float32Array;

export type Value = number | List