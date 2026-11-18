import { Camera, Entity, Vector3 } from "@galacean/engine";

/** Camera projection for one fixed or LOD-controlled authored renderer hierarchy. */
export class TerrainScreenRelativeHeightRuntime {
  private readonly _localReferencePoint: Vector3;
  private readonly _worldReferencePoint = new Vector3();
  private readonly _cameraOffset = new Vector3();

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
    Vector3.transformCoordinate(this._localReferencePoint, this._root.transform.worldMatrix, this._worldReferencePoint);
    const scale = this._root.transform.lossyWorldScale;
    const worldSize = this._size * Math.max(Math.abs(scale.x), Math.abs(scale.y), Math.abs(scale.z));
    if (this._camera.isOrthographic) return worldSize / (2 * this._camera.orthographicSize);

    Vector3.subtract(this._worldReferencePoint, this._camera.entity.transform.worldPosition, this._cameraOffset);
    const distance = this._cameraOffset.length();
    if (distance <= Number.EPSILON) return Number.MAX_SAFE_INTEGER;
    const halfVerticalFovRadians = (this._camera.fieldOfView * Math.PI) / 360;
    return worldSize / (2 * distance * Math.tan(halfVerticalFovRadians));
  }
}
