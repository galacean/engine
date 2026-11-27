import {
  planningAnimalSnapshotId,
  type AnimalWorldBounds,
  type PlanningAnimalWorldChange
} from "@galacean/engine-world-planning/spatial/runtime/PlanningAnimalWorldChange";
import type {
  PlanningAnimalAuthoring,
  PlanningAnimalAddition,
  PlanningAnimalOverride
} from "./PlanningAnimalAuthoring.ts";
import { FireflyPopulation } from "@galacean/engine-animals/gameplay/animal/FireflyPopulation";
import { FireflyPresenter } from "@galacean/engine-animals/gameplay/animal/FireflyPresenter";
import type { Camera } from "@galacean/engine";
import { querySeedAnimalCatalog, seedAnimalSpeciesId } from "./PlanningAnimalCatalog.ts";
import { templateAnimalPopulation } from "@galacean/engine-world-planning/spatial/AnimalPopulationComponent";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";
import { PlanningAnimalSurfaceKind, type PlanningAnimalSurfaceData } from "./PlanningAnimalSurface.ts";
import type { AnimalInstanceDocument } from "@galacean/engine-animals/gameplay/animal/AnimalInstanceDocument";
import {
  BaseMaterial,
  BoundingBox,
  BoundingFrustum,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  RenderFace,
  SkinnedMeshRenderer,
  type Entity,
  type Material,
  type Renderer
} from "@galacean/engine";
import {
  CUTE_ZOO_TOON_APPEARANCE,
  createCuteZooToonMaterial
} from "@galacean/engine-animals/gameplay/animal/CuteZooToonMaterial";
import {
  AnimalAssetLibrary,
  type ResolvedAnimalAsset
} from "@galacean/engine-animals/gameplay/animal/AnimalAssetLibrary";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import {
  animalAnimationLodConfig,
  animalAnimationLodStride,
  projectAnimalSize,
  selectAnimalLod,
  type AnimalLodLevel
} from "@galacean/engine-animals/gameplay/animal/AnimalLod";
import { animalCollisionRadius } from "@galacean/engine-animals/gameplay/animal/AnimalAssetCatalog";
import { AnimalSystem } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import { GroundAnimalCrowd, type GroundAnimalBody } from "@galacean/engine-animals/gameplay/animal/GroundAnimalCrowd";
import { AnimalQuery } from "@galacean/engine-animals/gameplay/animal/AnimalRegistration";
import type {
  AnimalTargetQuery,
  AnimalWorldEvent
} from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import {
  planAnimalPopulation,
  validateAnimalPopulationConfig,
  type AnimalPopulationConfig,
  type AnimalPopulationAppearance,
  type AnimalPopulationInstance,
  type AnimalPopulationPlan
} from "@galacean/engine-animals/gameplay/animal/AnimalPopulation";
import type {
  SeedWorldAnimalSpawn,
  SeedWorldAnimalSpawnReceipt,
  SeedWorldAnimalDelete,
  SeedWorldAnimalDeleteReceipt,
  SeedWorldAnimalUpdate,
  SeedWorldAnimalUpdateReceipt,
  SeedWorldAnimalService,
  SeedWorldAnimalQuery,
  SeedWorldAnimalCommand,
  SeedWorldAnimalDescription,
  SeedWorldAnimalReceipt
} from "../../../../agent-adapter/ports/SeedWorldAnimalService.ts";
import { seedAnimalCatalog, seedAnimalRegistrations } from "./PlanningAnimalContent.ts";
import appearanceWeights from "../../planning-data/animal-appearances.json";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import {
  PlanningAnimalHabitat,
  liveAnimalRouteQuery,
  insideAnimalHome,
  type AnimalHome,
  chooseAnimalBirthHabitat,
  sampleAnimalSpawnDisk,
  type PlanningAnimalDynamicObstacle,
  type PlanningAnimalNavigation,
  type PlanningAnimalMedium,
  type PlanningAnimalOccupant
} from "./PlanningAnimalHabitat.ts";
import type { PlanningAnimalPanelSnapshot } from "./PlanningAnimalPanel.ts";
import { PLANNING_ANIMAL_TARGETS, preparePlanningAnimalCommand } from "./PlanningAnimalCommands.ts";
import { animalInteractionConfig, isAnimalApproach } from "@galacean/engine-animals/gameplay/animal/AnimalInteraction";
import type { PlanningAnimalFood, PlanningAnimalFoodTarget } from "./PlanningAnimalFood.ts";
import { planningAnimalCanEat } from "./PlanningAnimalForaging.ts";
import { planningAnimalFoodPathClear } from "./PlanningAnimalFoodClearance.ts";
import { planningAnimalCartApproach, type PlanningAnimalCartApproach } from "./PlanningAnimalCartApproach.ts";

const DISTANT_ANIMAL_UPDATE_SECONDS = 5;
const ANIMAL_FIXED_STEP_SECONDS = 1 / 30;
const CUTE_ZOO_PLAIN_APPEARANCE = Object.freeze({ ...CUTE_ZOO_TOON_APPEARANCE, outline: false });
const OUTLINE_ZERO_DISTANCE = CUTE_ZOO_TOON_APPEARANCE.outlineFadeEnd ?? 0;
const OUTLINE_OFF_HYSTERESIS_METERS = 0.25;

/** Optional scene interactions; the observer camera remains independent of the physical player. */
export interface PlanningAnimalInteractions {
  /** Explicit additions share the host project database; generated population remains recipe-derived. */
  authoring?: PlanningAnimalAuthoring;
  player?: () => Readonly<{ x: number; y?: number; z: number }> | undefined;
  food?: PlanningAnimalFood;
  /** Read-only environment input; the population owns simulation and presentation. */
  fireflies?: { camera: Camera; activity(): number };
}

interface FoodMemory {
  farm?: PlanningAnimalFoodTarget;
  feeding?: PlanningAnimalFoodTarget;
  approaching?: PlanningAnimalFoodTarget;
  startedAt?: number;
  pending: boolean;
  cart?: PlanningAnimalCartApproach;
}

interface Actor {
  birth: AnimalPopulationInstance;
  home?: AnimalHome;
  asset: ResolvedAnimalAsset;
  footprint: GroundAnimalBody;
  animal?: ConfiguredAnimal;
  state: "unloaded" | "loading" | "loaded" | "failed";
  wanted: boolean;
  admitted: boolean;
  supportValid: boolean;
  wakeDistance: number;
  wakeTravel: number;
  x: number;
  z: number;
  error?: string;
  nextApproach?: number;
  food?: FoodMemory;
  animLodLevel?: AnimalLodLevel;
}
interface Population {
  root: Entity;
  system: AnimalSystem;
  fireflies?: { population: FireflyPopulation; presenter: FireflyPresenter; key: string };
  crowd: GroundAnimalCrowd;
  habitat: PlanningAnimalHabitat;
  navigation: PlanningAnimalNavigation;
  layout: AnimalPopulationPlan;
  actors: Actor[];
  active: Set<Actor>;
  coarse: Set<Actor>;
  queue: Set<Actor>;
  plan: IslandPlan;
  config: AnimalPopulationConfig;
  outlineEnabled: boolean;
  observerX: number;
  observerZ: number;
  abort: AbortController;
  spawns: Map<string, { key: string; receipt: SeedWorldAnimalSpawnReceipt }>;
  deletes?: Map<string, { id: string; receipt: SeedWorldAnimalDeleteReceipt }>;
  updates?: Map<string, { key: string; receipt: SeedWorldAnimalUpdateReceipt }>;
}

/** Demand-loaded Seed population. Geometry owns placement; this adapter owns admission and streaming. */
export class PlanningAnimalRuntime implements SeedWorldAnimalService {
  readonly library: AnimalAssetLibrary;
  private population?: Population;
  private disposed = false;
  private enabled = false;
  private errors: string[] = [];
  private readonly pending = new Set<Promise<void>>();
  private readonly toonMaterials = new Map<Material, { outlined: Material; plain: Material }>();
  private getToonMaterialPair(source: PBRMaterial): { outlined: Material; plain: Material } {
    let pair = this.toonMaterials.get(source);
    if (!pair) {
      pair = {
        outlined: createCuteZooToonMaterial(source, CUTE_ZOO_TOON_APPEARANCE),
        plain: createCuteZooToonMaterial(source, CUTE_ZOO_PLAIN_APPEARANCE)
      };
      this.toonMaterials.set(source, pair);
    }
    return pair;
  }
  private readonly resolveMaterial = (source: Material): Material => {
    if (!(source instanceof PBRMaterial)) return source;
    return this.getToonMaterialPair(source).outlined;
  };
  private readonly resolvePlainMaterial = (source: Material): Material => {
    if (!(source instanceof PBRMaterial)) return source;
    return this.getToonMaterialPair(source).plain;
  };
  private spawnTail: Promise<unknown> = Promise.resolve();
  private requestId = 0;
  private updateMilliseconds = 0;
  private maximumUpdateMilliseconds = 0;
  private visibilityPositionChecks = 0;
  private resourceRequests = 0;
  private placementMilliseconds = 0;
  private habitatBuildMilliseconds = 0;
  private placementAttempts = 0;
  private readonly updateSamples = new Float64Array(600);
  private readonly frameSamples = new Float64Array(600);
  private sampleCount = 0;
  private sampleCursor = 0;
  private interaction = animalInteractionConfig();
  private animationLod = animalAnimationLodConfig();
  private previousPlayer?: { x: number; z: number };
  private simulationAccumulator = 0;
  private readonly dynamicObstacles = new Map<string, readonly PlanningAnimalDynamicObstacle[]>();

  /** Updates or removes one dynamic obstacle group (e.g. a streamed companion-stone cell) on the live habitat. */
  setDynamicObstacles(groupKey: string, obstacles?: readonly PlanningAnimalDynamicObstacle[]): void {
    if (obstacles?.length) this.dynamicObstacles.set(groupKey, obstacles);
    else this.dynamicObstacles.delete(groupKey);
    this.population?.habitat.setDynamicSolids(groupKey, obstacles);
  }

  /** Clears all dynamic obstacle groups (called before switching to a new world vegetation runtime). */
  clearDynamicObstacles(): void {
    this.dynamicObstacles.clear();
    this.population?.habitat.clearDynamicSolids();
  }

  private applyDynamicObstacles(habitat: PlanningAnimalHabitat): void {
    for (const [groupKey, obstacles] of this.dynamicObstacles) {
      habitat.setDynamicSolids(groupKey, obstacles);
    }
  }

  /** Construct only after the host explicitly enables animals; model requests start on visible demand. */
  constructor(
    private readonly parent: Entity,
    private readonly observer: () => Readonly<{ x: number; z: number; y?: number }>,
    private readonly interactions: PlanningAnimalInteractions = {}
  ) {
    this.library = new AnimalAssetLibrary(
      parent.engine.resourceManager,
      seedAnimalCatalog,
      seedAnimalRegistrations,
      import.meta.url
    );
  }

  /** Prepare identities and logical behavior without awaiting or requesting any model. */
  synchronize(
    plan: IslandPlan,
    config: AnimalPopulationConfig,
    navigation: PlanningAnimalNavigation,
    options: {
      preservePopulation?: boolean;
      surface?: PlanningAnimalSurfaceData;
      change?: PlanningAnimalWorldChange;
    } = {}
  ): void {
    validateAnimalPopulationConfig(config);
    this.interaction = animalInteractionConfig(config.interaction);
    const templateWildlife = templateAnimalPopulation(plan.parameters.worldTemplate?.id);
    this.animationLod = animalAnimationLodConfig({
      ...templateWildlife?.animationLod,
      ...config.animationLod
    });
    if (this.population) {
      for (const actor of this.population.actors) {
        actor.animLodLevel = undefined;
        if (!this.animationLod.enabled) actor.animal?.setAnimationLod(1, actor.birth.seed & 0xff);
      }
    }
    void this.interactions.food?.refresh();
    if (this.disposed) return;
    this.enabled = config.enabled;
    if (!config.enabled) {
      this.releasePopulation();
      this.errors = [];
      return;
    }
    const templateHomeRadius = templateWildlife?.homeRadius;
    config = this.library.resolvePopulationConfig({
      ...config,
      homeRadius:
        config.homeRadius !== undefined && templateHomeRadius !== undefined
          ? Math.min(config.homeRadius, templateHomeRadius)
          : (config.homeRadius ?? templateHomeRadius),
      ...(config.distribution
        ? {
            distribution: {
              ...config.distribution,
              minX: 0,
              minZ: 0,
              maxX: plan.parameters.width,
              maxZ: plan.parameters.depth
            }
          }
        : {}),
      types: config.types.map((type) => ({
        ...type,
        ...(type.appearances === undefined && type.appearanceId === undefined
          ? { appearances: (appearanceWeights as Record<string, AnimalPopulationAppearance[]>)[type.typeId] }
          : {})
      }))
    });
    const current = this.population;
    if (
      current &&
      // The habitat owns a snapshot: even an in-place host spawn update invalidates birth positions.
      current.habitat.origin.x === plan.spawn.x &&
      current.habitat.origin.z === plan.spawn.z &&
      current.plan.parameters.worldTemplate?.id === plan.parameters.worldTemplate?.id &&
      ((current.plan === plan && current.navigation === navigation) ||
        (options.preservePopulation &&
          current.plan.parameters.seed === plan.parameters.seed &&
          current.plan.spawn.x === plan.spawn.x &&
          current.plan.spawn.z === plan.spawn.z)) &&
      populationKey(current.config) === populationKey(config)
    ) {
      // Content edits retain actors and animation clocks, but replace their collision/support view.
      // All movement and target callbacks read these fields rather than capturing the old habitat.
      if (
        current.plan !== plan ||
        current.navigation !== navigation ||
        current.habitat.surface.data !== options.surface
      ) {
        const change =
          options.change?.previousSnapshot === planningAnimalSnapshotId(current.plan) ? options.change : undefined;
        const regions = change
          ? [...change.terrain, ...change.water, ...change.obstacles, ...change.surface]
          : undefined;
        if (!regions || regions.length) {
          current.habitat = new PlanningAnimalHabitat(plan, navigation, config, options.surface);
          this.applyDynamicObstacles(current.habitat);
          this.revalidateSupport(
            current,
            change ? [...change.terrain, ...change.water, ...change.obstacles] : undefined
          );
          if (!change || change.terrain.length || change.water.length) current.fireflies?.population.refreshWorld();
          this.refreshObserver(current, true);
          const supportRegions = change ? [...change.terrain, ...change.water, ...change.obstacles] : undefined;
          for (const actor of current.actors) {
            actor.animal?.refreshWorld(supportRegions);
            if (change?.surface.length) actor.animal?.refreshWorld(change.surface, false);
          }
        }
        current.plan = plan;
        current.navigation = navigation;
      }
      this.restoreAdditions(current);
      const activationChanged = current.config.activationDistance !== config.activationDistance;
      current.config = structuredClone(config);
      this.synchronizeFireflies(current);
      if (activationChanged) {
        this.sampleCount = this.sampleCursor = 0;
        this.refreshObserver(current, true);
      }
      return;
    }
    this.releasePopulation();
    this.sampleCount = this.sampleCursor = 0;
    let candidate: Population | undefined;
    try {
      const placementStart = performance.now();
      const habitat = new PlanningAnimalHabitat(plan, navigation, config, options.surface);
      this.applyDynamicObstacles(habitat);
      this.habitatBuildMilliseconds = performance.now() - placementStart;
      this.placementAttempts = 0;
      const spawnPoints = new Map(config.types.map((type) => [type.typeId, type.spawnPoint]));
      const birthHabitats = new Map<string, ReturnType<typeof chooseAnimalBirthHabitat>>();
      const occupied: PlanningAnimalOccupant[] = [];
      const wildlife = templateAnimalPopulation(plan.parameters.worldTemplate?.id);
      // The sandbar and the adjoining resident clearing define the flock's full shoreline habitat.
      const shoreReach =
        wildlife &&
        wildlife.residentSite.radius +
          Math.hypot(
            wildlife.flock.offsetX - wildlife.residentSite.offsetX,
            wildlife.flock.offsetZ - wildlife.residentSite.offsetZ
          );
      const layout = planAnimalPopulation({
        seed: plan.parameters.seed,
        origin: habitat.origin,
        config,
        sampleCandidate: ({ id, typeId, appearanceId, position, attempt, random }) => {
          this.placementAttempts++;
          let preference = birthHabitats.get(id);
          if (!preference) {
            preference = chooseAnimalBirthHabitat(
              this.library.resolve({ typeId, appearanceId }).profile,
              random,
              spawnPoints.get(typeId)?.weight
            );
            if (wildlife?.flock.typeId === typeId && wildlife.flock.groundAtBirth) preference.medium = "ground";
            birthHabitats.set(id, preference);
          }
          // Resident animals share the authored clearing. Land, water, slope and crowd checks still apply to each candidate.
          const localSite = wildlife?.models.has(typeId) && spawnPoints.get(typeId);
          if (localSite && localSite.center) {
            let reach = localSite.radius;
            if (shoreReach && typeId === wildlife?.flock.typeId && attempt > 0) {
              // Open another body's worth of area after a rejected candidate, up to the adjacent shore.
              const diameter = 2 * animalCollisionRadius(this.library.resolve({ typeId, appearanceId }).config);
              reach = Math.min(Math.max(reach, shoreReach), Math.hypot(reach, diameter * Math.sqrt(attempt)));
            } else if (preference.medium === "ground" && attempt > 0) {
              reach = Math.min(localSite.radius * 2, localSite.radius + Math.sqrt(attempt));
            }
            return sampleAnimalSpawnDisk(localSite.center, reach, random);
          }
          // Proximity is a soft preference: a bounded local budget cannot prevent valid global births.
          if (preference.nearSpawn && attempt < 32) {
            const sp = spawnPoints.get(typeId)!;
            return habitat.spawnPointCandidate(
              position,
              preference.medium,
              preference.shore,
              sp.radius,
              random,
              sp.center
            );
          }
          return habitat.spawnCandidate(position, preference.medium, preference.shore, random);
        },
        samplePosition: ({ id, typeId, appearanceId, position: point, attempt }) => {
          const asset = this.library.resolve({ typeId, appearanceId });
          const radius = animalCollisionRadius(asset.config);
          const height = (asset.config.bounds.max[1] - asset.config.bounds.min[1]) * asset.config.scale;
          const medium = birthHabitats.get(id)!.medium;
          // Leave turning room on both sides of the bank, including swimmers starting near shore.
          // Late attempts still admit a physically supported birth in a narrow clearing.
          const clearance = wildlife && medium !== "air" && attempt < 256 ? radius * 1.5 : radius;
          const position = habitat.samplePosition(point, clearance, occupied, height, medium);
          if (position) occupied.push({ ...position, radius: clearance });
          return position && { ...position, medium };
        }
      });
      this.placementMilliseconds = performance.now() - placementStart;
      const root = this.parent.createChild("Seed animals");
      const system = new AnimalSystem(12, 0.8, 192),
        crowd = new GroundAnimalCrowd();
      system.addMotionStep((dt) => crowd.advance(dt));
      candidate = {
        root,
        system,
        crowd,
        habitat,
        navigation,
        layout,
        actors: [],
        active: new Set(),
        coarse: new Set(),
        queue: new Set(),
        plan,
        config: structuredClone(config),
        outlineEnabled: WORLD_TEMPLATE_ART[plan.parameters.worldTemplate?.id ?? ""]?.animalOutline ?? true,
        observerX: NaN,
        observerZ: NaN,
        abort: new AbortController(),
        spawns: new Map(),
        deletes: new Map(),
        updates: new Map()
      };
      const seed = plan.parameters.seed;
      const removals = this.interactions.authoring?.readRemovals?.(seed) ?? [];
      const removedIds = new Set(removals.map((entry) => entry.id));
      for (const entry of removals) {
        candidate.deletes!.set(entry.requestId, {
          id: entry.id,
          receipt: { requestId: entry.requestId, id: entry.id, status: "accepted" }
        });
      }
      const overrides = this.interactions.authoring?.readOverrides?.(seed);
      for (const birth of layout.animals) {
        if (removedIds.has(birth.id)) continue;
        const applied = this.applyOverrideToBirth(birth, overrides?.get(birth.id));
        this.addActor(candidate, applied.birth, applied.scale);
      }
      this.restoreAdditions(candidate);
      this.synchronizeFireflies(candidate);
      this.population = candidate;
      this.errors = layout.diagnostics.map((d) => d.message);
      this.refreshObserver(candidate, true);
    } catch (error) {
      if (candidate) destroyPopulation(candidate);
      this.population = undefined;
      this.errors = [String(error)];
    }
  }

  catalog = querySeedAnimalCatalog;

  /** Add one registered identity without rebuilding other actors or downloading inactive alternatives. */
  spawn(input: SeedWorldAnimalSpawn): Promise<SeedWorldAnimalSpawnReceipt> {
    const request = structuredClone(input);
    const seed = this.population?.plan.parameters.seed;
    const task = this.spawnTail.then(() => this.spawnAndSave(request, seed));
    this.spawnTail = task.catch(() => undefined);
    return task;
  }

  private async spawnAndSave(
    input: SeedWorldAnimalSpawn,
    requestedSeed: number | undefined
  ): Promise<SeedWorldAnimalSpawnReceipt> {
    const p = this.population;
    const reject = (reason: string): SeedWorldAnimalSpawnReceipt => ({
      requestId: input.requestId,
      status: "rejected",
      reason
    });
    if (!p || this.disposed) return reject(this.enabled && !this.disposed ? "not_ready" : "disabled");
    if (requestedSeed === undefined) return reject("not_ready");
    if (p.plan.parameters.seed !== requestedSeed) return reject("world_changed");
    if (!this.interactions.authoring) return reject("persistence_unavailable");
    if (
      typeof input.typeId !== "string" ||
      !input.typeId.trim() ||
      (input.appearanceId !== undefined && (typeof input.appearanceId !== "string" || !input.appearanceId.trim())) ||
      typeof input.requestId !== "string" ||
      !input.requestId.trim() ||
      new TextEncoder().encode(input.requestId).length > 128 ||
      /[\u0000-\u001f]/.test(input.requestId) ||
      (input.position && ![input.position.x, input.position.z].every(Number.isFinite))
    )
      return reject("invalid_request");
    // Canonical property order makes object construction order irrelevant to idempotent retries.
    const key = JSON.stringify([
      input.typeId,
      input.appearanceId ?? null,
      input.position?.x ?? null,
      input.position?.z ?? null
    ]);
    const previous = p.spawns.get(input.requestId);
    if (previous) return previous.key === key ? { ...previous.receipt } : reject("request_id_conflict");
    let receipt: SeedWorldAnimalSpawnReceipt;
    try {
      // Use the same initialization weights; omission still means weight 1 per appearance.
      const type = p.config.types.find((type) => type.typeId === input.typeId);
      const config = this.library.resolvePopulationConfig({
        ...p.config,
        distribution: undefined, // Runtime summons stay local to the requested position, never scatter globally.
        spawnRadius: Math.min(12, p.config.roamRadius),
        types: [
          {
            typeId: input.typeId,
            min: 1,
            max: 1,
            ...(input.appearanceId
              ? { appearanceId: input.appearanceId }
              : {
                  appearances:
                    type?.appearances ??
                    (appearanceWeights as Record<string, AnimalPopulationAppearance[]>)[input.typeId]
                })
          }
        ]
      });
      const occupied = p.actors.map((a) => ({
        x: a.animal?.position.x ?? a.x,
        z: a.animal?.position.z ?? a.z,
        radius: a.footprint.radius
      }));
      const layout = planAnimalPopulation({
        seed: `${p.plan.parameters.seed}:spawn:${input.requestId}`,
        origin: input.position ?? this.observer(),
        config,
        maxPlacementAttempts: input.position ? 1 : 64,
        samplePosition: ({ typeId, appearanceId, position, random }) => {
          const asset = this.library.resolve({ typeId, appearanceId });
          const medium = asset.profile.preferredMedium ?? "ground";
          const point =
            input.position ??
            p.habitat.spawnCandidate(
              position,
              medium,
              asset.profile.habitatPreferences?.some((p) => p.habitat === "waterside") ?? false,
              random
            );
          if (!point) return;
          return p.habitat.samplePosition(
            point,
            animalCollisionRadius(asset.config),
            occupied,
            (asset.config.bounds.max[1] - asset.config.bounds.min[1]) * asset.config.scale,
            medium
          );
        }
      });
      let birth = layout.animals[0];
      if (!birth) {
        // Player/LLM summon overrides natural habitat avoidance: fall back to the exact
        // requested (or nearby viewer) spot as long as it lies on valid physical terrain.
        const fallbackTarget = input.position ?? this.observer();
        const width = p.plan.parameters.width;
        const depth = p.plan.parameters.depth;
        const fx = Math.max(2, Math.min(width - 2, fallbackTarget.x));
        const fz = Math.max(2, Math.min(depth - 2, fallbackTarget.z));
        const groundY = p.navigation.sampleHeightInterpolated(fx, fz);
        if (groundY !== undefined && Number.isFinite(groundY)) {
          const waterY = p.navigation.sampleWaterHeight?.(fx, fz);
          const resolvedAppearance =
            input.appearanceId ??
            type?.appearances?.[0]?.appearanceId ??
            (appearanceWeights as Record<string, AnimalPopulationAppearance[]>)[input.typeId]?.[0]?.appearanceId;
          if (resolvedAppearance) {
            const fallbackAsset = this.library.resolve({ typeId: input.typeId, appearanceId: resolvedAppearance });
            const inWater = waterY !== undefined && Number.isFinite(waterY) && waterY > groundY + 0.05;
            const preferred = fallbackAsset.profile.preferredMedium ?? "ground";
            const medium = inWater ? (preferred === "water" ? "water" : preferred) : "ground";
            const y = inWater ? waterY! : groundY;
            const seedKey = `${p.plan.parameters.seed}:spawn:${input.requestId}`;
            let hash = 2166136261;
            for (let i = 0; i < seedKey.length; i++) {
              hash ^= seedKey.charCodeAt(i);
              hash = Math.imul(hash, 16777619);
            }
            birth = {
              id: "",
              typeId: input.typeId,
              appearanceId: resolvedAppearance,
              position: { x: fx, y, z: fz },
              heading: ((hash >>> 0) % 360) * (Math.PI / 180),
              seed: hash >>> 0 || 1,
              ...(medium ? { medium } : {})
            };
          }
        }
      }
      if (!birth) receipt = reject("no_safe_spawn_position");
      else {
        birth.id = `animal:authored:${crypto.randomUUID()}`;
        const asset = this.library.resolve(birth);
        const addition: PlanningAnimalAddition = {
          requestId: input.requestId,
          requestKey: key,
          behaviorSeed: birth.seed,
          ...(birth.medium ? { medium: birth.medium } : {}),
          instance: {
            version: 1,
            id: birth.id,
            typeId: birth.typeId,
            appearanceId: asset.reference.appearanceId,
            position: [birth.position.x, birth.position.y, birth.position.z],
            heading: birth.heading,
            scale: asset.config.scale
          }
        };
        try {
          await this.interactions.authoring.save(p.plan.parameters.seed, addition);
        } catch {
          return reject("persistence_failed");
        }
        // A world switch during the database write keeps the addition in its original seed.
        if (this.population?.plan.parameters.seed === requestedSeed && !this.disposed)
          this.restoreAdditions(this.population);
        receipt = {
          requestId: input.requestId,
          status: "accepted",
          id: birth.id,
          typeId: birth.typeId,
          appearanceId: asset.reference.appearanceId
        };
      }
    } catch {
      receipt = reject("unknown_type_or_appearance");
    }
    p.spawns.set(input.requestId, { key, receipt });
    return { ...receipt };
  }

  /** Remove one existing animal (generated or spawned) persistently without rebuilding other actors. */
  deleteAnimal(input: SeedWorldAnimalDelete): Promise<SeedWorldAnimalDeleteReceipt> {
    const request = structuredClone(input), seed = this.population?.plan.parameters.seed;
    const task = this.spawnTail.then(() => this.deleteAndSave(request, seed));
    this.spawnTail = task.catch(() => undefined);
    return task;
  }

  /** Update scale, appearance, position or heading on one existing animal persistently without rebuilding others. */
  updateAnimal(input: SeedWorldAnimalUpdate): Promise<SeedWorldAnimalUpdateReceipt> {
    const request = structuredClone(input), seed = this.population?.plan.parameters.seed;
    const task = this.spawnTail.then(() => this.updateAndSave(request, seed));
    this.spawnTail = task.catch(() => undefined);
    return task;
  }

  private guardAnimalMutation(p: Population | undefined, requestedSeed: number | undefined, id: string, requestId: string): string | undefined {
    if (!p || this.disposed) return this.enabled && !this.disposed ? "not_ready" : "disabled";
    if (requestedSeed === undefined) return "not_ready";
    if (p.plan.parameters.seed !== requestedSeed) return "world_changed";
    if (!validAuthoringIdentity(id) || !validAuthoringIdentity(requestId)) return "invalid_request";
    return undefined;
  }

  private async deleteAndSave(input: SeedWorldAnimalDelete, requestedSeed: number | undefined): Promise<SeedWorldAnimalDeleteReceipt> {
    const p = this.population;
    const reject = (reason: string): SeedWorldAnimalDeleteReceipt => ({ id: input.id, requestId: input.requestId, status: "rejected", reason });
    const denied = this.guardAnimalMutation(p, requestedSeed, input.id, input.requestId);
    if (denied) return reject(denied);
    if (!this.interactions.authoring?.remove) return reject("persistence_unavailable");
    const deletes = (p!.deletes ??= new Map());
    const saved = this.interactions.authoring.readRemovals?.(requestedSeed!).find((e) => e.requestId === input.requestId);
    if (saved && !deletes.has(input.requestId))
      deletes.set(input.requestId, { id: saved.id, receipt: { id: saved.id, requestId: saved.requestId, status: "accepted" } });
    const previous = deletes.get(input.requestId);
    if (previous) return previous.id === input.id ? { ...previous.receipt } : reject("request_id_conflict");
    if (!p!.actors.some((a) => a.birth.id === input.id)) return reject("not_found");
    try {
      await this.interactions.authoring.remove(requestedSeed!, input.id, input.requestId);
    } catch {
      return reject("persistence_failed");
    }
    const receipt: SeedWorldAnimalDeleteReceipt = { id: input.id, requestId: input.requestId, status: "accepted" };
    const live = this.population;
    const target = live && live.plan.parameters.seed === requestedSeed && !this.disposed ? live : p!;
    (target.deletes ??= new Map()).set(input.requestId, { id: input.id, receipt });
    if (target === live) this.removeActor(target, input.id);
    return { ...receipt };
  }

  private async updateAndSave(input: SeedWorldAnimalUpdate, requestedSeed: number | undefined): Promise<SeedWorldAnimalUpdateReceipt> {
    const p = this.population;
    const reject = (reason: string): SeedWorldAnimalUpdateReceipt => ({ id: input.id, requestId: input.requestId, status: "rejected", reason });
    const denied = this.guardAnimalMutation(p, requestedSeed, input.id, input.requestId);
    if (denied) return reject(denied);
    if (!this.interactions.authoring?.update) return reject("persistence_unavailable");
    if (
      (input.appearanceId !== undefined && !validAuthoringIdentity(input.appearanceId)) ||
      (input.scale !== undefined && (!Number.isFinite(input.scale) || input.scale <= 0 || input.scale > 20)) ||
      (input.heading !== undefined && !Number.isFinite(input.heading)) ||
      (input.position !== undefined && ![input.position.x, input.position.z].every(Number.isFinite)) ||
      (input.appearanceId === undefined && input.scale === undefined && input.position === undefined && input.heading === undefined)
    )
      return reject("invalid_request");
    const key = JSON.stringify([input.id, input.appearanceId ?? null, input.scale ?? null, input.position?.x ?? null, input.position?.z ?? null, input.heading ?? null]);
    const updates = (p!.updates ??= new Map());
    const previous = updates.get(input.requestId);
    if (previous) return previous.key === key ? { ...previous.receipt } : reject("request_id_conflict");
    const actor = p!.actors.find((a) => a.birth.id === input.id);
    if (!actor) return reject("not_found");
    const targetAppearanceId = input.appearanceId ?? actor.asset.reference.appearanceId;
    let resolvedAsset: ResolvedAnimalAsset;
    try {
      resolvedAsset = this.library.resolve({ typeId: actor.birth.typeId, appearanceId: targetAppearanceId });
    } catch {
      return reject("unknown_appearance");
    }
    const targetScale = input.scale ?? actor.animal?.scale ?? actor.asset.config.scale;
    const nextRadius = animalCollisionRadius({ ...resolvedAsset.config, scale: targetScale });
    const nextHeight = (resolvedAsset.config.bounds.max[1] - resolvedAsset.config.bounds.min[1]) * targetScale;
    const curPos = actor.animal?.position ?? actor.birth.position;
    const targetHeading = input.heading ?? actor.animal?.direction ?? actor.birth.heading;
    let targetX = curPos.x, targetY = curPos.y, targetZ = curPos.z;
    let targetMedium = actor.animal?.medium ?? actor.birth.medium ?? resolvedAsset.profile.preferredMedium ?? "ground";
    if (input.position) {
      const width = p!.plan.parameters.width ?? Infinity, depth = p!.plan.parameters.depth ?? Infinity;
      if (input.position.x < 0 || input.position.x > width || input.position.z < 0 || input.position.z > depth) return reject("invalid_position");
      const sampleHeight = p!.navigation?.sampleHeightInterpolated;
      const groundY = typeof sampleHeight === "function" ? sampleHeight.call(p!.navigation, input.position.x, input.position.z) : undefined;
      if ((groundY !== undefined && !Number.isFinite(groundY)) || (typeof sampleHeight === "function" && groundY === undefined)) return reject("invalid_position");
      const waterY = p!.navigation?.sampleWaterHeight?.(input.position.x, input.position.z);
      const inWater = groundY !== undefined && waterY !== undefined && Number.isFinite(waterY) && waterY > groundY + 0.05;
      const preferred = resolvedAsset.profile.preferredMedium ?? "ground";
      targetMedium = inWater && preferred === "water" ? "water" : "ground";
      targetX = input.position.x; targetZ = input.position.z;
      targetY = groundY !== undefined ? (inWater && targetMedium === "water" ? waterY! : groundY) : curPos.y;
      const canTraverse = p!.habitat?.canTraverse;
      if (typeof canTraverse === "function" && !canTraverse.call(p!.habitat, { x: targetX, z: targetZ }, { x: targetX, z: targetZ }, nextRadius, nextHeight, targetMedium))
        return reject("position_blocked");
    }
    for (const other of p!.actors) {
      if (other === actor) continue;
      if ((other.animal?.medium ?? other.birth.medium ?? other.asset.profile.preferredMedium ?? "ground") !== targetMedium) continue;
      const ox = other.animal?.position.x ?? other.x, oz = other.animal?.position.z ?? other.z;
      if (Math.hypot(ox - targetX, oz - targetZ) < nextRadius + other.footprint.radius + 0.001)
        return reject(input.position ? "position_blocked" : "scale_blocked");
    }
    const override: PlanningAnimalOverride = {
      requestId: input.requestId,
      requestKey: key,
      ...(input.appearanceId !== undefined ? { appearanceId: targetAppearanceId } : {}),
      ...(input.scale !== undefined ? { scale: targetScale } : {}),
      ...(input.position !== undefined ? { position: [targetX, targetY, targetZ], medium: targetMedium } : {}),
      ...(input.heading !== undefined ? { heading: targetHeading } : {})
    };
    try {
      await this.interactions.authoring.update(requestedSeed!, input.id, override);
    } catch {
      return reject("persistence_failed");
    }
    let finalPosition: readonly [number, number, number] = [targetX, targetY, targetZ];
    const live = this.population;
    const target = live && live.plan.parameters.seed === requestedSeed && !this.disposed ? live : p!;
    if (target === live) {
      const liveActor = target.actors.find((a) => a.birth.id === input.id);
      if (liveActor) {
        this.applyLiveUpdate(target, liveActor, override);
        finalPosition = this.coordinates(liveActor);
      }
    }
    const receipt: SeedWorldAnimalUpdateReceipt = {
      id: input.id, requestId: input.requestId, status: "accepted",
      typeId: actor.birth.typeId, appearanceId: targetAppearanceId, scale: targetScale, position: finalPosition
    };
    (target.updates ??= new Map()).set(input.requestId, { key, receipt });
    return { ...receipt };
  }

  private removeActor(p: Population, id: string): void {
    const index = p.actors.findIndex((actor) => actor.birth.id === id);
    if (index < 0) return;
    const [actor] = p.actors.splice(index, 1);
    p.active?.delete(actor);
    p.coarse?.delete(actor);
    p.queue?.delete(actor);
    if (actor.animal) { actor.animal.dispose(); actor.animal = undefined; }
    else p.crowd?.remove(actor.footprint);
    const i = p.layout?.animals?.findIndex((b) => b.id === id) ?? -1;
    if (i >= 0) p.layout.animals.splice(i, 1);
  }

  private applyOverrideToBirth(birth: AnimalPopulationInstance, override?: PlanningAnimalOverride, baseScale?: number) {
    if (!override) return { birth, scale: baseScale };
    return {
      birth: {
        ...birth,
        ...(override.appearanceId ? { appearanceId: override.appearanceId } : {}),
        ...(override.position ? { position: { x: override.position[0], y: override.position[1], z: override.position[2] } } : {}),
        ...(override.heading !== undefined ? { heading: override.heading } : {}),
        ...(override.medium ? { medium: override.medium } : {})
      },
      scale: override.scale ?? baseScale
    };
  }

  private applyLiveUpdate(p: Population, actor: Actor, override: PlanningAnimalOverride): void {
    const curPos = actor.animal?.position ?? actor.birth.position;
    const tx = override.position ? override.position[0] : curPos.x;
    const ty = override.position ? override.position[1] : curPos.y;
    const tz = override.position ? override.position[2] : curPos.z;
    const targetHeading = override.heading ?? actor.animal?.direction ?? actor.birth.heading;
    const targetScale = override.scale ?? actor.animal?.scale ?? actor.asset.config.scale;
    const targetAppearanceId = override.appearanceId ?? actor.asset.reference.appearanceId;
    const targetMedium = override.medium ?? actor.animal?.medium ?? actor.birth.medium;
    const appearanceChanged = targetAppearanceId !== actor.asset.reference.appearanceId;

    actor.birth = { ...actor.birth, appearanceId: targetAppearanceId, position: { x: tx, y: ty, z: tz }, heading: targetHeading, ...(targetMedium ? { medium: targetMedium } : {}) };
    actor.x = tx; actor.z = tz;
    if (override.position && actor.home) actor.home = { ...actor.home, x: tx, z: tz };
    const resolved = this.library.resolve({ typeId: actor.birth.typeId, appearanceId: targetAppearanceId });
    actor.asset = { ...resolved, config: { ...resolved.config, scale: targetScale } };
    actor.footprint.radius = animalCollisionRadius(actor.asset.config);
    actor.footprint.height = (actor.asset.config.bounds.max[1] - actor.asset.config.bounds.min[1]) * targetScale;
    actor.footprint.bodyLength = (actor.asset.config.bounds.max[2] - actor.asset.config.bounds.min[2]) * targetScale;
    actor.footprint.elevation = ty;
    if (actor.footprint.motion) Object.assign(actor.footprint.motion, { x: tx, z: tz, heading: targetHeading });
    if (targetMedium) actor.footprint.layer = targetMedium;
    actor.wakeDistance = animalWakeDistance(p.config.activationDistance, actor.asset);
    actor.wakeTravel = animalWakeDistance(0, actor.asset);

    if (appearanceChanged) {
      p.active?.delete(actor); p.coarse?.delete(actor); p.queue?.delete(actor);
      if (actor.animal) { actor.animal.dispose(); actor.animal = undefined; } else p.crowd?.remove(actor.footprint);
      actor.state = "unloaded";
      if (p.root && p.crowd) { p.crowd.add(actor.footprint); this.createAnimal(p, actor); }
    } else if (actor.animal) {
      const shrinking = override.scale !== undefined && targetScale < actor.animal.scale;
      if (shrinking) actor.animal.setScale(targetScale);
      if ((override.position || override.heading !== undefined) && actor.animal.relocate([tx, tz], targetHeading))
        actor.animal.resumeBehavior();
      if (override.scale !== undefined && !shrinking) {
        try { actor.animal.setScale(targetScale); }
        catch { if (actor.animal.relocate([tx, tz], targetHeading)) { actor.animal.setScale(targetScale); actor.animal.resumeBehavior(); } }
      }
    } else if (override.position || override.heading !== undefined) {
      p.crowd?.relocate(actor.footprint, tx, tz, targetHeading);
    }
    const layoutEntry = p.layout?.animals?.find((entry) => entry.id === actor.birth.id);
    if (layoutEntry) Object.assign(layoutEntry, actor.birth);
    this.admit(p, actor);
    if (appearanceChanged && p.queue?.has(actor)) this.loadQueued(p);
  }

  private restoreAdditions(p: Population): void {
    const seed = p.plan.parameters.seed;
    const removedIds = new Set((this.interactions.authoring?.readRemovals?.(seed) ?? []).map((e) => e.id));
    const overrides = this.interactions.authoring?.readOverrides?.(seed);
    for (const addition of this.interactions.authoring?.read(seed) ?? []) {
      const instance = addition.instance;
      if (removedIds.has(instance.id)) continue;
      p.spawns.set(addition.requestId, {
        key: addition.requestKey,
        receipt: { requestId: addition.requestId, status: "accepted", id: instance.id, typeId: instance.typeId, appearanceId: instance.appearanceId }
      });
      if (p.actors.some((actor) => actor.birth.id === instance.id)) continue;
      const baseBirth: AnimalPopulationInstance = {
        id: instance.id, typeId: instance.typeId, appearanceId: instance.appearanceId,
        position: { x: instance.position[0], y: instance.position[1], z: instance.position[2] },
        heading: instance.heading, seed: addition.behaviorSeed, ...(addition.medium ? { medium: addition.medium } : {})
      };
      const applied = this.applyOverrideToBirth(baseBirth, overrides?.get(instance.id), instance.scale);
      const actor = this.addActor(p, applied.birth, applied.scale);
      p.layout.animals.push(applied.birth);
      p.layout.requestedCount++;
      this.admit(p, actor);
    }
  }

  private addActor(p: Population, birth: AnimalPopulationInstance, scale?: number): Actor {
    const resolved = this.library.resolve(birth);
    const asset = scale === undefined ? resolved : { ...resolved, config: { ...resolved.config, scale } };
    const footprint: GroundAnimalBody = {
      active: false,
      layer: birth.medium ?? asset.profile.preferredMedium ?? "ground",
      elevation: birth.position.y,
      height: (asset.config.bounds.max[1] - asset.config.bounds.min[1]) * asset.config.scale,
      motion: { x: birth.position.x, z: birth.position.z, heading: birth.heading, speed: 0, angularSpeed: 0 },
      radius: animalCollisionRadius(asset.config),
      bodyLength: (asset.config.bounds.max[2] - asset.config.bounds.min[2]) * asset.config.scale,
      desiredSpeed: 0,
      target: [birth.position.x, birth.position.z],
      arrived: false,
      blocked: false
    };
    const actor: Actor = {
      birth,
      home:
        p.config.homeRadius === undefined
          ? undefined
          : { x: birth.position.x, z: birth.position.z, radius: p.config.homeRadius },
      asset,
      footprint,
      state: "unloaded",
      wanted: false,
      admitted: false,
      supportValid: true,
      wakeDistance: animalWakeDistance(p.config.activationDistance, asset),
      wakeTravel: animalWakeDistance(0, asset),
      x: birth.position.x,
      z: birth.position.z
    };
    p.crowd.add(footprint);
    p.actors.push(actor);
    this.createAnimal(p, actor);
    return actor;
  }

  /**
   * When set during startup (before first-screen reveal), `loadQueued` only dispatches GLB
   * downloads for actors that are actually visible (`wanted`) within the spawn camera frustum,
   * leaving behind-camera and hidden wake-buffer animals queued until post-reveal.
   */
  private startupDeferOffscreenCamera?: Camera;
  private readonly startupFrustumMatrix = new Matrix();
  private readonly startupFrustum = new BoundingFrustum();
  private readonly startupActorBox = new BoundingBox();

  setStartupDeferOffscreenCamera(camera: Camera | undefined): void {
    this.startupDeferOffscreenCamera = camera;
  }

  /** Prepare only actors already admitted at the current observer position, without advancing simulation. */
  async preparePresentation(): Promise<void> {
    const population = this.population;
    if (!population || this.disposed) return;
    this.loadQueued(population);
    await Promise.all([...this.pending]);
  }

  /**
   * Prepare shader warmup renderers and alternate (outlined / plain) toon materials for animal
   * species in the current population. When `includeUnloadedSpecies` is false, only already-loaded
   * spawn animals' alternate materials are collected (zero distant GLB downloads or instantiations);
   * otherwise distant unloaded species are also instantiated under an inactive temporary root.
   */
  async prepareShaderWarmup(
    signal?: AbortSignal,
    options?: { readonly includeUnloadedSpecies?: boolean }
  ): Promise<
    | {
        readonly renderers: readonly Renderer[];
        readonly extraMaterials: ReadonlyMap<Renderer, readonly Material[]>;
        dispose(): void;
      }
    | undefined
  > {
    const population = this.population;
    if (!population || this.disposed || signal?.aborted) return undefined;
    const includeUnloadedSpecies = options?.includeUnloadedSpecies !== false;
    const extraMaterials = new Map<Renderer, Material[]>();
    const coveredTypeIds = new Set<string>();
    const unloadedByTypeId = new Map<string, Actor>();
    for (const actor of population.actors) {
      if (actor.state === "loaded" && actor.animal) {
        coveredTypeIds.add(actor.asset.config.id);
        actor.animal.collectShaderWarmupMaterials(extraMaterials as Map<MeshRenderer, Material[]>);
      } else if (includeUnloadedSpecies && actor.supportValid && !unloadedByTypeId.has(actor.asset.config.id)) {
        unloadedByTypeId.set(actor.asset.config.id, actor);
      }
    }
    const toLoad: Actor[] = [];
    if (includeUnloadedSpecies) {
      for (const [typeId, actor] of unloadedByTypeId) {
        if (!coveredTypeIds.has(typeId)) toLoad.push(actor);
      }
    }
    const renderers: Renderer[] = [];
    const ownedMaterials: Material[] = [];
    let warmupRoot: Entity | undefined;
    if (toLoad.length > 0) {
      const loaded = await Promise.allSettled(
        toLoad.map(async (actor) => ({
          actor,
          asset: await this.library.load(actor.asset.reference, signal)
        }))
      );
      if (this.population !== population || this.disposed || signal?.aborted) return undefined;
      warmupRoot = population.root.createChild("Animal shader warmup");
      warmupRoot.isActive = false;
      for (const item of loaded) {
        if (item.status !== "fulfilled") continue;
        const { actor, asset } = item.value;
        try {
          const model = asset.resource.instantiateSceneRoot();
          warmupRoot.addChild(model);
          const modelRenderers = model.getComponentsIncludeChildren(MeshRenderer, []);
          const config = actor.asset.config;
          for (const renderer of modelRenderers) {
            if (renderer instanceof SkinnedMeshRenderer && renderer.skin) {
              const skin = renderer.skin;
              renderer.skin = null!;
              renderer.skin = skin;
            }
            renderer.castShadows = renderer.receiveShadows = true;
            renderer.getMaterials().forEach((sourceMaterial, index) => {
              if (!sourceMaterial) return;
              const correction = config.materials?.find((entry) => entry.name === sourceMaterial.name);
              let outlined = population.outlineEnabled
                ? this.resolveMaterial(sourceMaterial)
                : this.resolvePlainMaterial(sourceMaterial);
              let plain = this.resolvePlainMaterial(sourceMaterial);
              if (correction) {
                const applyCorrection = (base: Material): Material => {
                  const owned = base.clone() as BaseMaterial;
                  ownedMaterials.push(owned);
                  if (correction.opaque) {
                    owned.isTransparent = false;
                    owned.alphaCutoff = 0;
                  }
                  if (correction.doubleSided !== undefined) {
                    owned.renderFace = correction.doubleSided ? RenderFace.Double : RenderFace.Front;
                  }
                  return owned;
                };
                outlined = applyCorrection(outlined);
                plain = plain === outlined ? outlined : applyCorrection(plain);
              }
              renderer.setMaterial(index, outlined);
              if (plain !== outlined) {
                let list = extraMaterials.get(renderer);
                if (!list) {
                  list = [];
                  extraMaterials.set(renderer, list);
                }
                if (!list.includes(plain)) list.push(plain);
              }
            });
            renderers.push(renderer);
          }
        } catch {
          // Best-effort warmup; authoritative actor loaders surface any real asset failure.
        }
      }
    }
    if (!renderers.length && !extraMaterials.size) {
      if (warmupRoot && !warmupRoot.destroyed) warmupRoot.destroy();
      for (const material of ownedMaterials) if (!material.destroyed) material.destroy();
      return undefined;
    }
    let handleDisposed = false;
    return {
      renderers,
      extraMaterials,
      dispose: () => {
        if (handleDisposed) return;
        handleDisposed = true;
        if (warmupRoot && !warmupRoot.destroyed) warmupRoot.destroy();
        for (const material of ownedMaterials) if (!material.destroyed) material.destroy();
      }
    };
  }

  /** Advance shared logical animals; presentation admission changes precision without resetting behavior. */
  update(seconds: number): void {
    const p = this.population;
    if (!p || this.disposed) return;
    const start = performance.now();
    this.reactToPlayer(p, seconds);
    this.refreshObserver(p);
    const deltaTime = Math.min(Math.max(seconds, 0), 0.1);
    p.fireflies?.population.prepare(deltaTime, this.observer(), this.interactions.fireflies?.activity() ?? 0);
    if (p.active.size || p.coarse.size || (p.fireflies?.population.visibility ?? 0) > 0) {
      // Bound animal simulation to at most one fixed 30Hz step per rendered frame so a slow frame
      // never cascades 2-3x crowd/motion substeps into a 12ms CPU spiral, while retaining up to
      // one sub-step of remainder so 31-59 FPS devices still average a true 30Hz simulation rate.
      this.simulationAccumulator = Math.min(
        this.simulationAccumulator + deltaTime,
        ANIMAL_FIXED_STEP_SECONDS * 2 - 1e-5
      );
      if (this.simulationAccumulator + 1e-6 >= ANIMAL_FIXED_STEP_SECONDS) {
        const stepSeconds = ANIMAL_FIXED_STEP_SECONDS;
        this.simulationAccumulator = Math.max(0, this.simulationAccumulator - stepSeconds);
        p.navigation.beginAnimalUpdate?.();
        try {
          p.system.update(stepSeconds);
          for (const actor of p.coarse) {
            const position = actor.animal!.position;
            if (actor.x === position.x && actor.z === position.z) continue;
            actor.x = position.x;
            actor.z = position.z;
            this.admit(p, actor);
          }
        } finally {
          p.navigation.endAnimalUpdate?.();
        }
        const observer = this.observer();
        const camera =
          this.interactions.fireflies?.camera ??
          (
            this.parent.scene as unknown as {
              _componentsManager?: { _activeCameras?: { _elements?: Camera[] } };
            }
          )?._componentsManager?._activeCameras?._elements?.[0];
        const verticalFov = camera?.fieldOfView ?? 45;
        const orthoSize = camera?.isOrthographic ? camera.orthographicSize : undefined;
        for (const actor of p.active) {
          const position = actor.animal!.position;
          this.updateActorAnimationLod(actor, observer.x, observer.y, observer.z, verticalFov, orthoSize);
          if (position.x !== actor.x || position.z !== actor.z) {
            actor.x = position.x;
            actor.z = position.z;
            this.admit(p, actor);
          }
        }
      }
      if (p.outlineEnabled && OUTLINE_ZERO_DISTANCE > 0 && p.active.size) {
        const observer = this.observer();
        for (const actor of p.active) this.updateActorOutline(actor, observer.x, observer.y, observer.z);
      }
    }
    if (p.fireflies) {
      p.fireflies.population.pack();
      p.fireflies.presenter.update();
    }
    this.loadQueued(p);
    this.updateMilliseconds = performance.now() - start;
    this.maximumUpdateMilliseconds = Math.max(this.maximumUpdateMilliseconds, this.updateMilliseconds);
    this.updateSamples[this.sampleCursor] = this.updateMilliseconds;
    this.frameSamples[this.sampleCursor] = seconds * 1000;
    this.sampleCursor = (this.sampleCursor + 1) % this.updateSamples.length;
    this.sampleCount = Math.min(this.sampleCount + 1, this.updateSamples.length);
  }

  private reactToPlayer(p: Population, seconds: number): void {
    const player = this.interactions.player?.();
    if (!player) {
      this.previousPlayer = undefined;
      return;
    }
    const previous = this.previousPlayer;
    if (previous && (player.x !== previous.x || player.z !== previous.z)) {
      for (const actor of p.active) {
        const animal = actor.animal;
        if (
          !animal ||
          animal.medium === "air" ||
          p.system.time < (actor.nextApproach ?? 0) ||
          (player.y !== undefined && Math.abs(player.y - animal.position.y) > 3) ||
          !isAnimalApproach(animal.position, player, previous, seconds, this.interaction)
        )
          continue;
        if (
          animal.behavior.notify({ id: `approach:${++this.requestId}`, type: "approach", source: [player.x, player.z] })
        )
          actor.nextApproach = p.system.time + this.interaction.approachCooldown;
      }
    }
    if (previous) {
      previous.x = player.x;
      previous.z = player.z;
    } else this.previousPlayer = { x: player.x, z: player.z };
  }

  /** Pick a nearby visible envelope along a normalized world ray, rejecting occluded or distant hits. */
  shoo(
    ray: Readonly<{
      origin: Readonly<{ x: number; y: number; z: number }>;
      direction: Readonly<{ x: number; y: number; z: number }>;
    }>,
    occluded: (distance: number) => boolean = () => false
  ): boolean {
    const p = this.population,
      reach = this.interaction.clickDistance;
    if (!p || reach === 0) return false;
    let chosen: Actor | undefined,
      nearest = Infinity;
    for (const actor of p.active) {
      const animal = actor.animal;
      if (!animal?.visible) continue;
      const [min, max] = animal.bounds;
      let near = 0,
        far = reach;
      for (let axis = 0; axis < 3; axis++) {
        const key = (["x", "y", "z"] as const)[axis],
          direction = ray.direction[key],
          origin = ray.origin[key];
        if (Math.abs(direction) < 1e-8) {
          if (origin < min[axis] || origin > max[axis]) far = -1;
        } else {
          const a = (min[axis] - origin) / direction,
            b = (max[axis] - origin) / direction;
          near = Math.max(near, Math.min(a, b));
          far = Math.min(far, Math.max(a, b));
        }
      }
      if (near <= far && near < nearest) {
        nearest = near;
        chosen = actor;
      }
    }
    if (!chosen || occluded(Math.max(0, nearest - 0.05))) return false;
    const source = this.interactions.player?.() ?? ray.origin;
    const accepted = chosen.animal!.behavior.notify({
      id: `shoo:${++this.requestId}`,
      type: "shoo",
      source: [source.x, source.z]
    });
    if (accepted) {
      chosen.nextApproach = p.system.time + this.interaction.approachCooldown;
      if (chosen.food) {
        chosen.food.farm = undefined;
        chosen.food.approaching = undefined;
        chosen.food.cart = undefined;
      }
    }
    return accepted;
  }

  private refreshObserver(p: Population, force = false): void {
    const observer = this.observer();
    if (!force) {
      const dx = observer.x - p.observerX;
      const dz = observer.z - p.observerZ;
      if (dx * dx + dz * dz < 0.25) return;
    }
    p.observerX = observer.x;
    p.observerZ = observer.z;
    for (const actor of p.actors) {
      // Flush at most one coarse interval before comparing against the new observer.
      // Reentry always starts from the current simulated position, never a stale tick.
      const coarse = p.coarse.has(actor);
      const distance = p.config.activationDistance;
      const reach =
        distance +
        Math.max(Math.min(64, distance * 0.25), actor.wakeTravel) +
        (coarse ? actor.animal!.pendingTravelBound : 0);
      if (coarse && (actor.x - p.observerX) ** 2 + (actor.z - p.observerZ) ** 2 <= reach * reach) {
        p.system.synchronizeMotion(actor.animal!);
        actor.x = actor.animal!.position.x;
        actor.z = actor.animal!.position.z;
      }
      this.admit(p, actor);
    }
  }

  private admit(p: Population, actor: Actor): void {
    const distance = p.config.activationDistance;
    this.visibilityPositionChecks++;
    const distanceSquared = (actor.x - p.observerX) ** 2 + (actor.z - p.observerZ) ** 2;
    actor.wanted = actor.supportValid && distanceSquared <= distance * distance;
    // Full simulation warms up in the buffer before rendering; hidden instances use shared coarse motion.
    const simulationDistance = (actor.wakeDistance =
      distance + Math.max(Math.min(64, distance * 0.25), actor.wakeTravel));
    actor.admitted = actor.supportValid && distanceSquared <= simulationDistance * simulationDistance;
    if (actor.admitted && actor.state === "unloaded") p.queue.add(actor);
    else p.queue.delete(actor);
    actor.animal?.setStreamingState(actor.wanted, actor.admitted, actor.supportValid);
    if (actor.animal?.hasDistantActivity) p.coarse.add(actor);
    else p.coarse.delete(actor);
    if (actor.admitted && actor.animal && actor.state === "loaded") p.active.add(actor);
    else p.active.delete(actor);
  }

  /** Revalidate once per published water/terrain edit, never during normal frame updates. */
  private revalidateSupport(p: Population, regions?: readonly AnimalWorldBounds[]): void {
    for (const actor of p.actors)
      if (actor.animal) {
        actor.x = actor.animal.position.x;
        actor.z = actor.animal.position.z;
      }
    // Surface intent alone cannot change support or make a failed placement succeed.
    if (regions && !regions.length) return;
    for (const actor of p.actors) {
      const medium = actor.animal?.medium ?? actor.birth.medium ?? actor.asset.profile.preferredMedium ?? "ground";
      const radius = actor.footprint.radius,
        height = actor.footprint.height;
      // A supported actor depends only on its footprint. A suspended actor also
      // depends on the domain searched by the failed relocation, including remote edits.
      if (
        regions &&
        !regions.some(
          (b) =>
            (actor.x + radius >= b.minX &&
              actor.x - radius <= b.maxX &&
              actor.z + radius >= b.minZ &&
              actor.z - radius <= b.maxZ) ||
            (!actor.supportValid && p.habitat.placementIntersects(b))
        )
      )
        continue;
      actor.supportValid = p.habitat.canTraverse(actor, actor, radius, height, medium);
      if (actor.supportValid) {
        actor.error = undefined;
        continue;
      }
      const occupied = p.actors.filter((a) => a !== actor).map((a) => ({ x: a.x, z: a.z, radius: a.footprint.radius }));
      const random = randomStream(actor.birth.seed ^ 0x51ed270b);
      const area = p.config.distribution;
      for (let attempt = 0; attempt < 256; attempt++) {
        let point;
        if (actor.home) point = sampleAnimalSpawnDisk(actor.home, actor.home.radius, random);
        else {
          const angle = random() * Math.PI * 2,
            r = Math.sqrt(random()) * p.config.spawnRadius;
          const candidate = area
            ? { x: area.minX + random() * (area.maxX - area.minX), z: area.minZ + random() * (area.maxZ - area.minZ) }
            : { x: p.habitat.origin.x + Math.cos(angle) * r, z: p.habitat.origin.z + Math.sin(angle) * r };
          point = p.habitat.spawnCandidate(candidate, medium, false, random);
        }
        const safe = point && p.habitat.samplePosition(point, radius, occupied, height, medium);
        if (!safe) continue;
        if (actor.animal) {
          if (!actor.animal.relocate([safe.x, safe.z])) continue;
          actor.animal.resumeBehavior();
        } else if (!p.crowd.relocate(actor.footprint, safe.x, safe.z, actor.birth.heading)) continue;
        actor.x = safe.x;
        actor.z = safe.z;
        actor.footprint.elevation = safe.y;
        actor.supportValid = true;
        actor.error = undefined;
        break;
      }
      if (!actor.supportValid) actor.error = "水陆支持已改变，采样预算内未找到安全位置，暂停并隐藏，等待下次地形发布";
    }
  }

  private loadQueued(p: Population): void {
    if (!p.queue.size) return;
    const deferCam = this.startupDeferOffscreenCamera as
      | (Camera & { projectionMatrix?: Matrix; viewMatrix?: Matrix })
      | undefined;
    let frustum: BoundingFrustum | undefined;
    if (deferCam?.projectionMatrix && deferCam.viewMatrix) {
      Matrix.multiply(deferCam.projectionMatrix, deferCam.viewMatrix, this.startupFrustumMatrix);
      this.startupFrustum.calculateFromMatrix(this.startupFrustumMatrix);
      frustum = this.startupFrustum;
    }
    // Dispatch every admitted animal independently; completion or failure never gates another request.
    for (const actor of p.queue) {
      if (deferCam) {
        if (!actor.wanted) continue;
        if (frustum) {
          const height = actor.footprint.height ?? 1;
          const margin = Math.max(6, actor.footprint.radius + height * 2);
          const y = actor.footprint.elevation ?? actor.birth.position.y;
          this.startupActorBox.min.set(actor.x - margin, y - 2, actor.z - margin);
          this.startupActorBox.max.set(actor.x + margin, y + height + 2, actor.z + margin);
          if (!frustum.intersectsBox(this.startupActorBox)) continue;
        }
      }
      this.loadActor(p, actor);
    }
  }

  private loadActor(p: Population, actor: Actor): void {
    actor.state = "loading";
    p.queue.delete(actor);
    this.resourceRequests++;
    const task = this.library
      .load(actor.asset.reference, p.abort.signal)
      .then((asset) => {
        if (this.population !== p || this.disposed || !p.actors.includes(actor) || !actor.animal) return;
        if (!actor.admitted) {
          actor.state = "unloaded";
          this.admit(p, actor);
          return;
        }
        if (p.outlineEnabled && OUTLINE_ZERO_DISTANCE > 0) {
          const observer = this.observer();
          this.updateActorOutline(actor, observer.x, observer.y, observer.z);
        }
        actor.animal!.attachResource(asset.resource);
        actor.state = "loaded";
        this.admit(p, actor);
      })
      .catch((error) => {
        if (this.population !== p || p.abort.signal.aborted || this.disposed) return;
        actor.state = "failed";
        actor.error = String(error);
        this.errors.push(`${actor.birth.id}: ${String(error)}`);
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  private createAnimal(p: Population, actor: Actor): void {
    const asset = actor.asset;
    const radius = actor.footprint.radius;
    const height = (asset.config.bounds.max[1] - asset.config.bounds.min[1]) * asset.config.scale;
    const random = randomStream(actor.birth.seed ^ 0x1b873593);
    p.crowd.remove(actor.footprint);
    try {
      let animal: ConfiguredAnimal;
      const food: FoodMemory = (actor.food = { pending: false });
      const profile = asset.profile;
      animal = new ConfiguredAnimal(
        p.root,
        asset.config,
        undefined,
        p.system,
        [actor.x, actor.z],
        actor.birth.medium ? { ...profile, preferredMedium: actor.birth.medium } : profile,
        (query, event) => this.resolveTarget(p.habitat, animal, query, event, random, radius, height, food, actor.home),
        p.crowd,
        actor.birth.heading,
        {
          random: randomStream(actor.birth.seed),
          tightTurns: !!actor.home,
          resolveMaterial: p.outlineEnabled ? this.resolveMaterial : this.resolvePlainMaterial,
          resolvePlainMaterial: this.resolvePlainMaterial,
          distantUpdateSeconds: DISTANT_ANIMAL_UPDATE_SECONDS,
          fastDirectGroundArc: true,
          interactionArrivalRadius: () =>
            food.approaching?.appearance === "cart" && food.cart?.entering ? 0.06 : undefined,
          arrivedAtInteraction: (destination) =>
            !!food.approaching &&
            destination[0] === food.approaching.x &&
            destination[1] === food.approaching.z &&
            this.inFoodStance(animal, food, food.approaching),
          beginInteraction: (query) => {
            if (query.query !== AnimalQuery.FoodAtMouth || !food.farm) return undefined;
            food.feeding = food.farm;
            food.approaching = undefined;
            return this.interaction.feedingSeconds;
          },
          interactionReady: () => {
            if (!food.feeding || !this.inFoodStance(animal, food, food.feeding)) {
              food.startedAt = undefined;
              return false;
            }
            food.startedAt ??= p.system.time;
            return true;
          },
          cancelInteraction: () => {
            food.feeding = undefined;
            food.startedAt = undefined;
          },
          completeInteraction: (query) => {
            const target = food.feeding ?? food.farm;
            if (
              query.query !== AnimalQuery.FoodAtMouth ||
              !target ||
              food.pending ||
              !this.interactions.food ||
              !this.inFoodStance(animal, food, target) ||
              food.startedAt === undefined
            )
              return;
            food.pending = true;
            food.farm = undefined;
            void this.interactions.food
              .consume(target, this.interaction.minimumCropMaturity)
              .catch((error) => this.errors.push(String(error)))
              .finally(() => {
                food.pending = false;
                if (this.population === p) animal.behavior.worldChanged();
              });
          },
          ground: {
            flightBounds: actor.home ?? p.habitat.flightBounds,
            heightAt: (x, z, medium) => p.habitat.heightAt(x, z, medium, height),
            staticRouteQuery: (r, medium) => liveAnimalRouteQuery(() => p.habitat, r, height, medium, actor.home),
            canTraverseAir: (from, to, r, h) =>
              insideAnimalHome(actor.home, to.x, to.z) && p.habitat.canTraverseAir(from, to, r, h),
            canTraverse: (from, to, r, medium) => {
              if (!insideAnimalHome(actor.home, to.x, to.z) || !p.habitat.canTraverse(from, to, r, height, medium))
                return false;
              if (medium === "air") return true;
              // Validate the existing support without cancelling the escape move before it starts.
              // Swept movement still rejects deeper penetration; feeding endpoints are checked separately.
              if (from.x === to.x && from.z === to.z && from.x === animal.position.x && from.z === animal.position.z)
                return true;
              const obstacles = this.interactions.food?.obstacles;
              if (!obstacles?.length) return true;
              const y = p.habitat.heightAt(to.x, to.z, medium, height) ?? animal.position.y;
              return planningAnimalFoodPathClear(
                from,
                to,
                Math.min(y, animal.position.y),
                Math.max(y, animal.position.y) + height,
                r,
                obstacles
              );
            }
          }
        }
      );
      animal.entity.name = actor.birth.id;
      animal.setShadows(true);
      actor.animal = animal;
      animal.setStreamingState(false, false, actor.supportValid);
    } catch (error) {
      p.crowd.add(actor.footprint);
      throw error;
    }
  }

  private resolveTarget(
    habitat: PlanningAnimalHabitat,
    animal: ConfiguredAnimal,
    query: AnimalTargetQuery,
    event: AnimalWorldEvent | null,
    random: () => number,
    radius: number,
    height: number,
    food: FoodMemory,
    home?: AnimalHome
  ): readonly [number, number] | null {
    if (!animal) return null;
    if (query.query !== AnimalQuery.Food && query.query !== AnimalQuery.FoodAtMouth) food.approaching = undefined;
    const from = animal.position;
    const medium = (query.params?.medium ?? animal.medium ?? "ground") as PlanningAnimalMedium;
    const arrivalMedium = query.params?.arrivalMedium as "ground" | "water" | undefined;
    const canArrive = (x: number, z: number) =>
      insideAnimalHome(home, x, z) &&
      (!arrivalMedium ||
        (habitat.canTraverse({ x, z }, { x, z }, radius, height, arrivalMedium) &&
          animal.canOccupy(x, z, arrivalMedium)));
    if (!["ground", "air", "water"].includes(medium)) return null;
    if (query.query === AnimalQuery.MediumAvailable)
      return habitat.canTraverse(from, from, radius, height, medium) ? [from.x, from.z] : null;
    if (query.query === "position") {
      const x = query.params?.x,
        z = query.params?.z;
      return typeof x === "number" &&
        typeof z === "number" &&
        Number.isFinite(x) &&
        Number.isFinite(z) &&
        canArrive(x, z) &&
        habitat.canTraverse({ x, z }, { x, z }, radius, height, medium)
        ? [x, z]
        : null;
    }
    if (query.query === AnimalQuery.Food || query.query === AnimalQuery.FoodAtMouth) {
      if (medium !== "ground") return null;
      const farm = this.farmTarget(animal, food, home);
      if (!farm) return null;
      const inStance = this.inFoodStance(animal, food, farm);
      if (query.query === AnimalQuery.FoodAtMouth) return inStance ? [from.x, from.z] : null;
      if (inStance) return [from.x, from.z];
      food.approaching = farm;
      if (food.cart && !food.cart.entering) return food.cart.next;
      // Arrival is gameplay proximity; the asset supplies the unmodified eating animation.
      return [farm.x, farm.z];
    }
    if (query.query !== AnimalQuery.Wander && query.query !== AnimalQuery.Flee) return null;
    if (medium === "air" && arrivalMedium && query.params?.scope === "world") {
      // Bounded landing proposals, not a full-map/path scan. ConfiguredAnimal validates
      // the executable departure arc and keeps probing ahead while the flight advances.
      const source = query.query === AnimalQuery.Flee ? event?.source : undefined;
      const minDistance = Math.max(
        2,
        Math.min(home ? home.radius * 0.75 : Infinity, query.query === AnimalQuery.Flee ? 12 : 4)
      );
      const minDistanceSq = minDistance * minDistance;
      for (let attempt = 0; attempt < 32; attempt++) {
        const candidate = home
          ? sampleAnimalSpawnDisk(home, home.radius, random)
          : habitat.flightCandidate(arrivalMedium, random);
        if (!candidate || !canArrive(candidate.x, candidate.z)) continue;
        const dx = candidate.x - from.x,
          dz = candidate.z - from.z;
        if (dx * dx + dz * dz < minDistanceSq) continue;
        if (source && dx * (from.x - source[0]) + dz * (from.z - source[1]) < 0) continue;
        return [candidate.x, candidate.z];
      }
      return null;
    }
    // An unsourced startle is not a threat from the camera. Prefer forward escape
    // so acceleration does not wait for an artificial half-turn.
    const source = event?.source;
    const heading =
      query.query === AnimalQuery.Flee && source
        ? Math.atan2(from.x - source[0], from.z - source[1])
        : animal.direction;
    let fallback: readonly [number, number] | null = null;
    const habitats = query.params?.habitats;
    const preferences = Array.isArray(habitats) ? (habitats as { habitat: string; weight: number }[]) : [];
    const maximumWeight = preferences.reduce((max, entry) => Math.max(max, entry.weight), 0);
    const fleeing = query.query === AnimalQuery.Flee && !!source;
    const chooseAnotherRoute = fleeing && query.params?.headingSpread === Math.PI * 2;
    const detour = fleeing && query.params?.escapeDetour === true;
    const lateralSide = fleeing ? Math.sign(Math.sin(animal.direction - heading)) || 1 : 1;
    // If the bank, neighbours or the home boundary close the outward sector, test
    // short exit legs all around the animal. Start near its current forward heading.
    const detourHeading = detour ? animal.direction + ((random() - 0.5) * Math.PI) / 2 : 0;
    const localWander = home && query.query === AnimalQuery.Wander;
    for (let attempt = 0; attempt < 16; attempt++) {
      let spread =
        typeof query.params?.headingSpread === "number"
          ? query.params.headingSpread
          : query.query === AnimalQuery.Flee
            ? Math.PI / 3
            : Math.PI;
      if (fleeing) spread = attempt < 4 ? Math.min(Math.PI, spread) : Math.PI * 1.25;
      else if (attempt >= 8) spread = 2 * Math.PI;
      const alongBank = fleeing && attempt >= 4 && attempt < 12;
      const sector = attempt % 8;
      const angle = detour
        ? detourHeading + (lateralSide * (sector % 2 ? 1 : -1) * Math.ceil(sector / 2) * Math.PI) / 4
        : alongBank
          ? heading + lateralSide * (attempt % 4 === 3 ? -1 : 1) * Math.PI * (0.43 + 0.08 * random())
          : heading + (random() - 0.5) * spread;
      const configuredDistance = query.params?.distance;
      let distance =
        typeof configuredDistance === "number" && Number.isFinite(configuredDistance) && configuredDistance > 0
          ? configuredDistance
          : 3 + random() * 7;
      // Sample beyond occupied resting spots, then try a shorter safe leg along the shore.
      if (detour) distance = Math.max(1.2, radius * (attempt < 8 ? 2 : 0.75));
      else if (chooseAnotherRoute && attempt < 4)
        distance = attempt % 2 ? distance * (0.5 + random() * 2) : Math.max(1.2, radius * 0.45);
      else if (fleeing && attempt >= 4 && attempt < 12) distance *= 1 + random() * 1.5;
      else if (fleeing && attempt >= 14) distance = Math.max(1.2, radius * 0.45);
      else if (attempt >= 8) distance *= 0.3;
      if (localWander) {
        // A short alternative gives large bodies a reachable leg between neighbours.
        // Vary length even when the first endpoint is clear but the route to it failed.
        distance = Math.min(home.radius * 0.45, distance) * (0.6 + random() * 0.8);
      }
      const x = from.x + Math.sin(angle) * distance,
        z = from.z + Math.cos(angle) * distance;
      if (
        fleeing &&
        !detour &&
        (x - source[0]) ** 2 + (z - source[1]) ** 2 <= (from.x - source[0]) ** 2 + (from.z - source[1]) ** 2
      )
        continue;
      if (!insideAnimalHome(home, x, z) || !animal.canOccupy(x, z, medium)) continue;
      if (
        arrivalMedium &&
        arrivalMedium !== medium &&
        (!animal.canOccupy(x, z, arrivalMedium) ||
          !habitat.canTraverse({ x, z }, { x, z }, radius, height, arrivalMedium))
      )
        continue;
      if (!habitat.canTraverse({ x, z }, { x, z }, radius, height, medium)) continue;
      const obstacles = this.interactions.food?.obstacles;
      if (medium !== "air" && obstacles?.length) {
        const y = habitat.heightAt(x, z, medium, height);
        if (
          y === undefined ||
          !planningAnimalFoodPathClear(
            from,
            { x, z },
            Math.min(from.y, y),
            Math.max(from.y, y) + height,
            radius,
            obstacles
          )
        )
          continue;
      }
      fallback ??= [x, z];
      if (query.query === AnimalQuery.Flee || !maximumWeight) return [x, z];
      const surface =
        medium === "water"
          ? "river"
          : habitat.navigationWater(x + 4, z) ||
              habitat.navigationWater(x - 4, z) ||
              habitat.navigationWater(x, z + 4) ||
              habitat.navigationWater(x, z - 4)
            ? "waterside"
            : habitat.surface.at(x, z);
      const weight = preferences.find((entry) => entry.habitat === surface)?.weight ?? 0;
      // A preference does not trap an animal on a road or remove safe passage through it.
      if (random() < Math.max(0.15, weight / maximumWeight)) return [x, z];
    }
    return fallback;
  }

  private farmTarget(animal: ConfiguredAnimal, memory: FoodMemory, home?: AnimalHome): PlanningAnimalFoodTarget | null {
    const source = this.interactions.food;
    if (
      !source ||
      !planningAnimalCanEat(animal.behavior.profile) ||
      memory.pending ||
      !this.population ||
      this.interaction.biteDistance === 0
    )
      return null;
    const height = (animal.config.bounds.max[1] - animal.config.bounds.min[1]) * animal.config.scale;
    const cartPlans = new Map<string, PlanningAnimalCartApproach>();
    const query = {
      minGrowth: this.interaction.minimumCropMaturity,
      accept: (target: PlanningAnimalFoodTarget) => {
        if (!insideAnimalHome(home, target.x, target.z)) return false;
        if (target.appearance === "cart") {
          const approach = planningAnimalCartApproach(
            target,
            animal.position,
            animalCollisionRadius(animal.config),
            height * this.interaction.feedingReachHeightRatio,
            (x, z) => this.population!.habitat.heightAt(x, z, "ground", height),
            {
              bodyLength: (animal.config.bounds.max[2] - animal.config.bounds.min[2]) * animal.config.scale,
              heading: animal.direction,
              entering:
                memory.farm?.id === target.id &&
                memory.farm.x === target.x &&
                memory.farm.y === target.y &&
                memory.farm.z === target.z &&
                memory.farm.sourceYaw === target.sourceYaw &&
                memory.cart?.entering
            }
          );
          if (!approach) return false;
          cartPlans.set(target.id, approach);
          return true;
        }
        const ground = this.population!.habitat.heightAt(target.x, target.z, "ground", height);
        const accepted =
          ground !== undefined &&
          target.y >= ground - this.interaction.biteDistance &&
          target.y <= ground + height * this.interaction.feedingReachHeightRatio;
        return accepted;
      }
    };
    if (memory.feeding) {
      const target = source.available(memory.feeding, query) ? memory.feeding : null;
      memory.cart = target ? cartPlans.get(target.id) : undefined;
      return target;
    }
    if (memory.farm && !source.available(memory.farm, query)) memory.farm = undefined;
    const target = memory.farm ?? (memory.farm = source.find(animal.position, Infinity, query) ?? undefined) ?? null;
    memory.cart = target ? cartPlans.get(target.id) : undefined;
    return target;
  }

  private inFoodStance(animal: ConfiguredAnimal, memory: FoodMemory, target: PlanningAnimalFoodTarget): boolean {
    const dx = target.x - animal.position.x,
      dz = target.z - animal.position.z;
    if (target.appearance === "cart") {
      const cart = memory.cart;
      if (
        !cart?.entering ||
        Math.hypot(animal.position.x - cart.stance.x, animal.position.z - cart.stance.z) > 0.2 ||
        Math.cos(animal.direction - cart.heading) < Math.cos(Math.PI / 6)
      )
        return false;
    } else {
      const length = (animal.config.bounds.max[2] - animal.config.bounds.min[2]) * animal.config.scale;
      if (Math.hypot(dx, dz) > Math.min(this.interaction.biteDistance, Math.max(0.15, length * 0.5))) return false;
    }
    return true;
  }

  /** Read planned identities without loading missing presentation resources. */
  query(input: SeedWorldAnimalQuery = {}) {
    const actors = (this.population?.actors ?? []).filter(
      (a) =>
        (!input.typeId || a.birth.typeId === input.typeId) &&
        (input.visible === undefined || !!a.animal?.visible === input.visible)
    );
    const offset = Math.max(0, input.offset ?? 0),
      limit = Math.min(100, Math.max(1, input.limit ?? 50));
    return {
      enabled: this.enabled,
      matchedCount: actors.length,
      offset,
      ...(offset + limit < actors.length ? { nextOffset: offset + limit } : {}),
      animals: actors.slice(offset, offset + limit).map((a) => ({
        id: a.birth.id,
        typeId: a.birth.typeId,
        speciesId: seedAnimalSpeciesId(a.birth.typeId),
        appearanceId: a.asset.reference.appearanceId,
        scale: a.animal?.scale ?? a.asset.config.scale,
        label: a.asset.config.name,
        loaded: a.state === "loaded",
        visible: !!a.animal?.visible,
        position: this.coordinates(a)
      }))
    };
  }

  /** Describe registered intents independently of whether this model has finished streaming. */
  describe({ id }: { id: string }): SeedWorldAnimalDescription {
    const actor = this.population?.actors.find((a) => a.birth.id === id);
    if (!actor)
      return {
        id,
        available: false,
        reason: this.population ? "not_found" : this.enabled ? "not_ready" : "disabled",
        skills: [],
        targets: []
      };
    const reason =
      actor.state !== "loaded"
        ? "not_ready"
        : !this.population!.active.has(actor) && !this.population!.coarse.has(actor)
          ? "not_visible"
          : undefined;
    return {
      id,
      available: !reason,
      ...(reason ? { reason } : {}),
      skills: Object.entries(actor.asset.profile.skills)
        .filter(([id]) => !id.startsWith("_"))
        .map(([skillId, skill]) => ({
          skillId,
          label: skill.label,
          repeat: !!skill.repeat,
          background: !!skill.background,
          requiresTarget: !!skill.requiresTarget
        })),
      targets: Object.values(actor.asset.profile.skills).some((skill) => skill.requiresTarget)
        ? structuredClone(PLANNING_ANIMAL_TARGETS)
        : []
    };
  }

  /** Execute discovered semantic intent; querying or commanding an unavailable actor never triggers a model load. */
  command(input: SeedWorldAnimalCommand): SeedWorldAnimalReceipt {
    const p = this.population;
    const actor = p?.actors.find((a) => a.birth.id === input.id);
    const previous = actor?.animal?.behavior.receipt(input.requestId);
    // Accepted identities retain their meaning even when the animal subsequently hides or moves.
    if (!previous) {
      const reason = !p
        ? this.enabled
          ? "not_ready"
          : "disabled"
        : !actor
          ? "not_found"
          : actor.state !== "loaded"
            ? "not_ready"
            : !p.active.has(actor) && !p.coarse.has(actor)
              ? "not_visible"
              : undefined;
      if (reason) return { ...input, status: "rejected", reason };
    }
    const prepared = preparePlanningAnimalCommand(
      input,
      actor!.asset.profile.skills,
      (position) => {
        // Validate explicit destinations from the current shared-clock position,
        // even when coarse motion has not reached its next integration deadline.
        p!.system.synchronizeMotion(actor!.animal!);
        const config = actor!.asset.config;
        return p!.habitat.canTraverse(
          actor!.animal!.position,
          position,
          animalCollisionRadius(config),
          (config.bounds.max[1] - config.bounds.min[1]) * config.scale,
          actor!.asset.profile.preferredMedium ?? "ground"
        );
      },
      previous ? ({ id: input.id, ...previous } as SeedWorldAnimalReceipt) : undefined
    );
    if (prepared.kind === "receipt") return prepared.receipt;
    const { requestId, skillId, target } = prepared.input;
    return { id: input.id, ...actor!.animal!.execute({ requestId, skillId, target }) } as SeedWorldAnimalReceipt;
  }

  /** Observe the latest status without restarting the operation. */
  receipt(input: { id: string; requestId: string }): SeedWorldAnimalReceipt {
    const receipt = this.population?.actors
      .find((a) => a.birth.id === input.id)
      ?.animal?.behavior.receipt(input.requestId);
    return receipt
      ? ({ id: input.id, ...receipt } as SeedWorldAnimalReceipt)
      : {
          ...input,
          status: "not_found",
          reason: this.population ? "request_not_found" : this.enabled ? "not_ready" : "disabled"
        };
  }

  /** Dispatch a world fact through the shared controller at either simulation precision. */
  notify(event: AnimalWorldEvent): number {
    const p = this.population;
    if (!p) return 0;
    let admitted = 0;
    // Both precision sets are disjoint; disabled populations receive no work.
    for (const actors of [p.active, p.coarse])
      for (const actor of actors) if (actor.animal?.behavior.notify(event)) admitted++;
    return admitted;
  }

  /** A fresh panel operation restarts an intent through the same semantic command service as the Agent. */
  commandFromPanel(id: string, skillId: "idle" | "startle" | "eat"): void {
    this.command({ id, requestId: `seed-animal-${++this.requestId}`, skillId });
  }

  /** Planned positions remain available for focusing an animal before its model is loaded. */
  position(id: string): Readonly<{ x: number; y: number; z: number }> | undefined {
    const actor = this.population?.actors.find((a) => a.birth.id === id);
    return actor?.animal?.position ?? actor?.birth.position;
  }

  /** Find a supported dry camera position; viewing a swimmer does not require a walkable path into water. */
  observationPosition(id: string, eyeHeight: number): { x: number; y: number; z: number } | undefined {
    const p = this.population,
      position = this.position(id);
    if (!p || !position) return;
    for (const distance of [5, 10, 20, 40, 80])
      for (let step = 0; step < 16; step++) {
        const angle = Math.PI / 4 + (step * Math.PI) / 8;
        const x = position.x + Math.sin(angle) * distance,
          z = position.z + Math.cos(angle) * distance;
        const y = p.navigation.sampleHeightInterpolated(x, z);
        if (y !== undefined && Number.isFinite(y) && p.habitat.canTraverse({ x, z }, { x, z }, 0.35, 1.8))
          return { x, y: y + eyeHeight, z };
      }
  }

  /** Optional detached placement records; querying these never loads presentation resources. */
  instances(): AnimalInstanceDocument[] {
    return (this.population?.actors ?? []).map((a) => ({
      version: 1,
      id: a.birth.id,
      typeId: a.birth.typeId,
      appearanceId: a.asset.reference.appearanceId,
      position: this.coordinates(a),
      heading: a.animal?.direction ?? a.birth.heading,
      scale: a.animal?.scale ?? a.asset.config.scale
    }));
  }

  /** Detached diagnostic data. No spatial lookup or model load is performed while inspecting. */
  inspect(evidence = false): PlanningAnimalPanelSnapshot & Record<string, unknown> {
    const p = this.population,
      actors = p?.actors ?? [];
    return {
      seed: p?.plan.parameters.seed ?? 0,
      loading: actors.some((a) => a.admitted && (a.state === "unloaded" || a.state === "loading")),
      fireflies: {
        visible: p?.fireflies?.population.count ?? 0,
        visibility: p?.fireflies?.population.visibility ?? 0,
        maximumCount: p?.config.fireflies?.maximumCount ?? 0
      },
      total: actors.length,
      loaded: actors.filter((a) => a.state === "loaded").length,
      visible: actors.filter((a) => a.animal?.visible).length,
      simulating: p?.active.size ?? 0,
      hiddenSimulating: actors.filter((a) => !a.wanted && p?.active.has(a)).length,
      distantSimulating: p?.coarse.size ?? 0,
      distantFlights: p ? [...p.coarse].filter((actor) => actor.animal?.medium === "air").length : 0,
      sharedResources: new Set(actors.filter((a) => a.state === "loaded").map((a) => a.animal!.resource)).size,
      origin: p ? { ...p.habitat.origin } : null,
      range: p
        ? {
            activationDistance: p.config.activationDistance,
            homeRadius: p.config.homeRadius,
            simulationDistance: Math.max(p.config.activationDistance, ...actors.map((actor) => actor.wakeDistance)),
            ...(p.config.distribution
              ? { worldWidth: p.config.distribution.maxX - p.config.distribution.minX }
              : { spawnRadius: p.config.spawnRadius, roamRadius: p.config.roamRadius })
          }
        : null,
      errors: [
        ...this.errors,
        ...actors.filter((a) => !a.supportValid && a.error).map((a) => `${a.birth.id}: ${a.error}`)
      ],
      ...(evidence
        ? {
            observer: { ...this.observer() },
            config: p?.config,
            births: p?.layout.animals,
            requestedCount: p?.layout.requestedCount,
            scheduler: p?.system.stats,
            crowd: p?.crowd.metrics,
            placementMilliseconds: this.placementMilliseconds,
            habitatBuildMilliseconds: this.habitatBuildMilliseconds,
            placementAttempts: this.placementAttempts,
            updateMilliseconds: this.updateMilliseconds,
            maximumUpdateMilliseconds: this.maximumUpdateMilliseconds,
            performance: {
              samples: this.sampleCount,
              animalUpdateMs: percentiles(this.updateSamples, this.sampleCount),
              hostFrameMs: percentiles(this.frameSamples, this.sampleCount),
              note: "最近600帧；animalUpdate含运动提交前的手动Animator骨骼采样，不含渲染提交/GPU；hostFrame是宿主传入的可钳制时间步，不是GPU或精确帧耗时"
            },
            visibilityPositionChecks: this.visibilityPositionChecks,
            resourceRequests: this.resourceRequests,
            pendingLoads: this.pending.size,
            instances: this.instances()
          }
        : {}),
      animals: actors.map((a) => ({
        id: a.birth.id,
        typeId: a.birth.typeId,
        name: a.asset.config.name,
        appearanceId: a.asset.reference.appearanceId,
        visible: !!a.animal?.visible,
        loaded: a.state === "loaded",
        loadState: a.state,
        position: this.coordinates(a),
        action:
          a.animal?.action ??
          (a.state === "failed" ? "加载失败" : a.state === "loading" ? "加载中" : "等待进入显示范围"),
        movementSpeed: a.animal?.movementSpeed,
        animationRate: a.animal?.animationRate,
        ...(evidence && a.animal
          ? {
              task: a.animal.behavior.inspect().task?.skillId,
              bounds: a.animal.bounds,
              presentation: a.animal.presentation,
              motionSync: a.animal.motionSync,
              behavior: a.animal.behavior.inspect()
            }
          : {}),
        ...(evidence ? { surface: p?.habitat.surface.at(a.x, a.z) } : {}),
        modelUrl: a.asset.config.modelUrl
      }))
    };
  }

  private coordinates(actor: Actor): readonly [number, number, number] {
    const p = actor.animal?.position ?? actor.birth.position;
    return [p.x, p.y, p.z];
  }

  private synchronizeFireflies(p: Population): void {
    const input = this.interactions.fireflies,
      settings = p.config.fireflies;
    const key = input && settings?.enabled && settings.maximumCount > 0 ? JSON.stringify(settings) : "";
    if ((p.fireflies?.key ?? "") === key) return;
    p.fireflies?.presenter.dispose();
    p.fireflies?.population.dispose();
    p.fireflies = undefined;
    if (!key || !input || !settings) return;
    const population = new FireflyPopulation(p.system, p.plan.parameters.seed, settings, {
      get width() {
        return p.plan.parameters.width;
      },
      get depth() {
        return p.plan.parameters.depth;
      },
      surfaceHeight: (x, z) => {
        const ground = p.navigation.sampleHeightInterpolated(x, z);
        return ground === undefined ? undefined : Math.max(ground, p.navigation.sampleWaterHeight?.(x, z) ?? ground);
      },
      canMove: (from, to) => p.habitat.canTraverseAir(from, to, 0.04, 0.08)
    });
    try {
      p.fireflies = { population, presenter: new FireflyPresenter(p.root, input.camera, population), key };
    } catch (error) {
      population.dispose();
      throw error;
    }
  }

  private updateActorOutline(actor: Actor, obsX: number, obsY: number | undefined, obsZ: number): void {
    const animal = actor.animal;
    if (!animal) return;
    const pos = animal.position;
    const dx = pos.x - obsX;
    const dz = pos.z - obsZ;
    const dy = obsY !== undefined ? pos.y + (actor.footprint.height ?? 0) * 0.5 - obsY : 0;
    const distSq = dx * dx + dy * dy + dz * dz;
    // Cutoff = fadeEnd + boundingRadius ensures every vertex on this animal already has
    // distance(camera_Position, world.xyz) >= fadeEnd (outline width == 0) before dropping the pass.
    const cutoff = OUTLINE_ZERO_DISTANCE + animal.boundingRadius;
    if (animal.isOutlineEnabled) {
      const off = cutoff + OUTLINE_OFF_HYSTERESIS_METERS;
      if (distSq >= off * off) animal.setOutlineEnabled(false);
    } else if (distSq < cutoff * cutoff) {
      animal.setOutlineEnabled(true);
    }
  }

  private updateActorAnimationLod(
    actor: Actor,
    obsX: number,
    obsY: number | undefined,
    obsZ: number,
    verticalFov: number,
    orthoSize: number | undefined
  ): void {
    const animal = actor.animal;
    if (!animal) return;
    if (!this.animationLod.enabled) {
      if (actor.animLodLevel !== 0) {
        actor.animLodLevel = 0;
        animal.setAnimationLod(1, actor.birth.seed & 0xff);
      }
      return;
    }
    const pos = animal.position;
    const dx = pos.x - obsX;
    const dy = obsY !== undefined ? pos.y - obsY : 0;
    const dz = pos.z - obsZ;
    const distance = Math.hypot(dx, dy, dz);
    const projectedHeight = projectAnimalSize(animal.boundingRadius * 2, distance, verticalFov, orthoSize);
    const prev: AnimalLodLevel = actor.animLodLevel === undefined ? 0 : actor.animLodLevel;
    const next = selectAnimalLod(projectedHeight, this.animationLod.screenRelativeTransitionHeights, prev);
    if (actor.animLodLevel === undefined || next !== prev) {
      actor.animLodLevel = next;
      const stride = animalAnimationLodStride(next, this.animationLod, 1 / ANIMAL_FIXED_STEP_SECONDS);
      animal.setAnimationLod(stride, actor.birth.seed & 0xff);
    }
  }

  private releasePopulation(): void {
    this.previousPlayer = undefined;
    this.simulationAccumulator = 0;
    const p = this.population;
    this.population = undefined;
    if (p) destroyPopulation(p);
  }

  /** Stop admission and release this population's outstanding waits before engine teardown. */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.enabled = false;
    this.releasePopulation();
    await Promise.allSettled([this.spawnTail, ...this.pending]);
    for (const pair of this.toonMaterials.values()) {
      pair.outlined.destroy();
      pair.plain.destroy();
    }
    this.toonMaterials.clear();
  }
}

function destroyPopulation(p: Population): void {
  p.abort.abort();
  p.fireflies?.presenter.dispose();
  p.system.dispose();
  p.root.destroy();
  p.active.clear();
  p.coarse.clear();
  p.queue.clear();
}
function populationKey(config: AnimalPopulationConfig): string {
  return JSON.stringify({
    ...config,
    activationDistance: 0,
    interaction: undefined,
    fireflies: undefined,
    animationLod: undefined
  });
}
function validAuthoringIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !!value.trim() &&
    new TextEncoder().encode(value).length <= 128 &&
    !/[\u0000-\u001f]/.test(value)
  );
}
function randomStream(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = Math.imul(value ^ (value >>> 15), value | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentiles(buffer: Float64Array, count: number) {
  const sorted = Array.from(buffer.subarray(0, count)).sort((a, b) => a - b);
  return { p50: sorted[Math.floor(count * 0.5)] ?? 0, p95: sorted[Math.min(count - 1, Math.floor(count * 0.95))] ?? 0 };
}

/** Prewarm enough distance for the fastest registered gait to cross one distant update interval. */
function animalWakeDistance(visibleDistance: number, asset: ResolvedAnimalAsset): number {
  const pace = (node: unknown): number => {
    if (!node || typeof node !== "object") return 1;
    const value = node as { params?: { speedMultiplier?: number }; children?: unknown[]; node?: unknown };
    return Math.max(value.params?.speedMultiplier ?? 1, pace(value.node), ...(value.children ?? []).map(pace));
  };
  const speed =
    Math.max(0, ...Object.values(asset.profile.movementSpeeds)) *
    asset.config.scale *
    Math.max(1, ...Object.values(asset.profile.skills).map((skill) => pace(skill.tree)));
  return visibleDistance + Math.max(Math.min(64, visibleDistance * 0.25), speed * DISTANT_ANIMAL_UPDATE_SECONDS);
}
