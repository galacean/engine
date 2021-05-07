import { Matrix } from "@oasis-engine/math";
import { Mesh } from "../graphic";
import { Material } from "../material";

export class Sky {
  /** Material of the sky. */
  material: Material;
  /** Mesh of the sky. */
  mesh: Mesh;
  /** @internal */
  _matrix: Matrix = new Matrix();
}
