import { Camera, Entity, Vector3 } from "@galacean/engine";

/** Camera projection for one fixed or LOD-controlled authored renderer hierarchy. */
export class TerrainScreenRelativeHeightRuntime {
  private readonly _localReferencePoint: Vector3;
  private readonly _worldReferencePoint = new Vector3();
  private readonly _cachedMatrix = new Float64Array(12);
  private _matrixCached = false;
  private _cachedWorldSize = 0;
  private _cachedFov = NaN;
  private _cachedTwoTanHalfFov = 1;

  constructor(
    private readonly _root: Entity,
    private readonly _camera: Camera,
    localReferencePoint: readonly [x: number, y: number, z: number],
    private readonly _size: number
  ) {
    this._localReferencePoint = new Vector3(...localReferencePoint);
  }

  /** @returns Projected authored reference size divided by the camera's screen height. */
  resolve(): number {
    const worldMatrix = this._root.transform.worldMatrix;
    const e = worldMatrix.elements;
    const c = this._cachedMatrix;
    if (
      !this._matrixCached ||
      c[0] !== e[0] ||
      c[1] !== e[1] ||
      c[2] !== e[2] ||
      c[3] !== e[4] ||
      c[4] !== e[5] ||
      c[5] !== e[6] ||
      c[6] !== e[8] ||
      c[7] !== e[9] ||
      c[8] !== e[10] ||
      c[9] !== e[12] ||
      c[10] !== e[13] ||
      c[11] !== e[14]
    ) {
      c[0] = e[0];
      c[1] = e[1];
      c[2] = e[2];
      c[3] = e[4];
      c[4] = e[5];
      c[5] = e[6];
      c[6] = e[8];
      c[7] = e[9];
      c[8] = e[10];
      c[9] = e[12];
      c[10] = e[13];
      c[11] = e[14];
      this._matrixCached = true;
      Vector3.transformCoordinate(this._localReferencePoint, worldMatrix, this._worldReferencePoint);
      const sxSq = e[0] * e[0] + e[1] * e[1] + e[2] * e[2];
      const sySq = e[4] * e[4] + e[5] * e[5] + e[6] * e[6];
      const szSq = e[8] * e[8] + e[9] * e[9] + e[10] * e[10];
      this._cachedWorldSize = this._size * Math.sqrt(Math.max(sxSq, sySq, szSq));
    }

    const worldSize = this._cachedWorldSize;
    if (this._camera.isOrthographic) return worldSize / (2 * this._camera.orthographicSize);

    const camPos = this._camera.entity.transform.worldPosition;
    const dx = this._worldReferencePoint.x - camPos.x;
    const dy = this._worldReferencePoint.y - camPos.y;
    const dz = this._worldReferencePoint.z - camPos.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq <= Number.EPSILON * Number.EPSILON) return Number.MAX_SAFE_INTEGER;
    const fov = this._camera.fieldOfView;
    if (fov !== this._cachedFov) {
      this._cachedFov = fov;
      this._cachedTwoTanHalfFov = 2 * Math.tan((fov * Math.PI) / 360);
    }
    return worldSize / (Math.sqrt(distSq) * this._cachedTwoTanHalfFov);
  }
}
