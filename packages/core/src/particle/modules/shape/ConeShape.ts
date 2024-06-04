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

  private _angle: number = 25.0;
  private _radius: number = 1.0;
  private _length: number = 5.0;
  private _emitType: ConeEmitType = ConeEmitType.Base;

  readonly shapeType = ParticleShapeType.Cone;

  /**
   * Angle of the cone to emit particles from.
   */
  get angle(): number {
    return this._angle;
  }

  set angle(value: number) {
    this._angle = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Radius of the shape to emit particles from.
   */
  get radius(): number {
    return this._radius;
  }

  set radius(value: number) {
    this._radius = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Length of the cone to emit particles from.
   */
  get length(): number {
    return this._length;
  }

  /**
   * Sets the length of the cone to emit particles from.
   */
  set length(value: number) {
    this._length = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * Cone emitter type.
   */
  get emitType(): ConeEmitType {
    return this._emitType;
  }

  /**
   * Sets the cone emitter type.
   */
  set emitType(value: ConeEmitType) {
    this._emitType = value;
    this._onValueChanged && this._onValueChanged();
  }

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
  override _getDirectionRange(min: Vector3, max: Vector3) {
    const radian = MathUtil.degreeToRadian(this.angle);
    const dirSinA = Math.sin(radian);

    min.set(-dirSinA, -dirSinA, -1);
    max.set(dirSinA, dirSinA, 0);

    if (this.emitType === ConeEmitType.Volume && this.randomDirectionAmount > 0) {
      min.set(-1, -1, -1);
      max.set(1, 1, 1);
    }
  }
  /**
   * @internal
   */
  override _getStartPositionRange(min: Vector3, max: Vector3): void {
    const radian = MathUtil.degreeToRadian(this.angle);
    const dirSinA = Math.sin(radian);
    const { radius, length } = this;

    switch (this.emitType) {
      case ConeEmitType.Base:
        min.set(-radius, -radius, -radius);
        max.set(radius, radius, 0);
        break;
      case ConeEmitType.Volume:
        min.set(-radius - dirSinA * length, -radius - dirSinA * length, -length);
        max.set(radius + dirSinA * length, radius + dirSinA * length, 0);
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
