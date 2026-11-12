import { Shader } from "@galacean/engine-core";
import lake from "./assets/Water/Shaders/builtin/lake.json";
import river from "./assets/Water/Shaders/builtin/river.json";
import ocean from "./assets/Water/Shaders/builtin/ocean.json";
import { WATER_BUILTIN_SHADER_NAMES } from "./WaterBuiltinShaderNames";

export { WATER_BUILTIN_SHADER_NAMES } from "./WaterBuiltinShaderNames";
const registered = new Map<string, Shader>();
const profiles = { lake, river, ocean };

/** Call before loading Water materials, including outside Editor and before Engine creation. */
export function registerWaterBuiltinShaders(): void {
  // Check the entire namespace before changing it, including later foreign shadows.
  for (const name of Object.values(WATER_BUILTIN_SHADER_NAMES)) {
    const shader = Shader.find(name);
    if (shader && shader !== registered.get(name))
      throw new Error(`Water built-in Shader '${name}' is already registered by another owner.`);
  }
  for (const [profile, data] of Object.entries(profiles)) {
    const name = WATER_BUILTIN_SHADER_NAMES[profile as keyof typeof WATER_BUILTIN_SHADER_NAMES];
    if (Shader.find(name)) continue;
    if (data.name !== name) throw new Error(`Water built-in Shader data does not match '${name}'.`);
    registered.set(
      name,
      Shader._createFromPrecompiled(data as unknown as Parameters<typeof Shader._createFromPrecompiled>[0])
    );
  }
}

/** Identity check: foreign shaders with the same name keep their authored implementation. */
export function isWaterBuiltinShader(shader: Shader): boolean {
  return registered.get(shader.name) === shader;
}
