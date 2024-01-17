import { Rand, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a sphere.
 */
export class SphereShape extends BaseShape {
  /** Radius of the shape to emit particles from. */
  radius = 1.0;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Sphere;
  }

  /**
   * @internal
   */
  override _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    ShapeUtils._randomPointInsideUnitSphere(position, rand);
    position.scale(this.radius);

    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(position, direction, this.randomDirectionAmount, direction);
  }

  /**
   * @internal
   */
  override _getDirectionRange(out: { min: Vector3; max: Vector3 }) {
    out.min.set(-1, -1, -1);
    out.max.set(1, 1, 1);
  }
  /**
   * @internal
   */
  override _getStartPositionRange(out: { min: Vector3; max: Vector3 }): void {
    out.min.set(-this.radius, -this.radius, -this.radius);
    out.max.set(this.radius, this.radius, this.radius);
  }
}
