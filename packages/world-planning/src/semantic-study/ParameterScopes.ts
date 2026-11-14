/** Sparse parameter patches: an absent field follows its base; explicit zero is a value. */
export type ParameterPatch<T> = { [K in keyof T]?: T[K] extends object ? ParameterPatch<T[K]> : T[K] };

/** Resolve ordered scopes without mutating recipe inputs. Nested fields remain independent.
 * @param base Complete baseline owned by the generating module.
 * @param scopes Ordered broader-to-narrower overrides. Arrays are replaced, not merged.
 * @returns Effective settings. Physical constraints are evaluated separately by their owners.
 */
export function resolveParameters<T extends object>(base: T, ...scopes: (ParameterPatch<T> | undefined)[]): T {
  const result = { ...base };
  for (const scope of scopes) {
    if (!scope) continue;
    for (const key of Object.keys(scope) as (keyof T)[]) {
      const value = scope[key];
      if (value === undefined) continue;
      const prior = result[key];
      result[key] = (
        value && typeof value === "object" && !Array.isArray(value) && prior && typeof prior === "object"
          ? resolveParameters(prior, value)
          : value
      ) as T[keyof T];
    }
  }
  return result;
}
