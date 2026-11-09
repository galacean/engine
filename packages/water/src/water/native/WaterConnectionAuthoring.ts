import { compileWaterShape, type WaterShapeAuthoring } from "./WaterAuthoring";
import type { WaterBodyAsset } from "../authoring/body/WaterBodyAsset";
import { compileWaterConnections, type WaterConnectionBody } from "../compiler/connections/WaterConnectionCompiler";
import type { WaterConnectionV1 } from "../authoring/connections/WaterConnection";
import { sampleWaterTerrainHeight, type WaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";
import { sampleLakeSignedShoreDistance } from "../compiler/lake/LakeBoundaryCompiler";

export interface WaterConnectionAuthoringBody {
  readonly id: string;
  readonly shape: WaterShapeAuthoring;
  readonly terrain: WaterTerrainSnapshot;
  readonly connections: readonly {
    readonly id: string;
    readonly targetId: string;
    readonly section: WaterConnectionV1["section"];
    readonly transitionLengths: WaterConnectionV1["transitionLengths"];
  }[];
}

export function waterConnectionFacts(
  id: string,
  shape: WaterShapeAuthoring,
  asset: Readonly<WaterBodyAsset>,
  acceptedTerrain?: WaterTerrainSnapshot
): { surface: WaterConnectionBody; terrain?: WaterTerrainSnapshot } {
  const descriptor = (asset.source as { descriptor: any }).descriptor;
  if (asset.kind === "ocean") {
    const source = descriptor.config.nearshoreDescriptor,
      grid = source.grid;
    if (shape.kind !== "ocean") throw new Error("Water connection kind does not match its Source shape.");
    const [x, z] = shape.layout.centerXZ,
      half = shape.layout.size / 2;
    return {
      surface: {
        id,
        kind: "ocean",
        bounds: [x - half, z - half, x + half, z + half],
        surfaceHeight: () => descriptor.config.waterLevel
      },
      terrain: {
        id: source.id,
        revision: 0,
        origin: grid.originXZ,
        spacing: grid.cellSizeXZ[0],
        spacingZ: grid.cellSizeXZ[1],
        columns: grid.width,
        rows: grid.height,
        heights: Array.from(source.bedHeights)
      }
    };
  }
  if (asset.kind === "lake") {
    const rings = descriptor.lakeBoundary?.rings.map((ring: any[]) => ring.map((point) => point.position ?? point));
    const points = descriptor.lakeBoundary?.rings.flat();
    const source = shape.kind === "lake" ? shape.shoreline : undefined;
    if (!source?.length) throw new Error("Connected Lake requires its native shoreline authoring.");
    // Host-compiled descriptors use world coordinates; static connections require identity placement.
    const positions = points?.length
      ? points.map((point: any) => point.position ?? point)
      : source.map((point) => [point.x, point.z]);
    return {
      surface: {
        id,
        kind: "lake",
        bounds: [
          Math.min(...positions.map((p: number[]) => p[0])),
          Math.min(...positions.map((p: number[]) => p[1])),
          Math.max(...positions.map((p: number[]) => p[0])),
          Math.max(...positions.map((p: number[]) => p[1]))
        ],
        surfaceHeight: () => descriptor.lakeBoundary?.waterLevel ?? descriptor.surfaceHeights[0],
        containsSurfacePoint: rings && ((x, z) => sampleLakeSignedShoreDistance(rings, x, z) >= 0)
      },
      terrain: descriptor.bedTerrain ?? acceptedTerrain
    };
  }
  const paths: { position: number[]; width?: number }[][] = descriptor.segments.map((segment: any) => {
    if (segment.curve.mode !== "polyline")
      throw new Error("NOT_SUPPORTED: Static authored connections require a resolved River path.");
    return segment.curve.points;
  });
  const points = paths.flat(),
    width = Math.max(...points.map((point) => point.width ?? descriptor.defaults.shape.width)) / 2;
  const sample = (x: number, z: number) => {
    let distance = Infinity,
      height = NaN,
      halfWidth = 0;
    for (const path of paths)
      for (let index = 1; index < path.length; index++) {
        const a = path[index - 1].position,
          b = path[index].position,
          dx = b[0] - a[0],
          dz = b[2] - a[2];
        const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[2]) * dz) / (dx * dx + dz * dz)));
        const d = Math.hypot(x - a[0] - t * dx, z - a[2] - t * dz);
        if (d < distance) {
          distance = d;
          height = a[1] + t * (b[1] - a[1]);
          const wa = path[index - 1].width ?? descriptor.defaults.shape.width;
          const wb = path[index].width ?? descriptor.defaults.shape.width;
          halfWidth = (wa + t * (wb - wa)) / 2;
        }
      }
    return { height, distance, halfWidth };
  };
  return {
    surface: {
      id: id,
      kind: "river",
      bounds: [
        Math.min(...points.map((p) => p.position[0])) - width,
        Math.min(...points.map((p) => p.position[2])) - width,
        Math.max(...points.map((p) => p.position[0])) + width,
        Math.max(...points.map((p) => p.position[2])) + width
      ],
      surfaceHeight: (x, z) => sample(x, z).height,
      containsSurfacePoint: (x, z) => {
        const point = sample(x, z);
        return point.distance <= point.halfWidth;
      }
    },
    terrain: descriptor.terrain ?? acceptedTerrain
  };
}

/** Shared accepted-bed reconciliation for pure author graphs and native compiled descriptors. */
export function compileWaterConnectionFields(
  connections: readonly WaterConnectionV1[],
  fields: readonly { surface: WaterConnectionBody; terrain?: WaterTerrainSnapshot }[]
) {
  return compileWaterConnections(
    connections,
    fields.map((field) => field.surface),
    (x, z) => {
      const heights = fields.flatMap((field) => {
        const value = field.terrain && sampleWaterTerrainHeight(field.terrain, x, z);
        return value === undefined ? [] : [value];
      });
      if (!heights.length)
        throw new Error(
          "MISSING_DEPENDENCY: Static Water connections require accepted Terrain over their shore field."
        );
      if (heights.some((height) => Math.abs(height - heights[0]) > 1e-4))
        throw new Error("CONFLICT: Connected Water has different accepted Terrain beds.");
      return heights[0];
    }
  );
}

/** CPU-only static connection graph validation/compilation. Coordinates must already be world/identity aligned. */
export function compileWaterConnectionGraph(inputs: readonly WaterConnectionAuthoringBody[]) {
  const byId = new Map(inputs.map((input) => [input.id, input]));
  if (byId.size !== inputs.length || inputs.some((input) => !input.id.trim()))
    throw new Error("INVALID_ARGUMENT: Connected Water requires unique nonempty body IDs.");
  const connected = new Set<string>();
  const connections: WaterConnectionV1[] = [];
  for (const input of inputs) {
    if (
      input.connections.length > 4 ||
      new Set(input.connections.map((connection) => connection.id)).size !== input.connections.length
    )
      throw new Error("INVALID_ARGUMENT: Water connections require at most four unique IDs.");
    for (const connection of input.connections) {
      if (!connection.id.trim() || !byId.has(connection.targetId) || input.id === connection.targetId)
        throw new Error("INVALID_ARGUMENT: Water connection requires a distinct graph target and nonempty ID.");
      connected.add(input.id);
      connected.add(connection.targetId);
      connections.push({
        id: `${input.id}:${connection.id}`,
        bodies: [input.id, connection.targetId],
        section: connection.section,
        transitionLengths: connection.transitionLengths
      });
    }
  }
  const fields = [...connected].sort().map((id) => {
    const input = byId.get(id)!;
    return waterConnectionFacts(id, input.shape, compileWaterShape(input.shape, input.terrain, id), input.terrain);
  });
  return compileWaterConnectionFields(connections, fields);
}
