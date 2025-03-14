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

  private _angle = 25.0;
  private _radius = 1.0;
  private _length = 5.0;
  private _emitType = ConeEmitType.Base;

  /**
   * Angle of the cone to emit particles from.
   */
  get angle(): number {
    return this._angle;
  }

  set angle(value: number) {
    if (value !== this._angle) {
      this._angle = value;
      this._updateManager.dispatch();
    }
  }

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
   * Length of the cone to emit particles from.
   */
  get length(): number {
    return this._length;
  }

  set length(value: number) {
    if (value !== this._length) {
      this._length = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * Cone emitter type.
   */
  get emitType(): ConeEmitType {
    return this._emitType;
  }

  set emitType(value: ConeEmitType) {
    if (value !== this._emitType) {
      this._emitType = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
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
  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    let radian = 0;
    switch (this.emitType) {
      case ConeEmitType.Base:
        radian = MathUtil.degreeToRadian(this._angle);
        break;
      case ConeEmitType.Volume:
        const randomRadian = MathUtil.degreeToRadian((180 - this._angle) * this.randomDirectionAmount + this._angle);
        radian = Math.sin(randomRadian);
        break;
    }

    const dirSin = Math.sin(radian);
    outMin.set(-dirSin, -dirSin, -1);
    outMax.set(dirSin, dirSin, 0);
  }

  /**
   * @internal
   */
  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    const { radius } = this;

    switch (this.emitType) {
      case ConeEmitType.Base:
        outMin.set(-radius, -radius, 0);
        outMax.set(radius, radius, 0);
        break;
      case ConeEmitType.Volume:
        const { length } = this;
        const dirSin = Math.sin(MathUtil.degreeToRadian(this._angle));
        outMin.set(-radius - dirSin * length, -radius - dirSin * length, -length);
        outMax.set(radius + dirSin * length, radius + dirSin * length, 0);
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
