import { BoundingBox, Vector3 } from "@oasis-engine/math";
import { Engine, EngineObject } from "..";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";

/**
 * Mesh Asset Object
 */
export class Mesh extends EngineObject {
  name: string;
  primitives: Primitive[] = [];
  groups: SubPrimitive[] = [];
  weights: number[];
  readonly bounds: BoundingBox = new BoundingBox(new Vector3(), new Vector3());

  /**
   * Contructor of mesh
   * @param name - Name
   */
  constructor(engine: Engine, name?: string) {
    super(engine);
    this.name = name;
  }

  updatePrimitiveWeightsIndices(weightsIndices: number[]) {
    // this.primitives.forEach((primitive) => {
    //   primitive.updateWeightsIndices(weightsIndices);
    // });
  }

  destroy() {
    this.primitives = null;
  }
}
