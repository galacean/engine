export enum RenderStateElementKey {
  /** Blend state enabled for target 0 key. */
  BlendStateEnabled0 = 0,
  /** Blend state color blend operation for target 0 key. */
  BlendStateColorBlendOperation0 = 1,
  /** Blend state alpha blend operation for target 0 key. */
  BlendStateAlphaBlendOperation0 = 2,
  /** Blend state source color blend factor for target 0 key. */
  BlendStateSourceColorBlendFactor0 = 3,
  /** Blend state source alpha blend factor for target 0 key. */
  BlendStateSourceAlphaBlendFactor0 = 4,
  /** Blend state destination color blend factor for target 0 key. */
  BlendStateDestinationColorBlendFactor0 = 5,
  /** Blend state destination alpha blend factor for target 0 key. */
  BlendStateDestinationAlphaBlendFactor0 = 6,
  /** Blend state color write mask for target 0 key. */
  BlendStateColorWriteMask0 = 7,
  /** Blend state blend color key. */
  BlendStateBlendColor = 8,
  /** Blend state alpha to coverage key. */
  BlendStateAlphaToCoverage = 9,

  /** Depth state enabled key. */
  DepthStateEnabled = 10,
  /** Depth state write enabled key. */
  DepthStateWriteEnabled = 11,
  /** Depth state compare function key. */
  DepthStateCompareFunction = 12,

  /** Stencil state enabled key. */
  StencilStateEnabled = 13,
  /** Stencil state reference value key. */
  StencilStateReferenceValue = 14,
  /** Stencil state read mask key. */
  StencilStateMask = 15,
  /** Stencil state write mask key. */
  StencilStateWriteMask = 16,
  /** Stencil state compare function front key. */
  StencilStateCompareFunctionFront = 17,
  /** Stencil state compare function back key. */
  StencilStateCompareFunctionBack = 18,
  /** Stencil state pass operation front key. */
  StencilStatePassOperationFront = 19,
  /** Stencil state pass operation back key. */
  StencilStatePassOperationBack = 20,
  /** Stencil state fail operation front key. */
  StencilStateFailOperationFront = 21,
  /** Stencil state fail operation back key. */
  StencilStateFailOperationBack = 22,
  /** Stencil state z fail operation front key. */
  StencilStateZFailOperationFront = 23,
  /** Stencil state z fail operation back key. */
  StencilStateZFailOperationBack = 24,

  /** Raster state fill mode key. */
  RasterStateCullMode = 25,
  /** Raster state cull mode key. */
  RasterStateDepthBias = 26,
  /** Raster state depth bias key. */
  RasterStateSlopeScaledDepthBias = 27,

  /** Render queue type key. */
  RenderQueueType = 28
}
