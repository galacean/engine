import { Vector3 } from "@alipay/o3-math";
import { Engine, EngineObject } from "..";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { BoundingBox } from "../RenderableComponent";

/**
 * Mesh Asset Object
 */
export class Mesh extends EngineObject {
  public primitives: Primitive[] = [];
  public groups: SubPrimitive[] = [];
  public weights: number[];
  public readonly bounds: BoundingBox = { min: new Vector3(), max: new Vector3() };

  /**
   * 构造函数
   * @param {string} name 名称
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
