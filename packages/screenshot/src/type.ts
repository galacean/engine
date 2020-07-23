interface Prop {
  /** 截图的宽 */
  width?: number;
  /** 截图的高 */
  height?: number;
  /** 格式是否 png，默认 true */
  isPng?: boolean;
  /** 是否下载，默认 true */
  download?: boolean;
  /** 如果下载截屏，可以设置文件名字 */
  downloadName?: string;
  /** 回调函数，返回base64 */
  onSuccess?: (base64: string) => void;
}

interface ScreenshotSize {
  width: number;
  height: number;
}

interface CanvasDataSizeAndOffset extends ScreenshotSize {
  offsetX: number;
  offsetY: number;
}

export { Prop, ScreenshotSize, CanvasDataSizeAndOffset };
