import { MathUtil, Vector2, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Cone shape.
 */
export class ConeShape extends BaseShape {
  protected static _tempPositionPoint: Vector2 = new Vector2();
  protected static _tempDirectionPoint: Vector2 = new Vector2();

  /** Angle of the cone to emit particles from. */
  angle: number = 25.0;
  /** Radius of the shape to emit particles from. */
  radius: number = 1.0;
  /** Length of the cone to emit particles from. */
  length: number = 5.0;
  /** Cone emitter type. */
  emitType: ConeEmitType = ConeEmitType.Base;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Cone;
  }

  override _generatePositionAndDirection(position: Vector3, direction: Vector3): void {
    const rand = this._rand;
    const unitPosition = ConeShape._tempPositionPoint;

    const angle = MathUtil.degreeToRadian(this.angle);
    const dirCosA = Math.cos(angle);
    const dirSinA = Math.sin(angle);

    switch (this.emitType) {
      case ConeEmitType.Base:
        ShapeUtils._randomPointInsideUnitCircle(unitPosition, rand);
        position.set(unitPosition.x * this.radius, unitPosition.y * this.radius, 0);

        const unitDirection = ConeShape._tempDirectionPoint;
        ShapeUtils._randomPointInsideUnitCircle(unitDirection, rand);
        Vector2.lerp(unitPosition, unitDirection, this.randomDirectionAmount, unitDirection);
        direction.set(unitDirection.x * dirSinA, unitDirection.y * dirSinA, dirCosA);
        break;
      case ConeEmitType.Volume:
        ShapeUtils._randomPointInsideUnitCircle(unitPosition, rand);

        position.x = unitPosition.x * this.radius;
        position.y = unitPosition.y * this.radius;
        position.z = 0;

        direction.x = unitPosition.x * dirSinA;
        direction.y = unitPosition.y * dirSinA;
        direction.z = dirCosA;

        Vector3.normalize(direction, direction);
        Vector3.scale(direction, this.length * rand.random(), direction);
        Vector3.add(position, direction, position);

        if (this.randomDirectionAmount) {
          ShapeUtils._randomPointUnitSphere(direction, rand);
        }
        break;
    }
    // reverse to default direction
    direction.z *= -1.0;
  }

  override cloneTo(destShape: ConeShape): void {
    super.cloneTo(destShape);
    destShape.angle = this.angle;
    destShape.radius = this.radius;
    destShape.length = this.length;
    destShape.emitType = this.emitType;
  }

  override clone(): ConeShape {
    const destShape = new ConeShape();
    this.cloneTo(destShape);
    return destShape;
  }
}

export enum ConeEmitType {
  Base,
  Volume
}
