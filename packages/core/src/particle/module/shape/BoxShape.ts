import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "../../enum/ParticleShapeType";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";

/**
 * Box emitter shape.
 */
export class BoxShape extends BaseShape {
  /** Thickness of the box to emit particles from. */
  size: Vector3 = new Vector3(1, 1, 1);

  constructor() {
    super();
    this.shapeType = ParticleShapeType.Box;
  }

  /**
   * @internal
   */
  override _generatePositionAndDirection(
    position: Vector3,
    direction: Vector3,
    rand: Rand = null,
    randomSeeds: Uint32Array = null
  ): void {
    if (rand) {
      rand.seed = randomSeeds[16];
      ShapeUtils._randomPointInsideHalfUnitBox(position, rand);
      randomSeeds[16] = rand.seed;
    } else {
      ShapeUtils._randomPointInsideHalfUnitBox(position);
    }
    position.multiply(this.size);
    if (this.randomDirectionAmount) {
      if (rand) {
        rand.seed = randomSeeds[17];
        ShapeUtils._randomPointUnitSphere(direction, rand);
        randomSeeds[17] = rand.seed;
      } else {
        ShapeUtils._randomPointUnitSphere(direction);
      }
    } else {
      direction.set(0.0, 0.0, 1.0);
    }
    // reverse to default direction
    direction.z *= -1.0;
  }

  override cloneTo(destShape: BoxShape): void {
    super.cloneTo(destShape);
    destShape.size.copyFrom(this.size);
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  override clone(): BoxShape {
    const destShape = new BoxShape();
    this.cloneTo(destShape);
    return destShape;
  }
}
