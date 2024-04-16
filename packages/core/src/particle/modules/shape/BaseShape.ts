import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Base class for all particle shapes.
 */
export abstract class BaseShape {
  private _enabled = true;
  private _randomDirectionAmount = 0;
  /** The type of shape to emit particles from. */
  abstract readonly shapeType: ParticleShapeType;

  /** Specifies whether the ShapeModule is enabled or disabled. */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._onValueChanged && this._onValueChanged();
    }
  }

  /** Randomizes the starting direction of particles. */
  get randomDirectionAmount(): number {
    return this._randomDirectionAmount;
  }

  set randomDirectionAmount(value: number) {
    if (value !== this._randomDirectionAmount) {
      this._randomDirectionAmount = value;
      this._onValueChanged && this._onValueChanged();
    }
  }

  constructor() {
    this._onValueChanged = this._onValueChanged.bind(this);
  }

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

  /** @internal */
  _onValueChanged: () => void = null;
}
