import { BoundingBox, Vector2, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

export enum ConeEmitType {
  Base,
  BaseShell,
  Volume,
  VolumeShell
}

/**
 * Cone particle emitter
 */
export class ConeShape extends BaseShape {
  protected static _tempPositionPoint: Vector2 = new Vector2();
  protected static _tempDirectionPoint: Vector2 = new Vector2();

  /** Angle of the cone to emit particles from. */
  angle: number = (25.0 / 180.0) * Math.PI;
  /** Radius of the shape to emit particles from. */
  radius: number = 1.0;
  /** Length of the cone to emit particles from. */
  length: number = 5.0;
  /** Cone emitter subtype */
  emitType: ConeEmitType;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Cone;
    this.emitType = ConeEmitType.Base;
  }

  /**
   * @inheritDoc
   */
  protected override _getShapeBoundBox(boundBox: BoundingBox): void {
    const coneRadius2: number = this.radius + this.length * Math.sin(this.angle);
    const coneLength: number = this.length * Math.cos(this.angle);

    const min: Vector3 = boundBox.min;
    min.x = min.y = -coneRadius2;
    min.z = 0;

    const max: Vector3 = boundBox.max;
    max.x = max.y = coneRadius2;
    max.z = coneLength;
  }

  /**
   * @inheritDoc
   */
  protected override _getSpeedBoundBox(boundBox: BoundingBox): void {
    const sinA: number = Math.sin(this.angle);
    const min: Vector3 = boundBox.min;
    min.x = min.y = -sinA;
    min.z = 0;
    const max: Vector3 = boundBox.max;
    max.x = max.y = sinA;
    max.z = 1;
  }

  override _generatePositionAndDirection(position: Vector3, direction: Vector3): void {
    const rand = this._rand;
    const positionPointE: Vector2 = ConeShape._tempPositionPoint;
    let positionX: number;
    let positionY: number;
    let directionPointE: Vector2;

    const dirCosA: number = Math.cos(this.angle);
    const dirSinA: number = Math.sin(this.angle);
    switch (this.emitType) {
      case ConeEmitType.Base:
        ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempPositionPoint, rand);

        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        if (this.randomDirectionAmount) {
          ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempDirectionPoint, rand);
          directionPointE = ConeShape._tempDirectionPoint;
          direction.x = directionPointE.x * dirSinA;
          direction.y = directionPointE.y * dirSinA;
        } else {
          direction.x = positionX * dirSinA;
          direction.y = positionY * dirSinA;
        }
        direction.z = dirCosA;
        break;
      case ConeEmitType.BaseShell:
        ShapeUtils._randomPointUnitCircle(ConeShape._tempPositionPoint, rand);

        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        if (this.randomDirectionAmount) {
          ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempDirectionPoint, rand);

          directionPointE = ConeShape._tempDirectionPoint;
          direction.x = directionPointE.x * dirSinA;
          direction.y = directionPointE.y * dirSinA;
        } else {
          direction.x = positionX * dirSinA;
          direction.y = positionY * dirSinA;
        }
        direction.z = dirCosA;
        break;
      case ConeEmitType.Volume:
        ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempPositionPoint, rand);

        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        direction.x = positionX * dirSinA;
        direction.y = positionY * dirSinA;
        direction.z = dirCosA;

        Vector3.normalize(direction, direction);

        Vector3.scale(direction, this.length * rand.random(), direction);

        Vector3.add(position, direction, position);

        if (this.randomDirectionAmount) {
          ShapeUtils._randomPointUnitSphere(direction, rand);
        }

        break;
      case ConeEmitType.VolumeShell:
        ShapeUtils._randomPointUnitCircle(ConeShape._tempPositionPoint, rand);

        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        direction.x = positionX * dirSinA;
        direction.y = positionY * dirSinA;
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
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  override clone(): ConeShape {
    const destShape = new ConeShape();
    this.cloneTo(destShape);
    return destShape;
  }
}
