import { Camera, Entity, MaskList, Script } from "oasis-engine";
import { RenderColorTexture, RenderTarget } from "oasis-engine";
import { ColorRenderPass } from "./ColorRenderPass";

/**
 * Framebuffer 对象选择组件
 */
class FramebufferPicker extends Script {
  public colorRenderTarget: RenderTarget;
  public colorRenderPass: ColorRenderPass;

  private _camera: Camera;
  private _needPick: boolean;
  private _pickPos: [number, number];

  /**
   * 相机。
   */
  get camera(): Camera {
    return this._camera;
  }

  set camera(value: Camera) {
    if (this._camera !== value) {
      this._camera = value;
      this.camera._renderPipeline.addRenderPass(this.colorRenderPass);
    }
  }

  /**
   * 构造函数
   * @param {Entity} entity 组件节点
   */
  constructor(entity: Entity) {
    super(entity);
    const width = 1024;
    const height = 1024;
    this.colorRenderTarget = new RenderTarget(
      width,
      height,
      new RenderColorTexture(width, height, undefined, undefined, undefined, this.engine),
      undefined,
      undefined,
      this.engine
    );
    this.colorRenderPass = new ColorRenderPass("ColorRenderTarget_FBP", -1, this.colorRenderTarget, 0, this.engine);
  }

  /**
   * 设置选取后的回调函数
   * @param {Function} fun 回掉函数，若有对象选中，参数 1 为 { component, primitive }， 否则为 undefined
   */
  set onPick(fun: Function) {
    if (typeof fun === "function") {
      (this.colorRenderPass as any).onPick = fun;
    }
  }

  /**
   * 拾取屏幕坐标位置的对象，如果有，只能获取最近的对象
   * @param {Number} offsetX 画布的相对X坐标
   * @param {Number} offsetY 画布的相对Y坐标
   */
  pick(offsetX: number, offsetY: number) {
    if (this.enabled) {
      this._needPick = true;
      this._pickPos = [offsetX, offsetY];
    }
  }

  /**
   * @private
   */
  onUpdate(deltaTime: number) {
    super.onUpdate(deltaTime);

    if (this.enabled && this._needPick) {
      this.colorRenderPass.pick(this._pickPos[0], this._pickPos[1]);
      this._needPick = false;
    }
  }

  /**
   * @private
   */
  destroy() {
    super.destroy();
    this.camera._renderPipeline.removeRenderPass(this.colorRenderPass);
  }
}

export { FramebufferPicker };
