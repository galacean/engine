import { MathUtil, Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeArcMode } from "./enums/ParticleShapeArcMode";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a circle.
 */
export class CircleShape extends BaseShape {
  private static _tempPositionPoint = new Vector2();

  readonly shapeType = ParticleShapeType.Circle;

  private _radius = 1.0;
  private _arc = 360.0;
  private _arcMode = ParticleShapeArcMode.Random;
  private _arcSpeed = 1.0;

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
   * Angle of the circle arc to emit particles from.
   */
  get arc(): number {
    return this._arc;
  }

  set arc(value: number) {
    if (value !== this._arc) {
      this._arc = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * The mode to generate particles around the arc.
   */
  get arcMode(): ParticleShapeArcMode {
    return this._arcMode;
  }

  set arcMode(value: ParticleShapeArcMode) {
    if (value !== this._arcMode) {
      this._arcMode = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * The speed of complete 360 degree rotation.
   */
  get arcSpeed(): number {
    return this._arcSpeed;
  }

  set arcSpeed(value: number) {
    if (value !== this._arcSpeed) {
      this._arcSpeed = value;
      this._updateManager.dispatch();
    }
  }

  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
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

  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    const randomDir = this.randomDirectionAmount > 0.5 ? 1 : Math.sin(this.randomDirectionAmount * Math.PI);
    this._getUnitArcRange(this._arc + this.randomDirectionAmount * 180, outMin, outMax, randomDir);
  }

  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    this._getUnitArcRange(this._arc, outMin, outMax, 0);
    outMin.scale(this._radius);
    outMax.scale(this._radius);
  }

  private _getUnitArcRange(arc: number, outMin: Vector3, outMax: Vector3, randomDir: number): void {
    const radian = MathUtil.degreeToRadian(arc);
    const dirSin = Math.sin(radian);
    const dirCos = Math.cos(radian);

    if (arc < 90) {
      outMin.set(0, -randomDir, -randomDir);
      outMax.set(1, dirSin, randomDir);
    } else if (arc < 180) {
      outMin.set(dirCos, -randomDir, -randomDir);
      outMax.set(1, 1, randomDir);
    } else if (arc < 270) {
      outMin.set(-1, Math.min(dirSin, randomDir), -randomDir);
      outMax.set(1, 1, randomDir);
    } else {
      outMin.set(-1, -1, -randomDir);
      outMax.set(1, 1, randomDir);
    }
  }
}
