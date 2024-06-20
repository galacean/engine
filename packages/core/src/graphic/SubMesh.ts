import { IPoolElement } from "../utils/ObjectPool";
import { MeshTopology } from "./enums/MeshTopology";

/**
 * Sub-mesh, mainly contains drawing information.
 */
export class SubMesh implements IPoolElement {
  /** Start drawing offset. */
  start: number;
  /** Drawing count. */
  count: number;
  /** Drawing topology. */
  topology: MeshTopology;

  /**
   * Create a sub-mesh.
   * @param start - Start drawing offset
   * @param count - Drawing count
   * @param topology - Drawing topology
   */
  constructor(start: number = 0, count: number = 0, topology: MeshTopology = MeshTopology.Triangles) {
    this.start = start;
    this.count = count;
    this.topology = topology;
  }

  dispose?(): void {}
}
