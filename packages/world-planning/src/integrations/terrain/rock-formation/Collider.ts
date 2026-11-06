import { MeshColliderShape, ModelMesh, StaticCollider, Vector3, type Engine, type Entity } from "@galacean/engine";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import { rockObbId } from "./Authoring.ts";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";

/** Rendered triangles excluded by an authored collision flag remain visible. */
export function disabledRockCollisionOwners(plan: IslandPlan): ReadonlySet<string> {
  const disabled = new Set<string>();
  for (const rock of plan.rocks)
    for (const box of rock.boxes ?? []) if (box.collision === false) disabled.add(rockObbId(rock.id, box.id));
  return disabled;
}

/** Lab traversal's indexed, non-convex mesh input, with degenerate triangles removed before cooking. */
export function rockCollisionIndices(formation: RockFormationMesh, disabled: ReadonlySet<string>): Uint32Array {
  const { positions, indices } = formation.mesh;
  if (positions.length % 3 || indices.length % 3 || formation.owners.length !== indices.length / 3)
    throw Error("Invalid rock collision mesh arrays");
  if (!positions.every(Number.isFinite)) throw Error("Non-finite rock collision vertex");
  const selected: number[] = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    if (a + 2 >= positions.length || b + 2 >= positions.length || c + 2 >= positions.length)
      throw Error("Invalid rock collision triangle index");
    if (disabled.has(formation.owners[i / 3])) continue;
    const abX = positions[b] - positions[a],
      abY = positions[b + 1] - positions[a + 1],
      abZ = positions[b + 2] - positions[a + 2];
    const acX = positions[c] - positions[a],
      acY = positions[c + 1] - positions[a + 1],
      acZ = positions[c + 2] - positions[a + 2];
    const x = abY * acZ - abZ * acY,
      y = abZ * acX - abX * acZ,
      z = abX * acY - abY * acX;
    if (x * x + y * y + z * z > 1e-12) selected.push(indices[i], indices[i + 1], indices[i + 2]);
  }
  return selected.length === indices.length ? indices : new Uint32Array(selected);
}

/** Collider and render surface share the formation entity, local positions, indices and placement. */
export function createRockCollider(
  engine: Engine,
  entity: Entity,
  formation: RockFormationMesh,
  disabled: ReadonlySet<string>
) {
  const indices = rockCollisionIndices(formation, disabled);
  if (!indices.length) return undefined;
  const mesh = new ModelMesh(engine, `Rock collision · ${formation.id}`);
  let collider: StaticCollider | undefined;
  try {
    const positions: Vector3[] = [];
    for (let i = 0; i < formation.mesh.positions.length; i += 3)
      positions.push(
        new Vector3(formation.mesh.positions[i], formation.mesh.positions[i + 1], formation.mesh.positions[i + 2])
      );
    mesh.setPositions(positions);
    mesh.setIndices(indices);
    // PhysX extracts readable CPU arrays. A second GPU upload is unnecessary for a collision-only mesh.
    collider = entity.addComponent(StaticCollider);
    const shape = new (MeshColliderShape as unknown as { new (): MeshColliderShape })();
    collider.addShape(shape);
    shape.isConvex = false;
    shape.material.staticFriction = 0.15;
    shape.material.dynamicFriction = 0.05;
    shape.mesh = mesh;
    return {
      triangles: indices.length / 3,
      dispose() {
        collider!.destroy();
        mesh.destroy();
      }
    };
  } catch (error) {
    collider?.destroy();
    mesh.destroy();
    throw error;
  }
}
