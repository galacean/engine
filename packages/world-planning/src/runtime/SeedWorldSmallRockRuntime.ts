import { Camera, type Engine, Entity } from "@galacean/engine";
import type { AtomicAssemblySource } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import {
  TerrainLodGroupRendererRuntime,
  type TerrainLodRendererTuning
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import type { TerrainProjectResolvedGeometry } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import type { SeedWorldSmallRockInstance } from "../world/SeedWorldDecorations.ts";
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
  compileSeedWorldSmallRockPlacements,
  resolveSeedWorldSurfaceAlignmentHeightDependencyRadiusMetres,
  type SeedWorldSmallRockPlacement
} from "./SeedWorldRockPlacements.ts";
import { resolveSeedWorldSurfaceDetailTransitionHeights } from "../world/SeedWorldRuntimeLodProfile.ts";
import { bindSeedWorldRockToonMaterial } from "./SeedWorldRockAssemblyRuntime.ts";

type ResolvedLodGroup = Extract<TerrainProjectResolvedGeometry, { kind: "lod-group" }>["lodGroup"];

interface SmallRockInstance {
  readonly entity: Entity;
  readonly lod: TerrainLodGroupRendererRuntime;
}

/** Runtime owner for exact shared small-stone instances backed by the Asset Assembly catalog. */
export class SeedWorldSmallRockRuntime {
  /** Number of shared small-stone instances instantiated without density multiplication. */
  readonly placementCount: number;
  /** Fraction of authored LOD0 height below the terrain-contact pivot before rotation. */
  readonly authoredBurialFraction: number;
  /** Exact authored LOD entries registered with the shared category-independent Cell scheduler. */
  readonly exactInstances: readonly SeedWorldExactInstanceSpatialEntry[];

  private readonly _engine: Engine;
  private readonly _root: Entity;
  private readonly _instances: readonly SmallRockInstance[];
  private readonly _decorations: readonly SeedWorldSmallRockInstance[];
  private readonly _instanceById: ReadonlyMap<string, SmallRockInstance>;
  private _lodTuning: TerrainLodRendererTuning = { enabled: true, distanceScale: 1 };

  /**
   * Instantiates exact Worker-owned small stones and applies their authored two-level LODGroup.
   * @param engine Engine owning the generated Prefab instances.
   * @param root Runtime root destroyed with the generated Seed world.
   * @param camera Camera driving authored LOD selection and cross-fade.
   * @param source Accepted neutral four-pebble atom.
   * @param fields Final Hfinal field used only to add Y and surface-normal alignment.
   * @param decorations Exact small-stone instances from the same Worker result as the surface intent.
   * @param crossFadeDurationSeconds Seed World surface LOD transition duration.
   * @throws When the authored source, transforms, Prefabs, or LOD bindings violate their contracts.
   */
  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    source: AtomicAssemblySource,
    fields: SeedWorldFields,
    decorations: readonly SeedWorldSmallRockInstance[],
    crossFadeDurationSeconds: number
  ) {
    validateSmallRockSource(source);
    this._engine = engine;
    this._root = root;
    this._decorations = decorations;
    const bounds = source.lods[0].renderer.mesh.bounds;
    this.authoredBurialFraction = -bounds.min.y / (bounds.max.y - bounds.min.y);
    const placements = compileSeedWorldSmallRockPlacements(decorations, fields);
    const instances: SmallRockInstance[] = [];
    try {
      for (const placement of placements) {
        instances.push(
          instantiateSmallRock(
            engine,
            root,
            camera,
            source,
            createSmallRockLodGroup(source),
            placement,
            crossFadeDurationSeconds
          )
        );
      }
      this._instances = instances;
      this.placementCount = instances.length;
      this.exactInstances = Object.freeze(
        instances.map((instance) =>
          createSeedWorldExactInstanceLodEntry(instance.entity.name, "small-rock", instance.entity, instance.lod)
        )
      );
      this._instanceById = new Map(instances.map((instance) => [instance.entity.name, instance] as const));
      this.update();
    } catch (error) {
      root.destroy();
      throw error;
    }
  }

  /** Advances every authored small-stone LODGroup and animated cross-fade. */
  update(): void {
    const timeSeconds = this._engine.time.elapsedTime;
    for (let index = 0; index < this._instances.length; index++) {
      this._instances[index]!.lod.updateRenderers(timeSeconds);
    }
  }

  /**
   * Applies one runtime-only LOD policy to every current-Seed small-stone instance.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   * @throws {RangeError} When the distance multiplier is not finite and positive.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    for (const instance of this._instances) instance.lod.setTuning(tuning);
    this._lodTuning = { ...tuning };
  }

  /** Regrounds affected exact small stones from the current Heightmap without changing semantic transforms. */
  applyAuthoringHeightPatch(fields: SeedWorldFields, bounds: SeedWorldRuntimeBounds): void {
    const dependencyRadiusMetres = resolveSeedWorldSurfaceAlignmentHeightDependencyRadiusMetres(fields);
    const affectedDecorations = this._decorations.filter((decoration) =>
      seedWorldHorizontalHeightDependencyIntersects(
        decoration.normalizedPosition,
        fields.sizeMetres,
        dependencyRadiusMetres,
        bounds
      )
    );
    const placements = compileSeedWorldSmallRockPlacements(affectedDecorations, fields);
    for (const placement of placements) {
      const instance = this._instanceById.get(placement.id);
      if (!instance) throw new Error(`Seed World small-rock runtime is missing instance "${placement.id}"`);
      instance.entity.transform.setPosition(...placement.position);
      instance.entity.transform.setRotationQuaternion(...placement.rotationQuaternion);
      instance.entity.transform.setScale(...placement.scale);
    }
  }

  /**
   * Returns the current small-stone LOD policy.
   * @returns Detached mesh-LOD enablement and projected-distance multiplier.
   */
  getLodTuning(): TerrainLodRendererTuning {
    return { ...this._lodTuning };
  }

  /** Releases all generated small-stone Prefab instances. */
  destroy(): void {
    for (const instance of this._instances) instance.lod.disable();
    this._root.destroy();
  }
}

function validateSmallRockSource(source: AtomicAssemblySource): void {
  const profile = source.lodGroup;
  if (
    !source.id.includes("/stones/") ||
    source.lods.length !== 2 ||
    !profile ||
    profile.screenRelativeTransitionHeights.length !== source.lods.length
  ) {
    throw new Error("Seed World requires the accepted authored four-pebble LOD source");
  }
  const bounds = source.lods[0].renderer.mesh.bounds;
  if (!(bounds.min.y < 0 && bounds.max.y > 0)) {
    throw new Error("Seed World debris requires an authored terrain-contact pivot inside LOD0 bounds");
  }
}

function createSmallRockLodGroup(source: AtomicAssemblySource): ResolvedLodGroup {
  const profile = source.lodGroup!;
  const transitionHeights = resolveSeedWorldSmallRockTransitionHeights(profile.screenRelativeTransitionHeights);
  return {
    fadeMode: "CrossFade",
    animateCrossFading: true,
    localReferencePoint: [...profile.localReferencePoint],
    size: profile.size,
    lods: source.lods.map((atom, lodIndex) => ({
      screenRelativeTransitionHeight: transitionHeights[lodIndex],
      fadeTransitionWidth: 0,
      renderers: [
        {
          ...atom.renderer,
          entityPath: [lodIndex, ...atom.renderer.entityPath]
        }
      ]
    }))
  };
}

/**
 * Keeps the authored mesh transition while extending only the lowest-detail terminal visibility range.
 * @param authoredHeights Two authored screen-relative thresholds ordered from LOD0 to LOD1.
 * @returns Detached thresholds whose final culling threshold is four times farther away.
 * @throws {RangeError} When the small-stone profile does not contain exactly two authored thresholds.
 */
export function resolveSeedWorldSmallRockTransitionHeights(
  authoredHeights: readonly number[]
): readonly [lod0: number, lod1: number] {
  return resolveSeedWorldSurfaceDetailTransitionHeights(authoredHeights);
}

function instantiateSmallRock(
  engine: Engine,
  parent: Entity,
  camera: Camera,
  source: AtomicAssemblySource,
  geometry: ResolvedLodGroup,
  placement: SeedWorldSmallRockPlacement,
  crossFadeDurationSeconds: number
): SmallRockInstance {
  const entity = parent.createChild(placement.id);
  try {
    for (const atom of source.lods) {
      const lodEntity = atom.prefab.instantiate();
      if (!lodEntity) throw new Error(`Seed World small rock "${placement.id}" could not instantiate ${atom.label}`);
      entity.addChild(lodEntity);
    }
    entity.transform.setPosition(...placement.position);
    entity.transform.setRotationQuaternion(...placement.rotationQuaternion);
    entity.transform.setScale(...placement.scale);
    // Avoid rock cross-fade flicker while preserving authored LOD selection.
    const lod = new TerrainLodGroupRendererRuntime(entity, camera, geometry, 0);
    bindSeedWorldRockToonMaterial(engine, entity, false);
    lod.snapToCurrentLod(0);
    return { entity, lod };
  } catch (error) {
    entity.destroy();
    throw error;
  }
}
