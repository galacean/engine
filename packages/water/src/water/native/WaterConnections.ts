import type { WaterBodyComponent, WaterBodyConfiguration } from "./WaterBodyComponent";
import { WaterBodyResource } from "./WaterResources";
import { compileWaterConnections, type WaterConnectionBody } from "../compiler/connections/WaterConnectionCompiler";
import type { WaterConnectionPort, WaterConnectionV1 } from "../authoring/connections/WaterConnection";
import { sampleWaterTerrainHeight, type WaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";
import { hashStableValue } from "../compiler/shared/determinism";
import { createWaterBodyAsset } from "../authoring/body/WaterBodyAsset";

/** A connection has one author, and refers to the other component through the native Source codec. */
export interface WaterBodyConnection {
  readonly id: string;
  readonly target: WaterBodyComponent;
  readonly section: WaterConnectionV1["section"];
  readonly transitionLengths: WaterConnectionV1["transitionLengths"];
}

interface Input {
  body: WaterBodyComponent;
  configuration: Readonly<WaterBodyConfiguration>;
}
const baseContent = new WeakMap<WaterBodyResource, string>();
const connectionCache = new WeakMap<
  WaterBodyComponent,
  { key: string; ports: Readonly<Record<string, readonly WaterConnectionPort[]>> }
>();
function facts({ body, configuration }: Input): { surface: WaterConnectionBody; terrain?: WaterTerrainSnapshot } {
  const asset = configuration.asset.data,
    descriptor = (asset.source as { descriptor: any }).descriptor;
  const shape = body.authoring!.shape;
  if (asset.kind === "ocean") {
    const source = descriptor.config.nearshoreDescriptor,
      grid = source.grid;
    if (shape.kind !== "ocean") throw new Error("Water connection kind does not match its Source shape.");
    const [x, z] = shape.layout.centerXZ,
      half = shape.layout.size / 2;
    return {
      surface: {
        id: body.waterId,
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
    const points = descriptor.lakeBoundary?.rings.flat();
    const source = shape.kind === "lake" ? shape.shoreline : undefined;
    if (!source?.length) throw new Error("Connected Lake requires its native shoreline authoring.");
    // Host-compiled descriptors use world coordinates; static connections require identity placement.
    const positions = points?.length
      ? points.map((point: any) => point.position ?? point)
      : source.map((point) => [point.x, point.z]);
    return {
      surface: {
        id: body.waterId,
        kind: "lake",
        bounds: [
          Math.min(...positions.map((p: number[]) => p[0])),
          Math.min(...positions.map((p: number[]) => p[1])),
          Math.max(...positions.map((p: number[]) => p[0])),
          Math.max(...positions.map((p: number[]) => p[1]))
        ],
        surfaceHeight: () => descriptor.lakeBoundary?.waterLevel ?? descriptor.surfaceHeights[0]
      },
      terrain: descriptor.bedTerrain ?? body.authoring?.terrain?.data
    };
  }
  const paths: { position: number[]; width?: number }[][] = descriptor.segments.map((segment: any) => {
    if (segment.curve.mode !== "polyline")
      throw new Error("NOT_SUPPORTED: Static authored connections require a resolved River path.");
    return segment.curve.points;
  });
  const points = paths.flat(),
    width = Math.max(...points.map((point) => point.width ?? descriptor.defaults.shape.width)) / 2;
  return {
    surface: {
      id: body.waterId,
      kind: "river",
      bounds: [
        Math.min(...points.map((p) => p.position[0])) - width,
        Math.min(...points.map((p) => p.position[2])) - width,
        Math.max(...points.map((p) => p.position[0])) + width,
        Math.max(...points.map((p) => p.position[2])) + width
      ],
      surfaceHeight: (x, z) => {
        let distance = Infinity,
          height = NaN;
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
            }
          }
        return height;
      }
    },
    terrain: descriptor.terrain ?? body.authoring?.terrain?.data
  };
}

/** Reconcile the entire affected static group against accepted beds before one native publication. */
export function compileNativeWaterConnections(inputs: readonly Input[]): Input[] {
  const byBody = new Map(inputs.map((input) => [input.body, input]));
  const connections: WaterConnectionV1[] = [],
    connected = new Set<WaterBodyComponent>();
  for (const { body } of inputs) {
    if (!body.enabled || !body.entity.isActiveInHierarchy) continue;
    for (const connection of body.authoring?.connections ?? []) {
      const target = connection.target;
      if (!byBody.has(target))
        throw new Error(
          `MISSING_DEPENDENCY: Water '${body.waterId}' connection '${connection.id}' has no Source target.`
        );
      if (!target.enabled || !target.entity.isActiveInHierarchy) continue;
      for (const member of [body, target]) {
        const t = member.entity.transform,
          p = t.worldPosition,
          q = t.worldRotationQuaternion,
          s = t.lossyWorldScale;
        if ([p.x, p.y, p.z, q.x, q.y, q.z, q.w - 1, s.x - 1, s.y - 1, s.z - 1].some((value) => Math.abs(value) > 1e-6))
          throw new Error(`NOT_SUPPORTED: Connected Water '${member.waterId}' requires identity world placement.`);
        connected.add(member);
      }
      connections.push({
        id: `${body.waterId}:${connection.id}`,
        bodies: [body.waterId, target.waterId],
        section: connection.section,
        transitionLengths: connection.transitionLengths
      });
    }
  }
  const group = [...connected].sort((a, b) => a.waterId.localeCompare(b.waterId));
  const key = hashStableValue([
    connections,
    group.map((body) => {
      const asset = byBody.get(body)!.configuration.asset;
      return [body.waterId, baseContent.get(asset) ?? asset.contentHash];
    })
  ]);
  let ports: Readonly<Record<string, readonly WaterConnectionPort[]>> = {};
  const cached = group.length && connectionCache.get(group[0]);
  if (cached && cached.key === key) ports = cached.ports;
  else if (connections.length) {
    const fields = group.map((body) => facts(byBody.get(body)!));
    ports = compileWaterConnections(
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
    ).byBody;
    connectionCache.set(group[0], { key, ports });
  }
  return inputs.flatMap(({ body, configuration }) => {
    const asset = configuration.asset.data,
      source = asset.source as { descriptor: Record<string, unknown> };
    const next: readonly WaterConnectionPort[] | undefined = ports[body.waterId];
    if (hashStableValue(source.descriptor.connections ?? []) === hashStableValue(next ?? [])) return [];
    const { connections: _old, ...descriptor } = source.descriptor;
    const connectedSource = {
      ...source,
      descriptor: { ...descriptor, ...(next?.length ? { connections: next } : {}) }
    };
    const resource = new WaterBodyResource(
      body.engine,
      createWaterBodyAsset({ ...asset, source: connectedSource, sourceHash: hashStableValue(connectedSource) })
    );
    baseContent.set(resource, baseContent.get(configuration.asset) ?? configuration.asset.contentHash);
    body._ownCompiledAsset(resource);
    return [{ body, configuration: { ...configuration, asset: resource } }];
  });
}
