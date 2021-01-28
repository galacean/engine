import { BoundingBox } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { Material } from "../material/Material";
import { Renderer } from "../Renderer";
import { RenderElement } from "../RenderPipeline/RenderElement";
import { BufferGeometry } from "./BufferGeometry";

/**
 * Geometry renderer
 */
export class GeometryRenderer extends Renderer {
  _material: Material;

  /** Buffer geometry */
  private _geometry: BufferGeometry;

  /**
   * Set buffer geometry
   */
  set geometry(value: BufferGeometry) {
    if (this._geometry) {
      this._geometry._primitive._addRefCount(-1);
    }
    value._primitive._addRefCount(1);
    this._geometry = value;
  }

  get geometry(): BufferGeometry {
    return this._geometry;
  }

  /**
   * Material.
   */
  set material(value: Material) {
    if (this._material) {
      this._material._addRefCount(-1);
    }
    value._addRefCount(1);
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
  protected _updateBounds(worldBounds: BoundingBox): void {
    const geometry = this._geometry;
    if (geometry) {
      const localBounds = geometry.bounds;
      const worldMatrix = this._entity.transform.worldMatrix;
      BoundingBox.transform(localBounds, worldMatrix, worldBounds);
    } else {
      worldBounds.min.setValue(0, 0, 0);
      worldBounds.max.setValue(0, 0, 0);
    }
  }
}
