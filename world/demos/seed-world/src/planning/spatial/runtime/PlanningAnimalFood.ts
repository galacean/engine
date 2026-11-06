import type { FarmingAPI } from "@galacean/engine-farming/farming/native/FarmingAPI";
import { FARM_BASKET_CONTENT_SCALE, farmBasketProduceSlot } from "@galacean/engine-farming/farming/domain/FarmItemDimensions";
import { HARVEST_BASKET_CAPACITY, type BasketContent } from "@galacean/engine-farming/farming/domain/FarmItems";
import { STORAGE_CART_OBSTACLES } from "@galacean/engine-farming/farming/presentation/storage/StorageContainerGeometry";
import type { PlanningAnimalFoodObstacle } from "./PlanningAnimalFoodClearance.ts";

/** A food observation binds a bite to one crop instance, grounded basket or storage container. */
export interface PlanningAnimalFoodTarget {
  readonly id: string;
  readonly farmId: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Actual food elevation; groundY retains the source's placement for identity checks. */
  readonly groundY?: number;
  /** Source placement, separate from a visible fruit's offset within its container. */
  readonly sourcePosition?: readonly [number, number, number];
  /** Storage container yaw in degrees; also binds an approach to its observed opening. */
  readonly sourceYaw?: number;
  readonly kind: "crop" | "basket" | "container";
  readonly cropId: string;
  readonly plotId?: string;
  readonly cropInstanceId?: string;
  readonly basketId?: string;
  readonly itemId?: string;
  readonly containerId?: string;
  readonly containerTypeId?: string;
  readonly appearance?: "cart" | "basket";
  readonly growth?: number;
  /** Bind a stored bite even when overflow keeps the visible slot occupied after withdrawal. */
  readonly observedQuantity?: number;
}

/** Optional decision guards, applied before selecting the nearest food. */
export interface PlanningAnimalFoodQuery {
  readonly minGrowth?: number;
  readonly minY?: number;
  readonly maxY?: number;
  /** Tests target-local ground reach without confusing a hillside with an elevated container. */
  readonly accept?: (target: PlanningAnimalFoodTarget) => boolean;
}

/** Food discovery cadence and minimum crop growth for every farming crop. */
export interface PlanningAnimalFoodOptions {
  /** Minimum crop growth fraction, inclusive; zero permits newly planted crops. */
  readonly minGrowth?: number;
  /** Minimum wall-clock interval between decision-driven discovery queries. */
  readonly refreshMilliseconds?: number;
}

/** Cache food discovery for synchronous animal decisions; commit bites through the farming API. */
export class PlanningAnimalFood {
  private api?: FarmingAPI;
  private targets: PlanningAnimalFoodTarget[] = [];
  private blockers: PlanningAnimalFoodObstacle[] = [];
  private pending?: Promise<void>;
  private nextRefresh = 0;
  private readonly minGrowth: number;
  private readonly refreshMilliseconds: number;

  /**
   * @param readApi Returns the current active farming host, including after scene replacement.
   * @param options Discovery cadence and minimum crop growth.
   */
  constructor(private readonly readApi: () => FarmingAPI | undefined, options: PlanningAnimalFoodOptions = {}) {
    this.minGrowth = options.minGrowth ?? 0;
    this.refreshMilliseconds = options.refreshMilliseconds ?? 1000;
    if (!Number.isFinite(this.minGrowth) || this.minGrowth < 0 || this.minGrowth > 1 ||
      !Number.isFinite(this.refreshMilliseconds) || this.refreshMilliseconds < 0)
      throw new Error("Invalid animal food configuration");
  }

  /** Refresh at most once per interval; obsolete hosts cannot publish their observations. */
  refresh(): Promise<void> {
    const api = this.readApi();
    if (api !== this.api) {
      this.api = api;
      this.targets = [];
      this.blockers = [];
      this.pending = undefined;
      this.nextRefresh = 0;
    }
    if (!api) return Promise.resolve();
    if (this.pending) return this.pending;
    if (performance.now() < this.nextRefresh) return Promise.resolve();
    this.nextRefresh = performance.now() + this.refreshMilliseconds;
    const task = this.discover(api).catch(() => {
      if (this.api === api) this.targets = [];
    }).finally(() => {
      if (this.pending === task) this.pending = undefined;
    });
    return this.pending = task;
  }

  /** Current measured container parts; discovery replaces this borrowed snapshot atomically. */
  get obstacles(): readonly PlanningAnimalFoodObstacle[] { return this.blockers; }

  /** @returns The nearest observed edible target within the horizontal radius in metres. */
  find(from: { x: number; z: number }, radius: number, query: PlanningAnimalFoodQuery = {}): PlanningAnimalFoodTarget | null {
    void this.refresh();
    let nearest: PlanningAnimalFoodTarget | null = null;
    let distanceSquared = radius * radius;
    if (!(radius > 0)) return null;
    for (const target of this.targets) {
      const distance = (target.x - from.x) ** 2 + (target.z - from.z) ** 2;
      if (distance > distanceSquared || !this.eligible(target, query)) continue;
      nearest = target; distanceSquared = distance;
    }
    return nearest;
  }

  /** @returns A nearby eligible food position, or null when the farm has no edible yield. */
  attraction(from: { x: number; z: number }, radius: number): { x: number; z: number } | null {
    return this.find(from, radius);
  }

  /** @returns Whether the same target remains in the latest discovery at its observed position. */
  available(target: PlanningAnimalFoodTarget, query: PlanningAnimalFoodQuery = {}): boolean {
    void this.refresh();
    return this.targets.some((candidate) => candidate.id === target.id &&
      candidate.x === target.x && candidate.y === target.y && candidate.z === target.z &&
      candidate.sourceYaw === target.sourceYaw && candidate.observedQuantity === target.observedQuantity &&
      (candidate.sourcePosition === target.sourcePosition || !!candidate.sourcePosition && !!target.sourcePosition &&
        this.samePosition(candidate, target.sourcePosition)) && this.eligible(candidate, query));
  }

  /**
   * Revalidate maturity, identity, position and carrying before one atomic bite.
   * @param target Previously selected food; the caller must verify the animal's reach at bite completion.
   * @returns Whether the farming transaction committed the bite.
   */
  async consume(target: PlanningAnimalFoodTarget, minGrowth = this.minGrowth): Promise<boolean> {
    const api = this.readApi();
    if (!api || !Number.isFinite(minGrowth) || minGrowth < 0 || minGrowth > 1) return false;
    let outcome = await this.consumeObserved(target, api, minGrowth);
    // Another animal may have committed against a different target in this farm.
    // A conflict proves this bite did not commit; re-read all target guards once.
    if (outcome === "conflict" && this.readApi() === api) outcome = await this.consumeObserved(target, api, minGrowth);
    if (this.readApi() === api) {
      this.targets = this.targets.filter((entry) => entry.id !== target.id);
      this.nextRefresh = 0;
    }
    return outcome === "success";
  }

  private eligible(target: PlanningAnimalFoodTarget, query: PlanningAnimalFoodQuery): boolean {
    return (target.kind !== "crop" || (target.growth ?? 0) >= (query.minGrowth ?? this.minGrowth)) &&
      target.y >= (query.minY ?? -Infinity) && target.y <= (query.maxY ?? Infinity) && (query.accept?.(target) ?? true);
  }

  private async consumeObserved(target: PlanningAnimalFoodTarget, api: FarmingAPI, minGrowth: number): Promise<"success" | "failure" | "conflict"> {
    if (target.kind === "crop" && target.plotId && target.cropInstanceId) {
      const observed = await api.execute({ operation: "getPlot", input: { farmId: target.farmId, plotId: target.plotId } });
      if (!observed.ok || this.readApi() !== api) return "failure";
      const plot = observed.value;
      if (!plot?.crop || plot.crop.healthPermille <= 0 || plot.crop.growthPermille < minGrowth * 1000 ||
        plot.crop.instanceId !== target.cropInstanceId ||
        plot.crop.cropId !== target.cropId || plot.ground.availability !== "available" ||
        !plot.position || !this.samePosition(target, plot.position)) return "failure";
      const result = await api.execute({
        operation: "damageCrop",
        input: { farmId: target.farmId, plotId: target.plotId, cropInstanceId: target.cropInstanceId,
          damagePermille: plot.crop.healthPermille, source: "animal" },
        options: { expectedRevision: plot.revision }
      });
      return result.ok ? "success" : result.error.code === "VERSION_CONFLICT" ? "conflict" : "failure";
    } else if (target.kind === "container" && target.containerId && target.itemId && target.appearance) {
      const observed = await api.execute({ operation: "getContainers", input: { farmId: target.farmId } });
      if (!observed.ok || this.readApi() !== api) return "failure";
      const container = observed.value.find((entry) => entry.id === target.containerId);
      const content = container?.contents.find((entry) => entry.cropId === target.cropId && entry.itemId === target.itemId);
      if (!container || container.typeId !== target.containerTypeId || !content || content.quantity <= 0 ||
        content.quantity !== target.observedQuantity || container.yaw !== target.sourceYaw ||
        !this.samePosition(target, container.position)) return "failure";
      const position = api.system.getArea(target.farmId).storagePresenter?.foodPosition(container.id, target.cropId, target.itemId);
      if (!position || position[0] !== target.x || position[1] !== target.y || position[2] !== target.z) return "failure";
      const result = await api.execute({ operation: "withdrawInventory",
        input: { farmId: target.farmId, containerId: target.containerId, itemId: target.itemId, quantity: 1 },
        options: { expectedRevision: observed.context!.revision } });
      return result.ok ? "success" : result.error.code === "VERSION_CONFLICT" ? "conflict" : "failure";
    } else if (target.kind === "basket" && target.basketId && target.itemId) {
      const observed = await api.execute({ operation: "queryItems",
        input: { farmId: target.farmId, query: { itemId: target.basketId, type: "harvest-basket" } } });
      if (!observed.ok || this.readApi() !== api) return "failure";
      const basket = observed.value[0];
      if (!basket || basket.carried || !this.samePosition(target, basket.position) ||
        !basket.contents.some((entry) => entry.cropId === target.cropId && entry.itemId === target.itemId && entry.quantity > 0))
        return "failure";
      const position = basketFoodPosition(basket.position, basket.contents, target.cropId, target.itemId);
      if (!position || position[0] !== target.x || position[1] !== target.y || position[2] !== target.z) return "failure";
      const result = await api.execute({
        operation: "consumeBasket",
        input: { farmId: target.farmId, basketId: target.basketId, cropId: target.cropId, itemId: target.itemId, quantity: 1 },
        options: { expectedRevision: observed.context!.revision }
      });
      return result.ok ? "success" : result.error.code === "VERSION_CONFLICT" ? "conflict" : "failure";
    }
    return "failure";
  }

  private samePosition(target: PlanningAnimalFoodTarget, position: readonly number[]): boolean {
    if (target.sourcePosition) return target.sourcePosition.every((coordinate, index) => coordinate === position[index]);
    return target.x === position[0] && (target.groundY ?? target.y) === position[1] && target.z === position[2];
  }

  private async discover(api: FarmingAPI): Promise<void> {
    const areas = await api.execute({ operation: "list", input: {} });
    if (!areas.ok) { if (this.readApi() === api) this.targets = []; return; }
    const targets: PlanningAnimalFoodTarget[] = [];
    const blockers: PlanningAnimalFoodObstacle[] = [];
    for (const area of areas.value) {
      if (!area.active || !area.initialized) continue;
      const farmId = area.farmId;
      const [plots, items, containers, catalog] = await Promise.all([
        api.execute({ operation: "queryPlots", input: { farmId, query: { occupied: true, availability: "available" } } }),
        api.execute({ operation: "queryItems", input: { farmId, query: { type: "harvest-basket" } } }),
        api.execute({ operation: "getContainers", input: { farmId } }),
        api.execute({ operation: "getCatalog", input: { farmId } })
      ]);
      if (this.readApi() !== api) return;
      if (plots.ok) for (const plot of plots.value) {
        if (!plot.crop || plot.crop.healthPermille <= 0 || !plot.position) continue;
        targets.push({ id: `${farmId}/crop/${plot.crop.instanceId}`, farmId, kind: "crop", plotId: plot.plotId,
          cropInstanceId: plot.crop.instanceId, cropId: plot.crop.cropId, growth: plot.crop.growthPermille / 1000,
          x: plot.position[0], y: plot.position[1], z: plot.position[2] });
      }
      if (items.ok) for (const basket of items.value) {
        if (basket.carried) continue;
        for (const content of basket.contents) if (content.quantity > 0) {
          const position = basketFoodPosition(basket.position, basket.contents, content.cropId, content.itemId);
          if (!position) continue;
          targets.push({ id: `${farmId}/basket/${basket.id}/${content.cropId}`, farmId, kind: "basket",
            basketId: basket.id, cropId: content.cropId, itemId: content.itemId,
            x: position[0], y: position[1], z: position[2],
            sourcePosition: basket.position, groundY: basket.position[1] });
        }
      }
      if (containers.ok && catalog.ok) for (const container of containers.value) {
        const appearance = catalog.value.storage.containers.find((entry) => entry.id === container.typeId)?.appearance;
        if (appearance === "cart") for (const part of STORAGE_CART_OBSTACLES)
          blockers.push({ position: container.position, yaw: container.yaw * Math.PI / 180, min: part.min, max: part.max });
        if (!appearance) continue;
        const presenter = api.system.getArea(farmId).storagePresenter;
        for (const content of container.contents) {
          if (content.quantity <= 0) continue;
          const position = presenter?.foodPosition(container.id, content.cropId, content.itemId);
          if (!position) continue;
          targets.push({ id: `${farmId}/container/${container.id}/${content.cropId}`, farmId, kind: "container",
            containerId: container.id, containerTypeId: container.typeId, appearance,
            cropId: content.cropId, itemId: content.itemId, observedQuantity: content.quantity,
            sourcePosition: container.position, sourceYaw: container.yaw, groundY: container.position[1],
            x: position[0], y: position[1], z: position[2] });
        }
      }
    }
    if (this.readApi() === api) { this.targets = targets; this.blockers = blockers; }
  }
}

/** Match the last visible unit of the selected entry, including preceding mixed produce slots. */
function basketFoodPosition(position: readonly number[], contents: readonly BasketContent[], cropId: string, itemId: string):
readonly [number, number, number] | null {
  let slot = 0;
  for (const entry of contents) {
    const end = Math.min(slot + entry.quantity, HARVEST_BASKET_CAPACITY);
    if (entry.cropId === cropId && entry.itemId === itemId && end > slot) {
      const offset = farmBasketProduceSlot(end - 1);
      return [position[0] + offset[0] * FARM_BASKET_CONTENT_SCALE,
        position[1] + offset[1] * FARM_BASKET_CONTENT_SCALE,
        position[2] + offset[2] * FARM_BASKET_CONTENT_SCALE];
    }
    slot = end;
  }
  return null;
}
