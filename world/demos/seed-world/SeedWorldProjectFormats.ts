import { createDefaultWeatherState, WeatherSystem, type WeatherState } from "@galacean/engine";
import { readAssetJson } from "@galacean/engine-project/runtime-editor/project/runtime-asset-read";
import { PLANNING_PROJECT_TYPE } from "./src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { planningFarmingAssetFormats } from "./src/planning/spatial/farming/PlanningFarmingAssets.ts";
import type { RuntimeAssetFormat } from "@galacean/engine-project/runtime-editor/project/runtime-project-edit";
import { nativeAssetFormats } from "@galacean/engine-runtime-editor/project/runtime-native-formats";
import { TERRAIN_SEASON_DEFAULT_COMPOSITIONS } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import { plantProjectFormats } from "@galacean/engine-world-planning/integrations/vegetation/PlantProjectFormats";
import { skyColorRgbSchema } from "./agent-adapter/contracts/SeedWorldSkyColorContract.ts";

export const SEED_WORLD_EDITOR_PATH = "World/Editor.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const weatherPresets = ["clear", "cloudy", "rain", "storm", "snow", "fog"];
const defaultWeather = createDefaultWeatherState();
const weatherFields = {
  wind: ["gustiness", "turbulence"],
  precipitation: ["rainIntensity", "snowIntensity"],
  atmosphere: ["cloudiness", "fogIntensity"],
  lightning: ["frequency", "intensity"]
};

function validateEditorEnvironment(environment: unknown): void {
  if (!isRecord(environment)) throw new Error("Invalid world editor environment");
  const { season, weatherPreset, timeHours, fromTimeHours, transitionDuration, waitForIbl, wind, atmosphere, weatherChannels } = environment;
  if (
    (season !== undefined && (typeof season !== "string" || !Object.hasOwn(TERRAIN_SEASON_DEFAULT_COMPOSITIONS, season))) ||
    (weatherPreset !== undefined && (typeof weatherPreset !== "string" || !weatherPresets.includes(weatherPreset))) ||
    [timeHours, fromTimeHours, transitionDuration].some((value) => value !== undefined && !isFiniteNumber(value)) ||
    (waitForIbl !== undefined && typeof waitForIbl !== "boolean")
  ) throw new Error("Invalid world editor environment");
  for (const [name, fields] of Object.entries(weatherFields)) {
    const channel = environment[name];
    if (channel === undefined) continue;
    if (!isRecord(channel) || fields.some((field) => {
      const value = channel[field];
      return value !== undefined && (!isFiniteNumber(value) || value < 0 || value > 1);
    })) throw new Error(`Invalid world editor environment ${name}`);
  }
  if (isRecord(wind) && (
    (wind.speedMetresPerSecond !== undefined && (!isFiniteNumber(wind.speedMetresPerSecond) || wind.speedMetresPerSecond < 0)) ||
    (wind.directionDegrees !== undefined && !isFiniteNumber(wind.directionDegrees))
  )) throw new Error("Invalid world editor environment wind");
  if (isRecord(atmosphere) && atmosphere.skyColorRgb !== undefined) skyColorRgbSchema.parse(atmosphere.skyColorRgb);

  if (weatherChannels === undefined) return;
  if (!isRecord(weatherChannels)) throw new Error("Invalid world editor weather channels");
  for (const [name, channel] of Object.entries(weatherChannels)) {
    const defaults = defaultWeather[name as keyof WeatherState];
    if (!Object.hasOwn(defaultWeather, name) || !isRecord(channel) ||
      Object.keys(defaults).some((field) => !isFiniteNumber(channel[field]))) {
      throw new Error(`Invalid world editor weather channel ${name}`);
    }
  }
  // The native weather system checks the same channel values when the 3D world restores them.
  new WeatherSystem({ ...defaultWeather, ...weatherChannels });
}

function isPosition(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

/** Validate saved authoring data before either entry can write its checkpoint. */
export function validateSeedWorldEditorDocument(value: unknown): void {
  if (!isRecord(value) || value.format !== "seed-world-editor" || value.version !== 2 ||
    !isFiniteNumber(value.revision) || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
    !isRecord(value.settings) || !isRecord(value.memory)) {
    throw new Error("Invalid world editor document");
  }
  const { tags, namedSelections, semanticSerial } = value.memory;
  if (
    !Array.isArray(tags) || !tags.every((tag: unknown) =>
      Array.isArray(tag) && typeof tag[0] === "string" && Array.isArray(tag[1]) &&
      tag[1].every((label: unknown) => typeof label === "string")
    ) ||
    !Array.isArray(namedSelections) || !namedSelections.every((entry: unknown) =>
      Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1]?.id === "string" &&
      Array.isArray(entry[1]?.selection?.items)
    ) ||
    !isFiniteNumber(semanticSerial) || !Number.isSafeInteger(semanticSerial) || semanticSerial < 0
  ) throw new Error("Invalid world editor memory");

  const { environment, camera, mount } = value.settings;
  if (environment !== undefined) validateEditorEnvironment(environment);
  if (camera !== undefined && (
    !isRecord(camera) || (camera.mode !== "orbit" && camera.mode !== "roam") ||
    !isPosition(camera.position) || !isPosition(camera.forward) ||
    (camera.navigation !== undefined && (!isRecord(camera.navigation) ||
      !isFiniteNumber(camera.navigation.eyeHeight) || !isFiniteNumber(camera.navigation.verticalOffset)))
  )) throw new Error("Invalid world editor camera");
  if (mount !== undefined && (
    !isRecord(mount) || (mount.intent !== "appear" && mount.intent !== "dismount" && mount.intent !== "dismiss")
  )) throw new Error("Invalid world editor mount");
}

const jsonAssetFormat = nativeAssetFormats(() => ({})).get("JSON")!;
export const seedWorldProjectFormats: ReadonlyMap<string, RuntimeAssetFormat> = new Map<string, RuntimeAssetFormat>([
  ...plantProjectFormats,
  ...planningFarmingAssetFormats,
  [
    "JSON",
    {
      read: readAssetJson,
      validate: (content) => {
        jsonAssetFormat.validate(content);
        if (JSON.parse(content as string).schema === "seed-world-water-shader-aot-v1")
          throw new Error("Water shader profiles are generated by the shader build");
      },
      references: (content, file) => {
        if (typeof content !== "string") throw new Error("Expected JSON asset text");
        const manifest = JSON.parse(content);
        const references = jsonAssetFormat.references(content, file);
        if (manifest.schema !== "seed-world-water-shader-aot-v1") return references;
        if (!Array.isArray(manifest.profiles)) throw new Error("Invalid water shader profiles");
        return [
          ...references,
          ...manifest.profiles.map((profile: { virtualPath?: unknown }) => {
            if (typeof profile.virtualPath !== "string") throw new Error("Invalid water shader profile reference");
            return profile.virtualPath;
          })
        ];
      }
    }
  ],
  [
    PLANNING_PROJECT_TYPE,
    {
      read: readAssetJson,
      validate: (content) => {
        jsonAssetFormat.validate(content);
        const value = JSON.parse(content as string);
        if (value.version !== 1 || !value.entities?.world || !value.passthrough)
          throw new Error("Invalid planning document");
      },
      referenceTypes: [],
      references: () => []
    }
  ],
  [
    "SeedWorldEditor",
    {
      read: readAssetJson,
      validate: (content) => {
        if (typeof content !== "string") throw new Error("Expected world editor JSON text");
        validateSeedWorldEditorDocument(JSON.parse(content));
      },
      // Current world authoring records use world IDs, not native project asset references.
      referenceTypes: [],
      references: () => []
    }
  ]
]);
