import {
  Camera,
  Component,
  DirectLight,
  Entity,
  type Material,
  MeshRenderer,
  Script,
  SkinnedMeshRenderer,
  type Scene
} from "@galacean/engine";
import type { RuntimeEditor } from "@galacean/engine-runtime-editor/runtime-editor/runtime-editor";
import type { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import {
  createSeedWorldHologramRainbowMaterial,
  playHologramRainbowCreateEffect,
  playHologramRainbowDeleteEffect,
  playHologramRainbowUpdateEffect,
  snapshotEntitiesForHologramDissolve,
  type HologramGhostSnapshot
} from "./SeedWorldHologramRainbowEffect";

const SYSTEM_COMPONENT_TYPES = new Set([
  "WaterBodyComponent",
  "BuildingPartComponent",
  "BuildingGroupComponent",
  "FarmingSystem",
  "FarmingAreaComponent",
  "PlanningVegetation",
  "PlanningVegetationPopulation",
  "PlanningVegetationInfluence",
  "PlanningFlowerInfluence",
  "PlanningFlowers",
  "PlanningGrassAppearance",
  "PlanningPlantMaterials",
  "PlanningVegetationResources",
  "PlanningGroundWind"
]);

function isSystemComponentType(type: string | undefined): boolean {
  if (!type) return false;
  return SYSTEM_COMPONENT_TYPES.has(type) || type.startsWith("Planning");
}

function hasAnyMeshRenderer(entity: Entity): boolean {
  if (entity.destroyed || entity.pendingDestroy) return false;
  const renderers = entity.getComponents(MeshRenderer, []);
  for (const r of renderers) {
    if (!r.destroyed && !(r instanceof SkinnedMeshRenderer) && r.mesh) return true;
  }
  for (const child of entity.children) {
    if (hasAnyMeshRenderer(child)) return true;
  }
  return false;
}

function transformSignature(entity: Entity): string {
  const e = entity.transform.worldMatrix.elements;
  let out = "";
  for (let i = 0; i < 16; i++) {
    out += (i ? "," : "") + Math.round(e[i]! * 1000);
  }
  return out;
}

class AsyncGlbArrivalWatcher extends Script {
  private _target?: Entity;
  private _onReady?: (entity: Entity) => void;
  private _onSettled?: () => void;
  private _elapsed = 0;
  private _maxWaitSeconds = 8;
  private _detectedOnce = false;
  private _done = false;

  watch(target: Entity, onReady: (entity: Entity) => void, onSettled?: () => void, maxWaitSeconds = 8): void {
    this._target = target;
    this._onReady = onReady;
    this._onSettled = onSettled;
    this._maxWaitSeconds = maxWaitSeconds;
    this._elapsed = 0;
    this._detectedOnce = false;
    this._done = false;
  }

  private _stop(): void {
    if (this._done) return;
    this._done = true;
    const onSettled = this._onSettled;
    this._target = undefined;
    this._onReady = undefined;
    this._onSettled = undefined;
    onSettled?.();
    if (!this.entity.destroyed) this.entity.destroy();
  }

  override onDestroy(): void {
    if (this._done) return;
    this._done = true;
    const onSettled = this._onSettled;
    this._target = undefined;
    this._onReady = undefined;
    this._onSettled = undefined;
    onSettled?.();
  }

  override onUpdate(deltaTime: number): void {
    if (this._done) return;
    const target = this._target;
    if (!target || target.destroyed || target.pendingDestroy) {
      this._stop();
      return;
    }
    this._elapsed += Math.max(0, Number.isFinite(deltaTime) ? deltaTime : 0);
    if (hasAnyMeshRenderer(target)) {
      if (!this._detectedOnce) {
        // Wait 1 tick so async GLTF loaders attaching sibling sub-meshes settle before snapshot.
        this._detectedOnce = true;
        return;
      }
      const cb = this._onReady;
      this._stop();
      cb?.(target);
      return;
    }
    if (this._elapsed >= this._maxWaitSeconds) {
      this._stop();
    }
  }
}

interface TrackedEntityBefore {
  readonly entity: Entity;
  readonly transformSig: string;
  readonly ghosts: readonly HologramGhostSnapshot[];
}

/**
 * Observes runtime editor activations on the live Scene and plays Satisfactory/Zelda-style
 * shared hologram rainbow print-in / update-shimmer / delete-dissolve effects for user/agent
 * authored native entities (including async GLTF/GLB loader scripts) without modifying PBR shaders.
 */
export class SeedWorldSceneEntityEffectHost {
  readonly warmupMaterials: readonly Material[];
  private readonly unregister: () => void;
  private readonly entityEffects = new Map<Entity, AbortController>();
  private readonly detachedEffects = new Set<AbortController>();
  private readonly watchers = new Set<Entity>();
  private disposed = false;

  constructor(
    project: RuntimeProjectSession,
    private readonly editor: RuntimeEditor,
    private readonly scene: Scene
  ) {
    // Register and hold both hologram materials for startup shader warmup so first GLB print-in compiles zero shaders.
    this.warmupMaterials = [
      createSeedWorldHologramRainbowMaterial(scene.engine, false),
      createSeedWorldHologramRainbowMaterial(scene.engine, true)
    ];

    let beforeMap: Map<string, TrackedEntityBefore> | undefined;
    let applied = false;

    this.unregister = project.registerRuntimeActivation({
      before: async () => {
        applied = false;
        if (this.disposed || this.editor.projection.requiresRecovery) {
          beforeMap = undefined;
          return;
        }
        // Settle any active per-entity hologram effects before the editor mutates live scene entities
        // so Phase-1 material swaps restore original PBR materials cleanly and never clobber new edits.
        this.abortAllEntityEffects();
        beforeMap = this.collectTrackedEntities(true);
      },
      apply: async () => {
        applied = true;
      },
      finish: () => {
        if (!applied) beforeMap = undefined;
      },
      after: async () => {
        if (this.disposed || !applied || !beforeMap) {
          beforeMap = undefined;
          return;
        }
        const previous = beforeMap;
        beforeMap = undefined;
        const next = this.collectTrackedEntities(false);

        const created: Entity[] = [];
        const updated: Entity[] = [];
        const deletedGhosts: HologramGhostSnapshot[] = [];

        for (const [id, entry] of next) {
          const prev = previous.get(id);
          if (!prev) {
            created.push(entry.entity);
          } else if (prev.transformSig !== entry.transformSig && hasAnyMeshRenderer(entry.entity)) {
            updated.push(entry.entity);
          }
        }
        for (const [id, prev] of previous) {
          if (!next.has(id) && prev.ghosts.length) {
            deletedGhosts.push(...prev.ghosts);
          }
        }

        for (const entity of created) {
          if (hasAnyMeshRenderer(entity)) {
            this.runEntityEffect(entity, (signal) => playHologramRainbowCreateEffect([entity], { signal }));
          } else {
            this.watchAsyncMeshArrival(entity);
          }
        }
        for (const entity of updated) {
          this.runEntityEffect(entity, (signal) => playHologramRainbowUpdateEffect([entity], { signal }));
        }
        if (deletedGhosts.length) {
          this.runDetachedEffect((signal) =>
            playHologramRainbowDeleteEffect(this.scene.engine, this.scene, deletedGhosts, { signal })
          );
        }
      }
    });
  }

  private isSystemEntity(entity: Entity): boolean {
    if (entity.getComponent(Camera) || entity.getComponent(DirectLight)) return true;
    const components = entity.getComponents(Component, []);
    const projection = this.editor.projection;
    for (const component of components) {
      let projectedType: string | undefined;
      if (typeof projection.identityOf === "function") {
        try {
          projectedType = projection.identityOf(component)?.type;
        } catch {
          projectedType = undefined;
        }
      }
      if (isSystemComponentType(projectedType) || isSystemComponentType(component.constructor?.name)) {
        return true;
      }
    }
    return false;
  }

  private collectTrackedEntities(withGhosts: boolean): Map<string, TrackedEntityBefore> {
    const map = new Map<string, TrackedEntityBefore>();
    const visit = (entity: Entity) => {
      if (entity.destroyed || entity.pendingDestroy) return;
      const identity = this.editor.projection.sourceIdentity(entity);
      if (identity && !identity.componentId) {
        if (this.isSystemEntity(entity)) return;
        map.set(identity.entityId, {
          entity,
          transformSig: transformSignature(entity),
          ghosts: withGhosts ? snapshotEntitiesForHologramDissolve([entity]) : []
        });
        // Stop descending into children of an authored root entity so multi-part props animate as one unit.
        return;
      }
      for (const child of entity.children) visit(child);
    };
    for (const root of this.scene.rootEntities) visit(root);
    return map;
  }

  private watchAsyncMeshArrival(entity: Entity): void {
    if (this.disposed || entity.destroyed || !entity.scene) return;
    const host = this.scene.createRootEntity("SeedWorldHoloArrivalWatcher");
    this.watchers.add(host);
    const watcher = host.addComponent(AsyncGlbArrivalWatcher);
    watcher.watch(
      entity,
      (readyEntity) => {
        if (this.disposed || readyEntity.destroyed) return;
        this.runEntityEffect(readyEntity, (signal) => playHologramRainbowCreateEffect([readyEntity], { signal }));
      },
      () => {
        this.watchers.delete(host);
      }
    );
  }

  private abortEntityEffect(entity: Entity): void {
    const active = this.entityEffects.get(entity);
    if (!active) return;
    this.entityEffects.delete(entity);
    active.abort();
  }

  private abortAllEntityEffects(): void {
    for (const [entity, controller] of [...this.entityEffects]) {
      this.entityEffects.delete(entity);
      controller.abort();
    }
  }

  private runEntityEffect(entity: Entity, launch: (signal: AbortSignal) => Promise<void>): void {
    if (this.disposed) return;
    this.abortEntityEffect(entity);
    const controller = new AbortController();
    this.entityEffects.set(entity, controller);
    void launch(controller.signal)
      .catch(() => {})
      .finally(() => {
        if (this.entityEffects.get(entity) === controller) this.entityEffects.delete(entity);
      });
  }

  private runDetachedEffect(launch: (signal: AbortSignal) => Promise<void>): void {
    if (this.disposed) return;
    const controller = new AbortController();
    this.detachedEffects.add(controller);
    void launch(controller.signal)
      .catch(() => {})
      .finally(() => {
        this.detachedEffects.delete(controller);
      });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unregister();
    this.abortAllEntityEffects();
    for (const controller of this.detachedEffects) controller.abort();
    this.detachedEffects.clear();
    for (const host of [...this.watchers]) {
      if (!host.destroyed) host.destroy();
    }
    this.watchers.clear();
    for (const material of this.warmupMaterials) {
      if (!material.destroyed) material.destroy();
    }
  }
}
