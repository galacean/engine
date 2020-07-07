import { NodeAbility, Node, Camera } from "@alipay/o3-core";
import { RenderTarget } from "@alipay/o3-material";
import { MaskList } from "@alipay/o3-base";
import { ColorRenderPass } from "./ColorRenderPass";

/**
 * Framebuffer 对象选择组件
 */
class AFramebufferPicker extends NodeAbility {
  public camera: Camera;
  public colorRenderTarget: RenderTarget;
  public colorRenderPass: ColorRenderPass;

  private _needPick: boolean;
  private _pickPos: [number, number];

  /**
   * 构造函数
   * @param {Node} node 组件节点
   * @param {Object} props 组件参数，包含以下项
   * @param {Camera} props.camera 相机对象
   * @param {number} [props.width=1024] RenderTarget 的宽度
   * @param {number} [props.height=1024] RenderTarget 的高度
   * @param {MaskList} [props.mask=0] 掩膜，用来过滤不需要选取的物体
   * @param {Function} [props.onPick] 选取物体后的回调函数
   */
  constructor(
    node: Node,
    props: {
      camera: Camera;
      mask?: MaskList;
      width?: number;
      height?: number;
      onPick: Function;
    }
  ) {
    super(node, props);

    this.camera = props.camera;
    this.colorRenderTarget = new RenderTarget("ColorRenderTarget_FBP", {
      width: props.width || 1024,
      height: props.height || 1024,
      clearColor: [1, 1, 1, 1] // [0,0,0,1] & [1,1,1,1] are not used
    });
    this.colorRenderPass = new ColorRenderPass("ColorRenderTarget_FBP", -1, this.colorRenderTarget, props.mask || 0);
    this.camera.sceneRenderer.addRenderPass(this.colorRenderPass);
    if (props.onPick) {
      this.onPick = props.onPick;
    }
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
  update(deltaTime: number) {
    super.update(deltaTime);

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
    this.camera.sceneRenderer.removeRenderPass(this.colorRenderPass);
  }
}

export { AFramebufferPicker };
