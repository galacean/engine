import type { TreeSpeciesGeometryBounds } from "../asset-assembly/TreeSpeciesGeometryBounds";

const TREE_BOUNDS_CELL_METRES = 32;
const TREE_BOUNDS_EPSILON_METRES = 1e-6;

/** Minimal physical tree contract required by the deterministic Bounds packer. */
export interface SeedWorldTreeBoundsInstance {
  readonly id: string;
  readonly normalizedPosition: Readonly<{ x: number; y: number }>;
  readonly scale: readonly [x: number, y: number, z: number];
  readonly yawRadians: number;
}

/** Exact world-space X-Z oriented footprint projected from one visible ModelMesh Bounds. */
export interface SeedWorldTreeFootprintObb {
  readonly id: string;
  readonly centerX: number;
  readonly centerZ: number;
  readonly axisXX: number;
  readonly axisXZ: number;
  readonly axisZX: number;
  readonly axisZZ: number;
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

/** Lightweight broad-phase diagnostics used to guard against accidental quadratic packing. */
export interface SeedWorldTreeBoundsIndexDiagnostics {
  readonly acceptedCount: number;
  readonly exactIntersectionTests: number;
}

/** Resolves the authored local X-Z dimensions after the Producer-owned instance scale. */
export function resolveSeedWorldTreeFootprintMetres(
  bounds: TreeSpeciesGeometryBounds,
  scale: readonly [x: number, y: number, z: number]
): readonly [width: number, depth: number] {
  return Object.freeze([
    (bounds.maximum[0] - bounds.minimum[0]) * Math.abs(scale[0]),
    (bounds.maximum[2] - bounds.minimum[2]) * Math.abs(scale[2])
  ] as const);
}

/** Projects non-zero local Bounds centers and authored yaw into one exact world-space OBB. */
export function projectSeedWorldTreeFootprintObb(
  sizeMetres: number,
  instance: SeedWorldTreeBoundsInstance,
  bounds: TreeSpeciesGeometryBounds
): SeedWorldTreeFootprintObb {
  const worldX = (instance.normalizedPosition.x - 0.5) * sizeMetres;
  const worldZ = (instance.normalizedPosition.y - 0.5) * sizeMetres;
  const localCenterX = (bounds.minimum[0] + bounds.maximum[0]) * 0.5 * instance.scale[0];
  const localCenterZ = (bounds.minimum[2] + bounds.maximum[2]) * 0.5 * instance.scale[2];
  const halfWidth = (bounds.maximum[0] - bounds.minimum[0]) * 0.5 * Math.abs(instance.scale[0]);
  const halfDepth = (bounds.maximum[2] - bounds.minimum[2]) * 0.5 * Math.abs(instance.scale[2]);
  const cosine = Math.cos(instance.yawRadians);
  const sine = Math.sin(instance.yawRadians);
  const centerX = worldX + localCenterX * cosine + localCenterZ * sine;
  const centerZ = worldZ - localCenterX * sine + localCenterZ * cosine;
  const axisXX = cosine;
  const axisXZ = -sine;
  const axisZX = sine;
  const axisZZ = cosine;
  const worldHalfX = Math.abs(axisXX) * halfWidth + Math.abs(axisZX) * halfDepth;
  const worldHalfZ = Math.abs(axisXZ) * halfWidth + Math.abs(axisZZ) * halfDepth;
  return Object.freeze({
    id: instance.id,
    centerX,
    centerZ,
    axisXX,
    axisXZ,
    axisZX,
    axisZZ,
    halfWidth,
    halfDepth,
    minimumX: centerX - worldHalfX,
    maximumX: centerX + worldHalfX,
    minimumZ: centerZ - worldHalfZ,
    maximumZ: centerZ + worldHalfZ
  });
}

/** Exact four-axis SAT test; tangential crowns are allowed, penetrating crowns are not. */
export function seedWorldTreeFootprintObbsOverlap(
  left: SeedWorldTreeFootprintObb,
  right: SeedWorldTreeFootprintObb
): boolean {
  if (
    left.maximumX <= right.minimumX + TREE_BOUNDS_EPSILON_METRES ||
    right.maximumX <= left.minimumX + TREE_BOUNDS_EPSILON_METRES ||
    left.maximumZ <= right.minimumZ + TREE_BOUNDS_EPSILON_METRES ||
    right.maximumZ <= left.minimumZ + TREE_BOUNDS_EPSILON_METRES
  ) {
    return false;
  }
  const deltaX = right.centerX - left.centerX;
  const deltaZ = right.centerZ - left.centerZ;
  return (
    overlapsOnAxis(left, right, deltaX, deltaZ, left.axisXX, left.axisXZ) &&
    overlapsOnAxis(left, right, deltaX, deltaZ, left.axisZX, left.axisZZ) &&
    overlapsOnAxis(left, right, deltaX, deltaZ, right.axisXX, right.axisXZ) &&
    overlapsOnAxis(left, right, deltaX, deltaZ, right.axisZX, right.axisZZ)
  );
}

/** Spatial-hash broad phase shared by generation, tests, and diagnostics. */
export class SeedWorldTreeBoundsIndex {
  readonly #cells = new Map<string, SeedWorldTreeFootprintObb[]>();
  readonly #accepted = new Set<string>();
  #exactIntersectionTests = 0;

  overlaps(candidate: SeedWorldTreeFootprintObb): boolean {
    const visited = new Set<string>();
    const range = cellRange(candidate);
    for (let cellZ = range.minimumZ; cellZ <= range.maximumZ; cellZ++) {
      for (let cellX = range.minimumX; cellX <= range.maximumX; cellX++) {
        for (const other of this.#cells.get(`${cellX}:${cellZ}`) ?? []) {
          if (visited.has(other.id)) continue;
          visited.add(other.id);
          this.#exactIntersectionTests++;
          if (seedWorldTreeFootprintObbsOverlap(candidate, other)) return true;
        }
      }
    }
    return false;
  }

  add(footprint: SeedWorldTreeFootprintObb): void {
    if (this.#accepted.has(footprint.id)) throw new RangeError(`Tree Bounds id "${footprint.id}" is duplicated`);
    this.#accepted.add(footprint.id);
    const range = cellRange(footprint);
    for (let cellZ = range.minimumZ; cellZ <= range.maximumZ; cellZ++) {
      for (let cellX = range.minimumX; cellX <= range.maximumX; cellX++) {
        const key = `${cellX}:${cellZ}`;
        const cell = this.#cells.get(key);
        if (cell) cell.push(footprint);
        else this.#cells.set(key, [footprint]);
      }
    }
  }

  get diagnostics(): SeedWorldTreeBoundsIndexDiagnostics {
    return Object.freeze({
      acceptedCount: this.#accepted.size,
      exactIntersectionTests: this.#exactIntersectionTests
    });
  }
}

function overlapsOnAxis(
  left: SeedWorldTreeFootprintObb,
  right: SeedWorldTreeFootprintObb,
  deltaX: number,
  deltaZ: number,
  axisX: number,
  axisZ: number
): boolean {
  const distance = Math.abs(deltaX * axisX + deltaZ * axisZ);
  const leftRadius =
    left.halfWidth * Math.abs(left.axisXX * axisX + left.axisXZ * axisZ) +
    left.halfDepth * Math.abs(left.axisZX * axisX + left.axisZZ * axisZ);
  const rightRadius =
    right.halfWidth * Math.abs(right.axisXX * axisX + right.axisXZ * axisZ) +
    right.halfDepth * Math.abs(right.axisZX * axisX + right.axisZZ * axisZ);
  return distance < leftRadius + rightRadius - TREE_BOUNDS_EPSILON_METRES;
}

function cellRange(footprint: SeedWorldTreeFootprintObb): Readonly<{
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}> {
  return {
    minimumX: Math.floor(footprint.minimumX / TREE_BOUNDS_CELL_METRES),
    maximumX: Math.floor(footprint.maximumX / TREE_BOUNDS_CELL_METRES),
    minimumZ: Math.floor(footprint.minimumZ / TREE_BOUNDS_CELL_METRES),
    maximumZ: Math.floor(footprint.maximumZ / TREE_BOUNDS_CELL_METRES)
  };
}
