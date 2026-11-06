/** Small shader-module boundary; source generation remains backend-specific. */
import { Shader } from "@galacean/engine-core";
import type { WaterMaterialVariant } from "./WaterMaterialVariant";
import {
  collectWaterShaderIncludeClosure,
  type WaterShaderIncludeClosure,
  withScopedWaterShaderAssemblyRegistry,
  withWaterShaderIncludeClosure
} from "./WaterShaderLibrary";

export interface WaterShaderModule {
  readonly name: string;
  readonly source: string;
  readonly includes: WaterShaderIncludeClosure;
  readonly variant: WaterMaterialVariant;
  readonly requiredBindings: readonly string[];
}

const WATER_MODULE_INCLUDE_PATTERN = /#include\s+"Water\/[A-Za-z0-9_./]+"/;

export function createWaterShaderModule(
  name: string,
  source: string,
  variant: WaterMaterialVariant,
  requiredBindings: readonly string[]
): WaterShaderModule {
  if (name.trim().length === 0) throw new Error("Water shader module name must be non-empty.");
  if (source.trim().length === 0) throw new Error(`Water shader module '${name}' has no source.`);
  return Object.freeze({
    name,
    source,
    includes: collectWaterShaderIncludeClosure(source),
    variant,
    requiredBindings: Object.freeze([...requiredBindings].sort())
  });
}

/**
 * Materializes one complete, standalone Water profile source for offline AOT compilation.
 *
 * Runtime JIT keeps the semantic include graph so Engine can parse only a cache miss. AOT owns a
 * finite production profile instead, so it expands that exact frozen graph into one complete
 * `.shader` responsibility module. Standard Engine `ShaderLibrary/...` includes intentionally stay
 * intact and continue through the same compiler library used by Terrain.
 */
export function materializeWaterShaderModuleSource(module: WaterShaderModule): string {
  const expand = (source: string, stack: readonly string[]): string =>
    source.replace(/#include\s+"(Water\/[A-Za-z0-9_./]+)"/g, (_directive, path: string) => {
      if (stack.includes(path)) {
        throw new Error(`Cyclic Water shader module include: ${[...stack, path].join(" -> ")}`);
      }
      const includedSource = module.includes[path];
      if (includedSource === undefined) {
        throw new Error(`Water shader module '${module.name}' is missing include '${path}'.`);
      }
      return expand(includedSource, [...stack, path]);
    });

  const materialized = expand(module.source, [])
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gmu, "")
    .trimEnd();
  if (WATER_MODULE_INCLUDE_PATTERN.test(materialized)) {
    throw new Error(`Water shader module '${module.name}' still contains a Water include after materialization.`);
  }
  return `${materialized}\n`;
}

export function resolveWaterShaderModule(name: string, createModule: () => WaterShaderModule): Shader {
  if (name.trim().length === 0) throw new Error("Water shader module lookup name must be non-empty.");
  const cached = Shader.find(name);
  if (cached) return cached;

  const module = withScopedWaterShaderAssemblyRegistry(createModule);
  if (module.name !== name) {
    throw new Error(`Water shader module factory returned '${module.name}' for lookup '${name}'.`);
  }
  return withWaterShaderIncludeClosure(module.includes, () => Shader.create(module.source)!);
}
