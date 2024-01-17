import { MathUtil, Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeArcMode } from "./enums/ParticleShapeArcMode";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a circle.
 */
export class CircleShape extends BaseShape {
  private static _tempPositionPoint: Vector2 = new Vector2();

  /** Radius of the shape to emit particles from. */
  radius = 1.0;
  /** Angle of the circle arc to emit particles from. */
  arc = 360.0;
  /** The mode to generate particles around the arc. */
  arcMode = ParticleShapeArcMode.Random;
  /** The speed of complete 360 degree rotation. */
  arcSpeed = 1.0;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Circle;
  }

  /**
   * @internal
   */
  override _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    const positionPoint = CircleShape._tempPositionPoint;

    switch (this.arcMode) {
      case ParticleShapeArcMode.Loop:
        const normalizedEmitTime = (emitTime * this.arcSpeed * (360 / this.arc)) % 1;
        const radian = MathUtil.degreeToRadian(this.arc * normalizedEmitTime);
        positionPoint.set(Math.cos(radian), Math.sin(radian));
        positionPoint.scale(rand.random());
        break;
      case ParticleShapeArcMode.Random:
        ShapeUtils.randomPointInsideUnitArcCircle(MathUtil.degreeToRadian(this.arc), positionPoint, rand);
        break;
    }

    position.set(positionPoint.x, positionPoint.y, 0);
    position.scale(this.radius);

    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(position, direction, this.randomDirectionAmount, direction);
  }

  /**
   * @internal
   */
  override _getDirectionRange(out: { min: Vector3; max: Vector3 }) {
    if (this.randomDirectionAmount > 0) {
      out.min.set(-1, -1, -1);
      out.max.set(1, 1, 1);
    } else {
      const radian = MathUtil.degreeToRadian(this.arc);
      const dirSinA = Math.sin(radian);
      const dirCosA = Math.cos(radian);

      if (this.arc < 90) {
        out.min.set(0, 0, 0);
        out.max.set(1, dirSinA, 0);
      } else if (this.arc <= 180) {
        out.min.set(dirCosA, 0, 0);
        out.max.set(1, 1, 0);
      } else if (this.arc <= 270) {
        out.min.set(-1, dirSinA, 0);
        out.max.set(1, 1, 0);
      } else if (this.arc <= 360) {
        out.min.set(-1, -1, 0);
        out.max.set(1, 1, 0);
      }
    }
  }

  /**
   * @internal
   */
  override _getStartPositionRange(out: { min: Vector3; max: Vector3 }): void {
    out.min.set(-this.radius, -this.radius, -this.radius);
    out.max.set(this.radius, this.radius, this.radius);
  }
}
