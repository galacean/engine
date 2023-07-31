import { IClone } from "@galacean/engine-design";
import { BoundingBox, Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "../../enum/ParticleShapeType";

/**
 * Configures the initial positions and directions of particles.
 */
export abstract class BaseShape implements IClone {
  /** Specifies whether the ShapeModule is enabled or disabled. */
  enable: boolean = true;
  /** The type of shape to emit particles from. */
  shapeType: ParticleShapeType;
  /** Randomizes the starting direction of particles. */
  randomDirectionAmount: number = 0;


    /**
   * @override
   * @inheritDoc
   */
    cloneTo(destShape: BaseShape): void {
      destShape.enable = this.enable;
    }

  /**
   * @internal
   */
  abstract _generatePositionAndDirection(
    position: Vector3,
    direction: Vector3,
    rand: Rand ,
    randomSeeds: Uint32Array 
  );

 



  /**
   * @override
   * @inheritDoc
   */
  abstract clone(): BaseShape;
  

  protected abstract _getShapeBoundBox(boundBox: BoundingBox): void 
  
  protected abstract _getSpeedBoundBox(boundBox: BoundingBox): void 
}
