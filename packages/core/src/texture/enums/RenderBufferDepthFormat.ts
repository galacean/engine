/**
 * 渲染缓冲深度格式枚举。
 */
export enum RenderBufferDepthFormat {
  /** 深度缓冲，自动选择精度 */
  Depth = 0,
  /** 深度模版缓冲，自动选择精度 */
  DepthStencil = 1,
  /** 模板缓冲 */
  Stencil = 2,

  /** 强制16位深度缓冲 */
  Depth16 = 3,
  /** 强制24位深度缓冲 */
  Depth24 = 4,
  /** 强制32位深度缓冲 */
  Depth32 = 5,
  /** 强制24位深度缓冲+8位模版缓冲 */
  Depth24Stencil8 = 6,
  /** 强制32位深度缓冲+8位模版缓冲 */
  Depth32Stencil8 = 7
}
