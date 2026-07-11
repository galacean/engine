/** Debug-only line and flow-arrow meshes. Formal runtime code does not depend on this module. */
import { Engine, MeshTopology, ModelMesh } from "@galacean/engine-core";
import { Color, Vector2, Vector3 } from "@galacean/engine-math";
import type { RiverSamplePoint } from "../../compiler/river/types";
import { RIVER_DEBUG_OFFSET } from "./constants";

function updateMeshBounds(mesh: ModelMesh, positions: readonly Vector3[]): void {
  const boundsPadding = 3;
  const { min, max } = mesh.bounds;
  if (positions.length === 0) {
    min.set(0, 0, 0);
    max.set(0, 0, 0);
    return;
  }
  min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  for (const position of positions) {
    min.x = Math.min(min.x, position.x);
    min.y = Math.min(min.y, position.y - boundsPadding);
    min.z = Math.min(min.z, position.z);
    max.x = Math.max(max.x, position.x);
    max.y = Math.max(max.y, position.y + boundsPadding);
    max.z = Math.max(max.z, position.z);
  }
}

function createLineMesh(
  engine: Engine,
  points: Vector3[],
  color: Color,
  segmented: boolean,
  existing?: ModelMesh
): ModelMesh {
  const mesh = existing ?? new ModelMesh(engine);
  const indices: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (!segmented || i % 2 === 0) indices.push(i, i + 1);
  }
  updateMeshBounds(mesh, points);
  mesh.setPositions(points);
  mesh.setUVs(points.map(() => new Vector2(0, 0)));
  mesh.setUVs(null, 1);
  mesh.setColors(points.map(() => color));
  mesh.setIndices(points.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices));
  mesh.clearSubMesh();
  mesh.addSubMesh(0, indices.length, MeshTopology.Lines);
  mesh.uploadData(false);
  return mesh;
}

export function buildLineMesh(engine: Engine, points: Vector3[], color: Color, existing?: ModelMesh): ModelMesh {
  return createLineMesh(engine, points, color, false, existing);
}

export function buildLineSegmentsMesh(
  engine: Engine,
  points: Vector3[],
  color: Color,
  existing?: ModelMesh
): ModelMesh {
  return createLineMesh(engine, points, color, true, existing);
}

export function buildFlowArrowMesh(
  engine: Engine,
  samples: RiverSamplePoint[],
  spacing: number,
  scale: number,
  color: Color,
  existing?: ModelMesh
): ModelMesh {
  const points: Vector3[] = [];
  let nextDistance = spacing;
  for (const sample of samples) {
    if (sample.distance < nextDistance) continue;
    const tangent = sample.tangent;
    const normal = new Vector3(-tangent.z, 0, tangent.x);
    const start = new Vector3(sample.position.x, sample.position.y + RIVER_DEBUG_OFFSET, sample.position.z);
    const end = new Vector3(
      sample.position.x + tangent.x * scale,
      sample.position.y + RIVER_DEBUG_OFFSET,
      sample.position.z + tangent.z * scale
    );
    points.push(
      start,
      end,
      end,
      new Vector3(
        end.x - tangent.x * scale * 0.35 + normal.x * scale * 0.16,
        end.y,
        end.z - tangent.z * scale * 0.35 + normal.z * scale * 0.16
      ),
      end,
      new Vector3(
        end.x - tangent.x * scale * 0.35 - normal.x * scale * 0.16,
        end.y,
        end.z - tangent.z * scale * 0.35 - normal.z * scale * 0.16
      )
    );
    nextDistance += spacing;
  }
  return buildLineSegmentsMesh(engine, points, color, existing);
}
