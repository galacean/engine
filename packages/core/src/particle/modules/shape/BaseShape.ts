import { IClone } from "@galacean/engine-design";
import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleRandomSubSeeds } from "../../enums/ParticleRandomSubSeeds";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Base class for all particle shapes.
 */
export abstract class BaseShape implements IClone {
  /** The type of shape to emit particles from. */
  shapeType: ParticleShapeType;
  /** Specifies whether the ShapeModule is enabled or disabled. */
  enable: boolean = true;
  /** Randomizes the starting direction of particles. */
  randomDirectionAmount: number = 0;

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, position: Vector3, direction: Vector3): void {
    throw new Error("BaseShape: must override it.");
  }

  /**
   * @inheritDoc
   */
  cloneTo(destShape: BaseShape): void {
    destShape.enable = this.enable;
    destShape.randomDirectionAmount = this.randomDirectionAmount;
  }

  /**
   * @inheritDoc
   */
  clone(): BaseShape {
    return null;
  }
}
