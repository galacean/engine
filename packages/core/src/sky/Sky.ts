import { Matrix } from "@oasis-engine/math";
import { Engine } from "../Engine";
import { Mesh } from "../graphic";
import { Material } from "../material";
import { PrimitiveMesh } from "../mesh/PrimitiveMesh";
import { TextureCubeMap } from "../texture";
import { SkyBoxMaterial } from "./SkyBoxMaterial";

export class Sky {
  /** Material of the sky. */
  material: Material;
  /** Mesh of the sky. */
  mesh: Mesh;

  /** @internal */
  _matrix: Matrix = new Matrix();
}
