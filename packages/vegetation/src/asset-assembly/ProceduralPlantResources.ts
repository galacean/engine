import { AssetType, type Engine, type JSONAsset } from "@galacean/engine";
import { decodePlantParameters, resolvePlantJSONReferences } from "./PlantParameterEncoding";
export { resolvePlantJSONReferences } from "./PlantParameterEncoding";

/** Definitions are Engine assets. ResourceManager owns loading, caching and project URL resolution. */
export async function loadPlantJSON<T>(engine: Engine, url: string): Promise<T> {
  const resource = await engine.resourceManager.load<JSONAsset>({ type: AssetType.JSON, url });
  return resolvePlantJSONReferences(resource.data) as T;
}

const decoded = new WeakMap<JSONAsset, unknown>();
export async function loadPlantParameters<T>(engine: Engine, url: string, validate: (value: T) => void): Promise<T> {
  const resource = await engine.resourceManager.load<JSONAsset>({ type: AssetType.JSON, url });
  let value = decoded.get(resource) as T | undefined;
  if (value === undefined) {
    value = decodePlantParameters<T>(resource.data);
    validate(value);
    decoded.set(resource, value);
  } else validate(value);
  return value;
}
