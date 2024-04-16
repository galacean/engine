import { Rand, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a hemisphere.
 */
export class HemisphereShape extends BaseShape {
  private _radius = 1.0;

  readonly shapeType = ParticleShapeType.Hemisphere;

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

    const z = position.z;
    z > 0.0 && (position.z = -z);

    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(position, direction, this.randomDirectionAmount, direction);
  }

  /**
   * @internal
   */
  override _getDirectionRange(out: { min: Vector3; max: Vector3 }) {
    out.min.set(-1, -1, -1);
    out.max.set(1, 1, this.randomDirectionAmount > 0 ? 1 : 0);
  }

  /**
   * @internal
   */
  override _getStartPositionRange(out: { min: Vector3; max: Vector3 }): void {
    out.min.set(-this.radius, -this.radius, -this.radius);
    out.max.set(this.radius, this.radius, this.randomDirectionAmount > 0 ? this.radius : 0);
  }
}
