import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { BoundingBox, Rand, Vector2, Vector3 } from "@oasis-engine/math";
import { ParticleShapeType } from "../../enum/ParticleShapeType";

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
   * @override
   */
  protected _getShapeBoundBox(boundBox: BoundingBox): void {
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
   * @override
   */
  protected _getSpeedBoundBox(boundBox: BoundingBox): void {
    const sinA: number = Math.sin(this.angle);
    const min: Vector3 = boundBox.min;
    min.x = min.y = -sinA;
    min.z = 0;
    const max: Vector3 = boundBox.max;
    max.x = max.y = sinA;
    max.z = 1;
  }

  /**
   * @override
   */
  _generatePositionAndDirection(
    position: Vector3,
    direction: Vector3,
    rand: Rand = null,
    randomSeeds: Uint32Array = null
  ): void {
    const positionPointE: Vector2 = ConeShape._tempPositionPoint;
    let positionX: number;
    let positionY: number;
    let directionPointE: Vector2;

    const dirCosA: number = Math.cos(this.angle);
    const dirSinA: number = Math.sin(this.angle);
    switch (this.emitType) {
      case ConeEmitType.Base:
        if (rand) {
          rand.seed = randomSeeds[16];
          ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempPositionPoint, rand);
          randomSeeds[16] = rand.seed;
        } else {
          ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempPositionPoint);
        }
        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        if (this.randomDirectionAmount) {
          if (rand) {
            rand.seed = randomSeeds[17];
            ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempDirectionPoint, rand);
            randomSeeds[17] = rand.seed;
          } else {
            ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempDirectionPoint);
          }
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
        if (rand) {
          rand.seed = randomSeeds[16];
          ShapeUtils._randomPointUnitCircle(ConeShape._tempPositionPoint, rand);
          randomSeeds[16] = rand.seed;
        } else {
          ShapeUtils._randomPointUnitCircle(ConeShape._tempPositionPoint);
        }
        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        if (this.randomDirectionAmount) {
          if (rand) {
            rand.seed = randomSeeds[17];
            ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempDirectionPoint, rand);
            randomSeeds[17] = rand.seed;
          } else {
            ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempDirectionPoint);
          }
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
        if (rand) {
          rand.seed = randomSeeds[16];
          ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempPositionPoint, rand);
        } else {
          ShapeUtils._randomPointInsideUnitCircle(ConeShape._tempPositionPoint);
        }
        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        direction.x = positionX * dirSinA;
        direction.y = positionY * dirSinA;
        direction.z = dirCosA;

        Vector3.normalize(direction, direction);
        if (rand) {
          Vector3.scale(direction, this.length * rand.getFloat(), direction);
          randomSeeds[16] = rand.seed;
        } else {
          Vector3.scale(direction, this.length * Math.random(), direction);
        }
        Vector3.add(position, direction, position);

        if (this.randomDirectionAmount) {
          if (rand) {
            rand.seed = randomSeeds[17];
            ShapeUtils._randomPointUnitSphere(direction, rand);
            randomSeeds[17] = rand.seed;
          } else {
            ShapeUtils._randomPointUnitSphere(direction);
          }
        }

        break;
      case ConeEmitType.VolumeShell:
        if (rand) {
          rand.seed = randomSeeds[16];
          ShapeUtils._randomPointUnitCircle(ConeShape._tempPositionPoint, rand);
        } else {
          ShapeUtils._randomPointUnitCircle(ConeShape._tempPositionPoint);
        }

        positionX = positionPointE.x;
        positionY = positionPointE.y;
        position.x = positionX * this.radius;
        position.y = positionY * this.radius;
        position.z = 0;

        direction.x = positionX * dirSinA;
        direction.y = positionY * dirSinA;
        direction.z = dirCosA;

        Vector3.normalize(direction, direction);
        if (rand) {
          Vector3.scale(direction, this.length * rand.getFloat(), direction);
          randomSeeds[16] = rand.seed;
        } else {
          Vector3.scale(direction, this.length * Math.random(), direction);
        }

        Vector3.add(position, direction, position);

        if (this.randomDirectionAmount) {
          if (rand) {
            rand.seed = randomSeeds[17];
            ShapeUtils._randomPointUnitSphere(direction, rand);
            randomSeeds[17] = rand.seed;
          } else {
            ShapeUtils._randomPointUnitSphere(direction);
          }
        }

        break;
    }
    // reverse to default direction
    direction.z *= -1.0;
  }

  /**
   * @override
   */
  cloneTo(destShape: ConeShape): void {
    super.cloneTo(destShape);
    destShape.angle = this.angle;
    destShape.radius = this.radius;
    destShape.length = this.length;
    destShape.emitType = this.emitType;
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  /**
   * @override
   */
  clone(): ConeShape {
    const destShape = new ConeShape();
    this.cloneTo(destShape);
    return destShape;
  }
}
