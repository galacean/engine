import {
  SEED_WORLD_DEFAULT_FBM,
  sampleSeedWorldCenteredFbm,
  sampleSeedWorldFbmHeightOffsetMetres,
  type SeedWorldFbmParameters
} from "@galacean/engine-terrain/world/SeedWorldFbm";
import {
  SEED_WORLD_HILL_PEDESTAL_MAXIMUM_SLOPE_DEGREES as HILL_PEDESTAL_SLOPE_DEGREES,
  SEED_WORLD_HILL_RELIEF_MAXIMUM_SLOPE_DEGREES as HILL_RELIEF_SLOPE_DEGREES,
  resolveSeedWorldHillAtom,
  sampleSeedWorldCompactCosine as sampleCompactCosine,
  seedWorldCompactCosineAmplitudeForSlope as compactCosineAmplitudeForSlope,
  seedWorldCompactCosineRadiusForSlope as compactCosineRadiusForSlope
} from "../world/SeedWorldHillAtom.ts";
import {
  seedWorldGeologyCoreSeed,
  type SeedWorldGeologyHillEdit,
  type SeedWorldGeologyParameters
} from "@galacean/engine-terrain/world/SeedWorldGeologySeedCodec";

/** X-Z point in metres relative to the centre of the 3072m Seed World. */
export interface SeedWorldGeologyPoint {
  /** World X in metres. */
  readonly x: number;
  /** World Z in metres. */
  readonly z: number;
}

/** Curved regional uplift band that establishes broad elevation hierarchy. */
export interface SeedWorldGeologyUpliftBelt {
  /** Stable identity independent from all later hills. */
  readonly id: string;
  /** Ordered Catmull-Rom control points in centred world metres. */
  readonly points: readonly SeedWorldGeologyPoint[];
  /** Physical half-width of the compact uplift support. */
  readonly widthMetres: number;
  /** Maximum uplift at the centreline. */
  readonly liftMetres: number;
  /** Counter-clockwise broad direction from positive world X. */
  readonly directionRadians: number;
}

/** One terrain-cutting canyon centreline and its explicit bank ownership. */
export interface SeedWorldGeologyCanyon {
  /** Stable identity retained by roads and hill-bank relations. */
  readonly id: string;
  /** Main cross-world corridor or terrain-derived tributary. */
  readonly kind: "trunk" | "tributary";
  /** Owning trunk identity; a trunk owns itself. */
  readonly trunkId: string;
  /** Ordered Catmull-Rom control points from canyon start to end. */
  readonly points: readonly SeedWorldGeologyPoint[];
  /** Full bank-to-bank planning width in metres. */
  readonly widthMetres: number;
  /** Maximum compact-cosine terrain cut in metres. */
  readonly depthMetres: number;
  /** Stable hill identities lying on the left of the ordered centreline. */
  readonly leftBankHillIds: readonly string[];
  /** Stable hill identities lying on the right of the ordered centreline. */
  readonly rightBankHillIds: readonly string[];
}

/** Terrain-only relation between one hill and an ordered canyon centreline. */
export interface SeedWorldGeologyCanyonBankRelation {
  /** Canyon whose ordered centreline defines left and right. */
  readonly canyonId: string;
  /** Side determined from the ordered canyon tangent and hill centre. */
  readonly side: "left" | "right";
  /** Normalized position on the canyon guide nearest the hill. */
  readonly guideParameter: number;
  /** Nearest relation point on the canyon centreline; never a rock contact. */
  readonly bankAnchor: SeedWorldGeologyPoint;
  /** Direction from hill centre toward bankAnchor, clockwise from positive world Z. */
  readonly canyonFacingBearingRadians: number;
}

/** Layout-owned correspondence between the two terrain shoulders of one canyon cross-section. */
export interface SeedWorldGeologyCanyonBankPair {
  /** Stable identity independent from downstream rock or vegetation compilers. */
  readonly id: string;
  /** Canyon whose ordered guide defines this cross-section. */
  readonly canyonId: string;
  /** Mean normalized guide position of the paired terrain hills. */
  readonly guideParameter: number;
  /** Left hill's normalized position on the ordered canyon guide. */
  readonly leftGuideParameter: number;
  /** Right hill's normalized position on the ordered canyon guide. */
  readonly rightGuideParameter: number;
  /** Stable hill identity on the left of the ordered canyon guide. */
  readonly leftHillId: string;
  /** Stable hill identity on the right of the ordered canyon guide. */
  readonly rightHillId: string;
  /** Layout-owned pointed-end direction for the left hill, toward the canyon sky opening. */
  readonly leftUphillBearingRadians: number;
  /** Layout-owned pointed-end direction for the right hill, toward the canyon sky opening. */
  readonly rightUphillBearingRadians: number;
}

/** Maximum normalized canyon-guide offset still treated as one visual cross-section. */
export const SEED_WORLD_CANYON_BANK_PAIR_MAXIMUM_GUIDE_DELTA = 0.2;

/** Terrain-facing shoulder interval that downstream compilers may search on the final Heightmap. */
export interface SeedWorldGeologyShoulderRange {
  /** Direction from hill centre toward the preferred exterior shoulder, clockwise from positive world Z. */
  readonly preferredExteriorBearingRadians: number;
  /** Minimum normalized distance from hill centre divided by body minor radius. */
  readonly minimumBodyMinorRatio: number;
  /** Maximum normalized distance from hill centre divided by body minor radius. */
  readonly maximumBodyMinorRatio: number;
  /** Terrain relationship that selected this shoulder. */
  readonly source: "canyon-bank" | "nearest-lowland";
}

/** One normalized compact-cosine hill contributing broad pedestal and local relief. */
export interface SeedWorldGeologyHill {
  /** Stable identity whose random channels do not depend on array consumption order. */
  readonly id: string;
  /** Stable zero-based ordinal used by authoring extensions. */
  readonly ordinal: number;
  /** Centre in world metres. */
  readonly center: SeedWorldGeologyPoint;
  /** Counter-clockwise major-axis direction from positive world X. */
  readonly rotationRadians: number;
  /** Direction originally requested by the owning canyon or uplift belt. */
  readonly desiredRotationRadians: number;
  /** Major and minor radii of the visible local hill body. */
  readonly bodyRadiusMetres: Readonly<{ major: number; minor: number }>;
  /** Major and minor radii of the broad pedestal influence. */
  readonly influenceRadiusMetres: Readonly<{ major: number; minor: number }>;
  /** Broad compact-cosine pedestal uplift. */
  readonly pedestalLiftMetres: number;
  /** Local compact-cosine relief above the shared pedestal. */
  readonly peakReliefMetres: number;
  /** Optional formal canyon-bank relation. */
  readonly canyonBank?: SeedWorldGeologyCanyonBankRelation;
  /** Searchable terrain shoulder range; this is not an asset or Transform contract. */
  readonly usableShoulder: SeedWorldGeologyShoulderRange;
}

/** Undirected proximity relation between two hills. */
export interface SeedWorldGeologyAdjacency {
  /** Stable smaller hill identity. */
  readonly hillAId: string;
  /** Stable larger hill identity. */
  readonly hillBId: string;
  /** Centre-to-centre distance in metres. */
  readonly distanceMetres: number;
  /** Signed support overlap divided by combined directional radii. */
  readonly overlapRatio: number;
}

/** One terrain-derived road sample with its locally resolved surface profile. */
export interface SeedWorldGeologyRoadPoint extends SeedWorldGeologyPoint {
  /** Paved half-width after local slope and relief confinement are evaluated. */
  readonly coreHalfWidthMetres: number;
  /** C2 falloff width outside the paved core. */
  readonly shoulderWidthMetres: number;
}

/** One terrain-planned road curve that remains independent from water, rocks, and vegetation. */
export interface SeedWorldGeologyRoad {
  /** Stable road identity. */
  readonly id: string;
  /** Cross-world main route or terrain-derived branch. */
  readonly kind: "main" | "branch";
  /** Smoothed centreline and terrain-derived width profile in world metres. */
  readonly points: readonly SeedWorldGeologyRoadPoint[];
  /** Maximum sampled natural-terrain slope along the route. */
  readonly maximumSlopeDegrees: number;
  /** Whether the route enters or exits the finite world boundary. */
  readonly reachesBoundary: boolean;
}

/** Road entrance, exit, or branch junction retained for debug labelling. */
export interface SeedWorldGeologyRoadNode {
  /** Stable node identity. */
  readonly id: string;
  /** Semantic node role. */
  readonly kind: "entry" | "exit" | "branch-junction";
  /** World-space location in metres. */
  readonly position: SeedWorldGeologyPoint;
}

/** Terrain-only region suitable for later 3D spawn evaluation. */
export interface SeedWorldGeologySuitableRegion {
  /** Stable grid-derived identity. */
  readonly id: string;
  /** Representative centre in world metres. */
  readonly center: SeedWorldGeologyPoint;
  /** Conservative circular support radius wholly inside the suitable samples. */
  readonly radiusMetres: number;
  /** Intrinsic terrain opportunity score without centre, water, material, or population bias. */
  readonly terrainScore: number;
  /** Sampled natural height in metres. */
  readonly heightMetres: number;
  /** Sampled physical slope in degrees. */
  readonly slopeDegrees: number;
  /** Local Laplacian curvature in inverse metres. */
  readonly curvaturePerMetre: number;
  /** Distance to the nearest canyon centreline in metres. */
  readonly nearestCanyonDistanceMetres: number;
  /** Distance to the nearest visible hill body in metres. */
  readonly nearestHillClearanceMetres: number;
}

/** Decomposed final height sample used by runtime terrain and downstream surface fitting. */
export interface SeedWorldGeologyHeightSample {
  /** Final coast-clamped height after all geological terms. */
  readonly heightMetres: number;
  /** Band-limited base ground before coast attenuation. */
  readonly foundationMetres: number;
  /** Broad regional uplift belt contribution. */
  readonly beltUpliftMetres: number;
  /** Broad hill pedestal contribution. */
  readonly hillPedestalMetres: number;
  /** Local hill relief contribution. */
  readonly reliefMetres: number;
  /** Canyon cut subtracted from the terrain. */
  readonly canyonCutMetres: number;
  /** Broad orographic opening that keeps curved trunk valleys usable between overlapping hills. */
  readonly canyonLowlandOpeningMetres: number;
  /** Zero-to-one factor that connects the land formula to the ocean floor. */
  readonly coastFactor: number;
  /** Stable hill identity owning the strongest local uplift, when any. */
  readonly dominantHillId?: string;
  /** Horizontal distance from the dominant hill centre in metres. */
  readonly dominantHillSlopeLengthMetres: number;
}

/** Square sampled output of the shared continuous geology formula. */
export interface SeedWorldGeologyHeightfield {
  /** Inclusive vertex count along each axis. */
  readonly resolution: number;
  /** Physical spacing between adjacent samples. */
  readonly spacingMetres: number;
  /** Final height in row-major Z-X order. */
  readonly heights: Float32Array;
  /** Base ground before analytic uplift. */
  readonly foundationHeights: Float32Array;
  /** Regional belt contribution. */
  readonly beltUpliftHeights: Float32Array;
  /** Broad hill pedestal contribution. */
  readonly hillPedestalHeights: Float32Array;
  /** Local hill relief contribution. */
  readonly reliefHeights: Float32Array;
  /** Canyon cut contribution. */
  readonly canyonCutHeights: Float32Array;
  /** Broad trunk-valley opening subtracted from overlapping uplift. */
  readonly canyonLowlandOpeningHeights: Float32Array;
  /** Physical slope in degrees. */
  readonly slopesDegrees: Float32Array;
  /** Local Laplacian curvature in inverse metres. */
  readonly curvaturePerMetre: Float32Array;
  /** Unit normals stored as contiguous X-Y-Z triples. */
  readonly normals: Float32Array;
  /** Horizontal slope length from the dominant hill centre. */
  readonly dominantHillSlopeLengthsMetres: Float32Array;
  /** Minimum final height. */
  readonly minimumHeightMetres: number;
  /** Maximum final height. */
  readonly maximumHeightMetres: number;
  /** Maximum sampled physical slope. */
  readonly maximumSlopeDegrees: number;
}

/** Complete deterministic terrain layout shared by 2D acceptance and 3D runtime. */
export interface SeedWorldGeologyLayout {
  /** Stable unsigned geological entropy. */
  readonly geologySeed: number;
  /** Stable hash of entropy and every resolved public geology control. */
  readonly worldId: number;
  /** Physical finite-world width in metres. */
  readonly worldSizeMetres: number;
  /** Fully resolved public authoring controls. */
  readonly parameters: SeedWorldGeologyParameters;
  /** Curved regional uplift hierarchy. */
  readonly upliftBelts: readonly SeedWorldGeologyUpliftBelt[];
  /** Stable compact-cosine hills. */
  readonly hills: readonly SeedWorldGeologyHill[];
  /** Curved terrain-cutting trunk and tributary canyons. */
  readonly canyons: readonly SeedWorldGeologyCanyon[];
  /** Explicit opposing-bank hill pairs derived before any asset compiler runs. */
  readonly canyonBankPairs: readonly SeedWorldGeologyCanyonBankPair[];
  /** Connected hill proximity graph. */
  readonly adjacency: readonly SeedWorldGeologyAdjacency[];
  /** Terrain-derived cross-world road network. */
  readonly roads: readonly SeedWorldGeologyRoad[];
  /** Road entry, exit, and branch junction markers. */
  readonly roadNodes: readonly SeedWorldGeologyRoadNode[];
  /** Every terrain-only region retained for later 3D spawn evaluation. */
  readonly suitableRegions: readonly SeedWorldGeologySuitableRegion[];
}

/** Input required to compile one deterministic geological world. */
export interface SeedWorldGeologyLayoutRequest {
  /** Unsigned geological entropy. */
  readonly geologySeed: number;
  /** Fully resolved public controls decoded from the composite Seed URL. */
  readonly parameters: SeedWorldGeologyParameters;
  /** Optional stable per-hill edits encoded by gx. */
  readonly hillEdits?: readonly SeedWorldGeologyHillEdit[];
}

const WORLD_SIZE_METRES = 3_072;
const HALF_WORLD_METRES = WORLD_SIZE_METRES * 0.5;
const DATUM_METRES = 12;
const OCEAN_FLOOR_METRES = -24;
/** Accepted upper physical slope used by geology diagnostics; hills enforce stricter local envelopes. */
export const SEED_WORLD_GEOLOGY_MAXIMUM_SLOPE_DEGREES = 42;
const UPLIFT_BELT_SLOPE_DEGREES = 30;
const CANYON_CUT_SLOPE_DEGREES = 12;
const ROAD_MAXIMUM_SLOPE_DEGREES = 24;
const ROAD_MAIN_CORE_HALF_WIDTH_METRES = Object.freeze([5.5, 8.5] as const);
const ROAD_BRANCH_CORE_HALF_WIDTH_METRES = Object.freeze([4.5, 7.25] as const);
const ROAD_MAIN_SHOULDER_WIDTH_METRES = Object.freeze([10, 18] as const);
const ROAD_BRANCH_SHOULDER_WIDTH_METRES = Object.freeze([8, 15] as const);
const LAYOUT_FIELD_RESOLUTION = 49;
const ROAD_FIELD_RESOLUTION = 33;
const heightfieldCache = new WeakMap<SeedWorldGeologyLayout, Map<string, SeedWorldGeologyHeightfield>>();
const curveSamplesCache = new WeakMap<readonly SeedWorldGeologyPoint[], readonly SeedWorldGeologyPoint[]>();
const hillRotationCache = new WeakMap<SeedWorldGeologyHill, Readonly<{ cosine: number; sine: number }>>();

interface MutableCanyon {
  readonly id: string;
  readonly kind: "trunk" | "tributary";
  readonly trunkId: string;
  readonly points: readonly SeedWorldGeologyPoint[];
  readonly widthMetres: number;
  readonly depthMetres: number;
}

interface HillShape {
  bodyMajor: number;
  bodyMinor: number;
  influenceMajor: number;
  influenceMinor: number;
  pedestalLift: number;
  peakRelief: number;
}

interface MutableHill extends SeedWorldGeologyHill {
  readonly provisionalCanyonIndex: number;
}

interface CurveNearest {
  readonly distanceMetres: number;
  readonly position: SeedWorldGeologyPoint;
  readonly parameter: number;
}

/**
 * Compiles regional uplift, hills, canyon graph, roads, and terrain-only suitable regions once.
 * @param request Composite-Seed geology state with optional stable local edits.
 * @returns Immutable layout consumed by both the acceptance UI and 3D terrain runtime.
 */
export function compileSeedWorldGeologyLayout(request: SeedWorldGeologyLayoutRequest): SeedWorldGeologyLayout {
  const geologyOnly = compileSeedWorldGeologyLayoutGeometry(request);
  const field = compileSeedWorldGeologyHeightfield(geologyOnly, LAYOUT_FIELD_RESOLUTION);
  const suitableRegions = makeSuitableRegions(geologyOnly, field);
  const roadField = compileSeedWorldGeologyHeightfield(geologyOnly, ROAD_FIELD_RESOLUTION);
  const roadNetwork = makeRoadNetwork(geologyOnly, roadField, suitableRegions);
  const layout = Object.freeze({
    ...geologyOnly,
    roads: roadNetwork.roads,
    roadNodes: roadNetwork.nodes,
    suitableRegions
  });
  heightfieldCache.set(
    layout,
    new Map([
      [heightfieldCacheKey(LAYOUT_FIELD_RESOLUTION, SEED_WORLD_DEFAULT_FBM), field],
      [heightfieldCacheKey(ROAD_FIELD_RESOLUTION, SEED_WORLD_DEFAULT_FBM), roadField]
    ])
  );
  return layout;
}

/**
 * Compiles the exact terrain geometry affected continuously by authoring controls, without downstream road searches.
 * @param request Composite-Seed geology state with optional stable local edits.
 * @returns Immutable uplift, hill, canyon, and adjacency layout with empty downstream collections.
 */
export function compileSeedWorldGeologyLayoutGeometry(request: SeedWorldGeologyLayoutRequest): SeedWorldGeologyLayout {
  validateParameters(request.parameters);
  const geologySeed = seedWorldGeologyCoreSeed(request.geologySeed);
  const upliftBelts = makeUpliftBelts(geologySeed, request.parameters);
  const canyonTrunks = makeCanyonTrunks(geologySeed, request.parameters);
  const provisionalHills = makeHills(
    geologySeed,
    request.parameters,
    upliftBelts,
    canyonTrunks,
    request.hillEdits ?? []
  );
  const tributaries = makeTributaries(geologySeed, request.parameters, canyonTrunks, provisionalHills);
  const mutableCanyons = [...canyonTrunks, ...tributaries];
  const hills = finalizeHillTerrainRelations(provisionalHills, mutableCanyons);
  const canyons = finalizeCanyonBanks(mutableCanyons, hills);
  const canyonBankPairs = makeCanyonBankPairs(canyons, hills);
  const adjacency = makeAdjacency(hills);
  const geologyOnly: SeedWorldGeologyLayout = Object.freeze({
    geologySeed,
    worldId: hashLayoutIdentity(geologySeed, request.parameters, request.hillEdits ?? []),
    worldSizeMetres: WORLD_SIZE_METRES,
    parameters: request.parameters,
    upliftBelts,
    hills,
    canyons,
    canyonBankPairs,
    adjacency,
    roads: Object.freeze([]),
    roadNodes: Object.freeze([]),
    suitableRegions: Object.freeze([])
  });
  return geologyOnly;
}

/**
 * Samples the shared continuous terrain equation without a post-process slope projection.
 * @param layout Geological layout owning every analytic term.
 * @param worldX Centred world X in metres.
 * @param worldZ Centred world Z in metres.
 * @returns Final height and decomposed terrain terms at the requested point.
 */
export function sampleSeedWorldGeologyHeight(
  layout: Pick<SeedWorldGeologyLayout, "geologySeed" | "parameters" | "upliftBelts" | "hills" | "canyons">,
  worldX: number,
  worldZ: number,
  fbmParameters: SeedWorldFbmParameters = SEED_WORLD_DEFAULT_FBM
): SeedWorldGeologyHeightSample {
  const samplePoint = { x: worldX, z: worldZ };
  const foundationMetres =
    DATUM_METRES + sampleSeedWorldFbmHeightOffsetMetres(worldX, worldZ, layout.geologySeed, fbmParameters);
  let beltUpliftMetres = 0;
  for (const belt of layout.upliftBelts) {
    beltUpliftMetres = Math.max(
      beltUpliftMetres,
      belt.liftMetres * sampleCompactCosine(curveDistance(samplePoint, belt.points) / belt.widthMetres)
    );
  }
  let hillPedestalMetres = 0;
  let reliefMetres = 0;
  let dominantUpliftMetres = 0;
  let dominantHill: SeedWorldGeologyHill | undefined;
  let dominantHillSlopeLengthMetres = 0;
  let dominantHillBodyDistance = Number.POSITIVE_INFINITY;
  for (const hill of layout.hills) {
    const deltaX = worldX - hill.center.x;
    const deltaZ = worldZ - hill.center.z;
    const { cosine, sine } = getHillRotation(hill);
    const localX = deltaX * cosine + deltaZ * sine;
    const localZ = -deltaX * sine + deltaZ * cosine;
    const pedestal =
      hill.pedestalLiftMetres *
      sampleCompactCosine(
        Math.hypot(localX / hill.influenceRadiusMetres.major, localZ / hill.influenceRadiusMetres.minor)
      );
    const bodyDistance = Math.hypot(localX / hill.bodyRadiusMetres.major, localZ / hill.bodyRadiusMetres.minor);
    const relief = hill.peakReliefMetres * sampleCompactCosine(bodyDistance);
    hillPedestalMetres = Math.max(hillPedestalMetres, pedestal);
    reliefMetres = Math.max(reliefMetres, relief);
    if (pedestal + relief > dominantUpliftMetres) {
      dominantUpliftMetres = pedestal + relief;
      dominantHill = hill;
      dominantHillSlopeLengthMetres = Math.hypot(localX, localZ);
      dominantHillBodyDistance = bodyDistance;
    }
  }
  let canyonCutMetres = 0;
  let canyonLowlandSupport = 0;
  for (const canyon of layout.canyons) {
    const supportRadius = canyon.widthMetres * (canyon.kind === "trunk" ? 0.92 : 0.78);
    const distanceMetres = curveDistance(samplePoint, canyon.points);
    canyonCutMetres = Math.max(
      canyonCutMetres,
      canyon.depthMetres * sampleCompactCosine(distanceMetres / supportRadius)
    );
    if (canyon.kind === "trunk")
      canyonLowlandSupport = Math.max(
        canyonLowlandSupport,
        sampleCompactCosine(distanceMetres / (canyon.widthMetres * 2.4))
      );
  }
  const coastSignedDistanceMetres = sampleSeedWorldGeologyCoastSignedDistanceMetres(layout, worldX, worldZ);
  const coastFactor = smootherstep(
    (coastSignedDistanceMetres + layout.parameters.coastTransition * 0.52) / layout.parameters.coastTransition
  );
  const coastalFoundationMetres = mix(OCEAN_FLOOR_METRES, foundationMetres, coastFactor);
  const localHillBodySupport = dominantHill ? sampleCompactCosine(dominantHillBodyDistance) : 0;
  const canyonLowlandOpeningMetres =
    (beltUpliftMetres + hillPedestalMetres * (1 - localHillBodySupport)) * canyonLowlandSupport * 0.635;
  const rawHeightMetres =
    coastalFoundationMetres +
    beltUpliftMetres +
    hillPedestalMetres +
    reliefMetres -
    (canyonCutMetres + canyonLowlandOpeningMetres) * coastFactor;
  return Object.freeze({
    heightMetres: Math.max(OCEAN_FLOOR_METRES, rawHeightMetres),
    foundationMetres,
    beltUpliftMetres,
    hillPedestalMetres,
    reliefMetres,
    canyonCutMetres,
    canyonLowlandOpeningMetres,
    coastFactor,
    ...(dominantHill ? { dominantHillId: dominantHill.id } : {}),
    dominantHillSlopeLengthMetres
  });
}

/**
 * Samples the geology-owned coastline used by Hydrology and runtime surface ownership.
 * @param layout Geological entropy and coast-transition control.
 * @param worldX Centred world X in metres.
 * @param worldZ Centred world Z in metres.
 * @returns Approximate signed distance in metres; positive values are inland.
 */
export function sampleSeedWorldGeologyCoastSignedDistanceMetres(
  layout: Pick<SeedWorldGeologyLayout, "geologySeed" | "parameters">,
  worldX: number,
  worldZ: number
): number {
  const edgeDistanceMetres = HALF_WORLD_METRES - Math.max(Math.abs(worldX), Math.abs(worldZ));
  const coastNoiseMetres =
    sampleSeedWorldCenteredFbm(worldX / 860, worldZ / 860, (layout.geologySeed ^ 0x51e2_a93d) >>> 0, 2) *
    layout.parameters.coastTransition *
    0.16;
  return edgeDistanceMetres + coastNoiseMetres - layout.parameters.coastTransition * 0.52;
}

/**
 * Samples one ordered geology guide with the same interpolation used by terrain and overlays.
 * @param points Ordered guide control points.
 * @param parameter Normalized curve position in the inclusive zero-to-one range.
 * @returns Centred world-space X-Z point on the guide.
 */
export function sampleSeedWorldGeologyCurve(
  points: readonly SeedWorldGeologyPoint[],
  parameter: number
): SeedWorldGeologyPoint {
  return curvePoint(points, clamp(parameter, 0, 1));
}

/**
 * Samples the final terrain and its physical derivatives at a requested square resolution.
 * @param layout Shared deterministic geology layout.
 * @param resolution Inclusive vertex count along one world axis.
 * @param fbmParameters Band-limited ground profile used by the continuous geology equation.
 * @returns Cached decomposed heightfield with slope, curvature, normals, and slope length.
 * @throws {RangeError} When resolution is not an integer greater than one.
 */
export function compileSeedWorldGeologyHeightfield(
  layout: SeedWorldGeologyLayout,
  resolution: number,
  fbmParameters: SeedWorldFbmParameters = SEED_WORLD_DEFAULT_FBM
): SeedWorldGeologyHeightfield {
  if (!Number.isInteger(resolution) || resolution < 2)
    throw new RangeError("Geology Heightfield requires at least two samples");
  const cacheKey = heightfieldCacheKey(resolution, fbmParameters);
  const cached = heightfieldCache.get(layout)?.get(cacheKey);
  if (cached) return cached;
  const count = resolution ** 2;
  const heights = new Float32Array(count);
  const foundationHeights = new Float32Array(count);
  const beltUpliftHeights = new Float32Array(count);
  const hillPedestalHeights = new Float32Array(count);
  const reliefHeights = new Float32Array(count);
  const canyonCutHeights = new Float32Array(count);
  const canyonLowlandOpeningHeights = new Float32Array(count);
  const dominantHillSlopeLengthsMetres = new Float32Array(count);
  const spacingMetres = WORLD_SIZE_METRES / (resolution - 1);
  let minimumHeightMetres = Number.POSITIVE_INFINITY;
  let maximumHeightMetres = Number.NEGATIVE_INFINITY;
  for (let z = 0; z < resolution; z++) {
    const worldZ = -HALF_WORLD_METRES + z * spacingMetres;
    for (let x = 0; x < resolution; x++) {
      const worldX = -HALF_WORLD_METRES + x * spacingMetres;
      const index = z * resolution + x;
      const sample = sampleSeedWorldGeologyHeight(layout, worldX, worldZ, fbmParameters);
      heights[index] = sample.heightMetres;
      foundationHeights[index] = sample.foundationMetres;
      beltUpliftHeights[index] = sample.beltUpliftMetres;
      hillPedestalHeights[index] = sample.hillPedestalMetres;
      reliefHeights[index] = sample.reliefMetres;
      canyonCutHeights[index] = sample.canyonCutMetres;
      canyonLowlandOpeningHeights[index] = sample.canyonLowlandOpeningMetres;
      dominantHillSlopeLengthsMetres[index] = sample.dominantHillSlopeLengthMetres;
      minimumHeightMetres = Math.min(minimumHeightMetres, sample.heightMetres);
      maximumHeightMetres = Math.max(maximumHeightMetres, sample.heightMetres);
    }
  }
  const derivatives = deriveHeightfieldMeasurements(heights, resolution, spacingMetres);
  const field = Object.freeze({
    resolution,
    spacingMetres,
    heights,
    foundationHeights,
    beltUpliftHeights,
    hillPedestalHeights,
    reliefHeights,
    canyonCutHeights,
    canyonLowlandOpeningHeights,
    slopesDegrees: derivatives.slopesDegrees,
    curvaturePerMetre: derivatives.curvaturePerMetre,
    normals: derivatives.normals,
    dominantHillSlopeLengthsMetres,
    minimumHeightMetres,
    maximumHeightMetres,
    maximumSlopeDegrees: derivatives.maximumSlopeDegrees
  });
  let cache = heightfieldCache.get(layout);
  if (!cache) {
    cache = new Map();
    heightfieldCache.set(layout, cache);
  }
  cache.set(cacheKey, field);
  return field;
}

function makeUpliftBelts(
  geologySeed: number,
  parameters: SeedWorldGeologyParameters
): readonly SeedWorldGeologyUpliftBelt[] {
  const belts: SeedWorldGeologyUpliftBelt[] = [];
  const baseAngle = degreesToRadians(parameters.beltAzimuth);
  const spread = degreesToRadians(parameters.beltCount === 1 ? 0 : 55);
  const edgeReach = parameters.edgeOccupancy / 100;
  const expandedHeightSupport = Math.max(1, parameters.heightScale / 150);
  for (let index = 0; index < parameters.beltCount; index++) {
    const normalizedIndex = parameters.beltCount === 1 ? 0 : index / (parameters.beltCount - 1) - 0.5;
    const directionRadians =
      baseAngle + normalizedIndex * spread + signedHash(geologySeed, `belt-${index}-angle`) * 0.1;
    const direction = { x: Math.cos(directionRadians), z: Math.sin(directionRadians) };
    const normal = { x: -direction.z, z: direction.x };
    const offset = signedHash(geologySeed, `belt-${index}-offset`) * mix(220, 430, edgeReach);
    const liftMetres =
      parameters.beltLift *
      (parameters.heightScale / 100) *
      (0.88 + unitHash(geologySeed, `belt-${index}-lift`) * 0.24);
    const baseWidthMetres = 640 * (0.9 + unitHash(geologySeed, `belt-${index}-width`) * 0.2);
    const widthMetres = Math.max(
      baseWidthMetres,
      compactCosineRadiusForSlope(liftMetres, UPLIFT_BELT_SLOPE_DEGREES / expandedHeightSupport)
    );
    const safeInset = parameters.coastTransition + baseWidthMetres;
    const limit = HALF_WORLD_METRES - safeInset;
    const center = { x: clamp(normal.x * offset, -limit, limit), z: clamp(normal.z * offset, -limit, limit) };
    const requestedLength = mix(1_120, 1_960, edgeReach) + unitHash(geologySeed, `belt-${index}-length`) * 180;
    const length = Math.max(
      180,
      Math.min(requestedLength, axisLimit(center.x, direction.x, limit), axisLimit(center.z, direction.z, limit))
    );
    const bend = signedHash(geologySeed, `belt-${index}-bend`) * 0.55 * 720;
    belts.push(
      Object.freeze({
        id: `uplift-${String(index + 1).padStart(2, "0")}`,
        directionRadians,
        widthMetres,
        liftMetres,
        points: Object.freeze([
          freezePoint(center.x - direction.x * length, center.z - direction.z * length),
          freezePoint(
            clamp(center.x + normal.x * bend, -limit, limit),
            clamp(center.z + normal.z * bend, -limit, limit)
          ),
          freezePoint(center.x + direction.x * length, center.z + direction.z * length)
        ])
      })
    );
  }
  return Object.freeze(belts);
}

function makeCanyonTrunks(geologySeed: number, parameters: SeedWorldGeologyParameters): readonly MutableCanyon[] {
  const canyons: MutableCanyon[] = [];
  const systemAngle = degreesToRadians(parameters.canyonAzimuth);
  const coherence = 0.72;
  const spacing = Math.min(560, 1_560 / parameters.canyonCount);
  for (let index = 0; index < parameters.canyonCount; index++) {
    const relatedAngle = systemAngle + (index - (parameters.canyonCount - 1) / 2) * mix(0.5, 0.16, coherence);
    const randomAngle = unitHash(geologySeed, `canyon-${index}-independent-angle`) * Math.PI;
    const directionRadians =
      relatedAngle +
      angleDelta(randomAngle, relatedAngle) * (1 - coherence) +
      signedHash(geologySeed, `canyon-${index}-angle`) * 0.12;
    const direction = { x: Math.cos(directionRadians), z: Math.sin(directionRadians) };
    const normal = { x: -direction.z, z: direction.x };
    const offset = (index - (parameters.canyonCount - 1) / 2) * spacing;
    const center = { x: normal.x * offset, z: normal.z * offset };
    const meander = parameters.canyonMeander / 100;
    const phase = unitHash(geologySeed, `canyon-${index}-meander-phase`) * Math.PI * 2;
    const points = Array.from({ length: 7 }, (_, anchorIndex) => {
      const progress = anchorIndex / 6;
      const along = mix(-2_050, 2_050, progress);
      const envelope = Math.sin(Math.PI * progress);
      const broadTurn = Math.sin(phase + progress * Math.PI * 2.15) * 390 * meander;
      const localTurn = signedHash(geologySeed, `canyon-${index}-anchor-${anchorIndex}`) * 125 * meander * envelope;
      const lateral = (broadTurn + localTurn) * envelope;
      return freezePoint(
        center.x + direction.x * along + normal.x * lateral,
        center.z + direction.z * along + normal.z * lateral
      );
    });
    const id = `canyon-${String(index + 1).padStart(2, "0")}`;
    canyons.push(
      Object.freeze({
        id,
        kind: "trunk",
        trunkId: id,
        points: Object.freeze(points),
        widthMetres: parameters.canyonWidth,
        depthMetres: Math.min(
          clamp(parameters.canyonWidth * 0.23, 36, 120),
          compactCosineAmplitudeForSlope(parameters.canyonWidth * 0.92, CANYON_CUT_SLOPE_DEGREES)
        )
      })
    );
  }
  return Object.freeze(canyons);
}

function makeHillShape(geologySeed: number, parameters: SeedWorldGeologyParameters, ordinal: number): HillShape {
  const contrast = parameters.scaleContrast / 100;
  const heightContrast = parameters.heightContrast / 100;
  const heightScale = parameters.heightScale / 100;
  const expandedHeightSupport = Math.max(1, parameters.heightScale / 150);
  const opennessScale = mix(1.25, 0.76, (0.55 - 0.35) / 0.4);
  const rank = ordinal % 9;
  const tier = rank === 0 ? 1 + 1.55 * contrast : rank <= 3 ? 1 + 0.34 * contrast : 1 - 0.42 * contrast;
  const jitter = 0.86 + unitHash(geologySeed, `hill-${ordinal}-scale`) * 0.28;
  const baseMajor = clamp(290 * opennessScale * tier * jitter, 170, 620);
  const baseMinor = Math.max(95, baseMajor * (0.43 + unitHash(geologySeed, `hill-${ordinal}-axis`) * 0.23));
  const heightTier =
    rank === 0
      ? 1 + 1.15 * heightContrast
      : rank <= 2
        ? 1 + 0.28 * heightContrast
        : rank <= 5
          ? 1 - 0.15 * heightContrast
          : 1 - 0.58 * heightContrast;
  const heightJitter = 0.84 + unitHash(geologySeed, `hill-${ordinal}-height`) * 0.32;
  const desiredPeak = clamp((28 + baseMajor * 0.16) * heightTier * heightJitter * heightScale, 24, 300);
  const maximumHeightTier = rank === 0 ? 2.15 : rank <= 2 ? 1.28 : 1;
  const maximumPeakEnvelope = clamp((28 + baseMajor * 0.16) * maximumHeightTier * heightJitter * heightScale, 24, 300);
  const bodyMinor = clamp(
    Math.max(
      baseMinor,
      compactCosineRadiusForSlope(maximumPeakEnvelope, HILL_RELIEF_SLOPE_DEGREES / expandedHeightSupport)
    ),
    95,
    700
  );
  const bodyMajor = clamp(Math.max(baseMajor, bodyMinor * 1.22), 170, 900);
  const peakRelief = Math.min(desiredPeak, compactCosineAmplitudeForSlope(bodyMinor, HILL_RELIEF_SLOPE_DEGREES));
  const baseLiftTier = rank === 0 ? 1 + heightContrast * 0.26 : rank >= 6 ? 1 - heightContrast * 0.18 : 1;
  const desiredBaseLift = clamp(
    (14 + bodyMajor * 0.085) * mix(0.72, 1.28, heightJitter) * baseLiftTier * heightScale,
    8,
    220
  );
  const influenceScale = 1.75 + unitHash(geologySeed, `hill-${ordinal}-influence`) * 1.05;
  const influenceMinor = clamp(
    Math.max(
      bodyMinor * influenceScale,
      compactCosineRadiusForSlope(desiredBaseLift, HILL_PEDESTAL_SLOPE_DEGREES / expandedHeightSupport)
    ),
    bodyMinor,
    1_200
  );
  const influenceMajor = clamp(
    Math.max(bodyMajor * influenceScale, (influenceMinor * bodyMajor) / bodyMinor),
    bodyMajor,
    1_200
  );
  return resolvePlannerHillAtom({
    bodyMajor,
    bodyMinor,
    influenceMajor,
    influenceMinor,
    pedestalLift: Math.round(
      Math.min(desiredBaseLift, compactCosineAmplitudeForSlope(influenceMinor, HILL_PEDESTAL_SLOPE_DEGREES))
    ),
    peakRelief: Math.round(peakRelief)
  });
}

function makeHills(
  geologySeed: number,
  parameters: SeedWorldGeologyParameters,
  belts: readonly SeedWorldGeologyUpliftBelt[],
  canyonTrunks: readonly MutableCanyon[],
  edits: readonly SeedWorldGeologyHillEdit[]
): readonly MutableHill[] {
  const hills: MutableHill[] = [];
  const editsByOrdinal = new Map(edits.map((edit) => [edit.hillId, edit] as const));
  const bankCount = Math.min(parameters.hillCount, Math.max(parameters.canyonCount * 4, 16));
  for (let ordinal = 0; ordinal < parameters.hillCount; ordinal++) {
    let shape = makeHillShape(geologySeed, parameters, ordinal);
    let center: { x: number; z: number };
    let desiredRotationRadians: number;
    let provisionalCanyonIndex = -1;
    if (ordinal < bankCount) {
      const canyonIndex = ordinal % parameters.canyonCount;
      const side = Math.floor(ordinal / parameters.canyonCount) % 2 === 0 ? -1 : 1;
      const layer = Math.floor(ordinal / (parameters.canyonCount * 2));
      const layers = Math.ceil(bankCount / (parameters.canyonCount * 2));
      const parameter = clamp(
        (layer + 1) / (layers + 1) + signedHash(geologySeed, `bank-${ordinal}-t`) * 0.035,
        0.12,
        0.88
      );
      const canyon = canyonTrunks[canyonIndex]!;
      const anchor = curvePoint(canyon.points, parameter);
      const tangent = curveTangent(canyon.points, parameter);
      const length = Math.hypot(tangent.x, tangent.z) || 1;
      const normal = { x: -tangent.z / length, z: tangent.x / length };
      const offset = canyon.widthMetres * 0.5 + shape.bodyMinor * mix(0.88, 0.65, 16 / 36);
      center = { x: anchor.x + normal.x * offset * side, z: anchor.z + normal.z * offset * side };
      desiredRotationRadians = Math.atan2(tangent.z, tangent.x);
      provisionalCanyonIndex = canyonIndex;
    } else {
      const placed = placeBeltHill(geologySeed, parameters, ordinal, shape, belts, canyonTrunks);
      center = placed.center;
      desiredRotationRadians = placed.rotationRadians;
    }
    const randomAngle = unitHash(geologySeed, `hill-${ordinal}-angle`) * Math.PI;
    let rotationRadians =
      desiredRotationRadians +
      angleDelta(randomAngle, desiredRotationRadians) * (1 - parameters.orientationCoherence / 100);
    const edit = editsByOrdinal.get(ordinal);
    if (edit?.baseLift !== undefined) shape.pedestalLift = edit.baseLift;
    if (edit?.influenceMajor !== undefined) shape.influenceMajor = edit.influenceMajor;
    if (edit?.peakRelief !== undefined) shape.peakRelief = edit.peakRelief;
    if (edit?.bodyMajor !== undefined) shape.bodyMajor = edit.bodyMajor;
    if (edit?.angleDegrees !== undefined) rotationRadians = degreesToRadians(edit.angleDegrees);
    shape = resolvePlannerHillAtom(shape);
    const bodyExtentX = Math.hypot(
      shape.bodyMajor * Math.cos(rotationRadians),
      shape.bodyMinor * Math.sin(rotationRadians)
    );
    const bodyExtentZ = Math.hypot(
      shape.bodyMajor * Math.sin(rotationRadians),
      shape.bodyMinor * Math.cos(rotationRadians)
    );
    const coastGuard = parameters.coastTransition * 0.35;
    const marginX = Math.min(HALF_WORLD_METRES - 1, coastGuard + bodyExtentX + 24);
    const marginZ = Math.min(HALF_WORLD_METRES - 1, coastGuard + bodyExtentZ + 24);
    const margin = Math.max(marginX, marginZ);
    center.x = clamp(center.x, -HALF_WORLD_METRES + margin, HALF_WORLD_METRES - margin);
    center.z = clamp(center.z, -HALF_WORLD_METRES + margin, HALF_WORLD_METRES - margin);
    if (provisionalCanyonIndex < 0) {
      for (let repair = 0; repair < 12; repair++) {
        const closest = canyonTrunks
          .map((canyon) => ({ canyon, nearest: curveNearest(center, canyon.points) }))
          .sort((left, right) => left.nearest.distanceMetres - right.nearest.distanceMetres)[0]!;
        const requiredDistance = closest.canyon.widthMetres * 0.5 + shape.bodyMinor * 0.62;
        if (closest.nearest.distanceMetres >= requiredDistance) break;
        const tangent = curveTangent(closest.canyon.points, closest.nearest.parameter);
        const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
        const normal = { x: -tangent.z / tangentLength, z: tangent.x / tangentLength };
        const alternatives = [-1, 1]
          .map((side) => ({
            x: clamp(
              closest.nearest.position.x + normal.x * side * (requiredDistance + 34),
              -HALF_WORLD_METRES + margin,
              HALF_WORLD_METRES - margin
            ),
            z: clamp(
              closest.nearest.position.z + normal.z * side * (requiredDistance + 34),
              -HALF_WORLD_METRES + margin,
              HALF_WORLD_METRES - margin
            )
          }))
          .sort((left, right) => {
            const leftClearance = Math.min(
              ...canyonTrunks.map(
                (canyon) => curveDistance(left, canyon.points) - (canyon.widthMetres * 0.5 + shape.bodyMinor * 0.62)
              )
            );
            const rightClearance = Math.min(
              ...canyonTrunks.map(
                (canyon) => curveDistance(right, canyon.points) - (canyon.widthMetres * 0.5 + shape.bodyMinor * 0.62)
              )
            );
            return rightClearance - leftClearance;
          });
        center.x = alternatives[0]!.x;
        center.z = alternatives[0]!.z;
      }
      const closest = canyonTrunks
        .map((canyon) => ({ canyon, nearest: curveNearest(center, canyon.points) }))
        .sort((left, right) => left.nearest.distanceMetres - right.nearest.distanceMetres)[0]!;
      const maximumClearMinor = Math.max(
        80,
        (closest.nearest.distanceMetres - closest.canyon.widthMetres * 0.5 - 8) / 0.35
      );
      if (shape.bodyMinor > maximumClearMinor) {
        const clearanceScale = maximumClearMinor / shape.bodyMinor;
        shape.bodyMajor *= clearanceScale;
        shape.bodyMinor *= clearanceScale;
        shape.peakRelief = Math.min(
          shape.peakRelief,
          compactCosineAmplitudeForSlope(shape.bodyMinor, HILL_RELIEF_SLOPE_DEGREES)
        );
        shape = resolvePlannerHillAtom(shape);
      }
    }
    const availableSupport = Math.max(
      shape.bodyMajor,
      HALF_WORLD_METRES - Math.max(Math.abs(center.x), Math.abs(center.z)) - coastGuard - 24
    );
    const influenceScaleLimit = Math.min(1, availableSupport / Math.max(shape.influenceMajor, shape.influenceMinor));
    shape.influenceMajor = Math.max(shape.bodyMajor, shape.influenceMajor * influenceScaleLimit);
    shape.influenceMinor = Math.max(shape.bodyMinor, shape.influenceMinor * influenceScaleLimit);
    shape = resolvePlannerHillAtom(shape);
    hills.push(
      Object.freeze({
        id: `hill-${String(ordinal + 1).padStart(2, "0")}`,
        ordinal,
        center: freezePoint(center.x, center.z),
        rotationRadians,
        desiredRotationRadians,
        bodyRadiusMetres: Object.freeze({ major: shape.bodyMajor, minor: shape.bodyMinor }),
        influenceRadiusMetres: Object.freeze({ major: shape.influenceMajor, minor: shape.influenceMinor }),
        pedestalLiftMetres: shape.pedestalLift,
        peakReliefMetres: shape.peakRelief,
        usableShoulder: Object.freeze({
          preferredExteriorBearingRadians: counterClockwiseXToClockwiseNorth(rotationRadians - Math.PI * 0.5),
          minimumBodyMinorRatio: 0.58,
          maximumBodyMinorRatio: 1.08,
          source: "nearest-lowland"
        }),
        provisionalCanyonIndex
      })
    );
  }
  return Object.freeze(hills);
}

function placeBeltHill(
  geologySeed: number,
  parameters: SeedWorldGeologyParameters,
  ordinal: number,
  shape: HillShape,
  belts: readonly SeedWorldGeologyUpliftBelt[],
  canyonTrunks: readonly MutableCanyon[]
): Readonly<{ center: { x: number; z: number }; rotationRadians: number }> {
  let accepted: Readonly<{ center: { x: number; z: number }; rotationRadians: number }> | undefined;
  let bestFallback:
    | Readonly<{
        center: { x: number; z: number };
        rotationRadians: number;
        clearanceMetres: number;
      }>
    | undefined;
  for (let attempt = 0; attempt < 16; attempt++) {
    const belt = belts[(ordinal + attempt) % belts.length]!;
    const cluster = parameters.clusterStrength / 100;
    const rawParameter = unitHash(geologySeed, `hill-${ordinal}-attempt-${attempt}-t`);
    const clusterCenter = (Math.floor(rawParameter * 3) + 0.5) / 3;
    const parameter = clamp(
      mix(
        rawParameter,
        clusterCenter + signedHash(geologySeed, `hill-${ordinal}-attempt-${attempt}-local`) * 0.09,
        cluster
      ),
      0.06,
      0.94
    );
    const anchor = curvePoint(belt.points, parameter);
    const tangent = curveTangent(belt.points, parameter);
    const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
    const normal = { x: -tangent.z / tangentLength, z: tangent.x / tangentLength };
    const spread = mix(560, 260, cluster);
    const offset = signedHash(geologySeed, `hill-${ordinal}-attempt-${attempt}-offset`) * spread;
    const candidate = freezePoint(anchor.x + normal.x * offset, anchor.z + normal.z * offset);
    const clearanceMetres = Math.min(
      ...canyonTrunks.map(
        (canyon) => curveDistance(candidate, canyon.points) - (canyon.widthMetres * 0.5 + shape.bodyMinor * 0.62)
      )
    );
    const placement = Object.freeze({
      center: { x: candidate.x, z: candidate.z },
      rotationRadians: Math.atan2(tangent.z, tangent.x),
      clearanceMetres
    });
    if (!bestFallback || placement.clearanceMetres > bestFallback.clearanceMetres) bestFallback = placement;
    if (clearanceMetres >= 0) {
      accepted = placement;
      break;
    }
  }
  const result = accepted ?? bestFallback;
  if (!result) throw new Error("Seed World geology requires at least one uplift belt");
  const center = { ...result.center };
  for (let repair = 0; repair < 5; repair++) {
    const closest = canyonTrunks
      .map((canyon) => ({ canyon, nearest: curveNearest(center, canyon.points) }))
      .sort((left, right) => left.nearest.distanceMetres - right.nearest.distanceMetres)[0]!;
    const requiredDistance = closest.canyon.widthMetres * 0.5 + shape.bodyMinor * 0.62;
    if (closest.nearest.distanceMetres >= requiredDistance) break;
    const tangent = curveTangent(closest.canyon.points, closest.nearest.parameter);
    const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
    let awayX = center.x - closest.nearest.position.x;
    let awayZ = center.z - closest.nearest.position.z;
    const awayLength = Math.hypot(awayX, awayZ);
    if (awayLength < 1) {
      awayX = -tangent.z / tangentLength;
      awayZ = tangent.x / tangentLength;
    } else {
      awayX /= awayLength;
      awayZ /= awayLength;
    }
    const shift = requiredDistance - closest.nearest.distanceMetres + 30;
    center.x += awayX * shift;
    center.z += awayZ * shift;
  }
  return Object.freeze({ center, rotationRadians: result.rotationRadians });
}

function makeTributaries(
  geologySeed: number,
  parameters: SeedWorldGeologyParameters,
  trunks: readonly MutableCanyon[],
  hills: readonly MutableHill[]
): readonly MutableCanyon[] {
  const tributaries: MutableCanyon[] = [];
  const density = parameters.tributaryDensity / 100;
  for (const [trunkIndex, trunk] of trunks.entries()) {
    const expected = density * 3;
    const count = clamp(
      Math.floor(expected) + (unitHash(geologySeed, `canyon-${trunkIndex}-branch-round`) < expected % 1 ? 1 : 0),
      0,
      3
    );
    for (let branchIndex = 0; branchIndex < count; branchIndex++) {
      const joinParameter = clamp(
        0.34 +
          ((branchIndex + 1) / (count + 1)) * 0.36 +
          signedHash(geologySeed, `branch-${trunkIndex}-${branchIndex}-join`) * 0.05,
        0.28,
        0.78
      );
      const join = curvePoint(trunk.points, joinParameter);
      const tangent = curveTangent(trunk.points, joinParameter);
      const tangentLength = Math.hypot(tangent.x, tangent.z) || 1;
      const tangentUnit = { x: tangent.x / tangentLength, z: tangent.z / tangentLength };
      const normal = { x: -tangentUnit.z, z: tangentUnit.x };
      const side = unitHash(geologySeed, `branch-${trunkIndex}-${branchIndex}-side`) < 0.5 ? -1 : 1;
      const sourceHill = hills
        .map((hill) => {
          const deltaX = hill.center.x - join.x;
          const deltaZ = hill.center.z - join.z;
          const lateral = deltaX * normal.x + deltaZ * normal.z;
          const distanceMetres = Math.hypot(deltaX, deltaZ);
          const sideMatches = Math.sign(lateral || side) === side;
          return {
            hill,
            distanceMetres,
            score:
              hill.bodyRadiusMetres.major * 0.55 - Math.abs(distanceMetres - 820) * 0.35 + (sideMatches ? 180 : -260)
          };
        })
        .filter((candidate) => candidate.distanceMetres > 360 && candidate.distanceMetres < 1_320)
        .sort((left, right) => right.score - left.score)[0]?.hill;
      const approachAngle = degreesToRadians(
        45 + signedHash(geologySeed, `branch-${trunkIndex}-${branchIndex}-angle`) * 10
      );
      const approach = {
        x: tangentUnit.x * Math.cos(approachAngle) - normal.x * side * Math.sin(approachAngle),
        z: tangentUnit.z * Math.cos(approachAngle) - normal.z * side * Math.sin(approachAngle)
      };
      const fallbackLength = 620 + unitHash(geologySeed, `branch-${trunkIndex}-${branchIndex}-length`) * 420;
      const start = sourceHill
        ? {
            x: mix(sourceHill.center.x, join.x, 0.18),
            z: mix(sourceHill.center.z, join.z, 0.18)
          }
        : {
            x: join.x - approach.x * fallbackLength,
            z: join.z - approach.z * fallbackLength
          };
      start.x = clamp(start.x, -HALF_WORLD_METRES + 70, HALF_WORLD_METRES - 70);
      start.z = clamp(start.z, -HALF_WORLD_METRES + 70, HALF_WORLD_METRES - 70);
      const midpoint = { x: mix(start.x, join.x, 0.55), z: mix(start.z, join.z, 0.55) };
      const bend = signedHash(geologySeed, `branch-${trunkIndex}-${branchIndex}-bend`) * 150;
      const points = Object.freeze([
        freezePoint(start.x, start.z),
        freezePoint(
          mix(start.x, midpoint.x, 0.62) + normal.x * bend * 0.48,
          mix(start.z, midpoint.z, 0.62) + normal.z * bend * 0.48
        ),
        freezePoint(midpoint.x + normal.x * bend, midpoint.z + normal.z * bend),
        freezePoint(
          mix(midpoint.x, join.x, 0.58) + normal.x * bend * 0.34,
          mix(midpoint.z, join.z, 0.58) + normal.z * bend * 0.34
        ),
        join
      ]);
      const widthFactor = 0.48 + unitHash(geologySeed, `branch-${trunkIndex}-${branchIndex}-width`) * 0.16;
      const widthMetres = trunk.widthMetres * widthFactor;
      tributaries.push(
        Object.freeze({
          id: `${trunk.id}-tributary-${String(branchIndex + 1).padStart(2, "0")}`,
          kind: "tributary",
          trunkId: trunk.id,
          points,
          widthMetres,
          depthMetres: Math.min(
            clamp(trunk.widthMetres * 0.19, 18, 75),
            compactCosineAmplitudeForSlope(widthMetres * 0.78, CANYON_CUT_SLOPE_DEGREES)
          )
        })
      );
    }
  }
  return Object.freeze(tributaries);
}

function finalizeHillTerrainRelations(
  hills: readonly MutableHill[],
  canyons: readonly MutableCanyon[]
): readonly SeedWorldGeologyHill[] {
  return Object.freeze(
    hills.map((hill) => {
      const closest =
        hill.provisionalCanyonIndex >= 0
          ? Object.freeze({
              canyon: canyons[hill.provisionalCanyonIndex]!,
              nearest: curveNearest(hill.center, canyons[hill.provisionalCanyonIndex]!.points)
            })
          : canyons
              .map((canyon) => ({ canyon, nearest: curveNearest(hill.center, canyon.points) }))
              .sort((left, right) => left.nearest.distanceMetres - right.nearest.distanceMetres)[0]!;
      const tangent = curveTangent(closest.canyon.points, closest.nearest.parameter);
      const cross =
        tangent.x * (hill.center.z - closest.nearest.position.z) -
        tangent.z * (hill.center.x - closest.nearest.position.x);
      const relation: SeedWorldGeologyCanyonBankRelation | undefined =
        hill.provisionalCanyonIndex >= 0
          ? Object.freeze({
              canyonId: canyons[hill.provisionalCanyonIndex]!.id,
              side: cross >= 0 ? "left" : "right",
              guideParameter: closest.nearest.parameter,
              bankAnchor: closest.nearest.position,
              canyonFacingBearingRadians: vectorToClockwiseNorthBearing(
                closest.nearest.position.x - hill.center.x,
                closest.nearest.position.z - hill.center.z
              )
            })
          : undefined;
      const lowlandBearingRadians =
        relation?.canyonFacingBearingRadians ??
        vectorToClockwiseNorthBearing(
          closest.nearest.position.x - hill.center.x,
          closest.nearest.position.z - hill.center.z
        );
      const { provisionalCanyonIndex: _provisionalCanyonIndex, ...formalHill } = hill;
      return Object.freeze({
        ...formalHill,
        ...(relation ? { canyonBank: relation } : {}),
        usableShoulder: Object.freeze({
          preferredExteriorBearingRadians: wrapRadians(lowlandBearingRadians + Math.PI),
          minimumBodyMinorRatio: 0.58,
          maximumBodyMinorRatio: 1.08,
          source: relation ? "canyon-bank" : "nearest-lowland"
        })
      });
    })
  );
}

function finalizeCanyonBanks(
  canyons: readonly MutableCanyon[],
  hills: readonly SeedWorldGeologyHill[]
): readonly SeedWorldGeologyCanyon[] {
  return Object.freeze(
    canyons.map((canyon) =>
      Object.freeze({
        ...canyon,
        leftBankHillIds: Object.freeze(
          hills
            .filter((hill) => hill.canyonBank?.canyonId === canyon.id && hill.canyonBank.side === "left")
            .map((hill) => hill.id)
        ),
        rightBankHillIds: Object.freeze(
          hills
            .filter((hill) => hill.canyonBank?.canyonId === canyon.id && hill.canyonBank.side === "right")
            .map((hill) => hill.id)
        )
      })
    )
  );
}

function makeCanyonBankPairs(
  canyons: readonly SeedWorldGeologyCanyon[],
  hills: readonly SeedWorldGeologyHill[]
): readonly SeedWorldGeologyCanyonBankPair[] {
  const maximumGuideDelta = SEED_WORLD_CANYON_BANK_PAIR_MAXIMUM_GUIDE_DELTA;
  const hillById = new Map(hills.map((hill) => [hill.id, hill] as const));
  const pairs: SeedWorldGeologyCanyonBankPair[] = [];
  for (const canyon of canyons) {
    const left = canyon.leftBankHillIds.map((hillId) => hillById.get(hillId)!).sort(compareCanyonBankHills);
    const right = canyon.rightBankHillIds.map((hillId) => hillById.get(hillId)!).sort(compareCanyonBankHills);
    if (left.length === 0 || right.length === 0) continue;
    const matched = new Map<string, readonly [SeedWorldGeologyHill, SeedWorldGeologyHill]>();
    for (const leftHill of left) {
      for (const rightHill of right) {
        if (Math.abs(leftHill.canyonBank!.guideParameter - rightHill.canyonBank!.guideParameter) > maximumGuideDelta)
          continue;
        matched.set(`${leftHill.id}:${rightHill.id}`, Object.freeze([leftHill, rightHill] as const));
      }
    }
    const orderedMatches = [...matched.values()].sort(
      (first, second) =>
        (first[0].canyonBank!.guideParameter + first[1].canyonBank!.guideParameter) * 0.5 -
          (second[0].canyonBank!.guideParameter + second[1].canyonBank!.guideParameter) * 0.5 ||
        first[0].id.localeCompare(second[0].id) ||
        first[1].id.localeCompare(second[1].id)
    );
    for (let ordinal = 0; ordinal < orderedMatches.length; ordinal++) {
      const [leftHill, rightHill] = orderedMatches[ordinal]!;
      const guideParameter = (leftHill.canyonBank!.guideParameter + rightHill.canyonBank!.guideParameter) * 0.5;
      const tangent = curveTangent(canyon.points, guideParameter);
      pairs.push(
        Object.freeze({
          id: `${canyon.id}:bank-pair-${String(ordinal + 1).padStart(2, "0")}`,
          canyonId: canyon.id,
          guideParameter,
          leftGuideParameter: leftHill.canyonBank!.guideParameter,
          rightGuideParameter: rightHill.canyonBank!.guideParameter,
          leftHillId: leftHill.id,
          rightHillId: rightHill.id,
          leftUphillBearingRadians: vectorToClockwiseNorthBearing(tangent.z, -tangent.x),
          rightUphillBearingRadians: vectorToClockwiseNorthBearing(-tangent.z, tangent.x)
        })
      );
    }
  }
  return Object.freeze(pairs);
}

function compareCanyonBankHills(left: SeedWorldGeologyHill, right: SeedWorldGeologyHill): number {
  return left.canyonBank!.guideParameter - right.canyonBank!.guideParameter || left.id.localeCompare(right.id);
}

function makeAdjacency(hills: readonly SeedWorldGeologyHill[]): readonly SeedWorldGeologyAdjacency[] {
  if (hills.length < 2) return Object.freeze([]);
  const edges: Array<Readonly<{ a: number; b: number; distanceMetres: number }>> = [];
  const connected = new Set([0]);
  while (connected.size < hills.length) {
    let best: Readonly<{ a: number; b: number; distanceMetres: number }> | undefined;
    for (const a of connected) {
      for (let b = 0; b < hills.length; b++) {
        if (connected.has(b)) continue;
        const distanceMetres = pointDistance(hills[a]!.center, hills[b]!.center);
        if (!best || distanceMetres < best.distanceMetres) best = { a, b, distanceMetres };
      }
    }
    if (!best) break;
    edges.push(best);
    connected.add(best.b);
  }
  for (let a = 0; a < hills.length; a++) {
    const candidates = hills
      .map((hill, b) => ({ b, distanceMetres: pointDistance(hills[a]!.center, hill.center) }))
      .filter(({ b, distanceMetres }) => b !== a && distanceMetres < 760)
      .sort((left, right) => left.distanceMetres - right.distanceMetres)
      .slice(0, 2);
    for (const candidate of candidates) edges.push({ a, b: candidate.b, distanceMetres: candidate.distanceMetres });
  }
  const unique = new Map<string, SeedWorldGeologyAdjacency>();
  for (const edge of edges) {
    const a = Math.min(edge.a, edge.b);
    const b = Math.max(edge.a, edge.b);
    const hillA = hills[a]!;
    const hillB = hills[b]!;
    const deltaX = hillB.center.x - hillA.center.x;
    const deltaZ = hillB.center.z - hillA.center.z;
    const distanceMetres = Math.hypot(deltaX, deltaZ) || 1;
    const directionX = deltaX / distanceMetres;
    const directionZ = deltaZ / distanceMetres;
    const combinedRadius =
      ellipseRadius(hillA, directionX, directionZ) + ellipseRadius(hillB, -directionX, -directionZ);
    unique.set(
      `${a}-${b}`,
      Object.freeze({
        hillAId: hillA.id,
        hillBId: hillB.id,
        distanceMetres,
        overlapRatio: clamp((combinedRadius - distanceMetres) / combinedRadius, -1, 1)
      })
    );
  }
  return Object.freeze([...unique.values()]);
}

function makeSuitableRegions(
  layout: SeedWorldGeologyLayout,
  field: SeedWorldGeologyHeightfield
): readonly SeedWorldGeologySuitableRegion[] {
  const candidates: SeedWorldGeologySuitableRegion[] = [];
  const stride = 3;
  for (let gridZ = 2; gridZ < field.resolution - 2; gridZ += stride) {
    for (let gridX = 2; gridX < field.resolution - 2; gridX += stride) {
      const index = gridZ * field.resolution + gridX;
      const heightMetres = field.heights[index]!;
      const slopeDegrees = field.slopesDegrees[index]!;
      const curvaturePerMetre = field.curvaturePerMetre[index]!;
      if (heightMetres <= 3 || slopeDegrees > 11 || Math.abs(curvaturePerMetre) > 0.055) continue;
      let neighbourhoodMaximumSlope = 0;
      let neighbourhoodMinimumHeight = Number.POSITIVE_INFINITY;
      for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
          const neighbour = (gridZ + offsetZ) * field.resolution + gridX + offsetX;
          neighbourhoodMaximumSlope = Math.max(neighbourhoodMaximumSlope, field.slopesDegrees[neighbour]!);
          neighbourhoodMinimumHeight = Math.min(neighbourhoodMinimumHeight, field.heights[neighbour]!);
        }
      }
      if (neighbourhoodMaximumSlope > 16 || neighbourhoodMinimumHeight <= 1) continue;
      const center = freezePoint(
        -HALF_WORLD_METRES + gridX * field.spacingMetres,
        -HALF_WORLD_METRES + gridZ * field.spacingMetres
      );
      const summitOwned = layout.hills.some((hill) => {
        const local = rotateIntoHill(hill, center.x, center.z);
        return Math.hypot(local.x / hill.bodyRadiusMetres.major, local.z / hill.bodyRadiusMetres.minor) < 0.38;
      });
      if (summitOwned) continue;
      const nearestCanyonDistanceMetres = Math.min(
        ...layout.canyons.map((canyon) => curveDistance(center, canyon.points))
      );
      const nearestHillClearanceMetres = Math.min(
        ...layout.hills.map(
          (hill) =>
            pointDistance(center, hill.center) - Math.sqrt(hill.bodyRadiusMetres.major * hill.bodyRadiusMetres.minor)
        )
      );
      const lowSlopeScore = 1 - slopeDegrees / 11;
      const stableCurvatureScore = 1 - Math.min(1, Math.abs(curvaturePerMetre) / 0.055);
      const canyonLayerScore =
        1 - Math.min(1, Math.abs(nearestCanyonDistanceMetres - layout.parameters.canyonWidth * 0.95) / 760);
      const clearanceScore = clamp((nearestHillClearanceMetres + 120) / 620, 0, 1);
      const terrainScore =
        lowSlopeScore * 0.38 + stableCurvatureScore * 0.22 + canyonLayerScore * 0.24 + clearanceScore * 0.16;
      candidates.push(
        Object.freeze({
          id: `suitable-${String(gridX).padStart(2, "0")}-${String(gridZ).padStart(2, "0")}`,
          center,
          radiusMetres: clamp(
            field.spacingMetres * (1.65 + lowSlopeScore * 0.9),
            72,
            Math.max(72, Math.min(150, nearestHillClearanceMetres + 120))
          ),
          terrainScore,
          heightMetres,
          slopeDegrees,
          curvaturePerMetre,
          nearestCanyonDistanceMetres,
          nearestHillClearanceMetres
        })
      );
    }
  }
  candidates.sort((left, right) => right.terrainScore - left.terrainScore || left.id.localeCompare(right.id));
  const retained: SeedWorldGeologySuitableRegion[] = [];
  for (const candidate of candidates) {
    if (
      retained.every(
        (region) =>
          pointDistance(region.center, candidate.center) >= Math.min(region.radiusMetres, candidate.radiusMetres) * 1.35
      )
    ) {
      retained.push(candidate);
    }
  }
  retained.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(retained);
}

function makeRoadNetwork(
  layout: SeedWorldGeologyLayout,
  field: SeedWorldGeologyHeightfield,
  suitableRegions: readonly SeedWorldGeologySuitableRegion[]
): Readonly<{ roads: readonly SeedWorldGeologyRoad[]; nodes: readonly SeedWorldGeologyRoadNode[] }> {
  const resolution = field.resolution;
  const count = resolution ** 2;
  const penalties = new Float32Array(count);
  const maximumHeightRange = Math.max(1, field.maximumHeightMetres - Math.max(0, field.minimumHeightMetres));
  for (let index = 0; index < count; index++) {
    const point = cellPoint(index, field);
    const heightPenalty = clamp((field.heights[index]! - 8) / maximumHeightRange, 0, 1) * 2.4;
    const slopeRatio = field.slopesDegrees[index]! / ROAD_MAXIMUM_SLOPE_DEGREES;
    const slopePenalty = slopeRatio * slopeRatio * 8;
    const canyonDistance = Math.min(
      ...layout.canyons.map((canyon) => curveDistance(point, canyon.points) / canyon.widthMetres)
    );
    const canyonAffinity = clamp(1 - Math.abs(canyonDistance - 0.72), 0, 1) * -1.4;
    const edgeDistance = HALF_WORLD_METRES - Math.max(Math.abs(point.x), Math.abs(point.z));
    const outsideLandPenalty = field.heights[index]! <= 1 ? 48 : 0;
    const oceanEdgePenalty = edgeDistance < layout.parameters.coastTransition * 0.3 ? 8 : 0;
    penalties[index] = heightPenalty + slopePenalty + canyonAffinity + outsideLandPenalty + oceanEdgePenalty;
  }
  const portals = findRoadPortals(field, penalties, layout.parameters.coastTransition);
  const mainOptions: Array<Readonly<{ cells: readonly number[]; cost: number }>> = [];
  for (const [starts, goals] of [
    [portals.left, portals.right],
    [portals.top, portals.bottom]
  ] as const) {
    for (const [candidateIndex, start] of starts.entries()) {
      const goal = goals[candidateIndex] ?? goals[0];
      if (goal === undefined) continue;
      const cells = findTerrainPath(start, goal, field, penalties);
      if (!cells) continue;
      mainOptions.push(Object.freeze({ cells, cost: measureRoadCells(cells, field, penalties).difficulty }));
    }
  }
  mainOptions.sort((left, right) => left.cost - right.cost);
  const fallbackStart = portals.left[0] ?? portals.top[0];
  const fallbackGoal = portals.right[0] ?? portals.bottom[0];
  if (fallbackStart === undefined || fallbackGoal === undefined) return Object.freeze({ roads: [], nodes: [] });
  const mainCells = mainOptions[0]?.cells ?? [fallbackStart, fallbackGoal];
  const roads: SeedWorldGeologyRoad[] = [makeRoad("road-main", "main", mainCells, field, penalties, true)];
  const nodes: SeedWorldGeologyRoadNode[] = [
    Object.freeze({ id: "road-entry", kind: "entry", position: cellPoint(mainCells[0]!, field) }),
    Object.freeze({ id: "road-exit", kind: "exit", position: cellPoint(mainCells.at(-1)!, field) })
  ];
  const networkCells = new Set(mainCells);
  const usedBoundaryCells = new Set([mainCells[0]!, mainCells.at(-1)!]);
  const targetCells = collectRoadTargetCells(layout, field, suitableRegions);
  const boundaryCandidates = [...portals.left, ...portals.right, ...portals.top, ...portals.bottom];
  let branchOrdinal = 1;
  while (targetCells.length > 0 && branchOrdinal <= 5) {
    const networkDistance = distanceFromCellSet(networkCells, resolution);
    const options: Array<
      Readonly<{
        targetIndex: number;
        boundaryCell: number;
        connectionCell: number;
        cells: readonly number[];
        score: number;
      }>
    > = [];
    for (const [targetIndex, targetCell] of targetCells.entries()) {
      if (networkCells.has(targetCell)) continue;
      const connectionCell = nearestCellInSet(targetCell, networkCells, field);
      const connectionPath = findTerrainPath(targetCell, connectionCell, field, penalties);
      if (!connectionPath || connectionPath.length < 3) continue;
      for (const boundaryCell of boundaryCandidates) {
        if (usedBoundaryCells.has(boundaryCell)) continue;
        const boundaryPath = findTerrainPath(boundaryCell, targetCell, field, penalties, networkDistance);
        if (!boundaryPath || boundaryPath.length < 4) continue;
        const cells = [...boundaryPath, ...connectionPath.slice(1)];
        const measurement = measureRoadCells(cells, field, penalties);
        const boundarySpan = pointDistance(cellPoint(boundaryCell, field), cellPoint(connectionCell, field));
        if (boundarySpan / WORLD_SIZE_METRES < 0.31) continue;
        const parallelPenalty =
          cells.reduce((sum, cell) => sum + (networkDistance[cell]! <= 2 && cell !== connectionCell ? 1 : 0), 0) /
          cells.length;
        options.push(
          Object.freeze({
            targetIndex,
            boundaryCell,
            connectionCell,
            cells,
            score:
              measurement.difficulty +
              (measurement.lengthMetres / WORLD_SIZE_METRES) * 0.22 +
              parallelPenalty * 8 -
              boundarySpan / WORLD_SIZE_METRES
          })
        );
      }
    }
    options.sort((left, right) => left.score - right.score);
    const best = options[0];
    if (!best) break;
    const road = makeRoad(
      `road-branch-${String(branchOrdinal).padStart(2, "0")}`,
      "branch",
      best.cells,
      field,
      penalties,
      true
    );
    roads.push(road);
    nodes.push(
      Object.freeze({
        id: `road-branch-junction-${String(branchOrdinal).padStart(2, "0")}`,
        kind: "branch-junction",
        position: cellPoint(best.connectionCell, field)
      })
    );
    best.cells.forEach((cell) => networkCells.add(cell));
    usedBoundaryCells.add(best.boundaryCell);
    targetCells.splice(best.targetIndex, 1);
    branchOrdinal++;
  }
  return Object.freeze({ roads: Object.freeze(roads), nodes: Object.freeze(nodes) });
}

function findRoadPortals(
  field: SeedWorldGeologyHeightfield,
  penalties: Float32Array,
  coastTransitionMetres: number
): Readonly<Record<"left" | "right" | "top" | "bottom", readonly number[]>> {
  const inset = clamp(Math.round((coastTransitionMetres * 0.55) / field.spacingMetres) + 1, 2, 8);
  const portalCandidates = (side: "left" | "right" | "top" | "bottom"): readonly number[] => {
    const candidates: Array<Readonly<{ index: number; score: number }>> = [];
    for (let moving = inset + 2; moving < field.resolution - inset - 2; moving++) {
      const x = side === "left" ? inset : side === "right" ? field.resolution - 1 - inset : moving;
      const z = side === "top" ? inset : side === "bottom" ? field.resolution - 1 - inset : moving;
      const index = z * field.resolution + x;
      if (field.heights[index]! <= 1 || field.slopesDegrees[index]! > ROAD_MAXIMUM_SLOPE_DEGREES) continue;
      const axisOffset =
        side === "left" || side === "right"
          ? Math.abs(z - (field.resolution - 1) * 0.5)
          : Math.abs(x - (field.resolution - 1) * 0.5);
      candidates.push(Object.freeze({ index, score: penalties[index]! + axisOffset / field.resolution }));
    }
    candidates.sort((left, right) => left.score - right.score);
    const chosen: number[] = [];
    for (const candidate of candidates) {
      if (
        chosen.every(
          (other) =>
            pointDistance(cellPoint(other, field), cellPoint(candidate.index, field)) >= field.spacingMetres * 5
        )
      ) {
        chosen.push(candidate.index);
      }
      if (chosen.length === 3) break;
    }
    return Object.freeze(chosen);
  };
  return Object.freeze({
    left: portalCandidates("left"),
    right: portalCandidates("right"),
    top: portalCandidates("top"),
    bottom: portalCandidates("bottom")
  });
}

function collectRoadTargetCells(
  layout: SeedWorldGeologyLayout,
  field: SeedWorldGeologyHeightfield,
  suitableRegions: readonly SeedWorldGeologySuitableRegion[]
): number[] {
  const canyonTargets = layout.canyons
    .filter((canyon) => canyon.kind === "trunk")
    .map((canyon, index) => {
      const parameter = 0.32 + unitHash(layout.geologySeed, `road-canyon-${index}-t`) * 0.36;
      const anchor = curvePoint(canyon.points, parameter);
      const tangent = curveTangent(canyon.points, parameter);
      const length = Math.hypot(tangent.x, tangent.z) || 1;
      const side = unitHash(layout.geologySeed, `road-canyon-${index}-side`) < 0.5 ? -1 : 1;
      return pointCell(
        freezePoint(
          anchor.x + (-tangent.z / length) * canyon.widthMetres * 0.72 * side,
          anchor.z + (tangent.x / length) * canyon.widthMetres * 0.72 * side
        ),
        field
      );
    });
  const lowlandTargets = suitableRegions
    .filter((region) => region.terrainScore >= 0.64)
    .sort((left, right) => right.terrainScore - left.terrainScore)
    .slice(0, 8)
    .map((region) => pointCell(region.center, field));
  return [...new Set([...canyonTargets, ...lowlandTargets])];
}

function findTerrainPath(
  start: number,
  goal: number,
  field: SeedWorldGeologyHeightfield,
  penalties: Float32Array,
  networkDistance?: Uint16Array
): readonly number[] | undefined {
  const count = field.resolution ** 2;
  const scores = new Float64Array(count);
  scores.fill(Number.POSITIVE_INFINITY);
  const previous = new Int32Array(count);
  previous.fill(-1);
  const open = [start];
  const inOpen = new Uint8Array(count);
  inOpen[start] = 1;
  scores[start] = 0;
  const goalPoint = cellPoint(goal, field);
  const neighbours = [
    [-1, -1, Math.SQRT2],
    [0, -1, 1],
    [1, -1, Math.SQRT2],
    [-1, 0, 1],
    [1, 0, 1],
    [-1, 1, Math.SQRT2],
    [0, 1, 1],
    [1, 1, Math.SQRT2]
  ] as const;
  while (open.length > 0) {
    let bestOpenIndex = 0;
    let bestEstimate = Number.POSITIVE_INFINITY;
    for (let index = 0; index < open.length; index++) {
      const cell = open[index]!;
      const estimate = scores[cell]! + pointDistance(cellPoint(cell, field), goalPoint);
      if (estimate < bestEstimate) {
        bestEstimate = estimate;
        bestOpenIndex = index;
      }
    }
    const current = open.splice(bestOpenIndex, 1)[0]!;
    inOpen[current] = 0;
    if (current === goal) {
      const path = [current];
      while (previous[path.at(-1)!]! >= 0) path.push(previous[path.at(-1)!]!);
      path.reverse();
      return Object.freeze(path);
    }
    const currentX = current % field.resolution;
    const currentZ = Math.floor(current / field.resolution);
    for (const [offsetX, offsetZ, lengthScale] of neighbours) {
      const x = currentX + offsetX;
      const z = currentZ + offsetZ;
      if (x < 1 || x >= field.resolution - 1 || z < 1 || z >= field.resolution - 1) continue;
      const next = z * field.resolution + x;
      const run = field.spacingMetres * lengthScale;
      const slopeDegrees = radiansToDegrees(Math.atan(Math.abs(field.heights[next]! - field.heights[current]!) / run));
      if (slopeDegrees > ROAD_MAXIMUM_SLOPE_DEGREES) continue;
      const parallelPenalty = networkDistance && networkDistance[next]! <= 2 && next !== goal ? 5 : 0;
      const terrainPenalty = clamp((penalties[current]! + penalties[next]!) * 0.5, -0.75, 64);
      const tentative = scores[current]! + run * (1 + terrainPenalty + parallelPenalty);
      if (tentative >= scores[next]!) continue;
      previous[next] = current;
      scores[next] = tentative;
      if (!inOpen[next]) {
        open.push(next);
        inOpen[next] = 1;
      }
    }
  }
  return undefined;
}

function makeRoad(
  id: string,
  kind: "main" | "branch",
  cells: readonly number[],
  field: SeedWorldGeologyHeightfield,
  penalties: Float32Array,
  reachesBoundary: boolean
): SeedWorldGeologyRoad {
  const simplified = cells.filter((cell, index) => {
    if (index === 0 || index === cells.length - 1) return true;
    const previous = cellPoint(cells[index - 1]!, field);
    const current = cellPoint(cell, field);
    const next = cellPoint(cells[index + 1]!, field);
    return (
      Math.sign(current.x - previous.x) !== Math.sign(next.x - current.x) ||
      Math.sign(current.z - previous.z) !== Math.sign(next.z - current.z)
    );
  });
  let points = simplified.map((cell) => cellPoint(cell, field));
  for (let iteration = 0; iteration < 2; iteration++) {
    const smoothed: SeedWorldGeologyPoint[] = [points[0]!];
    for (let index = 0; index < points.length - 1; index++) {
      smoothed.push(
        freezePoint(
          mix(points[index]!.x, points[index + 1]!.x, 0.28),
          mix(points[index]!.z, points[index + 1]!.z, 0.28)
        ),
        freezePoint(
          mix(points[index]!.x, points[index + 1]!.x, 0.72),
          mix(points[index]!.z, points[index + 1]!.z, 0.72)
        )
      );
    }
    smoothed.push(points.at(-1)!);
    points = smoothed;
  }
  let widthSamples = points.map((point) => measureRoadWidth(point, kind, field));
  for (let iteration = 0; iteration < 2; iteration++) {
    widthSamples = widthSamples.map((current, index) => {
      if (index === 0 || index === widthSamples.length - 1) return current;
      const previous = widthSamples[index - 1]!;
      const next = widthSamples[index + 1]!;
      return {
        coreHalfWidthMetres:
          (previous.coreHalfWidthMetres + current.coreHalfWidthMetres * 2 + next.coreHalfWidthMetres) * 0.25,
        shoulderWidthMetres:
          (previous.shoulderWidthMetres + current.shoulderWidthMetres * 2 + next.shoulderWidthMetres) * 0.25
      };
    });
  }
  const profiledPoints = Object.freeze(
    points.map((point, index) =>
      Object.freeze({
        ...point,
        ...widthSamples[index]!
      })
    )
  );
  return Object.freeze({
    id,
    kind,
    points: profiledPoints,
    maximumSlopeDegrees: measureRoadCells(cells, field, penalties).maximumSlopeDegrees,
    reachesBoundary
  });
}

function measureRoadWidth(
  point: SeedWorldGeologyPoint,
  kind: "main" | "branch",
  field: SeedWorldGeologyHeightfield
): Readonly<{ coreHalfWidthMetres: number; shoulderWidthMetres: number }> {
  const centre = pointCell(point, field);
  const centreX = centre % field.resolution;
  const centreZ = Math.floor(centre / field.resolution);
  let minimumHeight = Number.POSITIVE_INFINITY;
  let maximumHeight = Number.NEGATIVE_INFINITY;
  for (let offsetZ = -1; offsetZ <= 1; offsetZ++) {
    const z = clamp(centreZ + offsetZ, 0, field.resolution - 1);
    for (let offsetX = -1; offsetX <= 1; offsetX++) {
      const x = clamp(centreX + offsetX, 0, field.resolution - 1);
      const height = field.heights[z * field.resolution + x]!;
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
    }
  }
  const slopeConfinement = smootherstep(field.slopesDegrees[centre]! / ROAD_MAXIMUM_SLOPE_DEGREES);
  const reliefConfinement = smootherstep((maximumHeight - minimumHeight - 18) / 82);
  const openness = 1 - clamp(slopeConfinement * 0.58 + reliefConfinement * 0.42, 0, 1);
  const coreRange = kind === "main" ? ROAD_MAIN_CORE_HALF_WIDTH_METRES : ROAD_BRANCH_CORE_HALF_WIDTH_METRES;
  const shoulderRange = kind === "main" ? ROAD_MAIN_SHOULDER_WIDTH_METRES : ROAD_BRANCH_SHOULDER_WIDTH_METRES;
  return Object.freeze({
    coreHalfWidthMetres: mix(coreRange[0], coreRange[1], openness),
    shoulderWidthMetres: mix(shoulderRange[0], shoulderRange[1], openness)
  });
}

function measureRoadCells(
  cells: readonly number[],
  field: SeedWorldGeologyHeightfield,
  penalties: Float32Array
): Readonly<{ maximumSlopeDegrees: number; lengthMetres: number; difficulty: number }> {
  let maximumSlopeDegrees = 0;
  let lengthMetres = 0;
  let weightedCost = 0;
  for (let index = 1; index < cells.length; index++) {
    const previous = cells[index - 1]!;
    const current = cells[index]!;
    const run = pointDistance(cellPoint(previous, field), cellPoint(current, field)) || field.spacingMetres;
    const slopeDegrees = radiansToDegrees(
      Math.atan(Math.abs(field.heights[current]! - field.heights[previous]!) / run)
    );
    maximumSlopeDegrees = Math.max(maximumSlopeDegrees, slopeDegrees);
    lengthMetres += run;
    weightedCost += run * (1 + Math.max(0, (penalties[previous]! + penalties[current]!) * 0.5));
  }
  return Object.freeze({
    maximumSlopeDegrees,
    lengthMetres,
    difficulty: weightedCost / Math.max(1, lengthMetres)
  });
}

function distanceFromCellSet(cells: ReadonlySet<number>, resolution: number): Uint16Array {
  const distances = new Uint16Array(resolution ** 2);
  distances.fill(0xffff);
  const queue = new Uint32Array(resolution ** 2);
  let head = 0;
  let tail = 0;
  for (const cell of cells) {
    distances[cell] = 0;
    queue[tail++] = cell;
  }
  while (head < tail) {
    const cell = queue[head++]!;
    const x = cell % resolution;
    const z = Math.floor(cell / resolution);
    const nextDistance = distances[cell]! + 1;
    for (const [offsetX, offsetZ] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ] as const) {
      const nextX = x + offsetX;
      const nextZ = z + offsetZ;
      if (nextX < 0 || nextZ < 0 || nextX >= resolution || nextZ >= resolution) continue;
      const next = nextZ * resolution + nextX;
      if (distances[next]! <= nextDistance) continue;
      distances[next] = nextDistance;
      queue[tail++] = next;
    }
  }
  return distances;
}

function nearestCellInSet(source: number, candidates: ReadonlySet<number>, field: SeedWorldGeologyHeightfield): number {
  const sourcePoint = cellPoint(source, field);
  let nearest = source;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distanceMetres = pointDistance(sourcePoint, cellPoint(candidate, field));
    if (distanceMetres < nearestDistance) {
      nearest = candidate;
      nearestDistance = distanceMetres;
    }
  }
  return nearest;
}

function pointCell(point: SeedWorldGeologyPoint, field: SeedWorldGeologyHeightfield): number {
  const x = clamp(Math.round((point.x + HALF_WORLD_METRES) / field.spacingMetres), 1, field.resolution - 2);
  const z = clamp(Math.round((point.z + HALF_WORLD_METRES) / field.spacingMetres), 1, field.resolution - 2);
  return z * field.resolution + x;
}

function cellPoint(index: number, field: SeedWorldGeologyHeightfield): SeedWorldGeologyPoint {
  return freezePoint(
    -HALF_WORLD_METRES + (index % field.resolution) * field.spacingMetres,
    -HALF_WORLD_METRES + Math.floor(index / field.resolution) * field.spacingMetres
  );
}

function deriveHeightfieldMeasurements(
  heights: Float32Array,
  resolution: number,
  spacingMetres: number
): Readonly<{
  slopesDegrees: Float32Array;
  curvaturePerMetre: Float32Array;
  normals: Float32Array;
  maximumSlopeDegrees: number;
}> {
  const slopesDegrees = new Float32Array(heights.length);
  const curvaturePerMetre = new Float32Array(heights.length);
  const normals = new Float32Array(heights.length * 3);
  let maximumSlopeDegrees = 0;
  for (let z = 0; z < resolution; z++) {
    const previousZ = Math.max(0, z - 1);
    const nextZ = Math.min(resolution - 1, z + 1);
    for (let x = 0; x < resolution; x++) {
      const previousX = Math.max(0, x - 1);
      const nextX = Math.min(resolution - 1, x + 1);
      const index = z * resolution + x;
      const gradientX =
        (heights[z * resolution + nextX]! - heights[z * resolution + previousX]!) /
        ((nextX - previousX) * spacingMetres);
      const gradientZ =
        (heights[nextZ * resolution + x]! - heights[previousZ * resolution + x]!) /
        ((nextZ - previousZ) * spacingMetres);
      const inverseLength = 1 / Math.hypot(gradientX, 1, gradientZ);
      const slopeDegrees = radiansToDegrees(Math.atan(Math.hypot(gradientX, gradientZ)));
      slopesDegrees[index] = slopeDegrees;
      curvaturePerMetre[index] =
        (heights[z * resolution + previousX]! +
          heights[z * resolution + nextX]! +
          heights[previousZ * resolution + x]! +
          heights[nextZ * resolution + x]! -
          heights[index]! * 4) /
        (spacingMetres * spacingMetres);
      normals[index * 3] = -gradientX * inverseLength;
      normals[index * 3 + 1] = inverseLength;
      normals[index * 3 + 2] = -gradientZ * inverseLength;
      maximumSlopeDegrees = Math.max(maximumSlopeDegrees, slopeDegrees);
    }
  }
  return Object.freeze({ slopesDegrees, curvaturePerMetre, normals, maximumSlopeDegrees });
}

function resolvePlannerHillAtom(shape: HillShape): HillShape {
  const resolved = resolveSeedWorldHillAtom(
    {
      pedestalLiftMetres: shape.pedestalLift,
      influenceMajorRadiusMetres: shape.influenceMajor,
      peakReliefMetres: shape.peakRelief,
      bodyMajorRadiusMetres: shape.bodyMajor
    },
    {
      bodyMinorRadiusMetres: shape.bodyMinor,
      influenceMinorRadiusMetres: shape.influenceMinor
    }
  );
  return {
    bodyMajor: resolved.bodyMajorRadiusMetres,
    bodyMinor: resolved.bodyMinorRadiusMetres,
    influenceMajor: resolved.influenceMajorRadiusMetres,
    influenceMinor: resolved.influenceMinorRadiusMetres,
    pedestalLift: resolved.pedestalLiftMetres,
    peakRelief: resolved.peakReliefMetres
  };
}

function validateParameters(parameters: SeedWorldGeologyParameters): void {
  const ranges: Readonly<Record<keyof SeedWorldGeologyParameters, readonly [number, number]>> = Object.freeze({
    hillCount: [18, 64],
    clusterStrength: [0, 100],
    scaleContrast: [0, 100],
    heightContrast: [0, 100],
    edgeOccupancy: [0, 100],
    coastTransition: [120, 720],
    beltCount: [1, 3],
    beltAzimuth: [0, 180],
    beltLift: [0, 180],
    canyonCount: [1, 5],
    canyonAzimuth: [0, 180],
    canyonMeander: [0, 100],
    canyonWidth: [160, 520],
    tributaryDensity: [0, 100],
    orientationCoherence: [0, 100],
    heightScale: [70, 180]
  });
  for (const [key, range] of Object.entries(ranges) as Array<
    readonly [keyof SeedWorldGeologyParameters, readonly [number, number]]
  >) {
    const value = parameters[key];
    if (!Number.isFinite(value) || value < range[0] || value > range[1]) {
      throw new RangeError(`Seed World geology ${key} must remain within ${range[0]}-${range[1]}`);
    }
  }
}

function hashLayoutIdentity(
  geologySeed: number,
  parameters: SeedWorldGeologyParameters,
  edits: readonly SeedWorldGeologyHillEdit[]
): number {
  const parameterSignature = Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value.toFixed(4)}`)
    .join("|");
  const editSignature = [...edits]
    .sort((left, right) => left.hillId - right.hillId)
    .map((edit) =>
      Object.entries(edit)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}:${value}`)
        .join(",")
    )
    .join("|");
  return hash32(geologySeed, `${parameterSignature}#${editSignature}`);
}

function rotateIntoHill(
  hill: Pick<SeedWorldGeologyHill, "center" | "rotationRadians">,
  worldX: number,
  worldZ: number
): Readonly<{ x: number; z: number }> {
  const deltaX = worldX - hill.center.x;
  const deltaZ = worldZ - hill.center.z;
  const cosine = Math.cos(hill.rotationRadians);
  const sine = Math.sin(hill.rotationRadians);
  return Object.freeze({ x: deltaX * cosine + deltaZ * sine, z: -deltaX * sine + deltaZ * cosine });
}

function getHillRotation(hill: SeedWorldGeologyHill): Readonly<{ cosine: number; sine: number }> {
  let rotation = hillRotationCache.get(hill);
  if (!rotation) {
    rotation = Object.freeze({ cosine: Math.cos(hill.rotationRadians), sine: Math.sin(hill.rotationRadians) });
    hillRotationCache.set(hill, rotation);
  }
  return rotation;
}

function ellipseRadius(hill: SeedWorldGeologyHill, directionX: number, directionZ: number): number {
  const cosine = Math.cos(hill.rotationRadians);
  const sine = Math.sin(hill.rotationRadians);
  const localX = directionX * cosine + directionZ * sine;
  const localZ = -directionX * sine + directionZ * cosine;
  return (
    1 /
    Math.sqrt(
      (localX * localX) / (hill.bodyRadiusMetres.major * hill.bodyRadiusMetres.major) +
        (localZ * localZ) / (hill.bodyRadiusMetres.minor * hill.bodyRadiusMetres.minor)
    )
  );
}

function curveDistance(point: SeedWorldGeologyPoint, points: readonly SeedWorldGeologyPoint[]): number {
  let minimumSquaredDistance = Number.POSITIVE_INFINITY;
  for (const position of getCurveSamples(points)) {
    const deltaX = point.x - position.x;
    const deltaZ = point.z - position.z;
    minimumSquaredDistance = Math.min(minimumSquaredDistance, deltaX * deltaX + deltaZ * deltaZ);
  }
  return Math.sqrt(minimumSquaredDistance);
}

function curveNearest(point: SeedWorldGeologyPoint, points: readonly SeedWorldGeologyPoint[]): CurveNearest {
  const sampleCount = Math.max(48, points.length * 8);
  const samples = getCurveSamples(points);
  let nearestIndex = 0;
  let minimumSquaredDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < samples.length; index++) {
    const position = samples[index]!;
    const deltaX = point.x - position.x;
    const deltaZ = point.z - position.z;
    const squaredDistance = deltaX * deltaX + deltaZ * deltaZ;
    if (squaredDistance < minimumSquaredDistance) {
      minimumSquaredDistance = squaredDistance;
      nearestIndex = index;
    }
  }
  return Object.freeze({
    distanceMetres: Math.sqrt(minimumSquaredDistance),
    position: samples[nearestIndex]!,
    parameter: nearestIndex / sampleCount
  });
}

function getCurveSamples(points: readonly SeedWorldGeologyPoint[]): readonly SeedWorldGeologyPoint[] {
  let samples = curveSamplesCache.get(points);
  if (!samples) {
    const sampleCount = Math.max(48, points.length * 8);
    samples = Object.freeze(
      Array.from({ length: sampleCount + 1 }, (_, index) => curvePoint(points, index / sampleCount))
    );
    curveSamplesCache.set(points, samples);
  }
  return samples;
}

function curvePoint(points: readonly SeedWorldGeologyPoint[], parameter: number): SeedWorldGeologyPoint {
  if (points.length === 2)
    return freezePoint(mix(points[0]!.x, points[1]!.x, parameter), mix(points[0]!.z, points[1]!.z, parameter));
  if (points.length === 3) {
    const inverse = 1 - parameter;
    return freezePoint(
      inverse * inverse * points[0]!.x + 2 * inverse * parameter * points[1]!.x + parameter * parameter * points[2]!.x,
      inverse * inverse * points[0]!.z + 2 * inverse * parameter * points[1]!.z + parameter * parameter * points[2]!.z
    );
  }
  const segmentCount = points.length - 1;
  const scaled = clamp(parameter, 0, 1) * segmentCount;
  const segment = Math.min(segmentCount - 1, Math.floor(scaled));
  const local = scaled - segment;
  const point0 = points[Math.max(0, segment - 1)]!;
  const point1 = points[segment]!;
  const point2 = points[segment + 1]!;
  const point3 = points[Math.min(points.length - 1, segment + 2)]!;
  const localSquared = local * local;
  const localCubed = localSquared * local;
  return freezePoint(
    0.5 *
      (2 * point1.x +
        (-point0.x + point2.x) * local +
        (2 * point0.x - 5 * point1.x + 4 * point2.x - point3.x) * localSquared +
        (-point0.x + 3 * point1.x - 3 * point2.x + point3.x) * localCubed),
    0.5 *
      (2 * point1.z +
        (-point0.z + point2.z) * local +
        (2 * point0.z - 5 * point1.z + 4 * point2.z - point3.z) * localSquared +
        (-point0.z + 3 * point1.z - 3 * point2.z + point3.z) * localCubed)
  );
}

function curveTangent(points: readonly SeedWorldGeologyPoint[], parameter: number): SeedWorldGeologyPoint {
  const epsilon = 1 / Math.max(256, points.length * 48);
  const near = curvePoint(points, clamp(parameter - epsilon, 0, 1));
  const far = curvePoint(points, clamp(parameter + epsilon, 0, 1));
  return freezePoint(far.x - near.x, far.z - near.z);
}

function axisLimit(coordinate: number, direction: number, limit: number): number {
  if (Math.abs(direction) < 1e-6) return Number.POSITIVE_INFINITY;
  return Math.min(Math.abs((coordinate + limit) / direction), Math.abs((limit - coordinate) / direction));
}

function heightfieldCacheKey(resolution: number, parameters: SeedWorldFbmParameters): string {
  return [
    resolution,
    parameters.rollingWavelengthMetres,
    parameters.rollingAmplitudeMetres,
    parameters.rollingOctaves,
    parameters.detailWavelengthMetres,
    parameters.detailAmplitudeMetres,
    parameters.detailOctaves,
    parameters.warpWavelengthMetres,
    parameters.warpAmplitudeMetres,
    parameters.warpOctaves
  ].join(":");
}

function smootherstep(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * amount * (amount * (amount * 6 - 15) + 10);
}

function unitHash(seed: number, key: string): number {
  return hash32(seed, key) / 0xffff_ffff;
}

function signedHash(seed: number, key: string): number {
  return unitHash(seed, key) * 2 - 1;
}

function hash32(seed: number, key: string): number {
  let hash = (seed ^ 0x9e37_79b9) >>> 0;
  for (let index = 0; index < key.length; index++) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x85eb_ca6b) >>> 0;
    hash ^= hash >>> 13;
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb_352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846c_a68b) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

function angleDelta(left: number, right: number): number {
  let delta = left - right;
  while (delta > Math.PI / 2) delta -= Math.PI;
  while (delta < -Math.PI / 2) delta += Math.PI;
  return delta;
}

function counterClockwiseXToClockwiseNorth(angleRadians: number): number {
  return wrapRadians(Math.PI * 0.5 - angleRadians);
}

function vectorToClockwiseNorthBearing(deltaX: number, deltaZ: number): number {
  return wrapRadians(Math.atan2(deltaX, deltaZ));
}

function wrapRadians(value: number): number {
  const turn = Math.PI * 2;
  return ((value % turn) + turn) % turn;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function pointDistance(left: SeedWorldGeologyPoint, right: SeedWorldGeologyPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function freezePoint(x: number, z: number): SeedWorldGeologyPoint {
  return Object.freeze({ x, z });
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
