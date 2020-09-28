import { Vector3 } from "@alipay/o3-math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { Entity } from "../Entity";
import { Material } from "../material/Material";
import { RenderableComponent } from "../RenderableComponent";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { BufferGeometry } from "./BufferGeometry";

/**
 * 几何体渲染器。
 */
export class GeometryRenderer extends RenderableComponent {
  _material: Material;

  private _geometry: BufferGeometry;

  /**
   * 缓冲几何体。
   */
  get geometry(): BufferGeometry {
    return this._geometry;
  }

  set geometry(geometry: BufferGeometry) {
    this._geometry = geometry;
  }

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
    const geometry = this._geometry;
    if (geometry) {
      const groups = geometry.groups;
      const renderPipeline = camera._renderPipeline;
      const material = this._material;
      for (let i = 0, n = groups.length; i < n; i++) {
        if (material) {
          const element = RenderElement.getFromPool();
          element.setValue(this, geometry._primitive, groups[i], material); // CM: need to support multi material
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
    const localBounds: any = this._geometry.bounds;
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
