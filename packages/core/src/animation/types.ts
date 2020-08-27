import { Quaternion } from "@alipay/o3-math";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { SkinnedMeshRenderer } from "../mesh/SkinnedMeshRenderer";
import { InterpolationType, WrapMode } from "./AnimationConst";

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
  pathType: number;
  path: string;
  id: string;
}

export type IChannelTarget = {
  targetObject: Entity | Component | SkinnedMeshRenderer;
  pathType: number;
  path: string;
  outputSize: number;
};

export type List = number[] | Float32Array;

export type Value = number | List | Quaternion;
