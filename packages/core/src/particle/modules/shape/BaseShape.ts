import { Rand, Vector3 } from "@galacean/engine-math";
import { ParticleShapeType } from "./enums/ParticleShapeType";
import { UpdateFlagManager } from "../../../UpdateFlagManager";

/**
 * Base class for all particle shapes.
 */
export abstract class BaseShape {
  /** The type of shape to emit particles from. */
  abstract readonly shapeType: ParticleShapeType;

  protected _updateManager: UpdateFlagManager = new UpdateFlagManager();

  private _enabled = true;
  private _randomDirectionAmount = 0;

  /**
   * Specifies whether the ShapeModule is enabled or disabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._updateManager.dispatch();
    }
  }

  /**
   * Randomizes the starting direction of particles.
   */
  get randomDirectionAmount(): number {
    return this._randomDirectionAmount;
  }

  set randomDirectionAmount(value: number) {
    if (value !== this._randomDirectionAmount) {
      this._randomDirectionAmount = value;
      this._updateManager.dispatch();
    }
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
  _getDirectionRange(min: Vector3, max: Vector3): void {
    throw new Error("BaseShape: must override it.");
  }

  /**
   * @internal
   */
  _getStartPositionRange(min: Vector3, max: Vector3): void {
    throw new Error("BaseShape: must override it.");
  }

  /**
   * @internal
   */
  _registerOnValueChanged(listener: () => void): void {
    this._updateManager.addListener(listener);
  }

  /**
   * @internal
   */
  _unRegisterOnValueChanged(listener: () => void): void {
    this._updateManager.removeListener(listener);
  }
}
