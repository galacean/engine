import { Matrix } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Mesh } from "../graphic";
import { Material } from "../material";
import { PrimitiveMesh } from "../mesh/PrimitiveMesh";
import { TextureCubeMap } from "../texture";
import { SkyBoxMaterial } from "./SkyBoxMaterial";

export class Sky {
  /**
   * Create a sky box.
   * @param engine - current engine
   * @param textureCubeMap - cube map texture of the sky
   * @returns 
   */
  static createSkybox(engine: Engine, textureCubeMap: TextureCubeMap): Sky {
    const sky = new Sky();
    const material = (sky.material = new SkyBoxMaterial(engine));
    sky.mesh = PrimitiveMesh.createCuboid(engine, 2, 2, 2);
    material.textureCubeMap = textureCubeMap;
    return sky;
  }
  /** Material of the sky. */
  material: Material;
  /** Mesh of the sky. */
  mesh: Mesh;

  /** @internal */
  _matrix: Matrix = new Matrix();
}
