import { Vector3 } from "@oasis-engine/math";
import { Camera } from "../Camera";
import { Renderer } from "../Renderer";

/**
 * LOD rendering group
 */
export class LODGroup extends Renderer {
  private _lods = [];

  /**
   * Add a LOD level.
   * @param distance - Distance between current entity and the camera.
   * @param renderer - Renderer, when LOD level enabled, use this renderer to render.
   */
  addLod(distance: number, renderer: Renderer) {
    // Disable component render function.
    renderer.enabled = false;

    this._lods.push({
      distance,
      rendererAbility: renderer
    });

    this._lods.sort((a, b) => b.distance - a.distance);
  }

  /**
   * @internal
   */
  _render(camera: Camera): void {
    if (this._lods.length <= 0) return;

    const dist = Vector3.distance(camera.entity.transform.worldPosition, this.entity.transform.worldPosition);

    const lods = this._lods;
    let activeLevel = 0;
    for (let i = lods.length - 1; i >= 0; i--) {
      const lod = lods[i];
      if (dist < lod.distance) {
        activeLevel = i;
        break;
      }
    } // end of for

    const lod = lods[activeLevel];
    lod.rendererAbility.render(camera);
  }
}
