import { BoundingBox, Entity, Matrix, Quaternion, Vector3 } from "@galacean/engine";

export interface FarmItemMeshBounds {
  readonly entity: Entity;
  readonly bounds: BoundingBox;
}

/** Ground-only wrapper pose. The imported rest pose and the accepted carry/work clips stay intact. */
export class FarmItemGroundPose {
  private readonly offset = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly identity = new Quaternion();
  private readonly blended = new Quaternion();

  constructor(
    private readonly holder: Entity,
    shaft: Entity,
    meshes: readonly FarmItemMeshBounds[]
  ) {
    const original = holder.transform.localMatrix.clone();
    const inverse = new Matrix(),
      relative = new Matrix();
    const position = new Vector3(),
      scale = new Vector3(),
      authored = new Quaternion();
    Matrix.invert(holder.transform.worldMatrix, inverse);
    Matrix.multiply(inverse, shaft.transform.worldMatrix, relative);
    relative.decompose(position, authored, scale);
    Quaternion.invert(authored, authored);
    Quaternion.rotationAxisAngle(new Vector3(0, 1, 0), Math.PI / 2, this.rotation);
    Quaternion.multiply(this.rotation, authored, this.rotation);
    try {
      holder.transform.rotationQuaternion = this.rotation;
      const grounded = this.bounds(meshes);
      this.offset.set(-(grounded.min.x + grounded.max.x) / 2, -grounded.min.y, -(grounded.min.z + grounded.max.z) / 2);
    } finally {
      holder.transform.localMatrix = original;
    }
  }

  private bounds(meshes: readonly FarmItemMeshBounds[]): BoundingBox {
    const inverse = new Matrix(),
      matrix = new Matrix(),
      point = new Vector3();
    Matrix.invert(this.holder.parent!.transform.worldMatrix, inverse);
    const bounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    for (const mesh of meshes) {
      Matrix.multiply(inverse, mesh.entity.transform.worldMatrix, matrix);
      for (const x of [mesh.bounds.min.x, mesh.bounds.max.x])
        for (const y of [mesh.bounds.min.y, mesh.bounds.max.y])
          for (const z of [mesh.bounds.min.z, mesh.bounds.max.z]) {
            point.set(x, y, z).transformCoordinate(matrix);
            Vector3.min(bounds.min, point, bounds.min);
            Vector3.max(bounds.max, point, bounds.max);
          }
    }
    if (!Number.isFinite(bounds.min.y)) throw new Error("Missing ground-pose mesh bounds");
    return bounds;
  }

  apply(weight: number): void {
    const t = Math.max(0, Math.min(1, weight));
    Quaternion.slerp(this.identity, this.rotation, t, this.blended);
    this.holder.transform.rotationQuaternion = this.blended;
    this.holder.transform.setScale(1, 1, 1);
    this.holder.transform.setPosition(this.offset.x * t, this.offset.y * t, this.offset.z * t);
  }
}
