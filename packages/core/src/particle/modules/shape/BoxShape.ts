import { Rand, Vector3 } from "@galacean/engine-math";
import { deepClone } from "../../../clone/CloneManager";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Box emitter shape
 */
export class BoxShape extends BaseShape {
  /** Thickness of the box to emit particles from. */
  @deepClone
  boxThickness: Vector3 = new Vector3(1, 1, 1);

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Box;
  }

  /**
   * @internal
   */
  override _generatePositionAndDirection(rand: Rand, position: Vector3, direction: Vector3): void {
    ShapeUtils._randomPointInsideHalfUnitBox(position, rand);

    position.multiply(this.boxThickness);
    if (this.randomDirectionAmount) {
      ShapeUtils._randomPointUnitSphere(direction, rand);
    } else {
      direction.x = 0.0;
      direction.y = 0.0;
      direction.z = 1.0;
    }
    // reverse to default direction
    direction.z *= -1.0;
  }
}
