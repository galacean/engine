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

  readonly shapeType = ParticleShapeType.Box;

  @deepClone
  private _size = new Vector3(1, 1, 1);

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
    // @ts-ignore
    this._size._onValueChanged = this._updateManager.dispatch.bind(this._updateManager);
  }

  /**
   * @internal
   */
  _generatePositionAndDirection(rand: Rand, emitTime: number, position: Vector3, direction: Vector3): void {
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
  _getDirectionRange(outMin: Vector3, outMax: Vector3): void {
    const radian = Math.PI * this.randomDirectionAmount;

    if (this.randomDirectionAmount < 0.5) {
      const dirSin = Math.sin(radian);
      outMin.set(-dirSin, -dirSin, -1);
      outMax.set(dirSin, dirSin, 0);
    } else {
      const dirCos = Math.cos(radian);
      outMin.set(-1, -1, -1);
      outMax.set(1, 1, -dirCos);
    }
  }

  /**
   * @internal
   */
  _getPositionRange(outMin: Vector3, outMax: Vector3): void {
    const { x, y, z } = this._size;
    outMin.set(-x * 0.5, -y * 0.5, -z * 0.5);
    outMax.set(x * 0.5, y * 0.5, z * 0.5);
  }
}
