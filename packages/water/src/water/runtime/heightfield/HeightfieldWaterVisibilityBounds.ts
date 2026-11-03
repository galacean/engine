/** Conservative spatial proxies used by finite-water visibility and Terrain Horizon queries. */
import { BoundingBox, Vector3, type Matrix } from "@galacean/engine-math";
import type { HeightfieldWaterCompiledChunk } from "../../compiler/heightfield/HeightfieldWaterCompiledTypes";

export const HEIGHTFIELD_WATER_VISIBILITY_CELL_SIZE_METRES = 64;

export interface HeightfieldWaterVisibilityBounds {
  readonly localBounds: BoundingBox;
  readonly worldBounds: BoundingBox;
  terrainOccluded: boolean;
}

interface MutableBoundsValues {
  readonly cellX: number;
  readonly cellZ: number;
  minimumX: number;
  minimumY: number;
  minimumZ: number;
  maximumX: number;
  maximumY: number;
  maximumZ: number;
}

/**
 * Builds conservative WaterBody-local AABBs from the triangles actually owned by a compiled chunk.
 * Triangles crossing a spatial cell are included in every touched cell so a proxy can never under-bound
 * the rendered surface. Wave displacement padding matches the renderer mesh bounds contract.
 */
export function createHeightfieldWaterVisibilityBounds(
  chunk: HeightfieldWaterCompiledChunk,
  boundsPadding: number,
  cellSizeMetres = HEIGHTFIELD_WATER_VISIBILITY_CELL_SIZE_METRES
): HeightfieldWaterVisibilityBounds[] {
  if (!Number.isFinite(cellSizeMetres) || cellSizeMetres <= 0) {
    throw new RangeError("Heightfield water visibility cell size must be finite and positive.");
  }
  const padding = Number.isFinite(boundsPadding) ? Math.max(0, boundsPadding) : 0;
  const geometry = chunk.geometry;
  const positions = geometry.positions.borrowTypedArray();
  const indices = geometry.indices.borrowTypedArray();
  const cells = new Map<string, MutableBoundsValues>();
  const originX = chunk.localOrigin[0];
  const originY = chunk.localOrigin[1];
  const originZ = chunk.localOrigin[2];

  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const indexA = indices[offset]!;
    const indexB = indices[offset + 1]!;
    const indexC = indices[offset + 2]!;
    if (indexA >= geometry.vertexCount || indexB >= geometry.vertexCount || indexC >= geometry.vertexCount) {
      throw new RangeError("Heightfield water visibility geometry contains an out-of-range vertex index.");
    }
    const ax = positions[indexA * 3]! + originX;
    const ay = positions[indexA * 3 + 1]! + originY;
    const az = positions[indexA * 3 + 2]! + originZ;
    const bx = positions[indexB * 3]! + originX;
    const by = positions[indexB * 3 + 1]! + originY;
    const bz = positions[indexB * 3 + 2]! + originZ;
    const cx = positions[indexC * 3]! + originX;
    const cy = positions[indexC * 3 + 1]! + originY;
    const cz = positions[indexC * 3 + 2]! + originZ;
    const minimumX = Math.min(ax, bx, cx);
    const minimumY = Math.min(ay, by, cy);
    const minimumZ = Math.min(az, bz, cz);
    const maximumX = Math.max(ax, bx, cx);
    const maximumY = Math.max(ay, by, cy);
    const maximumZ = Math.max(az, bz, cz);
    const minimumCellX = Math.floor(minimumX / cellSizeMetres);
    const maximumCellX = Math.floor(maximumX / cellSizeMetres);
    const minimumCellZ = Math.floor(minimumZ / cellSizeMetres);
    const maximumCellZ = Math.floor(maximumZ / cellSizeMetres);

    for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ++) {
      for (let cellX = minimumCellX; cellX <= maximumCellX; cellX++) {
        const key = `${cellX}:${cellZ}`;
        const cell = cells.get(key);
        if (cell) {
          cell.minimumX = Math.min(cell.minimumX, minimumX);
          cell.minimumY = Math.min(cell.minimumY, minimumY);
          cell.minimumZ = Math.min(cell.minimumZ, minimumZ);
          cell.maximumX = Math.max(cell.maximumX, maximumX);
          cell.maximumY = Math.max(cell.maximumY, maximumY);
          cell.maximumZ = Math.max(cell.maximumZ, maximumZ);
        } else {
          cells.set(key, {
            cellX,
            cellZ,
            minimumX,
            minimumY,
            minimumZ,
            maximumX,
            maximumY,
            maximumZ
          });
        }
      }
    }
  }

  return [...cells.values()]
    .sort((left, right) => left.cellZ - right.cellZ || left.cellX - right.cellX)
    .map((bounds) => {
      const localBounds = new BoundingBox(
        new Vector3(bounds.minimumX - padding, bounds.minimumY - padding, bounds.minimumZ - padding),
        new Vector3(bounds.maximumX + padding, bounds.maximumY + padding, bounds.maximumZ + padding)
      );
      return {
        localBounds,
        worldBounds: new BoundingBox(new Vector3(), new Vector3()),
        terrainOccluded: false
      };
    });
}

/** Updates one pooled world AABB from the actual Scene transform, including floating-origin offsets. */
export function updateHeightfieldWaterVisibilityWorldBounds(
  proxy: HeightfieldWaterVisibilityBounds,
  worldMatrix: Matrix
): void {
  BoundingBox.transform(proxy.localBounds, worldMatrix, proxy.worldBounds);
}
