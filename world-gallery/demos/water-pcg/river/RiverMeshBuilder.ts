/**
 * River mesh construction utilities.
 *
 * This file turns sampled river centerline data into Galacean ModelMesh instances:
 * the visible water surface, the wider bank-foam transition strip, and line meshes
 * used by debug visualization. It is intentionally geometry-focused and does not
 * know about GUI state or shader styling. That separation keeps the water-system
 * mesh contract reusable for preview demos, editor tooling, runtime rendering, and
 * future engine package migration.
 */
import { Color, Engine, MeshTopology, ModelMesh, Vector2, Vector3 } from "@galacean/engine";
import { RIVER_MESH_OFFSET } from "./constants";
import { RiverMeshBuildResult, RiverSamplePoint } from "./types";

function createModelMesh(
  engine: Engine,
  positions: Vector3[],
  uvs: Vector2[],
  indexValues: number[],
  topology: MeshTopology = MeshTopology.Triangles,
  colors?: Color[]
): ModelMesh {
  const mesh = new ModelMesh(engine);
  const indices = positions.length > 65535 ? new Uint32Array(indexValues) : new Uint16Array(indexValues);
  updateMeshBounds(mesh, positions);
  mesh.setPositions(positions);
  mesh.setUVs(uvs);
  if (colors) {
    mesh.setColors(colors);
  }
  mesh.setIndices(indices);
  mesh.uploadData(false);
  mesh.addSubMesh(0, indices.length, topology);
  return mesh;
}

export function updateMeshBounds(mesh: ModelMesh, positions: Vector3[]): void {
  const boundsPadding = 3;
  const { min, max } = mesh.bounds;
  min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);

  for (let i = 0; i < positions.length; i++) {
    const position = positions[i];
    min.x = Math.min(min.x, position.x);
    min.y = Math.min(min.y, position.y - boundsPadding);
    min.z = Math.min(min.z, position.z);
    max.x = Math.max(max.x, position.x);
    max.y = Math.max(max.y, position.y + boundsPadding);
    max.z = Math.max(max.z, position.z);
  }
}

function getNormal(tangent: Vector3): Vector3 {
  return new Vector3(-tangent.z, 0, tangent.x);
}

function createRibbonMesh(
  engine: Engine,
  samples: RiverSamplePoint[],
  getWidthOffset: (sample: RiverSamplePoint) => number,
  yOffset: number
): ModelMesh {
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  const totalLength = Math.max(samples[samples.length - 1]?.distance ?? 1, 1);

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const normal = getNormal(sample.tangent);
    const halfWidth = sample.width * 0.5 + getWidthOffset(sample);
    const distanceV = sample.distance / totalLength;
    const y = sample.position.y + yOffset;

    positions.push(
      new Vector3(sample.position.x + normal.x * halfWidth, y, sample.position.z + normal.z * halfWidth),
      new Vector3(sample.position.x - normal.x * halfWidth, y, sample.position.z - normal.z * halfWidth)
    );
    uvs.push(new Vector2(0, distanceV * totalLength * 0.08), new Vector2(1, distanceV * totalLength * 0.08));
  }

  for (let i = 0; i < samples.length - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  return createModelMesh(engine, positions, uvs, indices);
}

export function buildRiverMeshes(engine: Engine, samples: RiverSamplePoint[]): RiverMeshBuildResult {
  return {
    surfaceMesh: createRibbonMesh(engine, samples, () => 0, RIVER_MESH_OFFSET.surface),
    bankFoamMesh: createRibbonMesh(engine, samples, (sample) => sample.bankFeather, RIVER_MESH_OFFSET.bankFoam)
  };
}

export function buildLineMesh(engine: Engine, points: Vector3[], color: Color): ModelMesh {
  const uvs: Vector2[] = [];
  const colors: Color[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    uvs.push(new Vector2(0, 0));
    colors.push(color);
    if (i < points.length - 1) {
      indices.push(i, i + 1);
    }
  }

  return createModelMesh(engine, points, uvs, indices, MeshTopology.Lines, colors);
}

export function buildLineSegmentsMesh(engine: Engine, points: Vector3[], color: Color): ModelMesh {
  const uvs: Vector2[] = [];
  const colors: Color[] = [];
  const indices: number[] = [];

  for (let i = 0; i < points.length; i++) {
    uvs.push(new Vector2(0, 0));
    colors.push(color);
    if (i % 2 === 0 && i + 1 < points.length) {
      indices.push(i, i + 1);
    }
  }

  return createModelMesh(engine, points, uvs, indices, MeshTopology.Lines, colors);
}

export function buildFlowArrowMesh(
  engine: Engine,
  samples: RiverSamplePoint[],
  spacing: number,
  scale: number,
  color: Color
): ModelMesh {
  const points: Vector3[] = [];
  let nextDistance = spacing;

  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample.distance < nextDistance) {
      continue;
    }
    const start = new Vector3(sample.position.x, sample.position.y + RIVER_MESH_OFFSET.debug, sample.position.z);
    const end = new Vector3(
      sample.position.x + sample.tangent.x * scale,
      sample.position.y + RIVER_MESH_OFFSET.debug,
      sample.position.z + sample.tangent.z * scale
    );
    const normal = getNormal(sample.tangent);
    points.push(
      start,
      end,
      end,
      new Vector3(
        end.x - sample.tangent.x * scale * 0.35 + normal.x * scale * 0.16,
        end.y,
        end.z - sample.tangent.z * scale * 0.35 + normal.z * scale * 0.16
      ),
      end,
      new Vector3(
        end.x - sample.tangent.x * scale * 0.35 - normal.x * scale * 0.16,
        end.y,
        end.z - sample.tangent.z * scale * 0.35 - normal.z * scale * 0.16
      )
    );
    nextDistance += spacing;
  }

  return buildLineSegmentsMesh(engine, points, color);
}
