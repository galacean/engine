import {NodeAbility} from '@alipay/o3-core';
import {Logger} from '@alipay/o3-base';

/**
 * 负责渲染一个Mesh对象的组件
 * @extends NodeAbility
 */
export class APrimitiveRenderer extends NodeAbility {
  private primitive: any;

  /**
   * 构造函数
   * @param {Node} node 对象所在节点
   */
  constructor(node) {

    super(node);

    this.renderable = true;  // 标记为可渲染对象

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
  render(camera) {

    if (this.primitive && this.primitive.material) {

      camera.sceneRenderer.pushPrimitive(
        this,
        this.primitive,
        this.primitive.material
      );

    }
    else {

      Logger.error('primitive or  material is null ');

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
