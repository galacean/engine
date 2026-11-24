import { Matrix, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { Sprite } from "./Sprite";

/** @internal */
export class SpriteMaskUtils {
  private static _axisX = new Vector3();
  private static _axisY = new Vector3();
  private static _normal = new Vector3();
  private static _offset = new Vector3();
  private static _local = new Vector3();

  /**
   * Intersect the transformed XY plane within the signed parameter range. Returns null on a miss.
   * outLocal is in the same units as the geometry, including for sheared or Z-flat transforms.
   */
  static intersectRayXYPlane(
    ray: Ray,
    matrix: Matrix,
    minDistance: number,
    maxDistance: number,
    outLocal: Vector3,
    outNormal?: Vector3
  ): number | null {
    const normal = this._getPlane(matrix, ray.origin);
    const denominator = Vector3.dot(ray.direction, normal);
    if (denominator === 0) return null;
    const t = -Vector3.dot(this._offset, normal) / denominator;
    if (!(t >= minDistance && t <= maxDistance)) return null;

    this._getLocalXY(ray.direction, denominator, outLocal);
    if (outNormal) {
      const e = matrix.elements;
      // Match local forward (-Z) under reflections; use the XY winding when Z is flat.
      const sign = normal.x * e[8] + normal.y * e[9] + normal.z * e[10] < 0 ? 1 : -1;
      Vector3.scale(normal, sign / normal.length(), outNormal);
    }
    return t;
  }

  static containsRay(
    ray: Ray,
    sprite: Sprite | null,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean,
    maxDistance: number = Infinity,
    minDistance: number = 0
  ): boolean {
    if (!sprite || !width || !height) return false;
    if (this.intersectRayXYPlane(ray, worldMatrix, minDistance, maxDistance, this._local) === null) return false;
    return this._containsLocalPoint(sprite, width, height, pivot, flipX, flipY);
  }

  static containsWorldPoint(
    worldPoint: Vector3,
    sprite: Sprite | null,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean
  ): boolean {
    if (!sprite || !width || !height) return false;
    const normal = this._getPlane(worldMatrix, worldPoint);
    const denominator = Vector3.dot(normal, normal);
    if (!denominator) return false;
    this._getLocalXY(normal, denominator, this._local);
    return this._containsLocalPoint(sprite, width, height, pivot, flipX, flipY);
  }

  private static _getPlane(matrix: Matrix, origin: Vector3): Vector3 {
    const e = matrix.elements;
    this._axisX.set(e[0], e[1], e[2]);
    this._axisY.set(e[4], e[5], e[6]);
    this._offset.set(origin.x - e[12], origin.y - e[13], origin.z - e[14]);
    Vector3.cross(this._axisX, this._axisY, this._normal);
    return this._normal;
  }

  private static _getLocalXY(direction: Vector3, denominator: number, out: Vector3): void {
    // Crossing with the ray direction eliminates t from origin + t * direction = P + xU + yV.
    const cross = this._offset;
    Vector3.cross(direction, cross, cross);
    out.set(Vector3.dot(cross, this._axisY) / denominator, -Vector3.dot(cross, this._axisX) / denominator, 0);
  }

  private static _containsLocalPoint(
    sprite: Sprite,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean
  ): boolean {
    const spriteX = this._local.x / (flipX ? -width : width) + pivot.x;
    const spriteY = this._local.y / (flipY ? -height : height) + pivot.y;
    const positions = sprite._getPositions();
    const { x: left, y: bottom } = positions[0];
    const { x: right, y: top } = positions[3];
    return spriteX >= left && spriteX <= right && spriteY >= bottom && spriteY <= top;
  }
}
