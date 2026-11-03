import { FireflyPopulation } from "@galacean/engine-animals/gameplay/animal/FireflyPopulation";
import { FireflyPresenter } from "@galacean/engine-animals/gameplay/animal/FireflyPresenter";
import type { Camera } from "@galacean/engine";
import { querySeedAnimalCatalog } from "./PlanningAnimalCatalog.ts";
import { PlanningAnimalSurfaceKind, type PlanningAnimalSurfaceData } from "./PlanningAnimalSurface.ts";
import type { AnimalInstanceDocument } from "@galacean/engine-animals/gameplay/animal/AnimalInstanceDocument";
import { PBRMaterial, type Entity, type Material } from "@galacean/engine";
import { createCuteZooToonMaterial } from "@galacean/engine-animals/gameplay/animal/CuteZooToonMaterial";
import { AnimalAssetLibrary, type ResolvedAnimalAsset } from "@galacean/engine-animals/gameplay/animal/AnimalAssetLibrary";
import { ConfiguredAnimal } from "@galacean/engine-animals/gameplay/animal/ConfiguredAnimal";
import { animalCollisionRadius } from "@galacean/engine-animals/gameplay/animal/AnimalAssetCatalog";
import { AnimalSystem } from "@galacean/engine-animals/gameplay/animal/AnimalSystem";
import { GroundAnimalCrowd, type GroundAnimalBody } from "@galacean/engine-animals/gameplay/animal/GroundAnimalCrowd";
import { AnimalQuery } from "@galacean/engine-animals/gameplay/animal/AnimalRegistration";
import type { AnimalTargetQuery, AnimalWorldEvent } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
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
  chooseAnimalBirthHabitat,
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

/** Optional scene interactions; the observer camera remains independent of the physical player. */
export interface PlanningAnimalInteractions {
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
  observerX: number;
  observerZ: number;
  abort: AbortController;
  spawns: Map<string, { key: string; receipt: SeedWorldAnimalSpawnReceipt }>;
}

/** Demand-loaded Seed population. Geometry owns placement; this adapter owns admission and streaming. */
export class PlanningAnimalRuntime implements SeedWorldAnimalService {
  readonly library: AnimalAssetLibrary;
  private population?: Population;
  private disposed = false;
  private enabled = false;
  private errors: string[] = [];
  private readonly pending = new Set<Promise<void>>();
  private readonly toonMaterials = new Map<Material, Material>();
  private readonly resolveMaterial = (source: Material): Material => {
    if (!(source instanceof PBRMaterial)) return source;
    let material = this.toonMaterials.get(source);
    if (!material) {
      material = createCuteZooToonMaterial(source);
      this.toonMaterials.set(source, material);
    }
    return material;
  };
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
  private previousPlayer?: { x: number; z: number };

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
    options: { preservePopulation?: boolean; surface?: PlanningAnimalSurfaceData } = {}
  ): void {
    validateAnimalPopulationConfig(config);
    this.interaction = animalInteractionConfig(config.interaction);
    void this.interactions.food?.refresh();
    if (this.disposed) return;
    this.enabled = config.enabled;
    if (!config.enabled) {
      this.releasePopulation();
      this.errors = [];
      return;
    }
    config = this.library.resolvePopulationConfig({
      ...config,
      ...(config.distribution ? { distribution: { ...config.distribution,
        minX: 0, minZ: 0, maxX: plan.parameters.width, maxZ: plan.parameters.depth } } : {}),
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
      current.habitat.origin.x === plan.spawn.x && current.habitat.origin.z === plan.spawn.z &&
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
        current.habitat = new PlanningAnimalHabitat(plan, navigation, config, options.surface);
        current.plan = plan;
        current.navigation = navigation;
        this.revalidateSupport(current);
        current.fireflies?.population.refreshWorld();
        this.refreshObserver(current, true);
        for (const actor of current.actors) actor.animal?.refreshWorld();
      }
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
      this.habitatBuildMilliseconds = performance.now() - placementStart;
      this.placementAttempts = 0;
      const spawnPoints = new Map(config.types.map(type => [type.typeId, type.spawnPoint]));
      const birthHabitats = new Map<string, ReturnType<typeof chooseAnimalBirthHabitat>>();
      const occupied: PlanningAnimalOccupant[] = [];
      const layout = planAnimalPopulation({
        seed: plan.parameters.seed,
        origin: habitat.origin,
        config,
        sampleCandidate: ({ id, typeId, appearanceId, position, attempt, random }) => {
          this.placementAttempts++;
          let preference = birthHabitats.get(id);
          if (!preference) {
            preference = chooseAnimalBirthHabitat(this.library.resolve({ typeId, appearanceId }).profile, random, spawnPoints.get(typeId)?.weight);
            birthHabitats.set(id, preference);
          }
          // Proximity is a soft preference: a bounded local budget cannot prevent valid global births.
          if (preference.nearSpawn && attempt < 32)
            return habitat.spawnPointCandidate(position, preference.medium, preference.shore, spawnPoints.get(typeId)!.radius, random);
          return habitat.spawnCandidate(position, preference.medium, preference.shore, random);
        },
        samplePosition: ({ id, typeId, appearanceId, position: point }) => {
          const asset = this.library.resolve({ typeId, appearanceId });
          const radius = animalCollisionRadius(asset.config);
          const height = (asset.config.bounds.max[1] - asset.config.bounds.min[1]) * asset.config.scale;
          const medium = birthHabitats.get(id)!.medium;
          const position = habitat.samplePosition(point, radius, occupied, height, medium);
          if (position) occupied.push({ ...position, radius });
          return position && { ...position, medium };
        }
      });
      this.placementMilliseconds = performance.now() - placementStart;
      const root = this.parent.createChild("Seed animals");
      const system = new AnimalSystem(),
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
        observerX: NaN,
        observerZ: NaN,
        abort: new AbortController(),
        spawns: new Map()
      };
      for (const birth of layout.animals) this.addActor(candidate, birth);
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
  spawn(input: SeedWorldAnimalSpawn): SeedWorldAnimalSpawnReceipt {
    const p = this.population;
    const reject = (reason: string): SeedWorldAnimalSpawnReceipt => ({
      requestId: input.requestId,
      status: "rejected",
      reason
    });
    if (!p || this.disposed) return reject(this.enabled && !this.disposed ? "not_ready" : "disabled");
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
          const point = input.position ?? p.habitat.spawnCandidate(position, medium, asset.profile.habitatPreferences?.some(p => p.habitat === "waterside") ?? false, random);
          if (!point) return;
          return p.habitat.samplePosition(
            point,
            animalCollisionRadius(asset.config),
            occupied,
            (asset.config.bounds.max[1] - asset.config.bounds.min[1]) * asset.config.scale, medium
          );
        }
      });
      const birth = layout.animals[0];
      if (!birth) receipt = reject("no_safe_spawn_position");
      else {
        birth.id = `animal:spawn:${p.spawns.size + 1}`;
        const actor = this.addActor(p, birth);
        p.layout.animals.push(birth);
        p.layout.requestedCount++;
        this.admit(p, actor);
        receipt = {
          requestId: input.requestId,
          status: "accepted",
          id: birth.id,
          typeId: birth.typeId,
          appearanceId: actor.asset.reference.appearanceId
        };
      }
    } catch {
      receipt = reject("unknown_type_or_appearance");
    }
    p.spawns.set(input.requestId, { key, receipt });
    return { ...receipt };
  }

  private addActor(p: Population, birth: AnimalPopulationInstance): Actor {
    const asset = this.library.resolve(birth);
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
      p.navigation.beginAnimalUpdate?.();
      try {
        p.system.update(Math.min(Math.max(seconds, 0), 0.1));
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
      for (const actor of p.active) {
        const position = actor.animal!.position;
        if (position.x === actor.x && position.z === actor.z) continue;
        actor.x = position.x;
        actor.z = position.z;
        this.admit(p, actor);
      }
    }
    if (p.fireflies) { p.fireflies.population.pack(); p.fireflies.presenter.update(); }
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
    if (!player) { this.previousPlayer = undefined; return; }
    const previous = this.previousPlayer;
    if (previous && (player.x !== previous.x || player.z !== previous.z)) {
      for (const actor of p.active) {
        const animal = actor.animal;
        if (!animal || animal.medium === "air" || p.system.time < (actor.nextApproach ?? 0) ||
            (player.y !== undefined && Math.abs(player.y - animal.position.y) > 3) ||
            !isAnimalApproach(animal.position, player, previous, seconds, this.interaction)) continue;
        if (animal.behavior.notify({ id: `approach:${++this.requestId}`, type: "approach", source: [player.x, player.z] }))
          actor.nextApproach = p.system.time + this.interaction.approachCooldown;
      }
    }
    if (previous) { previous.x = player.x; previous.z = player.z; }
    else this.previousPlayer = { x: player.x, z: player.z };
  }

  /** Pick a nearby visible envelope along a normalized world ray, rejecting occluded or distant hits. */
  shoo(ray: Readonly<{ origin: Readonly<{ x: number; y: number; z: number }>; direction: Readonly<{ x: number; y: number; z: number }> }>,
    occluded: (distance: number) => boolean = () => false): boolean {
    const p = this.population, player = this.interactions.player?.();
    if (!p || !player || this.interaction.clickDistance === 0) return false;
    let chosen: Actor | undefined, nearest = Infinity;
    for (const actor of p.active) {
      const animal = actor.animal;
      if (!animal?.visible || Math.hypot(animal.position.x - player.x, animal.position.z - player.z,
        animal.position.y - (player.y ?? animal.position.y)) > this.interaction.clickDistance) continue;
      const [min, max] = animal.bounds;
      let near = 0, far = Infinity;
      for (let axis = 0; axis < 3; axis++) {
        const key = (["x", "y", "z"] as const)[axis], direction = ray.direction[key], origin = ray.origin[key];
        if (Math.abs(direction) < 1e-8) { if (origin < min[axis] || origin > max[axis]) far = -1; }
        else {
          const a = (min[axis] - origin) / direction, b = (max[axis] - origin) / direction;
          near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
      }
      if (near <= far && near < nearest) { nearest = near; chosen = actor; }
    }
    if (!chosen || occluded(Math.max(0, nearest - 0.05))) return false;
    const accepted = chosen.animal!.behavior.notify({ id: `shoo:${++this.requestId}`, type: "shoo", source: [player.x, player.z] });
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
    if (!force && observer.x === p.observerX && observer.z === p.observerZ) return;
    p.observerX = observer.x;
    p.observerZ = observer.z;
    for (const actor of p.actors) {
      // Flush at most one coarse interval before comparing against the new observer.
      // Reentry always starts from the current simulated position, never a stale tick.
      const coarse = p.coarse.has(actor);
      const distance = p.config.activationDistance;
      const reach = distance + Math.max(Math.min(64, distance * 0.25), actor.wakeTravel) +
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
    const simulationDistance = actor.wakeDistance = distance + Math.max(Math.min(64, distance * 0.25), actor.wakeTravel);
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
  private revalidateSupport(p: Population): void {
    for (const actor of p.actors) if (actor.animal) {
      actor.x = actor.animal.position.x; actor.z = actor.animal.position.z;
    }
    for (const actor of p.actors) {
      const medium = actor.animal?.medium ?? actor.birth.medium ?? actor.asset.profile.preferredMedium ?? "ground";
      const radius = actor.footprint.radius, height = actor.footprint.height;
      actor.supportValid = p.habitat.canTraverse(actor, actor, radius, height, medium);
      if (actor.supportValid) { actor.error = undefined; continue; }
      const occupied = p.actors.filter(a => a !== actor).map(a => ({ x: a.x, z: a.z, radius: a.footprint.radius }));
      const random = randomStream(actor.birth.seed ^ 0x51ed270b);
      const area = p.config.distribution;
      for (let attempt = 0; attempt < 256; attempt++) {
        const angle = random() * Math.PI * 2, r = Math.sqrt(random()) * p.config.spawnRadius;
        const candidate = area ? { x: area.minX + random() * (area.maxX - area.minX), z: area.minZ + random() * (area.maxZ - area.minZ) }
          : { x: p.habitat.origin.x + Math.cos(angle) * r, z: p.habitat.origin.z + Math.sin(angle) * r };
        const point = p.habitat.spawnCandidate(candidate, medium, false, random);
        const safe = point && p.habitat.samplePosition(point, radius, occupied, height, medium);
        if (!safe) continue;
        if (actor.animal) {
          if (!actor.animal.relocate([safe.x, safe.z])) continue;
          actor.animal.resumeBehavior();
        } else if (!p.crowd.relocate(actor.footprint, safe.x, safe.z, actor.birth.heading)) continue;
        actor.x = safe.x; actor.z = safe.z; actor.footprint.elevation = safe.y;
        actor.supportValid = true; actor.error = undefined;
        break;
      }
      if (!actor.supportValid) actor.error = "水陆支持已改变，采样预算内未找到安全位置，暂停并隐藏，等待下次地形发布";
    }
  }

  private loadQueued(p: Population): void {
    if (!p.queue.size) return;
    // Dispatch every admitted animal independently; completion or failure never gates another request.
    for (const actor of p.queue) this.loadActor(p, actor);
  }

  private loadActor(p: Population, actor: Actor): void {
    actor.state = "loading";
    p.queue.delete(actor);
    this.resourceRequests++;
    const task = this.library
      .load(actor.asset.reference, p.abort.signal)
      .then((asset) => {
        if (this.population !== p || this.disposed) return;
        if (!actor.admitted) {
          actor.state = "unloaded";
          this.admit(p, actor);
          return;
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
      const food: FoodMemory = actor.food = { pending: false };
      const profile = asset.profile;
      animal = new ConfiguredAnimal(
        p.root,
        asset.config,
        undefined,
        p.system,
        [actor.x, actor.z],
        actor.birth.medium ? { ...profile, preferredMedium: actor.birth.medium } : profile,
        (query, event) => this.resolveTarget(p.habitat, animal, query, event, random, radius, height, food),
        p.crowd,
        actor.birth.heading,
        {
          random: randomStream(actor.birth.seed),
          resolveMaterial: this.resolveMaterial,
          distantUpdateSeconds: DISTANT_ANIMAL_UPDATE_SECONDS,
          interactionArrivalRadius: () => food.approaching?.appearance === "cart" && food.cart?.entering ? 0.06 : undefined,
          arrivedAtInteraction: destination => !!food.approaching &&
            destination[0] === food.approaching.x && destination[1] === food.approaching.z &&
            this.inFoodStance(animal, food, food.approaching),
          beginInteraction: query => {
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
            food.feeding = undefined; food.startedAt = undefined;
          },
          completeInteraction: query => {
            const target = food.feeding ?? food.farm;
            if (query.query !== AnimalQuery.FoodAtMouth || !target || food.pending ||
                !this.interactions.food || !this.inFoodStance(animal, food, target) || food.startedAt === undefined) return;
            food.pending = true;
            food.farm = undefined;
            void this.interactions.food.consume(target, this.interaction.minimumCropMaturity).catch(error => this.errors.push(String(error))).finally(() => {
              food.pending = false;
              if (this.population === p) animal.behavior.worldChanged();
            });
          },
          ground: {
            flightBounds: p.habitat.flightBounds,
            heightAt: (x, z, medium) => p.habitat.heightAt(x, z, medium, height),
            staticRouteQuery: (r, medium) => p.habitat.staticRouteQuery(r, height, medium),
            canTraverseAir: (from, to, r, h) => p.habitat.canTraverseAir(from, to, r, h),
            canTraverse: (from, to, r, medium) => {
              if (!p.habitat.canTraverse(from, to, r, height, medium)) return false;
              if (medium === "air") return true;
              // Validate the existing support without cancelling the escape move before it starts.
              // Swept movement still rejects deeper penetration; feeding endpoints are checked separately.
              if (from.x === to.x && from.z === to.z &&
                  from.x === animal.position.x && from.z === animal.position.z) return true;
              const y = p.habitat.heightAt(to.x, to.z, medium, height) ?? animal.position.y;
              return planningAnimalFoodPathClear(from, to, Math.min(y, animal.position.y),
                Math.max(y, animal.position.y) + height, r, this.interactions.food?.obstacles ?? []);
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
    food: FoodMemory
  ): readonly [number, number] | null {
    if (!animal) return null;
    if (query.query !== AnimalQuery.Food && query.query !== AnimalQuery.FoodAtMouth) food.approaching = undefined;
    const from = animal.position;
    const medium = (query.params?.medium ?? animal.medium ?? "ground") as PlanningAnimalMedium;
    const arrivalMedium = query.params?.arrivalMedium as "ground" | "water" | undefined;
    const canArrive = (x: number, z: number) => !arrivalMedium ||
      (habitat.canTraverse({ x, z }, { x, z }, radius, height, arrivalMedium) && animal.canOccupy(x, z, arrivalMedium));
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
      const farm = this.farmTarget(animal, food);
      if (!farm) return null;
      const inStance = this.inFoodStance(animal, food, farm);
      if (query.query === AnimalQuery.FoodAtMouth)
        return inStance ? [from.x, from.z] : null;
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
      for (let attempt = 0; attempt < 32; attempt++) {
        const candidate = habitat.flightCandidate(arrivalMedium, random);
        if (!candidate || !canArrive(candidate.x, candidate.z)) continue;
        if (source && (candidate.x - from.x) * (from.x - source[0]) +
          (candidate.z - from.z) * (from.z - source[1]) < 0) continue;
        return [candidate.x, candidate.z];
      }
      return null;
    }
    // An unsourced startle is not a threat from the camera. Prefer forward escape
    // so acceleration does not wait for an artificial half-turn.
    const source = event?.source;
    const heading = query.query === AnimalQuery.Flee && source
      ? Math.atan2(from.x - source[0], from.z - source[1]) : animal.direction;
    let fallback: readonly [number, number] | null = null;
    const habitats = query.params?.habitats;
    const preferences = Array.isArray(habitats) ? (habitats as { habitat: string; weight: number }[]) : [];
    const maximumWeight = preferences.reduce((max, entry) => Math.max(max, entry.weight), 0);
    for (let attempt = 0; attempt < 16; attempt++) {
      const spread = typeof query.params?.headingSpread === "number" ? query.params.headingSpread :
        query.query === AnimalQuery.Flee ? Math.PI / 3 : Math.PI;
      const angle = heading + (random() - 0.5) * (attempt < 8 ? spread : 2 * Math.PI);
      const configuredDistance = query.params?.distance;
      const distance = (
        typeof configuredDistance === "number" && Number.isFinite(configuredDistance) && configuredDistance > 0
          ? configuredDistance
          : 3 + random() * 7) * (attempt >= 8 ? 0.3 : 1);
      const x = from.x + Math.sin(angle) * distance,
        z = from.z + Math.cos(angle) * distance;
      if (query.query === AnimalQuery.Flee && source &&
          (x - from.x) * (from.x - source[0]) + (z - from.z) * (from.z - source[1]) <= 0) continue;
      if (!canArrive(x, z) || !animal.canOccupy(x, z, medium) || !habitat.canTraverse({ x, z }, { x, z }, radius, height, medium)) continue;
      const obstacles = this.interactions.food?.obstacles;
      if (medium !== "air" && obstacles?.length) {
        const y = habitat.heightAt(x, z, medium, height);
        if (y === undefined || !planningAnimalFoodPathClear(from, { x, z }, Math.min(from.y, y),
          Math.max(from.y, y) + height, radius, obstacles)) continue;
      }
      fallback ??= [x, z];
      if (query.query === AnimalQuery.Flee || !maximumWeight) return [x, z];
      const surface = medium === "water" ? "river" :
        [[4, 0], [-4, 0], [0, 4], [0, -4]].some(([dx, dz]) => habitat.navigationWater(x + dx, z + dz))
          ? "waterside" : habitat.surface.at(x, z);
      const weight = preferences.find((entry) => entry.habitat === surface)?.weight ?? 0;
      // A preference does not trap an animal on a road or remove safe passage through it.
      if (random() < Math.max(0.15, weight / maximumWeight)) return [x, z];
    }
    return fallback;
  }

  private farmTarget(animal: ConfiguredAnimal, memory: FoodMemory): PlanningAnimalFoodTarget | null {
    const source = this.interactions.food;
    if (!source || !planningAnimalCanEat(animal.behavior.profile) || memory.pending || !this.population || this.interaction.biteDistance === 0) return null;
    const height = (animal.config.bounds.max[1] - animal.config.bounds.min[1]) * animal.config.scale;
    const cartPlans = new Map<string, PlanningAnimalCartApproach>();
    const query = { minGrowth: this.interaction.minimumCropMaturity, accept: (target: PlanningAnimalFoodTarget) => {
      if (target.appearance === "cart") {
        const approach = planningAnimalCartApproach(target, animal.position, animalCollisionRadius(animal.config),
          height * this.interaction.feedingReachHeightRatio,
          (x, z) => this.population!.habitat.heightAt(x, z, "ground", height),
          { bodyLength: (animal.config.bounds.max[2] - animal.config.bounds.min[2]) * animal.config.scale,
            heading: animal.direction,
            entering: memory.farm?.id === target.id && memory.farm.x === target.x && memory.farm.y === target.y &&
              memory.farm.z === target.z && memory.farm.sourceYaw === target.sourceYaw && memory.cart?.entering });
        if (!approach) return false;
        cartPlans.set(target.id, approach);
        return true;
      }
      const ground = this.population!.habitat.heightAt(target.x, target.z, "ground", height);
      const accepted = ground !== undefined && target.y >= ground - this.interaction.biteDistance &&
        target.y <= ground + height * this.interaction.feedingReachHeightRatio;
      return accepted;
    } };
    if (memory.feeding) {
      const target = source.available(memory.feeding, query) ? memory.feeding : null;
      memory.cart = target ? cartPlans.get(target.id) : undefined;
      return target;
    }
    if (memory.farm && !source.available(memory.farm, query))
      memory.farm = undefined;
    const target = memory.farm ?? (memory.farm = source.find(animal.position, Infinity, query) ?? undefined) ?? null;
    memory.cart = target ? cartPlans.get(target.id) : undefined;
    return target;
  }

  private inFoodStance(animal: ConfiguredAnimal, memory: FoodMemory, target: PlanningAnimalFoodTarget): boolean {
    const dx = target.x - animal.position.x, dz = target.z - animal.position.z;
    if (target.appearance === "cart") {
      const cart = memory.cart;
      if (!cart?.entering || Math.hypot(animal.position.x - cart.stance.x,
        animal.position.z - cart.stance.z) > 0.2 || Math.cos(animal.direction - cart.heading) < Math.cos(Math.PI / 6)) return false;
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
    const reason = actor.state !== "loaded" ? "not_ready" :
      !this.population!.active.has(actor) && !this.population!.coarse.has(actor) ? "not_visible" : undefined;
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
    for (const distance of [5, 10, 20, 40, 80]) for (let step = 0; step < 16; step++) {
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
      fireflies: { visible: p?.fireflies?.population.count ?? 0, visibility: p?.fireflies?.population.visibility ?? 0,
        maximumCount: p?.config.fireflies?.maximumCount ?? 0 },
      total: actors.length,
      loaded: actors.filter((a) => a.state === "loaded").length,
      visible: actors.filter(a => a.animal?.visible).length,
      simulating: p?.active.size ?? 0,
      hiddenSimulating: actors.filter(a => !a.wanted && p?.active.has(a)).length,
      distantSimulating: p?.coarse.size ?? 0,
      distantFlights: p ? [...p.coarse].filter(actor => actor.animal?.medium === "air").length : 0,
      sharedResources: new Set(actors.filter((a) => a.state === "loaded").map((a) => a.animal!.resource)).size,
      origin: p ? { ...p.habitat.origin } : null,
      range: p
        ? {
            activationDistance: p.config.activationDistance,
            simulationDistance: Math.max(p.config.activationDistance, ...actors.map(actor => actor.wakeDistance)),
            ...(p.config.distribution ? { worldWidth: p.config.distribution.maxX - p.config.distribution.minX }
              : { spawnRadius: p.config.spawnRadius, roamRadius: p.config.roamRadius })
          }
        : null,
      errors: [...this.errors, ...actors.filter(a => !a.supportValid && a.error).map(a => `${a.birth.id}: ${a.error}`)],
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
    const input = this.interactions.fireflies, settings = p.config.fireflies;
    const key = input && settings?.enabled && settings.maximumCount > 0 ? JSON.stringify(settings) : "";
    if ((p.fireflies?.key ?? "") === key) return;
    p.fireflies?.presenter.dispose(); p.fireflies?.population.dispose(); p.fireflies = undefined;
    if (!key || !input || !settings) return;
    const population = new FireflyPopulation(p.system, p.plan.parameters.seed, settings, {
      get width() { return p.plan.parameters.width; }, get depth() { return p.plan.parameters.depth; },
      surfaceHeight: (x, z) => {
        const ground = p.navigation.sampleHeightInterpolated(x, z);
        return ground === undefined ? undefined : Math.max(ground, p.navigation.sampleWaterHeight?.(x, z) ?? ground);
      },
      canMove: (from, to) => p.habitat.canTraverseAir(from, to, 0.04, 0.08)
    });
    try { p.fireflies = { population, presenter: new FireflyPresenter(p.root, input.camera, population), key }; }
    catch (error) { population.dispose(); throw error; }
  }

  private releasePopulation(): void {
    this.previousPlayer = undefined;
    const p = this.population;
    this.population = undefined;
    if (p) destroyPopulation(p);
  }

  /** Stop admission and release this population's outstanding waits before engine teardown. */
  async dispose(): Promise<void> {
    this.disposed = true;
    this.enabled = false;
    this.releasePopulation();
    await Promise.allSettled([...this.pending]);
    for (const material of this.toonMaterials.values()) material.destroy();
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
  return JSON.stringify({ ...config, activationDistance: 0, interaction: undefined, fireflies: undefined });
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
  const speed = Math.max(0, ...Object.values(asset.profile.movementSpeeds)) * asset.config.scale *
    Math.max(1, ...Object.values(asset.profile.skills).map(skill => pace(skill.tree)));
  return visibleDistance + Math.max(Math.min(64, visibleDistance * 0.25), speed * DISTANT_ANIMAL_UPDATE_SECONDS);
}
