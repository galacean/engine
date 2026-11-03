import { ShaderFactory } from "@galacean/engine-core";
import { sha256Hex } from "../../compiler/shared/CanonicalWaterBinaryWriterV1";

const WATER_SHADER_INCLUDE_PATH = /^Water\/[A-Za-z0-9_./]+$/;
const registeredWaterShaderIncludes = new Map<string, string>();
const shaderSourceEncoder = new TextEncoder();

export type WaterShaderIncludeClosure = Readonly<Record<string, string>>;

function hashShaderSource(source: string): string {
  return sha256Hex(shaderSourceEncoder.encode(source));
}

function sanitizeScope(scope: string): string {
  const sanitized = scope.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (sanitized.length === 0) throw new Error("Water shader include scope must be non-empty.");
  return sanitized;
}

function validateWaterShaderInclude(path: string, source: string): void {
  if (!WATER_SHADER_INCLUDE_PATH.test(path)) {
    throw new Error(`Invalid Water shader include path '${path}'.`);
  }
  if (source.trim().length === 0) throw new Error(`Water shader include '${path}' has no source.`);
}

/** Adds one immutable source to the Water assembly registry without mutating Engine global state. */
export function registerWaterShaderInclude(path: string, source: string): string {
  validateWaterShaderInclude(path, source);

  const existing = registeredWaterShaderIncludes.get(path);
  if (existing !== undefined && existing !== source) {
    throw new Error(`Water shader assembly registry already owns different source at '${path}'.`);
  }
  registeredWaterShaderIncludes.set(path, source);
  return path;
}

/** Registers a SHA-256-addressed chunk so Engine's path-only include cache always sees immutable content. */
export function registerGeneratedWaterShaderInclude(scope: string, source: string): string {
  const sourceHash = hashShaderSource(source);
  const path = `Water/Generated/${sanitizeScope(scope)}_${sourceHash}.glsl`;
  return registerWaterShaderInclude(path, source);
}

/** Registers one enabled structural module and returns the include used by its parent module. */
export function registerGeneratedWaterShaderModule(scope: string, source: string): string {
  if (source.trim().length === 0) return "";
  return waterShaderInclude(registerGeneratedWaterShaderInclude(scope, source));
}

/** Returns the exact include directive accepted by Galacean's strict preprocessor. */
export function waterShaderInclude(path: string): string {
  if (!WATER_SHADER_INCLUDE_PATH.test(path)) {
    throw new Error(`Invalid Water shader include path '${path}'.`);
  }
  return `#include "${path}"`;
}

/** Snapshot used by standalone ShaderCompiler tests and raw WebGL calibration expansion. */
export function getRegisteredWaterShaderIncludes(): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries([...registeredWaterShaderIncludes].sort(([left], [right]) => left.localeCompare(right)))
  );
}

/**
 * Bounds generated assembly chunks to one lazy module build. The returned module keeps its own frozen
 * closure, so newly generated registry entries are no longer needed after the factory returns.
 */
export function withScopedWaterShaderAssemblyRegistry<T>(action: () => T): T {
  const retainedPaths = new Set(registeredWaterShaderIncludes.keys());
  try {
    return action();
  } finally {
    for (const path of registeredWaterShaderIncludes.keys()) {
      if (!retainedPaths.has(path)) registeredWaterShaderIncludes.delete(path);
    }
  }
}

/** Resolves and freezes the exact transitive Water include closure referenced by one entry source. */
export function collectWaterShaderIncludeClosure(source: string): WaterShaderIncludeClosure {
  const closure = new Map<string, string>();

  const collect = (currentSource: string, stack: readonly string[]): void => {
    for (const match of currentSource.matchAll(/#include\s+"(Water\/[A-Za-z0-9_./]+)"/g)) {
      const path = match[1];
      if (stack.includes(path)) throw new Error(`Cyclic Water shader include: ${[...stack, path].join(" -> ")}`);
      const includedSource = registeredWaterShaderIncludes.get(path);
      if (includedSource === undefined) throw new Error(`Missing registered Water shader include '${path}'.`);
      const existing = closure.get(path);
      if (existing !== undefined) {
        if (existing !== includedSource) throw new Error(`Conflicting Water shader include closure at '${path}'.`);
        continue;
      }
      closure.set(path, includedSource);
      collect(includedSource, [...stack, path]);
    }
  };

  collect(source, []);
  return Object.freeze(Object.fromEntries([...closure].sort(([left], [right]) => left.localeCompare(right))));
}

/** Temporarily installs one preflighted closure for synchronous Engine shader creation. */
export function withWaterShaderIncludeClosure<T>(includes: WaterShaderIncludeClosure, action: () => T): T {
  const entries = Object.entries(includes).sort(([left], [right]) => left.localeCompare(right));
  for (const [path, source] of entries) {
    validateWaterShaderInclude(path, source);
    const existing = ShaderFactory.includeMap[path];
    if (existing !== undefined && existing !== source) {
      throw new Error(`Water shader include collision at '${path}'.`);
    }
  }

  const added: string[] = [];
  try {
    for (const [path, source] of entries) {
      if (ShaderFactory.includeMap[path] !== undefined) continue;
      ShaderFactory.registerInclude(path, source);
      added.push(path);
    }
    return action();
  } finally {
    for (let index = added.length - 1; index >= 0; index--) {
      ShaderFactory.unRegisterInclude(added[index]);
    }
  }
}

/** Adds the currently registered Water chunks to an Engine ShaderLibrary include map. */
export function withRegisteredWaterShaderIncludes(
  includeMap: Readonly<Record<string, string>>
): Readonly<Record<string, string>> {
  const combined = { ...includeMap };
  for (const [path, source] of Object.entries(getRegisteredWaterShaderIncludes())) {
    const existing = combined[path];
    if (existing !== undefined && existing !== source) {
      throw new Error(`Water shader include collision at '${path}'.`);
    }
    combined[path] = source;
  }
  return Object.freeze(combined);
}
