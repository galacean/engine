import { BoundingBox } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { assignmentClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { Mesh } from "../geometry/Mesh";
import { Renderer } from "../Renderer";
import { RenderElement } from "../RenderPipeline/RenderElement";

function addPrimitivesRefCount(mesh: Mesh, refCount: number): void {
  mesh._primitive._addRefCount(refCount);
}

/**
 * MeshRenderer Component.
 */
export class MeshRenderer extends Renderer {
  @assignmentClone
  private _mesh: Mesh;

  /**
   * @internal
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /**
   * Mesh assigned to the renderer.
   */
  get mesh() {
    return this._mesh;
  }

  set mesh(mesh: Mesh) {
    const lastMesh = this._mesh;
    if (lastMesh !== mesh) {
      lastMesh && addPrimitivesRefCount(lastMesh, -1);
      addPrimitivesRefCount(mesh, 1);
      this._mesh = mesh;
    }
  }

  /**
   * Execute render
   * @param camera
   */
  render(camera: Camera) {
    const mesh = this._mesh;
    if (mesh) {
      const subGeometries = mesh.subMeshes;
      const renderPipeline = camera._renderPipeline;
      for (let i = 0, n = subGeometries.length; i < n; i++) {
        const material = this._materials[i];
        if (material) {
          const element = RenderElement.getFromPool();
          element.setValue(this, mesh._primitive, subGeometries[i], material); // CM: need to support multi material
          renderPipeline.pushPrimitive(element);
        }
      }
    } else {
      Logger.error("geometry is null.");
    }
  }

  /**
   * Destroy the component.
   */
  destroy() {
    super.destroy();

    this._mesh = null;

    if (this._mesh) {
      addPrimitivesRefCount(this._mesh, -1);
    }
  }

  /**
   * @override
   */
  protected _updateBounds(worldBounds: BoundingBox): void {
    const mesh = this._mesh;
    if (mesh) {
      const localBounds = mesh.bounds;
      const worldMatrix = this._entity.transform.worldMatrix;
      BoundingBox.transform(localBounds, worldMatrix, worldBounds);
    } else {
      worldBounds.min.setValue(0, 0, 0);
      worldBounds.max.setValue(0, 0, 0);
    }
  }
}
