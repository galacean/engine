export enum RenderStateDataKey {
  /** Blend state enabled for target 0 key. */
  BlendStateEnabled0,
  /** Blend state color blend operation for target 0 key. */
  BlendStateColorBlendOperation0,
  /** Blend state alpha blend operation for target 0 key. */
  BlendStateAlphaBlendOperation0,
  /** Blend state source color blend factor for target 0 key. */
  BlendStateSourceColorBlendFactor0,
  /** Blend state source alpha blend factor for target 0 key. */
  BlendStateSourceAlphaBlendFactor0,
  /** Blend state destination color blend factor for target 0 key. */
  BlendStateDestinationColorBlendFactor0,
  /** Blend state destination alpha blend factor for target 0 key. */
  BlendStateDestinationAlphaBlendFactor0,
  /** Blend state color write mask for target 0 key. */
  BlendStateColorWriteMask0,
  /** Blend state blend color key. */
  BlendStateBlendColor,
  /** Blend state alpha to coverage key. */
  BlendStateAlphaToCoverage,

  /** Depth state enabled key. */
  DepthStateEnabled,
  /** Depth state write enabled key. */
  DepthStateWriteEnabled,
  /** Depth state compare function key. */
  DepthStateCompareFunction,

  /** Stencil state enabled key. */
  StencilStateEnabled,
  /** Stencil state reference value key. */
  StencilStateReferenceValue,
  /** Stencil state read mask key. */
  StencilStateMask,
  /** Stencil state write mask key. */
  StencilStateWriteMask,
  /** Stencil state compare function front key. */
  StencilStateCompareFunctionFront,
  /** Stencil state compare function back key. */
  StencilStateCompareFunctionBack,
  /** Stencil state pass operation front key. */
  StencilStatePassOperationFront,
  /** Stencil state pass operation back key. */
  StencilStatePassOperationBack,
  /** Stencil state fail operation front key. */
  StencilStateFailOperationFront,
  /** Stencil state fail operation back key. */
  StencilStateFailOperationBack,
  /** Stencil state z fail operation front key. */
  StencilStateZFailOperationFront,
  /** Stencil state z fail operation back key. */
  StencilStateZFailOperationBack,

  /** Raster state fill mode key. */
  RasterStateCullMode,
  /** Raster state cull mode key. */
  RasterStateDepthBias,
  /** Raster state depth bias key. */
  RasterStateSlopeScaledDepthBias
}
