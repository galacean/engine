import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { BoundingBox, Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "../../enum/ParticleShapeType";

/**
 * Hemisphere emitter
 */
export class HemisphereShape extends BaseShape {
  /** Radius of the shape to emit particles from. */
  radius: number = 1.0;
  /** Whether emit from shell */
  emitFromShell: boolean = false;

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Hemisphere;
  }

  /**
   * @inheritDoc
   */
  protected override _getShapeBoundBox(boundBox: BoundingBox): void {
    const min: Vector3 = boundBox.min;
    min.x = min.y = min.z = -this.radius;
    const max: Vector3 = boundBox.max;
    max.x = max.y = this.radius;
    max.z = 0;
  }

  /**
   * @inheritDoc
   */
  protected override _getSpeedBoundBox(boundBox: BoundingBox): void {
    const min: Vector3 = boundBox.min;
    min.x = min.y = -1;
    min.z = 0;
    const max: Vector3 = boundBox.max;
    max.x = max.y = max.z = 1;
  }

  override _generatePositionAndDirection(
    position: Vector3,
    direction: Vector3,
    rand: Rand = null,
    randomSeeds: Uint32Array = null
  ): void {
    if (rand) {
      rand.seed = randomSeeds[16];
      if (this.emitFromShell) ShapeUtils._randomPointUnitSphere(position, rand);
      else ShapeUtils._randomPointInsideUnitSphere(position, rand);
      randomSeeds[16] = rand.seed;
    } else {
      if (this.emitFromShell) ShapeUtils._randomPointUnitSphere(position);
      else ShapeUtils._randomPointInsideUnitSphere(position);
    }

    Vector3.scale(position, this.radius, position);

    const z: number = position.z;
    z < 0.0 && (position.z = z * -1.0);

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

  override cloneTo(destShape: HemisphereShape): void {
    super.cloneTo(destShape);
    destShape.radius = this.radius;
    destShape.emitFromShell = this.emitFromShell;
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  override clone(): HemisphereShape {
    const destShape = new HemisphereShape();
    this.cloneTo(destShape);
    return destShape;
  }
}
