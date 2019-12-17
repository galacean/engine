import { DataType, TextureFilter, TextureWrapMode, UniformSemantic } from "@alipay/o3-base";

export type TextureConfig = {
  magFilter?: TextureFilter;
  minFilter?: TextureFilter;
  wrapS?: TextureWrapMode;
  wrapT?: TextureWrapMode;
  flipY?: boolean;
  premultiplyAlpha?: boolean;
  [key: string]: any;
};
export type React = { x: number; y: number; width: number; height: number };

export type TechniqueStates = {
  enable?: GLenum[];
  disable?: GLenum[];
  functions?: {
    [key: string]: any;
  };
};

export interface Attributes {
  [key: string]: {
    name: string;
    semantic: string;
    type: DataType;
  };
}

export interface Uniforms {
  [key: string]: {
    name: string;
    semantic?: UniformSemantic | string;
    type: DataType;
  };
}
