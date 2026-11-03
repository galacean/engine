import { MeshTopology, type Matrix, type ModelMesh } from "@galacean/engine";
import type { AtomicAssemblySource } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import { sampleSeedWorldHeight, type SeedWorldFields } from "./SeedWorldFields.ts";
import {
  createSeedWorldPopulationPreviewFromLayout,
  type SeedWorldPopulationInstance,
  type SeedWorldPopulationPreview
} from "./SeedWorldPopulationPlan.ts";
import type { SeedWorldPlan } from "../world/SeedWorldPlanner.ts";
import {
  SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE,
  type SeedWorldRockGrassTransitionStyle
} from "./SeedWorldRockAssemblyRuntime.ts";
import type { SeedWorldSolvedRockObb } from "./SeedWorldRockAssemblySolver.ts";

export const SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS = 13;
export const SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES = 32;

export interface SeedWorldRockSurfaceGrassPatch {
  /** Native mesh-owned substrate descriptor in the compact surface-weight slot. */
  readonly rockGround?: boolean;
  /** Stable construction-time identity reused by the residency owner. */
  readonly key: string;
  readonly patchX: number;
  readonly patchZ: number;
  readonly minimumY: number;
  readonly maximumY: number;
  readonly transforms: Float32Array;
  readonly instanceCount: number;
  readonly candidateCount: number;
  readonly compiled: boolean;
}

export interface SeedWorldRockSurfaceGrassTransformPool {
  acquire(minimumInstanceCount: number, maximumCapacityRatio?: number): Float32Array;
  release(buffer: Float32Array): void;
}

export interface SeedWorldRockSurfaceGrassCompiler {
  readonly patchCount: number;
  readonly minimumPatchX: number;
  readonly minimumPatchZ: number;
  readonly maximumPatchX: number;
  readonly maximumPatchZ: number;
  readonly sourceTriangleCount: number;
  readonly acceptedTriangleCount: number;
  getPatch(patchX: number, patchZ: number): SeedWorldRockSurfaceGrassPatch | undefined;
  compilePatch(
    patchX: number,
    patchZ: number,
    transformPool: SeedWorldRockSurfaceGrassTransformPool
  ): SeedWorldRockSurfaceGrassPatch | undefined;
  releasePatch(patch: SeedWorldRockSurfaceGrassPatch, transformPool: SeedWorldRockSurfaceGrassTransformPool): void;
  destroy(transformPool: SeedWorldRockSurfaceGrassTransformPool): void;
}

/** World-space grass density shared with the authored terrestrial DensityField. */
export interface SeedWorldRockSurfaceGrassDensity {
  /** Maximum cluster density used to construct deterministic surface candidates. */
  readonly maximumDensityPerSquareMetre: number;
  /** Returns the final cluster density at one world-space horizontal position. */
  sampleDensityPerSquareMetre(worldX: number, worldZ: number): number;
}

/** One Producer-owned tree materialized on the exact upward-facing Clif mesh. */
export interface SeedWorldRockSurfaceTreePlacement {
  readonly producerInstance: SeedWorldPopulationInstance;
  readonly position: readonly [x: number, y: number, z: number];
  readonly surfaceNormal: readonly [x: number, y: number, z: number];
}

/** Evidence from projecting final rock-clearance candidates onto exact Clif triangles. */
export interface SeedWorldRockSurfaceTreeCompilation {
  readonly placements: readonly SeedWorldRockSurfaceTreePlacement[];
  readonly candidateCount: number;
  readonly sourceTriangleCount: number;
  readonly acceptedTriangleCount: number;
}

/** Registers grounded trees in the same canonical layout as terrain trees, preserving stable identities. */
export function createSeedWorldRockSurfacePopulationLayout(
  plan: SeedWorldPlan,
  population: SeedWorldPopulationPreview,
  compilation: SeedWorldRockSurfaceTreeCompilation
): SeedWorldPopulationPreview {
  const instances = new Map(population.treeInstances.map((instance) => [instance.id, instance] as const));
  for (const { producerInstance } of compilation.placements) {
    if (!instances.has(producerInstance.id)) instances.set(producerInstance.id, producerInstance);
  }
  return createSeedWorldPopulationPreviewFromLayout(plan, population, [...instances.values()]);
}

type Point = readonly [x: number, y: number, z: number];
interface LocalTriangle {
  readonly a: Point;
  readonly b: Point;
  readonly c: Point;
  readonly normal: Point;
  readonly area: number;
  readonly edges: readonly LocalTriangleEdge[];
}
interface LocalTriangleEdge {
  readonly a: Point;
  readonly b: Point;
  readonly neighbourTriangleIndices: readonly number[];
}
interface AcceptedRockTriangle {
  readonly triangle: LocalTriangle;
  readonly triangleIndex: number;
  readonly normal: Point;
  readonly boundaryEdges: readonly LocalTriangleEdge[];
}
interface CachedAcceptedRockTriangles {
  readonly triangles: readonly LocalTriangle[];
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
  readonly rotationW: number;
  readonly topSlope: number;
  readonly acceptedTriangles: readonly AcceptedRockTriangle[];
}
interface CachedLocalTriangles {
  readonly matrixElements: Float32Array;
  readonly triangles: readonly LocalTriangle[];
}
interface CachedGrassSweptRadius {
  readonly matrixElements: Float32Array;
  readonly radius: number;
}
interface SurfaceTriangleCandidateSource {
  readonly triangle: LocalTriangle;
  readonly boundaryEdges: readonly LocalTriangleEdge[];
  readonly triangleSeed: number;
  readonly count: number;
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly uniformScale: number;
  readonly rotationX: number;
  readonly rotationY: number;
  readonly rotationZ: number;
  readonly rotationW: number;
  readonly normalX: number;
  readonly normalY: number;
  readonly normalZ: number;
}
interface MutableSurfacePatch {
  key: string;
  patchX: number;
  patchZ: number;
  minimumY: number;
  maximumY: number;
  transforms: Float32Array;
  instanceCount: number;
  candidateCount: number;
  maximumCandidateCount: number;
  readonly sources: SurfaceTriangleCandidateSource[];
  compiled: boolean;
}
interface WorldSurfaceTriangle {
  readonly a: Point;
  readonly b: Point;
  readonly c: Point;
  readonly normal: Point;
  readonly minimumX: number;
  readonly maximumX: number;
  readonly minimumZ: number;
  readonly maximumZ: number;
}

const ROOT_LIFT_METRES = 0.015;
const EMPTY_TRANSFORMS = new Float32Array(0);
const localTriangleCache = new WeakMap<ModelMesh, CachedLocalTriangles>();
const grassSweptRadiusCache = new WeakMap<ModelMesh, CachedGrassSweptRadius>();
const grassRootRadiusCache = new WeakMap<ModelMesh, CachedGrassSweptRadius>();
const acceptedRockTriangleCache = new WeakMap<SeedWorldSolvedRockObb, CachedAcceptedRockTriangles>();
const sortedRockCache = new WeakMap<readonly SeedWorldSolvedRockObb[], readonly SeedWorldSolvedRockObb[]>();

/** Indexes deterministic surface candidates once, then materializes only camera-local render patches. */
export function createSeedWorldRockSurfaceGrassCompiler(
  rockSource: AtomicAssemblySource,
  grassSource: AtomicAssemblySource,
  rocks: readonly SeedWorldSolvedRockObb[],
  scaleRange: Readonly<{ minimum: number; maximum: number }>,
  density: SeedWorldRockSurfaceGrassDensity,
  style: SeedWorldRockGrassTransitionStyle = SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE
): SeedWorldRockSurfaceGrassCompiler {
  if (
    !Number.isFinite(scaleRange.minimum) ||
    !Number.isFinite(scaleRange.maximum) ||
    scaleRange.minimum <= 0 ||
    scaleRange.maximum < scaleRange.minimum
  ) {
    throw new RangeError("Seed World rock-surface grass requires a finite positive scale range");
  }
  if (!Number.isFinite(density.maximumDensityPerSquareMetre) || density.maximumDensityPerSquareMetre < 0) {
    throw new RangeError("Seed World rock-surface grass density must be finite and non-negative");
  }
  const binding = rockSource.lods[0]?.renderer;
  if (!binding) throw new Error(`Seed World rock-surface grass source "${rockSource.id}" has no LOD0 renderer`);
  const localTriangles = readLocalTriangles(binding.mesh, binding.localMatrix);
  const grassSweptRadiusMetres = readGrassSweptRadius(grassSource);
  const patchesByX = new Map<number, Map<number, MutableSurfacePatch>>();
  if (density.maximumDensityPerSquareMetre === 0 || rocks.length === 0 || localTriangles.length === 0) {
    return new RockSurfaceGrassCompiler(
      patchesByX,
      scaleRange,
      density,
      grassSweptRadiusMetres,
      style.edgeInsetScale,
      localTriangles.length,
      0
    );
  }

  const triangleBoundsScratch = new Float64Array(9);
  const maximumDensity = density.maximumDensityPerSquareMetre;
  let acceptedTriangleCount = 0;
  for (const rock of readSortedRocks(rocks)) {
    const acceptedTriangles = readAcceptedRockTriangles(localTriangles, rock, style.topSlope);
    const rockSeed = hashText(0x811c_9dc5, rock.id);
    const uniformScale = rock.uniformScale;
    const rotation = rock.rotationQuaternion;
    const rotationX = rotation[0];
    const rotationY = rotation[1];
    const rotationZ = rotation[2];
    const rotationW = rotation[3];
    for (const { triangle, triangleIndex, normal, boundaryEdges } of acceptedTriangles) {
      acceptedTriangleCount++;
      const expectedCount = triangle.area * uniformScale * uniformScale * maximumDensity;
      const triangleSeed = hash(rockSeed ^ Math.imul(triangleIndex + 1, 0x9e37_79b9));
      const count = Math.floor(expectedCount) + Number(unitFloat(triangleSeed ^ 0x68bc_21eb) < expectedCount % 1);
      if (count === 0) continue;
      const source: SurfaceTriangleCandidateSource = {
        triangle,
        boundaryEdges,
        triangleSeed,
        count,
        positionX: rock.position[0],
        positionY: rock.position[1],
        positionZ: rock.position[2],
        uniformScale,
        rotationX,
        rotationY,
        rotationZ,
        rotationW,
        normalX: normal[0],
        normalY: normal[1],
        normalZ: normal[2]
      };
      transformRockPointInto(triangle.a, source, triangleBoundsScratch, 0);
      transformRockPointInto(triangle.b, source, triangleBoundsScratch, 3);
      transformRockPointInto(triangle.c, source, triangleBoundsScratch, 6);
      const minimumPatchX = Math.floor(
        Math.min(triangleBoundsScratch[0]!, triangleBoundsScratch[3]!, triangleBoundsScratch[6]!) /
          SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES
      );
      const maximumPatchX = Math.floor(
        Math.max(triangleBoundsScratch[0]!, triangleBoundsScratch[3]!, triangleBoundsScratch[6]!) /
          SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES
      );
      const minimumPatchZ = Math.floor(
        Math.min(triangleBoundsScratch[2]!, triangleBoundsScratch[5]!, triangleBoundsScratch[8]!) /
          SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES
      );
      const maximumPatchZ = Math.floor(
        Math.max(triangleBoundsScratch[2]!, triangleBoundsScratch[5]!, triangleBoundsScratch[8]!) /
          SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES
      );
      for (let patchX = minimumPatchX; patchX <= maximumPatchX; patchX++) {
        let patchesByZ = patchesByX.get(patchX);
        if (!patchesByZ) {
          patchesByZ = new Map();
          patchesByX.set(patchX, patchesByZ);
        }
        for (let patchZ = minimumPatchZ; patchZ <= maximumPatchZ; patchZ++) {
          let patch = patchesByZ.get(patchZ);
          if (!patch) {
            patch = {
              key: `${patchX}:${patchZ}`,
              patchX,
              patchZ,
              minimumY: 0,
              maximumY: 0,
              transforms: EMPTY_TRANSFORMS,
              instanceCount: 0,
              candidateCount: 0,
              maximumCandidateCount: 0,
              sources: [],
              compiled: false
            };
            patchesByZ.set(patchZ, patch);
          }
          patch.sources.push(source);
          patch.maximumCandidateCount += count;
        }
      }
    }
  }
  return new RockSurfaceGrassCompiler(
    patchesByX,
    scaleRange,
    density,
    grassSweptRadiusMetres,
    style.edgeInsetScale,
    localTriangles.length,
    acceptedTriangleCount
  );
}

class RockSurfaceGrassCompiler implements SeedWorldRockSurfaceGrassCompiler {
  readonly patchCount: number;
  readonly minimumPatchX: number;
  readonly minimumPatchZ: number;
  readonly maximumPatchX: number;
  readonly maximumPatchZ: number;
  private _staging = EMPTY_TRANSFORMS;

  constructor(
    private readonly _patchesByX: ReadonlyMap<number, ReadonlyMap<number, MutableSurfacePatch>>,
    private readonly _scaleRange: Readonly<{ minimum: number; maximum: number }>,
    private readonly _density: SeedWorldRockSurfaceGrassDensity,
    private readonly _grassSweptRadiusMetres: number,
    private readonly _edgeInsetScale: number,
    readonly sourceTriangleCount: number,
    readonly acceptedTriangleCount: number
  ) {
    let patchCount = 0;
    let minimumPatchX = Number.POSITIVE_INFINITY;
    let minimumPatchZ = Number.POSITIVE_INFINITY;
    let maximumPatchX = Number.NEGATIVE_INFINITY;
    let maximumPatchZ = Number.NEGATIVE_INFINITY;
    for (const [patchX, patchesByZ] of _patchesByX) {
      patchCount += patchesByZ.size;
      minimumPatchX = Math.min(minimumPatchX, patchX);
      maximumPatchX = Math.max(maximumPatchX, patchX);
      for (const patchZ of patchesByZ.keys()) {
        minimumPatchZ = Math.min(minimumPatchZ, patchZ);
        maximumPatchZ = Math.max(maximumPatchZ, patchZ);
      }
    }
    this.patchCount = patchCount;
    this.minimumPatchX = patchCount === 0 ? 0 : minimumPatchX;
    this.minimumPatchZ = patchCount === 0 ? 0 : minimumPatchZ;
    this.maximumPatchX = patchCount === 0 ? -1 : maximumPatchX;
    this.maximumPatchZ = patchCount === 0 ? -1 : maximumPatchZ;
  }

  getPatch(patchX: number, patchZ: number): SeedWorldRockSurfaceGrassPatch | undefined {
    return this._patchesByX.get(patchX)?.get(patchZ);
  }

  compilePatch(
    patchX: number,
    patchZ: number,
    transformPool: SeedWorldRockSurfaceGrassTransformPool
  ): SeedWorldRockSurfaceGrassPatch | undefined {
    const patch = this._patchesByX.get(patchX)?.get(patchZ);
    if (!patch || patch.compiled) return patch;
    if (this._staging.length < patch.maximumCandidateCount * SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS) {
      const previous = this._staging;
      this._staging = EMPTY_TRANSFORMS;
      if (previous.length > 0) transformPool.release(previous);
      this._staging = transformPool.acquire(patch.maximumCandidateCount);
    }
    const staging = this._staging;
    const minimumX = patchX * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
    const minimumZ = patchZ * SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
    const maximumX = minimumX + SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
    const maximumZ = minimumZ + SEED_WORLD_ROCK_SURFACE_GRASS_PATCH_METRES;
    const scaleMinimum = this._scaleRange.minimum;
    const scaleSpan = this._scaleRange.maximum - scaleMinimum;
    const maximumDensity = this._density.maximumDensityPerSquareMetre;
    let instanceCount = 0;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    for (let sourceIndex = 0; sourceIndex < patch.sources.length; sourceIndex++) {
      const source = patch.sources[sourceIndex]!;
      const triangle = source.triangle;
      for (let ordinal = 0; ordinal < source.count; ordinal++) {
        const seed = hash(source.triangleSeed ^ Math.imul(ordinal + 1, 0x85eb_ca6b));
        const root = Math.sqrt(unitFloat(seed ^ 0xa511_e9b3));
        const weightA = 1 - root;
        const weightB = root * (1 - unitFloat(seed ^ 0x27d4_eb2f));
        const weightC = 1 - weightA - weightB;
        const localX = triangle.a[0] * weightA + triangle.b[0] * weightB + triangle.c[0] * weightC;
        const localY = triangle.a[1] * weightA + triangle.b[1] * weightB + triangle.c[1] * weightC;
        const localZ = triangle.a[2] * weightA + triangle.b[2] * weightB + triangle.c[2] * weightC;
        const maximumAxisScale = scaleMinimum + scaleSpan * unitFloat(seed ^ 0x63d8_3595);
        const scaleX = maximumAxisScale * (0.82 + 0.36 * unitFloat(seed ^ 0x9e37_79b9));
        const scaleY = maximumAxisScale;
        const scaleZ = maximumAxisScale * (0.82 + 0.36 * unitFloat(seed ^ 0x85eb_ca6b));
        const localClearance =
          (this._grassSweptRadiusMetres * Math.max(scaleX, scaleY, scaleZ) * this._edgeInsetScale) /
          source.uniformScale;
        if (!surfacePointHasClearance(source.boundaryEdges, localX, localY, localZ, localClearance)) continue;
        const vectorX = localX * source.uniformScale;
        const vectorY = localY * source.uniformScale;
        const vectorZ = localZ * source.uniformScale;
        const crossX = source.rotationY * vectorZ - source.rotationZ * vectorY;
        const crossY = source.rotationZ * vectorX - source.rotationX * vectorZ;
        const crossZ = source.rotationX * vectorY - source.rotationY * vectorX;
        const positionX =
          source.positionX +
          vectorX +
          2 * (source.rotationW * crossX + source.rotationY * crossZ - source.rotationZ * crossY) +
          source.normalX * ROOT_LIFT_METRES;
        const positionZ =
          source.positionZ +
          vectorZ +
          2 * (source.rotationW * crossZ + source.rotationX * crossY - source.rotationY * crossX) +
          source.normalZ * ROOT_LIFT_METRES;
        if (positionX < minimumX || positionX >= maximumX || positionZ < minimumZ || positionZ >= maximumZ) {
          continue;
        }
        const sampledDensity = this._density.sampleDensityPerSquareMetre(positionX, positionZ);
        if (!Number.isFinite(sampledDensity) || sampledDensity < 0) {
          throw new RangeError("Seed World rock-surface grass sampled density must be finite and non-negative");
        }
        if (unitFloat(seed ^ 0x7f4a_7c15) > Math.min(sampledDensity / maximumDensity, 1)) continue;
        const positionY =
          source.positionY +
          vectorY +
          2 * (source.rotationW * crossY + source.rotationZ * crossX - source.rotationX * crossZ) +
          source.normalY * ROOT_LIFT_METRES;
        const offset = instanceCount * SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS;
        staging[offset] = positionX;
        staging[offset + 1] = positionY;
        staging[offset + 2] = positionZ;
        staging[offset + 3] = unitFloat(seed ^ 0xc2b2_ae35) * Math.PI * 2;
        staging[offset + 4] = scaleX;
        staging[offset + 5] = scaleY;
        staging[offset + 6] = scaleZ;
        staging[offset + 7] = 1;
        staging[offset + 8] = 0;
        staging[offset + 9] = 0;
        staging[offset + 10] = source.normalX;
        staging[offset + 11] = source.normalY;
        staging[offset + 12] = source.normalZ;
        minimumY = Math.min(minimumY, positionY);
        maximumY = Math.max(maximumY, positionY);
        instanceCount++;
      }
    }
    patch.compiled = true;
    patch.instanceCount = instanceCount;
    patch.candidateCount = instanceCount;
    patch.minimumY = instanceCount === 0 ? 0 : minimumY;
    patch.maximumY = instanceCount === 0 ? 0 : maximumY;
    if (instanceCount > 0) {
      const transforms = transformPool.acquire(instanceCount, 2);
      const floatCount = instanceCount * SEED_WORLD_ROCK_SURFACE_GRASS_TRANSFORM_FLOATS;
      for (let index = 0; index < floatCount; index++) transforms[index] = staging[index]!;
      patch.transforms = transforms;
    }
    return patch;
  }

  releasePatch(source: SeedWorldRockSurfaceGrassPatch, transformPool: SeedWorldRockSurfaceGrassTransformPool): void {
    const patch = source as MutableSurfacePatch;
    if (!patch.compiled) return;
    if (patch.transforms.length > 0) transformPool.release(patch.transforms);
    patch.transforms = EMPTY_TRANSFORMS;
    patch.instanceCount = 0;
    patch.candidateCount = 0;
    patch.minimumY = 0;
    patch.maximumY = 0;
    patch.compiled = false;
  }

  destroy(transformPool: SeedWorldRockSurfaceGrassTransformPool): void {
    if (this._staging.length > 0) transformPool.release(this._staging);
    this._staging = EMPTY_TRANSFORMS;
  }
}

function readSortedRocks(rocks: readonly SeedWorldSolvedRockObb[]): readonly SeedWorldSolvedRockObb[] {
  if (rocks.length < 2) return rocks;
  let sorted = sortedRockCache.get(rocks);
  if (!sorted) {
    sorted = Object.freeze([...rocks].sort(compareRockIds));
    sortedRockCache.set(rocks, sorted);
  }
  return sorted;
}

function compareRockIds(left: SeedWorldSolvedRockObb, right: SeedWorldSolvedRockObb): number {
  return left.id.localeCompare(right.id);
}

/**
 * Reuses exact ecology candidates rejected only by final Clif contact, then changes grounding alone.
 * A candidate survives only when its original X-Z root intersects an upward-facing source-mesh triangle
 * at or above Hfinal. Near and mid views therefore keep the normal tree LOD chain, while distant rocks
 * naturally submit the authored terminal LOD3 geometry.
 */
export function compileSeedWorldRockSurfaceTrees(
  rockSource: AtomicAssemblySource,
  rocks: readonly SeedWorldSolvedRockObb[],
  candidates: readonly SeedWorldPopulationInstance[],
  fields: SeedWorldFields,
  style: SeedWorldRockGrassTransitionStyle = SEED_WORLD_DEFAULT_ROCK_GRASS_TRANSITION_STYLE
): SeedWorldRockSurfaceTreeCompilation {
  const binding = rockSource.lods[0]?.renderer;
  if (!binding) throw new Error(`Seed World rock-surface trees source "${rockSource.id}" has no LOD0 renderer`);
  const localTriangles = readLocalTriangles(binding.mesh, binding.localMatrix);
  if (rocks.length === 0 || candidates.length === 0 || localTriangles.length === 0) {
    return Object.freeze({
      placements: Object.freeze([]),
      candidateCount: candidates.length,
      sourceTriangleCount: localTriangles.length,
      acceptedTriangleCount: 0
    });
  }

  const worldTriangles: WorldSurfaceTriangle[] = [];
  for (const rock of [...rocks].sort((left, right) => left.id.localeCompare(right.id))) {
    for (const accepted of readAcceptedRockTriangles(localTriangles, rock, style.topSlope)) {
      const a = transformRockPoint(accepted.triangle.a, rock);
      const b = transformRockPoint(accepted.triangle.b, rock);
      const c = transformRockPoint(accepted.triangle.c, rock);
      worldTriangles.push(
        Object.freeze({
          a,
          b,
          c,
          normal: accepted.normal,
          minimumX: Math.min(a[0], b[0], c[0]),
          maximumX: Math.max(a[0], b[0], c[0]),
          minimumZ: Math.min(a[2], b[2], c[2]),
          maximumZ: Math.max(a[2], b[2], c[2])
        })
      );
    }
  }

  const placements: SeedWorldRockSurfaceTreePlacement[] = [];
  for (const producerInstance of candidates) {
    if (producerInstance.category !== "tree") continue;
    const worldX = (producerInstance.normalizedPosition.x - 0.5) * fields.sizeMetres;
    const worldZ = (producerInstance.normalizedPosition.y - 0.5) * fields.sizeMetres;
    const terrainY = sampleSeedWorldHeight(fields, worldX, worldZ);
    if (terrainY === undefined) continue;
    let selectedY = Number.NEGATIVE_INFINITY;
    let selectedNormal: Point | undefined;
    for (const triangle of worldTriangles) {
      if (
        worldX < triangle.minimumX ||
        worldX > triangle.maximumX ||
        worldZ < triangle.minimumZ ||
        worldZ > triangle.maximumZ
      ) {
        continue;
      }
      const intersectionY = verticalTriangleIntersectionY(worldX, worldZ, triangle);
      if (intersectionY === undefined || intersectionY < terrainY || intersectionY <= selectedY) continue;
      selectedY = intersectionY;
      selectedNormal = triangle.normal;
    }
    if (!selectedNormal) continue;
    placements.push(
      Object.freeze({
        producerInstance,
        position: Object.freeze([worldX, selectedY + ROOT_LIFT_METRES, worldZ] as const),
        surfaceNormal: Object.freeze([...selectedNormal] as [number, number, number])
      })
    );
  }
  return Object.freeze({
    placements: Object.freeze(placements),
    candidateCount: candidates.length,
    sourceTriangleCount: localTriangles.length,
    acceptedTriangleCount: worldTriangles.length
  });
}

function verticalTriangleIntersectionY(
  worldX: number,
  worldZ: number,
  triangle: WorldSurfaceTriangle
): number | undefined {
  const denominator =
    (triangle.b[2] - triangle.c[2]) * (triangle.a[0] - triangle.c[0]) +
    (triangle.c[0] - triangle.b[0]) * (triangle.a[2] - triangle.c[2]);
  if (Math.abs(denominator) <= Number.EPSILON) return undefined;
  const weightA =
    ((triangle.b[2] - triangle.c[2]) * (worldX - triangle.c[0]) +
      (triangle.c[0] - triangle.b[0]) * (worldZ - triangle.c[2])) /
    denominator;
  const weightB =
    ((triangle.c[2] - triangle.a[2]) * (worldX - triangle.c[0]) +
      (triangle.a[0] - triangle.c[0]) * (worldZ - triangle.c[2])) /
    denominator;
  const weightC = 1 - weightA - weightB;
  const epsilon = 1e-7;
  if (weightA < -epsilon || weightB < -epsilon || weightC < -epsilon) return undefined;
  return weightA * triangle.a[1] + weightB * triangle.b[1] + weightC * triangle.c[1];
}

function readAcceptedRockTriangles(
  triangles: readonly LocalTriangle[],
  rock: SeedWorldSolvedRockObb,
  topSlope: number
): readonly AcceptedRockTriangle[] {
  // Position, scale and edge inset do not change this local-space topology analysis.
  const rotation = rock.rotationQuaternion;
  const rotationX = rotation[0];
  const rotationY = rotation[1];
  const rotationZ = rotation[2];
  const rotationW = rotation[3];
  const cached = acceptedRockTriangleCache.get(rock);
  if (
    cached?.triangles === triangles &&
    cached.rotationX === rotationX &&
    cached.rotationY === rotationY &&
    cached.rotationZ === rotationZ &&
    cached.rotationW === rotationW &&
    cached.topSlope === topSlope
  ) {
    return cached.acceptedTriangles;
  }

  const rotatedNormals = triangles.map((triangle) =>
    rotateVectorByQuaternion(triangle.normal, rock.rotationQuaternion)
  );
  const acceptedSurface = rotatedNormals.map((normal) => normal[1] >= topSlope);
  const acceptedTriangles: AcceptedRockTriangle[] = [];
  for (let triangleIndex = 0; triangleIndex < triangles.length; triangleIndex++) {
    if (!acceptedSurface[triangleIndex]) continue;
    acceptedTriangles.push(
      Object.freeze({
        triangle: triangles[triangleIndex]!,
        triangleIndex,
        normal: rotatedNormals[triangleIndex]!,
        boundaryEdges: Object.freeze(
          triangles[triangleIndex]!.edges.filter(
            (edge) => !edge.neighbourTriangleIndices.some((neighbour) => acceptedSurface[neighbour])
          )
        )
      })
    );
  }
  const frozen = Object.freeze(acceptedTriangles);
  acceptedRockTriangleCache.set(
    rock,
    Object.freeze({ triangles, rotationX, rotationY, rotationZ, rotationW, topSlope, acceptedTriangles: frozen })
  );
  return frozen;
}

function transformRockPointInto(
  point: Point,
  source: SurfaceTriangleCandidateSource,
  out: Float64Array,
  offset: number
): void {
  const vectorX = point[0] * source.uniformScale;
  const vectorY = point[1] * source.uniformScale;
  const vectorZ = point[2] * source.uniformScale;
  const crossX = source.rotationY * vectorZ - source.rotationZ * vectorY;
  const crossY = source.rotationZ * vectorX - source.rotationX * vectorZ;
  const crossZ = source.rotationX * vectorY - source.rotationY * vectorX;
  out[offset] =
    source.positionX +
    vectorX +
    2 * (source.rotationW * crossX + source.rotationY * crossZ - source.rotationZ * crossY) +
    source.normalX * ROOT_LIFT_METRES;
  out[offset + 1] =
    source.positionY +
    vectorY +
    2 * (source.rotationW * crossY + source.rotationZ * crossX - source.rotationX * crossZ) +
    source.normalY * ROOT_LIFT_METRES;
  out[offset + 2] =
    source.positionZ +
    vectorZ +
    2 * (source.rotationW * crossZ + source.rotationX * crossY - source.rotationY * crossX) +
    source.normalZ * ROOT_LIFT_METRES;
}

function transformRockPoint(point: Point, rock: SeedWorldSolvedRockObb): Point {
  const rotated = rotateVectorByQuaternion(
    [point[0] * rock.uniformScale, point[1] * rock.uniformScale, point[2] * rock.uniformScale],
    rock.rotationQuaternion
  );
  return [rock.position[0] + rotated[0], rock.position[1] + rotated[1], rock.position[2] + rotated[2]];
}

function readLocalTriangles(mesh: ModelMesh, localMatrix: Matrix): readonly LocalTriangle[] {
  const matrixElements = localMatrix.elements;
  const cached = localTriangleCache.get(mesh);
  if (cached && matrixElementsEqual(cached.matrixElements, matrixElements)) return cached.triangles;
  const positions = mesh.getPositions();
  if (!positions) throw new Error(`Seed World rock mesh "${mesh.name}" does not retain CPU positions`);
  const indices = mesh.getIndices();
  const subMesh = mesh.subMeshes[0];
  if (!subMesh || subMesh.topology !== MeshTopology.Triangles || subMesh.count % 3 !== 0) {
    throw new Error(`Seed World rock mesh "${mesh.name}" must contain one indexed triangle primitive`);
  }
  const triangleGeometry: Array<Readonly<Omit<LocalTriangle, "edges"> & { readonly edgeKeys: readonly string[] }>> = [];
  const edgeUses = new Map<string, number[]>();
  for (let offset = subMesh.start; offset < subMesh.start + subMesh.count; offset += 3) {
    const a = transformCoordinate(positions[indices![offset]!]!, localMatrix);
    const b = transformCoordinate(positions[indices![offset + 1]!]!, localMatrix);
    const c = transformCoordinate(positions[indices![offset + 2]!]!, localMatrix);
    const edgeAB: Point = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const edgeAC: Point = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross: Point = [
      edgeAB[1] * edgeAC[2] - edgeAB[2] * edgeAC[1],
      edgeAB[2] * edgeAC[0] - edgeAB[0] * edgeAC[2],
      edgeAB[0] * edgeAC[1] - edgeAB[1] * edgeAC[0]
    ];
    const doubleArea = Math.hypot(...cross);
    if (doubleArea <= Number.EPSILON) continue;
    const edgeKeys = [geometricEdgeKey(a, b), geometricEdgeKey(b, c), geometricEdgeKey(c, a)];
    const triangleIndex = triangleGeometry.length;
    for (const edgeKey of edgeKeys) {
      const uses = edgeUses.get(edgeKey);
      if (uses) uses.push(triangleIndex);
      else edgeUses.set(edgeKey, [triangleIndex]);
    }
    triangleGeometry.push(
      Object.freeze({
        a,
        b,
        c,
        normal: Object.freeze([cross[0] / doubleArea, cross[1] / doubleArea, cross[2] / doubleArea] as Point),
        area: doubleArea * 0.5,
        edgeKeys: Object.freeze(edgeKeys)
      })
    );
  }
  const triangles = triangleGeometry.map((triangle, triangleIndex) => {
    const points = [triangle.a, triangle.b, triangle.c, triangle.a] as const;
    return Object.freeze({
      a: triangle.a,
      b: triangle.b,
      c: triangle.c,
      normal: triangle.normal,
      area: triangle.area,
      edges: Object.freeze(
        triangle.edgeKeys.map((edgeKey, edgeIndex) =>
          Object.freeze({
            a: points[edgeIndex]!,
            b: points[edgeIndex + 1]!,
            neighbourTriangleIndices: Object.freeze(
              (edgeUses.get(edgeKey) ?? []).filter((candidate) => candidate !== triangleIndex)
            )
          })
        )
      )
    });
  });
  const frozen = Object.freeze(triangles);
  localTriangleCache.set(mesh, Object.freeze({ matrixElements: new Float32Array(matrixElements), triangles: frozen }));
  return frozen;
}

function geometricEdgeKey(first: Point, second: Point): string {
  const firstKey = first.map((component) => Math.round(component * 1e6)).join(":");
  const secondKey = second.map((component) => Math.round(component * 1e6)).join(":");
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

function surfacePointHasClearance(
  boundaryEdges: readonly LocalTriangleEdge[],
  pointX: number,
  pointY: number,
  pointZ: number,
  clearance: number
): boolean {
  if (clearance <= Number.EPSILON || boundaryEdges.length === 0) return true;
  const clearanceSquared = clearance * clearance;
  // Only boundary triangles pay this approximate safety cost; interior triangles skip it entirely.
  for (const edge of boundaryEdges) {
    if (pointToSegmentDistanceSquared(pointX, pointY, pointZ, edge) < clearanceSquared) return false;
  }
  return true;
}

function pointToSegmentDistanceSquared(
  pointX: number,
  pointY: number,
  pointZ: number,
  segment: LocalTriangleEdge
): number {
  const edgeX = segment.b[0] - segment.a[0];
  const edgeY = segment.b[1] - segment.a[1];
  const edgeZ = segment.b[2] - segment.a[2];
  const offsetX = pointX - segment.a[0];
  const offsetY = pointY - segment.a[1];
  const offsetZ = pointZ - segment.a[2];
  const edgeLengthSquared = edgeX * edgeX + edgeY * edgeY + edgeZ * edgeZ;
  const parameter =
    edgeLengthSquared > Number.EPSILON
      ? Math.max(0, Math.min(1, (offsetX * edgeX + offsetY * edgeY + offsetZ * edgeZ) / edgeLengthSquared))
      : 0;
  const deltaX = pointX - (segment.a[0] + edgeX * parameter);
  const deltaY = pointY - (segment.a[1] + edgeY * parameter);
  const deltaZ = pointZ - (segment.a[2] + edgeZ * parameter);
  return deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
}

/** Root footprint only: tall/bent leaves may extend beyond the supporting ledge.
 * CPU-less assets use their conservative horizontal bounds, never the wind-swept height. */
export function readSeedWorldGrassRootRadius(source: AtomicAssemblySource): number {
  const binding = source.lods[0]?.renderer;
  if (!binding) throw Error(`Grass source "${source.id}" has no LOD0 renderer`);
  const matrix = binding.localMatrix.elements,
    cached = grassRootRadiusCache.get(binding.mesh);
  if (cached && matrixElementsEqual(cached.matrixElements, matrix)) return cached.radius;
  let points: Point[] = [];
  try {
    points = binding.mesh.getPositions()?.map((p) => transformCoordinate(p, binding.localMatrix)) ?? [];
  } catch {
    /* A GPU-only source falls back to its declared horizontal footprint below. */
  }
  let radius = 0;
  if (points.length) {
    let minimum = Infinity,
      maximum = -Infinity;
    for (const p of points) {
      minimum = Math.min(minimum, p[1]);
      maximum = Math.max(maximum, p[1]);
    }
    const rootBand = minimum + (maximum - minimum) * 0.04;
    for (const p of points) if (p[1] <= rootBand + 1e-6) radius = Math.max(radius, Math.hypot(p[0], p[2]));
  } else {
    const { min, max } = binding.mesh.bounds;
    for (const x of [min.x, max.x])
      for (const z of [min.z, max.z]) {
        const p = transformCoordinate({ x, y: min.y, z }, binding.localMatrix);
        radius = Math.max(radius, Math.hypot(p[0], p[2]));
      }
  }
  radius = Math.max(0.001, radius);
  grassRootRadiusCache.set(binding.mesh, { matrixElements: new Float32Array(matrix), radius });
  return radius;
}

function readGrassSweptRadius(source: AtomicAssemblySource): number {
  const binding = source.lods[0]?.renderer;
  if (!binding) throw new Error(`Seed World rock-surface grass prototype "${source.id}" has no LOD0 renderer`);
  const matrixElements = binding.localMatrix.elements;
  const cached = grassSweptRadiusCache.get(binding.mesh);
  if (cached && matrixElementsEqual(cached.matrixElements, matrixElements)) return cached.radius;
  const positions = binding.mesh.getPositions();
  if (!positions) {
    throw new Error(`Seed World rock-surface grass prototype "${binding.mesh.name}" does not retain CPU positions`);
  }
  const radius = positions.reduce((maximum, position) => {
    const local = transformCoordinate(position, binding.localMatrix);
    return Math.max(maximum, Math.hypot(local[0], local[1], local[2]));
  }, 0);
  if (radius <= Number.EPSILON) {
    throw new Error(`Seed World rock-surface grass prototype "${binding.mesh.name}" has no finite swept radius`);
  }
  grassSweptRadiusCache.set(binding.mesh, Object.freeze({ matrixElements: new Float32Array(matrixElements), radius }));
  return radius;
}

function matrixElementsEqual(left: Float32Array, right: Float32Array): boolean {
  for (let index = 0; index < 16; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function transformCoordinate(point: Readonly<{ x: number; y: number; z: number }>, matrix: Matrix): Point {
  const e = matrix.elements;
  const denominator = point.x * e[3]! + point.y * e[7]! + point.z * e[11]! + e[15]!;
  const reciprocal = Math.abs(denominator) > Number.EPSILON ? 1 / denominator : 1;
  return [
    (point.x * e[0]! + point.y * e[4]! + point.z * e[8]! + e[12]!) * reciprocal,
    (point.x * e[1]! + point.y * e[5]! + point.z * e[9]! + e[13]!) * reciprocal,
    (point.x * e[2]! + point.y * e[6]! + point.z * e[10]! + e[14]!) * reciprocal
  ];
}

function rotateVectorByQuaternion(vector: Point, quaternion: readonly [number, number, number, number]): Point {
  const result: [x: number, y: number, z: number] = [0, 0, 0];
  rotateVectorByQuaternionInto(vector[0], vector[1], vector[2], quaternion, result);
  return result;
}

function rotateVectorByQuaternionInto(
  vectorX: number,
  vectorY: number,
  vectorZ: number,
  quaternion: readonly [number, number, number, number],
  out: [x: number, y: number, z: number]
): void {
  const [x, y, z, w] = quaternion;
  const crossX = y * vectorZ - z * vectorY;
  const crossY = z * vectorX - x * vectorZ;
  const crossZ = x * vectorY - y * vectorX;
  out[0] = vectorX + 2 * (w * crossX + y * crossZ - z * crossY);
  out[1] = vectorY + 2 * (w * crossY + z * crossX - x * crossZ);
  out[2] = vectorZ + 2 * (w * crossZ + x * crossY - y * crossX);
}

function hashText(seed: number, value: string): number {
  let result = seed >>> 0;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x0100_0193) >>> 0;
  }
  return result;
}

function hash(input: number): number {
  let value = input >>> 0;
  value = Math.imul((value ^ (value >>> 16)) >>> 0, 0x7feb_352d) >>> 0;
  value = Math.imul((value ^ (value >>> 15)) >>> 0, 0x846c_a68b) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function unitFloat(seed: number): number {
  return (hash(seed) & 0x00ff_ffff) / 16_777_216;
}
