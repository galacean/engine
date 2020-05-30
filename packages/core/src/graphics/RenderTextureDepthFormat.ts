/**
 * 渲染纹理深度格式枚举。
 */
export enum RenderTextureDepthFormat {
  /** 至少16位深度缓冲，无模版缓冲。*/
  Depth16 = 0,
  /** 8位模板缓冲，无深度缓冲。*/
  Stencil8 = 1,
  /** 深度缓冲和模板缓冲。*/
  DepthStencil = 2
}
