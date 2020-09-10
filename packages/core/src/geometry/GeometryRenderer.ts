import { Event } from "../base/Event";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { Material } from "../material/Material";
import { RenderableComponent } from "../RenderableComponent";
import { BufferGeometry } from "./BufferGeometry";
import { Entity } from "../Entity";

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
    if (geometry && geometry.primitive && geometry.primitive.material) {
      this._material = geometry.primitive.material;
    }

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

    if (geometry.primitive && this._material) {
      camera._renderPipeline.pushPrimitive(this, geometry.primitive, this._material);
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
}
