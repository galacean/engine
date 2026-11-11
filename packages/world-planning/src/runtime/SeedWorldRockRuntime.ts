import { Camera, type Engine, Entity } from "@galacean/engine";
import type {
  AssetAssemblySourceLibrary,
  AtomicAssemblySource
} from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import {
  TerrainLodGroupRendererRuntime,
  type TerrainLodRendererTuning
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import type { TerrainProjectResolvedGeometry } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import type { SeedWorldDecorationInstance, SeedWorldStoneInstance } from "../world/SeedWorldDecorations.ts";
import type { SeedWorldFields } from "./SeedWorldFields.ts";
import {
  seedWorldHorizontalHeightDependencyIntersects,
  type SeedWorldRuntimeBounds
} from "../world/SeedWorldRuntimeBounds.ts";
import {
  createSeedWorldExactInstanceLodEntry,
  type SeedWorldExactInstanceSpatialEntry
} from "../world/SeedWorldExactInstanceCellRuntime.ts";
import {
  alignSeedWorldRockPlacementsToHeightmap,
  compileSeedWorldRockPlacements,
  resolveSeedWorldRockHeightDependencyRadiusMetres,
  resolveSeedWorldRockContactGeometry,
  type SeedWorldAlignedRockPlacement,
  type SeedWorldRockPlacement
} from "./SeedWorldRockPlacements.ts";
import { bindSeedWorldRockToonMaterial } from "./SeedWorldRockAssemblyRuntime.ts";
import { resolveSeedWorldSurfaceDetailTransitionHeights } from "../world/SeedWorldRuntimeLodProfile.ts";

type ResolvedLodGroup = Extract<TerrainProjectResolvedGeometry, { kind: "lod-group" }>;

interface RockInstance {
  readonly category: SeedWorldRockPlacement["category"];
  readonly entity: Entity;
  readonly lod: TerrainLodGroupRendererRuntime;
}

type AtomicLodGroup = ResolvedLodGroup["lodGroup"];
type DebugVector3 = readonly [x: number, y: number, z: number];

/** Console-facing identifier for the single Clif1 in one Lake outcrop. */
export type SeedWorldLakeOutcropDebugPiece = 0 | "rock";

/** Detached local transform shown in the browser console. Euler rotation values are degrees. */
export interface SeedWorldRockDebugTransform {
  readonly id: string;
  readonly position: DebugVector3;
  readonly rotationDegrees: DebugVector3;
  readonly scale: DebugVector3;
}

/** One deterministic single-Clif1 Lake outcrop available for runtime-only transform tuning. */
export interface SeedWorldLakeOutcropDebugPair {
  readonly index: number;
  readonly clusterId: string;
  readonly rock: SeedWorldRockDebugTransform;
}

/** Absolute transform channels accepted by the console debug setter. */
export interface SeedWorldRockDebugTransformPatch {
  readonly position?: DebugVector3;
  readonly rotationDegrees?: DebugVector3;
  readonly scale?: DebugVector3;
}

/** Relative transform channels accepted by the console debug adjuster. */
export interface SeedWorldRockDebugTransformAdjustment {
  readonly position?: DebugVector3;
  readonly rotationDegrees?: DebugVector3;
  readonly scaleMultiplier?: DebugVector3;
}

interface SeedWorldRockDebugBaseline {
  readonly position: DebugVector3;
  readonly rotationQuaternion: readonly [x: number, y: number, z: number, w: number];
  readonly scale: DebugVector3;
}

/** Runtime owner for exact Seed-generated rock instances. */
export class SeedWorldRockRuntime {
  /** Root entity containing only current-Seed authored rock Prefab instances. */
  readonly entity: Entity;
  /** Number of complete authored rock instances placed for the current Root Seed. */
  readonly placementCount: number;
  /** Exact authored LOD entries registered with the shared category-independent Cell scheduler. */
  readonly exactInstances: readonly SeedWorldExactInstanceSpatialEntry[];

  private readonly _engine: Engine;
  private readonly _instances: readonly RockInstance[];
  private readonly _decorations: readonly (SeedWorldDecorationInstance | SeedWorldStoneInstance)[];
  private readonly _instanceById: ReadonlyMap<string, RockInstance>;
  private readonly _lakeOutcropClusterIds: readonly string[];
  private readonly _debugBaselineById: ReadonlyMap<string, SeedWorldRockDebugBaseline>;
  private _lodTuning: TerrainLodRendererTuning = { enabled: true, distanceScale: 1 };

  /**
   * Resolves Seed-owned rock prototypes and places the shared exact rock array on Hfinal.
   * @param engine Engine owning the instantiated Prefab resources.
   * @param root Runtime root destroyed with the generated Seed world.
   * @param camera Camera driving the authored LODGroup transitions.
   * @param sourceLibrary Accepted authored rock and stone LOD families used by generated worlds.
   * @param fields Final baked terrain and clearance fields.
   * @param decorations Exact shared feature-decoration array already drawn by the 2D plan.
   * @param crossFadeDurationSeconds Seed World surface LOD transition duration.
   * @throws When no accepted Seed rock LOD Prefab is available or an instance cannot be created.
   */
  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    sourceLibrary: AssetAssemblySourceLibrary,
    fields: SeedWorldFields,
    decorations: readonly (SeedWorldDecorationInstance | SeedWorldStoneInstance)[],
    crossFadeDurationSeconds: number
  ) {
    this._engine = engine;
    this.entity = root;
    this._decorations = decorations;
    const placements = alignSeedWorldRockPlacementsToHeightmap(
      fields,
      compileSeedWorldRockPlacements(decorations, fields)
    );
    const instances: RockInstance[] = [];
    try {
      for (const placement of placements) {
        instances.push(
          instantiateAcceptedRock(
            engine,
            root,
            camera,
            resolveAcceptedRockSource(sourceLibrary, placement),
            placement,
            crossFadeDurationSeconds
          )
        );
      }
      this._instances = instances;
      this.placementCount = instances.length;
      this.exactInstances = Object.freeze(
        instances.map((instance) =>
          createSeedWorldExactInstanceLodEntry(
            instance.entity.name,
            instance.category ?? "rock",
            instance.entity,
            instance.lod
          )
        )
      );
      this._instanceById = new Map(instances.map((instance) => [instance.entity.name, instance] as const));
      this._lakeOutcropClusterIds = Object.freeze(
        [
          ...new Set(
            decorations.flatMap((decoration) =>
              decoration.category === "rock" && decoration.sourceKind === "lake-outcrop"
                ? [decoration.visualClusterId]
                : []
            )
          )
        ].sort()
      );
      this._debugBaselineById = new Map(
        instances.map((instance) => {
          const transform = instance.entity.transform;
          return [
            instance.entity.name,
            Object.freeze({
              position: freezeVector3(transform.position.x, transform.position.y, transform.position.z),
              rotationQuaternion: Object.freeze([
                transform.rotationQuaternion.x,
                transform.rotationQuaternion.y,
                transform.rotationQuaternion.z,
                transform.rotationQuaternion.w
              ] as const),
              scale: freezeVector3(transform.scale.x, transform.scale.y, transform.scale.z)
            })
          ] as const;
        })
      );
      this.update();
    } catch (error) {
      root.destroy();
      throw error;
    }
  }

  /** Advances every authored rock LOD and its cross-fade state. */
  update(): void {
    const timeSeconds = this._engine.time.elapsedTime;
    for (let index = 0; index < this._instances.length; index++) {
      this._instances[index]!.lod.updateRenderers(timeSeconds);
    }
  }

  /** Whether current-Seed authored rock Prefab instances participate in the Scene. */
  get visible(): boolean {
    return this.entity.isActive;
  }

  /**
   * Changes current-Seed rock visibility.
   * @param visible Whether current-Seed rock Prefab instances should participate in the Scene.
   * @returns Nothing.
   */
  setVisible(visible: boolean): void {
    this.entity.isActive = visible;
  }

  /** Returns every current Lake outcrop and its live local transform for console tuning. */
  getLakeOutcropDebugPairs(): readonly SeedWorldLakeOutcropDebugPair[] {
    return Object.freeze(
      this._lakeOutcropClusterIds.map((clusterId, index) => this._snapshotLakeOutcropDebugPair(clusterId, index))
    );
  }

  /** Applies absolute local transform channels to one Lake outcrop. */
  setLakeOutcropDebugTransform(
    clusterId: string,
    piece: SeedWorldLakeOutcropDebugPiece,
    patch: SeedWorldRockDebugTransformPatch
  ): SeedWorldRockDebugTransform {
    const instance = this._requireLakeOutcropDebugInstance(clusterId, piece);
    const current = snapshotDebugTransform(instance);
    const position = validateDebugVector(patch.position ?? current.position, "position");
    const rotationDegrees = validateDebugVector(patch.rotationDegrees ?? current.rotationDegrees, "rotationDegrees");
    const scale = validatePositiveDebugVector(patch.scale ?? current.scale, "scale");
    instance.entity.transform.setPosition(...position);
    instance.entity.transform.setRotation(...rotationDegrees);
    instance.entity.transform.setScale(...scale);
    return snapshotDebugTransform(instance);
  }

  /** Adds local position/Euler deltas and scale multipliers to one Lake outcrop. */
  adjustLakeOutcropDebugTransform(
    clusterId: string,
    piece: SeedWorldLakeOutcropDebugPiece,
    adjustment: SeedWorldRockDebugTransformAdjustment
  ): SeedWorldRockDebugTransform {
    const instance = this._requireLakeOutcropDebugInstance(clusterId, piece);
    const current = snapshotDebugTransform(instance);
    const positionDelta = validateDebugVector(adjustment.position ?? [0, 0, 0], "position delta");
    const rotationDelta = validateDebugVector(adjustment.rotationDegrees ?? [0, 0, 0], "rotationDegrees delta");
    const scaleMultiplier = validatePositiveDebugVector(adjustment.scaleMultiplier ?? [1, 1, 1], "scaleMultiplier");
    return this.setLakeOutcropDebugTransform(clusterId, piece, {
      position: addDebugVectors(current.position, positionDelta),
      rotationDegrees: addDebugVectors(current.rotationDegrees, rotationDelta),
      scale: multiplyDebugVectors(current.scale, scaleMultiplier)
    });
  }

  /** Restores the Lake outcrop to the generated transform captured at runtime creation. */
  resetLakeOutcropDebugTransform(
    clusterId: string,
    piece?: SeedWorldLakeOutcropDebugPiece
  ): SeedWorldLakeOutcropDebugPair {
    const pieces: readonly SeedWorldLakeOutcropDebugPiece[] = piece === undefined ? [0] : [piece];
    for (const selectedPiece of pieces) {
      const instance = this._requireLakeOutcropDebugInstance(clusterId, selectedPiece);
      const baseline = this._debugBaselineById.get(instance.entity.name);
      if (!baseline) throw new Error(`Seed World rock debug baseline is missing "${instance.entity.name}"`);
      instance.entity.transform.setPosition(...baseline.position);
      instance.entity.transform.setRotationQuaternion(...baseline.rotationQuaternion);
      instance.entity.transform.setScale(...baseline.scale);
    }
    return this._snapshotLakeOutcropDebugPair(clusterId, this._lakeOutcropClusterIds.indexOf(clusterId));
  }

  private _snapshotLakeOutcropDebugPair(clusterId: string, index: number): SeedWorldLakeOutcropDebugPair {
    if (index < 0) throw new RangeError(`Unknown Seed World Lake outcrop cluster "${clusterId}"`);
    return Object.freeze({
      index,
      clusterId,
      rock: snapshotDebugTransform(this._requireLakeOutcropDebugInstance(clusterId, 0))
    });
  }

  private _requireLakeOutcropDebugInstance(clusterId: string, piece: SeedWorldLakeOutcropDebugPiece): RockInstance {
    if (!this._lakeOutcropClusterIds.includes(clusterId)) {
      throw new RangeError(`Unknown Seed World Lake outcrop cluster "${clusterId}"`);
    }
    const ordinal = piece === 0 || piece === "rock" ? 0 : undefined;
    if (ordinal === undefined) throw new RangeError(`Unknown Seed World Lake outcrop piece "${String(piece)}"`);
    const id = `${clusterId}:piece-${ordinal}`;
    const instance = this._instanceById.get(id);
    if (!instance) throw new Error(`Seed World Lake outcrop debug instance is missing "${id}"`);
    return instance;
  }

  /**
   * Applies one runtime-only LOD policy to every current-Seed authored rock instance.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    for (const instance of this._instances) instance.lod.setTuning(tuning);
    this._lodTuning = { ...tuning };
  }

  /** Re-fits affected authored rocks to the current Heightmap while preserving XZ, scale, and yaw intent. */
  applyAuthoringHeightPatch(fields: SeedWorldFields, bounds: SeedWorldRuntimeBounds): void {
    const directlyAffectedIds = new Set(
      this._decorations
        .filter((decoration) => {
          const geometry = resolveSeedWorldRockContactGeometry(decoration.prototypeFamily);
          const dependencyRadiusMetres = resolveSeedWorldRockHeightDependencyRadiusMetres(
            fields,
            decoration.scale,
            geometry
          );
          return seedWorldHorizontalHeightDependencyIntersects(
            decoration.normalizedPosition,
            fields.sizeMetres,
            dependencyRadiusMetres,
            bounds
          );
        })
        .map((decoration) => decoration.id)
    );
    const affectedLakeClusters = new Set<string>();
    for (const decoration of this._decorations) {
      if (
        directlyAffectedIds.has(decoration.id) &&
        decoration.category === "rock" &&
        decoration.sourceKind === "lake-outcrop"
      ) {
        affectedLakeClusters.add(decoration.visualClusterId);
      }
    }
    const affectedDecorations = this._decorations.filter((decoration) => {
      if (directlyAffectedIds.has(decoration.id)) return true;
      return (
        decoration.category === "rock" &&
        decoration.sourceKind === "lake-outcrop" &&
        affectedLakeClusters.has(decoration.visualClusterId)
      );
    });
    const placements = alignSeedWorldRockPlacementsToHeightmap(
      fields,
      compileSeedWorldRockPlacements(affectedDecorations, fields)
    );
    for (const placement of placements) {
      const instance = this._instanceById.get(placement.id);
      if (!instance) throw new Error(`Seed World rock runtime is missing instance "${placement.id}"`);
      instance.entity.transform.setPosition(...placement.position);
      instance.entity.transform.setRotationQuaternion(...placement.rotationQuaternion);
      instance.entity.transform.setScale(...placement.scale);
    }
  }

  /**
   * Returns the current-Seed rock LOD policy.
   * @returns Detached mesh-LOD enablement and projected-distance multiplier.
   */
  getLodTuning(): TerrainLodRendererTuning {
    return { ...this._lodTuning };
  }

  /** Releases all generated rock Prefab instances. */
  destroy(): void {
    for (const instance of this._instances) instance.lod.disable();
    this.entity.destroy();
  }
}

function resolveAcceptedRockSource(
  sourceLibrary: AssetAssemblySourceLibrary,
  placement: SeedWorldRockPlacement
): AtomicAssemblySource {
  const family = placement.category === "stone" ? sourceLibrary.stoneFamily : sourceLibrary.featureRockFamily;
  const source = family?.variants.find((candidate) => candidate.id.includes(`/${placement.prototypeFamily}/`));
  if (!source) throw new Error(`Seed World accepted rock source is missing "${placement.prototypeFamily}"`);
  return source;
}

function instantiateAcceptedRock(
  engine: Engine,
  parent: Entity,
  camera: Camera,
  source: AtomicAssemblySource,
  placement: SeedWorldAlignedRockPlacement,
  crossFadeDurationSeconds: number
): RockInstance {
  if (!source.lodGroup || source.lods.length !== source.lodGroup.screenRelativeTransitionHeights.length) {
    throw new Error(`Seed World accepted rock source "${source.id}" has invalid authored LOD metadata`);
  }
  const entity = parent.createChild(placement.id);
  try {
    for (const atom of source.lods) {
      const lodEntity = atom.prefab.instantiate();
      if (!lodEntity) throw new Error(`Seed World rock "${placement.id}" could not instantiate ${atom.label}`);
      entity.addChild(lodEntity);
    }
    entity.transform.setPosition(...placement.position);
    entity.transform.setRotationQuaternion(...placement.rotationQuaternion);
    entity.transform.setScale(...placement.scale);
    const lod = new TerrainLodGroupRendererRuntime(
      entity,
      camera,
      createAtomicRockLodGroup(source, placement.category),
      // Avoid rock cross-fade flicker while preserving authored LOD selection.
      0
    );
    bindSeedWorldRockToonMaterial(engine, entity, false);
    lod.snapToCurrentLod(0);
    return { category: placement.category, entity, lod };
  } catch (error) {
    entity.destroy();
    throw error;
  }
}

function createAtomicRockLodGroup(
  source: AtomicAssemblySource,
  category: SeedWorldRockPlacement["category"]
): AtomicLodGroup {
  const profile = source.lodGroup!;
  const transitionHeights = resolveSeedWorldRockRuntimeTransitionHeights(
    profile.screenRelativeTransitionHeights,
    category
  );
  return {
    fadeMode: "CrossFade",
    animateCrossFading: true,
    localReferencePoint: [...profile.localReferencePoint],
    size: profile.size,
    lods: source.lods.map((atom, lodIndex) => ({
      screenRelativeTransitionHeight: transitionHeights[lodIndex],
      fadeTransitionWidth: 0,
      renderers: [{ ...atom.renderer, entityPath: [lodIndex, ...atom.renderer.entityPath] }]
    }))
  };
}

/**
 * Keeps authored large-rock LOD thresholds while extending only ordinary stones' terminal visibility.
 * Human-scale OBB debris uses the same sparse surface-detail policy as mushrooms and small stones;
 * otherwise its authored terminal threshold culls a shoe-sized stone before ROAM can see it.
 */
export function resolveSeedWorldRockRuntimeTransitionHeights(
  authoredHeights: readonly number[],
  category: SeedWorldRockPlacement["category"]
): readonly number[] {
  return category === "stone"
    ? resolveSeedWorldSurfaceDetailTransitionHeights(authoredHeights)
    : Object.freeze([...authoredHeights]);
}

function snapshotDebugTransform(instance: RockInstance): SeedWorldRockDebugTransform {
  const transform = instance.entity.transform;
  return Object.freeze({
    id: instance.entity.name,
    position: freezeVector3(transform.position.x, transform.position.y, transform.position.z),
    rotationDegrees: freezeVector3(transform.rotation.x, transform.rotation.y, transform.rotation.z),
    scale: freezeVector3(transform.scale.x, transform.scale.y, transform.scale.z)
  });
}

function validateDebugVector(value: DebugVector3, label: string): DebugVector3 {
  if (value.length !== 3 || value.some((component) => !Number.isFinite(component))) {
    throw new RangeError(`Seed World rock debug ${label} requires three finite numbers`);
  }
  return freezeVector3(value[0], value[1], value[2]);
}

function validatePositiveDebugVector(value: DebugVector3, label: string): DebugVector3 {
  const vector = validateDebugVector(value, label);
  if (vector.some((component) => component <= 0)) {
    throw new RangeError(`Seed World rock debug ${label} requires three positive numbers`);
  }
  return vector;
}

function addDebugVectors(left: DebugVector3, right: DebugVector3): DebugVector3 {
  return freezeVector3(left[0] + right[0], left[1] + right[1], left[2] + right[2]);
}

function multiplyDebugVectors(left: DebugVector3, right: DebugVector3): DebugVector3 {
  return freezeVector3(left[0] * right[0], left[1] * right[1], left[2] * right[2]);
}

function freezeVector3(x: number, y: number, z: number): DebugVector3 {
  return Object.freeze([x, y, z] as const);
}
