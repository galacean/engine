import { Rand, Vector3 } from "@galacean/engine-math";
import { deepClone } from "../../../clone/CloneManager";
import { BaseShape } from "./BaseShape";
import { ShapeUtils } from "./ShapeUtils";
import { ParticleShapeType } from "./enums/ParticleShapeType";

/**
 * Particle shape that emits particles from a box.
 */
export class BoxShape extends BaseShape {
  private static _tempVector30 = new Vector3();

  @deepClone
  _size = new Vector3(1, 1, 1);

  readonly shapeType = ParticleShapeType.Box;

  /**
   * The size of the box.
   */
  get size() {
    return this._size;
  }

  set size(value: Vector3) {
    if (value !== this._size) {
      this._size.copyFrom(value);
    }
  }

  constructor() {
    super();
    this._onSizeChanged = this._onSizeChanged.bind(this);
    // @ts-ignore
    this._size._onValueChanged = this._onSizeChanged;
  }

  /**
   * @internal
   */
  override _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
    ShapeUtils._randomPointInsideHalfUnitBox(position, rand);
    position.multiply(this.size);

    const defaultDirection = BoxShape._tempVector30;
    defaultDirection.set(0.0, 0.0, -1.0);
    ShapeUtils._randomPointUnitSphere(direction, rand);
    Vector3.lerp(defaultDirection, direction, this.randomDirectionAmount, direction);
  }

  /**
   * @internal
   */
  override _getDirectionRange(min: Vector3, max: Vector3) {
    const { randomDirectionAmount } = this;
    min.set(-randomDirectionAmount, -randomDirectionAmount, -1);
    max.set(randomDirectionAmount, randomDirectionAmount, randomDirectionAmount);
  }

  /**
   * @internal
   */
  override _getStartPositionRange(min: Vector3, max: Vector3): void {
    const { x, y, z } = this.size;
    min.set(-x / 2, -y / 2, -z / 2);
    max.set(x / 2, y / 2, z / 2);
  }

  private _onSizeChanged(): void {
    this._updateManager.dispatch();
  }
}
