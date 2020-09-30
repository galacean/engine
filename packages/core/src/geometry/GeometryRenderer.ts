import { Vector3 } from "@alipay/o3-math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { Material } from "../material/Material";
import { RenderableComponent } from "../RenderableComponent";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { BufferGeometry } from "./BufferGeometry";

/**
 * chenmo.gl
 * 关于所有渲染组件材质的改进方案
 * 1）目前 Primitive 已具备数多 Group 能力，材质也需要对应支持
 * 2）材质的管理实现应放到 RenderableComponent 中实现，包含 sharedMaterial 和 instanceMaterial 机制，目前 MeshRender 等的实现均有问题
 */

/**
 * 几何体渲染器。
 */
export class GeometryRenderer extends RenderableComponent {
  _material: Material;

  /** 缓冲几何体。*/
  geometry: BufferGeometry;

  /**
   * 材质。
   */
  set material(value: Material) {
    this._material = value;
  }

  get material(): Material {
    return this._material;
  }

  render(camera: Camera) {
    const geometry = this.geometry;
    if (geometry) {
      const subGeometries = geometry.subGeometries;
      const renderPipeline = camera._renderPipeline;
      const material = this._material;
      for (let i = 0, n = subGeometries.length; i < n; i++) {
        if (material) {
          const element = RenderElement.getFromPool();
          element.setValue(this, geometry._primitive, subGeometries[i], material); // CM: need to support multi material
          renderPipeline.pushPrimitive(element);
        }
      }
    } else {
      Logger.error("geometry is null.");
    }
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: any): void {
    const localBounds: any = this.geometry.bounds;
    if (localBounds) {
      const worldMatrix: any = this._entity.transform.worldMatrix;
      Vector3.transformCoordinate(localBounds.min, worldMatrix, worldBounds.min); //TODO:简单模式，有漏洞，待AABB重构
      Vector3.transformCoordinate(localBounds.max, worldMatrix, worldBounds.max);
    } else {
      worldBounds.min.setValue(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
      worldBounds.max.setValue(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    }
  }
}
