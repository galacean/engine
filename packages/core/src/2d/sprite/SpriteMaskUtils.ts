import { Matrix, Ray, Vector2, Vector3 } from "@galacean/engine-math";
import { Sprite } from "./Sprite";

/**
 * Internal helpers for sprite mask rectangular hit testing.
 * @internal
 */
export class SpriteMaskUtils {
  private static _tempVec3: Vector3 = new Vector3();

  static containsRay(
    ray: Ray,
    sprite: Sprite | null,
    worldMatrix: Matrix,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean
  ): boolean {
    if (!sprite || !width || !height) {
      return false;
    }

    const e = worldMatrix.elements;
    const ux = e[0],
      uy = e[1],
      uz = e[2];
    const vx = e[4],
      vy = e[5],
      vz = e[6];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const det = nx * nx + ny * ny + nz * nz;
    if (!(det > 0)) {
      return false;
    }

    const dir = ray.direction;
    const denom = dir.x * nx + dir.y * ny + dir.z * nz;
    if (denom === 0) {
      return false;
    }

    const origin = ray.origin;
    const t = ((e[12] - origin.x) * nx + (e[13] - origin.y) * ny + (e[14] - origin.z) * nz) / denom;
    if (t < 0) {
      return false;
    }

    const hitPoint = SpriteMaskUtils._tempVec3;
    hitPoint.set(origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
    return SpriteMaskUtils._containsProjectedPoint(hitPoint, e, det, sprite, width, height, pivot, flipX, flipY);
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
    if (!sprite || !width || !height) {
      return false;
    }

    const e = worldMatrix.elements;
    const ux = e[0],
      uy = e[1],
      uz = e[2];
    const vx = e[4],
      vy = e[5],
      vz = e[6];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const det = nx * nx + ny * ny + nz * nz;
    if (!(det > 0)) {
      return false;
    }

    return SpriteMaskUtils._containsProjectedPoint(worldPoint, e, det, sprite, width, height, pivot, flipX, flipY);
  }

  private static _containsProjectedPoint(
    worldPoint: Vector3,
    e: Float32Array,
    det: number,
    sprite: Sprite,
    width: number,
    height: number,
    pivot: Vector2,
    flipX: boolean,
    flipY: boolean
  ): boolean {
    const ux = e[0],
      uy = e[1],
      uz = e[2];
    const vx = e[4],
      vy = e[5],
      vz = e[6];
    const dx = worldPoint.x - e[12];
    const dy = worldPoint.y - e[13];
    const dz = worldPoint.z - e[14];
    const a = ux * ux + uy * uy + uz * uz;
    const b = ux * vx + uy * vy + uz * vz;
    const c = vx * vx + vy * vy + vz * vz;
    const du = dx * ux + dy * uy + dz * uz;
    const dv = dx * vx + dy * vy + dz * vz;
    const localX = (c * du - b * dv) / det;
    const localY = (a * dv - b * du) / det;

    const sx = flipX ? -width : width;
    const sy = flipY ? -height : height;
    if (!sx || !sy) {
      return false;
    }

    const spriteX = localX / sx + pivot.x;
    const spriteY = localY / sy + pivot.y;
    const spritePositions = sprite._getPositions();
    const { x: left, y: bottom } = spritePositions[0];
    const { x: right, y: top } = spritePositions[3];
    return spriteX >= left && spriteX <= right && spriteY >= bottom && spriteY <= top;
  }
}
