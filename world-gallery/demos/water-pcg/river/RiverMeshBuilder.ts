/** River mesh data generation, GPU upload, and in-place mesh reuse. */
import { Engine, MeshTopology, ModelMesh } from "@galacean/engine-core";
import { Color, Vector2, Vector3 } from "@galacean/engine-math";
import { RIVER_MESH_OFFSET, RiverQualityLevel } from "./constants";
import { RiverMeshBuildResult, RiverMeshData, RiverQueryData, RiverSamplePoint } from "./types";

interface RiverMeshBuildOptions {
  materialLevel: RiverQualityLevel;
  existing?: RiverMeshBuildResult;
  releaseCpuData?: boolean;
  capacitySegmentCount?: number;
}

function toIndexArray(vertexCount: number, values: number[]): Uint16Array | Uint32Array {
  return vertexCount > 65535 ? new Uint32Array(values) : new Uint16Array(values);
}

function uploadMeshData(
  mesh: ModelMesh,
  data: RiverMeshData,
  topology: MeshTopology,
  colors?: Color[],
  releaseCpuData = false
): ModelMesh {
  const indices = toIndexArray(data.positions.length, data.indices);
  updateMeshBounds(mesh, data.positions);
  mesh.setPositions(data.positions);
  mesh.setUVs(data.uvs);
  mesh.setColors(colors ?? null);
  mesh.setIndices(indices);
  mesh.clearSubMesh();
  mesh.addSubMesh(0, data.drawIndexCount ?? indices.length, topology);
  mesh.uploadData(releaseCpuData);
  return mesh;
}

function createOrUpdateModelMesh(
  engine: Engine,
  data: RiverMeshData,
  topology: MeshTopology = MeshTopology.Triangles,
  colors?: Color[],
  existing?: ModelMesh,
  releaseCpuData = false
): ModelMesh {
  return uploadMeshData(existing ?? new ModelMesh(engine), data, topology, colors, releaseCpuData);
}

export function updateMeshBounds(mesh: ModelMesh, positions: Vector3[]): void {
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

function getNormal(tangent: Vector3): Vector3 {
  return new Vector3(-tangent.z, 0, tangent.x);
}

function createHighRibbonData(
  samples: RiverSamplePoint[],
  getWidthOffset: (sample: RiverSamplePoint) => number,
  yOffset: number,
  capacitySegmentCount?: number
): RiverMeshData {
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  const sampleCapacity = Math.max(samples.length, (capacitySegmentCount ?? samples.length - 1) + 1);
  for (let sampleIndex = 0; sampleIndex < sampleCapacity; sampleIndex++) {
    const sample = samples[Math.min(sampleIndex, samples.length - 1)];
    const normal = getNormal(sample.tangent);
    const halfWidth = sample.width * 0.5 + getWidthOffset(sample);
    const y = sample.position.y + yOffset;
    positions.push(
      new Vector3(sample.position.x + normal.x * halfWidth, y, sample.position.z + normal.z * halfWidth),
      new Vector3(sample.position.x - normal.x * halfWidth, y, sample.position.z - normal.z * halfWidth)
    );
    uvs.push(new Vector2(0, sample.distance * 0.08), new Vector2(1, sample.distance * 0.08));
  }
  for (let i = 0; i < sampleCapacity - 1; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return { positions, uvs, indices, drawIndexCount: Math.max(0, samples.length - 1) * 6 };
}

/** Low uses four cross-river vertices so surface, bank foam, and feather share one pass. */
export function createLowRiverMeshData(samples: RiverSamplePoint[], capacitySegmentCount?: number): RiverMeshData {
  const positions: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  const sampleCapacity = Math.max(samples.length, (capacitySegmentCount ?? samples.length - 1) + 1);
  for (let sampleIndex = 0; sampleIndex < sampleCapacity; sampleIndex++) {
    const sample = samples[Math.min(sampleIndex, samples.length - 1)];
    const normal = getNormal(sample.tangent);
    const halfWidth = sample.width * 0.5;
    const outerWidth = halfWidth + sample.bankFeather;
    const y = sample.position.y + RIVER_MESH_OFFSET.surface;
    const widths = [outerWidth, halfWidth, -halfWidth, -outerWidth];
    const across = [0, 0.25, 0.75, 1];
    for (let i = 0; i < widths.length; i++) {
      positions.push(
        new Vector3(sample.position.x + normal.x * widths[i], y, sample.position.z + normal.z * widths[i])
      );
      uvs.push(new Vector2(across[i], sample.distance * 0.08));
    }
  }
  for (let i = 0; i < sampleCapacity - 1; i++) {
    const row = i * 4;
    const next = row + 4;
    for (let strip = 0; strip < 3; strip++) {
      const a = row + strip;
      const b = a + 1;
      const c = next + strip;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return { positions, uvs, indices, drawIndexCount: Math.max(0, samples.length - 1) * 18 };
}

export function createRiverQueryData(samples: RiverSamplePoint[]): RiverQueryData {
  const stride = 9;
  const data = new Float32Array(samples.length * stride);
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    const offset = i * stride;
    data[offset] = sample.position.x;
    data[offset + 1] = sample.position.y;
    data[offset + 2] = sample.position.z;
    data[offset + 3] = sample.distance;
    data[offset + 4] = sample.width;
    data[offset + 5] = sample.depth;
    data[offset + 6] = sample.flowSpeed;
    data[offset + 7] = sample.tangent.x;
    data[offset + 8] = sample.tangent.z;
  }
  return { samples: data, stride };
}

export function buildRiverMeshes(
  engine: Engine,
  samples: RiverSamplePoint[],
  options: RiverMeshBuildOptions
): RiverMeshBuildResult {
  if (options.materialLevel === RiverQualityLevel.Low) {
    return {
      surfaceMesh: createOrUpdateModelMesh(
        engine,
        createLowRiverMeshData(samples, options.capacitySegmentCount),
        MeshTopology.Triangles,
        undefined,
        options.existing?.surfaceMesh,
        options.releaseCpuData
      )
    };
  }
  return {
    surfaceMesh: createOrUpdateModelMesh(
      engine,
      createHighRibbonData(samples, () => 0, RIVER_MESH_OFFSET.surface, options.capacitySegmentCount),
      MeshTopology.Triangles,
      undefined,
      options.existing?.surfaceMesh,
      options.releaseCpuData
    ),
    bankFoamMesh: createOrUpdateModelMesh(
      engine,
      createHighRibbonData(
        samples,
        (sample) => sample.bankFeather,
        RIVER_MESH_OFFSET.bankFoam,
        options.capacitySegmentCount
      ),
      MeshTopology.Triangles,
      undefined,
      options.existing?.bankFoamMesh,
      options.releaseCpuData
    )
  };
}

function createLineData(points: Vector3[], segmented: boolean): RiverMeshData {
  const uvs = points.map(() => new Vector2(0, 0));
  const indices: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    if (!segmented || i % 2 === 0) indices.push(i, i + 1);
  }
  return { positions: points, uvs, indices };
}

export function buildLineMesh(engine: Engine, points: Vector3[], color: Color, existing?: ModelMesh): ModelMesh {
  return createOrUpdateModelMesh(
    engine,
    createLineData(points, false),
    MeshTopology.Lines,
    points.map(() => color),
    existing
  );
}

export function buildLineSegmentsMesh(
  engine: Engine,
  points: Vector3[],
  color: Color,
  existing?: ModelMesh
): ModelMesh {
  return createOrUpdateModelMesh(
    engine,
    createLineData(points, true),
    MeshTopology.Lines,
    points.map(() => color),
    existing
  );
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
  return buildLineSegmentsMesh(engine, points, color, existing);
}
