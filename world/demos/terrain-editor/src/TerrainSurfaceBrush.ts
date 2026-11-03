import {
  TERRAIN_DETAIL_TRANSFORM_FORMAT,
  TERRAIN_RASTER_LAYOUT,
  type TerrainProjectDetailPrototype,
  type TerrainProjectDetailTransforms,
  type TerrainProjectDocument,
  type TerrainProjectPlacedPrefabInstance,
  type TerrainProjectTreeInstance
} from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";
import { sampleTerrainDocumentHeight } from "@galacean/engine-world-planning/authoring/terrain/TerrainHeightfield";

const BRUSH_PATH_EPSILON_METRES = 1e-9;
const DETAIL_TRANSFORM_STRIDE = 6;
const PENDING_RESOURCE_HASH = "0".repeat(64);
const TREE_PLACEMENT_ATTEMPTS_PER_INSTANCE = 12;
const TREE_REFERENCE_SPACING_METRES = 2.5;
const TREE_FULL_DENSITY_PER_SQUARE_METRE = 0.012;
const OBJECT_PLACEMENT_ATTEMPTS_PER_INSTANCE = 12;
const OBJECT_PLACEMENT_AREA_OCCUPANCY = 0.35;
const OBJECT_BRUSH_SPACING_RATIO = 0.75;
const MIN_OBJECT_FULL_DENSITY_COUNT_PER_STAMP = 2;
const MAX_OBJECT_PLACEMENTS_PER_STAMP = 64;

/** World-space X/Z point captured by a Terrain paint stroke. */
export interface TerrainSurfaceBrushPoint {
  /** World X coordinate in metres. */
  readonly x: number;
  /** World Z coordinate in metres. */
  readonly z: number;
}

/** Common fixed-distance path and radial influence shared by surface paint tools. */
export interface TerrainSurfaceBrushPath {
  /** Ordered pointer positions in world metres. */
  readonly points: readonly TerrainSurfaceBrushPoint[];
  /** Fixed world-space distance between generated brush stamps. */
  readonly spacingMetres: number;
  /** Circular brush radius in world metres. */
  readonly radiusMetres: number;
  /** Radial falloff exponent; `0` produces a hard circle. */
  readonly falloff: number;
}

/** One canonical TerrainLayer weight stroke. */
export interface TerrainTextureBrushStroke extends TerrainSurfaceBrushPath {
  /** Stable Region-local TerrainLayer id selected by the editor. */
  readonly layerId: string;
  /** Maximum interpolation factor in `[0,1]`. */
  readonly opacity: number;
  /** Desired selected-layer weight in `[0,1]`. */
  readonly targetWeight: number;
  /** Whether the selected layer is painted toward zero. */
  readonly erase: boolean;
}

/** One canonical Detail density stroke. */
export interface TerrainDetailBrushStroke extends TerrainSurfaceBrushPath {
  /** Stable Region-local Detail prototype id selected by the editor. */
  readonly prototypeId: string;
  /** Maximum interpolation factor in `[0,1]`. */
  readonly opacity: number;
  /** Desired per-cell instance count in `[0,255]`. */
  readonly targetCount: number;
  /** Deterministic per-cell density variation in `[0,1]`; `0` keeps a uniform target. */
  readonly distributionNoise: number;
  /** Whether the selected density is painted toward zero. */
  readonly erase: boolean;
}

/** One session-only Detail stroke that appends exact transforms without authoring density. */
export interface TerrainExactDetailBrushStroke extends TerrainSurfaceBrushPath {
  /** Stable Region-local Detail prototype id selected by the generator. */
  readonly prototypeId: string;
  /** Desired instance count for each affected Detail cell in `[0,255]`. */
  readonly targetCount: number;
  /** Deterministic per-cell count variation in `[0,1]`; `0` keeps a uniform target. */
  readonly distributionNoise: number;
}

/** Stable virtual paths allocated when an empty Detail prototype receives its first instances. */
export interface TerrainDetailResourceAllocation {
  /** Canonical R8 density payload path. */
  readonly densityDataUrl: string;
  /** Optional counted exact-transform payload path. */
  readonly exactTransformsDataUrl?: string;
}

/** One explicit tree-instance stroke. */
export interface TerrainTreeBrushStroke extends TerrainSurfaceBrushPath {
  /** Stable Region-local tree prototype id selected by the editor. */
  readonly prototypeId: string;
  /** Relative placement density in `[0,1]`. */
  readonly density: number;
  /** Optional exact placement count for each stamp, overriding density-derived count. */
  readonly targetCount?: number;
  /** Deterministic per-stamp density variation in `[0,1]`; `0` keeps a uniform target. */
  readonly distributionNoise: number;
  /** Minimum uniform instance scale. */
  readonly minimumScale: number;
  /** Maximum uniform instance scale. */
  readonly maximumScale: number;
  /** Whether newly placed instances receive deterministic random yaw. */
  readonly randomRotation: boolean;
  /** Whether matching instances inside the brush are removed. */
  readonly erase: boolean;
  /** Whether erase mode is restricted to the selected prototype. */
  readonly eraseSelectedOnly: boolean;
}

/** One explicit ordinary placed-Prefab stroke. */
export interface TerrainObjectBrushStroke extends TerrainSurfaceBrushPath {
  /** Stable Region-local placed-Prefab prototype id selected by the editor. */
  readonly prototypeId: string;
  /** Relative placement density in `[0,1]`. */
  readonly density: number;
  /** Typical nearest-neighbour distance for this Prefab at full density. */
  readonly referenceSpacingMetres: number;
  /** Minimum uniform instance scale. */
  readonly minimumScale: number;
  /** Maximum uniform instance scale. */
  readonly maximumScale: number;
  /** Optional exact number of instances for one-point generator placements. */
  readonly targetCount?: number;
  /** Whether matching selected objects inside the brush are removed. */
  readonly erase: boolean;
}

/** Exact sparse byte change produced by a raster paint operation. */
export interface TerrainByteChange {
  /** Row-major byte offset in the canonical payload. */
  readonly index: number;
  /** Exact source byte. */
  readonly before: number;
  /** Exact edited byte. */
  readonly after: number;
}

/** Sparse changes for one physical canonical Alphamap. */
export interface TerrainAlphamapChanges {
  /** Region-local Alphamap index. */
  readonly mapIndex: number;
  /** Changed bytes in ascending payload order. */
  readonly changes: readonly TerrainByteChange[];
}

/** Immutable texture-paint result for one Region. */
export interface TerrainTextureBrushResult {
  /** Edited Alphamaps; unchanged entries retain their source views. */
  readonly alphamaps: readonly Uint8Array[];
  /** Sparse changes grouped by physical map. */
  readonly maps: readonly TerrainAlphamapChanges[];
}

/** Texture brush settings retained for one incremental pointer session. */
export type TerrainTextureBrushSessionSettings = Omit<TerrainTextureBrushStroke, "points">;

/** Compact current-value RGBA8 rectangle produced by an incremental texture session. */
export interface TerrainTextureBrushPatch {
  /** Region-local Alphamap index receiving the pixels. */
  readonly mapIndex: number;
  /** Zero-based Alphamap-local texel origin `[x,z]`. */
  readonly sampleOrigin: readonly [x: number, z: number];
  /** Positive patch dimensions `[width,height]`. */
  readonly sampleSize: readonly [width: number, height: number];
  /** Compact X-fast row-major RGBA8 pixels matching `sampleSize`. */
  readonly pixels: Uint8Array;
}

/** Incremental texture stroke that owns one unpublished working copy. */
export interface TerrainTextureBrushSession {
  /**
   * Applies every newly reached fixed-distance stamp.
   * @param point Latest pointer position in world metres.
   * @returns Compact current-value patches, or an empty array when no texel changes.
   */
  appendPoint(point: TerrainSurfaceBrushPoint): readonly TerrainTextureBrushPatch[];
  /** @returns Final edited Alphamaps and exact sparse changes against the session baseline. */
  finish(): TerrainTextureBrushResult;
  /** @returns Baseline-value patches that restore every texel touched by the session. */
  cancel(): readonly TerrainTextureBrushPatch[];
}

/** Detail brush settings retained for one incremental pointer session. */
export type TerrainDetailBrushSessionSettings = Omit<TerrainDetailBrushStroke, "points">;

/** Incremental Detail stroke that owns one unpublished working Region document. */
export interface TerrainDetailBrushSession {
  /**
   * Applies every newly reached fixed-distance stamp.
   * @param point Latest pointer position in world metres.
   * @returns Current selected-prototype result, or `null` when no new stamp changed density.
   */
  appendPoint(point: TerrainSurfaceBrushPoint): TerrainDetailBrushResult | null;
  /** @returns Final selected-prototype result including the pointer endpoint and exact baseline diff. */
  finish(): TerrainDetailBrushResult;
  /** Closes the unpublished session without mutating its canonical source. */
  cancel(): void;
}

/** Tree brush settings retained for one incremental pointer session. */
export type TerrainTreeBrushSessionSettings = Omit<TerrainTreeBrushStroke, "points">;

/** Incremental tree stroke that owns one unpublished working Region document. */
export interface TerrainTreeBrushSession {
  /**
   * Applies every newly reached fixed-distance stamp.
   * @param point Latest pointer position in world metres.
   * @returns Current explicit instance result, or `null` when no new stamp changed instances.
   */
  appendPoint(point: TerrainSurfaceBrushPoint): TerrainTreeBrushResult | null;
  /** @returns Final explicit instance result including the pointer endpoint and exact baseline counts. */
  finish(): TerrainTreeBrushResult;
  /** Closes the unpublished session without mutating its canonical source. */
  cancel(): void;
}

/** Object brush settings retained for one incremental pointer session. */
export type TerrainObjectBrushSessionSettings = Omit<TerrainObjectBrushStroke, "points">;

/** Incremental placed-object stroke owning one unpublished working Region document. */
export interface TerrainObjectBrushSession {
  /**
   * Applies every newly reached fixed-distance stamp.
   * @param point Latest pointer position in world metres.
   * @returns Current explicit placement result, or `null` when no instance changed.
   */
  appendPoint(point: TerrainSurfaceBrushPoint): TerrainObjectBrushResult | null;
  /** @returns Final explicit object placements and baseline-relative counts. */
  finish(): TerrainObjectBrushResult;
  /** Closes the unpublished session without mutating its canonical source. */
  cancel(): void;
}

/** Immutable Detail-paint result for one Region. */
export interface TerrainDetailBrushResult {
  /** Stable Detail prototype id receiving the stroke. */
  readonly prototypeId: string;
  /** Edited density payload, or the source view when unchanged. */
  readonly density: Uint8Array;
  /** Sparse density byte changes. */
  readonly changes: readonly TerrainByteChange[];
  /** Updated prototype metadata matching the edited density and exact transforms. */
  readonly prototype: TerrainProjectDetailPrototype;
  /** Exact placements reconciled with changed density cells, when the source declared them. */
  readonly transforms?: TerrainProjectDetailTransforms;
}

/** Immutable exact-transform result for a session-only Detail placement. */
export interface TerrainExactDetailBrushResult {
  /** Stable Detail prototype receiving the generated transforms. */
  readonly prototypeId: string;
  /** Cells whose exact-transform count increased. */
  readonly changes: readonly TerrainByteChange[];
  /** Runtime prototype metadata matching the returned transform count. */
  readonly prototype: TerrainProjectDetailPrototype;
  /** Complete exact placements, including the source records. */
  readonly transforms: TerrainProjectDetailTransforms;
}

/** Immutable tree-paint result for one Region. */
export interface TerrainTreeBrushResult {
  /** Complete edited explicit instance list. */
  readonly instances: readonly TerrainProjectTreeInstance[];
  /** Number of added instances. */
  readonly added: number;
  /** Number of removed instances. */
  readonly removed: number;
}

/** Immutable ordinary placed-Prefab paint result for one Region. */
export interface TerrainObjectBrushResult {
  /** Complete edited explicit instance list. */
  readonly instances: readonly TerrainProjectPlacedPrefabInstance[];
  /** Number of added instances. */
  readonly added: number;
  /** Number of removed instances. */
  readonly removed: number;
}

/**
 * Paints one canonical layer across every matching same-resolution Alphamap channel in a Region.
 * @param document Canonical Region document containing independent Alphamaps.
 * @param stroke Renderer-independent texture stroke.
 * @returns Edited maps and exact sparse changes, or source views when the Region has no matching layer.
 * @throws If brush parameters are invalid or the selected layer is declared inconsistently.
 */
export function applyTerrainTextureBrush(
  document: TerrainProjectDocument,
  stroke: TerrainTextureBrushStroke
): TerrainTextureBrushResult {
  validateSurfacePath(stroke);
  requireUnitInterval(stroke.opacity, "texture opacity");
  requireUnitInterval(stroke.targetWeight, "texture targetWeight");
  const target = resolveLayerChannel(document, stroke.layerId);
  if (!target) return { alphamaps: document.alphamaps, maps: [] };
  const map = document.manifest.alphamaps[target.mapIndex];
  const influences = collectRasterInfluences(document, map.sampleSize, stroke);
  if (influences.size === 0) return { alphamaps: document.alphamaps, maps: [] };

  const compatibleMaps = document.manifest.alphamaps
    .map((candidate, mapIndex) => ({ candidate, mapIndex }))
    .filter(({ candidate }) => sameSampleSize(candidate.sampleSize, map.sampleSize));
  const edited = [...document.alphamaps];
  const changedByMap = new Map<number, Map<number, TerrainByteChange>>();
  for (const [texel, influence] of influences) {
    const targetOffset = texel * 4 + target.channel;
    const before = document.alphamaps[target.mapIndex][targetOffset];
    const desired = stroke.erase ? 0 : Math.round(stroke.targetWeight * 255);
    const selected = Math.round(before + (desired - before) * stroke.opacity * influence);
    const channels = compatibleMaps.flatMap(({ candidate, mapIndex }) =>
      candidate.layers.flatMap((layerId, channel) =>
        layerId === null ? [] : [{ mapIndex, channel, offset: texel * 4 + channel }]
      )
    );
    const others = channels.filter(
      (channel) => channel.mapIndex !== target.mapIndex || channel.channel !== target.channel
    );
    const otherTotal = others.reduce(
      (total, channel) => total + document.alphamaps[channel.mapIndex][channel.offset],
      0
    );
    const remaining = Math.max(0, 255 - selected);
    let allocated = 0;
    for (let index = 0; index < others.length; index++) {
      const channel = others[index];
      const source = document.alphamaps[channel.mapIndex][channel.offset];
      const next =
        index === others.length - 1
          ? remaining - allocated
          : otherTotal > 0
            ? Math.round((source / otherTotal) * remaining)
            : 0;
      allocated += next;
      recordByteChange(document.alphamaps, edited, channel.offset, next, changedByMap, channel.mapIndex);
    }
    recordByteChange(document.alphamaps, edited, targetOffset, selected, changedByMap, target.mapIndex);
  }
  return {
    alphamaps: edited,
    maps: [...changedByMap]
      .map(([mapIndex, changes]) => ({ mapIndex, changes: [...changes.values()].sort(compareByteChanges) }))
      .filter((entry) => entry.changes.length > 0)
      .sort((left, right) => left.mapIndex - right.mapIndex)
  };
}

/**
 * Creates one incremental texture session whose pointer updates mutate only a detached working copy.
 * @param document Canonical Region document used as the immutable session baseline.
 * @param settings Fixed brush settings excluding pointer points.
 * @returns Session producing compact GPU-ready Alphamap patches and one final atomic diff.
 * @throws If brush settings or the selected layer binding are invalid.
 */
export function createTerrainTextureBrushSession(
  document: TerrainProjectDocument,
  settings: TerrainTextureBrushSessionSettings
): TerrainTextureBrushSession {
  validateSurfacePath({ ...settings, points: [{ x: 0, z: 0 }] });
  requireUnitInterval(settings.opacity, "texture opacity");
  requireUnitInterval(settings.targetWeight, "texture targetWeight");
  const target = resolveLayerChannel(document, settings.layerId);
  if (!target) throw new Error(`Unknown Terrain layer ${JSON.stringify(settings.layerId)}`);
  return new IncrementalTerrainTextureBrushSession(document, settings, target);
}

/**
 * Creates one incremental Detail session whose pointer updates mutate only detached density and transform copies.
 * @param document Canonical Region document used as the immutable session baseline.
 * @param settings Fixed Detail settings excluding pointer points.
 * @param allocation Stable resource paths used when an empty prototype receives its first instances.
 * @returns Session producing current prototype state and one final atomic diff.
 * @throws If brush settings, prototype data, or allocation paths are invalid.
 */
export function createTerrainDetailBrushSession(
  document: TerrainProjectDocument,
  settings: TerrainDetailBrushSessionSettings,
  allocation?: TerrainDetailResourceAllocation
): TerrainDetailBrushSession {
  validateSurfacePath({ ...settings, points: [{ x: 0, z: 0 }] });
  requireUnitInterval(settings.opacity, "Detail opacity");
  requireUnitInterval(settings.distributionNoise, "Detail distributionNoise");
  if (!Number.isInteger(settings.targetCount) || settings.targetCount < 0 || settings.targetCount > 255) {
    throw new Error("Terrain Detail targetCount must be an integer in [0,255]");
  }
  if (!document.manifest.detailPrototypes.some((prototype) => prototype.id === settings.prototypeId)) {
    throw new Error(`Unknown Terrain Detail prototype "${settings.prototypeId}"`);
  }
  return new IncrementalTerrainDetailBrushSession(document, settings, allocation);
}

/**
 * Creates one incremental tree session whose pointer updates mutate only a detached instance list.
 * @param document Canonical Region document used as the immutable session baseline.
 * @param settings Fixed tree settings excluding pointer points.
 * @returns Session producing current explicit placements and one final atomic diff.
 * @throws If brush settings or prototype data are invalid.
 */
export function createTerrainTreeBrushSession(
  document: TerrainProjectDocument,
  settings: TerrainTreeBrushSessionSettings
): TerrainTreeBrushSession {
  validateSurfacePath({ ...settings, points: [{ x: 0, z: 0 }] });
  requireUnitInterval(settings.density, "tree density");
  requireUnitInterval(settings.distributionNoise, "tree distributionNoise");
  requirePositiveScaleRange(settings.minimumScale, settings.maximumScale);
  if (!document.manifest.treePrototypes.some((prototype) => prototype.id === settings.prototypeId)) {
    throw new Error(`Unknown Terrain tree prototype "${settings.prototypeId}"`);
  }
  return new IncrementalTerrainTreeBrushSession(document, settings);
}

/**
 * Creates one incremental ordinary-object session backed by a detached placement list.
 * @param document Canonical Region document used as the immutable session baseline.
 * @param settings Fixed object settings excluding pointer points.
 * @returns Session producing current explicit placements and one final atomic diff.
 * @throws If brush settings or prototype data are invalid.
 */
export function createTerrainObjectBrushSession(
  document: TerrainProjectDocument,
  settings: TerrainObjectBrushSessionSettings
): TerrainObjectBrushSession {
  validateSurfacePath({ ...settings, points: [{ x: 0, z: 0 }] });
  requireUnitInterval(settings.density, "object density");
  requirePositiveFinite(settings.referenceSpacingMetres, "object referenceSpacingMetres");
  requirePositiveScaleRange(settings.minimumScale, settings.maximumScale);
  if (!(document.manifest.placedPrefabPrototypes ?? []).some((prototype) => prototype.id === settings.prototypeId)) {
    throw new Error(`Unknown Terrain object prototype "${settings.prototypeId}"`);
  }
  return new IncrementalTerrainObjectBrushSession(document, settings);
}

/**
 * Paints one Detail density map and reconciles exact placements only inside changed density cells.
 * @param document Canonical Region document containing the selected Detail prototype.
 * @param stroke Renderer-independent Detail stroke.
 * @param allocation Stable Project virtual paths used only when an empty Detail receives its first values.
 * @returns Edited density, sparse changes, prototype metadata, and optional exact placements.
 * @throws If parameters, prototype declarations, or exact transform payloads are inconsistent.
 */
export function applyTerrainDetailBrush(
  document: TerrainProjectDocument,
  stroke: TerrainDetailBrushStroke,
  allocation?: TerrainDetailResourceAllocation
): TerrainDetailBrushResult {
  validateSurfacePath(stroke);
  requireUnitInterval(stroke.opacity, "Detail opacity");
  requireUnitInterval(stroke.distributionNoise, "Detail distributionNoise");
  if (!Number.isInteger(stroke.targetCount) || stroke.targetCount < 0 || stroke.targetCount > 255) {
    throw new Error("Terrain Detail targetCount must be an integer in [0,255]");
  }
  const prototype = document.manifest.detailPrototypes.find((candidate) => candidate.id === stroke.prototypeId);
  if (!prototype) throw new Error(`Unknown Terrain Detail prototype "${stroke.prototypeId}"`);
  const source =
    prototype.density.kind === "r8-count"
      ? document.detailMaps.get(stroke.prototypeId)
      : new Uint8Array(prototype.densitySampleSize[0] * prototype.densitySampleSize[1]);
  if (!source) throw new Error(`Terrain Detail prototype "${stroke.prototypeId}" density payload is not decoded`);
  const influences = collectRasterInfluences(document, prototype.densitySampleSize, stroke);
  if (influences.size === 0) {
    return {
      prototypeId: stroke.prototypeId,
      density: source,
      changes: [],
      prototype,
      transforms: document.detailTransforms.get(stroke.prototypeId)
    };
  }
  const density = source.slice();
  const changes: TerrainByteChange[] = [];
  for (const [index, influence] of [...influences].sort(([left], [right]) => left - right)) {
    const noise = stableUnitNoise(document.descriptor.id, stroke.prototypeId, index);
    const variation = 1 + (noise * 2 - 1) * stroke.distributionNoise;
    const desired = stroke.erase ? 0 : clamp(Math.round(stroke.targetCount * variation), 0, 255);
    const before = source[index];
    const after = Math.round(before + (desired - before) * stroke.opacity * influence);
    if (after === before) continue;
    density[index] = after;
    changes.push({ index, before, after });
  }
  if (changes.length === 0) {
    return {
      prototypeId: stroke.prototypeId,
      density: source,
      changes: [],
      prototype,
      transforms: document.detailTransforms.get(stroke.prototypeId)
    };
  }

  const maximumSourceCount = density.reduce((total, value) => total + value, 0);
  if (prototype.density.kind === "empty" && (!allocation?.densityDataUrl || allocation.densityDataUrl.length === 0)) {
    throw new Error(`Terrain Detail prototype "${stroke.prototypeId}" requires a new density resource path`);
  }
  const sourceTransforms = document.detailTransforms.get(stroke.prototypeId);
  const exactTransformsDataUrl = prototype.exactTransforms?.data.url ?? allocation?.exactTransformsDataUrl;
  const transforms = exactTransformsDataUrl
    ? reconcileDetailTransforms(
        document,
        prototype,
        sourceTransforms ?? { count: 0, values: new Float32Array() },
        source,
        density,
        new Set(changes.map((change) => change.index))
      )
    : undefined;
  const updated: TerrainProjectDetailPrototype = {
    ...prototype,
    density:
      prototype.density.kind === "r8-count"
        ? prototype.density
        : {
            kind: "r8-count",
            data: { url: allocation!.densityDataUrl },
            layout: TERRAIN_RASTER_LAYOUT,
            sha256: PENDING_RESOURCE_HASH
          },
    maximumSourceCount,
    exactTransforms: exactTransformsDataUrl
      ? {
          data: { url: exactTransformsDataUrl },
          format: TERRAIN_DETAIL_TRANSFORM_FORMAT,
          count: transforms!.count,
          sha256: PENDING_RESOURCE_HASH
        }
      : undefined
  };
  return { prototypeId: stroke.prototypeId, density, changes, prototype: updated, transforms };
}

/**
 * Appends session-only exact Detail placements without reading or writing the authoring density payload.
 * @param document Runtime Region document containing the selected Detail prototype.
 * @param stroke Renderer-independent placement stroke.
 * @returns Complete exact transforms and the runtime metadata required to render them.
 * @throws If the stroke, prototype, or source exact transforms are invalid.
 */
export function applyTerrainExactDetailBrush(
  document: TerrainProjectDocument,
  stroke: TerrainExactDetailBrushStroke
): TerrainExactDetailBrushResult {
  validateSurfacePath(stroke);
  requireUnitInterval(stroke.distributionNoise, "Detail distributionNoise");
  if (!Number.isInteger(stroke.targetCount) || stroke.targetCount < 0 || stroke.targetCount > 255) {
    throw new Error("Terrain exact Detail targetCount must be an integer in [0,255]");
  }
  const prototype = document.manifest.detailPrototypes.find((candidate) => candidate.id === stroke.prototypeId);
  if (!prototype) throw new Error(`Unknown Terrain Detail prototype "${stroke.prototypeId}"`);
  const source = document.detailTransforms.get(stroke.prototypeId) ?? {
    count: 0,
    values: new Float32Array()
  };
  if (source.values.length !== source.count * DETAIL_TRANSFORM_STRIDE) {
    throw new Error(`Terrain Detail prototype "${stroke.prototypeId}" exact transforms are missing or malformed`);
  }

  const [width, height] = prototype.densitySampleSize;
  const countByCell = new Map<number, number>();
  for (let record = 0; record < source.count; record++) {
    const offset = record * DETAIL_TRANSFORM_STRIDE;
    const cell = detailCellIndex(
      source.values[offset],
      source.values[offset + 2],
      document.descriptor.worldSize[0],
      document.descriptor.worldSize[2],
      width,
      height
    );
    countByCell.set(cell, (countByCell.get(cell) ?? 0) + 1);
  }

  const additions: Array<{ cell: number; count: number; ordinal: number }> = [];
  const changes: TerrainByteChange[] = [];
  for (const [cell, influence] of [...collectRasterInfluences(document, prototype.densitySampleSize, stroke)].sort(
    ([left], [right]) => left - right
  )) {
    const before = countByCell.get(cell) ?? 0;
    const noise = stableUnitNoise(document.descriptor.id, stroke.prototypeId, cell);
    const variation = 1 + (noise * 2 - 1) * stroke.distributionNoise;
    const desired = clamp(Math.round(stroke.targetCount * variation), 0, 255);
    const after = Math.max(before, Math.round(before + (desired - before) * influence));
    if (after <= before) continue;
    additions.push({ cell, count: after - before, ordinal: before });
    changes.push({ index: cell, before, after });
  }

  if (additions.length === 0) {
    return { prototypeId: stroke.prototypeId, changes, prototype, transforms: source };
  }
  const values = Array.from(source.values);
  for (const addition of additions) {
    const cellX = addition.cell % width;
    const cellZ = Math.floor(addition.cell / width);
    for (let added = 0; added < addition.count; added++) {
      const random = mulberry32(
        hashStableValues(document.descriptor.id, prototype.id, addition.cell, addition.ordinal + added)
      );
      const localX = ((cellX + random()) / width) * document.descriptor.worldSize[0];
      const localZ = ((cellZ + random()) / height) * document.descriptor.worldSize[2];
      const worldY = sampleTerrainDocumentHeight(
        document,
        document.descriptor.worldPosition[0] + localX,
        document.descriptor.worldPosition[2] + localZ
      );
      if (worldY === null) throw new Error(`Terrain Detail prototype "${prototype.id}" generated outside its Region`);
      values.push(
        localX,
        worldY - document.descriptor.worldPosition[1],
        localZ,
        random() * Math.PI * 2,
        prototype.minWidth + random() * (prototype.maxWidth - prototype.minWidth),
        prototype.minHeight + random() * (prototype.maxHeight - prototype.minHeight)
      );
    }
  }
  const transforms: TerrainProjectDetailTransforms = {
    count: values.length / DETAIL_TRANSFORM_STRIDE,
    values: Float32Array.from(values)
  };
  const updated: TerrainProjectDetailPrototype = {
    ...prototype,
    maximumSourceCount: transforms.count,
    ...(prototype.exactTransforms
      ? {
          exactTransforms: {
            ...prototype.exactTransforms,
            count: transforms.count,
            sha256: PENDING_RESOURCE_HASH
          }
        }
      : {})
  };
  return { prototypeId: stroke.prototypeId, changes, prototype: updated, transforms };
}

/**
 * Places or erases explicit canonical tree instances and samples every added instance from the Region heightfield.
 * @param document Canonical Region document receiving the stroke.
 * @param stroke Renderer-independent tree stroke.
 * @returns Complete instance list and added/removed counts.
 * @throws If brush parameters or the selected prototype are invalid.
 */
export function applyTerrainTreeBrush(
  document: TerrainProjectDocument,
  stroke: TerrainTreeBrushStroke
): TerrainTreeBrushResult {
  validateSurfacePath(stroke);
  requireUnitInterval(stroke.density, "tree density");
  requireUnitInterval(stroke.distributionNoise, "tree distributionNoise");
  if (stroke.targetCount !== undefined && (!Number.isInteger(stroke.targetCount) || stroke.targetCount <= 0)) {
    throw new Error("Terrain tree targetCount must be a positive integer");
  }
  if (
    !Number.isFinite(stroke.minimumScale) ||
    !Number.isFinite(stroke.maximumScale) ||
    stroke.minimumScale <= 0 ||
    stroke.maximumScale < stroke.minimumScale
  ) {
    throw new Error("Terrain tree scale range must contain increasing positive finite values");
  }
  const prototype = document.manifest.treePrototypes.find((candidate) => candidate.id === stroke.prototypeId);
  if (!prototype) throw new Error(`Unknown Terrain tree prototype "${stroke.prototypeId}"`);
  const stamps = resampleSurfacePath(stroke.points, stroke.spacingMetres);
  if (!stamps.some((stamp) => circleIntersectsRegion(document, stamp, stroke.radiusMetres))) {
    return { instances: document.manifest.treeInstances, added: 0, removed: 0 };
  }

  if (stroke.erase) {
    const instances = document.manifest.treeInstances.filter((instance) => {
      if (stroke.eraseSelectedOnly && instance.prototypeId !== stroke.prototypeId) return true;
      const worldX = document.descriptor.worldPosition[0] + instance.localPosition[0];
      const worldZ = document.descriptor.worldPosition[2] + instance.localPosition[2];
      return !stamps.some((stamp) => Math.hypot(worldX - stamp.x, worldZ - stamp.z) <= stroke.radiusMetres);
    });
    return {
      instances,
      added: 0,
      removed: document.manifest.treeInstances.length - instances.length
    };
  }
  if (stroke.density === 0) return { instances: document.manifest.treeInstances, added: 0, removed: 0 };

  const instances = [...document.manifest.treeInstances];
  const selectedInstances = instances.filter((instance) => instance.prototypeId === stroke.prototypeId);
  const ids = new Set(instances.map((instance) => instance.id));
  // Explicit counts describe additions inside the current stamp, so their
  // spacing scales with the available brush area instead of full-density spacing.
  const minimumDistance =
    stroke.targetCount === undefined
      ? TREE_REFERENCE_SPACING_METRES / Math.sqrt(stroke.density)
      : Math.min(
          TREE_REFERENCE_SPACING_METRES / Math.sqrt(stroke.density),
          (stroke.radiusMetres * 0.72) / Math.sqrt(stroke.targetCount)
        );
  let added = 0;
  for (let stampIndex = 0; stampIndex < stamps.length; stampIndex++) {
    const stamp = stamps[stampIndex];
    if (!circleIntersectsRegion(document, stamp, stroke.radiusMetres)) continue;
    const stampNoise = stableUnitNoise(document.descriptor.id, stroke.prototypeId, stamp.x, stamp.z, stampIndex);
    const densityVariation = 1 + (stampNoise * 2 - 1) * stroke.distributionNoise;
    const localDensity = clamp(stroke.density * densityVariation, 0, 1);
    const count =
      stroke.targetCount ??
      Math.max(1, Math.ceil(localDensity * Math.PI * stroke.radiusMetres ** 2 * TREE_FULL_DENSITY_PER_SQUARE_METRE));
    const selectedPopulation = selectedInstances.length;
    let placedForStamp = 0;
    const maximumAttempts = count * TREE_PLACEMENT_ATTEMPTS_PER_INSTANCE;
    for (let attempt = 0; attempt < maximumAttempts && placedForStamp < count; attempt++) {
      const seed = hashStableValues(
        document.descriptor.id,
        stroke.prototypeId,
        stamp.x,
        stamp.z,
        stampIndex,
        selectedPopulation,
        attempt
      );
      const random = mulberry32(seed);
      const radialSample = random();
      const radius = attempt === 0 ? 0 : Math.sqrt(radialSample) * stroke.radiusMetres;
      const angle = random() * Math.PI * 2;
      const worldX = clamp(
        stamp.x + Math.cos(angle) * radius,
        document.descriptor.worldPosition[0],
        document.descriptor.worldPosition[0] + document.descriptor.worldSize[0]
      );
      const worldZ = clamp(
        stamp.z + Math.sin(angle) * radius,
        document.descriptor.worldPosition[2],
        document.descriptor.worldPosition[2] + document.descriptor.worldSize[2]
      );
      if (
        selectedInstances.some(
          (instance) =>
            Math.hypot(
              document.descriptor.worldPosition[0] + instance.localPosition[0] - worldX,
              document.descriptor.worldPosition[2] + instance.localPosition[2] - worldZ
            ) < minimumDistance
        )
      ) {
        continue;
      }
      const worldY = sampleTerrainDocumentHeight(document, worldX, worldZ);
      if (worldY === null) continue;
      const scale = stroke.minimumScale + random() * (stroke.maximumScale - stroke.minimumScale);
      let id = `tree-${seed.toString(16).padStart(8, "0")}`;
      let collision = 0;
      while (ids.has(id)) id = `tree-${seed.toString(16).padStart(8, "0")}-${++collision}`;
      ids.add(id);
      instances.push({
        id,
        prototypeId: prototype.id,
        localPosition: [
          worldX - document.descriptor.worldPosition[0],
          worldY - document.descriptor.worldPosition[1],
          worldZ - document.descriptor.worldPosition[2]
        ],
        rotationYRadians: stroke.randomRotation ? random() * Math.PI * 2 : 0,
        scale: [scale, scale, scale],
        color: [1, 1, 1, 1],
        lightmapColor: [1, 1, 1, 1]
      });
      selectedInstances.push(instances[instances.length - 1]);
      added++;
      placedForStamp++;
    }
  }
  instances.sort((left, right) => compareStableStrings(left.id, right.id));
  return { instances, added, removed: 0 };
}

/**
 * Places or erases ordinary canonical Prefab instances and snaps additions to the Region heightfield.
 * @param document Canonical Region document receiving the stroke.
 * @param stroke Renderer-independent object stroke.
 * @returns Complete instance list and added or removed counts.
 * @throws If brush parameters or the selected prototype are invalid.
 */
export function applyTerrainObjectBrush(
  document: TerrainProjectDocument,
  stroke: TerrainObjectBrushStroke
): TerrainObjectBrushResult {
  validateSurfacePath(stroke);
  requireUnitInterval(stroke.density, "object density");
  requirePositiveFinite(stroke.referenceSpacingMetres, "object referenceSpacingMetres");
  requirePositiveScaleRange(stroke.minimumScale, stroke.maximumScale);
  if (stroke.targetCount !== undefined && (!Number.isInteger(stroke.targetCount) || stroke.targetCount <= 0)) {
    throw new RangeError("object targetCount must be a positive integer");
  }
  const prototype = (document.manifest.placedPrefabPrototypes ?? []).find(
    (candidate) => candidate.id === stroke.prototypeId
  );
  if (!prototype) throw new Error(`Unknown Terrain object prototype "${stroke.prototypeId}"`);
  const sourceInstances = document.manifest.placedPrefabInstances ?? [];
  const stamps = resampleSurfacePath(stroke.points, stroke.spacingMetres);
  if (!stamps.some((stamp) => circleIntersectsRegion(document, stamp, stroke.radiusMetres))) {
    return { instances: sourceInstances, added: 0, removed: 0 };
  }
  if (stroke.erase) {
    const instances = sourceInstances.filter((instance) => {
      if (instance.prototypeId !== stroke.prototypeId) return true;
      const worldX = document.descriptor.worldPosition[0] + instance.localPosition[0];
      const worldZ = document.descriptor.worldPosition[2] + instance.localPosition[2];
      return !stamps.some((stamp) => Math.hypot(worldX - stamp.x, worldZ - stamp.z) <= stroke.radiusMetres);
    });
    return { instances, added: 0, removed: sourceInstances.length - instances.length };
  }
  if (stroke.density === 0) return { instances: sourceInstances, added: 0, removed: 0 };

  const instances = [...sourceInstances];
  const selectedInstances = instances.filter((instance) => instance.prototypeId === stroke.prototypeId);
  const ids = new Set(instances.map((instance) => instance.id));
  const densityResponsiveSpacing = Math.min(
    stroke.referenceSpacingMetres,
    stroke.radiusMetres * OBJECT_BRUSH_SPACING_RATIO
  );
  const minimumDistance = densityResponsiveSpacing / Math.sqrt(stroke.density);
  let added = 0;
  for (let stampIndex = 0; stampIndex < stamps.length; stampIndex++) {
    const stamp = stamps[stampIndex];
    if (!circleIntersectsRegion(document, stamp, stroke.radiusMetres)) continue;
    const fullDensityCount = Math.min(
      MAX_OBJECT_PLACEMENTS_PER_STAMP,
      Math.max(
        MIN_OBJECT_FULL_DENSITY_COUNT_PER_STAMP,
        Math.round(
          (Math.PI * stroke.radiusMetres ** 2 * OBJECT_PLACEMENT_AREA_OCCUPANCY) / densityResponsiveSpacing ** 2
        )
      )
    );
    const count = stroke.targetCount ?? Math.max(1, Math.ceil(fullDensityCount * stroke.density));
    const selectedPopulation = selectedInstances.length;
    let placedForStamp = 0;
    const maximumAttempts = count * OBJECT_PLACEMENT_ATTEMPTS_PER_INSTANCE;
    for (let attempt = 0; attempt < maximumAttempts && placedForStamp < count; attempt++) {
      const seed = hashStableValues(
        document.descriptor.id,
        stroke.prototypeId,
        stamp.x,
        stamp.z,
        stampIndex,
        selectedPopulation,
        attempt
      );
      const random = mulberry32(seed);
      const radialSample = random();
      const radius = attempt === 0 ? 0 : Math.sqrt(radialSample) * stroke.radiusMetres;
      const angle = random() * Math.PI * 2;
      const worldX = clamp(
        stamp.x + Math.cos(angle) * radius,
        document.descriptor.worldPosition[0],
        document.descriptor.worldPosition[0] + document.descriptor.worldSize[0]
      );
      const worldZ = clamp(
        stamp.z + Math.sin(angle) * radius,
        document.descriptor.worldPosition[2],
        document.descriptor.worldPosition[2] + document.descriptor.worldSize[2]
      );
      if (
        selectedInstances.some(
          (instance) =>
            Math.hypot(
              document.descriptor.worldPosition[0] + instance.localPosition[0] - worldX,
              document.descriptor.worldPosition[2] + instance.localPosition[2] - worldZ
            ) < minimumDistance
        )
      ) {
        continue;
      }
      const worldY = sampleTerrainDocumentHeight(document, worldX, worldZ);
      if (worldY === null) continue;
      const scale = stroke.minimumScale + random() * (stroke.maximumScale - stroke.minimumScale);
      const yaw = random() * Math.PI * 2;
      let id = `object-${seed.toString(16).padStart(8, "0")}`;
      let collision = 0;
      while (ids.has(id)) id = `object-${seed.toString(16).padStart(8, "0")}-${++collision}`;
      ids.add(id);
      const instance: TerrainProjectPlacedPrefabInstance = {
        id,
        prototypeId: prototype.id,
        localPosition: [
          worldX - document.descriptor.worldPosition[0],
          worldY - document.descriptor.worldPosition[1],
          worldZ - document.descriptor.worldPosition[2]
        ],
        localRotationQuaternion: [0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)],
        localScale: [scale, scale, scale]
      };
      instances.push(instance);
      selectedInstances.push(instance);
      added++;
      placedForStamp++;
    }
  }
  instances.sort((left, right) => compareStableStrings(left.id, right.id));
  return { instances, added, removed: 0 };
}

class IncrementalTerrainTextureBrushSession implements TerrainTextureBrushSession {
  private readonly _working: Uint8Array[];
  private readonly _changesByMap = new Map<number, Map<number, TerrainByteChange>>();
  private readonly _sampler: IncrementalSurfaceStampSampler;
  private _finished = false;

  constructor(
    private readonly _document: TerrainProjectDocument,
    private readonly _settings: TerrainTextureBrushSessionSettings,
    private readonly _target: { mapIndex: number; channel: number }
  ) {
    this._working = [..._document.alphamaps];
    this._sampler = new IncrementalSurfaceStampSampler(_settings.spacingMetres);
  }

  appendPoint(point: TerrainSurfaceBrushPoint): readonly TerrainTextureBrushPatch[] {
    this._assertOpen();
    const changedByMap = new Map<number, Set<number>>();
    for (const stamp of this._sampler.append(point)) this._applyStamp(stamp, changedByMap);
    return this._createPatches(this._working, changedByMap);
  }

  finish(): TerrainTextureBrushResult {
    this._assertOpen();
    const endpoint = this._sampler.finish();
    if (endpoint) this._applyStamp(endpoint, new Map());
    this._finished = true;
    return {
      alphamaps: this._changesByMap.size > 0 ? this._working : this._document.alphamaps,
      maps: [...this._changesByMap]
        .map(([mapIndex, changes]) => ({ mapIndex, changes: [...changes.values()].sort(compareByteChanges) }))
        .filter((entry) => entry.changes.length > 0)
        .sort((left, right) => left.mapIndex - right.mapIndex)
    };
  }

  cancel(): readonly TerrainTextureBrushPatch[] {
    this._assertOpen();
    this._finished = true;
    return this._createPatches(
      this._document.alphamaps,
      new Map([...this._changesByMap].map(([mapIndex, changes]) => [mapIndex, new Set(changes.keys())]))
    );
  }

  private _applyStamp(stamp: TerrainSurfaceBrushPoint, changedByMap: Map<number, Set<number>>): void {
    const targetMap = this._document.manifest.alphamaps[this._target.mapIndex];
    const influences = collectRasterInfluences(this._document, targetMap.sampleSize, {
      ...this._settings,
      points: [stamp]
    });
    if (influences.size === 0) return;
    const compatibleMaps = this._document.manifest.alphamaps
      .map((candidate, mapIndex) => ({ candidate, mapIndex }))
      .filter(({ candidate }) => sameSampleSize(candidate.sampleSize, targetMap.sampleSize));
    for (const [texel, influence] of influences) {
      const targetOffset = texel * 4 + this._target.channel;
      const current = this._working[this._target.mapIndex][targetOffset];
      const desired = this._settings.erase ? 0 : Math.round(this._settings.targetWeight * 255);
      const selected = Math.round(current + (desired - current) * this._settings.opacity * influence);
      const channels = compatibleMaps.flatMap(({ candidate, mapIndex }) =>
        candidate.layers.flatMap((layerId, channel) =>
          layerId === null ? [] : [{ mapIndex, channel, offset: texel * 4 + channel }]
        )
      );
      const others = channels.filter(
        (channel) => channel.mapIndex !== this._target.mapIndex || channel.channel !== this._target.channel
      );
      const otherTotal = others.reduce((total, channel) => total + this._working[channel.mapIndex][channel.offset], 0);
      const remaining = Math.max(0, 255 - selected);
      let allocated = 0;
      for (let index = 0; index < others.length; index++) {
        const channel = others[index];
        const source = this._working[channel.mapIndex][channel.offset];
        const next =
          index === others.length - 1
            ? remaining - allocated
            : otherTotal > 0
              ? Math.round((source / otherTotal) * remaining)
              : 0;
        allocated += next;
        this._write(channel.mapIndex, channel.offset, next, changedByMap);
      }
      this._write(this._target.mapIndex, targetOffset, selected, changedByMap);
    }
  }

  private _write(mapIndex: number, index: number, value: number, changedByMap: Map<number, Set<number>>): void {
    const after = clamp(Math.round(value), 0, 255);
    const current = this._working[mapIndex][index];
    if (after === current) return;
    if (this._working[mapIndex] === this._document.alphamaps[mapIndex]) {
      this._working[mapIndex] = this._document.alphamaps[mapIndex].slice();
    }
    this._working[mapIndex][index] = after;
    let changed = changedByMap.get(mapIndex);
    if (!changed) changedByMap.set(mapIndex, (changed = new Set()));
    changed.add(index);
    const baseline = this._document.alphamaps[mapIndex][index];
    let finalChanges = this._changesByMap.get(mapIndex);
    if (!finalChanges) this._changesByMap.set(mapIndex, (finalChanges = new Map()));
    if (after === baseline) finalChanges.delete(index);
    else finalChanges.set(index, { index, before: baseline, after });
    if (finalChanges.size === 0) this._changesByMap.delete(mapIndex);
  }

  private _createPatches(
    sources: readonly Uint8Array[],
    changedByMap: ReadonlyMap<number, ReadonlySet<number>>
  ): readonly TerrainTextureBrushPatch[] {
    const patches: TerrainTextureBrushPatch[] = [];
    for (const [mapIndex, changed] of changedByMap) {
      if (changed.size === 0) continue;
      const [sampleWidth] = this._document.manifest.alphamaps[mapIndex].sampleSize;
      let minX = Number.POSITIVE_INFINITY;
      let minZ = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxZ = Number.NEGATIVE_INFINITY;
      for (const byteIndex of changed) {
        const texel = Math.floor(byteIndex / 4);
        const x = texel % sampleWidth;
        const z = Math.floor(texel / sampleWidth);
        minX = Math.min(minX, x);
        minZ = Math.min(minZ, z);
        maxX = Math.max(maxX, x);
        maxZ = Math.max(maxZ, z);
      }
      const width = maxX - minX + 1;
      const height = maxZ - minZ + 1;
      const pixels = new Uint8Array(width * height * 4);
      for (let z = 0; z < height; z++) {
        const sourceOffset = ((minZ + z) * sampleWidth + minX) * 4;
        pixels.set(sources[mapIndex].subarray(sourceOffset, sourceOffset + width * 4), z * width * 4);
      }
      patches.push({ mapIndex, sampleOrigin: [minX, minZ], sampleSize: [width, height], pixels });
    }
    return patches.sort((left, right) => left.mapIndex - right.mapIndex);
  }

  private _assertOpen(): void {
    if (this._finished) throw new Error("Terrain texture brush session is already finished");
  }
}

class IncrementalTerrainDetailBrushSession implements TerrainDetailBrushSession {
  private readonly _sampler: IncrementalSurfaceStampSampler;
  private _working: TerrainProjectDocument;
  private _finished = false;

  constructor(
    private readonly _baseline: TerrainProjectDocument,
    private readonly _settings: TerrainDetailBrushSessionSettings,
    private readonly _allocation?: TerrainDetailResourceAllocation
  ) {
    this._working = _baseline;
    this._sampler = new IncrementalSurfaceStampSampler(_settings.spacingMetres);
  }

  appendPoint(point: TerrainSurfaceBrushPoint): TerrainDetailBrushResult | null {
    this._assertOpen();
    let latest: TerrainDetailBrushResult | null = null;
    for (const stamp of this._sampler.append(point)) latest = this._applyStamp(stamp) ?? latest;
    return latest;
  }

  finish(): TerrainDetailBrushResult {
    this._assertOpen();
    const endpoint = this._sampler.finish();
    if (endpoint) this._applyStamp(endpoint);
    this._finished = true;
    const baselinePrototype = this._requirePrototype(this._baseline);
    const prototype = this._requirePrototype(this._working);
    const baselineDensity = resolveDetailDensity(this._baseline, baselinePrototype);
    const density = resolveDetailDensity(this._working, prototype);
    return {
      prototypeId: this._settings.prototypeId,
      density,
      changes: collectByteChanges(baselineDensity, density),
      prototype,
      transforms: this._working.detailTransforms.get(this._settings.prototypeId)
    };
  }

  cancel(): void {
    this._assertOpen();
    this._finished = true;
  }

  private _applyStamp(stamp: TerrainSurfaceBrushPoint): TerrainDetailBrushResult | null {
    const result = applyTerrainDetailBrush(this._working, { ...this._settings, points: [stamp] }, this._allocation);
    if (result.changes.length === 0) return null;
    const prototypeIndex = this._working.manifest.detailPrototypes.findIndex(
      (prototype) => prototype.id === this._settings.prototypeId
    );
    const prototypes = [...this._working.manifest.detailPrototypes];
    prototypes[prototypeIndex] = result.prototype;
    const detailMaps = new Map(this._working.detailMaps);
    detailMaps.set(this._settings.prototypeId, result.density);
    const detailTransforms = new Map(this._working.detailTransforms);
    if (result.transforms) detailTransforms.set(this._settings.prototypeId, result.transforms);
    this._working = {
      ...this._working,
      manifest: { ...this._working.manifest, detailPrototypes: prototypes },
      detailMaps,
      detailTransforms
    };
    return result;
  }

  private _requirePrototype(document: TerrainProjectDocument): TerrainProjectDetailPrototype {
    const prototype = document.manifest.detailPrototypes.find(
      (candidate) => candidate.id === this._settings.prototypeId
    );
    if (!prototype) throw new Error(`Unknown Terrain Detail prototype "${this._settings.prototypeId}"`);
    return prototype;
  }

  private _assertOpen(): void {
    if (this._finished) throw new Error("Terrain Detail brush session is already finished");
  }
}

class IncrementalTerrainTreeBrushSession implements TerrainTreeBrushSession {
  private readonly _sampler: IncrementalSurfaceStampSampler;
  private _working: TerrainProjectDocument;
  private _finished = false;

  constructor(
    private readonly _baseline: TerrainProjectDocument,
    private readonly _settings: TerrainTreeBrushSessionSettings
  ) {
    this._working = _baseline;
    this._sampler = new IncrementalSurfaceStampSampler(_settings.spacingMetres);
  }

  appendPoint(point: TerrainSurfaceBrushPoint): TerrainTreeBrushResult | null {
    this._assertOpen();
    let latest: TerrainTreeBrushResult | null = null;
    for (const stamp of this._sampler.append(point)) latest = this._applyStamp(stamp) ?? latest;
    return latest;
  }

  finish(): TerrainTreeBrushResult {
    this._assertOpen();
    const endpoint = this._sampler.finish();
    if (endpoint) this._applyStamp(endpoint);
    this._finished = true;
    const baselineIds = new Set(this._baseline.manifest.treeInstances.map((instance) => instance.id));
    const current = this._working.manifest.treeInstances;
    const currentIds = new Set(current.map((instance) => instance.id));
    return {
      instances: current,
      added: current.reduce((count, instance) => count + Number(!baselineIds.has(instance.id)), 0),
      removed: this._baseline.manifest.treeInstances.reduce(
        (count, instance) => count + Number(!currentIds.has(instance.id)),
        0
      )
    };
  }

  cancel(): void {
    this._assertOpen();
    this._finished = true;
  }

  private _applyStamp(stamp: TerrainSurfaceBrushPoint): TerrainTreeBrushResult | null {
    const result = applyTerrainTreeBrush(this._working, { ...this._settings, points: [stamp] });
    if (result.added === 0 && result.removed === 0) return null;
    this._working = {
      ...this._working,
      manifest: { ...this._working.manifest, treeInstances: [...result.instances] }
    };
    return result;
  }

  private _assertOpen(): void {
    if (this._finished) throw new Error("Terrain tree brush session is already finished");
  }
}

class IncrementalTerrainObjectBrushSession implements TerrainObjectBrushSession {
  private readonly _sampler: IncrementalSurfaceStampSampler;
  private _working: TerrainProjectDocument;
  private _finished = false;

  constructor(
    private readonly _baseline: TerrainProjectDocument,
    private readonly _settings: TerrainObjectBrushSessionSettings
  ) {
    this._working = _baseline;
    this._sampler = new IncrementalSurfaceStampSampler(_settings.spacingMetres);
  }

  appendPoint(point: TerrainSurfaceBrushPoint): TerrainObjectBrushResult | null {
    this._assertOpen();
    let latest: TerrainObjectBrushResult | null = null;
    for (const stamp of this._sampler.append(point)) latest = this._applyStamp(stamp) ?? latest;
    return latest;
  }

  finish(): TerrainObjectBrushResult {
    this._assertOpen();
    const endpoint = this._sampler.finish();
    if (endpoint) this._applyStamp(endpoint);
    this._finished = true;
    const baseline = this._baseline.manifest.placedPrefabInstances ?? [];
    const current = this._working.manifest.placedPrefabInstances ?? [];
    const baselineIds = new Set(baseline.map((instance) => instance.id));
    const currentIds = new Set(current.map((instance) => instance.id));
    return {
      instances: current,
      added: current.reduce((count, instance) => count + Number(!baselineIds.has(instance.id)), 0),
      removed: baseline.reduce((count, instance) => count + Number(!currentIds.has(instance.id)), 0)
    };
  }

  cancel(): void {
    this._assertOpen();
    this._finished = true;
  }

  private _applyStamp(stamp: TerrainSurfaceBrushPoint): TerrainObjectBrushResult | null {
    const result = applyTerrainObjectBrush(this._working, { ...this._settings, points: [stamp] });
    if (result.added === 0 && result.removed === 0) return null;
    this._working = {
      ...this._working,
      manifest: { ...this._working.manifest, placedPrefabInstances: [...result.instances] }
    };
    return result;
  }

  private _assertOpen(): void {
    if (this._finished) throw new Error("Terrain object brush session is already finished");
  }
}

class IncrementalSurfaceStampSampler {
  private _lastPoint: TerrainSurfaceBrushPoint | null = null;
  private _lastStamp: TerrainSurfaceBrushPoint | null = null;
  private _distanceSinceStamp = 0;
  private _finished = false;

  constructor(private readonly _spacingMetres: number) {
    if (!Number.isFinite(_spacingMetres) || _spacingMetres <= 0) {
      throw new Error("Terrain surface brush spacingMetres must be positive and finite");
    }
  }

  append(point: TerrainSurfaceBrushPoint): readonly TerrainSurfaceBrushPoint[] {
    this._assertOpen();
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new Error("Terrain surface brush points must be finite");
    }
    const nextPoint = { x: point.x, z: point.z };
    if (!this._lastPoint) {
      this._lastPoint = nextPoint;
      this._lastStamp = nextPoint;
      return [nextPoint];
    }
    const stamps: TerrainSurfaceBrushPoint[] = [];
    let cursor = this._lastPoint;
    let dx = nextPoint.x - cursor.x;
    let dz = nextPoint.z - cursor.z;
    let segmentLength = Math.hypot(dx, dz);
    while (segmentLength > BRUSH_PATH_EPSILON_METRES) {
      const distanceUntilStamp = this._spacingMetres - this._distanceSinceStamp;
      if (segmentLength + BRUSH_PATH_EPSILON_METRES < distanceUntilStamp) {
        this._distanceSinceStamp += segmentLength;
        break;
      }
      const ratio = Math.min(1, distanceUntilStamp / segmentLength);
      cursor = { x: cursor.x + dx * ratio, z: cursor.z + dz * ratio };
      stamps.push(cursor);
      this._lastStamp = cursor;
      this._distanceSinceStamp = 0;
      dx = nextPoint.x - cursor.x;
      dz = nextPoint.z - cursor.z;
      segmentLength = Math.hypot(dx, dz);
    }
    this._lastPoint = nextPoint;
    return stamps;
  }

  finish(): TerrainSurfaceBrushPoint | null {
    this._assertOpen();
    this._finished = true;
    if (!this._lastPoint) throw new Error("Terrain surface brush session requires at least one point");
    return !this._lastStamp || distanceSquared(this._lastPoint, this._lastStamp) > BRUSH_PATH_EPSILON_METRES ** 2
      ? this._lastPoint
      : null;
  }

  private _assertOpen(): void {
    if (this._finished) throw new Error("Terrain surface stamp sampler is already finished");
  }
}

function reconcileDetailTransforms(
  document: TerrainProjectDocument,
  prototype: TerrainProjectDetailPrototype,
  sourceTransforms: TerrainProjectDetailTransforms | undefined,
  sourceDensity: Uint8Array,
  density: Uint8Array,
  changedCells: ReadonlySet<number>
): TerrainProjectDetailTransforms {
  if (!sourceTransforms || sourceTransforms.values.length !== sourceTransforms.count * DETAIL_TRANSFORM_STRIDE) {
    throw new Error(`Terrain Detail prototype "${prototype.id}" exact transforms are missing or malformed`);
  }
  const [width, height] = prototype.densitySampleSize;
  const records = new Array<{ index: number; cell: number }>(sourceTransforms.count);
  const recordCountByCell = new Map<number, number>();
  for (let record = 0; record < sourceTransforms.count; record++) {
    const offset = record * DETAIL_TRANSFORM_STRIDE;
    const cell = detailCellIndex(
      sourceTransforms.values[offset],
      sourceTransforms.values[offset + 2],
      document.descriptor.worldSize[0],
      document.descriptor.worldSize[2],
      width,
      height
    );
    records[record] = { index: record, cell };
    recordCountByCell.set(cell, (recordCountByCell.get(cell) ?? 0) + 1);
  }

  // The contract guarantees total-count parity, not identical density and exact-transform bins.
  const removalCells = new Set<number>();
  const additions: Array<{ cell: number; count: number }> = [];
  let removalCount = 0;
  for (const cell of changedCells) {
    const delta = density[cell] - sourceDensity[cell];
    if (delta < 0) {
      removalCells.add(cell);
      removalCount -= delta;
    } else if (delta > 0) {
      additions.push({ cell, count: delta });
    }
  }

  const removedRecords = new Set<number>();
  if (removalCount > 0) {
    const removalTargets = [...removalCells];
    const candidates = [...records].sort((left, right) => {
      const leftPriority = removalCells.has(left.cell) ? 0 : 1;
      const rightPriority = removalCells.has(right.cell) ? 0 : 1;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const leftDistance = minimumDetailCellDistanceSquared(left.cell, removalTargets, width);
      const rightDistance = minimumDetailCellDistanceSquared(right.cell, removalTargets, width);
      return leftDistance - rightDistance || left.index - right.index;
    });
    for (let index = 0; index < removalCount; index++) removedRecords.add(candidates[index].index);
  }

  const output: number[] = [];
  for (let record = 0; record < sourceTransforms.count; record++) {
    if (removedRecords.has(record)) continue;
    const offset = record * DETAIL_TRANSFORM_STRIDE;
    appendTransform(output, sourceTransforms.values, offset);
  }

  additions.sort((left, right) => left.cell - right.cell);
  for (const addition of additions) {
    const existing = recordCountByCell.get(addition.cell) ?? 0;
    for (let added = 0; added < addition.count; added++) {
      const cell = addition.cell;
      const ordinal = existing + added;
      const seed = hashStableValues(document.descriptor.id, prototype.id, cell, ordinal);
      const random = mulberry32(seed);
      const cellX = cell % width;
      const cellZ = Math.floor(cell / width);
      const localX = ((cellX + random()) / width) * document.descriptor.worldSize[0];
      const localZ = ((cellZ + random()) / height) * document.descriptor.worldSize[2];
      const worldY = sampleTerrainDocumentHeight(
        document,
        document.descriptor.worldPosition[0] + localX,
        document.descriptor.worldPosition[2] + localZ
      );
      if (worldY === null) throw new Error(`Terrain Detail prototype "${prototype.id}" generated outside its Region`);
      output.push(
        localX,
        worldY - document.descriptor.worldPosition[1],
        localZ,
        random() * Math.PI * 2,
        prototype.minWidth + random() * (prototype.maxWidth - prototype.minWidth),
        prototype.minHeight + random() * (prototype.maxHeight - prototype.minHeight)
      );
    }
  }
  const count = output.length / DETAIL_TRANSFORM_STRIDE;
  const expected = density.reduce((total, value) => total + value, 0);
  if (count !== expected) {
    throw new Error(`Terrain Detail prototype "${prototype.id}" reconciled ${count} transforms; expected ${expected}`);
  }
  return { count, values: Float32Array.from(output) };
}

function minimumDetailCellDistanceSquared(cell: number, targets: readonly number[], width: number): number {
  const x = cell % width;
  const z = Math.floor(cell / width);
  let minimum = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const dx = x - (target % width);
    const dz = z - Math.floor(target / width);
    minimum = Math.min(minimum, dx * dx + dz * dz);
  }
  return minimum;
}

function collectRasterInfluences(
  document: TerrainProjectDocument,
  sampleSize: readonly [number, number],
  path: TerrainSurfaceBrushPath
): Map<number, number> {
  const stamps = resampleSurfacePath(path.points, path.spacingMetres);
  const [width, height] = sampleSize;
  const originX = document.descriptor.worldPosition[0];
  const originZ = document.descriptor.worldPosition[2];
  const extentX = document.descriptor.worldSize[0];
  const extentZ = document.descriptor.worldSize[2];
  const influences = new Map<number, number>();
  for (const stamp of stamps) {
    if (!circleIntersectsRegion(document, stamp, path.radiusMetres)) continue;
    const minX = clamp(Math.floor(((stamp.x - path.radiusMetres - originX) / extentX) * width), 0, width - 1);
    const maxX = clamp(Math.floor(((stamp.x + path.radiusMetres - originX) / extentX) * width), 0, width - 1);
    const minZ = clamp(Math.floor(((stamp.z - path.radiusMetres - originZ) / extentZ) * height), 0, height - 1);
    const maxZ = clamp(Math.floor(((stamp.z + path.radiusMetres - originZ) / extentZ) * height), 0, height - 1);
    for (let z = minZ; z <= maxZ; z++) {
      const worldZ = originZ + ((z + 0.5) / height) * extentZ;
      for (let x = minX; x <= maxX; x++) {
        const worldX = originX + ((x + 0.5) / width) * extentX;
        const distance = Math.hypot(worldX - stamp.x, worldZ - stamp.z);
        if (distance > path.radiusMetres) continue;
        const normalized = 1 - distance / path.radiusMetres;
        const influence = path.falloff === 0 ? 1 : Math.pow(normalized, path.falloff);
        const index = z * width + x;
        influences.set(index, Math.max(influences.get(index) ?? 0, influence));
      }
    }
  }
  return influences;
}

function resolveLayerChannel(
  document: TerrainProjectDocument,
  layerId: string
): { mapIndex: number; channel: number } | null {
  if (!document.manifest.layers.some((layer) => layer.id === layerId)) return null;
  let result: { mapIndex: number; channel: number } | null = null;
  for (let mapIndex = 0; mapIndex < document.manifest.alphamaps.length; mapIndex++) {
    const channel = document.manifest.alphamaps[mapIndex].layers.indexOf(layerId);
    if (channel < 0) continue;
    if (result) throw new Error(`Terrain layer "${layerId}" is bound to multiple Alphamap channels`);
    result = { mapIndex, channel };
  }
  if (!result) throw new Error(`Terrain layer "${layerId}" has no Alphamap channel`);
  return result;
}

function recordByteChange(
  source: readonly Uint8Array[],
  target: Uint8Array[],
  index: number,
  value: number,
  changedByMap: Map<number, Map<number, TerrainByteChange>>,
  mapIndex: number
): void {
  const after = clamp(Math.round(value), 0, 255);
  const before = source[mapIndex][index];
  if (after === before) return;
  if (target[mapIndex] === source[mapIndex]) target[mapIndex] = source[mapIndex].slice();
  target[mapIndex][index] = after;
  let changes = changedByMap.get(mapIndex);
  if (!changes) {
    changes = new Map();
    changedByMap.set(mapIndex, changes);
  }
  changes.set(index, { index, before, after });
}

function validateSurfacePath(path: TerrainSurfaceBrushPath): void {
  resampleSurfacePath(path.points, path.spacingMetres);
  if (!Number.isFinite(path.radiusMetres) || path.radiusMetres <= 0) {
    throw new Error("Terrain surface brush radiusMetres must be positive and finite");
  }
  if (!Number.isFinite(path.falloff) || path.falloff < 0) {
    throw new Error("Terrain surface brush falloff must be finite and non-negative");
  }
}

function resampleSurfacePath(
  points: readonly TerrainSurfaceBrushPoint[],
  spacingMetres: number
): readonly TerrainSurfaceBrushPoint[] {
  if (!Number.isFinite(spacingMetres) || spacingMetres <= 0) {
    throw new Error("Terrain surface brush spacingMetres must be positive and finite");
  }
  if (points.length === 0) throw new Error("Terrain surface brush requires at least one point");
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
      throw new Error("Terrain surface brush points must be finite");
    }
  }
  const stamps: TerrainSurfaceBrushPoint[] = [{ ...points[0] }];
  let cursor = stamps[0];
  let distanceUntilStamp = spacingMetres;
  for (let pointIndex = 1; pointIndex < points.length; pointIndex++) {
    const endpoint = points[pointIndex];
    let dx = endpoint.x - cursor.x;
    let dz = endpoint.z - cursor.z;
    let segmentLength = Math.hypot(dx, dz);
    if (segmentLength <= BRUSH_PATH_EPSILON_METRES) {
      cursor = { ...endpoint };
      continue;
    }
    while (segmentLength + BRUSH_PATH_EPSILON_METRES >= distanceUntilStamp) {
      const ratio = distanceUntilStamp / segmentLength;
      cursor = { x: cursor.x + dx * ratio, z: cursor.z + dz * ratio };
      if (distanceSquared(cursor, stamps[stamps.length - 1]) > BRUSH_PATH_EPSILON_METRES ** 2) stamps.push(cursor);
      dx = endpoint.x - cursor.x;
      dz = endpoint.z - cursor.z;
      segmentLength = Math.hypot(dx, dz);
      distanceUntilStamp = spacingMetres;
      if (segmentLength <= BRUSH_PATH_EPSILON_METRES) break;
    }
    if (segmentLength > BRUSH_PATH_EPSILON_METRES) distanceUntilStamp -= segmentLength;
    cursor = { ...endpoint };
  }
  const endpoint = points[points.length - 1];
  if (distanceSquared(endpoint, stamps[stamps.length - 1]) > BRUSH_PATH_EPSILON_METRES ** 2) {
    stamps.push({ ...endpoint });
  }
  return stamps;
}

function circleIntersectsRegion(
  document: TerrainProjectDocument,
  point: TerrainSurfaceBrushPoint,
  radius: number
): boolean {
  const minX = document.descriptor.worldPosition[0];
  const minZ = document.descriptor.worldPosition[2];
  const maxX = minX + document.descriptor.worldSize[0];
  const maxZ = minZ + document.descriptor.worldSize[2];
  const nearestX = clamp(point.x, minX, maxX);
  const nearestZ = clamp(point.z, minZ, maxZ);
  return (point.x - nearestX) ** 2 + (point.z - nearestZ) ** 2 <= radius ** 2;
}

function detailCellIndex(
  localX: number,
  localZ: number,
  extentX: number,
  extentZ: number,
  width: number,
  height: number
): number {
  const x = clamp(Math.floor((localX / extentX) * width), 0, width - 1);
  const z = clamp(Math.floor((localZ / extentZ) * height), 0, height - 1);
  return z * width + x;
}

function appendTransform(target: number[], source: Float32Array, offset: number): void {
  for (let component = 0; component < DETAIL_TRANSFORM_STRIDE; component++) target.push(source[offset + component]);
}

function hashStableValues(...values: Array<string | number>): number {
  let hash = 0x811c9dc5;
  for (const value of values) {
    const text = typeof value === "number" ? value.toPrecision(15) : value;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
  }
  return hash >>> 0;
}

function stableUnitNoise(...values: Array<string | number>): number {
  return mulberry32(hashStableValues(...values))();
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function requireUnitInterval(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`Terrain ${label} must be finite and in [0,1]`);
  }
}

function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Terrain ${label} must be positive and finite`);
  }
}

function requirePositiveScaleRange(minimum: number, maximum: number): void {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum <= 0 || maximum < minimum) {
    throw new Error("Terrain tree scale range must be positive, finite, and ordered");
  }
}

function resolveDetailDensity(document: TerrainProjectDocument, prototype: TerrainProjectDetailPrototype): Uint8Array {
  if (prototype.density.kind === "r8-count") {
    const density = document.detailMaps.get(prototype.id);
    if (!density) throw new Error(`Terrain Detail prototype "${prototype.id}" density payload is not decoded`);
    return density;
  }
  return new Uint8Array(prototype.densitySampleSize[0] * prototype.densitySampleSize[1]);
}

function collectByteChanges(before: Uint8Array, after: Uint8Array): readonly TerrainByteChange[] {
  if (before.length !== after.length) throw new Error("Terrain brush density payload size changed during a stroke");
  const changes: TerrainByteChange[] = [];
  for (let index = 0; index < before.length; index++) {
    if (before[index] !== after[index]) changes.push({ index, before: before[index], after: after[index] });
  }
  return changes;
}

function compareByteChanges(left: TerrainByteChange, right: TerrainByteChange): number {
  return left.index - right.index;
}

function compareStableStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameSampleSize(left: readonly number[], right: readonly number[]): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

function distanceSquared(left: TerrainSurfaceBrushPoint, right: TerrainSurfaceBrushPoint): number {
  return (left.x - right.x) ** 2 + (left.z - right.z) ** 2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
