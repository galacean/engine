import { MathUtil, Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Cone shape.
 */
export class ConeShape extends BaseShape {
  private static _tempVector20 = new Vector2();
  private static _tempVector21 = new Vector2();
  private static _tempVector30 = new Vector3();
  private static _tempVector31 = new Vector3();

  readonly shapeType = ParticleShapeType.Cone;

  /** Angle of the cone to emit particles from. */
  angle = 25.0;
  /** Radius of the shape to emit particles from. */
  radius = 1.0;
  /** Length of the cone to emit particles from. */
  length = 5.0;
  /** Cone emitter type. */
  emitType = ConeEmitType.Base;

  /**
   * @internal
   */
  override _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    const unitPosition = ConeShape._tempVector20;
    const radian = MathUtil.degreeToRadian(this.angle);
    const dirSinA = Math.sin(radian);
    const dirCosA = Math.cos(radian);

    switch (this.emitType) {
      case ConeEmitType.Base:
        ShapeUtils.randomPointInsideUnitCircle(unitPosition, rand);
        position.set(unitPosition.x * this.radius, unitPosition.y * this.radius, 0);

        const unitDirection = ConeShape._tempVector21;
        ShapeUtils.randomPointInsideUnitCircle(unitDirection, rand);
        Vector2.lerp(unitPosition, unitDirection, this.randomDirectionAmount, unitDirection);
        direction.set(unitDirection.x * dirSinA, unitDirection.y * dirSinA, -dirCosA);
        break;
      case ConeEmitType.Volume:
        ShapeUtils.randomPointInsideUnitCircle(unitPosition, rand);
        position.set(unitPosition.x * this.radius, unitPosition.y * this.radius, 0);

        direction.set(unitPosition.x * dirSinA, unitPosition.y * dirSinA, -dirCosA);
        direction.normalize();

        const distance = ConeShape._tempVector30;
        Vector3.scale(direction, this.length * rand.random(), distance);
        position.add(distance);

        const randomDirection = ConeShape._tempVector31;
        ShapeUtils._randomPointUnitSphere(randomDirection, rand);
        Vector3.lerp(direction, randomDirection, this.randomDirectionAmount, direction);
        break;
    }
  }

  /**
   * @internal
   */
  override _getDirectionRange(out: { min: Vector3; max: Vector3 }) {
    const radian = MathUtil.degreeToRadian(this.angle);
    const dirSinA = Math.sin(radian);

    out.min.set(-dirSinA, -dirSinA, -1);
    out.max.set(dirSinA, dirSinA, 0);

    if (this.emitType === ConeEmitType.Volume && this.randomDirectionAmount > 0) {
      out.min.set(-1, -1, -1);
      out.max.set(1, 1, 1);
    }
  }
  /**
   * @internal
   */
  override _getStartPositionRange(out: { min: Vector3; max: Vector3 }): void {
    const radian = MathUtil.degreeToRadian(this.angle);
    const dirSinA = Math.sin(radian);
    const { radius, length } = this;

    switch (this.emitType) {
      case ConeEmitType.Base:
        out.min.set(-radius, -radius, -radius);
        out.max.set(radius, radius, 0);
        break;
      case ConeEmitType.Volume:
        out.min.set(-radius - dirSinA * length, -radius - dirSinA * length, -length);
        out.max.set(radius + dirSinA * length, radius + dirSinA * length, 0);
        break;
    }
  }
}

/**
 * Cone emitter type.
 */
export enum ConeEmitType {
  /** Emit particles from the base of the cone. */
  Base,
  /** Emit particles from the volume of the cone. */
  Volume
}
