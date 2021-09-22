import { AnimationProperty } from "@oasis-engine/core";
export enum KeyframeValueType {
  Number,
  Float32Array,
  Vector2,
  Vector3,
  Vector4,
  Quaternion,
  Object
}

export enum ComponentClass {
  Transform,
  SkinnedMeshRenderer,
}

export const PropertyNameMap = ['position', 'rotation', 'scale', 'blendShapeWeights'];

export interface IAnimationClipAsset {
  name: string;
  events: Array<{
    time: number;
    functionName: string;
    parameter: string;
  }>;
  curveBindings: Array<{
    relativePath: string;
    componentClass: ComponentClass;
    property: AnimationProperty;
    curve: {
      interpolation: number;
      keys: Array<{
        type: KeyframeValueType;
        time: number;
        value: any; // 详细查看 KeyframeValueType的映射
        inTangent: any; // 详细查看 KeyframeValueType的映射
        outTangent: any; // 详细查看 KeyframeValueType的映射
      }>;
    };
  }>;
}
