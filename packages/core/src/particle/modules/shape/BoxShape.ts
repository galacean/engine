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

  /** The size of the box. */
  @deepClone
  size = new Vector3(1, 1, 1);

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Box;
  }

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

  /**
   * @internal
   */
  override _getDirectionRange(out: { min: Vector3; max: Vector3 }) {
    if (this.randomDirectionAmount > 0) {
      out.min.set(-1, -1, -1);
      out.max.set(1, 1, 1);
    } else {
      out.min.set(0, 0, -1);
      out.max.set(0, 0, 0);
    }
  }

  /**
   * @internal
   */
  override _getStartPositionRange(out: { min: Vector3; max: Vector3 }): void {
    out.min.set(-this.size.x / 2, -this.size.y / 2, -this.size.z / 2);
    out.max.set(this.size.x / 2, this.size.y / 2, this.size.z / 2);
  }
}
