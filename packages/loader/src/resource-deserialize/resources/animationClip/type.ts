import { AnimationProperty, InterpolableValueType } from "@oasis-engine/core";

export enum ComponentClass {
  Transform,
  SkinnedMeshRenderer,
  Other
}

export const PropertyNameMap = ['position', 'rotation', 'scale', 'blendShapeWeights'];

export interface IAnimationClipAsset {
  objectId: string;
  name: string;
  events: Array<{
    time: number;
    functionName: string;
    parameter: string;
  }>;
  curveBindings: Array<{
    relativePath: string;
    property: AnimationProperty;
    curve: {
      interpolation: number;
      keys: Array<{
        time: number;
        value: any; // 详细查看 KeyframeValueType的映射
        inTangent: any; // 详细查看 KeyframeValueType的映射
        outTangent: any; // 详细查看 KeyframeValueType的映射
      }>;
      valueType: InterpolableValueType;
    };
  }>;
}
