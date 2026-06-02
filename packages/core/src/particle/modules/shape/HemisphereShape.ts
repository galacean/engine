import { Rand, Vector3 } from "@galacean/engine-math";
import { property } from "../../../clone/CloneManager";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a hemisphere.
 */
export class HemisphereShape extends BaseShape {
  readonly shapeType = ParticleShapeType.Hemisphere;

  @property
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
  _generateLocalPositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
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
  _getLocalDirectionRange(outMin: Vector3, outMax: Vector3): void {
    const randomDir = Math.sin(0.5 * this.randomDirectionAmount * Math.PI);
    outMin.set(-1, -1, -1);
    outMax.set(1, 1, randomDir);
  }

  /**
   * @internal
   */
  _getLocalPositionRange(outMin: Vector3, outMax: Vector3): void {
    const radius = this._radius;
    outMin.set(-radius, -radius, -radius);
    outMax.set(radius, radius, 0);
  }
}
