import { AssetType, Camera, Entity, PrefabResource, Vector3 } from "@galacean/engine";
import motion from "../../assets/harvest/basket-motion.json";
import { registerFarmingPropResources } from "../props/FarmingPropResources";
import { HarvestBasketState, type BasketBatch, type HarvestBasketInput } from "./HarvestBasketState";
import { HARVEST_PRODUCE_IDS, HarvestProduce } from "./HarvestProduce";
import { DEFAULT_HARVEST_SECONDS } from "../PlantHarvestEffect";

/** View-attached presentation API, reusable by a host/UI/AI without writing inventory. */
export class HarvestBasketPresenter {
  readonly state = new HarvestBasketState();
  readonly root: Entity;
  private readonly contents: Entity;
  private readonly produce = new Map<BasketBatch, HarvestProduce>();
  private basket?: Entity;
  private disposed = false;
  private loading?: Promise<void>;
  private readonly position = new Vector3();
  private error?: string;
  private readonly showWaiters = new Set<(shown: boolean) => void>();
  private showGeneration = 0;
  constructor(private readonly camera: Camera) {
    this.root = camera.entity.createChild("harvest-held-basket");
    this.contents = this.root.createChild("harvest-products");
    this.contents.transform.setRotation(-55, 0, 0);
    this.root.isActive = false;
    registerFarmingPropResources(camera.engine);
  }
  get ready(): boolean {
    return !this.disposed && Boolean(this.basket);
  }
  async prepare(): Promise<void> {
    if (this.disposed) return;
    if (this.loading) return this.loading;
    this.loading = this.load().catch((error) => {
      if (this.disposed) return;
      this.loading = undefined;
      this.error = String(error);
      throw error;
    });
    return this.loading;
  }
  private async load(): Promise<void> {
    const prefab = await this.camera.engine.resourceManager.load<PrefabResource>({
      url: "Farming/Props/Harvest/basket.prefab",
      type: AssetType.Prefab
    });
    if (this.disposed) return;
    this.basket = prefab.instantiate();
    this.root.addChild(this.basket);
    this.error = undefined;
    this.render();
  }
  show(): void {
    if (this.disposed) return;
    this.state.show();
    this.ensureLoaded();
    this.render();
  }
  /** Await the held pose before committing a harvest. The host must keep driving update(). */
  async showForHarvest(): Promise<boolean> {
    if (this.disposed) return false;
    const generation = this.showGeneration;
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const finish = (shown: boolean) => {
        if (settled) return;
        settled = true;
        this.showWaiters.delete(finish);
        resolve(shown);
      };
      // Cancellation covers loading as well as the entrance animation, without cancelling the shared load.
      this.showWaiters.add(finish);
      void this.prepare()
        .then(() => {
          if (settled) return;
          if (this.disposed || generation !== this.showGeneration) {
            finish(false);
            return;
          }
          this.show();
          if (this.state.phase === "held") finish(true);
        })
        .catch((error) => {
          if (settled) return;
          settled = true;
          this.showWaiters.delete(finish);
          reject(error);
        });
    });
  }
  private settleShowWaiters(shown: boolean): void {
    for (const resolve of this.showWaiters) resolve(shown);
    this.showWaiters.clear();
  }
  hide(): void {
    if (this.disposed) return;
    this.showGeneration++;
    this.settleShowWaiters(false);
    this.state.hide();
    this.render();
  }
  receive(input: HarvestBasketInput): boolean {
    if (!HARVEST_PRODUCE_IDS.includes(input.cropId) || this.disposed) return false;
    const received = this.state.receive(input);
    if (received) {
      this.ensureLoaded();
      this.render();
    }
    return received;
  }
  private ensureLoaded(): void {
    void this.prepare().catch((error) => console.error("Harvest basket load failed", error));
  }
  update(seconds: number): void {
    if (!this.disposed && this.ready) {
      this.state.update(seconds);
      this.render();
      if (this.state.phase === "held") this.settleShowWaiters(true);
      else if (this.state.phase === "hidden") this.settleShowWaiters(false);
    }
  }
  reset(): void {
    if (this.disposed) return;
    this.showGeneration++;
    this.settleShowWaiters(false);
    this.state.reset();
    this.render();
  }
  snapshot() {
    return {
      ready: this.ready,
      error: this.error,
      phase: this.state.phase,
      time: this.state.time,

      amount: this.state.amount,
      position: this.position.clone(),
      batches: this.state.batches.map((b) => ({
        ...b,
        visibility: Math.max(0, Math.min(1, (this.state.time - b.revealAt) / DEFAULT_HARVEST_SECONDS))
      }))
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.showGeneration++;
    this.settleShowWaiters(false);
    for (const item of this.produce.values()) item.dispose();
    this.produce.clear();
    this.state.reset();
    this.basket = undefined;
    this.root.destroy();
  }
  private render(): void {
    this.root.isActive = this.ready && this.state.amount > 0;
    // Same sampled Blender trajectory; reverse on hide, retaining continuity on interruption.
    const samples = motion.clips.Basket_Show.positions;
    const frame = this.state.amount * (samples.length - 1),
      index = Math.min(samples.length - 2, Math.floor(frame)),
      blend = frame - index;
    const a = samples[index],
      b = samples[index + 1];
    this.position.set(a[0] + (b[0] - a[0]) * blend, a[1] + (b[1] - a[1]) * blend, a[2] + (b[2] - a[2]) * blend);
    // Approved portrait adjustment: fades in along the path, with original metre scale.
    if (this.camera.aspectRatio < 1) {
      this.position.x += 0.12 * this.state.amount;
      this.position.y -= 0.28 * this.state.amount;
      this.position.z -= 0.8 * this.state.amount;
    }
    let feedback = 0;
    for (const batch of this.state.batches) {
      const t = this.state.time - batch.revealAt;
      if (t >= 0 && t < 0.45) feedback -= 0.006 * Math.sin((Math.PI * t) / 0.45);
    }
    this.position.y += feedback;
    this.root.transform.setPosition(this.position.x, this.position.y, this.position.z);
    for (const [batch, item] of this.produce)
      if (!this.state.batches.includes(batch)) {
        item.dispose();
        this.produce.delete(batch);
      }
    if (this.ready)
      for (const batch of this.state.batches) {
        let item = this.produce.get(batch);
        if (!item) {
          item = new HarvestProduce(this.contents, batch);
          this.produce.set(batch, item);
        }
        item.update(this.state.time);
      }
  }
}

export type HarvestBasketSnapshot = ReturnType<HarvestBasketPresenter["snapshot"]>;
/** Host/UI/AI controls expose presentation only; harvested quantities are supplied by committed events. */
export type HarvestBasketControls = Pick<HarvestBasketPresenter, "show" | "showForHarvest" | "hide" | "snapshot">;
