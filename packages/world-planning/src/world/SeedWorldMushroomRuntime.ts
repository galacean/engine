import { Camera, type Engine, Entity } from "@galacean/engine";
import type { AtomicAssemblySource } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import {
  TerrainLodGroupRendererRuntime,
  type TerrainLodRendererTuning
} from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import type { TerrainProjectResolvedGeometry } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import type { SeedWorldMushroomInstance } from "./SeedWorldDecorations";
import type { SeedWorldFields } from "../runtime/SeedWorldFields.ts";
import {
  compileSeedWorldMushroomPlacements,
  resolveSeedWorldSurfaceAlignmentHeightDependencyRadiusMetres,
  type SeedWorldMushroomPlacement
} from "../runtime/SeedWorldRockPlacements.ts";
import { seedWorldHorizontalHeightDependencyIntersects, type SeedWorldRuntimeBounds } from "./SeedWorldRuntimeBounds";
import { resolveSeedWorldSurfaceDetailTransitionHeights } from "./SeedWorldRuntimeLodProfile";
import {
  createSeedWorldExactInstanceLodEntry,
  type SeedWorldExactInstanceSpatialEntry
} from "./SeedWorldExactInstanceCellRuntime";

type ResolvedLodGroup = Extract<TerrainProjectResolvedGeometry, { kind: "lod-group" }>["lodGroup"];

interface MushroomRuntimeInstance {
  readonly entity: Entity;
  readonly lod: TerrainLodGroupRendererRuntime;
}

/** Runtime owner for exact Worker-compiled mushroom clusters. */
export class SeedWorldMushroomRuntime {
  /** Number of exact mushrooms instantiated without runtime scattering. */
  readonly placementCount: number;
  /** Exact authored LOD entries registered with the shared category-independent Cell scheduler. */
  readonly exactInstances: readonly SeedWorldExactInstanceSpatialEntry[];

  private readonly _engine: Engine;
  private readonly _root: Entity;
  private readonly _instances: readonly MushroomRuntimeInstance[];
  private readonly _decorations: readonly SeedWorldMushroomInstance[];
  private readonly _instanceById: ReadonlyMap<string, MushroomRuntimeInstance>;
  private _lodTuning: TerrainLodRendererTuning = { enabled: true, distanceScale: 1 };

  /**
   * Instantiates accepted mushroom LODs at the exact shared XZ transforms.
   * @param engine Engine owning the generated Prefabs.
   * @param root Runtime root destroyed with the generated Seed world.
   * @param camera Camera driving authored LOD selection.
   * @param source Accepted authored mushroom source.
   * @param fields Final baked height authority used only for contact Y and normal.
   * @param decorations Exact Worker-owned mushroom instances.
   * @param crossFadeDurationSeconds Authored surface LOD transition duration.
   * @throws When the source LOD contract or a Prefab instance is invalid.
   */
  constructor(
    engine: Engine,
    root: Entity,
    camera: Camera,
    source: AtomicAssemblySource,
    fields: SeedWorldFields,
    decorations: readonly SeedWorldMushroomInstance[],
    crossFadeDurationSeconds: number
  ) {
    if (!source.lodGroup || source.lods.length !== source.lodGroup.screenRelativeTransitionHeights.length) {
      throw new Error("Seed World requires the accepted authored mushroom LOD source");
    }
    this._engine = engine;
    this._root = root;
    this._decorations = decorations;
    const placements = compileSeedWorldMushroomPlacements(decorations, fields);
    const geometry = createMushroomLodGroup(source);
    const instances: MushroomRuntimeInstance[] = [];
    try {
      for (const placement of placements) {
        const entity = root.createChild(placement.id);
        for (const atom of source.lods) {
          const lodEntity = atom.prefab.instantiate();
          if (!lodEntity) throw new Error(`Seed World mushroom "${placement.id}" could not instantiate ${atom.label}`);
          entity.addChild(lodEntity);
        }
        entity.transform.setPosition(...placement.position);
        entity.transform.setRotationQuaternion(...placement.rotationQuaternion);
        entity.transform.setScale(...placement.scale);
        const lod = new TerrainLodGroupRendererRuntime(entity, camera, geometry, crossFadeDurationSeconds);
        lod.snapToCurrentLod(0);
        instances.push({ entity, lod });
      }
      this._instances = instances;
      this.placementCount = instances.length;
      this.exactInstances = Object.freeze(
        instances.map((instance) =>
          createSeedWorldExactInstanceLodEntry(instance.entity.name, "mushroom", instance.entity, instance.lod)
        )
      );
      this._instanceById = new Map(instances.map((instance) => [instance.entity.name, instance] as const));
      this.update();
    } catch (error) {
      root.destroy();
      throw error;
    }
  }

  /** Advances authored mushroom LOD transitions. */
  update(): void {
    const timeSeconds = this._engine.time.elapsedTime;
    for (let index = 0; index < this._instances.length; index++) {
      this._instances[index]!.lod.updateRenderers(timeSeconds);
    }
  }

  /**
   * Applies one runtime-only LOD policy to every exact mushroom.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    for (const instance of this._instances) instance.lod.setTuning(tuning);
    this._lodTuning = { ...tuning };
  }

  /** Regrounds affected exact mushrooms from the current Heightmap while preserving their authored XZ and scale. */
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
    const placements = compileSeedWorldMushroomPlacements(affectedDecorations, fields);
    for (const placement of placements) {
      const instance = this._instanceById.get(placement.id);
      if (!instance) throw new Error(`Seed World mushroom runtime is missing instance "${placement.id}"`);
      applyMushroomPlacement(instance.entity, placement);
    }
  }

  /** @returns Detached mesh-LOD enablement and projected-distance multiplier. */
  getLodTuning(): TerrainLodRendererTuning {
    return { ...this._lodTuning };
  }

  /** Releases all exact mushroom instances. */
  destroy(): void {
    for (const instance of this._instances) instance.lod.disable();
    this._root.destroy();
  }
}

function createMushroomLodGroup(source: AtomicAssemblySource): ResolvedLodGroup {
  const profile = source.lodGroup!;
  const transitionHeights = resolveSeedWorldMushroomTransitionHeights(profile.screenRelativeTransitionHeights);
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

function applyMushroomPlacement(entity: Entity, placement: SeedWorldMushroomPlacement): void {
  entity.transform.setPosition(...placement.position);
  entity.transform.setRotationQuaternion(...placement.rotationQuaternion);
  entity.transform.setScale(...placement.scale);
}

/**
 * Keeps the authored mushroom mesh transition while matching debris terminal visibility.
 * @param authoredHeights Two authored screen-relative thresholds ordered from LOD0 to LOD1.
 * @returns Detached thresholds whose final culling distance matches sparse ground debris.
 * @throws {RangeError} When the mushroom profile does not contain exactly two authored thresholds.
 */
export function resolveSeedWorldMushroomTransitionHeights(
  authoredHeights: readonly number[]
): readonly [lod0: number, lod1: number] {
  return resolveSeedWorldSurfaceDetailTransitionHeights(authoredHeights);
}
