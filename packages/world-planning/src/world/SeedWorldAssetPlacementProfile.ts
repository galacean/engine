/**
 * Schema version for the shared authored-asset placement catalog.
 * Root Seed output is reproducible only together with this version.
 */
export const SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION = 18;

/** Terminal visibility multiplier shared by sparse ground-detail LODs such as debris and mushrooms. */
export const SEED_WORLD_SURFACE_DETAIL_TERMINAL_DISTANCE_MULTIPLIER = 4;

/** Asset-neutral profile keys referenced by semantic feature and population compilers. */
export type SeedWorldAssetProfileKey =
  | "cliff-rock"
  | "feature-stone"
  | "small-stone"
  | "mushroom"
  | "tree"
  | "shrub"
  | "flower"
  | "grass";

/** Semantic role within one asset profile. */
export type SeedWorldPlacementRole = "field" | "cluster" | "accent" | "outcrop" | "hero";

/**
 * Asset-independent transform choice made by a Seed World compiler.
 * It contains no authored bounds, pivot, or model-unit scale.
 */
export interface SeedWorldTransformIntent<Key extends SeedWorldAssetProfileKey = SeedWorldAssetProfileKey> {
  /** Versioned profile selected by semantic category rather than a concrete Prefab. */
  readonly profileKey: Key;
  /** Semantic importance inside the owning feature grammar. */
  readonly role: SeedWorldPlacementRole;
  /** Stable normalized size choice in the selected role range. */
  readonly sizeRank: number;
  /** Optional feature-owned multiplier applied uniformly after the role size is resolved. */
  readonly sizeMultiplier?: number;
  /** Stable unsigned variation key for shape and future authored variants. */
  readonly shapeVariationKey: number;
}

/** Authored local geometry needed to turn an intent into a physical world footprint. */
export interface SeedWorldAuthoredPlacementGeometry {
  /** Local X-Z dimensions at unit scale. */
  readonly footprintMetres: readonly [width: number, depth: number];
  /** Root-local bottom and top used by the 3D grounding adapter. */
  readonly verticalBoundsMetres: readonly [minimum: number, maximum: number];
  /** Root-local anchor used by authored LOD groups. */
  readonly pivotMetres: readonly [x: number, y: number, z: number];
}

/** Authored LOD metadata copied from the source catalog. */
export interface SeedWorldAuthoredLodProfile {
  /** Source selection mode. */
  readonly kind: "screen-relative" | "distance-fade" | "none";
  /** Decreasing LOD transition thresholds in authored source order. */
  readonly thresholds: readonly number[];
}

/** One concrete authored family and its exact root-local placement geometry. */
export interface SeedWorldAuthoredPlacementVariant {
  /** Stable family name resolved by the runtime source catalog. */
  readonly prototypeFamily: string;
  /** Authored bounds and pivot owned by this family. */
  readonly geometry: SeedWorldAuthoredPlacementGeometry;
}

/** One semantic size interval owned by an AssetPlacementProfile. */
export interface SeedWorldPlacementSizeRange {
  /** Inclusive lower bound for the resolved maximum-axis scale. */
  readonly minimum: number;
  /** Inclusive upper bound for the resolved maximum-axis scale. */
  readonly maximum: number;
}

/** Profile-owned biological size policy for habitat-driven population. */
export interface SeedWorldVegetationPlacementProfile {
  /** Typical mature species height in world metres at neutral growth. */
  readonly baselineSpeciesHeightMetres: number;
  /** Smooth regional growth-field wavelength constrained to broad habitat variation. */
  readonly growthFieldWavelengthMetres: number;
  /** Inclusive multiplier range contributed by the regional growth field. */
  readonly regionalGrowthRange: readonly [minimum: number, maximum: number];
  /** Log-normal sigma used by a category-named individual height hash. */
  readonly individualLogNormalSigma: number;
  /** Inclusive clamp applied to individual growth after log-normal sampling. */
  readonly individualGrowthRange: readonly [minimum: number, maximum: number];
}

/** Versioned authored metadata and role sizing for one reusable asset family. */
export interface SeedWorldAssetPlacementProfile<Key extends SeedWorldAssetProfileKey = SeedWorldAssetProfileKey> {
  /** Stable semantic profile identity. */
  readonly key: Key;
  /** Profile schema revision; store with generator output for deterministic replay. */
  readonly version: number;
  /** Concrete source family resolved only after semantic planning. */
  readonly prototypeFamily: string;
  /** Authored geometry and root semantics. */
  readonly geometry: SeedWorldAuthoredPlacementGeometry;
  /** Optional named authored variants selected by `shapeVariationKey` before scale resolution. */
  readonly variants?: readonly SeedWorldAuthoredPlacementVariant[];
  /** Optional role-specific source families which replace the default variant set for that semantic role. */
  readonly roleVariants?: Readonly<
    Partial<Record<SeedWorldPlacementRole, readonly SeedWorldAuthoredPlacementVariant[]>>
  >;
  /** Authored LOD metadata retained with the placement source. */
  readonly lod: SeedWorldAuthoredLodProfile;
  /** Role-owned size intervals; compilers never embed these numbers in Plan data. */
  readonly roleScale: Readonly<Partial<Record<SeedWorldPlacementRole, SeedWorldPlacementSizeRange>>>;
  /** Optional target maximum X-Z extent in world metres, used when source variants have different authored sizes. */
  readonly roleSizeMetres?: Readonly<Partial<Record<SeedWorldPlacementRole, SeedWorldPlacementSizeRange>>>;
  /** Optional maximum child-to-parent footprint ratio used by parent-owned decoration grammars. */
  readonly maximumParentFootprintRatio?: number;
  /** Optional axis used when a semantic span determines the final scale. */
  readonly spanAxis?: "x" | "z";
  /** Population-only biological scale policy. */
  readonly vegetation?: SeedWorldVegetationPlacementProfile;
}

/** Exact physical result shared by 2D footprints and literal 3D instance consumers. */
export interface SeedWorldResolvedAssetPlacement<Key extends SeedWorldAssetProfileKey = SeedWorldAssetProfileKey> {
  /** Asset-neutral source intent retained for persistence and diagnostics. */
  readonly intent: SeedWorldTransformIntent<Key>;
  /** Profile version used for the resolution. */
  readonly profileVersion: number;
  /** Concrete authored family selected by the profile. */
  readonly prototypeFamily: string;
  /** Exact local X-Y-Z scale. */
  readonly scale: readonly [x: number, y: number, z: number];
  /** Exact scaled X-Z footprint used for OBB clearance and vector rendering. */
  readonly footprintMetres: readonly [width: number, depth: number];
}

/** Extra semantic geometry supplied by the owning feature compiler. */
export interface SeedWorldPlacementResolutionContext {
  /** Optional semantic coverage length resolved against the profile's authored span axis. */
  readonly spanMetres?: number;
  /** Whether vegetation keeps authored width locked to the resolved height scale. */
  readonly lockWidthToHeight?: boolean;
  /** Optional parent-owned maximum X-Z extent retained by resolved child decorations. */
  readonly maximumFootprintMetres?: number;
}

const PROFILE_VERSION = SEED_WORLD_ASSET_PLACEMENT_PROFILE_VERSION;

/** Exact authored Clif1 LOD0 bounds used by both placement sizing and final OBB projection. */
export const SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS = Object.freeze({
  minimum: Object.freeze([-7.33760929107666, -0.7289755344390869, -12.335319519042969] as const),
  maximum: Object.freeze([8.056169509887695, 11.147477149963379, 11.543103218078613] as const)
});

/** Authored Clif1 -> RockLab canonical axes; authored -Z becomes canonical pointed +Z. */
export const SEED_WORLD_ROCK_CLIF_1_ASSET_TO_CANONICAL_QUATERNION = Object.freeze([0, 1, 0, 0] as const);

const CLIFF_ROCK_GEOMETRY = Object.freeze({
  footprintMetres: Object.freeze([15.3937788, 23.87842274] as const),
  verticalBoundsMetres: Object.freeze([-0.72897553, 11.14747715] as const),
  pivotMetres: Object.freeze([0.3592801, 5.216352, 0.39493084] as const)
});

function stylizedStoneVariant(
  prototypeFamily: string,
  footprintMetres: readonly [number, number],
  verticalBoundsMetres: readonly [number, number]
): SeedWorldAuthoredPlacementVariant {
  return Object.freeze({
    prototypeFamily,
    geometry: Object.freeze({
      footprintMetres: Object.freeze([...footprintMetres] as const),
      verticalBoundsMetres: Object.freeze([...verticalBoundsMetres] as const),
      pivotMetres: Object.freeze([0, 0, 0] as const)
    })
  });
}

const placementProfiles = Object.freeze({
  "cliff-rock": Object.freeze({
    key: "cliff-rock",
    version: PROFILE_VERSION,
    prototypeFamily: "rock-clif-1",
    geometry: CLIFF_ROCK_GEOMETRY,
    variants: Object.freeze([
      Object.freeze({
        prototypeFamily: "rock-clif-1",
        geometry: CLIFF_ROCK_GEOMETRY
      })
    ]),
    lod: Object.freeze({
      kind: "screen-relative" as const,
      thresholds: Object.freeze([0.3461439, 0.1483718, 0.03275338] as const)
    }),
    roleScale: Object.freeze({
      field: Object.freeze({ minimum: 1, maximum: 1 }),
      cluster: Object.freeze({ minimum: 1, maximum: 1 }),
      accent: Object.freeze({ minimum: 1, maximum: 1 }),
      outcrop: Object.freeze({ minimum: 1, maximum: 1 }),
      hero: Object.freeze({ minimum: 1, maximum: 1 })
    }),
    roleSizeMetres: Object.freeze({
      field: Object.freeze({ minimum: 9, maximum: 24 }),
      cluster: Object.freeze({ minimum: 24, maximum: 48 }),
      accent: Object.freeze({ minimum: 24, maximum: 48 }),
      outcrop: Object.freeze({ minimum: 27, maximum: 105 }),
      hero: Object.freeze({ minimum: 105, maximum: 150 })
    })
  }),
  "feature-stone": Object.freeze({
    key: "feature-stone",
    version: PROFILE_VERSION,
    prototypeFamily: "stone-1",
    geometry: Object.freeze({
      footprintMetres: Object.freeze([1.99217886, 2.11926842] as const),
      verticalBoundsMetres: Object.freeze([-0.03917668, 1.16879404] as const),
      pivotMetres: Object.freeze([-0.05169275, 0.56480868, -0.04053271] as const)
    }),
    variants: Object.freeze([
      stylizedStoneVariant("stone-1", [1.99217886, 2.11926842], [-0.03917668, 1.16879404]),
      stylizedStoneVariant("stone-2", [1.43366694, 1.33692062], [-0.03168876, 0.99347538]),
      stylizedStoneVariant("stone-3", [0.89402944, 0.91020337], [-0.01606008, 0.86010003]),
      stylizedStoneVariant("stone-4", [0.72823769, 0.73851055], [-0.02026014, 0.69722706])
    ]),
    lod: Object.freeze({ kind: "screen-relative" as const, thresholds: Object.freeze([0.2, 0.04] as const) }),
    roleScale: Object.freeze({
      field: Object.freeze({ minimum: 1, maximum: 1 }),
      cluster: Object.freeze({ minimum: 1, maximum: 1 })
    }),
    roleSizeMetres: Object.freeze({
      field: Object.freeze({ minimum: 0.55, maximum: 2.4 }),
      cluster: Object.freeze({ minimum: 1.4, maximum: 4 })
    }),
    maximumParentFootprintRatio: 0.48
  }),
  "small-stone": Object.freeze({
    key: "small-stone",
    version: PROFILE_VERSION,
    prototypeFamily: "stones",
    geometry: Object.freeze({
      footprintMetres: Object.freeze([0.68192086, 0.70292255] as const),
      verticalBoundsMetres: Object.freeze([-0.00519262, 0.2545957] as const),
      pivotMetres: Object.freeze([0, 0, 0] as const)
    }),
    lod: Object.freeze({
      kind: "screen-relative" as const,
      thresholds: Object.freeze([0.20254786, 0.03625797] as const)
    }),
    roleScale: Object.freeze({ field: Object.freeze({ minimum: 1, maximum: 1 }) }),
    roleSizeMetres: Object.freeze({ field: Object.freeze({ minimum: 0.6, maximum: 1.6 }) }),
    maximumParentFootprintRatio: 0.48
  }),
  mushroom: Object.freeze({
    key: "mushroom",
    version: PROFILE_VERSION,
    prototypeFamily: "mushroom-1",
    geometry: Object.freeze({
      footprintMetres: Object.freeze([0.28605078, 0.2970092] as const),
      verticalBoundsMetres: Object.freeze([-0.03008358, 0.43922105] as const),
      pivotMetres: Object.freeze([0, 0, 0] as const)
    }),
    lod: Object.freeze({ kind: "screen-relative" as const, thresholds: Object.freeze([0.2, 0.04] as const) }),
    roleScale: Object.freeze({ cluster: Object.freeze({ minimum: 1, maximum: 1 }) }),
    roleSizeMetres: Object.freeze({ cluster: Object.freeze({ minimum: 0.45, maximum: 0.75 }) })
  }),
  tree: Object.freeze({
    key: "tree",
    version: PROFILE_VERSION,
    prototypeFamily: "tree",
    geometry: Object.freeze({
      footprintMetres: Object.freeze([9, 9] as const),
      verticalBoundsMetres: Object.freeze([0, 7] as const),
      pivotMetres: Object.freeze([0, 0, 0] as const)
    }),
    lod: Object.freeze({ kind: "screen-relative" as const, thresholds: Object.freeze([20, 42, 70] as const) }),
    roleScale: Object.freeze({ field: Object.freeze({ minimum: 0.38, maximum: 1.9 }) }),
    vegetation: Object.freeze({
      baselineSpeciesHeightMetres: 7,
      growthFieldWavelengthMetres: 220,
      regionalGrowthRange: Object.freeze([0.78, 1.24] as const),
      individualLogNormalSigma: 0.16,
      individualGrowthRange: Object.freeze([0.72, 1.42] as const)
    })
  }),
  shrub: Object.freeze({
    key: "shrub",
    version: PROFILE_VERSION,
    prototypeFamily: "shrub",
    geometry: Object.freeze({
      footprintMetres: Object.freeze([3.2, 3.2] as const),
      verticalBoundsMetres: Object.freeze([0, 2] as const),
      pivotMetres: Object.freeze([0, 0, 0] as const)
    }),
    lod: Object.freeze({ kind: "screen-relative" as const, thresholds: Object.freeze([0.2, 0.04] as const) }),
    roleScale: Object.freeze({ field: Object.freeze({ minimum: 0.68, maximum: 1.28 }) }),
    vegetation: Object.freeze({
      baselineSpeciesHeightMetres: 2,
      growthFieldWavelengthMetres: 160,
      regionalGrowthRange: Object.freeze([0.78, 1.2] as const),
      individualLogNormalSigma: 0.14,
      individualGrowthRange: Object.freeze([0.68, 1.28] as const)
    })
  }),
  flower: Object.freeze({
    key: "flower",
    version: PROFILE_VERSION,
    prototypeFamily: "flower",
    geometry: Object.freeze({
      footprintMetres: Object.freeze([0.6, 0.6] as const),
      verticalBoundsMetres: Object.freeze([0, 0.45] as const),
      pivotMetres: Object.freeze([0, 0, 0] as const)
    }),
    lod: Object.freeze({ kind: "distance-fade" as const, thresholds: Object.freeze([90, 105] as const) }),
    roleScale: Object.freeze({ field: Object.freeze({ minimum: 0.78, maximum: 1.2 }) }),
    vegetation: Object.freeze({
      baselineSpeciesHeightMetres: 0.45,
      growthFieldWavelengthMetres: 120,
      regionalGrowthRange: Object.freeze([0.82, 1.18] as const),
      individualLogNormalSigma: 0.12,
      individualGrowthRange: Object.freeze([0.78, 1.2] as const)
    })
  }),
  grass: Object.freeze({
    key: "grass",
    version: PROFILE_VERSION,
    prototypeFamily: "grass",
    geometry: Object.freeze({
      footprintMetres: Object.freeze([0.49775349, 0.40147868] as const),
      verticalBoundsMetres: Object.freeze([0, 0.6075266] as const),
      pivotMetres: Object.freeze([0, 0, 0] as const)
    }),
    lod: Object.freeze({ kind: "distance-fade" as const, thresholds: Object.freeze([90, 105] as const) }),
    roleScale: Object.freeze({ field: Object.freeze({ minimum: 0.77, maximum: 1.32 }) }),
    vegetation: Object.freeze({
      baselineSpeciesHeightMetres: 0.6075266,
      growthFieldWavelengthMetres: 100,
      regionalGrowthRange: Object.freeze([0.82, 1.18] as const),
      individualLogNormalSigma: 0.1,
      individualGrowthRange: Object.freeze([0.77, 1.32] as const)
    })
  })
} satisfies Record<SeedWorldAssetProfileKey, SeedWorldAssetPlacementProfile>);

/**
 * Reads one versioned authored placement profile.
 * @param key Semantic profile key selected by a feature or population compiler.
 * @returns Immutable profile metadata for the active generator revision.
 */
export function getSeedWorldAssetPlacementProfile<Key extends SeedWorldAssetProfileKey>(
  key: Key
): SeedWorldAssetPlacementProfile<Key> {
  return placementProfiles[key] as unknown as SeedWorldAssetPlacementProfile<Key>;
}

/**
 * Resolves an asset-neutral transform intent into exact scale and footprint data.
 * @param intent Stable semantic size and variation selection.
 * @param context Optional semantic span supplied by a feature compiler.
 * @returns Exact authored-family placement consumed identically by 2D and 3D.
 * @throws {RangeError} When the intent rank, variation key, role, or semantic span is invalid.
 */
export function resolveSeedWorldAssetPlacement<Key extends SeedWorldAssetProfileKey>(
  intent: SeedWorldTransformIntent<Key>,
  context: SeedWorldPlacementResolutionContext = {}
): SeedWorldResolvedAssetPlacement<Key> {
  if (!Number.isFinite(intent.sizeRank) || intent.sizeRank < 0 || intent.sizeRank > 1) {
    throw new RangeError("Seed World placement sizeRank must be normalized");
  }
  if (intent.sizeMultiplier !== undefined && (!Number.isFinite(intent.sizeMultiplier) || intent.sizeMultiplier <= 0)) {
    throw new RangeError("Seed World placement sizeMultiplier must be positive and finite");
  }
  if (
    !Number.isInteger(intent.shapeVariationKey) ||
    intent.shapeVariationKey < 0 ||
    intent.shapeVariationKey > 0xffff_ffff
  ) {
    throw new RangeError("Seed World placement shapeVariationKey must be an unsigned 32-bit integer");
  }
  const profile = getSeedWorldAssetPlacementProfile(intent.profileKey);
  const roleRange = profile.roleScale[intent.role];
  if (!roleRange) {
    throw new RangeError(`Seed World profile "${profile.key}" does not support role "${intent.role}"`);
  }
  const variant = resolveSeedWorldAuthoredPlacementVariant(intent);
  const prototypeFamily = variant?.prototypeFamily ?? profile.prototypeFamily;
  const geometry = variant?.geometry ?? profile.geometry;
  const targetSizeRange = profile.roleSizeMetres?.[intent.role];
  const maximumAxisScale = mix(roleRange.minimum, roleRange.maximum, intent.sizeRank);
  const shapeX = mix(0.82, 1.18, unitFloat(intent.shapeVariationKey, "shape-x"));
  const shapeY = mix(0.78, 1.12, unitFloat(intent.shapeVariationKey, "shape-y"));
  const shapeZ = mix(0.82, 1.18, unitFloat(intent.shapeVariationKey, "shape-z"));
  let scaleX = shapeX;
  let scaleY = shapeY;
  let scaleZ = shapeZ;
  if (profile.spanAxis && context.spanMetres !== undefined) {
    if (!Number.isFinite(context.spanMetres) || context.spanMetres <= 0) {
      throw new RangeError("Seed World placement spanMetres must be positive and finite");
    }
    const authoredSpan = profile.spanAxis === "x" ? geometry.footprintMetres[0] : geometry.footprintMetres[1];
    const spanScale = context.spanMetres / authoredSpan;
    if (profile.spanAxis === "x") {
      scaleX = spanScale;
      scaleY *= maximumAxisScale;
      scaleZ *= maximumAxisScale;
    } else {
      scaleX *= maximumAxisScale;
      scaleY *= maximumAxisScale;
      scaleZ = spanScale;
    }
  } else if (profile.vegetation && context.lockWidthToHeight) {
    scaleX = maximumAxisScale;
    scaleY = maximumAxisScale;
    scaleZ = maximumAxisScale;
  } else if (profile.vegetation) {
    scaleX *= maximumAxisScale;
    scaleY = maximumAxisScale;
    scaleZ *= maximumAxisScale;
  } else if (targetSizeRange) {
    const targetMaximumFootprintMetres = mix(targetSizeRange.minimum, targetSizeRange.maximum, intent.sizeRank);
    const normalizer =
      targetMaximumFootprintMetres /
      Math.max(geometry.footprintMetres[0] * shapeX, geometry.footprintMetres[1] * shapeZ);
    scaleX *= normalizer;
    scaleY *= normalizer;
    scaleZ *= normalizer;
  } else {
    const normalizer = maximumAxisScale / Math.max(shapeX, shapeY, shapeZ);
    scaleX *= normalizer;
    scaleY *= normalizer;
    scaleZ *= normalizer;
  }
  const sizeMultiplier = intent.sizeMultiplier ?? 1;
  scaleX *= sizeMultiplier;
  scaleY *= sizeMultiplier;
  scaleZ *= sizeMultiplier;
  if (context.maximumFootprintMetres !== undefined) {
    if (!Number.isFinite(context.maximumFootprintMetres) || context.maximumFootprintMetres <= 0) {
      throw new RangeError("Seed World placement maximumFootprintMetres must be positive and finite");
    }
    const maximumFootprintMetres = Math.max(geometry.footprintMetres[0] * scaleX, geometry.footprintMetres[1] * scaleZ);
    if (maximumFootprintMetres > context.maximumFootprintMetres) {
      const parentScale = context.maximumFootprintMetres / maximumFootprintMetres;
      scaleX *= parentScale;
      scaleY *= parentScale;
      scaleZ *= parentScale;
    }
  }
  const scale = Object.freeze([scaleX, scaleY, scaleZ] as const);
  return Object.freeze({
    intent: Object.freeze({ ...intent }),
    profileVersion: profile.version,
    prototypeFamily,
    scale,
    footprintMetres: Object.freeze([
      geometry.footprintMetres[0] * scaleX,
      geometry.footprintMetres[1] * scaleZ
    ] as const)
  });
}

/**
 * Resolves the exact authored family selected by one semantic intent before physical scaling.
 * @param intent Stable semantic role and variation key.
 * @returns The role-specific authored variant, or the profile default when no variant catalog exists.
 */
export function resolveSeedWorldAuthoredPlacementVariant<Key extends SeedWorldAssetProfileKey>(
  intent: SeedWorldTransformIntent<Key>
): SeedWorldAuthoredPlacementVariant | undefined {
  const profile = getSeedWorldAssetPlacementProfile(intent.profileKey);
  const variants = profile.roleVariants?.[intent.role] ?? profile.variants;
  return variants?.[intent.shapeVariationKey % variants.length];
}

function unitFloat(seed: number, namespace: string): number {
  let hash = (0x811c_9dc5 ^ seed) >>> 0;
  for (let index = 0; index < namespace.length; index++) {
    hash = Math.imul(hash ^ namespace.charCodeAt(index), 0x0100_0193) >>> 0;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb_352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846c_a68b) >>> 0;
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0x1_0000_0000;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

export const GRASS_AUTHORED_HEIGHT_METRES = (() => {
  const bounds = getSeedWorldAssetPlacementProfile("grass").geometry.verticalBoundsMetres;
  return bounds[1] - bounds[0];
})();
export const SEED_WORLD_GRASS_HEIGHT_RANGE_DEFAULT_METRES = Object.freeze({ minimum: 0.32, maximum: 1 });
export const SEED_WORLD_GRASS_SCALE_RANGE_DEFAULT = Object.freeze({
  minimum: SEED_WORLD_GRASS_HEIGHT_RANGE_DEFAULT_METRES.minimum / GRASS_AUTHORED_HEIGHT_METRES,
  maximum: SEED_WORLD_GRASS_HEIGHT_RANGE_DEFAULT_METRES.maximum / GRASS_AUTHORED_HEIGHT_METRES
});

export const DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM = 0.82;
export const DETAIL_HORIZONTAL_SCALE_VARIATION_RANGE = 0.36;
export const DETAIL_HORIZONTAL_SCALE_VARIATION_MAXIMUM =
  DETAIL_HORIZONTAL_SCALE_VARIATION_MINIMUM + DETAIL_HORIZONTAL_SCALE_VARIATION_RANGE;
