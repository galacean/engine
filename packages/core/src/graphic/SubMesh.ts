import { IPoolElement } from "../utils/ObjectPool";
import { SubPrimitive } from "./SubPrimitive";

/**
 * Sub-mesh, mainly contains drawing information.
 */
export class SubMesh extends SubPrimitive implements IPoolElement {
  dispose?(): void {}
}
