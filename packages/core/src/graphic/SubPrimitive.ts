import { MeshTopology } from "./enums/MeshTopology";

/**
 * Sub-primitive, mainly contains drawing information.
 */
export class SubPrimitive {
  /** Start drawing offset. */
  start: number;
  /** Drawing count. */
  count: number;
  /** Drawing topology. */
  topology: MeshTopology;
  /**
   * Create a sub-primitive.
   * @param start - Start drawing offset
   * @param count - Drawing count
   * @param topology - Drawing topology
   */
  constructor(start: number = 0, count: number = 0, topology: MeshTopology = MeshTopology.Triangles) {
    this.start = start;
    this.count = count;
    this.topology = topology;
  }
}
