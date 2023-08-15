import { IClone } from "@galacean/engine-design";
import { BoundingBox, Rand, Vector2, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";
import { ParticleRandomSubSeeds } from "../../enums/ParticleRandomSubSeeds";

/**
 * Configures the initial positions and directions of particles.
 */
export class BaseShape implements IClone {
  /** The type of shape to emit particles from. */
  shapeType: ParticleShapeType;
  /** Specifies whether the ShapeModule is enabled or disabled. */
  enable: boolean = true;
  /** Randomizes the starting direction of particles. */
  randomDirectionAmount: number = 0;

  /** @internal */
  _rand: Rand = new Rand(0, ParticleRandomSubSeeds.Shape);

  constructor() {}

  /**
   * @internal
   */
  _generatePositionAndDirection(
    position: Vector3,
    direction: Vector3,
    rand: Rand = null,
    randomSeeds: Uint32Array = null
  ): void {
    throw new Error("BaseShape: must override it.");
  }

  /**
   * @internal
   */
  _calculateProceduralBounds(boundBox: BoundingBox, emitterPosScale: Vector3, minMaxBounds: Vector2): void {
    this._getShapeBoundBox(boundBox);

    const min: Vector3 = boundBox.min;
    const max: Vector3 = boundBox.max;
    Vector3.multiply(min, emitterPosScale, min);
    Vector3.multiply(max, emitterPosScale, max);

    const speedBounds: BoundingBox = new BoundingBox(new Vector3(), new Vector3());
    if (this.randomDirectionAmount) {
      const { min, max } = speedBounds;
      min.set(-1, -1, -1);
      max.set(1, 1, 1);
      //minMaxBounds = Abs(minMaxBounds);
    } else {
      this._getSpeedBoundBox(speedBounds);
    }

    const maxSpeedBound: BoundingBox = new BoundingBox(new Vector3(), new Vector3());
    const maxSpeedMin: Vector3 = maxSpeedBound.min;
    const maxSpeedMax: Vector3 = maxSpeedBound.max;
    Vector3.scale(speedBounds.min, minMaxBounds.y, maxSpeedMin);
    Vector3.scale(speedBounds.max, minMaxBounds.y, maxSpeedMax);
    Vector3.add(boundBox.min, maxSpeedMin, maxSpeedMin);
    Vector3.add(boundBox.max, maxSpeedMax, maxSpeedMax);

    Vector3.min(boundBox.min, maxSpeedMin, boundBox.min);
    Vector3.max(boundBox.max, maxSpeedMin, boundBox.max);

    const minSpeedBound: BoundingBox = new BoundingBox(new Vector3(), new Vector3());
    const minSpeedMin: Vector3 = minSpeedBound.min;
    const minSpeedMax: Vector3 = minSpeedBound.max;
    Vector3.scale(speedBounds.min, minMaxBounds.x, minSpeedMin);
    Vector3.scale(speedBounds.max, minMaxBounds.x, minSpeedMax);

    Vector3.min(minSpeedBound.min, minSpeedMax, maxSpeedMin);
    Vector3.max(minSpeedBound.min, minSpeedMax, maxSpeedMax);

    Vector3.min(boundBox.min, maxSpeedMin, boundBox.min);
    Vector3.max(boundBox.max, maxSpeedMin, boundBox.max);
  }

  /**
   * @override
   * @inheritDoc
   */
  cloneTo(destShape: BaseShape): void {
    destShape.enable = this.enable;
  }

  /**
   * @override
   * @inheritDoc
   */
  clone(): BaseShape {
    const destShape: BaseShape = new BaseShape();
    this.cloneTo(destShape);
    return destShape;
  }

  protected _getShapeBoundBox(boundBox: BoundingBox): void {
    throw new Error("BaseShape: must override it.");
  }

  protected _getSpeedBoundBox(boundBox: BoundingBox): void {
    throw new Error("BaseShape: must override it.");
  }
}
