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
  // /** The mode to generate particles around the arc. */
  // arcMode = ParticleShapeArcMode.Random;
  /** The speed at which the arc is traversed. */
  arcSpeed = 1.0;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Circle;
  }

  /**
   * @internal
   */
  override _generatePositionAndDirection(rand: Rand, position: Vector3, direction: Vector3): void {
    const positionPoint = CircleShape._tempPositionPoint;

    // switch (this.arcMode) {
    //   case ParticleShapeArcMode.Loop:
    //     ShapeUtils.randomPointUnitArcCircle(MathUtil.degreeToRadian(this.arc), positionPoint, rand);
    //     break;
    //   case ParticleShapeArcMode.Random:
    ShapeUtils.randomPointInsideUnitArcCircle(MathUtil.degreeToRadian(this.arc), positionPoint, rand);
    //     break;
    // }

    position.set(positionPoint.x, positionPoint.y, 0);
    position.scale(this.radius);

    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(position, direction, this.randomDirectionAmount, direction);
  }
}
