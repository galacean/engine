"use strict";

import { BasicSceneRenderer } from "@alipay/o3-renderer-basic";
import { Frustum } from "./Frustum";
import { OBB } from "@alipay/o3-bounding-info";
import { Primitive } from "@alipay/o3-primitive";

export class SceneRenderer extends BasicSceneRenderer {
  private _frustum: Frustum;

  constructor(camera) {
    super(camera);

    this._frustum = new Frustum();
  }

  /** 获取当前相机的视锥体 */
  get frustum() {
    return this._frustum;
  }

  /**
   * 更新Frustum，执行场景渲染流程
   */
  render() {
    this._frustum.update(this._camera);
    super.render();
  }

  /**
   * 通过视锥剪裁，决定是否将一个 Primitive 对象添加到渲染队列
   * @param nodeAbility
   * @param {Primitive} primitive
   * @param {Material} mtl
   */
  pushPrimitive(nodeAbility, primitive: Primitive, mtl) {
    const { node } = nodeAbility;
    let isInFrustum = true;

    //-- 进行视锥剪裁
    if (!primitive.boundingBox) {
      const { min, max } = primitive.getMinMax();
      primitive.boundingBox = new OBB(min, max, node.getModelMatrix());
    }

    // TODO: use model matrix dirty
    primitive.boundingBox.updateByModelMatrix(node.getModelMatrix());

    isInFrustum = primitive.boundingBox.isInFrustum(this.frustum.planes);
    primitive.isInFrustum = isInFrustum;

    //-- 添加到渲染队列
    if (isInFrustum) {
      super.pushPrimitive(nodeAbility, primitive, mtl);
    }
  }
}
