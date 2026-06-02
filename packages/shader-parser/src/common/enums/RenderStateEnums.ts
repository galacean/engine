// Synced copy of engine-core's render-state enums (packages/core/src/shader/enums) so the parser
// carries no engine-core dependency. Values MUST stay identical to engine-core — guarded by a sync test.

export enum BlendFactor {
  Zero,
  One,
  SourceColor,
  OneMinusSourceColor,
  DestinationColor,
  OneMinusDestinationColor,
  SourceAlpha,
  OneMinusSourceAlpha,
  DestinationAlpha,
  OneMinusDestinationAlpha,
  SourceAlphaSaturate,
  BlendColor,
  OneMinusBlendColor
}

export enum BlendOperation {
  Add,
  Subtract,
  ReverseSubtract,
  Min,
  Max
}

export enum ColorWriteMask {
  None = 0,
  Red = 0x1,
  Green = 0x2,
  Blue = 0x4,
  Alpha = 0x8,
  All = 0xf
}

export enum CompareFunction {
  Never,
  Less,
  Equal,
  LessEqual,
  Greater,
  NotEqual,
  GreaterEqual,
  Always
}

export enum CullMode {
  Off,
  Front,
  Back
}

export enum RenderQueueType {
  Opaque,
  AlphaTest,
  Transparent
}

export enum RenderStateElementKey {
  BlendStateEnabled0 = 0,
  BlendStateColorBlendOperation0 = 1,
  BlendStateAlphaBlendOperation0 = 2,
  BlendStateSourceColorBlendFactor0 = 3,
  BlendStateSourceAlphaBlendFactor0 = 4,
  BlendStateDestinationColorBlendFactor0 = 5,
  BlendStateDestinationAlphaBlendFactor0 = 6,
  BlendStateColorWriteMask0 = 7,
  BlendStateBlendColor = 8,
  BlendStateAlphaToCoverage = 9,

  DepthStateEnabled = 10,
  DepthStateWriteEnabled = 11,
  DepthStateCompareFunction = 12,

  StencilStateEnabled = 13,
  StencilStateReferenceValue = 14,
  StencilStateMask = 15,
  StencilStateWriteMask = 16,
  StencilStateCompareFunctionFront = 17,
  StencilStateCompareFunctionBack = 18,
  StencilStatePassOperationFront = 19,
  StencilStatePassOperationBack = 20,
  StencilStateFailOperationFront = 21,
  StencilStateFailOperationBack = 22,
  StencilStateZFailOperationFront = 23,
  StencilStateZFailOperationBack = 24,

  RasterStateCullMode = 25,
  RasterStateDepthBias = 26,
  RasterStateSlopeScaledDepthBias = 27,

  RenderQueueType = 28
}

export enum StencilOperation {
  Keep,
  Zero,
  Replace,
  IncrementSaturate,
  DecrementSaturate,
  Invert,
  IncrementWrap,
  DecrementWrap
}
