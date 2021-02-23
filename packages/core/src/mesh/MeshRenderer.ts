import { BoundingBox } from "@oasis-engine/math";
import { Logger } from "../base/Logger";
import { Camera } from "../Camera";
import { assignmentClone } from "../clone/CloneManager";
import { Entity } from "../Entity";
import { Mesh } from "../geometry/Mesh";
import { Renderer } from "../Renderer";
import { RenderElement } from "../RenderPipeline/RenderElement";

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
      lastMesh && lastMesh._primitive._addRefCount(-1);
      mesh && mesh._primitive._addRefCount(1);
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
      const subMeshes = mesh.subMeshes;
      const renderPipeline = camera._renderPipeline;
      for (let i = 0, n = subMeshes.length; i < n; i++) {
        const material = this._materials[i];
        if (material) {
          const element = RenderElement.getFromPool();
          element.setValue(this, mesh._primitive, subMeshes[i], material);
          renderPipeline.pushPrimitive(element);
        }
      }
    } else {
      Logger.error("mesh is null.");
    }
  }

  /**
   * Destroy the component.
   */
  destroy() {
    super.destroy();

    if (this._mesh) {
      this._mesh._primitive._addRefCount(1);
      this._mesh = null;
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
