import {
  Animator,
  AssetType,
  BoundingBox,
  Camera,
  Entity,
  Matrix,
  MeshRenderer,
  ModelMesh,
  PBRMaterial,
  PrefabResource,
  Quaternion,
  Renderer,
  Vector3
} from "@galacean/engine";
import type { FarmingService } from "../application/FarmingService";
import { carriedItem, type FarmItem } from "../domain/FarmItems";
import { FARM_BASKET_CONTENT_SCALE } from "../domain/FarmItemDimensions";
import { registerFarmingPropResources } from "./props/FarmingPropResources";
import { farmItemCarryPose, type FarmItemCarryPoseOverrides } from "./FarmItemCarryPoses";
import { createBasketContentsMesh } from "./harvest/BasketContentsMesh";
import { calibrateFarmItemModel } from "./FarmItemModelScale";
import { SeedSackMaterials } from "./SeedSackMaterials";
import { FarmItemWorkMotion } from "./FarmItemWorkMotion";
import { FarmItemRetraction } from "./FarmItemRetraction";
import { FarmItemLookDownPose } from "./FarmItemLookDownPose";
import { FarmItemHighlight, FARM_ITEM_WARNING_SECONDS, farmItemWarningStrength } from "./FarmItemHighlight";
import { FarmItemGroundPose } from "./FarmItemGroundPose";
import { isNearbyFarmTool } from "../application/FarmingWorkTarget";
import { destroyOwnedMesh, destroyOwnedMeshSet } from "@galacean/engine-terrain/geometry/destroyOwnedMesh";
import { FarmingGrowthVisibility } from "./FarmingGrowthVisibility";

const prefabs = {
  "seed-bag": "Farming/Props/Sowing/seed-sack.prefab",
  hoe: "Farming/Props/Tilling/hoe.prefab",
  "watering-can": "Farming/Props/Watering/watering-can.prefab",
  "harvest-basket": "Farming/Props/Harvest/basket.prefab"
};
interface ItemVisual {
  readonly root: Entity;
  readonly model: Entity;
  highlight?: FarmItemHighlight;
  readonly content: MeshRenderer;
  readonly shadows: { renderer: Renderer; cast: boolean; receive: boolean }[];
  shadowsDisabled: boolean;
  distanceVisible: boolean;
  cargoKey: string;
  cargoMesh?: ModelMesh;
  loading?: Promise<void>;
  error?: string;
  seedId?: string;
  labelRenderer?: MeshRenderer;
  dropFrom?: Vector3;
  dropRotation?: Quaternion;
  dropScale?: Vector3;
  dropProgress?: number;
  groundPose?: FarmItemGroundPose;
  workMotion?: FarmItemWorkMotion;
  retraction?: FarmItemRetraction;
  /** Model-local handoff while the outer root follows its pickup/drop trajectory. */
  transfer?: FarmItemRetraction;
}

/** Sole item renderer: one identity moves between world and camera; imported resources remain borrowed. */
export class FarmItemPresentation {
  readonly root: Entity;
  private readonly visuals = new Map<string, ItemVisual>();
  private readonly meshes = new Set<ModelMesh>();
  private readonly materials: PBRMaterial[] = [];
  private readonly produceMaterial: PBRMaterial;
  private readonly seedSackMaterials = new SeedSackMaterials();
  private readonly release: () => void;
  private disposed = false;
  private elapsed = 0;
  private motion = 1;
  private previousCarry = "";
  private pickupFrom?: Vector3;
  private pickupRotation?: Quaternion;
  private readonly rotation = new Quaternion();
  private readonly rotationTarget = new Quaternion();
  private readonly inverseCamera = new Matrix();
  private readonly lookDownPose = new FarmItemLookDownPose();
  private capacityWarning?: { itemId: string; elapsed: number };
  private using = false;
  private useElapsed = 0;
  private wait?: { remaining: number; duration: number; use: boolean; finish: (ok: boolean) => void };
  private active = true;
  private readonly visibility = new FarmingGrowthVisibility();
  private readonly projected = new Vector3();
  private readonly heldBounds = {
    minimumX: 0,
    minimumY: 0,
    maximumX: 0,
    maximumY: 0,
    visible: false
  };
  constructor(
    parent: Entity,
    private readonly camera: Camera,
    private readonly service: FarmingService,
    private readonly carryPoses: FarmItemCarryPoseOverrides = {}
  ) {
    this.root = parent.createChild("Persistent farming items");
    registerFarmingPropResources(parent.engine);
    this.produceMaterial = new PBRMaterial(parent.engine);
    this.produceMaterial.roughness = 0.9;
    this.materials.push(this.produceMaterial);
    this.release = service.subscribe(() => this.sync());
    this.sync();
  }
  private sync(): void {
    if (this.disposed) return;
    const state = this.service.getSnapshot().items;
    const carry = carriedItem(state);
    const carryId = carry?.id ?? "";
    if (carryId !== this.previousCarry) {
      this.capacityWarning = undefined;
      this.motion = 0;
      const visual = carry && this.visuals.get(carry.id);
      this.pickupFrom = visual?.root.transform.worldPosition.clone();
      this.pickupRotation = visual?.root.transform.worldRotationQuaternion.clone();
      if (this.pickupFrom) {
        Matrix.invert(this.camera.entity.transform.worldMatrix, this.inverseCamera);
        this.pickupFrom.transformCoordinate(this.inverseCamera);
      }
      if (this.pickupRotation) {
        Quaternion.invert(this.camera.entity.transform.worldRotationQuaternion, this.rotation);
        Quaternion.multiply(this.rotation, this.pickupRotation, this.pickupRotation);
      }
      this.previousCarry = carryId;
    }
    for (const item of state.instances) {
      let visual = this.visuals.get(item.id);
      if (!visual) {
        const root = this.root.createChild(item.id),
          model = root.createChild("Model");
        const content = root.createChild("Persistent contents").addComponent(MeshRenderer);
        content.setMaterial(this.produceMaterial);
        content.enableVertexColor = true;
        content.castShadows = false;
        visual = {
          root,
          model,
          content,
          cargoKey: "",
          shadowsDisabled: false,
          distanceVisible: true,
          shadows: [{ renderer: content, cast: content.castShadows, receive: content.receiveShadows }]
        };
        this.visuals.set(item.id, visual);
        visual.seedId = item.seedId;
        this.loadItem(item, visual);
      }
      if (item.type === "seed-bag" && visual.seedId !== item.seedId) {
        visual.seedId = item.seedId;
        if (visual.labelRenderer) this.seedSackMaterials.apply(visual.labelRenderer, item.seedId);
      }
      const key = JSON.stringify(item.contents);
      if (visual.cargoKey !== key) {
        visual.content.mesh = null!;
        destroyOwnedMesh(visual.cargoMesh);
        visual.cargoMesh = item.contents.length ? createBasketContentsMesh(this.root.engine, item.contents) : undefined;
        visual.content.mesh = visual.cargoMesh ?? null!;
        visual.cargoKey = key;
      }
      const held = item.id === carry?.id;
      this.setHeldShadows(visual, held);
      const parent = held ? this.camera.entity : this.root;
      if (visual.root.parent !== parent) {
        if (!held && visual.root.parent === this.camera.entity) {
          visual.dropFrom = visual.root.transform.worldPosition.clone();
          visual.dropRotation = visual.root.transform.worldRotationQuaternion.clone();
          visual.dropScale = visual.root.transform.lossyWorldScale.clone();
          visual.dropProgress = 0;
        }
        if (held) visual.dropFrom = undefined;
        if (visual.retraction || visual.transfer) {
          // Capture the visible hierarchy before restoring the old transition's targets.
          // Model stays under the same root; only that root changes coordinate space.
          const transfer = new FarmItemRetraction(visual.model, held ? 0.35 : 0.36);
          visual.retraction?.restore();
          visual.transfer?.restore();
          visual.retraction = undefined;
          visual.transfer = transfer;
        }
        parent.addChild(visual.root);
      }
      if (!held) {
        visual.root.transform.setWorldPosition(...item.position);
        visual.root.transform.setWorldRotation(0, item.yaw ?? 0, 0);
        visual.root.transform.setScale(1, 1, 1);
      }
    }
    this.update(0);
  }
  private loadItem(item: Pick<FarmItem, "type">, visual: ItemVisual): void {
    visual.loading = Promise.resolve(
      this.root.engine.resourceManager.load<PrefabResource>({
        url: prefabs[item.type],
        type: AssetType.Prefab
      })
    )
      .then((prefab) => {
        if (this.disposed || visual.root.destroyed) return;
        const model = prefab.instantiate();
        // Tool prefabs default to inactive for their animation hosts; persistent props must be visible.
        model.isActive = true;
        visual.model.addChild(model);
        for (const animator of model.getComponentsIncludeChildren(Animator, [])) animator.enabled = false;
        const renderers = model.getComponentsIncludeChildren(Renderer, []);
        visual.shadows.push(
          ...renderers.map((renderer) => ({
            renderer,
            cast: renderer.castShadows,
            receive: renderer.receiveShadows
          }))
        );
        // The item may have been picked up or put down while its prefab was loading.
        this.setHeldShadows(visual, visual.root.parent === this.camera.entity, true);
        const meshes = renderers.flatMap((renderer) =>
          renderer instanceof MeshRenderer && renderer.mesh
            ? [{ entity: renderer.entity, bounds: renderer.mesh.bounds }]
            : []
        );
        calibrateFarmItemModel(model, item.type, meshes);
        if (item.type === "harvest-basket")
          visual.content.entity.transform.setScale(
            FARM_BASKET_CONTENT_SCALE,
            FARM_BASKET_CONTENT_SCALE,
            FARM_BASKET_CONTENT_SCALE
          );
        if (item.type === "seed-bag") {
          const label = model.findByName("SeedSackLabel")?.getComponent(MeshRenderer);
          if (!label) throw new Error("Missing SeedSackLabel renderer");
          visual.labelRenderer = label;
          this.seedSackMaterials.apply(label, visual.seedId);
        }
        if (item.type === "hoe") {
          const shaft = model.findByName("HoeTool_LOD0");
          if (!shaft) throw new Error(`Missing ${item.type} shaft mesh`);
          visual.groundPose = new FarmItemGroundPose(
            visual.model,
            shaft,
            renderers.flatMap((renderer) =>
              renderer instanceof MeshRenderer && renderer.mesh
                ? [{ entity: renderer.entity, bounds: renderer.mesh.bounds }]
                : []
            )
          );
          this.update(0);
        }
        visual.highlight = new FarmItemHighlight(renderers.filter((r): r is MeshRenderer => r instanceof MeshRenderer));
        this.update(0);
      })
      .catch((error) => {
        if (!this.disposed) visual.error = String(error);
      });
  }
  private setHeldShadows(visual: ItemVisual, held: boolean, force = false): void {
    if (!force && visual.shadowsDisabled === held) return;
    visual.shadowsDisabled = held;
    for (const { renderer, cast, receive } of visual.shadows) {
      renderer.castShadows = held ? false : cast;
      renderer.receiveShadows = held ? false : receive;
    }
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.wait?.finish(false);
      this.capacityWarning = undefined;
      for (const visual of this.visuals.values()) visual.highlight?.update(false);
    }
    this.root.isActive = active;
    for (const visual of this.visuals.values())
      if (visual.root.parent === this.camera.entity) visual.root.isActive = active;
  }
  /** A receipt targets the basket used for that attempt, never a subsequently carried prop. */
  flashCapacityWarning(itemId: string): void {
    const held = carriedItem(this.service.getSnapshot().items);
    if (this.disposed || !this.active || held?.id !== itemId || held.type !== "harvest-basket") return;
    this.capacityWarning = { itemId, elapsed: 0 };
    this.visuals.get(itemId)?.highlight?.update(false, 1);
  }
  setUsing(using: boolean): void {
    if (using && !this.using) this.useElapsed = 0;
    if (!using && this.using && this.active && !this.disposed) {
      const held = carriedItem(this.service.getSnapshot().items);
      const visual = held && this.visuals.get(held.id);
      if (visual) visual.retraction = new FarmItemRetraction(visual.root);
    }
    this.using = using;
    if (!using) this.wait?.finish(false);
  }
  async prepareHeld(signal: AbortSignal): Promise<boolean> {
    const held = carriedItem(this.service.getSnapshot().items);
    const visual = held && this.visuals.get(held.id);
    if (visual?.loading) await visual.loading;
    const remaining = Math.max(visual?.retraction?.remaining ?? 0, visual?.transfer?.remaining ?? 0);
    if (remaining > 0 && !signal.aborted && !(await this.waitFor(remaining, signal))) return false;
    return !this.disposed && this.active && !signal.aborted && !visual?.error;
  }
  followWork(source: Entity, weight: number): void {
    const held = carriedItem(this.service.getSnapshot().items);
    const visual = held && this.visuals.get(held.id);
    const model = visual?.model.children[0];
    if (!visual || !model || !isNearbyFarmTool(held?.type)) return;
    visual.workMotion ??= new FarmItemWorkMotion(model);
    visual.workMotion.apply(source, weight);
    this.updateHeldBounds(visual);
  }
  async prepareUse(seconds: number, signal: AbortSignal): Promise<boolean> {
    const item = carriedItem(this.service.getSnapshot().items);
    const visual = item && this.visuals.get(item.id);
    if (visual?.loading) await visual.loading;
    if (this.disposed || !this.active || signal.aborted || visual?.error) return false;
    this.using = true;
    return this.waitFor(seconds, signal, true);
  }
  waitForMotion(signal: AbortSignal): Promise<boolean> {
    return this.waitFor(0.36, signal);
  }
  get useProgress(): number | null {
    const wait = this.wait;
    return this.using && wait?.use ? Math.max(0, Math.min(1, 1 - wait.remaining / wait.duration)) : null;
  }
  private waitFor(seconds: number, signal: AbortSignal, use = false): Promise<boolean> {
    this.wait?.finish(false);
    if (signal.aborted || this.disposed || !this.active) return Promise.resolve(false);
    return new Promise((resolve) => {
      const abort = () => finish(false);
      const finish = (ok: boolean) => {
        if (this.wait?.finish !== finish) return;
        this.wait = undefined;
        signal.removeEventListener("abort", abort);
        resolve(ok);
      };
      this.wait = { remaining: seconds, duration: seconds, use, finish };
      signal.addEventListener("abort", abort, { once: true });
    });
  }
  update(seconds: number): void {
    if (this.disposed || !this.active) return;
    if (this.wait) {
      this.wait.remaining -= seconds;
      if (this.wait.remaining <= 0) this.wait.finish(true);
    }
    this.elapsed += seconds;
    if (this.using) this.useElapsed += seconds;
    this.motion = Math.min(1, this.motion + seconds / 0.35);
    const state = this.service.getSnapshot().items,
      held = carriedItem(state);
    if (this.capacityWarning) {
      this.capacityWarning.elapsed += seconds;
      if (this.capacityWarning.itemId !== held?.id || this.capacityWarning.elapsed >= FARM_ITEM_WARNING_SECONDS)
        this.capacityWarning = undefined;
    }
    const warningStrength = this.capacityWarning ? farmItemWarningStrength(this.capacityWarning.elapsed) : 0;
    this.heldBounds.visible = false;
    const cameraPosition = this.camera.entity.transform.worldPosition;
    for (const [id, visual] of this.visuals) {
      const carried = id === held?.id;
      // Finish moving props off-screen, but skip pose/material work for settled distant items.
      if (
        !carried &&
        !visual.distanceVisible &&
        !visual.dropFrom &&
        !visual.transfer &&
        !visual.retraction &&
        !this.visibility.withinDrawDistance(visual.root.transform.worldPosition, cameraPosition, false)
      )
        continue;
      visual.retraction?.restore();
      visual.transfer?.restore();
      visual.workMotion?.restore();
      if (carried) {
        visual.distanceVisible = true;
        if (!visual.root.isActive) visual.root.isActive = true;
        const pose = farmItemCarryPose(held!.type, this.camera.aspectRatio < 1, this.carryPoses);
        const [x, y, z] = pose.position;
        const progress = this.motion * this.motion * (3 - 2 * this.motion);
        visual.groundPose?.apply(1 - progress);
        const from = this.pickupFrom;
        const nearbyTool = isNearbyFarmTool(held?.type);
        const use = this.using && !nearbyTool ? (1 - Math.cos(this.useElapsed * 8)) * 0.5 : 0;
        const action = use * 0.035;
        visual.root.transform.setPosition(
          from ? from.x + (x - from.x) * progress : x,
          (from ? from.y + (y - from.y) * progress : y - (1 - progress) * 0.3) +
            Math.sin(this.elapsed * 2) * 0.003 * (from ? progress : 1) +
            action,
          (from ? from.z + (z - from.z) * progress : z) + action
        );
        visual.root.transform.setRotation(
          pose.rotation[0] + pose.useRotation[0] * use,
          pose.rotation[1] + pose.useRotation[1] * use,
          pose.rotation[2] + pose.useRotation[2] * use
        );
        if (held!.type === "harvest-basket") {
          // Keep the calibrated basket opening upright even when the camera looks down.
          // Camera right retains heading at vertical pitch, unlike its horizontal forward vector.
          const right = this.camera.entity.transform.worldRight;
          const yaw = (Math.atan2(-right.z, right.x) * 180) / Math.PI;
          visual.root.transform.setWorldRotation(0, yaw + pose.rotation[1], 0);
        }
        if (this.pickupRotation && progress < 1) {
          this.rotationTarget.copyFrom(visual.root.transform.rotationQuaternion);
          Quaternion.slerp(this.pickupRotation, this.rotationTarget, progress, this.rotation);
          visual.root.transform.rotationQuaternion = this.rotation;
        }
        visual.root.transform.setScale(1, 1, 1);
        this.lookDownPose.apply(
          visual.root.transform,
          held!.type,
          this.camera.entity.transform.worldForward.y,
          progress,
          this.camera.aspectRatio < 1
        );
        if (visual.transfer && !visual.transfer.apply(seconds)) visual.transfer = undefined;
        if (visual.retraction && !visual.retraction.apply(seconds)) visual.retraction = undefined;
        visual.highlight?.update(false, warningStrength);
        this.updateHeldBounds(visual);
      } else {
        visual.retraction = undefined;
        if (visual.dropFrom) {
          const item = state.instances.find((item) => item.id === id);
          if (item) {
            visual.dropProgress = Math.min(1, (visual.dropProgress ?? 0) + seconds / 0.36);
            const p = visual.dropProgress * visual.dropProgress * (3 - 2 * visual.dropProgress);
            visual.groundPose?.apply(p);
            Quaternion.rotationEuler(0, ((item.yaw ?? 0) * Math.PI) / 180, 0, this.rotationTarget);
            Quaternion.slerp(visual.dropRotation!, this.rotationTarget, p, this.rotation);
            visual.root.transform.worldRotationQuaternion = this.rotation;
            const scale = visual.dropScale!;
            visual.root.transform.setScale(
              scale.x + (1 - scale.x) * p,
              scale.y + (1 - scale.y) * p,
              scale.z + (1 - scale.z) * p
            );
            visual.root.transform.setWorldPosition(
              visual.dropFrom.x + (item.position[0] - visual.dropFrom.x) * p,
              visual.dropFrom.y +
                (item.position[1] - visual.dropFrom.y) * p +
                Math.sin(Math.PI * visual.dropProgress) * 0.12,
              visual.dropFrom.z + (item.position[2] - visual.dropFrom.z) * p
            );
            if (visual.dropProgress === 1) visual.dropFrom = undefined;
          }
        } else {
          visual.groundPose?.apply(1);
        }
        if (visual.transfer && !visual.transfer.apply(seconds)) visual.transfer = undefined;
        const position = visual.root.transform.worldPosition;
        visual.distanceVisible = this.visibility.withinDrawDistance(position, cameraPosition, visual.distanceVisible);
        if (visual.root.isActive !== visual.distanceVisible) visual.root.isActive = visual.distanceVisible;
        visual.highlight?.update(
          visual.distanceVisible && Vector3.distanceSquared(cameraPosition, position) < 64 && !visual.dropFrom
        );
      }
    }
  }
  private updateHeldBounds(visual: ItemVisual): void {
    const bounds = this.heldBounds;
    bounds.minimumX = Infinity;
    bounds.minimumY = Infinity;
    bounds.maximumX = -Infinity;
    bounds.maximumY = -Infinity;
    const renderers = visual.root.getComponentsIncludeChildren(Renderer, []);
    for (const renderer of renderers) {
      if (!renderer.entity.isActiveInHierarchy) continue;
      const mesh = renderer instanceof MeshRenderer ? renderer.mesh : undefined;
      if (renderer instanceof MeshRenderer && !mesh) continue;
      const b = mesh?.bounds ?? renderer.bounds;
      for (const x of [b.min.x, b.max.x])
        for (const y of [b.min.y, b.max.y])
          for (const z of [b.min.z, b.max.z]) {
            this.projected.set(x, y, z);
            if (mesh) this.projected.transformCoordinate(renderer.entity.transform.worldMatrix);
            this.camera.worldToScreenPoint(this.projected, this.projected);
            if (this.projected.z <= 0) continue;
            bounds.minimumX = Math.min(bounds.minimumX, this.projected.x);
            bounds.minimumY = Math.min(bounds.minimumY, this.projected.y);
            bounds.maximumX = Math.max(bounds.maximumX, this.projected.x);
            bounds.maximumY = Math.max(bounds.maximumY, this.projected.y);
          }
    }
    bounds.visible = Number.isFinite(bounds.minimumX);
  }
  hitHeld(x: number, y: number): boolean {
    const b = this.heldBounds;
    return this.active && b.visible && x >= b.minimumX && x <= b.maximumX && y >= b.minimumY && y <= b.maximumY;
  }
  worldBounds(id: string): BoundingBox | null {
    const visual = this.visuals.get(id);
    if (!visual || visual.root.parent !== this.root || !visual.root.isActiveInHierarchy) return null;
    const bounds = new BoundingBox(
      new Vector3(Infinity, Infinity, Infinity),
      new Vector3(-Infinity, -Infinity, -Infinity)
    );
    for (const renderer of visual.model.getComponentsIncludeChildren(Renderer, []))
      if (renderer.entity.isActiveInHierarchy) BoundingBox.merge(bounds, renderer.bounds, bounds);
    if (visual.cargoMesh) BoundingBox.merge(bounds, visual.content.bounds, bounds);
    return Number.isFinite(bounds.min.x) ? bounds : null;
  }
  get diagnostics() {
    return {
      itemCount: this.service.getSnapshot().items.instances.length,
      glowCount: [...this.visuals.values()].filter((v) => v.highlight?.active).length,
      sparkCount: 0,
      particleRenderers: 0,
      contentsBatches: [...this.visuals.values()].filter((v) => v.cargoMesh).length,
      heldBounds: { ...this.heldBounds },
      capacityWarning: this.capacityWarning ? { ...this.capacityWarning } : null,
      errors: [...this.visuals.values()].flatMap((v) => (v.error ? [v.error] : []))
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.wait?.finish(false);
    this.disposed = true;
    this.release();
    for (const visual of this.visuals.values()) {
      visual.content.mesh = null!;
      visual.highlight?.dispose();
      visual.root.destroy();
      destroyOwnedMesh(visual.cargoMesh);
    }
    this.visuals.clear();
    this.root.destroy();
    destroyOwnedMeshSet(this.meshes);
    for (const material of this.materials) material.destroy();
    this.seedSackMaterials.dispose();
  }
}
