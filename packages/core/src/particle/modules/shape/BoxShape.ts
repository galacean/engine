import { BoundingBox, Vector3 } from "@galacean/engine-math";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";
import { ParticleGenerator } from "../../ParticleGenerator";
import { ParticleRandomSubSeeds } from "../../enums/ParticleRandomSubSeeds";

/**
 * Box emitter shape
 */
export class BoxShape extends BaseShape {
  /** Thickness of the box to emit particles from. */
  boxThickness: Vector3 = new Vector3(1, 1, 1);

  constructor(generator: ParticleGenerator) {
    super(generator);
    this.shapeType = ParticleShapeType.Box;
  }

  /**
   * @internal
   */
  override _generatePositionAndDirection(position: Vector3, direction: Vector3): void {
    const rand = this._generator._getRandAndResetSubSeed(ParticleRandomSubSeeds.Shape);
    ShapeUtils._randomPointInsideHalfUnitBox(position, rand);

    position.multiply(this.boxThickness);
    if (this.randomDirectionAmount) {
      ShapeUtils._randomPointUnitSphere(direction, rand);
    } else {
      direction.x = 0.0;
      direction.y = 0.0;
      direction.z = 1.0;
    }
    // reverse to default direction
    direction.z *= -1.0;
  }

  override cloneTo(destShape: BoxShape): void {
    super.cloneTo(destShape);
    destShape.boxThickness.copyFrom(this.boxThickness);
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  override clone(): BoxShape {
    const destShape = new BoxShape(null);
    this.cloneTo(destShape);
    return destShape;
  }
}
