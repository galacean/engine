import { InterpolationType, WrapMode } from "./AnimationConst";
import { Entity, Component } from "@alipay/o3-core";
import { SkinnedMeshRenderer } from "@alipay/o3-mesh";

export interface AnimationOptions {
  wrapMode?: WrapMode;
}

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
  path: string;
  id: string;
}

export type IChannelTarget = {
  targetObject: Entity | Component | SkinnedMeshRenderer;
  path: string;
  outputSize: number;
};

export type List = number[] | Float32Array;

export type Value = number | List;
