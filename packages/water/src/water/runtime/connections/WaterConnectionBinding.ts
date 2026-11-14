import { registerWaterContentRestorer } from "../resources/WaterContentRestorer";
import {
  Texture2D,
  TextureFormat,
  TextureFilterMode,
  TextureWrapMode,
  type Engine,
  type Material
} from "@galacean/engine-core";
import {
  MAX_WATER_CONNECTION_PORTS,
  WATER_CONNECTION_SHORE_RANGE,
  WATER_CONNECTION_SHORE_SIZE,
  type WaterConnectionPort
} from "../../authoring/connections/WaterConnection";
export { default as WATER_CONNECTION_SHADER } from "../../shaders/library/surface/WaterConnections.glsl?raw";

export interface WaterConnectionBinding {
  readonly byteLength: number;
  bind(material: Material): void;
  unbind(material: Material): void;
  destroy(): void;
}

/** One immutable atlas per runtime set; materials only borrow its texture and uniforms. */
export function createWaterConnectionBinding(
  engine: Engine,
  ports: readonly WaterConnectionPort[] | undefined
): WaterConnectionBinding | undefined {
  if (!ports?.length) return undefined;
  const frames = new Float32Array(16),
    ranges = new Float32Array(16),
    bounds = new Float32Array(16),
    fields = new Float32Array(16);
  const size = WATER_CONNECTION_SHORE_SIZE;
  const createPixels = () => {
    const pixels = new Uint8Array(size * size * MAX_WATER_CONNECTION_PORTS * 4);
    ports.forEach((p, i) => {
      p.shoreField.distances.forEach((d, index) => {
        const encoded = Math.round(((d / WATER_CONNECTION_SHORE_RANGE) * 0.5 + 0.5) * 65535);
        const offset = (i * size * size + index) * 4;
        pixels[offset] = encoded >>> 8;
        pixels[offset + 1] = encoded & 255;
        pixels[offset + 3] = 255;
      });
    });
    return pixels;
  };
  ports.forEach((p, i) => {
    frames.set([...p.center, ...p.normal], i * 4);
    ranges.set([p.halfWidth, p.length, p.side, Number(p.environmentTransition)], i * 4);
    bounds.set(p.coverageBounds, i * 4);
    fields.set([...p.shoreField.origin, 1 / p.shoreField.spacing, 0], i * 4);
  });
  const texture = new Texture2D(engine, size, size * MAX_WATER_CONNECTION_PORTS, TextureFormat.R8G8B8A8, false, false);
  try {
    texture.setPixelBuffer(createPixels());
    registerWaterContentRestorer(engine, texture, () => texture.setPixelBuffer(createPixels()));
    texture.filterMode = TextureFilterMode.Bilinear;
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.isGCIgnored = true;
  } catch (error) {
    try {
      texture.destroy(true);
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Water connection atlas upload cleanup failed.");
    }
    throw error;
  }
  let destroyed = false;
  return {
    byteLength: size * size * MAX_WATER_CONNECTION_PORTS * 4,
    bind(material) {
      if (destroyed) throw new Error("Water connection binding has been destroyed.");
      material.shaderData.enableMacro("MATERIAL_WATER_CONNECTIONS");
      material.shaderData.setFloat("material_WaterConnectionCount", ports.length);
      material.shaderData.setFloatArray("material_WaterConnectionFrames", frames);
      material.shaderData.setFloatArray("material_WaterConnectionRanges", ranges);
      material.shaderData.setFloatArray("material_WaterConnectionBounds", bounds);
      material.shaderData.setFloatArray("material_WaterConnectionShoreFields", fields);
      material.shaderData.setTexture("material_WaterConnectionShoreAtlas", texture);
    },
    unbind(material) {
      material.shaderData.disableMacro("MATERIAL_WATER_CONNECTIONS");
      (material.shaderData as { setTexture(name: string, value: Texture2D | null): void }).setTexture(
        "material_WaterConnectionShoreAtlas",
        null
      );
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      texture.destroy(true);
    }
  };
}
