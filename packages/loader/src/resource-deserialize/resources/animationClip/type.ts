export enum InterpolableValueType {
  Float,
  FloatArray,
  Vector2,
  Vector3,
  Vector4,
  Quaternion,
  Color,
  Array
}

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
    property: string;
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
