import type { SeedWorldEnvironmentChange } from "../SeedWorldEnvironmentChange";
import type { SeedWorldHillAtomParameters } from "../../world/SeedWorldHillAtom";
import type { SeedWorldAssetKind } from "../contracts/SeedWorldAssetContracts";

export type SeedWorldWeatherPreset = "clear" | "cloudy" | "rain" | "storm" | "snow" | "fog";
export type SeedWorldSeason = "spring" | "summer" | "autumn" | "winter";
export type SeedWorldCameraMode = "orbit" | "roam";
export type SeedWorldRegionKind =
  | "summit"
  | "river"
  | "ocean"
  | "lake"
  | "road"
  | "bridge"
  | "poi"
  | "grassland"
  | "flower-field";
export type SeedWorldVegetationKind = "tree" | "shrub" | "grass" | "flower" | "water-grass";
export type SeedWorldPlantKind = "tree" | "shrub" | "grass" | "flower" | "aquatic-grass";
export type SeedWorldVegetationDistributionKind = "single" | "cluster" | "area";
export type SeedWorldTerrainFeatureKind =
  | "mountain"
  | "hill"
  | "ridge"
  | "canyon"
  | "valley"
  | "slope"
  | "plateau"
  | "basin";
export type SeedWorldStandingWaterFeatureKind = "pond" | "lake";
export type SeedWorldFlowingWaterFeatureKind = "stream" | "river";
export type SeedWorldWaterFeatureKind = SeedWorldStandingWaterFeatureKind | SeedWorldFlowingWaterFeatureKind;
export type SeedWorldResourceType = "terrain-patch" | "terrain-feature" | "vegetation-brush" | "object-removal";
/** Object kinds backed by the persistent object-removal schema. */
export const SEED_WORLD_REMOVABLE_OBJECT_KINDS = Object.freeze([
  "tree",
  "shrub",
  "rock",
  "small-rock",
  "mushroom"
] as const);
export type SeedWorldRemovableObjectKind = (typeof SEED_WORLD_REMOVABLE_OBJECT_KINDS)[number];
/** Queryable runtime objects include read-only decorations that do not have a removal atom. */
export type SeedWorldObjectKind = SeedWorldRemovableObjectKind | "lotus";

/** Stable semantic domain used for public asset identity and domain routing. */
export type SeedWorldAssetDomain = "terrain" | "water" | "vegetation" | "object" | "infrastructure" | "poi";
export type SeedWorldRefSource = "natural" | "authored";

export interface SeedWorldRef {
  readonly id: string;
  readonly domain: SeedWorldAssetDomain;
  readonly kind: string;
  readonly source: SeedWorldRefSource;
  /** Internal diagnostic snapshot only; the public Agent Script Ref omits it. */
  readonly revision?: number;
}

export interface SeedWorldBounds {
  readonly minimum: readonly [x: number, y: number, z: number];
  readonly maximum: readonly [x: number, y: number, z: number];
}

export type SeedWorldSelectorFilter = Readonly<{
  field: string;
  operator: "eq" | "in" | "gt" | "lt" | "contains";
  value: unknown;
}>;

export type SeedWorldSelectorAnchor =
  | Readonly<{ kind: "viewer" }>
  | Readonly<{ kind: "world-ref"; ref: SeedWorldRef }>
  | Readonly<{ kind: "selection"; selectionId: string }>
  | Readonly<{ kind: "position"; x: number; y?: number; z: number }>;

export interface SeedWorldSelector {
  /** Exact stable asset ids. Use this instead of encoding identity as a generic property filter. */
  readonly ids?: readonly string[];
  readonly domains?: readonly SeedWorldAssetDomain[];
  readonly kinds?: readonly string[];
  /** Asset provenance is a first-class identity axis, not a generic property filter. */
  readonly sources?: readonly SeedWorldRefSource[];
  readonly filters?: readonly SeedWorldSelectorFilter[];
  readonly spatial?: Readonly<{
    anchor: SeedWorldSelectorAnchor;
    relation: "at" | "near" | "in-front-of" | "behind" | "left" | "right" | "inside" | "around";
    minDistanceMetres?: number;
    maxDistanceMetres?: number;
    maxViewAngleDegrees?: number;
  }>;
  readonly relatedTo?: readonly Readonly<{
    selector: SeedWorldSelector;
    relation: "near" | "inside" | "intersects" | "connected-to";
    maxDistanceMetres?: number;
  }>[];
  readonly sort?: "nearest" | "farthest" | "largest" | "highest" | "lowest";
}

/** Query projection is deliberately separate from semantic selection criteria. */
export interface SeedWorldQueryInput extends SeedWorldSelector {
  readonly offset?: number;
  readonly limit?: number;
}

export interface SeedWorldSelectionSummary {
  readonly viewerRelation?: {
    readonly basis: "instruction-viewer" | "live-viewer";
    readonly forwardMetres: number;
    readonly rightMetres: number;
    readonly direction:
      | "here"
      | "front"
      | "front-right"
      | "right"
      | "behind-right"
      | "behind"
      | "behind-left"
      | "left"
      | "front-left";
  };
  /** Public discriminant used to choose the matching /assets declaration file. */
  readonly type: SeedWorldAssetKind;
  readonly ref: SeedWorldRef;
  readonly position?: readonly [x: number, y: number, z: number];
  readonly bounds?: SeedWorldBounds;
  readonly tags?: readonly string[];
  readonly relations?: Readonly<{
    readonly parent?: SeedWorldRef;
    readonly connectedTo?: readonly SeedWorldRef[];
  }>;
}

export interface SeedWorldSelectionItem extends SeedWorldSelectionSummary {
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface SeedWorldQueriedAsset extends SeedWorldSelectionSummary {
  /** Query-context distance; it is not part of the persistent Asset itself. */
  readonly distanceMetres?: number;
}

export interface SeedWorldSelectionResult {
  readonly selectionId: string;
  readonly matchedCount: number;
  readonly offset: number;
  readonly nextOffset?: number;
  /** True when the transport byte budget, rather than the requested item limit, ended this page. */
  readonly pageLimitedByBytes?: boolean;
  readonly items: readonly Readonly<SeedWorldQueriedAsset>[];
  readonly resolvedBounds?: SeedWorldBounds;
}

export type SeedWorldKernelSpatialAnchor =
  | Readonly<{ kind: "viewer" }>
  | Readonly<{ kind: "world-ref"; ref: SeedWorldRef }>
  | Readonly<{ kind: "selection"; selectionId: string }>
  | Readonly<{ kind: "position"; x: number; y?: number; z: number }>;

export type SeedWorldKernelSpatialRelation =
  | Readonly<{ kind: "at" }>
  | Readonly<{ kind: "front"; distanceMetres?: number }>
  | Readonly<{ kind: "behind" | "left" | "right"; distanceMetres: number }>
  | Readonly<{ kind: "near"; preferredDistanceMetres: number }>
  | Readonly<{ kind: "around"; radiusMetres: number }>
  | Readonly<{ kind: "offset"; forwardMetres: number; rightMetres: number; upMetres?: number }>;

/** Shared coordinate language. Mutation Tools may read it, but only navigation may write viewer pose. */
export interface SeedWorldKernelSpatialTarget {
  readonly anchor: SeedWorldKernelSpatialAnchor;
  readonly frame?: "world" | "anchor-local";
  readonly origin?: "feet" | "eyes" | "center" | "surface" | "bounds-nearest" | "bounds-center";
  readonly relation: SeedWorldKernelSpatialRelation;
  readonly placement?: Readonly<{
    snapTo: "terrain" | "water-surface" | "none";
    collision?: "avoid" | "allow";
    maxSlope?: number;
    avoidWater?: boolean;
    requireWater?: boolean;
  }>;
  readonly expectedWorldRevision?: number;
}

export interface SeedWorldKernelResolvedSpatialTarget {
  readonly geometry: "point" | "area";
  readonly position: readonly [x: number, y: number, z: number];
  readonly radiusMetres?: number;
  readonly worldRevision: number;
  readonly resolvedFrom: Readonly<{
    anchor: SeedWorldKernelSpatialAnchor["kind"];
    relation: SeedWorldKernelSpatialRelation["kind"];
    frame: "world" | "anchor-local";
    origin: NonNullable<SeedWorldKernelSpatialTarget["origin"]>;
    snappedTo: "terrain" | "water-surface" | "none";
  }>;
}

export type SeedWorldImpactBudget = Readonly<{
  maxAreaSquareMetres?: number;
  maxObjectCount?: number;
  maxTerrainDeltaMetres?: number;
}>;

export type SeedWorldMutationControl = Readonly<{
  executionMode?: "apply" | "preview";
  expectedWorldRevision?: number;
  impactBudget?: SeedWorldImpactBudget;
}>;

/** Optional visual presentation applied only to authored terrain height publication. */
export type SeedWorldWaterEditOptions = import("../../spatial/hydrology/PlanningWaterEdits").WaterEditOptions;
export type SeedWorldWaterMutationControl = SeedWorldMutationControl & Readonly<{ edit?: SeedWorldWaterEditOptions }>;

export type SeedWorldTerrainMutationControl = SeedWorldMutationControl &
  Readonly<{
    /** Transition duration in seconds; omission or zero publishes the final height immediately. */
    transitionDurationSeconds?: number;
  }>;

export interface SeedWorldAuthoringSummary {
  readonly worldRevision: number;
  readonly matchedCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly deletedCount: number;
  readonly skippedCount: number;
  readonly createdRefs: readonly SeedWorldRef[];
  readonly updatedRefs: readonly SeedWorldRef[];
  readonly deletedRefs: readonly SeedWorldRef[];
  /** True when exact counts exceed the bounded Ref samples returned to the Agent. */
  readonly refsTruncated: boolean;
  readonly affectedBounds: SeedWorldBounds | null;
  readonly warnings: readonly string[];
  readonly resolvedEffect: Readonly<Record<string, unknown>> | null;
}

export type SeedWorldAuthoringResult =
  | (SeedWorldAuthoringSummary & Readonly<{ status: "applied"; transactionId: string; reason: null }>)
  | (SeedWorldAuthoringSummary & Readonly<{ status: "preview"; transactionId: null; reason: null }>)
  | (SeedWorldAuthoringSummary & Readonly<{ status: "unchanged"; transactionId: null; reason: string }>);

export type SeedWorldAssetMutationResult =
  | (Extract<SeedWorldAuthoringResult, { status: "applied" }> & Readonly<{ assetRef: SeedWorldRef }>)
  | (Extract<SeedWorldAuthoringResult, { status: "preview" }> & Readonly<{ assetRef: null }>);

export type SeedWorldVegetationCreateResult = SeedWorldAssetMutationResult &
  Readonly<{
    readonly created: Readonly<{
      plant: SeedWorldPlantKind;
      assetKind: "tree" | "forest" | "shrub" | "shrubland" | "grassland" | "flower-field" | "aquatic-grass-bed";
      distribution: "single" | "area";
      requestedPlantCount: number | null;
      realizedPlantCount: number | null;
    }>;
  }>;

export type SeedWorldVegetationUpdateResult = SeedWorldAssetMutationResult &
  Readonly<{
    readonly updated: Readonly<{
      plant: SeedWorldPlantKind;
      assetKind: "tree" | "forest" | "shrub" | "shrubland" | "grassland" | "flower-field" | "aquatic-grass-bed";
      /**
       * Actual addressable members after Runtime placement constraints are
       * applied. Present for trees, forests, shrubs and shrublands only.
       */
      realizedPlantCount: number | null;
    }>;
  }>;

/** Stable semantic reference. Runtime Entity and renderer instance ids never cross the Agent boundary. */
export interface SeedWorldObjectRef {
  readonly worldId: string;
  readonly objectId: string;
  readonly objectKind: SeedWorldObjectKind;
  readonly worldRevision: number;
}

/** One discrete addressable object in the currently published world. */
export interface SeedWorldObject extends SeedWorldObjectRef {
  /** Runtime catalog authority, assigned by the producer (not saved author data).
   * Planning-owned membership must be replaced by the draft catalog during edits.
   * Omitted for objects managed by the native runtime. Independent of provenance. */
  readonly catalogOwner?: "planning";
  readonly position: readonly [x: number, y: number, z: number];
  readonly footprintMetres: readonly [width: number, depth: number];
  /**
   * Ownership of the addressable runtime object. Authoring-owned Population
   * instances retain their owning Feature id so a semantic create can return
   * the concrete Object Ref without leaking the backing brush resource.
   */
  readonly source: Readonly<{ kind: "population" | "authoring" | "decoration"; sourceId: string }>;
  readonly properties: Readonly<Record<string, unknown>>;
}

export type SeedWorldSpatialAnchor =
  | Readonly<{ kind: "viewer" }>
  | Readonly<{ kind: "object"; objectId: string }>
  | Readonly<{ kind: "position"; x: number; z: number }>;

export type SeedWorldSpatialRelation =
  | Readonly<{ kind: "at" }>
  | Readonly<{ kind: "in-front-of"; distanceMetres: number }>
  | Readonly<{ kind: "near"; preferredDistanceMetres: number }>
  | Readonly<{ kind: "around"; radiusMetres: number }>
  | Readonly<{
      kind: "offset";
      frame: "world" | "viewer";
      forwardMetres: number;
      rightMetres: number;
    }>;

/** Shared spatial language consumed by navigation and every positioned World Authoring Tool. */
export interface SeedWorldSpatialTarget {
  readonly anchor: SeedWorldSpatialAnchor;
  readonly relation: SeedWorldSpatialRelation;
  /** Reject stale object references instead of silently editing a newly regenerated world. */
  readonly expectedWorldRevision?: number;
}

export interface SeedWorldResolvedSpatialTarget {
  readonly geometry: "point" | "area";
  readonly position: readonly [x: number, y: number, z: number];
  readonly radiusMetres?: number;
  readonly anchor: Readonly<{
    kind: SeedWorldSpatialAnchor["kind"];
    object?: SeedWorldObjectRef;
  }>;
  readonly relation: SeedWorldSpatialRelation;
  readonly worldRevision: number;
}

export type SeedWorldObjectOrderField = "distance" | "viewAngle" | "elevation";

export interface SeedWorldObjectQueryInput {
  readonly kinds: readonly SeedWorldObjectKind[];
  readonly spatial?: Readonly<{
    readonly anchor: SeedWorldSpatialAnchor;
    readonly relation: "near" | "in-front-of";
    readonly maximumDistanceMetres?: number;
    readonly maximumViewAngleDegrees?: number;
  }>;
  readonly orderBy: readonly Readonly<{ field: SeedWorldObjectOrderField; direction: "asc" | "desc" }>[];
  readonly limit: number;
}

export interface SeedWorldObjectQueryResult {
  readonly worldId: string;
  readonly worldRevision: number;
  readonly inspectedObjectCount: number;
  readonly objects: readonly Readonly<
    SeedWorldObject & { readonly distanceMetres?: number; readonly viewAngleDegrees?: number }
  >[];
}

export interface SeedWorldWindInput {
  readonly speedMetresPerSecond?: number;
  readonly directionDegrees?: number;
  readonly gustiness?: number;
  readonly turbulence?: number;
}

export interface SeedWorldPrecipitationInput {
  readonly rainIntensity?: number;
  readonly snowIntensity?: number;
}

export interface SeedWorldAtmosphereInput {
  readonly skyColorRgb?: readonly [number, number, number] | null;
  readonly cloudiness?: number;
  readonly fogIntensity?: number;
}

export interface SeedWorldLightningInput {
  readonly frequency?: number;
  readonly intensity?: number;
}

/** One patch of the Environment resource. Preset is applied first, explicit channels override it. */
export interface SeedWorldEnvironmentUpdateInput {
  /** Host-only exact channel patches for draft publication/undo; never exposed in the LLM input schema. */
  readonly weatherChannels?: Partial<import("@galacean/engine").WeatherState>;
  readonly timeHours?: number;
  readonly fromTimeHours?: number;
  readonly season?: SeedWorldSeason;
  readonly weatherPreset?: SeedWorldWeatherPreset;
  readonly wind?: Readonly<SeedWorldWindInput>;
  readonly precipitation?: Readonly<SeedWorldPrecipitationInput>;
  readonly atmosphere?: Readonly<SeedWorldAtmosphereInput>;
  readonly lightning?: Readonly<SeedWorldLightningInput>;
  readonly transitionDuration: number;
  readonly waitForIbl: boolean;
}

export interface SeedWorldTimeUpdateInput {
  readonly timeHours?: number;
  readonly fromTimeHours?: number;
  readonly season?: SeedWorldSeason;
  readonly transitionDuration: number;
  readonly waitForIbl: boolean;
}

export interface SeedWorldAtmosphereUpdateRequest {
  readonly weatherPreset?: SeedWorldWeatherPreset;
  readonly wind?: Readonly<SeedWorldWindInput>;
  readonly precipitation?: Readonly<SeedWorldPrecipitationInput>;
  readonly atmosphere?: Readonly<SeedWorldAtmosphereInput>;
  readonly lightning?: Readonly<SeedWorldLightningInput>;
  readonly transitionDuration: number;
  readonly waitForIbl: boolean;
}

export interface SeedWorldTerrainPatchInput {
  readonly x: number;
  readonly z: number;
  readonly radiusMetres: number;
  readonly heightDeltaMetres: number;
}

/** Runtime sampling limits that determine whether a semantic Terrain Patch is representable. */
export interface SeedWorldTerrainPatchConstraints {
  /** Distance between adjacent authoritative Heightmap samples. */
  readonly heightSampleSpacingMetres: number;
  /** Smallest outer radius whose full-strength centre survives Heightmap rasterization. */
  readonly minimumRadiusMetres: number;
}

/** Resolved generic parametric landform. All normalized appearance controls use [0, 1]. */
export interface SeedWorldGenericTerrainFeatureInput {
  readonly kind: Exclude<SeedWorldTerrainFeatureKind, "hill">;
  readonly x: number;
  readonly z: number;
  readonly headingDegrees: number;
  readonly lengthMetres: number;
  readonly widthMetres: number;
  /** Positive raises terrain; negative carves it. */
  readonly elevationDeltaMetres: number;
  readonly sharpness: number;
  readonly asymmetry: number;
  readonly roughness: number;
  readonly erosion: number;
  readonly seed: number;
}

/** Resolved single-hill atom. Minor radii are derived by the terrain module, never supplied by the Agent. */
export interface SeedWorldHillFeatureInput extends SeedWorldHillAtomParameters {
  readonly kind: "hill";
  readonly x: number;
  readonly z: number;
  /** World heading where 0 is north (-Z) and 90 is east (+X). */
  readonly headingDegrees: number;
  readonly bodyMinorRadiusMetres: number;
  readonly influenceMinorRadiusMetres: number;
}

/** One resolved semantic terrain feature stored by AuthoringState. */
export type SeedWorldTerrainFeatureInput = SeedWorldGenericTerrainFeatureInput | SeedWorldHillFeatureInput;

export type SeedWorldTerrainFeatureDirection =
  | Readonly<{ kind: "viewer-forward" }>
  | Readonly<{ kind: "heading"; degrees: number }>;

interface SeedWorldTerrainFeatureCreateBase {
  readonly target: SeedWorldKernelSpatialTarget;
  readonly direction?: SeedWorldTerrainFeatureDirection;
  /** Transition duration in seconds; omission or zero publishes the final height immediately. */
  readonly transitionDurationSeconds?: number;
}

/** Public create request for the compact-cosine single-hill atom. */
export interface SeedWorldHillFeatureCreateInput extends SeedWorldTerrainFeatureCreateBase {
  readonly kind: "hill";
  readonly pedestalLiftMetres?: number;
  readonly influenceMajorRadiusMetres?: number;
  readonly peakReliefMetres?: number;
  readonly bodyMajorRadiusMetres?: number;
}

/** Public create request for terrain features that still use generic procedural controls. */
export interface SeedWorldGenericTerrainFeatureCreateInput extends SeedWorldTerrainFeatureCreateBase {
  readonly kind: Exclude<SeedWorldTerrainFeatureKind, "hill">;
  readonly lengthMetres?: number;
  readonly widthMetres?: number;
  readonly heightMetres?: number;
  readonly depthMetres?: number;
  readonly sharpness?: number;
  readonly asymmetry?: number;
  readonly roughness?: number;
  readonly erosion?: number;
  readonly seed?: number;
}

/** Public create request routed by semantic terrain kind. */
export type SeedWorldTerrainFeatureCreateInput =
  | SeedWorldHillFeatureCreateInput
  | SeedWorldGenericTerrainFeatureCreateInput;

/** Editable public parameters of one compact-cosine hill atom. */
export type SeedWorldHillFeaturePatch = Partial<Readonly<SeedWorldHillAtomParameters & { headingDegrees: number }>>;

/** Editable parameters of a generic procedural landform. */
export type SeedWorldGenericTerrainFeaturePatch = Partial<
  Omit<SeedWorldGenericTerrainFeatureInput, "kind" | "x" | "z">
>;

/** Kind-specific terrain update payload selected from the target Ref. */
export type SeedWorldTerrainFeaturePatch = SeedWorldHillFeaturePatch | SeedWorldGenericTerrainFeaturePatch;

/** Resolved internal patch persisted after kind-specific normalization. */
export type SeedWorldTerrainFeatureMutationPatch =
  | Partial<Omit<SeedWorldHillFeatureInput, "kind" | "x" | "z">>
  | Partial<Omit<SeedWorldGenericTerrainFeatureInput, "kind" | "x" | "z">>;

export type SeedWorldVegetationCreateInput = SeedWorldMutationControl &
  Readonly<{
    plant: SeedWorldPlantKind;
    target: SeedWorldKernelSpatialTarget;
    distribution: Readonly<{ kind: "single" }> | Readonly<{ kind: "area"; count?: number; radiusMetres?: number }>;
    seed?: number;
  }>;

/** Public update shape for an authored vegetation asset. Runtime brush fields stay internal. */
export type SeedWorldVegetationFeaturePatch = Readonly<{
  treeShape?: import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch;
  treeShapeScope?: "shared-effect";
  treeEffectIndex?: number;
  target?: SeedWorldKernelSpatialTarget;
  radiusMetres?: number;
  /** Exact replacement cardinality for authored forests and shrublands. */
  count?: number;
  seed?: number;
}>;

export type SeedWorldWaterColorRgb = import("@galacean/engine-water/world/SeedWorldWaterColor").SeedWorldWaterColorRgb;
export interface SeedWorldVegetationBrushInput {
  readonly category: SeedWorldVegetationKind;
  readonly plantKind: SeedWorldPlantKind;
  readonly distributionKind: SeedWorldVegetationDistributionKind;
  readonly x: number;
  readonly z: number;
  readonly radiusMetres: number;
  readonly densityScale: number;
  readonly requestedPlantCount?: number;
  readonly seed?: number;
}

export interface SeedWorldQueryPosition {
  readonly x: number;
  readonly z: number;
}

export type SeedWorldPointOrderField =
  | "elevation"
  | "slope"
  | "moisture"
  | "riverDistance"
  | "roadDistance"
  | "distance";

export interface SeedWorldPointQueryFilter {
  readonly minimumElevation?: number;
  readonly maximumElevation?: number;
  readonly minimumSlope?: number;
  readonly maximumSlope?: number;
  readonly minimumMoisture?: number;
  readonly maximumMoisture?: number;
  readonly maximumRiverDistance?: number;
  readonly maximumRoadDistance?: number;
  readonly landCover?: readonly string[];
  readonly water?: boolean;
}

export type SeedWorldPointQueryInput =
  | Readonly<{
      mode: "sample";
      positions: readonly SeedWorldQueryPosition[];
      sampleDistance: number;
    }>
  | Readonly<{
      mode: "search";
      where: Readonly<SeedWorldPointQueryFilter>;
      nearestTo?: Readonly<SeedWorldQueryPosition>;
      orderBy: readonly Readonly<{ field: SeedWorldPointOrderField; direction: "asc" | "desc" }>[];
      limit: number;
      spacingMetres: number;
    }>;

interface SeedWorldAuthoringResourceBase<
  ResourceType extends SeedWorldResourceType,
  Properties extends Readonly<Record<string, unknown>>
> {
  readonly resourceType: ResourceType;
  readonly resourceId: string;
  readonly contentHash: string;
  readonly properties: Properties;
}

/**
 * Typed projection of persistent AuthoringState resources. The application may
 * only update a semantic asset after narrowing this discriminant; raw runtime
 * records never cross the EnginePort boundary.
 */
export type SeedWorldAuthoringResource =
  | SeedWorldAuthoringResourceBase<"terrain-patch", Readonly<Record<string, unknown>>>
  | SeedWorldAuthoringResourceBase<"terrain-feature", Readonly<SeedWorldTerrainFeatureInput>>
  | SeedWorldAuthoringResourceBase<"vegetation-brush", Readonly<SeedWorldVegetationBrushInput>>
  | SeedWorldAuthoringResourceBase<"object-removal", Readonly<Omit<SeedWorldObjectRemovalInput, "objectId">>>;

export type SeedWorldAuthoringResourceOf<ResourceType extends SeedWorldResourceType> = Extract<
  SeedWorldAuthoringResource,
  { readonly resourceType: ResourceType }
>;

export interface SeedWorldAuthoringSnapshot {
  readonly activeRevision: number;
  readonly draftRevision: number;
  readonly authoringStateHash: string;
  readonly resources: readonly Readonly<SeedWorldAuthoringResource>[];
  readonly removedObjectIds: readonly string[];
}

export interface SeedWorldObjectRemovalInput {
  readonly objectId: string;
  readonly objectKind: SeedWorldRemovableObjectKind;
  readonly x: number;
  readonly z: number;
  readonly radiusMetres: number;
}

export type SeedWorldResourceMutation =
  | Readonly<{
      action: "update";
      resourceType: "tree-variation";
      value: Readonly<{
        recipeId: string;
        variationIndex: number;
        controls: import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch;
      }>;
    }>
  | Readonly<{ action: "create"; resourceType: "object-removal"; value: SeedWorldObjectRemovalInput }>
  | Readonly<{ action: "create"; resourceType: "terrain-patch"; value: SeedWorldTerrainPatchInput }>
  | Readonly<{
      action: "create";
      resourceType: "terrain-feature";
      value: SeedWorldTerrainFeatureInput;
      transitionDurationSeconds?: number;
    }>
  | Readonly<{
      action: "update";
      resourceType: "terrain-feature";
      resourceId: string;
      expectedContentHash: string;
      patch: SeedWorldTerrainFeatureMutationPatch;
      transitionDurationSeconds?: number;
    }>
  | Readonly<{
      action: "delete";
      resourceType: "terrain-feature";
      resourceId: string;
      expectedContentHash: string;
    }>
  | Readonly<{ action: "create"; resourceType: "vegetation-brush"; value: SeedWorldVegetationBrushInput }>
  | Readonly<{
      action: "update";
      resourceType: "vegetation-brush";
      resourceId: string;
      expectedContentHash: string;
      patch: Partial<SeedWorldVegetationBrushInput>;
    }>
  | Readonly<{
      action: "delete";
      resourceType: "vegetation-brush";
      resourceId: string;
      expectedContentHash: string;
    }>;

export interface SeedWorldLiveState {
  readonly world: {
    readonly rootSeed: number;
    readonly sizeMetres: number;
    readonly origin?: readonly [number, number];
  };
  readonly camera: {
    readonly mode: SeedWorldCameraMode;
    readonly position: readonly [number, number, number];
    readonly forward: readonly [number, number, number];
    /** Metres; optional for older saved camera snapshots and hosts without grounded navigation. */
    readonly navigation?: { readonly eyeHeight: number; readonly verticalOffset: number };
  };
  readonly plan: {
    readonly summitCount: number;
    readonly riverReachCount: number;
    readonly roadCount: number;
    readonly poiCount: number;
  };
  readonly population: {
    readonly treeAppearanceRevision?: number;
    readonly residentCellCount: number;
    readonly residentAcceptedCounts: Readonly<Record<"tree" | "shrub" | "flower" | "grass", number>>;
    readonly submittedCounts: Readonly<Record<"tree" | "shrub" | "flower" | "grass", number>>;
  };
  readonly decorations: {
    readonly rocks: number;
    readonly smallRocks: number;
    readonly mushrooms: number;
    readonly lotus: number;
  };
  readonly water: {
    readonly colors?: readonly { readonly bodyId: string; readonly colorRgb: readonly number[] | null }[];
    readonly ready: boolean;
    readonly visible: boolean;
    readonly bodyCount: number;
    readonly chunkCount: number;
    readonly hostRevision: number;
  };
  readonly lighting: {
    readonly timeHours: number;
    readonly phase: string;
    readonly playing: boolean;
    readonly iblPhase: string;
    readonly iblProgress: number;
    readonly iblPublishedRevision: number;
    readonly iblBakingEnabled: boolean;
  };
  readonly environment: {
    readonly skyColorRgb?: readonly [number, number, number] | null;
    readonly season: SeedWorldSeason;
    readonly seasonTransitionProgress: number;
    readonly precipitation: string;
    readonly rainIntensity: number;
    readonly snowIntensity: number;
    readonly cloudCoverage: number;
    readonly fogIntensity: number;
    readonly windSpeed: number;
    readonly windIntensity: number;
    readonly windDirectionDegrees: number;
    readonly windGustiness: number;
    readonly windTurbulence: number;
    readonly lightningFrequency: number;
    readonly lightningIntensity: number;
  };
}

/** Semantic mount request; the gameplay module owns presence and riding prerequisites. */
export interface SeedWorldMountCommandInput {
  readonly intent: "appear" | "dismount" | "dismiss";
}

/** Receipt for a scheduled behavior, not confirmation that its animation has completed. */
export interface SeedWorldMountCommandResult {
  readonly status: "accepted";
  readonly intent: SeedWorldMountCommandInput["intent"];
  readonly commandId: string;
}

export type SeedWorldSurfaceSegment = { start: [number, number, number]; end: [number, number, number] };
export interface SeedWorldSurfaceMeasurements {
  publicationRevision?: number;
  hits: ReturnType<
    import("@galacean/engine-building/building/runtime/ConstructionSurfaceQuery").ConstructionSurfaceQuery["intersectSegment"]
  >[];
}
export type SeedWorldSurfaceCapsule = SeedWorldSurfaceSegment & { radius: number };
export interface SeedWorldCapsuleMeasurements {
  publicationRevision?: number;
  hits: ReturnType<
    import("@galacean/engine-building/building/runtime/ConstructionSurfaceQuery").ConstructionSurfaceQuery["intersectCapsule"]
  >[];
}
export interface SeedWorldEnginePort {
  /** Read-only queries over an isolated, CPU-compiled spatial publication. */
  createSpatialQueryPort?(
    read: () => {
      plan: import("../../world/SeedWorldRuntimePlan").SeedWorldRuntimePlan;
      fields: import("../../runtime/SeedWorldFields.ts").SeedWorldFields;
      queryWater: (
        x: number,
        z: number
      ) => import("@galacean/engine-water/world/SeedWorldAuthoredWaterQuery").SeedWorldAuthoredWaterQueryResultV1;
      queryWaterRegions?: (kind: "ocean" | "river" | "lake", limit: number) => unknown;
    },
    revision: () => number
  ): Pick<
    SeedWorldEnginePort,
    "queryWorldPoints" | "queryWorldRegions" | "resolveSpatialTarget" | "readTerrainPatchConstraints"
  >;
  /** Host-owned editing context. Live simulation continues outside this draft. */
  readEditorDefaults?(): SeedWorldEditorSettings;
  beginEdit?(executionId: string, settings?: SeedWorldEditorSettings): SeedWorldEngineEdit;
  querySubjectCapsules?(capsules: readonly SeedWorldSurfaceCapsule[]): SeedWorldCapsuleMeasurements | undefined;
  querySubjectSegments?(segments: readonly SeedWorldSurfaceSegment[]): SeedWorldSurfaceMeasurements | undefined;
  /** Published native vegetation replaces the legacy population catalog when supplied. */
  readVegetationAssets?(): readonly Omit<SeedWorldSelectionItem, "type">[] | undefined;
  /**
   * Dispatches a mount intent without querying presence or rider state.
   * @param input - Semantic gameplay command.
   * @param signal - Cancellation before dispatch.
   * @returns A receipt for command acceptance.
   */
  commandMount?(
    input: Readonly<SeedWorldMountCommandInput>,
    signal: AbortSignal
  ): Promise<SeedWorldMountCommandResult> | SeedWorldMountCommandResult;
  readWaterColor?(ref: Readonly<SeedWorldRef>): SeedWorldWaterColorRgb | undefined;
  previewTreeVariationEdit?(
    recipeId: string,
    variationIndex: number,
    controls: import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch
  ): SeedWorldBounds;
  projectTreeVariationObject?(
    object: SeedWorldObject,
    controls: import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch
  ): SeedWorldObject;
  projectPlanningTrees?(
    instances: readonly import("../../runtime/SeedWorldPopulationPlan.ts").SeedWorldPopulationInstance[],
    ground: (x: number, z: number) => number,
    size: number,
    revision: number,
    patch: (
      recipeId: string,
      effectIndex: number
    ) => import("@galacean/engine-vegetation/world/SeedWorldTreeShapeControls").SeedWorldTreeShapePatch | undefined
  ): readonly SeedWorldObject[];
  readWorldState(): SeedWorldLiveState | null;
  readAuthoringSnapshot(): SeedWorldAuthoringSnapshot;
  queryWorldPoints(input: Readonly<SeedWorldPointQueryInput>): unknown;
  queryWorldRegions(kind: SeedWorldRegionKind, limit: number): unknown;
  queryWorldObjects(input: Readonly<SeedWorldObjectQueryInput>): SeedWorldObjectQueryResult;
  getWorldObject(objectId: string): SeedWorldObject;
  resolveSpatialTarget(target: Readonly<SeedWorldSpatialTarget>): SeedWorldResolvedSpatialTarget;
  readTerrainPatchConstraints(): SeedWorldTerrainPatchConstraints;
  teleport(input: Readonly<{ x: number; z: number; heightOffset: number }>): unknown;
  updateEnvironment(input: Readonly<SeedWorldEnvironmentUpdateInput>, signal: AbortSignal): Promise<unknown> | unknown;
  mutateWorldResource(
    input: Readonly<SeedWorldResourceMutation>,
    signal: AbortSignal,
    edit?: SeedWorldWaterEditOptions
  ): Promise<unknown> | unknown;
  /** Validate against an isolated planning draft without publishing or retaining edits. */
  validateWorldResources?(
    inputs: readonly Readonly<SeedWorldResourceMutation>[],
    signal: AbortSignal,
    edit?: SeedWorldWaterEditOptions
  ): Promise<void>;
  mutateWorldResources(
    inputs: readonly Readonly<SeedWorldResourceMutation>[],
    signal: AbortSignal,
    edit?: SeedWorldWaterEditOptions
  ): Promise<unknown> | unknown;
}

export type SeedWorldEditorCommand =
  | { kind: "teleport"; input: { x: number; z: number; heightOffset: number } }
  | { kind: "camera"; camera: SeedWorldLiveState["camera"] }
  | { kind: "mount"; input: SeedWorldMountCommandInput };

export type SeedWorldEngineChange =
  | SeedWorldEnvironmentChange
  | {
      kind: "command";
      forward: SeedWorldEditorCommand;
    };

export interface SeedWorldEngineEdit {
  setNavigationGround?(sample: (x: number, z: number) => number): void;
  readonly port: SeedWorldEnginePort;
  /** Ordered, serializable writes. Environment targets/configuration share one record. */
  readonly changes: readonly SeedWorldEngineChange[];
  readonly settings: SeedWorldEditorSettings;
  /** Restore saved authoring targets into a startup draft without replaying transition duration. */
  restoreSettings(settings: SeedWorldEditorSettings, signal: AbortSignal, force?: boolean): Promise<void>;
  prepare(signal: AbortSignal): void | Promise<void>;
  /** Close draft admission before publishing the owning editor document. */
  seal(): void;
  activate(signal: AbortSignal): Promise<void>;
  discard(): void;
}

/** Authoring targets, separate from instantaneous animation/physics state. */
export interface SeedWorldEditorSettings {
  environment?: SeedWorldEnvironmentUpdateInput;
  camera?: SeedWorldLiveState["camera"];
  mount?: SeedWorldMountCommandInput;
}
