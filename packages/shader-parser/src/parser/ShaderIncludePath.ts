import { normalizeShaderIncludeKey } from "@galacean/engine-design";
import type { IncludeMap } from "../Preprocessor";

const SHADER_ROOT_URL = "shaders://root/";
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/;

/**
 * Converts a caller-provided source location into the canonical form stored in source maps.
 * @param sourceFile - Project-relative path, project-root path, or absolute URL.
 * @returns Canonical source location, or `undefined` when no location was supplied.
 * @internal
 */
export function normalizeShaderSourceFile(sourceFile?: string): string | undefined {
  if (!sourceFile) return undefined;
  const normalized = sourceFile.trim().replace(/\\/g, "/");
  if (!normalized) return undefined;
  if (normalized.startsWith(SHADER_ROOT_URL)) {
    return normalized === SHADER_ROOT_URL ? undefined : normalizeShaderIncludeKey(normalized);
  }
  if (!ABSOLUTE_URL_PATTERN.test(normalized)) {
    return normalizeShaderIncludeKey(normalized);
  }
  return new URL(normalized).href;
}

/**
 * Exposes an include registry through canonical lookup keys without copying its sources.
 * @param includeMap - Caller-owned include registry.
 * @returns Read-only canonical lookup view that preserves live updates to canonical keys.
 * @throws Error when two input keys resolve to the same canonical key.
 * @internal
 */
export function normalizeShaderIncludeMap(includeMap?: IncludeMap): IncludeMap {
  if (!includeMap) return Object.create(null) as IncludeMap;

  const inputKeysByCanonicalKey: Record<string, string> = Object.create(null);
  for (const inputKey of Object.keys(includeMap)) {
    const canonicalKey = normalizeShaderIncludeKey(inputKey);
    if (Object.prototype.hasOwnProperty.call(inputKeysByCanonicalKey, canonicalKey)) {
      throw new Error(`Shader include key collision after normalization: "${inputKey}" resolves to "${canonicalKey}".`);
    }
    inputKeysByCanonicalKey[canonicalKey] = inputKey;
  }

  return new Proxy(Object.create(null) as IncludeMap, {
    get(_target, property): string | undefined {
      if (typeof property !== "string") return undefined;
      const inputKey = inputKeysByCanonicalKey[property];
      if (inputKey !== undefined) {
        const source = includeMap[inputKey];
        return typeof source === "string" ? source : undefined;
      }
      const source = includeMap[property];
      return typeof source === "string" ? source : undefined;
    }
  });
}

/**
 * Creates the internal URL used to resolve relative includes from a canonical source location.
 * @param sourceFile - Project path or absolute URL returned by `normalizeShaderSourceFile`.
 * @returns Base URL for include resolution, or an empty string when no source location exists.
 * @internal
 */
export function shaderSourceBaseURL(sourceFile?: string): string {
  if (!sourceFile) return "";
  if (!ABSOLUTE_URL_PATTERN.test(sourceFile)) {
    return new URL(sourceFile, SHADER_ROOT_URL).href;
  }
  return new URL(sourceFile).href;
}
