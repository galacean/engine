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

  private _radius: number = 1.0;
  private _arc: number = 360.0;
  private _arcMode: ParticleShapeArcMode = ParticleShapeArcMode.Random;
  private _arcSpeed: number = 1.0;

  readonly shapeType = ParticleShapeType.Circle;

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
   * Angle of the circle arc to emit particles from.
   */
  get arc(): number {
    return this._arc;
  }

  set arc(value: number) {
    this._arc = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The mode to generate particles around the arc.
   */
  get arcMode(): ParticleShapeArcMode {
    return this._arcMode;
  }

  /**
   * Sets the mode to generate particles around the arc.
   */
  set arcMode(value: ParticleShapeArcMode) {
    this._arcMode = value;
    this._onValueChanged && this._onValueChanged();
  }

  /**
   * The speed of complete 360 degree rotation.
   */
  get arcSpeed(): number {
    return this._arcSpeed;
  }

  set arcSpeed(value: number) {
    this._arcSpeed = value;
    this._onValueChanged && this._onValueChanged();
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
  override _getDirectionRange(min: Vector3, max: Vector3) {
    if (this.randomDirectionAmount > 0) {
      min.set(-1, -1, -1);
      max.set(1, 1, 1);
    } else {
      const radian = MathUtil.degreeToRadian(this.arc);
      const dirSinA = Math.sin(radian);
      const dirCosA = Math.cos(radian);

      if (this.arc < 90) {
        min.set(0, 0, 0);
        max.set(1, dirSinA, 0);
      } else if (this.arc <= 180) {
        min.set(dirCosA, 0, 0);
        max.set(1, 1, 0);
      } else if (this.arc <= 270) {
        min.set(-1, dirSinA, 0);
        max.set(1, 1, 0);
      } else if (this.arc <= 360) {
        min.set(-1, -1, 0);
        max.set(1, 1, 0);
      }
    }
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
