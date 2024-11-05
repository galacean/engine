import {
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  CompareFunction,
  CullMode,
  RenderQueueType,
  StencilOperation
} from "@galacean/engine-core";
import type { IAssetRef, IColor, IShaderRef, IVector2, IVector3 } from "./BasicSchema";

export interface IRenderState {
  /** Blend state. */
  blendState: {
    /** The blend state of the render target. */
    targetBlendState: {
      /** Whether to enable blend. */
      enabled: boolean;
      /** color (RGB) blend operation. */
      colorBlendOperation: BlendOperation;
      /** alpha (A) blend operation. */
      alphaBlendOperation: BlendOperation;
      /** color blend factor (RGB) for source. */
      sourceColorBlendFactor: BlendFactor;
      /** alpha blend factor (A) for source. */
      sourceAlphaBlendFactor: BlendFactor;
      /** color blend factor (RGB) for destination. */
      destinationColorBlendFactor: BlendFactor;
      /** alpha blend factor (A) for destination. */
      destinationAlphaBlendFactor: BlendFactor;
      /** color mask. */
      colorWriteMask: ColorWriteMask;
    };
    blendColor: IColor;
    /** Whether to use (Alpha-to-Coverage) technology. */
    alphaToCoverage: boolean;
  };

  /** Depth state. */
  depthState: {
    /** Whether to enable the depth test. */
    enabled: boolean;
    /** Whether the depth value can be written.*/
    writeEnabled: boolean;
    /** Depth comparison function. */
    compareFunction: CompareFunction;
  };
  /** Stencil state. */
  stencilState: {
    /** Whether to enable stencil test. */
    enabled: boolean;
    /** Write the reference value of the stencil buffer. */
    referenceValue: number;
    /** Specifying a bit-wise mask that is used to AND the reference value and the stored stencil value when the test is done. */
    mask: number;
    /** Specifying a bit mask to enable or disable writing of individual bits in the stencil planes. */
    writeMask: number;
    /** The comparison function of the reference value of the front face of the geometry and the current buffer storage value. */
    compareFunctionFront: CompareFunction;
    /** The comparison function of the reference value of the back of the geometry and the current buffer storage value. */
    compareFunctionBack: CompareFunction;
    /** specifying the function to use for front face when both the stencil test and the depth test pass. */
    passOperationFront: StencilOperation;
    /** specifying the function to use for back face when both the stencil test and the depth test pass. */
    passOperationBack: StencilOperation;
    /** specifying the function to use for front face when the stencil test fails. */
    failOperationFront: StencilOperation;
    /** specifying the function to use for back face when the stencil test fails. */
    failOperationBack: StencilOperation;
    /** specifying the function to use for front face when the stencil test passes, but the depth test fails. */
    zFailOperationFront: StencilOperation;
    /** specifying the function to use for back face when the stencil test passes, but the depth test fails. */
    zFailOperationBack: StencilOperation;
  };
  /** Raster state. */
  rasterState: {
    /** Specifies whether or not front- and/or back-facing polygons can be culled. */
    cullMode: CullMode;
    /** The multiplier by which an implementation-specific value is multiplied with to create a constant depth offset. */
    depthBias: number;
    /** The scale factor for the variable depth offset for each polygon. */
    slopeScaledDepthBias: number;
  };
  /** Render queue type. */
  renderQueueType: RenderQueueType;
}

export interface IMaterialSchema {
  name: string;
  shader: string;
  shaderData: {
    [key: string]: {
      type: EngineMaterialPropertyType;
      value: IVector3 | IVector2 | IColor | number | IAssetRef;
    };
  };
  macros: Array<{ name: string; value?: string }>;
  renderState: IRenderState;
  shaderRef: IShaderRef;
}

/** @internal */
export enum EngineMaterialPropertyType {
  Vector2 = "Vector2",
  Vector3 = "Vector3",
  Vector4 = "Vector4",
  Color = "Color",
  Float = "Float",
  Texture = "Texture",
  Boolean = "Boolean",
  Integer = "Integer"
}
