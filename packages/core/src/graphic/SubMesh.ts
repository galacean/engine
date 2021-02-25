import { PrimitiveTopology } from "./enums/PrimitiveTopology";

/**
 * Sub mesh.
 */
export class SubMesh {
  /** Start drawing offset */
  start: number;
  /** Drawing count */
  count: number;
  /** Drawing topology */
  topology: PrimitiveTopology;

  /**
   * Create sub mesh.
   * @param start - Start drawing offset
   * @param count - Drawing count
   * @param topology - Drawing topology
   */
  constructor(start: number = 0, count: number = 0, topology: PrimitiveTopology = PrimitiveTopology.Triangles) {
    this.start = start;
    this.count = count;
    this.topology = topology;
  }
}
