import {
  WaterLookResource,
  type WaterBodyComponent,
  type WaterSystem
} from "@galacean/engine-water/water/native/index";
import {
  readSeedWorldWaterColor,
  validateSeedWorldWaterColor,
  withSeedWorldWaterColor,
  type SeedWorldWaterColorRgb
} from "@galacean/engine-water/world/SeedWorldWaterColor";

/** Scene colour edits publish the same native component configuration as geometry edits. */
export class PlanningNativeWaterColor {
  private readonly sourceLooks = new WeakMap<WaterLookResource, WaterLookResource["data"]>();
  private readonly edited = new Map<string, SeedWorldWaterColorRgb>();
  constructor(
    private readonly system: WaterSystem,
    private readonly readPublishedBody: (id: string) => WaterBodyComponent | undefined
  ) {}
  snapshot() {
    return [...this.edited].map(([bodyId, colorRgb]) => ({ bodyId, colorRgb }));
  }
  read(bodyId: string): SeedWorldWaterColorRgb | undefined {
    const config = this.body(bodyId)?.configuration;
    return config ? readSeedWorldWaterColor(config.look.data) : undefined;
  }
  apply(bodyId: string, look: WaterLookResource): WaterLookResource {
    const color = this.edited.get(bodyId);
    if (!color) return look;
    const next = new WaterLookResource(look.engine, withSeedWorldWaterColor(look.data, color));
    this.sourceLooks.set(next, look.data);
    look.destroy();
    return next;
  }
  async update(bodyId: string, color: SeedWorldWaterColorRgb, signal: AbortSignal): Promise<SeedWorldWaterColorRgb> {
    validateSeedWorldWaterColor(color);
    signal.throwIfAborted();
    const body = this.body(bodyId),
      config = body?.configuration;
    if (!body || !config) throw new Error(`Water body '${bodyId}' is not currently published.`);
    const source = this.sourceLooks.get(config.look) ?? config.look.data;
    const look = new WaterLookResource(this.system.engine, withSeedWorldWaterColor(source, color));
    try {
      await body.configure({ ...config, look }, signal);
      this.sourceLooks.set(look, source);
      this.edited.set(bodyId, [...color] as SeedWorldWaterColorRgb);
      config.look.destroy();
      return this.read(bodyId)!;
    } catch (error) {
      look.destroy();
      throw error;
    }
  }
  async clear(bodyId: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    const body = this.body(bodyId),
      config = body?.configuration;
    const source = config && this.sourceLooks.get(config.look);
    if (body && config && source) {
      const look = new WaterLookResource(this.system.engine, source);
      try {
        await body.configure({ ...config, look }, signal);
      } catch (error) {
        look.destroy();
        throw error;
      }
      config.look.destroy();
    }
    this.edited.delete(bodyId);
  }
  private body(id: string): WaterBodyComponent | undefined {
    const body = this.readPublishedBody(id);
    return body && !body.destroyed && !body.pendingDestroy && body.entity.scene === this.system.entity.scene
      ? body
      : undefined;
  }
}
