import { AssetType, type Engine, type JSONAsset } from "@galacean/engine";
import { decodePlantParameters, resolvePlantJSONReferences } from "./PlantParameterEncoding";
export { resolvePlantJSONReferences } from "./PlantParameterEncoding";

const resolved = new WeakMap<JSONAsset, WeakRef<object>>();
const decoded = new WeakMap<JSONAsset, WeakRef<object>>();

/**
 * Definitions are Engine assets. ResourceManager owns loading, deduplication, and project URL
 * invalidation; WeakMap<JSONAsset, WeakRef<object>> caches resolved/decoded read-only views per
 * live JSONAsset instance so destroy()/replaceCachedResource()/blob swaps invalidate automatically.
 */
export async function loadPlantJSON<T>(engine: Engine, url: string): Promise<T> {
  const resource = await engine.resourceManager.load<JSONAsset>({ type: AssetType.JSON, url });
  let value = resolved.get(resource)?.deref() as T | undefined;
  if (value === undefined) {
    value = resolvePlantJSONReferences(resource.data) as T;
    if (value && typeof value === "object") resolved.set(resource, new WeakRef(value as object));
  }
  return value;
}

export async function loadPlantParameters<T>(engine: Engine, url: string, validate: (value: T) => void): Promise<T> {
  const resource = await engine.resourceManager.load<JSONAsset>({ type: AssetType.JSON, url });
  let value = decoded.get(resource)?.deref() as T | undefined;
  if (value === undefined) {
    value = decodePlantParameters<T>(resource.data);
    validate(value);
    if (value && typeof value === "object") decoded.set(resource, new WeakRef(value as object));
  } else validate(value);
  return value;
}
