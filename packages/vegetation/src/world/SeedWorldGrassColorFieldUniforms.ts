import colorPatternUrl from "@galacean/engine-terrain/data/seed-world/public/textures/grass-color-detail.r8?url";
import {
  Color,
  type Engine,
  type MeshRenderer,
  type ShaderData,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector4
} from "@galacean/engine";
import {
  SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_OFFSET,
  SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_SCALE,
  type SeedWorldGrassColorFieldBinding,
  type SeedWorldGrassColorFieldTuning
} from "./SeedWorldGrassColorField";
import { SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS } from "@galacean/engine-terrain/world/SeedWorldSurfaceColorField";

/** A related ground plant inherits the same field and hue at every position.
 * One uniform gain for both endpoints preserves chromaticity throughout interpolation;
 * limiting the gain at the gamut boundary avoids channel clipping and hue shifts.
 */
export function varySeedWorldGrassPaletteBrightness(
  tuning: SeedWorldGrassColorFieldTuning,
  brightness: number
): SeedWorldGrassColorFieldTuning {
  if (!Number.isFinite(brightness) || brightness <= 0) throw new RangeError("Invalid grass palette brightness");
  const peak = Math.max(...tuning.colorA, ...tuning.colorB);
  const gain = peak > 0 ? Math.min(brightness, 1 / peak) : brightness;
  const scale = (color: readonly [number, number, number]) =>
    color.map((value) => value * gain) as [number, number, number];
  return { ...tuning, colorA: scale(tuning.colorA), colorB: scale(tuning.colorB) };
}

/** Prepares position-independent colour-field values when the shared palette changes. */
export function bindSeedWorldGrassColorFieldUniforms(
  data: ShaderData,
  prefix: "material" | "renderer",
  tuning: SeedWorldGrassColorFieldTuning
): void {
  data.setVector4(
    `${prefix}_GrassColorFieldPrepared`,
    new Vector4(
      Math.cos(tuning.angleRadians),
      Math.sin(tuning.angleRadians),
      1 / Math.max(tuning.remapHigh - tuning.remapLow, 0.00001),
      0
    )
  );
  for (const [suffix, color] of [
    ["A", tuning.colorA],
    ["B", tuning.colorB]
  ] as const) {
    const rgb = saturateGrassPalette(color, tuning.saturation);
    data.setVector4(`${prefix}_GrassColorPrepared${suffix}`, new Vector4(...rgb, 1));
  }
  data.setVector4(`${prefix}_GrassColorOverrideA`, new Vector4(...(tuning.colorOverrideA ?? [0, 0, 0]), 0));
  data.setVector4(`${prefix}_GrassColorOverrideB`, new Vector4(...(tuning.colorOverrideB ?? [0, 0, 0]), 0));
  data.setVector4(
    `${prefix}_RoadColorFieldA`,
    new Vector4(...(tuning.roadColorA ?? [0, 0, 0]), tuning.roadColorStrength ?? 0)
  );
  data.setVector4(
    `${prefix}_RoadColorFieldRemap`,
    new Vector4(tuning.roadColorContrast ?? 1, tuning.roadColorMidpoint ?? 0.5, 0, 0)
  );
  data.setVector4(
    `${prefix}_GrassVistaParams`,
    new Vector4(
      tuning.vistaSoftnessMetres ?? 192,
      tuning.vistaContrast ?? 1,
      sharedPatternMean,
      tuning.vistaRepeatSizeMetres ? 1 / tuning.vistaRepeatSizeMetres : SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_SCALE
    )
  );
  data.setVector4(`${prefix}_RoadColorFieldB`, new Vector4(...(tuning.roadColorB ?? [0, 0, 0]), 0));
}

/** Adjusts HSV saturation in linear RGB without a hue round trip; output remains linear. */
export function saturateGrassPalette(
  color: readonly [number, number, number],
  saturation: number
): [number, number, number] {
  const value = Math.max(...color);
  const delta = value - Math.min(...color);
  const scale = delta > 0 ? Math.min(saturation, value / delta) : 0;
  return color.map((component) => value + (component - value) * scale) as [number, number, number];
}

let sharedPatternSamples: Promise<Uint8Array> | undefined;
// Resolved with the source before any shared texture is published; legacy bindings do not use this value.
let sharedPatternMean = 0.5;

/** One mipmapped scalar texture shared by local colour, distant colour and surface relief. */
export async function createSeedWorldSharedSurfaceTexture(engine: Engine): Promise<Texture2D> {
  const pattern = await loadSeedWorldSharedSurfacePattern();
  return createSurfaceTexture(engine, 256, TextureFormat.R8, pattern);
}

/** Reuses immutable CPU source bytes for optional surface-field preprocessing. */
export function loadSeedWorldSharedSurfacePattern(): Promise<Uint8Array> {
  return (sharedPatternSamples ??= fetch(colorPatternUrl)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Surface pattern: HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length !== 256 ** 2) throw new RangeError("Surface pattern must be 256 square");
      sharedPatternMean = bytes.reduce((sum, value) => sum + value, 0) / (bytes.length * 255);
      return bytes;
    })
    .catch((error) => {
      sharedPatternSamples = undefined;
      throw error;
    }));
}

function createSurfaceTexture(
  engine: Engine,
  resolution: number,
  format: TextureFormat,
  samples: Uint8Array
): Texture2D {
  const texture = new Texture2D(engine, resolution, resolution, format, true, false);
  try {
    texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
    texture.filterMode = TextureFilterMode.Trilinear;
    texture.anisoLevel = 2;
    texture.setPixelBuffer(samples);
    texture.generateMipmaps();
    return texture;
  } catch (error) {
    texture.destroy();
    throw error;
  }
}

export function createSeedWorldSurfaceColorFieldTexture(engine: Engine, samples: Uint8Array): Texture2D {
  const resolution = Math.sqrt(samples.length / SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS);
  if (!Number.isInteger(resolution) || resolution < 2) {
    throw new RangeError("Seed World surface colour field requires a square RG8 payload");
  }
  return createSurfaceTexture(engine, resolution, TextureFormat.R8G8, samples);
}

export function bindSeedWorldGrassRendererColorField(
  renderer: MeshRenderer,
  field: SeedWorldGrassColorFieldBinding
): void {
  bindSeedWorldGrassColorField(renderer.shaderData, "renderer", field);
}

/** Bind one world-space field at the owner's frequency: Material for a shared meadow, Renderer for independently tuned batches. */
export function bindSeedWorldGrassColorField(
  data: ShaderData,
  prefix: "material" | "renderer",
  field: SeedWorldGrassColorFieldBinding
): void {
  const { tuning } = field;
  bindSeedWorldGrassColorFieldUniforms(data, prefix, tuning);
  data.setVector2(
    `${prefix}_GrassColorFieldVistaBlend`,
    new Vector2(tuning.vistaBlendStartMetres, tuning.vistaBlendEndMetres)
  );
  data.setTexture(`${prefix}_GrassColorFieldTexture`, field.texture);
  const vistaMacro = `${prefix.toUpperCase()}_GRASS_SHARED_VISTA`;
  if (field.vistaFromDetail) data.enableMacro(vistaMacro);
  else data.disableMacro(vistaMacro);
  data.setVector4(
    `${prefix}_GrassColorFieldTransform`,
    new Vector4(
      tuning.enabled ? 1 : 0,
      tuning.uvScale,
      tuning.angleRadians,
      SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_SCALE
    )
  );
  data.setVector4(
    `${prefix}_GrassColorFieldOffset`,
    new Vector4(
      tuning.offset[0],
      tuning.offset[1],
      SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_OFFSET,
      SEED_WORLD_GRASS_COLOR_FIELD_VISTA_UV_OFFSET
    )
  );
  data.setVector4(
    `${prefix}_GrassColorFieldParams`,
    new Vector4(tuning.softnessMetres, tuning.remapLow, tuning.remapHigh, tuning.saturation)
  );
  for (const [suffix, rgb] of [
    ["A", tuning.colorA],
    ["B", tuning.colorB]
  ] as const) {
    // Material palette properties are authored Colors; Renderer palettes use native instance vectors.
    if (prefix === "material") data.setColor(`${prefix}_GrassColor${suffix}`, new Color(...rgb, 1));
    else data.setVector4(`${prefix}_GrassColor${suffix}`, new Vector4(...rgb, 1));
  }
}
