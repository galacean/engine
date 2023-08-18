import { MathUtil, Vector2, Vector3 } from "@galacean/engine-math";
import { ParticleGenerator } from "../../ParticleGenerator";
import { ParticleRandomSubSeeds } from "../../enums/ParticleRandomSubSeeds";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Cone shape.
 */
export class ConeShape extends BaseShape {
  private static _tempVector20: Vector2 = new Vector2();
  private static _tempVector21: Vector2 = new Vector2();
  private static _tempVector30: Vector3 = new Vector3();
  private static _tempVector31: Vector3 = new Vector3();

  /** Angle of the cone to emit particles from. */
  angle: number = 25.0;
  /** Radius of the shape to emit particles from. */
  radius: number = 1.0;
  /** Length of the cone to emit particles from. */
  length: number = 5.0;
  /** Cone emitter type. */
  emitType: ConeEmitType = ConeEmitType.Base;

  constructor(generator: ParticleGenerator) {
    super(generator);
    this.shapeType = ParticleShapeType.Cone;
  }

  override _generatePositionAndDirection(position: Vector3, direction: Vector3): void {
    const rand = this._shapeRand;

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

  override cloneTo(destShape: ConeShape): void {
    super.cloneTo(destShape);
    destShape.angle = this.angle;
    destShape.radius = this.radius;
    destShape.length = this.length;
    destShape.emitType = this.emitType;
  }

  override clone(): ConeShape {
    const destShape = new ConeShape(null);
    this.cloneTo(destShape);
    return destShape;
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
