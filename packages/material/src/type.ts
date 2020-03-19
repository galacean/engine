import { DataType, TextureFilter, TextureWrapMode, UniformSemantic } from "@alipay/o3-base";

export type TextureConfig = {
  magFilter?: TextureFilter;
  minFilter?: TextureFilter;
  wrapS?: TextureWrapMode;
  wrapT?: TextureWrapMode;
  flipY?: boolean;
  premultiplyAlpha?: boolean;
  /** 纹理 U 方向的缩放 */
  uScale?: number;
  /** 纹理 V 方向的缩放 */
  vScale?: number;
  /** 纹理 U 方向的偏移 */
  uOffset?: number;
  /** 纹理 V 方向的偏移 */
  vOffset?: number;
  /** 纹理旋转弧度，0～2PI */
  uvRotation?: number;
  /** 纹理中心点 */
  uvCenter?: number[];
  format?: GLenum;
  [key: string]: any;
};

export type RenderTargetConfig = {
  width?: number;
  height?: number;
  clearColor?;
  enableDepthTexture?: boolean;
  isCube?: boolean;
  /** WebGL2 时，可以开启硬件层的 MSAA */
  samples?: number;
  isMulti?: boolean;
};

export type Rect = { x: number; y: number; width: number; height: number };

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
