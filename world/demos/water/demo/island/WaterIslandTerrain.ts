import { Vector3 } from "@galacean/engine-math";
import {
  resolveRiverRibbonJoinFrames,
  sampleLakeBoundary,
  sampleLakeSignedShoreDistance,
  hashStableValue,
  compileWaterConnections
} from "@galacean/engine-water/water/compiler/index";
import {
  sampleWaterConnection,
  type WaterConnectionPort,
  captureWaterTerrainSnapshot,
  sampleWaterTerrainHeight,
  type WaterTerrainSnapshot
} from "@galacean/engine-water/water/index";

import { WATER_ISLAND_PRESET, type IslandRiver } from "./WaterIslandPreset.ts";

export const islandLakeRings = WATER_ISLAND_PRESET.lakes.map((lake) => sampleLakeBoundary(lake.boundary).rings);
// Use the native ribbon's mitered sides and flat end sections for Ocean ownership.
// Centerline distance has round caps and misses the outer edge of bends.
export const islandRiverRings = WATER_ISLAND_PRESET.rivers.map((river) => {
  const samples = river.points.map((p, i) => {
    const a = river.points[Math.max(0, i - 1)].position,
      b = river.points[Math.min(river.points.length - 1, i + 1)].position;
    return {
      position: new Vector3(...p.position),
      tangent: new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize()
    };
  });
  const frames = resolveRiverRibbonJoinFrames(samples);
  const side = (sign: number) =>
    river.points.map((p, i) => {
      const f = frames[i],
        radius = p.width! * 0.5 * sign * f.widthScale;
      return [p.position[0] + f.normalX * radius, p.position[2] + f.normalZ * radius] as const;
    });
  return [[...side(1), ...side(-1).reverse()]];
});
const coast = WATER_ISLAND_PRESET.coast;
const coastRing = [
  coast.flatMap((a, i) =>
    Array.from({ length: 6 }, (_, j) => {
      const previous = coast[(i + coast.length - 1) % coast.length],
        b = coast[(i + 1) % coast.length],
        next = coast[(i + 2) % coast.length],
        t = j / 6;
      const curve = (axis: number) =>
        0.5 *
        (2 * a[axis] +
          (-previous[axis] + b[axis]) * t +
          (2 * previous[axis] - 5 * a[axis] + 4 * b[axis] - next[axis]) * t * t +
          (-previous[axis] + 3 * a[axis] - 3 * b[axis] + next[axis]) * t * t * t);
      return [curve(0), curve(1)] as const;
    })
  )
];
export const islandLakeBounds = islandLakeRings.map((rings) => {
  const points = rings.flat();
  return {
    minX: Math.min(...points.map((p) => p[0])),
    maxX: Math.max(...points.map((p) => p[0])),
    minZ: Math.min(...points.map((p) => p[1])),
    maxZ: Math.max(...points.map((p) => p[1]))
  };
});
function distanceToLakeBounds(i: number, x: number, z: number) {
  const b = islandLakeBounds[i];
  return Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minZ - z, 0, z - b.maxZ));
}
export const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function sampleIslandRiver(river: IslandRiver, x: number, z: number) {
  let distance = Infinity,
    height = 0,
    width = 0,
    along = 0;
  for (let i = 1; i < river.points.length; i++) {
    const a = river.points[i - 1],
      b = river.points[i],
      dx = b.position[0] - a.position[0],
      dz = b.position[2] - a.position[2];
    const t = Math.max(0, Math.min(1, ((x - a.position[0]) * dx + (z - a.position[2]) * dz) / (dx * dx + dz * dz)));
    const d = Math.hypot(x - a.position[0] - t * dx, z - a.position[2] - t * dz);
    if (d < distance) {
      distance = d;
      height = a.position[1] + t * (b.position[1] - a.position[1]);
      width = a.width! + t * (b.width! - a.width!);
      along = i - 1 + t;
    }
  }
  return { distance, height, width, shoreDistance: width / 2 - distance, along };
}

export function sampleIslandWater(x: number, z: number, waterLevel = 0) {
  let result = { id: "ocean", height: 0, shoreDistance: -sampleLakeSignedShoreDistance(coastRing, x, z) };
  WATER_ISLAND_PRESET.lakes.forEach((lake, i) => {
    if (-distanceToLakeBounds(i, x, z) < result.shoreDistance) return;
    const d = sampleLakeSignedShoreDistance(islandLakeRings[i], x, z);
    if (d > result.shoreDistance) result = { id: lake.id, height: lake.boundary.waterLevel, shoreDistance: d };
  });
  for (const river of WATER_ISLAND_PRESET.rivers) {
    const sample = sampleIslandRiver(river, x, z);
    if (sample.shoreDistance > result.shoreDistance)
      result = { id: river.id, height: sample.height, shoreDistance: sample.shoreDistance };
  }
  return { ...result, height: Math.max(result.height, waterLevel) };
}

export function islandOceanOwnsPoint(
  x: number,
  z: number,
  ports: Readonly<Record<string, readonly WaterConnectionPort[]>>
): boolean {
  if (sampleLakeSignedShoreDistance(coastRing, x, z) > 0) {
    const inOpening = ports.ocean.some((port) => {
      const dx = x - port.center[0],
        dz = z - port.center[1];
      const along = (dx * port.normal[0] + dz * port.normal[1]) * port.side;
      const across = Math.abs(dx * port.normal[1] - dz * port.normal[0]);
      return along >= 0 && along <= 40 && across <= port.halfWidth + Math.max(0, along - 4) * 0.25 + 2;
    });
    if (!inOpening) return false;
  }
  return islandOceanMayFloodPoint(x, z, ports);
}

/** Authoring ownership permits new inundation while retaining Lake/River exclusions. */
export function islandOceanMayFloodPoint(
  x: number,
  z: number,
  ports: Readonly<Record<string, readonly WaterConnectionPort[]>>
): boolean {
  if (!sampleWaterConnection(ports.ocean, x, z).covered) return false;
  for (let i = 0; i < WATER_ISLAND_PRESET.lakes.length; i++) {
    if (distanceToLakeBounds(i, x, z) > 0) continue;
    const lake = WATER_ISLAND_PRESET.lakes[i];
    if (
      sampleLakeSignedShoreDistance(islandLakeRings[i], x, z) >= 0 &&
      sampleWaterConnection(ports[lake.id], x, z).covered
    )
      return false;
  }
  for (let i = 0; i < WATER_ISLAND_PRESET.rivers.length; i++)
    if (
      sampleLakeSignedShoreDistance(islandRiverRings[i], x, z) >= 0 &&
      sampleWaterConnection(ports[WATER_ISLAND_PRESET.rivers[i].id], x, z).covered
    )
      return false;
  return true;
}

function initialHeight(x: number, z: number): number {
  const inland = sampleLakeSignedShoreDistance(coastRing, x, z);
  let height = inland < 0 ? Math.max(-35, inland * 0.25) : Math.min(5, inland * 0.3);
  const hill = (cx: number, cz: number, amplitude: number, radius: number) =>
    amplitude * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (radius * radius));
  height +=
    smooth(4, 24, inland) *
    (hill(-100, -122, 15, 40) + hill(-30, -133, 22, 32) + hill(80, -121, 20, 34) + hill(143, 68, 12, 30));
  height += smooth(5, 20, inland) * (0.35 * Math.sin(x * 0.11) * Math.cos(z * 0.13));
  WATER_ISLAND_PRESET.lakes.forEach((lake, i) => {
    if (distanceToLakeBounds(i, x, z) > 10) return;
    const d = sampleLakeSignedShoreDistance(islandLakeRings[i], x, z);
    if (d < -10) return;
    const bed = lake.boundary.waterLevel - (0.22 + lake.depth * smooth(0, 16, Math.max(0, d))) * smooth(0, 1, d);
    const weight = 1 - smooth(0, 10, -d);
    height = height * (1 - weight) + Math.min(height, bed) * weight;
  });
  for (const river of WATER_ISLAND_PRESET.rivers) {
    const s = sampleIslandRiver(river, x, z);
    if (s.shoreDistance < -5) continue;
    const bed =
      s.height -
      (0.2 + 1.2 * smooth(0, s.width * 0.45, Math.max(0, s.shoreDistance))) * smooth(0, 0.6, s.shoreDistance);
    const weight = 1 - smooth(0, 5, -s.shoreDistance);
    height = height * (1 - weight) + Math.min(height, bed) * weight;
  }
  // A shared submerged saddle spans each port; no closed bank is left underneath it.
  for (const c of WATER_ISLAND_PRESET.connections) {
    const [a, b] = c.section,
      cx = (a[0] + b[0]) / 2,
      cz = (a[1] + b[1]) / 2,
      width = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / width,
      nz = (b[0] - a[0]) / width;
    const across = Math.abs((x - cx) * nz - (z - cz) * nx),
      directedAlong = (x - cx) * nx + (z - cz) * nz,
      along = Math.abs(directedAlong);
    const opensToOcean = c.bodies[1] === "ocean" && directedAlong > 0;
    const reach = opensToOcean ? 40 : 10;
    const bankWidth = width / 2 + (opensToOcean ? Math.max(0, along - 4) * 0.25 : 0);
    if (across > bankWidth + 2 || along > reach) continue;
    const body = WATER_ISLAND_PRESET.lakes.find((l) => c.bodies.includes(l.id));
    const river = WATER_ISLAND_PRESET.rivers.find((r) => c.bodies.includes(r.id));
    const level = body?.boundary.waterLevel ?? (river ? sampleIslandRiver(river, cx, cz).height : 0);
    const weight = (1 - smooth(bankWidth, bankWidth + 2, across)) * (1 - smooth(reach - 3, reach, along));
    height += (Math.min(height, level - 0.45 - 0.5 * (1 - smooth(0, width / 2, across))) - height) * weight;
  }
  // The isolated basin and main-lake island remain above their surrounding water.
  return height;
}

export function createWaterIslandTerrain() {
  const terrain = captureWaterTerrainSnapshot(WATER_ISLAND_PRESET.grid, initialHeight);
  return createWaterIslandSource(terrain, 0);
}

export function islandLakeWaterLevel(lake: (typeof WATER_ISLAND_PRESET.lakes)[number], waterLevel: number) {
  return lake.boundary.waterLevel === 0 ? waterLevel : lake.boundary.waterLevel;
}

/** Static backwater approximation: raise downstream anchors, retain the authored upstream slope. */
export function islandRiversAtWaterLevel(waterLevel: number): readonly IslandRiver[] {
  return WATER_ISLAND_PRESET.rivers.map((river) => ({
    ...river,
    points: river.points.map((point) => ({
      ...point,
      position: [point.position[0], Math.max(point.position[1], waterLevel), point.position[2]] as const
    }))
  }));
}

export function createWaterIslandSource(terrain: WaterTerrainSnapshot, waterLevel: number) {
  if (!Number.isFinite(waterLevel) || waterLevel < 0 || waterLevel > 1.5)
    throw new RangeError("岚湾岛第一版支持 0–1.5 米海平面；更大范围需要重新规划河湖边界。");
  const rivers = islandRiversAtWaterLevel(waterLevel);
  const sample = (x: number, z: number) => sampleWaterTerrainHeight(terrain, x, z)!;
  const connections = compileWaterConnections(
    WATER_ISLAND_PRESET.connections,
    [
      ...WATER_ISLAND_PRESET.lakes.map((lake, i) => ({
        id: lake.id,
        kind: "lake" as const,
        bounds: [
          islandLakeBounds[i].minX,
          islandLakeBounds[i].minZ,
          islandLakeBounds[i].maxX,
          islandLakeBounds[i].maxZ
        ] as const,
        surfaceHeight: () => islandLakeWaterLevel(lake, waterLevel)
      })),
      ...rivers.map((river) => ({
        id: river.id,
        kind: "river" as const,
        bounds: [
          Math.min(...river.points.map((p) => p.position[0] - p.width!)),
          Math.min(...river.points.map((p) => p.position[2] - p.width!)),
          Math.max(...river.points.map((p) => p.position[0] + p.width!)),
          Math.max(...river.points.map((p) => p.position[2] + p.width!))
        ] as const,
        surfaceHeight: (x: number, z: number) => sampleIslandRiver(river, x, z).height
      })),
      { id: "ocean", kind: "ocean" as const, bounds: [-256, -256, 256, 256] as const, surfaceHeight: () => waterLevel }
    ],
    sample
  );
  return { terrain, hash: hashStableValue(terrain), connections, waterLevel, rivers };
}

export function cropIslandTerrain(
  terrain: WaterTerrainSnapshot,
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number
) {
  const origin = [Math.floor(minX), Math.floor(minZ)] as const;
  const crop = captureWaterTerrainSnapshot(
    {
      id: terrain.id,
      revision: 0,
      origin,
      spacing: 1,
      columns: Math.ceil(maxX) - origin[0] + 1,
      rows: Math.ceil(maxZ) - origin[1] + 1
    },
    (x, z) => sampleWaterTerrainHeight(terrain, x, z)
  );
  // A distant edit must not invalidate this crop. Its immutable revision follows its own sampled content.
  return Object.freeze({ ...crop, revision: Number.parseInt(hashStableValue(crop).slice(0, 13), 16) });
}
