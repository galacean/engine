import type { RiverEditablePoint } from "../../authoring/river/RiverEditDocument";
import { validateRiverTerrainModifier, type RiverTerrainModifier } from "../../authoring/river/RiverTerrainModifier";
import {
  copyWaterTerrainSnapshot,
  isWaterTerrainSnapshot,
  waterTerrainVertexRange,
  type WaterTerrainSnapshot
} from "../../authoring/terrain/WaterTerrainSnapshot";
import { hashRiverStableValue } from "../shared/determinism";

export interface RiverTerrainBounds {
  readonly min: readonly [number, number];
  readonly max: readonly [number, number];
}

export function riverTerrainContentHash(terrain: WaterTerrainSnapshot): string {
  const { id, revision, ...content } = terrain;
  return hashRiverStableValue(content);
}

export function riverTerrainModifierBounds(
  points: readonly RiverEditablePoint[],
  modifier?: RiverTerrainModifier
): RiverTerrainBounds | undefined {
  if (!modifier) return undefined;
  return {
    min: [
      points.reduce((min, p) => Math.min(min, p.position[0] - p.width / 2 - modifier.bankWidth), Infinity),
      points.reduce((min, p) => Math.min(min, p.position[2] - p.width / 2 - modifier.bankWidth), Infinity)
    ],
    max: [
      points.reduce((max, p) => Math.max(max, p.position[0] + p.width / 2 + modifier.bankWidth), -Infinity),
      points.reduce((max, p) => Math.max(max, p.position[2] + p.width / 2 + modifier.bankWidth), -Infinity)
    ]
  };
}

/** Include the removed corridor and a grid cell for interpolated heights/normals at its edge. */
export function riverTerrainDirtyBounds(
  base: WaterTerrainSnapshot,
  oldBounds?: RiverTerrainBounds,
  newBounds?: RiverTerrainBounds
): RiverTerrainBounds | undefined {
  const bounds = [oldBounds, newBounds].filter((b): b is RiverTerrainBounds => !!b);
  if (!bounds.length) return undefined;
  return {
    min: [
      Math.max(base.origin[0], Math.min(...bounds.map((b) => b.min[0])) - base.spacing),
      Math.max(base.origin[1], Math.min(...bounds.map((b) => b.min[1])) - (base.spacingZ ?? base.spacing))
    ],
    max: [
      Math.min(
        base.origin[0] + (base.columns - 1) * base.spacing,
        Math.max(...bounds.map((b) => b.max[0])) + base.spacing
      ),
      Math.min(
        base.origin[1] + (base.rows - 1) * (base.spacingZ ?? base.spacing),
        Math.max(...bounds.map((b) => b.max[1])) + (base.spacingZ ?? base.spacing)
      )
    ]
  };
}

/** Pure terrain-grid adapter. Always evaluates against base, never a previous derived terrain. */
export function deriveRiverTerrain(
  base: WaterTerrainSnapshot,
  riverId: string,
  points: readonly RiverEditablePoint[],
  modifier: RiverTerrainModifier | undefined,
  revision: number
): WaterTerrainSnapshot {
  if (!isWaterTerrainSnapshot(base) || !Number.isSafeInteger(revision) || revision < 0)
    throw new Error("基础地形或发布版本无效");
  if (!modifier) return base;
  const m = validateRiverTerrainModifier(modifier, riverId);
  if (
    points.length < 2 ||
    points.some(
      (p) =>
        !p ||
        !Array.isArray(p.position) ||
        p.position.length !== 3 ||
        ![p.position[0], p.position[1], p.position[2], p.width].every(Number.isFinite) ||
        p.width <= 0
    )
  )
    throw new Error("河槽控制点无效");
  const bounds = riverTerrainModifierBounds(points, m)!;
  if (
    bounds.min[0] < base.origin[0] ||
    bounds.min[1] < base.origin[1] ||
    bounds.max[0] > base.origin[0] + (base.columns - 1) * base.spacing ||
    bounds.max[1] > base.origin[1] + (base.rows - 1) * (base.spacingZ ?? base.spacing)
  )
    throw new Error("河槽及岸坡影响范围超出基础地形");
  for (let i = 1; i < points.length; i++)
    if (
      Math.hypot(points[i].position[0] - points[i - 1].position[0], points[i].position[2] - points[i - 1].position[2]) <
      0.1
    )
      throw new Error("河槽相邻控制点过近");
  const cutGrid = (grid: WaterTerrainSnapshot): WaterTerrainSnapshot => {
    const [col0, col1, row0, row1] = waterTerrainVertexRange(grid, [
      bounds.min[0],
      bounds.min[1],
      bounds.max[0],
      bounds.max[1]
    ]);
    let heights: number[] | undefined;
    for (let row = row0; row <= row1; row++)
      for (let col = col0; col <= col1; col++) {
        const x = grid.origin[0] + col * grid.spacing,
          z = grid.origin[1] + row * (grid.spacingZ ?? grid.spacing),
          index = row * grid.columns + col;
        if (x < bounds.min[0] || x > bounds.max[0] || z < bounds.min[1] || z > bounds.max[1]) continue;
        const original = grid.heights[index];
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1],
            b = points[i],
            dx = b.position[0] - a.position[0],
            dz = b.position[2] - a.position[2];
          const t = Math.max(
            0,
            Math.min(1, ((x - a.position[0]) * dx + (z - a.position[2]) * dz) / (dx * dx + dz * dz))
          );
          const distance = Math.hypot(x - a.position[0] - dx * t, z - a.position[2] - dz * t);
          const halfWidth = (a.width + (b.width - a.width) * t) / 2,
            bedHalfWidth = halfWidth * m.bedWidthRatio;
          const span = halfWidth + m.bankWidth - bedHalfWidth;
          if (distance >= halfWidth + m.bankWidth) continue;
          const u = Math.max(0, Math.min(1, (distance - bedHalfWidth) / span));
          const blend = m.falloff === "smoothstep" ? u * u * (3 - 2 * u) : u;
          const target = a.position[1] + (b.position[1] - a.position[1]) * t - m.targetBedDepth;
          // Overlapping segment influences combine deterministically; already deeper terrain is never filled.
          const cut = target + (original - target) * blend;
          if (cut < (heights ?? grid.heights)[index]) {
            heights ??= grid.heights.slice();
            heights[index] = cut;
          }
        }
      }
    return heights ? { ...grid, heights: Object.freeze(heights) } : grid;
  };
  // Each grid contributes its own authoritative interpolation; cuts must reach every replacement grid.
  return copyWaterTerrainSnapshot({
    ...cutGrid(base),
    id: `${base.id}:river-derived`,
    revision,
    // Children retain Base grid identity; parent revision and height content identify this derived publication.
    ...(base.refinements ? { refinements: base.refinements.map(cutGrid) } : {})
  });
}
