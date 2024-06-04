import { Rand, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a sphere.
 */
export class SphereShape extends BaseShape {
  private _radius = 1.0;

  readonly shapeType = ParticleShapeType.Sphere;

  /** Radius of the shape to emit particles from. */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    this._radius = value;
    this._onValueChanged && this._onValueChanged();
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
  override _getDirectionRange(min: Vector3, max: Vector3) {
    min.set(-1, -1, -1);
    max.set(1, 1, 1);
  }
  /**
   * @internal
   */
  override _getStartPositionRange(min: Vector3, max: Vector3): void {
    const { radius } = this;
    min.set(-radius, -radius, -radius);
    max.set(radius, radius, radius);
  }
}
