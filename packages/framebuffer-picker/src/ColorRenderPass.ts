import { RenderPass } from "@alipay/o3-renderer-basic";
import { ColorMaterial } from "./ColorMaterial";
import { MaskList } from "@alipay/o3-base";
import { ACamera } from "@alipay/o3-core";
import { RenderTarget } from "@alipay/o3-material";

/**
 * @private
 * 单色渲染 Pass
 */
class ColorRenderPass extends RenderPass {
  private _needPick: boolean;
  private onPick: Function;
  private _pickPos;

  constructor(name: string, priority: number, renderTarget: RenderTarget, mask: MaskList) {
    super(name, priority, renderTarget, new ColorMaterial(), mask);

    this._needPick = false;
    this.onPick = (o: any) => console.log(o);
  }

  /**
   * @private
   * 判断是否需要渲染 pass，重制状态
   */
  preRender(camera, opaquaQueue, transparentQueue) {
    if (this._needPick) {
      this.enabled = true;
      this.replaceMaterial.reset();
    } else this.enabled = false;
  }

  /**
   * @private
   * 判断是否需要拾取
   */
  postRender(camera: ACamera, opaquaQueue, transparentQueue) {
    if (this._needPick) {
      const color = this.readColorFromRenderTarget(camera);
      const object = this.replaceMaterial.getObjectByColor(color);
      this._needPick = false;

      if (this.onPick) this.onPick(object);
    }
  }

  /**
   * @private
   * 拾取
   */
  pick(x: number, y: number) {
    this._pickPos = [x, y];
    this._needPick = true;
  }

  /**
   * @private
   * 从 framebuffer 获取像素颜色值
   */
  readColorFromRenderTarget(camera) {
    const gl = camera.renderHardware.gl;
    const screenPoint = this._pickPos;
    const canvas = camera.renderHardware.canvas;
    const clientWidth = canvas.clientWidth;
    const clientHeight = canvas.clientHeight;
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const px = (screenPoint[0] / clientWidth) * canvasWidth;
    const py = (screenPoint[1] / clientHeight) * canvasHeight;

    const viewport = camera.viewport;
    const viewWidth = viewport[2] - viewport[0];
    const viewHeight = viewport[3] - viewport[1];

    const nx = (px - viewport[0]) / viewWidth;
    const ny = (py - viewport[1]) / viewHeight;

    const left = Math.floor(nx * (this.renderTarget.width - 1));
    const bottom = Math.floor((1 - ny) * (this.renderTarget.height - 1));
    const pixel = new Uint8Array(4);

    gl.readPixels(left, bottom, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    return pixel;
  }
}

export { ColorRenderPass };
