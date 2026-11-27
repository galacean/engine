import { BoundingBox, Entity, Matrix, Vector3 } from "@galacean/engine";
import { FARM_ITEM_DIMENSIONS } from "../domain/FarmItemDimensions";
import type { FarmItemType } from "../domain/FarmItems";
import type { FarmItemMeshBounds } from "./FarmItemGroundPose";

/** Normalize once in physical metres; carry, drop and work motion only change rigid transforms. */
export function calibrateFarmItemModel(model: Entity, type: FarmItemType, meshes: readonly FarmItemMeshBounds[]): void {
  const reference = FARM_ITEM_DIMENSIONS[type];
  const physical = new BoundingBox(
    new Vector3(Infinity, Infinity, Infinity),
    new Vector3(-Infinity, -Infinity, -Infinity)
  );
  for (const mesh of meshes)
    if (mesh.entity.name === reference.node) BoundingBox.merge(physical, mesh.bounds, physical);
  const length = physical.max[reference.axis] - physical.min[reference.axis];
  if (!Number.isFinite(length) || length <= 0) throw new Error(`Missing physical mesh for ${type}`);
  if (type === "harvest-basket") model.transform.setRotation(-35, 0, 0);
  const bounds = new BoundingBox(
    new Vector3(Infinity, Infinity, Infinity),
    new Vector3(-Infinity, -Infinity, -Infinity)
  );
  const inverse = new Matrix(),
    matrix = new Matrix(),
    point = new Vector3();
  Matrix.invert(model.parent!.transform.worldMatrix, inverse);
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
  // Tight bounds measured from all Basket_LOD0 vertices after undoing its baked +35° X tilt.
  // Rotating its original AABB instead would leave a visible gap under the actual bottom.
  if (type === "harvest-basket") {
    bounds.min.set(-0.2365292758, -0.0000000132, -0.1705654529);
    bounds.max.set(0.2365290076, 0.4440050117, 0.1705653725);
  }
  const scale = reference.metres / length;
  model.transform.setScale(scale, scale, scale);
  model.transform.setPosition(
    -(bounds.min.x + bounds.max.x) * 0.5 * scale,
    -bounds.min.y * scale,
    -(bounds.min.z + bounds.max.z) * 0.5 * scale
  );
}
