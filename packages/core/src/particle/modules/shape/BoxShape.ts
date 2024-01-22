import { Rand, Vector3 } from "@galacean/engine-math";
import { deepClone } from "../../../clone/CloneManager";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a box.
 */
export class BoxShape extends BaseShape {
  private static _tempVector30 = new Vector3();

  readonly shapeType = ParticleShapeType.Box;

  /** The size of the box. */
  @deepClone
  size = new Vector3(1, 1, 1);

  /**
   * @internal
   */
  override _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    ShapeUtils._randomPointInsideHalfUnitBox(position, rand);
    position.multiply(this.size);

    const defaultDirection = BoxShape._tempVector30;
    defaultDirection.set(0.0, 0.0, -1.0);
    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(defaultDirection, direction, this.randomDirectionAmount, direction);
  }
}
