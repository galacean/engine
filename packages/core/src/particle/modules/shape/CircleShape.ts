import { BoundingBox, Vector2, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeMultiModeValue } from "./enums/ParticleShapeMultiModeValue";
import { ParticleShapeType } from "./enums/ParticleShapeType";

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
   */
  protected override _getShapeBoundBox(boundBox: BoundingBox): void {
    const min: Vector3 = boundBox.min;
    min.x = min.z = -this.radius;
    min.y = 0;
    const max: Vector3 = boundBox.max;
    max.x = max.z = this.radius;
    max.y = 0;
  }

  /**
   * @inheritDoc
   */
  protected override _getSpeedBoundBox(boundBox: BoundingBox): void {
    const min: Vector3 = boundBox.min;
    min.x = min.y = -1;
    min.z = 0;
    const max: Vector3 = boundBox.max;
    max.x = max.y = 1;
    max.z = 0;
  }

  override _generatePositionAndDirection(position: Vector3, direction: Vector3): void {
    const rand = this._rand;
    const positionPoint: Vector2 = CircleShape._tempPositionPoint;

    switch (this.arcMode) {
      case ParticleShapeMultiModeValue.Loop:
        ShapeUtils._randomPointUnitArcCircle(this.arc, CircleShape._tempPositionPoint, rand);
        break;
      case ParticleShapeMultiModeValue.Random:
        ShapeUtils._randomPointInsideUnitArcCircle(this.arc, CircleShape._tempPositionPoint, rand);
        break;
    }

    position.x = -positionPoint.x;
    position.y = positionPoint.y;
    position.z = 0;

    Vector3.scale(position, this.radius, position);

    if (this.randomDirectionAmount) {
      ShapeUtils._randomPointUnitSphere(direction, rand);
    } else {
      direction.copyFrom(position);
    }
    // reverse to default direction
    direction.z *= -1.0;
  }

  override cloneTo(destShape: CircleShape): void {
    super.cloneTo(destShape);
    destShape.radius = this.radius;
    destShape.arc = this.arc;
    destShape.arcMode = this.arcMode;
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  override clone(): CircleShape {
    const destShape = new CircleShape();
    this.cloneTo(destShape);
    return destShape;
  }
}
