/**
 * 缓冲的用途。
 */
export enum BufferUsage {
  /** 缓冲区的内容修改一次，使用多次。*/
  Static,
  /** 缓冲区的内容经常被修改，使用多次。*/
  Dynamic,
  /** 缓冲区的内容修改一次，使用几次。*/
  Stream
}
