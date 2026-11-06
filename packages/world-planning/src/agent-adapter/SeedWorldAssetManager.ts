import {
  SEED_WORLD_REMOVABLE_OBJECT_KINDS,
  type SeedWorldRemovableObjectKind,
  type SeedWorldObject,
  type SeedWorldAuthoringResource,
  type SeedWorldBounds,
  type SeedWorldEnginePort,
  type SeedWorldRef,
  type SeedWorldAssetDomain,
  type SeedWorldSelectionItem,
  type SeedWorldSelector
} from "./ports/SeedWorldEnginePort";
import { seedWorldAssetPropertyNames, type SeedWorldAssetKind } from "./contracts/SeedWorldAssetContracts";

/** Public objects are exactly the runtime kinds backed by the persistent object-removal schema. */
type PublicObject = Readonly<SeedWorldObject> & Readonly<{ objectKind: SeedWorldRemovableObjectKind }>;

export type SeedWorldAssetCandidate = Omit<SeedWorldSelectionItem, "type"> &
  Readonly<{
    distanceMetres?: number;
    areaSquareMetres?: number;
    viewAngleDegrees?: number;
  }>;

/**
 * The single public world-index boundary. It projects runtime and authoring
 * storage into stable semantic assets and owns parent/connection relations.
 */
export class SeedWorldAssetManager {
  constructor(
    private readonly _engine: SeedWorldEnginePort,
    private readonly _additionalAssets: () => readonly SeedWorldAssetCandidate[] = () => []
  ) {}

  list(selector: Readonly<SeedWorldSelector>): readonly SeedWorldAssetCandidate[] {
    validateSelectorFields(selector);
    const revision = this._revision();
    const requestedDomains = new Set<SeedWorldAssetDomain>(
      selector.domains ?? ["terrain", "water", "vegetation", "object", "infrastructure", "poi"]
    );
    const authoredAll = this._authoredAssets(
      revision,
      new Set<SeedWorldAssetDomain>(["terrain", "water", "vegetation"])
    );
    const authored = authoredAll.filter(({ ref }) => requestedDomains.has(ref.domain));
    const authoredParents = new Map(authoredAll.map(({ ref }) => [ref.id, ref]));
    const needsObjects = requestedDomains.has("object") || requestedDomains.has("vegetation");
    const allObjects = needsObjects ? this._objectAssets(revision, authoredParents) : [];
    const naturalVegetation = needsObjects
      ? this._groupNaturalVegetation(revision, allObjects)
      : Object.freeze({ objects: allObjects, groups: Object.freeze([] as SeedWorldAssetCandidate[]) });
    const objects = naturalVegetation.objects.filter(({ ref }) => requestedDomains.has(ref.domain));
    const groups = requestedDomains.has("vegetation") ? naturalVegetation.groups : [];
    const natural = this._naturalFeatureAssets(revision, requestedDomains);
    const publishedVegetation = requestedDomains.has("vegetation") ? this._engine.readVegetationAssets?.() : undefined;
    const legacy = [...objects, ...authored, ...groups, ...natural];
    const assets = [
      ...legacy.filter(
        (asset) =>
          publishedVegetation === undefined || asset.ref.domain !== "vegetation" || asset.ref.kind === "grassland"
      ),
      ...this._additionalAssets().filter((asset) => requestedDomains.has(asset.ref.domain)),
      ...(publishedVegetation ?? [])
    ];
    const unique = new Map<string, SeedWorldAssetCandidate>();
    for (const asset of assets) {
      const key = JSON.stringify([asset.ref.domain, asset.ref.kind, asset.ref.source, asset.ref.id]);
      const prior = unique.get(key);
      unique.set(
        key,
        prior
          ? Object.freeze({
              ...prior,
              ...asset,
              properties: Object.freeze({ ...prior.properties, ...asset.properties })
            })
          : asset
      );
    }
    return Object.freeze(this._connectWaterAssets([...unique.values()]));
  }

  get(ref: Readonly<SeedWorldRef>): SeedWorldAssetCandidate | undefined {
    return this.list({ domains: [ref.domain], kinds: [ref.kind] }).find(
      ({ ref: candidate }) => candidate.id === ref.id && candidate.source === ref.source
    );
  }

  refForObject(object: Readonly<SeedWorldObject>): SeedWorldRef {
    if (!isPublicObject(object)) {
      throw new Error(`World object kind '${object.objectKind}' has no public mutable asset contract`);
    }
    return objectAsset(object, this._revision()).ref;
  }

  boundsForObject(object: Readonly<SeedWorldObject>): SeedWorldBounds {
    return objectBounds(object);
  }

  boundsForAuthoringResource(resource: Readonly<SeedWorldAuthoringResource>): SeedWorldBounds | undefined {
    const position = resourcePosition(resource, this._engine);
    return resourceBounds(resource, position);
  }

  refForAuthoringResource(
    resource: Readonly<SeedWorldAuthoringResource>,
    revision = this._revision()
  ): SeedWorldRef | undefined {
    return authoredResourceRef(resource, revision);
  }

  private _objectAssets(
    revision: number,
    authoredParents: ReadonlyMap<string, SeedWorldRef>
  ): SeedWorldAssetCandidate[] {
    return this._engine
      .queryWorldObjects({
        kinds: SEED_WORLD_REMOVABLE_OBJECT_KINDS,
        orderBy: [],
        limit: 100_000
      })
      .objects.flatMap((object) => {
        if (!isPublicObject(object)) return [];
        const asset = objectAsset(object, revision);
        const parent = object.source.kind === "authoring" ? authoredParents.get(object.source.sourceId) : undefined;
        // A single authored tree/shrub uses its authoring resource as the
        // public identity. Its renderer instance is implementation detail,
        // while forest/shrubland instances remain addressable child assets.
        if (parent?.kind === object.objectKind) return [];
        return [parent ? Object.freeze({ ...asset, relations: Object.freeze({ parent }) }) : asset];
      });
  }

  private _authoredAssets(
    revision: number,
    requestedDomains: ReadonlySet<SeedWorldAssetDomain>
  ): SeedWorldAssetCandidate[] {
    const realizedVegetationMembers = requestedDomains.has("vegetation")
      ? authoredVegetationMembers(this._engine)
      : new Map<string, readonly SeedWorldObject[]>();
    return this._engine.readAuthoringSnapshot().resources.flatMap((resource) => {
      const ref = authoredResourceRef(resource, revision);
      if (!ref || !requestedDomains.has(ref.domain)) return [];
      const position = resourcePosition(resource, this._engine);
      const bounds = resourceBounds(resource, position);
      return [
        Object.freeze({
          ref,
          ...(position ? { position } : {}),
          ...(bounds ? { bounds } : {}),
          areaSquareMetres: resourceArea(resource),
          properties: authoredResourceProperties(resource, ref.kind, realizedVegetationMembers.get(resource.resourceId))
        })
      ];
    });
  }

  private _groupNaturalVegetation(
    revision: number,
    objects: readonly SeedWorldAssetCandidate[]
  ): Readonly<{
    objects: readonly SeedWorldAssetCandidate[];
    groups: readonly SeedWorldAssetCandidate[];
  }> {
    const rawObjects = this._engine.queryWorldObjects({
      kinds: ["tree", "shrub"],
      orderBy: [],
      limit: 100_000
    }).objects;
    const groups = new Map<string, SeedWorldObject[]>();
    for (const object of rawObjects) {
      if (object.source.kind !== "population") continue;
      const key = `${object.objectKind}:${object.source.sourceId}`;
      const group = groups.get(key) ?? [];
      group.push(object);
      groups.set(key, group);
    }
    const result: SeedWorldAssetCandidate[] = [];
    const parentByMemberId = new Map<string, SeedWorldRef>();
    for (const [key, members] of groups) {
      if (members.length < 2) continue;
      const plant = members[0]!.objectKind;
      const kind = plant === "tree" ? "forest" : "shrubland";
      const id = `natural:${kind}:${key.slice(key.indexOf(":") + 1)}`;
      const ref = freezeRef({ id, domain: "vegetation", kind, source: "natural", revision });
      const bounds = mergeBounds(members.map(objectBounds));
      const position = bounds ? boundsCenter(bounds) : undefined;
      result.push(
        Object.freeze({
          ref,
          ...(position ? { position } : {}),
          ...(bounds ? { bounds } : {}),
          areaSquareMetres: bounds ? boundsArea(bounds) : undefined,
          properties: Object.freeze({
            assetKind: kind,
            memberCount: members.length,
            distribution: "habitat-fill"
          })
        })
      );
      for (const member of members) {
        parentByMemberId.set(member.objectId, ref);
      }
    }
    const relatedObjects = objects.map((asset) => {
      const parent = parentByMemberId.get(asset.ref.id);
      return parent ? Object.freeze({ ...asset, relations: Object.freeze({ ...asset.relations, parent }) }) : asset;
    });
    return Object.freeze({
      objects: Object.freeze(relatedObjects),
      groups: Object.freeze(result)
    });
  }

  private _naturalFeatureAssets(
    revision: number,
    requestedDomains: ReadonlySet<SeedWorldAssetDomain>
  ): SeedWorldAssetCandidate[] {
    const result: SeedWorldAssetCandidate[] = [];
    if (requestedDomains.has("terrain")) {
      for (const feature of readRegionFeatures(this._engine, "summit")) {
        const position = numberTuple(feature.position);
        result.push(
          Object.freeze({
            ref: freezeRef({
              id: `natural:mountain:${String(feature.id)}`,
              domain: "terrain",
              kind: "mountain",
              source: "natural",
              revision
            }),
            ...(position ? { position } : {}),
            properties: Object.freeze({
              assetKind: "mountain",
              // Planner summit.elevation is a normalized planning score. Public
              // elevationMetres must use the projected world-space altitude.
              elevationMetres: Number(position?.[1] ?? 0)
            })
          })
        );
      }
    }
    if (requestedDomains.has("water")) {
      for (const feature of readRegionFeatures(this._engine, "river")) {
        const position = numberTuple(feature.surfacePosition ?? feature.middle ?? feature.source);
        const id = String(feature.id);
        result.push(
          Object.freeze({
            ref: freezeRef({ id: `natural:river:${id}`, domain: "water", kind: "river", source: "natural", revision }),
            ...(position ? { position } : {}),
            properties: Object.freeze(
              compact({
                assetKind: "river",
                maximumWidthMetres: finiteOptional(feature.maximumWidthMetres),
                maximumDepthMetres: finiteOptional(feature.maximumDepthMetres),
                surfaceElevationMetres: finiteOptional(feature.surfaceElevationMetres),
                pointCount: integerOptional(feature.pointCount)
              })
            )
          })
        );
      }
      for (const kind of ["ocean", "lake"] as const) {
        for (const feature of readRegionFeatures(this._engine, kind)) {
          const position = numberTuple(feature.position);
          const bounds = publicBounds(feature.bounds);
          result.push(
            Object.freeze({
              ref: freezeRef({
                id: `natural:${kind}:${String(feature.id)}`,
                domain: "water",
                kind,
                source: "natural",
                revision
              }),
              ...(position ? { position } : {}),
              ...(bounds ? { bounds } : {}),
              areaSquareMetres: bounds ? boundsArea(bounds) : undefined,
              properties: Object.freeze(
                compact({
                  assetKind: kind,
                  surfaceElevationMetres: finiteOptional(feature.surfaceElevationMetres),
                  canonicalWaterLevelMetres: finiteOptional(feature.canonicalWaterLevelMetres),
                  minimumWaterLevelMetres: finiteOptional(feature.minimumWaterLevelMetres),
                  maximumWaterLevelMetres: finiteOptional(feature.maximumWaterLevelMetres),
                  waterLevelMetres: finiteOptional(feature.waterLevelMetres)
                })
              )
            })
          );
        }
      }
    }
    if (requestedDomains.has("vegetation")) {
      for (const kind of ["grassland", "flower-field"] as const) {
        for (const feature of readRegionFeatures(this._engine, kind)) {
          result.push(
            Object.freeze({
              ref: freezeRef({
                id: `natural:${kind}:${String(feature.id)}`,
                domain: "vegetation",
                kind,
                source: "natural",
                revision
              }),
              properties: Object.freeze(
                compact({
                  assetKind: kind,
                  distribution: "habitat-fill",
                  seed: integerOptional(feature.seed)
                })
              )
            })
          );
        }
      }
    }
    if (requestedDomains.has("infrastructure")) {
      for (const feature of readRegionFeatures(this._engine, "road")) {
        const position = numberTuple(feature.start);
        const id = String(feature.id);
        result.push(
          Object.freeze({
            ref: freezeRef({
              id: `natural:road:${id}`,
              domain: "infrastructure",
              kind: "road",
              source: "natural",
              revision
            }),
            ...(position ? { position } : {}),
            properties: Object.freeze({
              assetKind: "road",
              fromPoiId: String(feature.fromPoiId),
              toPoiId: String(feature.toPoiId),
              pointCount: Number(feature.pointCount ?? 0),
              bridgeCount: Number(feature.bridgeCount ?? 0)
            })
          })
        );
      }
      for (const feature of readRegionFeatures(this._engine, "bridge")) {
        const position = numberTuple(feature.position);
        const id = String(feature.id);
        const roadId = String(feature.roadId);
        result.push(
          Object.freeze({
            ref: freezeRef({
              id: `natural:bridge:${id}`,
              domain: "infrastructure",
              kind: "bridge",
              source: "natural",
              revision
            }),
            ...(position ? { position } : {}),
            relations: Object.freeze({
              parent: freezeRef({
                id: `natural:road:${roadId}`,
                domain: "infrastructure",
                kind: "road",
                source: "natural",
                revision
              })
            }),
            properties: Object.freeze({
              assetKind: "bridge",
              roadId,
              startArcMetres: Number(feature.startArcMetres),
              endArcMetres: Number(feature.endArcMetres),
              lengthMetres: Number(feature.lengthMetres)
            })
          })
        );
      }
    }
    if (requestedDomains.has("poi")) {
      for (const feature of readRegionFeatures(this._engine, "poi")) {
        const position = numberTuple(feature.position);
        result.push(
          Object.freeze({
            ref: freezeRef({
              id: `natural:poi:${String(feature.id)}`,
              domain: "poi",
              kind: "poi",
              source: "natural",
              revision
            }),
            ...(position ? { position } : {}),
            properties: Object.freeze({ assetKind: "poi", poiKind: String(feature.poiKind) })
          })
        );
      }
    }
    return result;
  }

  private _connectWaterAssets(assets: readonly SeedWorldAssetCandidate[]): SeedWorldAssetCandidate[] {
    const waters = assets.filter(({ ref }) => ref.domain === "water");
    return assets.map((asset) => {
      if (asset.ref.domain !== "water") return asset;
      const connectedTo = waters
        .filter((other) => other.ref.id !== asset.ref.id)
        .filter((other) => boundsIntersect(asset.bounds, other.bounds) || assetDistance(asset, other) <= 3)
        .map(({ ref }) => ref);
      return connectedTo.length
        ? Object.freeze({
            ...asset,
            relations: Object.freeze({ ...asset.relations, connectedTo: Object.freeze(connectedTo) })
          })
        : asset;
    });
  }

  private _revision(): number {
    return this._engine.readAuthoringSnapshot().activeRevision;
  }
}

const COMMON_SELECTOR_FIELDS = new Set(["position", "tags", "relations.parent.id", "relations.connectedTo"]);

function validateSelectorFields(selector: Readonly<SeedWorldSelector>): void {
  const propertyNames = seedWorldAssetPropertyNames(selector.kinds);
  for (const filter of selector.filters ?? []) {
    const normalized = filter.field.startsWith("properties.") ? filter.field.slice("properties.".length) : filter.field;
    if (COMMON_SELECTOR_FIELDS.has(filter.field) || propertyNames.has(normalized)) continue;
    throw new Error(
      `Unknown WorldAsset filter field '${filter.field}' for kinds ${selector.kinds?.join(", ") ?? "*"}; ` +
        `use selector.ids/domains/kinds/sources for identity; queryable semantic properties: ${[...propertyNames].sort().join(", ")}`
    );
  }
  for (const relation of selector.relatedTo ?? []) validateSelectorFields(relation.selector);
}

function objectAsset(object: PublicObject, revision: number): SeedWorldAssetCandidate {
  const kind: SeedWorldAssetKind = object.objectKind === "small-rock" ? "rock" : object.objectKind;
  const ref = freezeRef({
    id: object.objectId,
    domain: kind === "tree" || kind === "shrub" ? "vegetation" : "object",
    kind,
    source: object.source.kind === "authoring" ? "authored" : "natural",
    revision
  });
  const properties = objectProperties(object);
  return Object.freeze({
    ref,
    position: Object.freeze([...object.position] as [number, number, number]),
    bounds: objectBounds(object),
    areaSquareMetres: object.footprintMetres[0] * object.footprintMetres[1],
    properties
  });
}

function objectProperties(object: PublicObject): Readonly<Record<string, unknown>> {
  return object.objectKind === "tree"
    ? Object.freeze(
        compact({
          assetKind: "tree" as const,
          treeShape: object.properties.treeShape,
          treeRecipeId: object.properties.treeRecipeId,
          treeRecipeLabel: object.properties.treeRecipeLabel,
          treeEffectIndex: object.properties.treeEffectIndex,
          species: stringOptional(object.properties.treeSpeciesProfileKey),
          footprintMetres: Object.freeze([...object.footprintMetres] as [number, number]),
          headingDegrees: (Number(object.properties.yawRadians ?? 0) * 180) / Math.PI,
          scale: positiveVec3(object.properties.scale)
        })
      )
    : object.objectKind === "shrub"
      ? Object.freeze({
          assetKind: "shrub" as const,
          footprintMetres: Object.freeze([...object.footprintMetres] as [number, number]),
          headingDegrees: (Number(object.properties.yawRadians ?? 0) * 180) / Math.PI,
          scale: positiveVec3(object.properties.scale)
        })
      : object.objectKind === "mushroom"
        ? Object.freeze({ assetKind: "mushroom" as const })
        : Object.freeze({
            assetKind: "rock" as const,
            sizeClass: object.objectKind === "small-rock" ? ("small" as const) : ("regular" as const)
          });
}

function isPublicObject(object: Readonly<SeedWorldObject>): object is PublicObject {
  return SEED_WORLD_REMOVABLE_OBJECT_KINDS.some((kind) => kind === object.objectKind);
}

function authoredResourceRef(
  resource: Readonly<SeedWorldAuthoringResource>,
  revision: number
): SeedWorldRef | undefined {
  if (resource.resourceType === "terrain-patch" || resource.resourceType === "object-removal") return undefined;
  if (resource.resourceType === "terrain-feature") {
    return freezeRef({
      id: resource.resourceId,
      domain: "terrain",
      kind: String(resource.properties.kind),
      source: "authored",
      revision
    });
  }
  if (resource.resourceType === "vegetation-brush") {
    const plant = resource.properties.plantKind;
    const distribution = String(resource.properties.distributionKind ?? "area");
    const kind =
      (plant === "tree" || plant === "shrub") && distribution === "single" ? plant : vegetationAssetKind(plant);
    return freezeRef({
      id: resource.resourceId,
      domain: "vegetation",
      kind,
      source: "authored",
      revision
    });
  }
  return undefined;
}

function authoredResourceProperties(
  resource: Readonly<SeedWorldAuthoringResource>,
  kind: string,
  realizedVegetationMembers?: readonly SeedWorldObject[]
) {
  if (resource.resourceType === "terrain-feature") {
    const p = resource.properties;
    if (p.kind === "hill") {
      return Object.freeze({
        assetKind: "hill" as const,
        pedestalLiftMetres: p.pedestalLiftMetres,
        influenceMajorRadiusMetres: p.influenceMajorRadiusMetres,
        peakReliefMetres: p.peakReliefMetres,
        bodyMajorRadiusMetres: p.bodyMajorRadiusMetres,
        headingDegrees: p.headingDegrees
      });
    }
    return Object.freeze(
      compact({
        assetKind: kind,
        lengthMetres: p.lengthMetres,
        widthMetres: p.widthMetres,
        elevationDeltaMetres: p.elevationDeltaMetres,
        headingDegrees: p.headingDegrees,
        sharpness: p.sharpness,
        asymmetry: p.asymmetry,
        roughness: p.roughness,
        erosion: p.erosion,
        seed: p.seed
      })
    );
  }
  if (resource.resourceType === "vegetation-brush") {
    const p = resource.properties;
    if ((p.plantKind === "tree" || p.plantKind === "shrub") && p.distributionKind === "single") {
      const member = realizedVegetationMembers?.find(isPublicObject);
      if (member) return objectProperties(member);
      return Object.freeze({ assetKind: p.plantKind });
    }
    return Object.freeze(
      compact({
        assetKind: kind,
        radiusMetres: p.radiusMetres,
        memberCount: p.plantKind === "tree" || p.plantKind === "shrub" ? realizedVegetationMembers?.length : undefined,
        distribution: "area",
        seed: p.seed
      })
    );
  }
  throw new Error(`Authoring resource '${resource.resourceId}' is not a public WorldAsset`);
}

function authoredVegetationMembers(engine: SeedWorldEnginePort): Map<string, readonly SeedWorldObject[]> {
  const members = new Map<string, SeedWorldObject[]>();
  const objects = engine.queryWorldObjects({
    kinds: ["tree", "shrub"],
    orderBy: [],
    limit: 1_000_000
  }).objects;
  for (const object of objects) {
    if (object.source.kind !== "authoring") continue;
    const owned = members.get(object.source.sourceId) ?? [];
    owned.push(object);
    members.set(object.source.sourceId, owned);
  }
  return new Map([...members].map(([resourceId, owned]) => [resourceId, Object.freeze([...owned])] as const));
}

function vegetationAssetKind(plant: string): SeedWorldAssetKind {
  if (plant === "tree") return "forest";
  if (plant === "shrub") return "shrubland";
  if (plant === "flower") return "flower-field";
  if (plant === "aquatic-grass" || plant === "water-grass") return "aquatic-grass-bed";
  return "grassland";
}

function resourcePosition(resource: Readonly<SeedWorldAuthoringResource>, engine: SeedWorldEnginePort) {
  const geometry = authoredResourceGeometry(resource);
  if (!geometry) return undefined;
  const { x, z } = geometry;
  return engine.resolveSpatialTarget({ anchor: { kind: "position", x, z }, relation: { kind: "at" } }).position;
}

function resourceBounds(
  resource: Readonly<SeedWorldAuthoringResource>,
  position?: readonly [number, number, number]
): SeedWorldBounds | undefined {
  const geometry = authoredResourceGeometry(resource);
  if (!geometry) return undefined;
  const { x, z } = geometry;
  const radius =
    geometry.radiusMetres ?? Math.max(1, Math.hypot(geometry.lengthMetres ?? 0, geometry.widthMetres ?? 0) * 0.5);
  const y = position?.[1] ?? 0;
  const magnitude = Math.max(Math.abs(geometry.elevationDeltaMetres ?? 0), Math.abs(geometry.depthMetres ?? 0), 1);
  return Object.freeze({
    minimum: Object.freeze([x - radius, y - magnitude, z - radius] as const),
    maximum: Object.freeze([x + radius, y + magnitude, z + radius] as const)
  });
}

function resourceArea(resource: Readonly<SeedWorldAuthoringResource>): number {
  const geometry = authoredResourceGeometry(resource);
  if (!geometry) return 0;
  return geometry.radiusMetres === undefined
    ? (geometry.lengthMetres ?? 0) * (geometry.widthMetres ?? 0)
    : Math.PI * geometry.radiusMetres * geometry.radiusMetres;
}

function authoredResourceGeometry(resource: Readonly<SeedWorldAuthoringResource>):
  | Readonly<{
      x: number;
      z: number;
      radiusMetres?: number;
      lengthMetres?: number;
      widthMetres?: number;
      elevationDeltaMetres?: number;
      depthMetres?: number;
    }>
  | undefined {
  switch (resource.resourceType) {
    case "terrain-feature":
      if (resource.properties.kind === "hill") {
        return Object.freeze({
          x: resource.properties.x,
          z: resource.properties.z,
          radiusMetres: resource.properties.influenceMajorRadiusMetres,
          elevationDeltaMetres: resource.properties.pedestalLiftMetres + resource.properties.peakReliefMetres
        });
      }
      return Object.freeze({
        x: resource.properties.x,
        z: resource.properties.z,
        lengthMetres: resource.properties.lengthMetres,
        widthMetres: resource.properties.widthMetres,
        elevationDeltaMetres: resource.properties.elevationDeltaMetres
      });
    case "vegetation-brush":
      return Object.freeze({
        x: resource.properties.x,
        z: resource.properties.z,
        radiusMetres: resource.properties.radiusMetres
      });
    case "terrain-patch":
    case "object-removal":
      return undefined;
  }
}

function objectBounds(object: Readonly<SeedWorldObject>): SeedWorldBounds {
  const exact = object.objectKind === "tree" ? (object.properties.bounds as SeedWorldBounds | undefined) : undefined;
  if (exact)
    return Object.freeze({
      minimum: Object.freeze([...exact.minimum] as [number, number, number]),
      maximum: Object.freeze([...exact.maximum] as [number, number, number])
    });
  const [x, y, z] = object.position;
  const [width, depth] = object.footprintMetres;
  return Object.freeze({
    minimum: Object.freeze([x - width * 0.5, y, z - depth * 0.5] as const),
    maximum: Object.freeze([x + width * 0.5, y + Math.max(width, depth), z + depth * 0.5] as const)
  });
}

function readRegionFeatures(
  engine: SeedWorldEnginePort,
  kind: Parameters<SeedWorldEnginePort["queryWorldRegions"]>[0]
) {
  const result = engine.queryWorldRegions(kind, 10_000) as { features?: readonly Readonly<Record<string, unknown>>[] };
  return result.features ?? [];
}

function freezeRef(ref: SeedWorldRef): SeedWorldRef {
  return Object.freeze(ref);
}
function finiteOptional(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
function integerOptional(value: unknown): number | undefined {
  const n = finiteOptional(value);
  return n !== undefined && Number.isInteger(n) && n >= 0 ? n : undefined;
}
function stringOptional(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}
function numberTuple(value: unknown): readonly [number, number, number] | undefined {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => Number.isFinite(entry))
    ? Object.freeze([Number(value[0]), Number(value[1]), Number(value[2])])
    : undefined;
}
function positiveVec3(value: unknown): readonly [number, number, number] {
  const tuple = numberTuple(value);
  return tuple && tuple.every((entry) => entry > 0) ? tuple : Object.freeze([1, 1, 1]);
}
function publicBounds(value: unknown): SeedWorldBounds | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const minimum = numberTuple(record.minimum);
  const maximum = numberTuple(record.maximum);
  return minimum && maximum ? Object.freeze({ minimum, maximum }) : undefined;
}
function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}
function mergeBounds(bounds: readonly SeedWorldBounds[]): SeedWorldBounds | undefined {
  if (!bounds.length) return undefined;
  return Object.freeze({
    minimum: Object.freeze([
      Math.min(...bounds.map((b) => b.minimum[0])),
      Math.min(...bounds.map((b) => b.minimum[1])),
      Math.min(...bounds.map((b) => b.minimum[2]))
    ] as const),
    maximum: Object.freeze([
      Math.max(...bounds.map((b) => b.maximum[0])),
      Math.max(...bounds.map((b) => b.maximum[1])),
      Math.max(...bounds.map((b) => b.maximum[2]))
    ] as const)
  });
}
function boundsCenter(bounds: SeedWorldBounds): readonly [number, number, number] {
  return Object.freeze([
    (bounds.minimum[0] + bounds.maximum[0]) * 0.5,
    (bounds.minimum[1] + bounds.maximum[1]) * 0.5,
    (bounds.minimum[2] + bounds.maximum[2]) * 0.5
  ]);
}
function boundsArea(bounds: SeedWorldBounds): number {
  return Math.max(0, bounds.maximum[0] - bounds.minimum[0]) * Math.max(0, bounds.maximum[2] - bounds.minimum[2]);
}
function boundsIntersect(left?: SeedWorldBounds, right?: SeedWorldBounds): boolean {
  return Boolean(
    left &&
      right &&
      left.minimum[0] <= right.maximum[0] &&
      left.maximum[0] >= right.minimum[0] &&
      left.minimum[2] <= right.maximum[2] &&
      left.maximum[2] >= right.minimum[2]
  );
}
function assetDistance(left: SeedWorldAssetCandidate, right: SeedWorldAssetCandidate): number {
  if (!left.position || !right.position) return Number.POSITIVE_INFINITY;
  return Math.hypot(left.position[0] - right.position[0], left.position[2] - right.position[2]);
}
