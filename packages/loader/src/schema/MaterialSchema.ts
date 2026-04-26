import {
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  CompareFunction,
  CullMode,
  RenderQueueType,
  StencilOperation
} from "@galacean/engine-core";
import type { RefItem } from "./CommonSchema";
import type { IColor, IVector2, IVector3 } from "./BasicSchema";

export interface IRenderState {
  blendState: {
    targetBlendState: {
      enabled: boolean;
      colorBlendOperation: BlendOperation;
      alphaBlendOperation: BlendOperation;
      sourceColorBlendFactor: BlendFactor;
      sourceAlphaBlendFactor: BlendFactor;
      destinationColorBlendFactor: BlendFactor;
      destinationAlphaBlendFactor: BlendFactor;
      colorWriteMask: ColorWriteMask;
    };
    blendColor: IColor;
    alphaToCoverage: boolean;
  };
  depthState: {
    enabled: boolean;
    writeEnabled: boolean;
    compareFunction: CompareFunction;
  };
  stencilState: {
    enabled: boolean;
    referenceValue: number;
    mask: number;
    writeMask: number;
    compareFunctionFront: CompareFunction;
    compareFunctionBack: CompareFunction;
    passOperationFront: StencilOperation;
    passOperationBack: StencilOperation;
    failOperationFront: StencilOperation;
    failOperationBack: StencilOperation;
    zFailOperationFront: StencilOperation;
    zFailOperationBack: StencilOperation;
  };
  rasterState: {
    cullMode: CullMode;
    depthBias: number;
    slopeScaledDepthBias: number;
  };
  renderQueueType: RenderQueueType;
}

export interface IMaterialSchema {
  name: string;
  shader: string;
  shaderData: {
    [key: string]: {
      type: MaterialLoaderType;
      value: IVector3 | IVector2 | IColor | number | RefItem;
    };
  };
  macros: Array<{ name: string; value?: string }>;
  renderState: IRenderState;
  shaderRef: RefItem;
}

export enum MaterialLoaderType {
  Vector2 = "Vector2",
  Vector3 = "Vector3",
  Vector4 = "Vector4",
  Color = "Color",
  Float = "Float",
  Texture = "Texture",
  Boolean = "Boolean",
  Integer = "Integer"
}
