import type { SpatialComponent } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import { plantMaterialField } from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import { ROCK_COLOR_FIELDS } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/ColorPalette";
import { PLANNING_COMPONENTS } from "@galacean/engine-world-planning/spatial/PlanningComponents";

/** Sparse authored channels. An absent channel inherits; zero is an explicit authored value. */
export interface AuthoredColor { r?: number; g?: number; b?: number;
}
export interface AuthoredPlantMaterialSlot { assetId: string; part?: string; materialId: string; baseColor: AuthoredColor;
}
export type ParameterBase = SpatialComponent["base"];
export interface VisualAuthoringDescriptor {
  component: string;
  type: string;
  /** Parameter fields to semantic Script properties, not an opaque values dictionary. */
  fields: Readonly<Record<string, string>>;
  collection?: "assetWeights" | "materialSlots";
}

const directFields = (...fields: string[]) => Object.fromEntries(fields.map((field) => [field, field]));
/** Read-only identities for authoring components removed from the product. */
export const RETIRED_PLANNING_VISUAL_AUTHORING = [
  { component: "buildingAppearance", type: "PlanningBuildingAppearance" }
] as const;
export const PLANNING_VISUAL_AUTHORING: readonly VisualAuthoringDescriptor[] = [
  ...[
    ["landscape", "PlanningVegetation"],
    ["landscapePopulation", "PlanningVegetationPopulation"],
    ["landscapeInfluence", "PlanningVegetationInfluence"],
    ["flowerInfluence", "PlanningFlowerInfluence"]
  ].map(([component, type]) => ({ component, type, fields: directFields(
    ...PLANNING_COMPONENTS.find((definition) => definition.type === component)!.fields.map((field) => field.key)),
    ...(component === "flowerInfluence" ? { fields: {
      ...directFields("bandM", "multiplier", "falloff"), enabled: "influenceEnabled"
    } } : {}) })),
  { component: "rockFormation", type: "PlanningRockFormation", fields: directFields(
      "textureScale",
      "topScale",
      "bottomScale",
      "shoulderScale",
      "shoulderHeight",
      "topRoughness",
      "topSlope",
      "wallCount",
      "wallOverlap",
      "wallProtrusion",
      "wallLength",
      "wallTilt",
      "wallStrength",
      "outlineIrregularity",
      "variation",
      "simplifyError", ...ROCK_COLOR_FIELDS.map((field) => field.key)) },
  { component: "lighting", type: "PlanningLighting", fields: {
    ...directFields("profileUrl", "timeHours", "sunIntensity", "ambientIntensity", "iblIntensity", "direct", "environment",
      "shadows", "shadowStrength", "fog", "fogDensity", "customSkyTintStrength", "skyExposure", "sunSize", "atmosphereThickness",
      "starIntensity", "moonLightIntensity", "moonDiskIntensity", "moonAtmosphereIntensityScale", "twilightIntensity",
      "airglowIntensity", "fogRadianceIntensity"),
    sunColorR: "sunColor.r", sunColorG: "sunColor.g", sunColorB: "sunColor.b",
    skyTintR: "skyTint.r", skyTintG: "skyTint.g", skyTintB: "skyTint.b",
    ...Object.fromEntries(["moonColor", "fogTint", "groundTint"].flatMap((slot) => ["R", "G", "B"].map((channel) =>
      [slot + channel, `${slot}.${channel.toLowerCase()}`]))),
    ...Object.fromEntries(["Zenith", "Horizon"].flatMap((region) => ["R", "G", "B"].map((channel) =>
      [`customSky${region}${channel}`, `customSky${region}Tint.${channel.toLowerCase()}`])))
  } },
  { component: "postProcess", type: "PlanningPostProcess", fields: {
    ...directFields("tonemapping", "postExposure", "temperature", "contrast", "saturation", "bloom",
      "bloomThreshold", "bloomIntensity", "bloomScatter"),
    // Script.enabled controls the authoring component lifecycle, not the scene post processing.
    enabled: "postProcessingEnabled"
  } },
  { component: "flowers", type: "PlanningFlowers", fields:
    directFields("coverage", "densityPerM2", "patchSizeM", "maxSlopeDegrees"), collection: "assetWeights" },
  { component: "subjectView", type: "PlanningSubjectView", fields: directFields("subjectId", "frameFraction", "fovDegrees", "azimuthDegrees", "distanceM") },
  { component: "grassAppearance", type: "PlanningGrassAppearance", fields: {
    ...directFields("saturation"),
    ...Object.fromEntries(["colorA", "colorB"].flatMap((slot) => ["r", "g", "b"].map((channel) => [`${slot}.${channel}`, `${slot}.${channel}`])))
  } },
  { component: "plantMaterial", type: "PlanningPlantMaterials", fields: {}, collection: "materialSlots" }
];

/** Adapter at the authoring boundary. Runtime values and defaults are deliberately not materialized. */
export function encodeVisualAuthoring(descriptor: VisualAuthoringDescriptor, source: SpatialComponent): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (source.base !== undefined) props.parameterBase = structuredClone(source.base);
  const slots = new Map<string, AuthoredPlantMaterialSlot>();
  for (const [field, value] of Object.entries(source.values)) {
    const path = descriptor.fields[field];
    if (path) setProperty(props, path, value);
    else if (descriptor.collection === "assetWeights" && field.startsWith("assetWeights.")) {
      const weights = (props.assetWeights ??= {}) as Record<string, unknown>;
      define(weights, field.slice("assetWeights.".length), value);
    } else if (descriptor.collection === "materialSlots") {
      const path = field.split("/").map((part) => decodeURIComponent(part));
      const property = /^baseColor\.([rgb])$/.exec(path.at(-1)!);
      if (!property || (path.length !== 3 && path.length !== 4) || path.some((part) => !part))
        throw new Error(`Invalid plant material field: ${field}`);
      const assetId = path[0], part = path.length === 4 ? path[1] : undefined,
        materialId = path.at(-2)!, channel = property[1];
      const key = JSON.stringify([assetId, materialId]);
      const slot = slots.get(key) ?? { assetId, ...(part ? { part } : {}), materialId, baseColor: {} };
      if (slot.part !== part) throw new Error(`Conflicting native plant material part: ${field}`);
      define(slot.baseColor, channel, value);
      slots.set(key, slot);
    } else throw new Error(`Unmapped native authoring field: ${descriptor.component}.${field}`);
  }
  if (slots.size) props.materialSlots = [...slots.values()];
  return props;
}

export function decodeVisualAuthoring(descriptor: VisualAuthoringDescriptor, props: Record<string, unknown>): SpatialComponent {
  const values: Record<string, unknown> = {};
  for (const [field, path] of Object.entries(descriptor.fields)) {
    const value = getProperty(props, path);
    if (value !== undefined) define(values, field, value);
  }
  if (descriptor.collection === "assetWeights" && props.assetWeights !== undefined) {
    for (const [assetId, weight] of Object.entries(props.assetWeights as Record<string, unknown>))
      define(values, `assetWeights.${assetId}`, weight);
  }
  if (descriptor.collection === "materialSlots" && props.materialSlots !== undefined) {
    if (!Array.isArray(props.materialSlots)) throw new Error("Invalid native plant material slots");
    const identities = new Set<string>();
    for (const slot of props.materialSlots as AuthoredPlantMaterialSlot[]) {
      if (!slot.assetId || !slot.materialId || !slot.baseColor) throw new Error("Invalid native plant material slot");
      const identity = JSON.stringify([slot.assetId, slot.materialId]);
      if (identities.has(identity)) throw new Error("Duplicate native plant material slot");
      identities.add(identity);
      for (const channel of ["r", "g", "b"] as const)
        if (slot.baseColor[channel] !== undefined)
          define(values, plantMaterialField(slot.assetId, slot.materialId, channel, slot.part), slot.baseColor[channel]);
    }
  }
  return structuredClone({ values, ...(props.parameterBase !== undefined ? { base: props.parameterBase as ParameterBase } : {}) });
}

export function visualAuthoringProperties(descriptor: VisualAuthoringDescriptor): string[] {
  return [...new Set(["parameterBase", ...Object.values(descriptor.fields).map((path) => path.split(".")[0]),
    ...(descriptor.collection ? [descriptor.collection] : [])])];
}

function getProperty(value: unknown, path: string): unknown {
  return path.split(".").reduce((object, key) => (object && typeof object === "object"
    ? (object as Record<string, unknown>)[key] : undefined), value);
}
function setProperty(props: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let target = props;
  for (const key of keys.slice(0, -1)) {
    if (!Object.hasOwn(target, key)) define(target, key, {});
    target = target[key] as Record<string, unknown>;
  }
  define(target, keys.at(-1)!, value);
}
function define(object: object, key: string, value: unknown): void {
  Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true });
}
