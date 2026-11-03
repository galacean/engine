import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";
import type { ConstructionTerrainSource } from "@galacean/engine-building/tiny-glade/runtime/ConstructionTerrain";
import type { ConstructionGroundMesh } from "@galacean/engine-building/tiny-glade/runtime/ConstructionGroundSupports";
import { constructionSupportMeshes } from "@galacean/engine-building/tiny-glade/runtime/ConstructionTerrainTransfer";
import {
  SEED_WORLD_HEIGHT_RANGE,
  seedWorldOriginX,
  seedWorldOriginZ,
  type SeedWorldFields
} from "../runtime/SeedWorldFields.ts";
const rockSupports = new WeakMap<RockFormationMesh, ConstructionGroundMesh>();
function rockSupport(formation: RockFormationMesh): ConstructionGroundMesh {
  let support = rockSupports.get(formation);
  if (!support) {
    // Own world-space snapshots, retaining identity for unchanged immutable meshes.
    support = {
      positions: formation.mesh.positions.map((v, i) => v + formation.origin[i % 3]),
      indices: formation.mesh.indices.slice()
    };
    rockSupports.set(formation, support);
  }
  return support;
}

/** Replace rock supports while retaining the accepted canonical terrain snapshot. */
export function masonryRockTerrainSource(
  previous: ConstructionTerrainSource,
  formations: readonly RockFormationMesh[],
  revision: string | number
): ConstructionTerrainSource {
  return { revision, grid: { ...previous.grid, supports: formations.map(rockSupport) } };
}

/** Match the compiler's support footprint, including rotated shapes and its foundation margin.
 * Compare both snapshots so shrinking/removing a rock also invalidates its former dependants. */
export function masonryRockSupportsChanged(
  document: MasonryDocument,
  previous: ConstructionTerrainSource,
  next: ConstructionTerrainSource
): boolean {
  const before = new Set(constructionSupportMeshes(document, previous.grid));
  const after = constructionSupportMeshes(document, next.grid);
  return before.size !== after.length || after.some((mesh) => !before.has(mesh));
}

/** Immutable terrain input; independent of scene publication and its runtime owners. */
export interface MasonryTerrainSnapshot {
  readonly revision: number;
  readonly data: { readonly fields: SeedWorldFields };
}
/** Capture only the published final R16 field, never the mutable transition or live buffer. */
export function masonryTerrainSource(
  published: MasonryTerrainSnapshot,
  formations: readonly RockFormationMesh[] = []
): ConstructionTerrainSource {
  const fields = published.data.fields;
  return {
    revision: published.revision,
    grid: {
      samples: fields.heightSamples.slice(),
      supports: formations.map(rockSupport),
      resolution: fields.heightResolution,
      origin: [seedWorldOriginX(fields), seedWorldOriginZ(fields)],
      size: fields.sizeMetres,
      decode: {
        offset: fields.heightDecode?.offset ?? SEED_WORLD_HEIGHT_RANGE.minimum,
        scale: fields.heightDecode?.scale ?? SEED_WORLD_HEIGHT_RANGE.maximum - SEED_WORLD_HEIGHT_RANGE.minimum
      }
    }
  };
}
import type { MasonryDocument } from "@galacean/engine-building/tiny-glade/runtime/MasonryDocument";
export interface MasonryLandQuery {
  sampleHeight(x: number, z: number): number | undefined;
  isWater(x: number, z: number): boolean;
}
/** Spawn belongs to the published IslandPlan, not its renderer data.plan projection. */
export function masonryPlacementAnchors(
  published: { readonly plan: { readonly spawn?: { readonly x: number; readonly z: number } } },
  view: { x: number; z: number }
): [number, number][] {
  const spawn = published.plan.spawn;
  if (!spawn || ![spawn.x, spawn.z, view.x, view.z].every(Number.isFinite))
    throw Error("已发布规划缺少有效出生点或当前观察位置");
  return [
    [view.x, view.z],
    [spawn.x, spawn.z]
  ];
}
/** Sample the actual union of wall footprints, including curved/rotated boundaries. */
export function masonryFootprintSamples(document: MasonryDocument): [number, number][] {
  const samples: [number, number][] = [];
  for (const b of document.construction.buildings) {
    if (b.circle) {
      const {
          center: [cx, cz],
          radius: r
        } = b.circle,
        n = Math.max(8, Math.ceil(2 * Math.PI * r));
      for (let i = 0; i < n; i++)
        samples.push([cx + r * Math.cos((i * 2 * Math.PI) / n), cz + r * Math.sin((i * 2 * Math.PI) / n)]);
      const m = Math.ceil(2 * r);
      for (let j = 0; j <= m; j++)
        for (let i = 0; i <= m; i++) {
          const x = -r + (2 * r * i) / m,
            z = -r + (2 * r * j) / m;
          if (x * x + z * z <= r * r) samples.push([cx + x, cz + z]);
        }
    } else {
      const {
          center: [cx, cz],
          size: [w, d],
          rotation
        } = b.rectangle!,
        c = Math.cos(rotation),
        s = Math.sin(rotation),
        nx = Math.ceil(w),
        nz = Math.ceil(d);
      for (let j = 0; j <= nz; j++)
        for (let i = 0; i <= nx; i++) {
          const x = w * (i / nx - 0.5),
            z = d * (j / nz - 0.5);
          samples.push([cx + c * x - s * z, cz + s * x + c * z]);
        }
    }
  }
  if (!samples.length) throw Error("没有可放置的建筑占地");
  return samples;
}
/** Explicit placement command. Local construction/UV rules and edits stay unchanged.
 * This finite search proves only the sampled land contacts, not global feasibility
 * or collision freedom from unrelated objects. It never changes the terrain. */
export function placeMasonryOnLand(
  document: MasonryDocument,
  anchors: readonly [number, number][],
  query: MasonryLandQuery,
  localGroundDatum = 0
): MasonryDocument {
  if (!Number.isFinite(localGroundDatum)) throw Error("Local ground datum must be finite");
  const rotationY = document.placement?.rotationY ?? 0,
    c = Math.cos(rotationY),
    s = Math.sin(rotationY);
  const points = masonryFootprintSamples(document).map(([x, z]) => [c * x + s * z, -s * x + c * z]),
    xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const step = Math.max(1, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / 2);
  const candidates = anchors.map((p) => [...p] as [number, number]);
  for (let ring = 1; ring <= 8; ring++)
    for (const [x, z] of anchors)
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        candidates.push([x + step * ring * Math.cos(a), z + step * ring * Math.sin(a)]);
      }
  for (const [x, z] of candidates) {
    let y = -Infinity,
      valid = true;
    for (const [u, v] of points) {
      const h = query.sampleHeight(x + u, z + v);
      if (h === undefined || !Number.isFinite(h) || query.isWater(x + u, z + v)) {
        valid = false;
        break;
      }
      y = Math.max(y, h);
    }
    if (valid)
      return {
        ...structuredClone(document),
        placement: {
          position: [
            x,
            document.construction.environment?.type === "host_terrain"
              ? (document.placement?.position[1] ?? 0)
              : y - localGroundDatum,
            z
          ],
          rotationY
        }
      };
  }
  throw Error("当前位置和出生点附近的有限搜索未找到完整陆地占地，请移动到更开阔的陆地后重试");
}
export function masonryWorldPoint(
  document: MasonryDocument,
  local: readonly number[],
  renderPosition?: readonly number[]
): [number, number, number] {
  const {
      position: [x, y, z],
      rotationY
    } = document.placement ?? { position: [0, 0, 0], rotationY: 0 },
    c = Math.cos(rotationY),
    s = Math.sin(rotationY);
  const position = renderPosition ?? [x, y, z];
  if (position.length !== 3 || !position.every(Number.isFinite)) throw Error("Invalid masonry render position");
  return [position[0] + c * local[0] + s * local[2], position[1] + local[1], position[2] - s * local[0] + c * local[2]];
}
