import { MeshTopology } from "./enums/MeshTopology";

export class SubPrimitive {
  /** Start drawing offset. */
  start: number;
  /** Drawing count. */
  count: number;
  /** Drawing topology. */
  topology: MeshTopology;
}
