import { Camera } from "@alipay/o3-core";
import { Util } from "@alipay/o3-base";
import { cacheCanvas } from "./cacheCanvas";
import { Prop, ScreenshotSize, CanvasDataSizeAndOffset } from "./type";

export class Screenshot {
  camera: Camera;

  /**
   * 根据 prop 获取截图的宽高
   * @param {ACamera} camera - 相机
   * @param {number} width - 用户传入的宽
   * @param {number} height - 用户传入的高
   * @return {ScreenshotSize} - 最终计算出来的的截图宽高
   * */
  public static getScreenShotSize(camera: Camera, width?: number, height?: number): ScreenshotSize {
    const canvas = camera.scene.engine.canvas;
    const aspect = camera.aspectRatio;
    if (width && height) {
      return { width, height };
    } else if (!width && height) {
      return {
        width: height * aspect,
        height
      };
    } else if (width && !height) {
      return {
        width,
        height: width / aspect
      };
    } else {
      return {
        width: canvas.width,
        height: canvas.height
      };
    }
  }

  /**
   * 根据截图宽高计算 canvasData 宽高和偏移。自动调整比例缩放并居中
   * @param {ACamera} camera - 相机
   * @param {number} width - 截图的宽
   * @param {number} height - 截图的高
   * @return {CanvasDataSizeAndOffset} - 最终计算出来的 canvasData 宽高和偏移
   * */
  public static getCanvasDataSizeAndOffset(camera: Camera, width: number, height: number): CanvasDataSizeAndOffset {
    const aspect = camera.aspectRatio;
    let newWidth = width;
    let newHeight = width / aspect;
    if (newHeight > height) {
      newHeight = height;
      newWidth = newHeight * aspect;
    }
    return {
      width: newWidth,
      height: newHeight,
      offsetX: Math.max(0, width - newWidth) / 2,
      offsetY: Math.max(0, height - newHeight) / 2
    };
  }

  /**
   * 将截图数据绘制到 canvas 上面
   * @param {CanvasImageSource} source - 绘制源
   * @param {number} screenshotWidth - 截屏宽
   * @param {number} screenshotHeight - 截屏高
   * @param {number} canvasDataWidth - canvasData 宽
   * @param {number} canvasDataHeight - canvasData 高
   * @param {number} canvasDataOffsetX - canvasData x 偏移
   * @param {number} canvasDataOffsetY - canvasData y 偏移
   * */
  public static drawImage(
    source: CanvasImageSource,
    screenshotWidth: number,
    screenshotHeight: number,
    canvasDataWidth: number,
    canvasDataHeight: number,
    canvasDataOffsetX: number,
    canvasDataOffsetY: number
  ) {
    if (!source) return;
    cacheCanvas.width = screenshotWidth;
    cacheCanvas.height = screenshotHeight;
    let ctx = cacheCanvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(source, canvasDataOffsetX, canvasDataOffsetY, canvasDataWidth, canvasDataHeight);
    }
  }

  /**
   * 获取 base64
   * @param {boolean} isPng - mimeType 是否为 png 格式, 默认 png
   * */
  public static getBase64(isPng: boolean = true) {
    return cacheCanvas.toDataURL(isPng ? "image/png" : "image/jpeg");
  }

  /**
   * 下载截屏
   * @param {boolean} isPng - mimeType 是否为 png 格式, 默认 png
   * @param {string} name - 截屏的名字
   * */
  public static download(isPng: boolean = true, name?: string) {
    if (!name) {
      const date = new Date();
      const stringDate =
        (date.getFullYear() + "-" + (date.getMonth() + 1)).slice(2) +
        "-" +
        date.getDate() +
        "_" +
        date.getHours() +
        "-" +
        ("0" + date.getMinutes()).slice(-2);
      name = "screenshot_" + stringDate + (isPng ? ".png" : ".jpg");
    }

    cacheCanvas.toBlob(
      (blob) => {
        Util.downloadBlob(blob, name);
      },
      isPng ? "image/png" : "image/jpeg"
    );
  }

  /**
   * 根据 camera 和相应配置生成截图
   * @param {ACamera} camera - 用于截图的相机
   * @param {Prop} prop - 截图配置选项
   * */
  constructor(camera: Camera, prop?: Prop) {
    this.camera = camera;
    const { width, height, isPng = true, download = true, downloadName, onSuccess } = prop || {};
    const { width: screenshotWidth, height: screenshotHeight } = Screenshot.getScreenShotSize(camera, width, height);
    const {
      width: canvasDataWidth,
      height: canvasDataHeight,
      offsetX: canvasDataOffsetX,
      offsetY: canvasDataOffsetY
    } = Screenshot.getCanvasDataSizeAndOffset(camera, screenshotWidth, screenshotHeight);

    Screenshot.drawImage(
      //@ts-ignore
      camera.engine.canvas._htmlCanvas,
      screenshotWidth,
      screenshotHeight,
      canvasDataWidth,
      canvasDataHeight,
      canvasDataOffsetX,
      canvasDataOffsetY
    );

    if (typeof onSuccess === "function") {
      const base64 = Screenshot.getBase64(isPng);
      onSuccess(base64);
    }

    if (download) {
      Screenshot.download(isPng, downloadName);
    }
  }
}
