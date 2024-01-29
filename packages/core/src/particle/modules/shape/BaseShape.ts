import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Base class for all particle shapes.
 */
export abstract class BaseShape {
  /** The type of shape to emit particles from. */
  abstract readonly shapeType: ParticleShapeType;
  /** Specifies whether the ShapeModule is enabled or disabled. */
  enabled: boolean = true;
  /** Randomizes the starting direction of particles. */
  randomDirectionAmount: number = 0;

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    throw new Error("BaseShape: must override it.");
  }

  /**
   * @internal
   */
  _getDirectionRange(out: { min: Vector3; max: Vector3 }): void {
    throw new Error("BaseShape: must override it.");
  }

  /**
   * @internal
   */
  _getStartPositionRange(out: { min: Vector3; max: Vector3 }): void {
    throw new Error("BaseShape: must override it.");
  }
}
