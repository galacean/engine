/**
 * 定义 VertexBuffer 或 IndexBuffer 在 SetData 时如何刷新。
 */
export enum SetDataOptions {
  /** 可覆盖部分 GPU 正在使用的数据，并保证正确的渲染效果。*/
  None,
  /** 完全丢弃之前的缓冲，返回一块新的缓冲块并不影响之前使用缓冲的渲染。*/
  Discard

  //   /** 需要保证不会覆盖 GPU 正在使用的数据，setData 后可立即返回并不中断渲染。*/
  //   NoOverwrite
}
