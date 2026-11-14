import {
  type SeedWorldDecorationInstance,
  type SeedWorldMushroomInstance,
  type SeedWorldRockSourceKind,
  type SeedWorldRockSurfaceKind,
  type SeedWorldSmallRockSourceKind,
  type SeedWorldSmallRockInstance,
  type SeedWorldStoneInstance
} from "../world/SeedWorldDecorations.ts";
import {
  getSeedWorldAssetPlacementProfile,
  SEED_WORLD_ROCK_CLIF_1_ASSET_TO_CANONICAL_QUATERNION,
  SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS
} from "../world/SeedWorldAssetPlacementProfile.ts";
import { sampleSeedWorldHeight, type SeedWorldFields } from "./SeedWorldFields.ts";

type QuaternionTuple = readonly [x: number, y: number, z: number, w: number];
type VectorTuple = readonly [x: number, y: number, z: number];

/** Extra burial ratios measured from fully-supported root to authored root. */
export const SEED_WORLD_ROCK_EMBED_CALIBRATION = Object.freeze({
  lowerDecile: 0.25739699368730756,
  median: 0.5304426013952429,
  upperDecile: 0.6266136430251474
});

/** Center-root-depth ratios measured against local Y span times the largest scale axis. */
export const SEED_WORLD_ROCK_ROOT_DEPTH_CALIBRATION = Object.freeze({
  lowerDecile: 0.4256704989275062,
  median: 0.5920297927798747,
  upperDecile: 0.7530562787475462
});

/** Visible-height ratios measured against the complete rotated world-AABB height. */
export const SEED_WORLD_ROCK_VISIBLE_CALIBRATION = Object.freeze({
  lowerDecile: 0.155,
  median: 0.269,
  upperDecile: 0.414
});

/** Maximum fraction of a parent rock's rotated world height left above Hfinal at its center. */
export const SEED_WORLD_ROCK_TARGET_VISIBLE_HEIGHT_RATIO = 0.35;

/** Offline LOD0 contact metadata extracted from the authored rock-clif-1 GLB. */
export const SEED_WORLD_ROCK_CLIF_1_CONTACT_GEOMETRY = compileSeedWorldRockContactGeometry(
  SEED_WORLD_ROCK_CLIF_1_LOCAL_BOUNDS,
  [
    [-2.698373556137085, -0.3917027711868286, -4.865978717803955],
    [-0.745578408241272, -0.40717175602912903, -4.621314525604248],
    [3.9948956966400146, -0.25544172525405884, -4.843301296234131],
    [-2.3160178661346436, -0.7067606449127197, -0.12431689351797104],
    [-1.2578942775726318, -0.7289755344390869, -0.1487608551979065],
    [3.1895766258239746, -0.6505370736122131, 0.08356287330389023],
    [-4.294520854949951, -0.43001699447631836, 4.290299892425537],
    [1.0353671312332153, -0.43066972494125366, 4.164777755737305],
    [4.72840690612793, -0.4845063388347626, 3.6706950664520264]
  ],
  [
    [-2.58020281791687, 10.979467391967773, -9.892542839050293],
    [-0.7598326206207275, 11.147477149963379, -11.763947486877441],
    [3.179967164993286, 10.11906623840332, -6.3014092445373535],
    [-3.6160099506378174, 9.955854415893555, -4.201705455780029],
    [-0.3892408013343811, 9.682100296020508, -3.4644148349761963],
    [3.601296901702881, 9.582901954650879, -4.1862993240356445],
    [-2.9948034286499023, 8.290573120117188, 3.893282890319824],
    [1.4902228116989136, 8.232043266296387, 3.9125630855560303],
    [7.056583881378174, 7.721564769744873, 3.796252965927124]
  ]
);

/** Final world-space placement obtained from one shared 2D/3D rock instance. */
export interface SeedWorldRockPlacement {
  /** Stable identity copied from the shared decoration compiler. */
  readonly id: string;
  /** Whether this placement is a terrain-covered parent rock or a neutral ordinary stone. */
  readonly category?: "rock" | "stone";
  /** Natural feature class or downstream land adapter which owns the placement. */
  readonly sourceKind: SeedWorldRockSourceKind | "land";
  /** Exact Terrain substrate which selects the authored cliff material. */
  readonly surfaceKind?: SeedWorldRockSurfaceKind;
  /** Stable source feature identity. */
  readonly sourceFeatureId: string;
  /** Stable visual-cluster identity. */
  readonly visualClusterId: string;
  /** Authored Integrated prototype family. */
  readonly prototypeFamily: SeedWorldDecorationInstance["prototypeFamily"] | SeedWorldStoneInstance["prototypeFamily"];
  /** World-space Prefab-root position in metres. */
  readonly position: readonly [x: number, y: number, z: number];
  /** Surface-aligned world rotation in `[x, y, z, w]` quaternion order. */
  readonly rotationQuaternion: QuaternionTuple;
  /** Exact shared yaw used when the final footprint normal is fitted. */
  readonly yawRadians?: number;
  /** Exact shared residual tilt used when the final footprint normal is fitted. */
  readonly tiltResidualRadians?: readonly [x: number, z: number];
  /** Optional source-owned fraction of fitted rock height intentionally left above Hfinal. */
  readonly visibleHeightRatio?: number;
  /** Exact scale copied from the shared decoration compiler. */
  readonly scale: readonly [x: number, y: number, z: number];
  /** Final Heightmap value sampled before Prefab footprint burial. */
  readonly surfaceHeight: number;
}

/** Prefab-root-space bounds of one authored rock LOD0 render geometry. */
export interface SeedWorldRockLocalBounds {
  /** Minimum root-local coordinate. */
  readonly minimum: readonly [x: number, y: number, z: number];
  /** Maximum root-local coordinate. */
  readonly maximum: readonly [x: number, y: number, z: number];
}

/** LOD0 bounds and offline lower-envelope supports used for terrain contact. */
export interface SeedWorldRockContactGeometry {
  /** Prefab-root-space LOD0 bounds. */
  readonly bounds: SeedWorldRockLocalBounds;
  /** Root-local 3x3 lower-envelope supports extracted offline from the authored GLB. */
  readonly supportPoints: readonly VectorTuple[];
  /** Optional root-local 3x3 upper-envelope samples used when another rock rests on this asset. */
  readonly topSurfacePoints?: readonly VectorTuple[];
}

/** Quantitative result of fitting one authored rock to the final Heightmap. */
export interface SeedWorldRockContactMetrics {
  /** Number of lower-envelope points sampled from Hfinal. */
  readonly supportSampleCount: number;
  /** Fitted terrain normal over the complete scaled footprint. */
  readonly surfaceNormal: VectorTuple;
  /** Highest minus lowest Hfinal sample under the footprint. */
  readonly terrainReliefMetres: number;
  /** Authored local Y span times the largest exact shared scale axis. */
  readonly scaledSourceHeightMetres: number;
  /** Final rotated world-AABB Y span. */
  readonly transformedWorldHeightMetres: number;
  /** Extra burial below the first fully-supported root height. */
  readonly embedDepthMetres: number;
  /** Hfinal at the shared XZ minus the final Prefab-root Y. */
  readonly rootDepthAtCenterMetres: number;
  /** Top exposure above Hfinal at the shared center XZ. */
  readonly visibleHeightMetres: number;
  /** Final world-space LOD0 AABB. */
  readonly worldBounds: SeedWorldRockLocalBounds;
}

/** Final placement after LOD0 footprint fitting and calibrated burial. */
export interface SeedWorldAlignedRockPlacement extends SeedWorldRockPlacement {
  /** Measured contact and visibility diagnostics. */
  readonly contact: SeedWorldRockContactMetrics;
}

/** Final world-space placement for one exact shared small-stone instance. */
export interface SeedWorldSmallRockPlacement {
  /** Stable identity copied from the shared decoration compiler. */
  readonly id: string;
  /** Natural feature class which owns the small stone. */
  readonly sourceKind: SeedWorldSmallRockSourceKind;
  /** Stable source feature identity. */
  readonly sourceFeatureId: string;
  /** Asset Assembly prototype selected by the shared Producer. */
  readonly prototypeFamily: "stones";
  /** World-space authored Prefab-root position in metres. */
  readonly position: readonly [x: number, y: number, z: number];
  /** Terrain-normal-aligned rotation in `[x, y, z, w]` quaternion order. */
  readonly rotationQuaternion: QuaternionTuple;
  /** Exact shared scale copied without resampling. */
  readonly scale: readonly [x: number, y: number, z: number];
  /** Exact shared yaw copied without resampling. */
  readonly yawRadians: number;
}

/** Final world-space placement for one exact shared mushroom instance. */
export interface SeedWorldMushroomPlacement {
  /** Stable identity copied from the shared decoration compiler. */
  readonly id: string;
  /** Exact parent rock identity. */
  readonly parentDecorationId: string;
  /** Accepted authored mushroom family. */
  readonly prototypeFamily: "mushroom-1";
  /** World-space root position sampled from Hfinal. */
  readonly position: readonly [x: number, y: number, z: number];
  /** World-up yaw rotation. */
  readonly rotationQuaternion: QuaternionTuple;
  /** Exact resolved scale. */
  readonly scale: readonly [x: number, y: number, z: number];
}

/**
 * Adds final Heightmap Y and surface orientation to the exact shared rock array.
 * @param decorations Exact 2D/3D decoration instances.
 * @param fields Final baked authority fields for the same world.
 * @returns Placements preserving every input XZ coordinate, scale, and yaw.
 * @throws {RangeError} When an instance is outside the final Heightmap.
 */
export function compileSeedWorldRockPlacements(
  decorations: readonly (SeedWorldDecorationInstance | SeedWorldStoneInstance)[],
  fields: SeedWorldFields
): readonly SeedWorldRockPlacement[] {
  return Object.freeze(
    decorations.map((decoration) => {
      const worldX = (decoration.normalizedPosition.x - 0.5) * fields.sizeMetres;
      const worldZ = (decoration.normalizedPosition.y - 0.5) * fields.sizeMetres;
      const height = sampleSeedWorldHeight(fields, worldX, worldZ);
      if (height === undefined) {
        throw new RangeError(`Seed World rock "${decoration.id}" is outside Hfinal`);
      }
      const lakeOutcropRotation =
        decoration.category === "rock" && decoration.sourceKind === "lake-outcrop"
          ? rotationForLakeOutcropClif1(decoration.yawRadians, decoration.tiltResidualRadians[0])
          : undefined;
      return Object.freeze({
        id: decoration.id,
        category: decoration.category,
        sourceKind: decoration.sourceKind,
        ...(decoration.category === "rock" ? { surfaceKind: decoration.surfaceKind } : {}),
        sourceFeatureId: decoration.sourceFeatureId,
        visualClusterId:
          decoration.category === "rock" ? decoration.visualClusterId : `stone:${decoration.parentDecorationId}`,
        prototypeFamily: decoration.prototypeFamily,
        position: Object.freeze([worldX, height, worldZ] as const),
        rotationQuaternion:
          lakeOutcropRotation ??
          surfaceAlignedRotation(fields, worldX, worldZ, decoration.yawRadians, decoration.tiltResidualRadians),
        yawRadians: decoration.yawRadians,
        tiltResidualRadians: decoration.tiltResidualRadians,
        ...(decoration.category === "rock" && decoration.visibleHeightRatio !== undefined
          ? { visibleHeightRatio: decoration.visibleHeightRatio }
          : {}),
        scale: decoration.scale,
        surfaceHeight: height
      });
    })
  );
}

/**
 * Adds Hfinal Y and terrain-normal alignment to exact shared small-stone instances.
 * The authored four-pebble pivot is the terrain contact plane, so retaining the root at Hfinal
 * preserves its built-in below-pivot burial without introducing another runtime depth multiplier.
 * @param decorations Exact small-stone instances returned by the WorldFields Worker.
 * @param fields Final baked authority fields for the same world.
 * @returns Placements preserving every input id, XZ coordinate, scale, and yaw.
 * @throws {RangeError} When an instance is outside Hfinal or has non-finite, non-positive scale.
 */
export function compileSeedWorldSmallRockPlacements(
  decorations: readonly SeedWorldSmallRockInstance[],
  fields: SeedWorldFields
): readonly SeedWorldSmallRockPlacement[] {
  return Object.freeze(
    decorations.map((decoration) => {
      if (decoration.scale.some((scale) => !Number.isFinite(scale) || scale <= 0)) {
        throw new RangeError(`Seed World small rock "${decoration.id}" requires finite positive scale`);
      }
      const worldX = (decoration.normalizedPosition.x - 0.5) * fields.sizeMetres;
      const worldZ = (decoration.normalizedPosition.y - 0.5) * fields.sizeMetres;
      const height = sampleSeedWorldHeight(fields, worldX, worldZ);
      if (height === undefined) {
        throw new RangeError(`Seed World small rock "${decoration.id}" is outside Hfinal`);
      }
      return Object.freeze({
        id: decoration.id,
        sourceKind: decoration.sourceKind,
        sourceFeatureId: decoration.sourceFeatureId,
        prototypeFamily: decoration.prototypeFamily,
        position: Object.freeze([worldX, height, worldZ] as const),
        rotationQuaternion: surfaceAlignedRotation(fields, worldX, worldZ, decoration.yawRadians, [0, 0]),
        scale: decoration.scale,
        yawRadians: decoration.yawRadians
      });
    })
  );
}

/**
 * Adds Hfinal Y to exact shared mushroom instances while keeping them vertical under gravity.
 * @param decorations Exact mushroom instances returned by the WorldFields Worker.
 * @param fields Final baked height authority.
 * @returns Placements preserving every input XZ, yaw, and scale.
 * @throws {RangeError} When an instance lies outside Hfinal.
 */
export function compileSeedWorldMushroomPlacements(
  decorations: readonly SeedWorldMushroomInstance[],
  fields: SeedWorldFields
): readonly SeedWorldMushroomPlacement[] {
  return Object.freeze(
    decorations.map((decoration) => {
      const worldX = (decoration.normalizedPosition.x - 0.5) * fields.sizeMetres;
      const worldZ = (decoration.normalizedPosition.y - 0.5) * fields.sizeMetres;
      const height = sampleSeedWorldHeight(fields, worldX, worldZ);
      if (height === undefined) throw new RangeError(`Seed World mushroom "${decoration.id}" is outside Hfinal`);
      return Object.freeze({
        id: decoration.id,
        parentDecorationId: decoration.parentDecorationId,
        prototypeFamily: decoration.prototypeFamily,
        position: Object.freeze([worldX, height, worldZ] as const),
        rotationQuaternion: surfaceAlignedRotation(fields, worldX, worldZ, decoration.yawRadians, [0, 0]),
        scale: decoration.scale
      });
    })
  );
}

/**
 * Fits one rock or ordinary stone to Hfinal; only parent rocks receive world-height-limited burial.
 * @param fields Final baked terrain sampled under the Prefab footprint.
 * @param placement Exact shared horizontal transform and rotation intent.
 * @param geometry Integrated LOD0 bounds and offline contact supports relative to the Prefab root.
 * @returns Placement whose normal and terrain contact preserve shared XZ, scale, yaw, and tilt semantics.
 * @throws {RangeError} When any support is outside Hfinal or scale contains a non-finite or non-positive value.
 */
export function alignSeedWorldRockToHeightmap(
  fields: SeedWorldFields,
  placement: SeedWorldRockPlacement,
  geometry: SeedWorldRockContactGeometry
): SeedWorldAlignedRockPlacement {
  validatePositiveScale(placement);
  const rotationQuaternion = fitFootprintRotation(fields, placement, geometry.supportPoints);
  const samples = sampleContactSurface(fields, placement, geometry.supportPoints, rotationQuaternion);
  const maximumRootHeight = Math.min(...samples.map((sample) => sample.terrainHeight - sample.rotatedY));
  const minimumTerrainHeight = Math.min(...samples.map((sample) => sample.terrainHeight));
  const maximumTerrainHeight = Math.max(...samples.map((sample) => sample.terrainHeight));
  const terrainReliefMetres = maximumTerrainHeight - minimumTerrainHeight;
  const scaledSourceHeight = (geometry.bounds.maximum[1] - geometry.bounds.minimum[1]) * Math.max(...placement.scale);
  const relativeWorldBounds = transformBounds(geometry.bounds, placement.scale, rotationQuaternion, [0, 0, 0]);
  const transformedWorldHeight = relativeWorldBounds.maximum[1] - relativeWorldBounds.minimum[1];
  const targetVisibleRootHeight =
    placement.surfaceHeight +
    transformedWorldHeight * (placement.visibleHeightRatio ?? SEED_WORLD_ROCK_TARGET_VISIBLE_HEIGHT_RATIO) -
    relativeWorldBounds.maximum[1];
  const finalRootHeight =
    placement.category === "stone" ? maximumRootHeight : Math.min(maximumRootHeight, targetVisibleRootHeight);
  const embedDepthMetres = maximumRootHeight - finalRootHeight;
  const position: VectorTuple = [placement.position[0], finalRootHeight, placement.position[2]];
  const worldBounds = transformBounds(geometry.bounds, placement.scale, rotationQuaternion, position);
  const surfaceNormal = fitSurfaceNormal(samples);
  return {
    ...placement,
    position,
    rotationQuaternion,
    contact: {
      supportSampleCount: samples.length,
      surfaceNormal: [surfaceNormal.x, surfaceNormal.y, surfaceNormal.z],
      terrainReliefMetres,
      scaledSourceHeightMetres: scaledSourceHeight,
      transformedWorldHeightMetres: transformedWorldHeight,
      embedDepthMetres,
      rootDepthAtCenterMetres: placement.surfaceHeight - finalRootHeight,
      visibleHeightMetres: Math.max(0, worldBounds.maximum[1] - placement.surfaceHeight),
      worldBounds
    }
  };
}

/**
 * Fits every rock independently to Hfinal. Lake outcrops retain their deterministic pointed-end pitch.
 * @param fields Final baked terrain sampled under every authored footprint.
 * @param placements Exact shared rock and stone transforms in compiler order.
 * @returns Aligned placements in the same order.
 */
export function alignSeedWorldRockPlacementsToHeightmap(
  fields: SeedWorldFields,
  placements: readonly SeedWorldRockPlacement[]
): readonly SeedWorldAlignedRockPlacement[] {
  return Object.freeze(
    placements.map((placement) =>
      alignSeedWorldRockToHeightmap(fields, placement, resolveSeedWorldRockContactGeometry(placement.prototypeFamily))
    )
  );
}

/**
 * Publishes offline LOD0 contact metadata without requiring runtime mesh readback.
 * @param bounds Complete LOD0 bounds relative to the Prefab root.
 * @param supportPoints Root-local lower-envelope points extracted from the authored GLB.
 * @returns Immutable bounds plus finite root-local supports.
 * @throws {RangeError} When fewer than three valid supports are available.
 */
export function compileSeedWorldRockContactGeometry(
  bounds: SeedWorldRockLocalBounds,
  supportPoints: readonly VectorTuple[],
  topSurfacePoints?: readonly VectorTuple[]
): SeedWorldRockContactGeometry {
  const width = bounds.maximum[0] - bounds.minimum[0];
  const depth = bounds.maximum[2] - bounds.minimum[2];
  if (!(width > 0) || !(depth > 0)) throw new RangeError("Seed World rock LOD0 footprint is empty");
  const finiteSupportPoints = supportPoints
    .filter((point) => point.every(Number.isFinite))
    .map((point) => Object.freeze([...point] as VectorTuple));
  if (finiteSupportPoints.length < 3) throw new RangeError("Seed World rock LOD0 has insufficient contact supports");
  const finiteTopSurfacePoints = topSurfacePoints
    ?.filter((point) => point.every(Number.isFinite))
    .map((point) => Object.freeze([...point] as VectorTuple));
  if (topSurfacePoints && (!finiteTopSurfacePoints || finiteTopSurfacePoints.length < 3)) {
    throw new RangeError("Seed World rock LOD0 has insufficient top-surface samples");
  }
  return Object.freeze({
    bounds,
    supportPoints: Object.freeze(finiteSupportPoints),
    ...(finiteTopSurfacePoints ? { topSurfacePoints: Object.freeze(finiteTopSurfacePoints) } : {})
  });
}

/**
 * Resolves offline cliff contact metadata for one Integrated prototype name.
 * @param prototypeName Integrated placed-Prefab prototype name.
 * @returns LOD0 bounds and lower-envelope support points for the matching cliff family.
 * @throws {RangeError} When the prototype is not a supported cliff family.
 */
export function resolveSeedWorldRockContactGeometry(prototypeName: string): SeedWorldRockContactGeometry {
  if (/^stone-[1-4]$/.test(prototypeName)) return acceptedStoneContactGeometry(prototypeName);
  if (/^rock-clif-1(?:-|$)/.test(prototypeName)) return SEED_WORLD_ROCK_CLIF_1_CONTACT_GEOMETRY;
  throw new RangeError(`Seed World cliff contact metadata is unavailable for "${prototypeName}"`);
}

/**
 * Returns the conservative horizontal Heightmap dependency of normal-aligned exact placements.
 * Bilinear interpolation can read one lattice interval beyond each explicit cardinal sample.
 */
export function resolveSeedWorldSurfaceAlignmentHeightDependencyRadiusMetres(
  fields: Pick<SeedWorldFields, "sizeMetres" | "heightResolution">
): number {
  const sampleSpacingMetres = fields.sizeMetres / (fields.heightResolution - 1);
  return surfaceAlignmentSampleStepMetres(fields) + sampleSpacingMetres;
}

/**
 * Returns the terrain-sampling radius required to refit one rock independently of its current renderer bounds.
 * The support envelope is measured from immutable authored contact points and remains stable across apply/undo.
 */
export function resolveSeedWorldRockHeightDependencyRadiusMetres(
  fields: Pick<SeedWorldFields, "sizeMetres" | "heightResolution">,
  scale: VectorTuple,
  geometry: SeedWorldRockContactGeometry
): number {
  const sampleSpacingMetres = fields.sizeMetres / (fields.heightResolution - 1);
  const supportRadiusMetres = Math.max(
    0,
    ...geometry.supportPoints.map((point) => Math.hypot(point[0] * scale[0], point[1] * scale[1], point[2] * scale[2]))
  );
  return Math.max(
    resolveSeedWorldSurfaceAlignmentHeightDependencyRadiusMetres(fields),
    supportRadiusMetres + sampleSpacingMetres
  );
}

function acceptedStoneContactGeometry(prototypeName: string): SeedWorldRockContactGeometry {
  const profile = getSeedWorldAssetPlacementProfile("feature-stone");
  const variant = profile.variants?.find((candidate) => candidate.prototypeFamily === prototypeName);
  const geometry = variant?.geometry ?? profile.geometry;
  const halfWidth = geometry.footprintMetres[0] * 0.5;
  const halfDepth = geometry.footprintMetres[1] * 0.5;
  const minimumY = geometry.verticalBoundsMetres[0];
  const bounds = Object.freeze({
    minimum: Object.freeze([-halfWidth, minimumY, -halfDepth] as const),
    maximum: Object.freeze([halfWidth, geometry.verticalBoundsMetres[1], halfDepth] as const)
  });
  const supportPoints: VectorTuple[] = [];
  for (const x of [-halfWidth, 0, halfWidth]) {
    for (const z of [-halfDepth, 0, halfDepth]) supportPoints.push([x, minimumY, z]);
  }
  return compileSeedWorldRockContactGeometry(bounds, supportPoints);
}

interface ContactSample {
  readonly worldX: number;
  readonly worldZ: number;
  readonly rotatedY: number;
  readonly terrainHeight: number;
}

function fitFootprintRotation(
  fields: SeedWorldFields,
  placement: SeedWorldRockPlacement,
  supportPoints: readonly VectorTuple[]
): QuaternionTuple {
  if (placement.category === "rock" && placement.sourceKind === "lake-outcrop") {
    return placement.rotationQuaternion;
  }
  if (placement.yawRadians === undefined || placement.tiltResidualRadians === undefined) {
    return placement.rotationQuaternion;
  }
  let rotation = placement.rotationQuaternion;
  for (let iteration = 0; iteration < 2; iteration++) {
    const samples = sampleContactSurface(fields, placement, supportPoints, rotation);
    const normal = fitSurfaceNormal(samples);
    rotation = rotationForSurfaceNormal(normal, placement.yawRadians, placement.tiltResidualRadians);
  }
  return rotation;
}

function sampleContactSurface(
  fields: SeedWorldFields,
  placement: SeedWorldRockPlacement,
  supportPoints: readonly VectorTuple[],
  rotationQuaternion: QuaternionTuple
): readonly ContactSample[] {
  const samples: ContactSample[] = [];
  for (const point of supportPoints) {
    const rotatedPoint = rotateVectorByQuaternion(
      point[0] * placement.scale[0],
      point[1] * placement.scale[1],
      point[2] * placement.scale[2],
      rotationQuaternion
    );
    const worldX = placement.position[0] + rotatedPoint.x;
    const worldZ = placement.position[2] + rotatedPoint.z;
    const terrainHeight = sampleSeedWorldHeight(fields, worldX, worldZ);
    if (terrainHeight === undefined) continue;
    samples.push({ worldX, worldZ, rotatedY: rotatedPoint.y, terrainHeight });
  }
  if (samples.length !== supportPoints.length) {
    throw new RangeError(`Seed World rock "${placement.id}" does not have complete Hfinal footprint support`);
  }
  return samples;
}

function validatePositiveScale(placement: SeedWorldRockPlacement): void {
  if (placement.scale.some((scale) => !Number.isFinite(scale) || scale <= 0)) {
    throw new RangeError(`Seed World rock "${placement.id}" requires finite positive scale`);
  }
  if (
    placement.visibleHeightRatio !== undefined &&
    (!Number.isFinite(placement.visibleHeightRatio) ||
      placement.visibleHeightRatio <= 0 ||
      placement.visibleHeightRatio > 1)
  ) {
    throw new RangeError(`Seed World rock "${placement.id}" requires a visible-height ratio in (0, 1]`);
  }
}

function fitSurfaceNormal(samples: readonly ContactSample[]): Readonly<{ x: number; y: number; z: number }> {
  if (samples.length < 3) return { x: 0, y: 1, z: 0 };
  const inverseCount = 1 / samples.length;
  const meanX = samples.reduce((sum, sample) => sum + sample.worldX, 0) * inverseCount;
  const meanZ = samples.reduce((sum, sample) => sum + sample.worldZ, 0) * inverseCount;
  const meanHeight = samples.reduce((sum, sample) => sum + sample.terrainHeight, 0) * inverseCount;
  let xx = 0;
  let xz = 0;
  let zz = 0;
  let xHeight = 0;
  let zHeight = 0;
  for (const sample of samples) {
    const x = sample.worldX - meanX;
    const z = sample.worldZ - meanZ;
    const height = sample.terrainHeight - meanHeight;
    xx += x * x;
    xz += x * z;
    zz += z * z;
    xHeight += x * height;
    zHeight += z * height;
  }
  const determinant = xx * zz - xz * xz;
  if (Math.abs(determinant) < 1e-8) return { x: 0, y: 1, z: 0 };
  const gradientX = (xHeight * zz - zHeight * xz) / determinant;
  const gradientZ = (zHeight * xx - xHeight * xz) / determinant;
  const inverseLength = 1 / Math.hypot(gradientX, 1, gradientZ);
  return { x: -gradientX * inverseLength, y: inverseLength, z: -gradientZ * inverseLength };
}

function transformBounds(
  bounds: SeedWorldRockLocalBounds,
  scale: VectorTuple,
  rotation: QuaternionTuple,
  position: VectorTuple
): SeedWorldRockLocalBounds {
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const x of [bounds.minimum[0], bounds.maximum[0]]) {
    for (const y of [bounds.minimum[1], bounds.maximum[1]]) {
      for (const z of [bounds.minimum[2], bounds.maximum[2]]) {
        const rotated = rotateVectorByQuaternion(x * scale[0], y * scale[1], z * scale[2], rotation);
        const world = [position[0] + rotated.x, position[1] + rotated.y, position[2] + rotated.z];
        for (let axis = 0; axis < 3; axis++) {
          minimum[axis] = Math.min(minimum[axis], world[axis]);
          maximum[axis] = Math.max(maximum[axis], world[axis]);
        }
      }
    }
  }
  return {
    minimum: minimum as [number, number, number],
    maximum: maximum as [number, number, number]
  };
}

function surfaceAlignedRotation(
  fields: SeedWorldFields,
  worldX: number,
  worldZ: number,
  yawRadians: number,
  tiltResidualRadians: readonly [number, number]
): QuaternionTuple {
  const stepMetres = surfaceAlignmentSampleStepMetres(fields);
  const center = sampleSeedWorldHeight(fields, worldX, worldZ)!;
  const left = sampleSeedWorldHeight(fields, worldX - stepMetres, worldZ) ?? center;
  const right = sampleSeedWorldHeight(fields, worldX + stepMetres, worldZ) ?? center;
  const near = sampleSeedWorldHeight(fields, worldX, worldZ - stepMetres) ?? center;
  const far = sampleSeedWorldHeight(fields, worldX, worldZ + stepMetres) ?? center;
  const gradientX = (right - left) / (2 * stepMetres);
  const gradientZ = (far - near) / (2 * stepMetres);
  const inverseNormalLength = 1 / Math.hypot(gradientX, 1, gradientZ);
  const normal = {
    x: -gradientX * inverseNormalLength,
    y: inverseNormalLength,
    z: -gradientZ * inverseNormalLength
  };
  return rotationForSurfaceNormal(normal, yawRadians, tiltResidualRadians);
}

function surfaceAlignmentSampleStepMetres(fields: Pick<SeedWorldFields, "sizeMetres" | "heightResolution">): number {
  return Math.max(8, fields.sizeMetres / (fields.heightResolution - 1));
}

/**
 * Reuses RockLab's canonical Clif1 frame: X spans the broad face and +Z is the authored pointed -Z end.
 * A zero pitch therefore lies flat, while a positive pitch raises the real pointed end above the lakebed.
 */
function rotationForLakeOutcropClif1(yawRadians: number, pointedEndPitchRadians: number): QuaternionTuple {
  const cosineYaw = Math.cos(yawRadians);
  const sineYaw = Math.sin(yawRadians);
  const cosinePitch = Math.cos(pointedEndPitchRadians);
  const sinePitch = Math.sin(pointedEndPitchRadians);
  const tangent: VectorTuple = [cosineYaw, 0, sineYaw];
  const uphill: VectorTuple = [-sineYaw * cosinePitch, sinePitch, cosineYaw * cosinePitch];
  const vertical: VectorTuple = [sineYaw * sinePitch, cosinePitch, -cosineYaw * sinePitch];
  const canonicalRotation = quaternionFromAxes(tangent, vertical, uphill);
  return multiplyQuaternions(canonicalRotation, SEED_WORLD_ROCK_CLIF_1_ASSET_TO_CANONICAL_QUATERNION);
}

function rotationForSurfaceNormal(
  normal: Readonly<{ x: number; y: number; z: number }>,
  yawRadians: number,
  tiltResidualRadians: readonly [number, number]
): QuaternionTuple {
  const alignment = normalizeQuaternion(normal.z, 0, -normal.x, 1 + normal.y);
  const halfYaw = yawRadians * 0.5;
  const yawSine = Math.sin(halfYaw);
  const yaw: QuaternionTuple = [normal.x * yawSine, normal.y * yawSine, normal.z * yawSine, Math.cos(halfYaw)];
  const [tiltX, tiltZ] = tiltResidualRadians;
  const localTiltX: QuaternionTuple = [Math.sin(tiltX * 0.5), 0, 0, Math.cos(tiltX * 0.5)];
  const localTiltZ: QuaternionTuple = [0, 0, Math.sin(tiltZ * 0.5), Math.cos(tiltZ * 0.5)];
  return multiplyQuaternions(multiplyQuaternions(yaw, alignment), multiplyQuaternions(localTiltX, localTiltZ));
}

function multiplyQuaternions(left: QuaternionTuple, right: QuaternionTuple): QuaternionTuple {
  const [leftX, leftY, leftZ, leftW] = left;
  const [rightX, rightY, rightZ, rightW] = right;
  return normalizeQuaternion(
    leftW * rightX + leftX * rightW + leftY * rightZ - leftZ * rightY,
    leftW * rightY - leftX * rightZ + leftY * rightW + leftZ * rightX,
    leftW * rightZ + leftX * rightY - leftY * rightX + leftZ * rightW,
    leftW * rightW - leftX * rightX - leftY * rightY - leftZ * rightZ
  );
}

function quaternionFromAxes(xAxis: VectorTuple, yAxis: VectorTuple, zAxis: VectorTuple): QuaternionTuple {
  const m00 = xAxis[0];
  const m01 = yAxis[0];
  const m02 = zAxis[0];
  const m10 = xAxis[1];
  const m11 = yAxis[1];
  const m12 = zAxis[1];
  const m20 = xAxis[2];
  const m21 = yAxis[2];
  const m22 = zAxis[2];
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    return normalizeQuaternion((m21 - m12) / scale, (m02 - m20) / scale, (m10 - m01) / scale, scale * 0.25);
  }
  if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return normalizeQuaternion(scale * 0.25, (m01 + m10) / scale, (m02 + m20) / scale, (m21 - m12) / scale);
  }
  if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return normalizeQuaternion((m01 + m10) / scale, scale * 0.25, (m12 + m21) / scale, (m02 - m20) / scale);
  }
  const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return normalizeQuaternion((m02 + m20) / scale, (m12 + m21) / scale, scale * 0.25, (m10 - m01) / scale);
}

function normalizeQuaternion(x: number, y: number, z: number, w: number): QuaternionTuple {
  const inverseLength = 1 / Math.hypot(x, y, z, w);
  return [x * inverseLength, y * inverseLength, z * inverseLength, w * inverseLength];
}

function rotateVectorByQuaternion(
  x: number,
  y: number,
  z: number,
  quaternion: QuaternionTuple
): Readonly<{ x: number; y: number; z: number }> {
  const [quaternionX, quaternionY, quaternionZ, quaternionW] = quaternion;
  const temporaryX = 2 * (quaternionY * z - quaternionZ * y);
  const temporaryY = 2 * (quaternionZ * x - quaternionX * z);
  const temporaryZ = 2 * (quaternionX * y - quaternionY * x);
  return {
    x: x + quaternionW * temporaryX + quaternionY * temporaryZ - quaternionZ * temporaryY,
    y: y + quaternionW * temporaryY + quaternionZ * temporaryX - quaternionX * temporaryZ,
    z: z + quaternionW * temporaryZ + quaternionX * temporaryY - quaternionY * temporaryX
  };
}
