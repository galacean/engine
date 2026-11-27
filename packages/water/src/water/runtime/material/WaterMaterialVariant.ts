/** Deterministic feature-to-variant identity shared by Demo-local water backends. */
export type WaterMaterialFeatureValue = boolean | number | string;

export interface WaterMaterialVariant {
  readonly backendId: string;
  readonly key: string;
  readonly features: Readonly<Record<string, WaterMaterialFeatureValue>>;
}

function encodeFeatureValue(value: WaterMaterialFeatureValue): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  return encodeURIComponent(String(value));
}

export function createWaterMaterialVariant(
  backendId: string,
  features: Readonly<Record<string, WaterMaterialFeatureValue>>
): WaterMaterialVariant {
  if (backendId.trim().length === 0) throw new Error("Water material backend id must be non-empty.");
  const entries = Object.entries(features).sort(([left], [right]) => left.localeCompare(right));
  const frozenFeatures = Object.freeze(Object.fromEntries(entries)) as Readonly<
    Record<string, WaterMaterialFeatureValue>
  >;
  return Object.freeze({
    backendId,
    key: `${backendId}:${entries.map(([name, value]) => `${name}=${encodeFeatureValue(value)}`).join(";")}`,
    features: frozenFeatures
  });
}
