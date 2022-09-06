export enum AnimationPropertyInternal {
  Position,
  Rotation,
  Scale,
  BlendShapeWeights
}

export type AnimationProperty = AnimationPropertyInternal | string;
