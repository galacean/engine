import { Logger } from "@alipay/o3-base";
import { RenderableComponent, Camera } from "@alipay/o3-core";

/**
 * 负责渲染一个Mesh对象的组件
 */
export class PrimitiveRenderer extends RenderableComponent {
  private primitive: any;

  /**
   * 构造函数
   * @param {Entity} entity 对象所在节点
   */
  constructor(entity) {
    super(entity);

    this.renderable = true; // 标记为可渲染对象

    /**
     * 需要渲染的 Primitive 对象
     * @member {Primitive}
     */
    this.primitive = null;
  }

  /**
   * 执行渲染
   * @param {CameraComponent} camera
   */
  render(camera: Camera) {
    if (this.primitive && this.primitive.material) {
      camera._renderPipeline.pushPrimitive(this, this.primitive, this.primitive.material);
    } else {
      Logger.error("primitive or  material is null ");
    } // end of else
  }

  /**
   * 释放内部资源
   */
  destroy() {
    super.destroy();
    this.primitive = null;
  }
}
