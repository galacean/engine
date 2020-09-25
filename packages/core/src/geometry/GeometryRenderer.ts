import { Event } from "../base/Event";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { Material } from "../material/Material";
import { RenderableComponent } from "../RenderableComponent";
import { BufferGeometry } from "./BufferGeometry";
import { Entity } from "../Entity";
import { Vector3 } from "@alipay/o3-math";

/**
 * 几何体渲染类
 */
export class GeometryRenderer extends RenderableComponent {
  protected _geometry: BufferGeometry;

  protected _material: Material;

  /**
   * @constructor
   * @param {Entity} entity
   * @param props
   */
  constructor(entity: Entity, props: any = {}) {
    super(entity, props);
    this._geometry = props.geometry;
    this._material = props.material;
  }

  /**
   * 当前绑定的 geometry 对象
   * @returns {BufferGeometry} 几何体对象
   */
  get geometry(): BufferGeometry {
    return this._geometry;
  }

  /**
   * 指定需要渲染的几何体对象；多个 GeometryRenderer 对象可以引用同一个几何体对象
   * @param {BufferGeometry} geometry 几何体对象
   */
  set geometry(geometry: BufferGeometry) {
    this._geometry = geometry;

    this.trigger(new Event("geometryChange"));
  }

  /**
   * 设置一个材质（替代默认材质）
   * @param {Material} mtl 材质对象
   */
  setMaterial(mtl: Material) {
    this._material = mtl;
  }

  set material(mtl: Material) {
    this._material = mtl;
  }

  get material(): Material {
    return this._material;
  }

  /**
   * 获取材质对象
   * @return {Material}
   */
  getMaterial(): Material {
    return this._material;
  }

  /**
   * 执行渲染
   * @param {CameraComponent} camera
   * @private
   */
  render(camera: Camera) {
    const geometry = this._geometry;
    if (!geometry) {
      return;
    }
    geometry._render();
    const primitive = geometry._primitive;
    if (primitive && this._material) {
      const group = geometry.groups[0]; //CM: need to support multi group
      primitive.drawOffset = group.offset;
      primitive.drawCount = group.count;
      primitive._topology = group.topology;

      camera._renderPipeline.pushPrimitive(this, primitive, this._material);
    } else {
      Logger.error("primitive or  material is null");
    }
  }

  /**
   * 释放资源
   * @private
   */
  destroy() {
    super.destroy();

    //-- release mesh
    this._geometry = null;

    //-- materials
    this._material = null;
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
