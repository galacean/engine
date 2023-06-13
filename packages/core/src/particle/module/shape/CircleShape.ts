import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { BoundingBox, Rand, Vector2, Vector3 } from "@oasis-engine/math";
import { ParticleShapeType } from "../../enum/ParticleShapeType";
import { ParticleShapeMultiModeValue } from "../../enum";

/**
 * Circle Particle Emitter
 */
export class CircleShape extends BaseShape {
  protected static _tempPositionPoint: Vector2 = new Vector2();

  /** Radius of the shape to emit particles from. */
  radius: number = 1.0;
  /** Angle of the circle arc to emit particles from. */
  arc: number = (360.0 / 180.0) * Math.PI;
  /** The mode to generate particles around the arc. */
  arcMode = ParticleShapeMultiModeValue.Loop;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Circle;
  }

  /**
   * @inheritDoc
   * @override
   */
  protected _getShapeBoundBox(boundBox: BoundingBox): void {
    const min: Vector3 = boundBox.min;
    min.x = min.z = -this.radius;
    min.y = 0;
    const max: Vector3 = boundBox.max;
    max.x = max.z = this.radius;
    max.y = 0;
  }

  /**
   * @inheritDoc
   * @override
   */
  protected _getSpeedBoundBox(boundBox: BoundingBox): void {
    const min: Vector3 = boundBox.min;
    min.x = min.y = -1;
    min.z = 0;
    const max: Vector3 = boundBox.max;
    max.x = max.y = 1;
    max.z = 0;
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
    const positionPoint: Vector2 = CircleShape._tempPositionPoint;
    if (rand) {
      rand.seed = randomSeeds[16];
      switch (this.arcMode) {
        case ParticleShapeMultiModeValue.Loop:
          ShapeUtils._randomPointUnitArcCircle(this.arc, CircleShape._tempPositionPoint, rand);
          break;
        case ParticleShapeMultiModeValue.Random:
          ShapeUtils._randomPointInsideUnitArcCircle(this.arc, CircleShape._tempPositionPoint, rand);
          break;
      }
      randomSeeds[16] = rand.seed;
    } else {
      switch (this.arcMode) {
        case ParticleShapeMultiModeValue.Loop:
          ShapeUtils._randomPointUnitArcCircle(this.arc, CircleShape._tempPositionPoint);
          break;
        case ParticleShapeMultiModeValue.Random:
          ShapeUtils._randomPointInsideUnitArcCircle(this.arc, CircleShape._tempPositionPoint);
          break;
      }
    }

    position.x = -positionPoint.x;
    position.y = positionPoint.y;
    position.z = 0;

    Vector3.scale(position, this.radius, position);

    if (this.randomDirectionAmount) {
      if (rand) {
        rand.seed = randomSeeds[17];
        ShapeUtils._randomPointUnitSphere(direction, rand);
        randomSeeds[17] = rand.seed;
      } else {
        ShapeUtils._randomPointUnitSphere(direction);
      }
    } else {
      direction.copyFrom(position);
    }
    // reverse to default direction
    direction.z *= -1.0;
  }

  /**
   * @override
   */
  cloneTo(destShape: CircleShape): void {
    super.cloneTo(destShape);
    destShape.radius = this.radius;
    destShape.arc = this.arc;
    destShape.arcMode = this.arcMode;
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  /**
   * @override
   */
  clone(): CircleShape {
    const destShape = new CircleShape();
    this.cloneTo(destShape);
    return destShape;
  }
}
