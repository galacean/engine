import { AssetType, Entity, PBRMaterial, PrefabResource, Renderer, Vector3 } from "@galacean/engine";
import { FarmingGrowthVisibility } from "../FarmingGrowthVisibility";
import type { FarmingService } from "../../application/FarmingService";
import type { FarmingDefinitionSet } from "../../domain/FarmDefinitions";
import type { FarmSnapshot } from "../../domain/FarmState";
import type { StorageContainerState } from "../../storage/StorageTypes";
import { storageDefinitions } from "../../storage/StorageRules";
import { registerFarmingPropResources } from "../props/FarmingPropResources";
import { StorageProduceLibrary } from "./StorageProduceLibrary";
import { storageProduceSlots } from "./StorageProduceLayout";
import {
  containerContents,
  containerQuantity,
  storageDisplayCapacity,
  visibleContainerContents
} from "../../storage/StorageContents";

interface ContainerView {
  root: Entity;
  label: string;
  cropId: string | null;
  units: Entity[];
  unitCrops: string[];
  unitLocals: (readonly [number, number, number])[];
  state: StorageContainerState;
  distanceVisible: boolean;
}
export interface StoragePresentationSnapshot {
  readonly ready: boolean;
  readonly error: string | null;
  readonly containers: readonly {
    id: string;
    cropId: string | null;
    quantity: number;
    renderedQuantity: number;
    label: string;
  }[];
}

/** World-space inventory view. Only confirmed snapshots create/remove cargo; animation never writes storage. */
export class StorageContainerPresenter {
  readonly root: Entity;
  private readonly views = new Map<string, ContainerView>();
  private readonly prefabs = new Map<"cart" | "basket", PrefabResource>();
  private readonly produce: StorageProduceLibrary;
  private readonly unsubscribe: () => void;
  private readonly appearing = new Map<Entity, { time: number; scale: number }>();
  private previous?: FarmSnapshot["storage"];
  private loading?: Promise<void>;
  private disposed = false;
  private error: string | null = null;
  private deferOffscreenLoad: boolean;
  private readonly visibility = new FarmingGrowthVisibility();
  private readonly containerPosition = new Vector3();
  constructor(
    parent: Entity,
    private readonly service: FarmingService,
    private readonly definitions: FarmingDefinitionSet,
    private readonly getViewerPosition?: () => Vector3 | undefined,
    deferOffscreenLoad = false,
    private readonly isPositionVisible?: (position: Vector3) => boolean
  ) {
    this.deferOffscreenLoad = deferOffscreenLoad;
    // Persisted ground coordinates are world-space, independent of an area's transform or clone hierarchy.
    this.root = parent.scene!.createRootEntity(`Farming Warehouse/${service.getSnapshot().farmId}`);
    this.produce = new StorageProduceLibrary(parent.engine);
    registerFarmingPropResources(parent.engine);
    this.unsubscribe = service.subscribe(({ snapshot, changes }) => {
      if (snapshot.storage !== this.previous) {
        try {
          this.reconcile(
            snapshot,
            changes.some((c) => c.kind === "crop-harvested")
          );
        } catch (error) {
          this.error = String(error);
          this.loading = undefined;
          throw error;
        }
      }
    });
  }
  setDeferOffscreenLoad(defer: boolean): void {
    this.deferOffscreenLoad = defer;
    if (
      !defer &&
      !this.disposed &&
      !this.loading &&
      !this.error &&
      this.prefabs.size < 2 &&
      this.hasNearbyContainer(false)
    ) {
      void this.prepare().catch(() => {});
    }
  }
  private hasNearbyContainer(requireFrustum: boolean): boolean {
    const containers = this.service.getSnapshot().storage.containers;
    if (containers.length === 0) return false;
    const viewer = this.getViewerPosition?.();
    if (!viewer) return true;
    for (let i = 0; i < containers.length; i++) {
      const pos = containers[i].position;
      this.containerPosition.set(pos[0], pos[1], pos[2]);
      if (!this.visibility.withinDrawDistance(this.containerPosition, viewer, false)) continue;
      if (!requireFrustum || !this.isPositionVisible || this.isPositionVisible(this.containerPosition)) return true;
    }
    return false;
  }
  prepare(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.loading) return this.loading;
    if (this.deferOffscreenLoad && !this.hasNearbyContainer(true)) return Promise.resolve();
    this.error = null;
    this.loading = Promise.all(
      (["cart", "basket"] as const).map(async (type) => {
        const prefab = await this.root.engine.resourceManager.load<PrefabResource>({
          url: `Farming/Props/Storage/${type}.prefab`,
          type: AssetType.Prefab
        });
        if (!this.disposed) this.prefabs.set(type, prefab);
      })
    )
      .then(() => {
        if (this.disposed) return;
        this.error = null;
        this.previous = undefined;
        this.reconcile(this.service.getSnapshot(), false);
      })
      .catch((error) => {
        if (!this.disposed) {
          this.error = String(error);
          this.loading = undefined;
        }
        throw error;
      });
    return this.loading;
  }
  setActive(active: boolean): void {
    if (!this.disposed) this.root.isActive = active;
  }
  /** Pointer interaction follows the rendered hierarchy, including distance hysteresis and loading. */
  isContainerVisible(id: string): boolean {
    return !this.disposed && !!this.views.get(id)?.root.isActiveInHierarchy;
  }
  /** Single authoritative world-position formula shared by deferred and materialized cargo slots. */
  private slotWorldPosition(
    state: StorageContainerState,
    local: readonly [number, number, number]
  ): readonly [number, number, number] {
    const [lx, ly, lz] = local;
    if (state.yaw === 0) {
      return [state.position[0] + lx, state.position[1] + ly, state.position[2] + lz];
    }
    if (state.yaw === 90) {
      return [state.position[0] + lz, state.position[1] + ly, state.position[2] - lx];
    }
    const rad = (state.yaw * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return [state.position[0] + lx * cos + lz * sin, state.position[1] + ly, state.position[2] - lx * sin + lz * cos];
  }
  /**
   * Read the world centre of the last visible unit belonging to a cargo stack.
   * Both materialized and distance-deferred containers use the same deterministic slot formula so
   * strict equality checks stay stable across draw-distance transitions; absent cargo returns null.
   * @param containerId Stable container identity.
   * @param cropId Crop species bound to the observed stack.
   * @param itemId Inventory item bound to the observed stack.
   * @returns A detached world position, or null if that stack has no visible cargo unit.
   */
  foodPosition(containerId: string, cropId: string, itemId: string): readonly [number, number, number] | null {
    if (this.disposed) return null;
    const view = this.views.get(containerId);
    if (view) {
      let end = 0;
      for (const entry of containerContents(view.state)) {
        const start = end;
        end = Math.min(view.units.length, end + entry.quantity);
        if (entry.cropId === cropId && entry.itemId === itemId && end > start) {
          return this.slotWorldPosition(view.state, view.unitLocals[end - 1]);
        }
        if (end === view.units.length) break;
      }
      return null;
    }
    // Distance-deferred containers have not instantiated visual prefabs yet; compute the exact same
    // produce slot world position analytically so distant animals can still locate stored food.
    const state = this.service.getSnapshot().storage.containers.find((c) => c.id === containerId);
    if (!state) return null;
    const rules = storageDefinitions(this.definitions);
    const type = rules.containers.find((t) => t.id === state.typeId);
    if (!type) return null;
    const visible = visibleContainerContents(state, rules);
    const crops = visible.flatMap((entry) => Array<string>(entry.quantity).fill(entry.cropId));
    if (!crops.length) return null;
    let end = 0;
    let targetIndex = -1;
    for (const entry of containerContents(state)) {
      const start = end;
      end = Math.min(crops.length, end + entry.quantity);
      if (entry.cropId === cropId && entry.itemId === itemId && end > start) {
        targetIndex = end - 1;
        break;
      }
      if (end === crops.length) break;
    }
    if (targetIndex < 0) return null;
    const capacity = storageDisplayCapacity(state, rules);
    const slots = storageProduceSlots(type.appearance, crops, capacity, (id) => this.produce.dimensions(id));
    return this.slotWorldPosition(state, slots[targetIndex].position);
  }
  update(seconds: number): void {
    if (this.disposed) return;
    if (!this.loading && !this.error && this.prefabs.size < 2) {
      if (this.hasNearbyContainer(this.deferOffscreenLoad)) {
        void this.prepare().catch(() => {});
      }
    }
    this.updateVisibility();
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    for (const [unit, state] of this.appearing) {
      state.time += seconds;
      const t = Math.min(1, state.time / 2),
        scale = state.scale * Math.max(0.01, t * t * (3 - 2 * t));
      unit.transform.setScale(scale, scale, scale);
      if (t === 1) this.appearing.delete(unit);
    }
  }
  snapshot(): StoragePresentationSnapshot {
    // Align with FarmingWorldPresentation: offscreen/distance-deferred or empty-container states are
    // not "pending"; only active prefab loading or an unloaded nearby container blocks readiness.
    const deferredOrIdle = !this.loading && !this.hasNearbyContainer(this.deferOffscreenLoad);
    return {
      ready: !this.disposed && !this.error && (this.prefabs.size === 2 || deferredOrIdle),
      error: this.error,
      containers: [...this.views].map(([id, view]) => ({
        id,
        cropId: containerContents(view.state).length === 1 ? view.cropId : null,
        quantity: containerQuantity(view.state),
        renderedQuantity: view.units.length,
        label: view.label
      }))
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe();
    this.appearing.clear();
    this.produce.detach(this.root);
    this.views.clear();
    this.root.destroy();
    this.produce.dispose();
    this.prefabs.clear();
  }
  private reconcile(snapshot: FarmSnapshot, animate: boolean): void {
    if (this.disposed || this.prefabs.size !== 2) return;
    const rules = storageDefinitions(this.definitions),
      current = new Set(snapshot.storage.containers.map((c) => c.id));
    for (const [id, view] of this.views)
      if (!current.has(id)) {
        for (const unit of view.units) this.appearing.delete(unit);
        view.root.destroy();
        this.views.delete(id);
      }
    for (const state of snapshot.storage.containers) {
      const type = rules.containers.find((t) => t.id === state.typeId)!;
      let view = this.views.get(state.id);
      if (!view) {
        const root = this.root.createChild(state.id),
          prop = this.prefabs.get(type.appearance)!.instantiate();
        root.addChild(prop);
        for (const renderer of prop.getComponentsIncludeChildren(Renderer, [])) {
          for (const material of renderer.getMaterials()) {
            if (material instanceof PBRMaterial) material.screenSpaceReflectionIntensity = 0;
          }
          if (type.appearance === "cart") {
            renderer.castShadows = false;
            renderer.receiveShadows = false;
          }
        }
        view = {
          root,
          label: "",
          units: [],
          unitCrops: [],
          unitLocals: [],
          cropId: null,
          state,
          distanceVisible: true
        };
        this.views.set(state.id, view);
      }
      view.root.transform.setWorldPosition(...state.position);
      view.root.transform.setWorldRotation(0, state.yaw, 0);
      const visible = visibleContainerContents(state, rules);
      const crops = visible.flatMap((entry) => Array<string>(entry.quantity).fill(entry.cropId));
      const capacity = storageDisplayCapacity(state, rules);
      while (view.units.length > crops.length) {
        const unit = view.units.pop()!;
        view.unitCrops.pop();
        view.unitLocals.pop();
        this.appearing.delete(unit);
        unit.destroy();
      }
      if (crops.length) {
        if (crops.some((cropId, index) => view!.unitCrops[index] !== cropId)) {
          const slots = storageProduceSlots(type.appearance, crops, capacity, (cropId) =>
            this.produce.dimensions(cropId)
          );
          for (let index = 0; index < crops.length; index++) {
            const cropId = crops[index];
            const slot = slots[index];
            view.unitLocals[index] = slot.position;
            if (view.unitCrops[index] === cropId) {
              view.units[index].transform.setPosition(...slot.position);
              continue;
            }
            const old = view.units[index];
            if (old) {
              this.appearing.delete(old);
              old.destroy();
            }
            const unit = this.produce.create(view.root, cropId, `${state.id}/unit-${index}`);
            unit.transform.setPosition(...slot.position);
            if (slot.yaw) unit.transform.setRotation(0, slot.yaw, 0);
            unit.transform.setScale(slot.scale, slot.scale, slot.scale);
            view.units[index] = unit;
            view.unitCrops[index] = cropId;
            if (animate) {
              this.appearing.set(unit, { time: 0, scale: slot.scale });
              unit.transform.setScale(0.001, 0.001, 0.001);
            }
          }
        }
        view.label = containerContents(state)
          .map(
            (entry) =>
              `${this.definitions.catalog.crops.find((c) => c.id === entry.cropId)!.name} ${entry.quantity}${rules.crops[entry.cropId].unit}`
          )
          .join(" · ");
        if (type.appearance === "cart") view.label += ` · 展示 ${crops.length}/${capacity}`;
      } else view.label = `${type.name} · 空载`;
      view.cropId = state.cropId;
      view.state = state;
    }
    this.previous = snapshot.storage;
    this.updateVisibility();
  }
  private updateVisibility(): void {
    const position = this.getViewerPosition?.();
    if (!position) return;
    for (const view of this.views.values()) {
      view.distanceVisible = this.visibility.withinDrawDistance(
        view.root.transform.worldPosition,
        position,
        view.distanceVisible
      );
      // Hide each container together with its cargo, retaining inventory and cached resources.
      if (view.root.isActive !== view.distanceVisible) view.root.isActive = view.distanceVisible;
    }
  }
}
