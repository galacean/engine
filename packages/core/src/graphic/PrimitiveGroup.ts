import { PrimitiveTopology } from "./enums/PrimitiveTopology";

/**
 * 图元组。
 */
export class PrimitiveGroup {
  /** 偏移。*/
  offset: number = 0;
  /** 数量。*/
  count: number = 0;
  /** 图元拓扑。*/
  topology: PrimitiveTopology = PrimitiveTopology.Triangles;
}
