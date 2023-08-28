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
}
