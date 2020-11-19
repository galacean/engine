import { DataType, UniformSemantic } from "../base/Constant";

export interface RenderTargetConfig {
  width?: number;
  height?: number;
  clearColor?;
  enableDepthTexture?: boolean;
  isCube?: boolean;
  /** WebGL2 时，可以开启硬件层的 MSAA */
  samples?: number;
  isMulti?: boolean;
  /** color Buffer 输出是否要 float 浮点类型 */
  colorBufferFloat?: boolean;
}

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
