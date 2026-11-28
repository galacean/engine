export const WATER_RENDER_STATE_PRESET_SCHEMA_VERSION = 1 as const;

export type WaterRenderQueueV1 = "opaque" | "alpha-test" | "transparent";
export type WaterCullModeV1 = "off" | "front" | "back";
export type WaterBlendModeV1 = "opaque" | "alpha" | "premultiplied-alpha" | "additive";

export interface WaterRenderStatePresetV1 {
  readonly schemaVersion: typeof WATER_RENDER_STATE_PRESET_SCHEMA_VERSION;
  readonly id: string;
  readonly depthWriteEnabled: boolean;
  readonly queue: WaterRenderQueueV1;
  readonly priorityOffset: number;
  readonly cullMode: WaterCullModeV1;
  readonly blendMode: WaterBlendModeV1;
}

export type WaterRenderStatePresetInputV1 = Omit<WaterRenderStatePresetV1, "schemaVersion">;

const QUEUES = Object.freeze(["opaque", "alpha-test", "transparent"] as const);
const CULL_MODES = Object.freeze(["off", "front", "back"] as const);
const BLEND_MODES = Object.freeze(["opaque", "alpha", "premultiplied-alpha", "additive"] as const);

export function createWaterRenderStatePresetV1(
  source: Readonly<WaterRenderStatePresetInputV1>
): Readonly<WaterRenderStatePresetV1> {
  if (typeof source.id !== "string" || source.id.trim().length === 0) {
    throw new TypeError("Water render-state preset id must be non-empty.");
  }
  if (typeof source.depthWriteEnabled !== "boolean") {
    throw new TypeError("Water render-state depthWriteEnabled must be boolean.");
  }
  if (!QUEUES.includes(source.queue)) throw new TypeError(`Unsupported Water render queue '${source.queue}'.`);
  if (!CULL_MODES.includes(source.cullMode)) throw new TypeError(`Unsupported Water cull mode '${source.cullMode}'.`);
  if (!BLEND_MODES.includes(source.blendMode))
    throw new TypeError(`Unsupported Water blend mode '${source.blendMode}'.`);
  if (!Number.isSafeInteger(source.priorityOffset) || Math.abs(source.priorityOffset) > 1_000_000) {
    throw new RangeError("Water render-state priorityOffset must be a safe integer in [-1000000, 1000000].");
  }
  if (source.blendMode === "opaque" && source.queue === "transparent") {
    throw new Error("Opaque Water blending cannot use the transparent render queue.");
  }
  if (source.blendMode !== "opaque" && source.queue !== "transparent") {
    throw new Error("Blended Water render states require the transparent render queue.");
  }
  return Object.freeze({
    schemaVersion: WATER_RENDER_STATE_PRESET_SCHEMA_VERSION,
    id: source.id,
    depthWriteEnabled: source.depthWriteEnabled,
    queue: source.queue,
    priorityOffset: source.priorityOffset,
    cullMode: source.cullMode,
    blendMode: source.blendMode
  });
}
