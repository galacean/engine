import type { TerrainProjectDocument } from "@galacean/engine-terrain/terrain/project/TerrainProjectContract";

const DEFAULT_OBJECT_REFERENCE_SPACING_METRES = 4;
const DEFAULT_OBJECT_MINIMUM_SCALE = 0.8;
const DEFAULT_OBJECT_MAXIMUM_SCALE = 1.2;
const DISTINCT_POSITION_EPSILON_METRES = 1e-4;

/** Paintable Project asset categories exposed by the terrain editor. */
export type TerrainEditorAssetKind = "texture" | "detail" | "tree" | "object";

/** One Project-level paint asset with an exact canonical source binding. */
export interface TerrainEditorAssetCatalogEntry {
  /** Stable category and resource identity used by editor selection state. */
  readonly key: string;
  /** Paint capability that consumes the asset. */
  readonly kind: TerrainEditorAssetKind;
  /** Authored display name from the source Region. */
  readonly name: string;
  /** Canonical Project resource used to deduplicate the asset across Regions. */
  readonly resourceUrl: string;
  /** Region containing the exact source binding used for material-aware previews. */
  readonly sourceRegionId: string;
  /** Region-local layer or prototype id paired with {@link sourceRegionId}. */
  readonly sourceId: string;
}

/** Stable Project-level palettes independent of the currently selected Region. */
export interface TerrainEditorAssetCatalog {
  /** Terrain texture layers deduplicated by diffuse Texture reference. */
  readonly textures: readonly TerrainEditorAssetCatalogEntry[];
  /** Detail prototypes deduplicated by Prefab or Texture reference. */
  readonly details: readonly TerrainEditorAssetCatalogEntry[];
  /** Tree prototypes deduplicated by Prefab reference. */
  readonly trees: readonly TerrainEditorAssetCatalogEntry[];
  /** Ordinary placed Prefabs, including rocks, deduplicated by Prefab reference. */
  readonly objects: readonly TerrainEditorAssetCatalogEntry[];
}

/** Project-authored placement defaults used by the simplified ordinary-object brush. */
export interface TerrainEditorObjectBrushProfile {
  /** Typical nearest-neighbour distance at full brush density. */
  readonly referenceSpacingMetres: number;
  /** Tenth-percentile equivalent uniform scale from existing placements. */
  readonly minimumScale: number;
  /** Ninetieth-percentile equivalent uniform scale from existing placements. */
  readonly maximumScale: number;
  /** Number of existing placements used to derive the profile. */
  readonly sourceInstanceCount: number;
}

/**
 * Builds stable Project palettes without treating Region-local ids or renderer LODs as asset identities.
 * @param documents Canonical Region documents in arbitrary declaration order.
 * @returns Frozen palettes sorted by authored name and resource identity.
 */
export function buildTerrainEditorAssetCatalog(
  documents: readonly Readonly<TerrainProjectDocument>[]
): TerrainEditorAssetCatalog {
  const textures = new Map<string, TerrainEditorAssetCatalogEntry>();
  const details = new Map<string, TerrainEditorAssetCatalogEntry>();
  const trees = new Map<string, TerrainEditorAssetCatalogEntry>();
  const objects = new Map<string, TerrainEditorAssetCatalogEntry>();
  const orderedDocuments = [...documents].sort((left, right) => left.descriptor.id.localeCompare(right.descriptor.id));
  for (const document of orderedDocuments) {
    const sourceRegionId = document.descriptor.id;
    for (const layer of document.manifest.layers) {
      addCatalogEntry(textures, "texture", layer.diffuse.url, layer.name, sourceRegionId, layer.id);
    }
    for (const prototype of document.manifest.detailPrototypes) {
      const resourceUrl = prototype.prefab?.url ?? prototype.texture?.url;
      if (resourceUrl) addCatalogEntry(details, "detail", resourceUrl, prototype.name, sourceRegionId, prototype.id);
    }
    for (const prototype of document.manifest.treePrototypes) {
      addCatalogEntry(trees, "tree", prototype.prefab.url, prototype.name, sourceRegionId, prototype.id);
    }
    for (const prototype of document.manifest.placedPrefabPrototypes ?? []) {
      addCatalogEntry(objects, "object", prototype.prefab.url, prototype.name, sourceRegionId, prototype.id);
    }
  }
  return Object.freeze({
    textures: freezeEntries(textures),
    details: freezeEntries(details),
    trees: freezeEntries(trees),
    objects: freezeEntries(objects)
  });
}

/**
 * Derives an ordinary-object brush profile from canonical placements sharing one Prefab resource.
 * @param documents Canonical Region documents in arbitrary declaration order.
 * @param entry Project-level ordinary-object catalog entry.
 * @returns Frozen scale and spacing defaults, with stable fallbacks when the Project has insufficient examples.
 * @throws If `entry` is not an ordinary-object asset.
 */
export function deriveTerrainEditorObjectBrushProfile(
  documents: readonly Readonly<TerrainProjectDocument>[],
  entry: TerrainEditorAssetCatalogEntry
): TerrainEditorObjectBrushProfile {
  if (entry.kind !== "object") {
    throw new Error(
      `Terrain editor object brush profile requires an object asset; received ${JSON.stringify(entry.kind)}`
    );
  }
  const scales: number[] = [];
  const positions: Array<readonly [x: number, z: number]> = [];
  for (const document of documents) {
    const prototypeIds = new Set(
      (document.manifest.placedPrefabPrototypes ?? [])
        .filter((prototype) => prototype.prefab.url === entry.resourceUrl)
        .map((prototype) => prototype.id)
    );
    if (prototypeIds.size === 0) continue;
    for (const instance of document.manifest.placedPrefabInstances ?? []) {
      if (!prototypeIds.has(instance.prototypeId)) continue;
      const [scaleX, scaleY, scaleZ] = instance.localScale.map(Math.abs);
      const equivalentScale = Math.cbrt(scaleX * scaleY * scaleZ);
      if (Number.isFinite(equivalentScale) && equivalentScale > 0) scales.push(equivalentScale);
      positions.push([
        document.descriptor.worldPosition[0] + instance.localPosition[0],
        document.descriptor.worldPosition[2] + instance.localPosition[2]
      ]);
    }
  }

  const nearestDistances: number[] = [];
  for (let index = 0; index < positions.length; index++) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < positions.length; candidate++) {
      if (candidate === index) continue;
      const distance = Math.hypot(
        positions[index][0] - positions[candidate][0],
        positions[index][1] - positions[candidate][1]
      );
      if (distance > DISTINCT_POSITION_EPSILON_METRES) nearest = Math.min(nearest, distance);
    }
    if (Number.isFinite(nearest)) nearestDistances.push(nearest);
  }

  scales.sort((left, right) => left - right);
  nearestDistances.sort((left, right) => left - right);
  return Object.freeze({
    referenceSpacingMetres:
      nearestDistances.length > 0
        ? Math.max(DISTINCT_POSITION_EPSILON_METRES, sampleSortedQuantile(nearestDistances, 0.5))
        : DEFAULT_OBJECT_REFERENCE_SPACING_METRES,
    minimumScale: scales.length > 0 ? sampleSortedQuantile(scales, 0.1) : DEFAULT_OBJECT_MINIMUM_SCALE,
    maximumScale: scales.length > 0 ? sampleSortedQuantile(scales, 0.9) : DEFAULT_OBJECT_MAXIMUM_SCALE,
    sourceInstanceCount: positions.length
  });
}

/**
 * Resolves a Project catalog entry to its current Region-local layer or prototype id.
 * @param document Region that will receive a paint operation.
 * @param entry Project-level asset selected by the user.
 * @returns Region-local id, or `null` when the asset has not been attached to this Region.
 */
export function resolveTerrainEditorAssetId(
  document: Readonly<TerrainProjectDocument>,
  entry: TerrainEditorAssetCatalogEntry
): string | null {
  switch (entry.kind) {
    case "texture":
      return document.manifest.layers.find((layer) => layer.diffuse.url === entry.resourceUrl)?.id ?? null;
    case "detail":
      return (
        document.manifest.detailPrototypes.find(
          (prototype) => (prototype.prefab?.url ?? prototype.texture?.url) === entry.resourceUrl
        )?.id ?? null
      );
    case "tree":
      return (
        document.manifest.treePrototypes.find((prototype) => prototype.prefab.url === entry.resourceUrl)?.id ?? null
      );
    case "object":
      return (
        document.manifest.placedPrefabPrototypes?.find((prototype) => prototype.prefab.url === entry.resourceUrl)?.id ??
        null
      );
  }
}

function addCatalogEntry(
  entries: Map<string, TerrainEditorAssetCatalogEntry>,
  kind: TerrainEditorAssetKind,
  resourceUrl: string,
  name: string,
  sourceRegionId: string,
  sourceId: string
): void {
  if (entries.has(resourceUrl)) return;
  entries.set(
    resourceUrl,
    Object.freeze({
      key: `${kind}:${resourceUrl}`,
      kind,
      name,
      resourceUrl,
      sourceRegionId,
      sourceId
    })
  );
}

function freezeEntries(
  entries: ReadonlyMap<string, TerrainEditorAssetCatalogEntry>
): readonly TerrainEditorAssetCatalogEntry[] {
  return Object.freeze(
    [...entries.values()].sort(
      (left, right) => left.name.localeCompare(right.name) || left.resourceUrl.localeCompare(right.resourceUrl)
    )
  );
}

function sampleSortedQuantile(values: readonly number[], quantile: number): number {
  const position = (values.length - 1) * quantile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const blend = position - lower;
  return values[lower] * (1 - blend) + values[upper] * blend;
}
