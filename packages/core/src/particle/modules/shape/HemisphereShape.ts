import { Rand, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a hemisphere.
 */
export class HemisphereShape extends BaseShape {
  readonly shapeType = ParticleShapeType.Hemisphere;

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

  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    ShapeUtils._randomPointInsideUnitSphere(position, rand);
    position.scale(this.radius);

    const z = position.z;
    z > 0.0 && (position.z = -z);

    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(position, direction, this.randomDirectionAmount, direction);
  }

  _getDirectionRange(min: Vector3, max: Vector3) {
    min.set(-1, -1, -1);
    max.set(1, 1, this.randomDirectionAmount > 0 ? 1 : 0);
  }

  _getStartPositionRange(min: Vector3, max: Vector3): void {
    const radius = this._radius;
    min.set(-radius, -radius, -radius);
    max.set(radius, radius, this.randomDirectionAmount > 0 ? radius : 0);
  }
}
