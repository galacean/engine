import { Rand, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a sphere.
 */
export class SphereShape extends BaseShape {
  readonly shapeType = ParticleShapeType.Sphere;

  private _radius = 1.0;

  /**
   * Radius of the shape to emit particles from.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    if (value !== this._radius) {
      this._radius = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    ShapeUtils._randomPointInsideUnitSphere(position, rand);
    position.scale(this.radius);

    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(position, direction, this.randomDirectionAmount, direction);
  }

  /**
   * @internal
   */
  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    outMin.set(-1, -1, -1);
    outMax.set(1, 1, 1);
  }

  /**
   * @internal
   */
  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    const radius = this._radius;
    outMin.set(-radius, -radius, -radius);
    outMax.set(radius, radius, radius);
  }
}
