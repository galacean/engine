"use strict";
import { Frustum } from "./Frustum";
import { Primitive } from "../graphic/Primitive";
import { BasicRenderPipeline } from "../RenderPipeline/BasicRenderPipeline";
import { OBB } from "../bounding-info/OBB";
import { RenderElement } from "../RenderPipeline/RenderElement";

export class CullRenderPipeline extends BasicRenderPipeline {
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
   * @param component
   * @param {Primitive} primitive
   * @param {Material} mtl
   */
  pushPrimitive(element: RenderElement) {
    const { component, primitive } = element;
    const { entity } = component;
    let isInFrustum = true;

    //-- 进行视锥剪裁
    if (!primitive.boundingBox) {
      // CM:需要重构
      // 1）primitive不应该包含包围盒,世界包围盒应该存在RenderableComponent身上
      // 2）视锥裁剪应该设置放到默认渲染管线，可以加开关
      // const { min, max } = primitive.getMinMax();
      // primitive.boundingBox = new OBB(min, max, node.getModelMatrix());
    }

    // TODO: use model matrix dirty
    primitive.boundingBox.updateByModelMatrix(entity.transform.worldMatrix);

    isInFrustum = primitive.boundingBox.isInFrustum(this.frustum.planes);
    primitive.isInFrustum = isInFrustum;

    //-- 添加到渲染队列
    if (isInFrustum) {
      super.pushPrimitive(element);
    }
  }
}
