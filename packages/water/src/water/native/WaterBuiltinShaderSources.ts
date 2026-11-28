import lake from "./assets/Water/Shaders/lake.shader?raw";
import river from "./assets/Water/Shaders/river.shader?raw";
import ocean from "./assets/Water/Shaders/ocean.shader?raw";
import { WATER_BUILTIN_SHADER_NAMES, waterBuiltinShaderSource } from "./WaterBuiltinShaderNames";

/** Editor source delivery is separate from runtime registration and its precompiled data. */
export const WATER_BUILTIN_SHADER_SOURCES = Object.freeze(
  Object.fromEntries(
    Object.entries({ lake, river, ocean }).map(([profile, source]) => [
      profile,
      waterBuiltinShaderSource(source, profile as keyof typeof WATER_BUILTIN_SHADER_NAMES)
    ])
  ) as Record<keyof typeof WATER_BUILTIN_SHADER_NAMES, string>
);
