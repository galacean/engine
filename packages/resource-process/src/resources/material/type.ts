export enum UniformType {
  Number,
  Vector2,
  Vector3,
  Vector4,
  Color,
  Texture
}

export interface UniformValue {
  type: UniformType;
  value: any; // 详细查看 UniformType 到 Value 的映射
}

export interface IMaterialAsset {
  // shader name
  objectId: string;
  // short
  renderQueueType: number;
  // string array
  enabledMacro: string[];
  shader: string;
  shaderData: { [uniformName: string]: UniformValue };
  renderState: any;
}