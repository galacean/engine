/**
 * 渲染画布。
 */
export interface Canvas {
  /** 宽。*/
  readonly width: number;
  /** 高。*/
  readonly height: number;
  /** 设置分辨率。*/
  setResolution(width: number, height: number): void;
}
