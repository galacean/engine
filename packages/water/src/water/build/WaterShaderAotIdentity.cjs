const { createHash } = require("node:crypto");

/** Canonical JSON for build identities. Unsupported or lossy JSON values fail closed. */
function stableStringify(value) {
  return JSON.stringify(canonicalize(value, new Set(), "$"));
}

/** Returns the complete SHA-256 identity used in content-addressed `.shaderc` physical paths. */
function createWaterShaderAotCacheKey(identity) {
  return createHash("sha256").update(stableStringify(identity), "utf8").digest("hex");
}

function canonicalize(value, ancestors, path) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Water Shader AOT identity '${path}' must be finite.`);
    return value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Water Shader AOT identity '${path}' has unsupported type '${typeof value}'.`);
  }
  if (ancestors.has(value)) throw new TypeError(`Water Shader AOT identity '${path}' is cyclic.`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const symbolKeys = Object.getOwnPropertySymbols(value);
      if (symbolKeys.length > 0) {
        throw new TypeError(`Water Shader AOT identity '${path}' cannot contain symbol keys.`);
      }
      const indexKeys = Object.getOwnPropertyNames(value).filter((key) => key !== "length");
      for (const key of indexKeys) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
          throw new TypeError(`Water Shader AOT identity '${path}' array cannot contain extra property '${key}'.`);
        }
      }
      if (indexKeys.length !== value.length) {
        throw new TypeError(`Water Shader AOT identity '${path}' cannot contain a sparse array.`);
      }
      return value.map((entry, index) => canonicalize(entry, ancestors, `${path}[${index}]`));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Water Shader AOT identity '${path}' must contain only plain objects.`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError(`Water Shader AOT identity '${path}' cannot contain symbol keys.`);
    }
    const keys = Object.keys(value);
    if (Object.getOwnPropertyNames(value).length !== keys.length) {
      throw new TypeError(`Water Shader AOT identity '${path}' cannot contain non-enumerable keys.`);
    }
    return Object.fromEntries(
      keys
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalize(value[key], ancestors, `${path}.${key}`)])
    );
  } finally {
    ancestors.delete(value);
  }
}

module.exports = {
  createWaterShaderAotCacheKey,
  stableStringify
};
