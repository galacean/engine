import type { Camera, Engine, Entity } from "@galacean/engine";
import type { AssetAssemblySourceLibrary } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import type { TerrainLodRendererTuning } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import type {
  SeedWorldDecorationInstance,
  SeedWorldPresentationDecorationInstance,
  SeedWorldLotusInstance,
  SeedWorldMushroomInstance,
  SeedWorldSmallRockInstance,
  SeedWorldStoneInstance
} from "./SeedWorldDecorations";
import type { SeedWorldExactInstance, SeedWorldExactInstanceSpatialEntry } from "./SeedWorldExactInstanceCellRuntime";
import type { SeedWorldTerrainOcclusionReadPort } from "../runtime/SeedWorldTerrainOcclusionCuller.ts";
import type { SeedWorldFields } from "../runtime/SeedWorldFields.ts";
import type { SeedWorldRuntimeBounds } from "./SeedWorldRuntimeBounds";
import { SeedWorldLotusRuntime } from "./SeedWorldLotusRuntime";
import { SeedWorldMushroomRuntime } from "./SeedWorldMushroomRuntime";
import { SeedWorldRockRuntime } from "../runtime/SeedWorldRockRuntime.ts";
import { SeedWorldSmallRockRuntime } from "../runtime/SeedWorldSmallRockRuntime.ts";

/** Runtime contract shared by every configured exact generated Prefab source. */
export interface SeedWorldExactPrefabRuntime {
  /** Number of exact instances materialized by this source. */
  readonly placementCount: number;
  /** Stable exact instances exposed to Authoring, independent from their render path. */
  readonly exactInstances: readonly SeedWorldExactInstance[];
  /**
   * Applies the shared runtime-only LOD policy.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   */
  setLodTuning?(tuning: TerrainLodRendererTuning): void;
  /**
   * Regrounds terrain-anchored instances affected by one local height transaction.
   * Water-surface or otherwise non-terrain-anchored families may omit this method.
   */
  applyAuthoringHeightPatch?(fields: SeedWorldFields, bounds: SeedWorldRuntimeBounds): void;
  /** Releases all entities and LOD resources owned by this source. */
  destroy(): void;
}

/** Immutable dependencies available to one exact-Prefab runtime profile factory. */
export interface SeedWorldExactPrefabRuntimeContext {
  /** Engine owning generated runtime resources. */
  readonly engine: Engine;
  /** Shared parent for exact generated Prefab categories. */
  readonly parent: Entity;
  /** Camera driving spatial range projection and authored LOD selection. */
  readonly camera: Camera;
  /** Asset Assembly families available to exact Prefab profiles. */
  readonly sourceLibrary: AssetAssemblySourceLibrary;
  /** Final immutable generated world fields. */
  readonly fields: SeedWorldFields;
  /** Exact Worker-owned feature-decoration array. */
  readonly decorations: readonly SeedWorldPresentationDecorationInstance[];
  /** Shared authored LOD cross-fade duration. */
  readonly crossFadeDurationSeconds: number;
  /** Shared terrain horizon, queried only by the main Camera view. */
  readonly terrainOcclusion?: SeedWorldTerrainOcclusionReadPort;
}

/** One configuration-only registration for an exact generated Prefab runtime family. */
export interface SeedWorldExactPrefabRuntimeProfile {
  /** Stable profile key used for diagnostics and lookup. */
  readonly key: string;
  /** Child entity label created below the shared Decorations root. */
  readonly entityName: string;
  /** Omit unused authored families when the active world supplies procedural replacements. */
  readonly enabled?: (context: SeedWorldExactPrefabRuntimeContext) => boolean;
  /**
   * Creates one runtime family from shared world dependencies.
   * @param context Immutable generated-world dependencies.
   * @param root Profile-owned child entity created from `entityName`.
   * @returns Runtime contributing exact spatial entries to the common scheduler.
   * @throws When source assets or exact placements violate their contracts.
   */
  readonly create: (context: SeedWorldExactPrefabRuntimeContext, root: Entity) => SeedWorldExactPrefabRuntime;
}

/** Default exact-Prefab profiles sharing Authoring identity and lifecycle ownership. */
export const SEED_WORLD_EXACT_PREFAB_RUNTIME_PROFILES: readonly SeedWorldExactPrefabRuntimeProfile[] = Object.freeze([
  {
    key: "rock",
    enabled: (context) =>
      Boolean(context.sourceLibrary.featureRockFamily) ||
      context.decorations.some((decoration) => decoration.category === "rock"),
    entityName: "Feature Rocks",
    create: (context, root) =>
      new SeedWorldRockRuntime(
        context.engine,
        root,
        context.camera,
        context.sourceLibrary,
        context.fields,
        context.decorations.filter(
          (decoration): decoration is SeedWorldDecorationInstance => decoration.category === "rock"
        ),
        context.crossFadeDurationSeconds
      )
  },
  {
    key: "stone",
    enabled: (context) =>
      Boolean(context.sourceLibrary.stoneFamily) ||
      context.decorations.some((decoration) => decoration.category === "stone"),
    entityName: "Stones",
    create: (context, root) =>
      new SeedWorldRockRuntime(
        context.engine,
        root,
        context.camera,
        context.sourceLibrary,
        context.fields,
        context.decorations.filter(
          (decoration): decoration is SeedWorldStoneInstance => decoration.category === "stone"
        ),
        context.crossFadeDurationSeconds
      )
  },
  {
    key: "small-rock",
    enabled: (context) =>
      Boolean(context.sourceLibrary.debrisSource) ||
      context.decorations.some((decoration) => decoration.category === "small-rock"),
    entityName: "Small Rocks",
    create: (context, root) => {
      if (!context.sourceLibrary.debrisSource)
        throw new Error("Small-rock Prefab runtime requires authored debris sources");
      return new SeedWorldSmallRockRuntime(
        context.engine,
        root,
        context.camera,
        context.sourceLibrary.debrisSource,
        context.fields,
        context.decorations.filter(
          (decoration): decoration is SeedWorldSmallRockInstance => decoration.category === "small-rock"
        ),
        context.crossFadeDurationSeconds
      );
    }
  },
  {
    key: "mushroom",
    entityName: "Mushrooms",
    create: (context, root) =>
      new SeedWorldMushroomRuntime(
        context.engine,
        root,
        context.camera,
        context.sourceLibrary.mushroom,
        context.fields,
        context.decorations.filter(
          (decoration): decoration is SeedWorldMushroomInstance => decoration.category === "mushroom"
        ),
        context.crossFadeDurationSeconds
      )
  },
  {
    key: "lotus",
    entityName: "Lake Shore Lotus",
    create: (context, root) =>
      new SeedWorldLotusRuntime(
        root,
        context.camera,
        context.sourceLibrary.lotusFamily,
        context.fields,
        context.decorations.filter(
          (decoration): decoration is SeedWorldLotusInstance => decoration.category === "lotus"
        ),
        context.terrainOcclusion
      )
  }
]);

/** Owns exact-Prefab families and separates Authoring identity from ordinary Renderer scheduling. */
export class SeedWorldExactPrefabRuntimeRegistry {
  /** Stable exact instances aggregated from every configured profile. */
  readonly exactInstances: readonly SeedWorldExactInstance[];
  /** Ordinary Renderer entries advanced by the shared spatial scheduler. */
  readonly exactSpatialEntries: readonly SeedWorldExactInstanceSpatialEntry[];

  private readonly _runtimes: ReadonlyMap<string, SeedWorldExactPrefabRuntime>;

  /**
   * Creates every configured exact-Prefab family and rolls back prior families on failure.
   * @param context Immutable generated-world dependencies shared by all profiles.
   * @param profiles Configuration registrations to materialize.
   * @throws When profile keys repeat or a configured runtime fails to initialize.
   */
  constructor(
    context: SeedWorldExactPrefabRuntimeContext,
    profiles: readonly SeedWorldExactPrefabRuntimeProfile[] = SEED_WORLD_EXACT_PREFAB_RUNTIME_PROFILES
  ) {
    const runtimes = new Map<string, SeedWorldExactPrefabRuntime>();
    try {
      for (const profile of profiles) {
        if (runtimes.has(profile.key)) {
          throw new Error(`Seed World exact Prefab profile key "${profile.key}" is duplicated`);
        }
        if (profile.enabled && !profile.enabled(context)) continue;
        runtimes.set(profile.key, profile.create(context, context.parent.createChild(profile.entityName)));
      }
    } catch (error) {
      for (const runtime of [...runtimes.values()].reverse()) runtime.destroy();
      throw error;
    }
    this._runtimes = runtimes;
    this.exactInstances = Object.freeze([...runtimes.values()].flatMap((runtime) => [...runtime.exactInstances]));
    this.exactSpatialEntries = Object.freeze(
      this.exactInstances.filter((entry): entry is SeedWorldExactInstanceSpatialEntry => "update" in entry.controller)
    );
  }

  /** Returns an active family, or undefined when its resources were intentionally omitted. */
  get(key: string): SeedWorldExactPrefabRuntime | undefined {
    return this._runtimes.get(key);
  }

  /**
   * Returns one configured runtime family.
   * @param key Stable profile key.
   * @returns Runtime created by the matching profile.
   * @throws When no configured profile owns the key.
   */
  require(key: string): SeedWorldExactPrefabRuntime {
    const runtime = this._runtimes.get(key);
    if (!runtime) throw new Error(`Seed World exact Prefab runtime "${key}" is not registered`);
    return runtime;
  }

  /**
   * Applies one LOD policy to every registered runtime family.
   * @param tuning Mesh-LOD enablement and projected-distance multiplier.
   * @returns Nothing.
   */
  setLodTuning(tuning: TerrainLodRendererTuning): void {
    for (const runtime of this._runtimes.values()) runtime.setLodTuning?.(tuning);
  }

  /** Regrounds every terrain-anchored exact Prefab family from the current canonical height fields. */
  applyAuthoringHeightPatch(fields: SeedWorldFields, bounds: SeedWorldRuntimeBounds): void {
    for (const runtime of this._runtimes.values()) runtime.applyAuthoringHeightPatch?.(fields, bounds);
  }

  /** Releases every registered runtime in reverse configuration order. */
  destroy(): void {
    for (const runtime of [...this._runtimes.values()].reverse()) runtime.destroy();
  }
}
