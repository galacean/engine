import { InterpolationType, WrapMode } from "./AnimationConst";
import { Node, NodeAbility } from "@alipay/o3-core";

export interface AnimationOptions {
  wrapMode?: WrapMode;
}

export type List = number[] | Float32Array;

export type Value = number | List;
