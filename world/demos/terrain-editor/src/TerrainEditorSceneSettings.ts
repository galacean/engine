import { encodeTerrainCanonicalJson } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";

const textDecoder = new TextDecoder();
const TERRAIN_ENVIRONMENT_EXTENSION = "terrainEnvironment";
const FOG_MODE_NONE = 0;
const DEFAULT_FOG_MODE = 2;
const DEFAULT_ENVIRONMENT_INTENSITY = 1;
const DEFAULT_SCENE_SETTINGS: TerrainEditorSceneSettingsState = {
  supported: false,
  fogEnabled: false,
  directLightEnabled: false,
  environmentEnabled: false,
  windEnabled: false,
  authoredFogMode: DEFAULT_FOG_MODE,
  authoredDiffuseIntensity: DEFAULT_ENVIRONMENT_INTENSITY,
  authoredSpecularIntensity: DEFAULT_ENVIRONMENT_INTENSITY
};

/** Scene-wide preview controls persisted through the standard Scene resource. */
export interface TerrainEditorSceneSettings {
  /** Whether authored Scene fog is active. */
  readonly fogEnabled: boolean;
  /** Whether the Scene directional light component is active. */
  readonly directLightEnabled: boolean;
  /** Whether ambient diffuse and specular lighting use their authored intensities. */
  readonly environmentEnabled: boolean;
  /** Whether the Scene wind component publishes global wind values. */
  readonly windEnabled: boolean;
}

/** Authored Scene values retained while global capabilities are disabled. */
export interface TerrainEditorSceneSettingsState extends TerrainEditorSceneSettings {
  /** Whether the imported Scene exposes standard components and environment fields that can be edited. */
  readonly supported: boolean;
  /** Non-disabled fog mode restored when fog is enabled. */
  readonly authoredFogMode: number;
  /** Ambient diffuse intensity restored when environment lighting is enabled. */
  readonly authoredDiffuseIntensity: number;
  /** Ambient specular intensity restored when environment lighting is enabled. */
  readonly authoredSpecularIntensity: number;
}

/**
 * Reads global terrain-preview controls and their authored restore values from one standard Scene artifact.
 * @param bytes UTF-8 serialized Scene JSON.
 * @returns Validated environment state inferred from standard Scene fields and the optional extension record.
 * @throws If Scene JSON or required component structures are malformed.
 */
export function readTerrainEditorSceneSettings(bytes: Uint8Array): TerrainEditorSceneSettingsState {
  const parsed = parseSceneObject(bytes);
  return isMutableSceneFile(parsed) ? readSettings(parsed) : { ...DEFAULT_SCENE_SETTINGS };
}

/**
 * Writes global preview controls into standard Scene fields while retaining reversible authored values.
 * @param bytes Existing UTF-8 serialized Scene JSON.
 * @param settings Boolean capability state requested by the editor.
 * @returns Canonical UTF-8 Scene JSON accepted by the stock Scene loader.
 * @throws If Scene JSON or required component structures are malformed.
 */
export function writeTerrainEditorSceneSettings(bytes: Uint8Array, settings: TerrainEditorSceneSettings): Uint8Array {
  const sceneFile = requireSceneFile(parseSceneObject(bytes));
  const current = readSettings(sceneFile);
  const directLight = requireComponent(sceneFile, "DirectLight");
  const wind = requireScriptComponent(sceneFile, "/Script/TerrainWindRuntime.ts");
  const ambient = requireObject(sceneFile.scene.ambient, "Scene ambient settings");
  const fog = requireObject(sceneFile.scene.fog, "Scene fog settings");

  directLight.props = {
    ...requireOptionalObject(directLight.props, "DirectLight props"),
    enabled: settings.directLightEnabled
  };
  wind.props = { ...requireOptionalObject(wind.props, "wind props"), enabled: settings.windEnabled };
  ambient.diffuseIntensity = settings.environmentEnabled ? current.authoredDiffuseIntensity : 0;
  ambient.specularIntensity = settings.environmentEnabled ? current.authoredSpecularIntensity : 0;
  fog.fogMode = settings.fogEnabled ? current.authoredFogMode : FOG_MODE_NONE;
  sceneFile.extensions = {
    ...requireOptionalObject(sceneFile.extensions, "Scene extensions"),
    [TERRAIN_ENVIRONMENT_EXTENSION]: {
      ...settings,
      authoredFogMode: current.authoredFogMode,
      authoredDiffuseIntensity: current.authoredDiffuseIntensity,
      authoredSpecularIntensity: current.authoredSpecularIntensity
    }
  };
  return encodeTerrainCanonicalJson(sceneFile);
}

interface MutableSceneFile {
  components: MutableSceneComponent[];
  refs: Array<{ url?: unknown }>;
  scene: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

interface MutableSceneComponent {
  type?: unknown;
  script?: unknown;
  props?: Record<string, unknown>;
}

function parseSceneObject(bytes: Uint8Array): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(bytes));
  } catch (error) {
    throw new Error("Terrain editor Scene resource is invalid JSON", { cause: error });
  }
  return requireObject(parsed, "Scene resource");
}

function isMutableSceneFile(value: Record<string, unknown>): value is Record<string, unknown> & MutableSceneFile {
  return Array.isArray(value.components) && Array.isArray(value.refs) && isObject(value.scene);
}

function requireSceneFile(value: Record<string, unknown>): MutableSceneFile {
  if (!isMutableSceneFile(value)) {
    throw new Error("Terrain editor Scene does not expose standard component and environment settings");
  }
  return value;
}

function readSettings(sceneFile: MutableSceneFile): TerrainEditorSceneSettingsState {
  const extension = requireOptionalObject(sceneFile.extensions, "Scene extensions")[TERRAIN_ENVIRONMENT_EXTENSION];
  if (extension !== undefined) return readExtension(extension);
  const directLight = requireComponent(sceneFile, "DirectLight");
  const wind = requireScriptComponent(sceneFile, "/Script/TerrainWindRuntime.ts");
  const ambient = requireObject(sceneFile.scene.ambient, "Scene ambient settings");
  const fog = requireObject(sceneFile.scene.fog, "Scene fog settings");
  const fogMode = requireFiniteNumber(fog.fogMode, "Scene fog mode");
  const diffuseIntensity = requireFiniteNumber(ambient.diffuseIntensity, "Scene diffuse intensity");
  const specularIntensity = requireFiniteNumber(ambient.specularIntensity, "Scene specular intensity");
  return {
    supported: true,
    fogEnabled: fogMode !== FOG_MODE_NONE,
    directLightEnabled: requireOptionalEnabled(directLight.props, "DirectLight"),
    environmentEnabled: diffuseIntensity !== 0 || specularIntensity !== 0,
    windEnabled: requireOptionalEnabled(wind.props, "wind"),
    authoredFogMode: fogMode === FOG_MODE_NONE ? DEFAULT_FOG_MODE : fogMode,
    authoredDiffuseIntensity: diffuseIntensity === 0 ? DEFAULT_ENVIRONMENT_INTENSITY : diffuseIntensity,
    authoredSpecularIntensity: specularIntensity === 0 ? DEFAULT_ENVIRONMENT_INTENSITY : specularIntensity
  };
}

function readExtension(value: unknown): TerrainEditorSceneSettingsState {
  const extension = requireObject(value, "terrain environment extension");
  return {
    supported: true,
    fogEnabled: requireBoolean(extension.fogEnabled, "fog enabled"),
    directLightEnabled: requireBoolean(extension.directLightEnabled, "direct light enabled"),
    environmentEnabled: requireBoolean(extension.environmentEnabled, "environment enabled"),
    windEnabled: requireBoolean(extension.windEnabled, "wind enabled"),
    authoredFogMode: requireNonZeroFiniteNumber(extension.authoredFogMode, "authored fog mode"),
    authoredDiffuseIntensity: requireNonNegativeFiniteNumber(
      extension.authoredDiffuseIntensity,
      "authored diffuse intensity"
    ),
    authoredSpecularIntensity: requireNonNegativeFiniteNumber(
      extension.authoredSpecularIntensity,
      "authored specular intensity"
    )
  };
}

function requireComponent(sceneFile: MutableSceneFile, type: string): MutableSceneComponent {
  const component = sceneFile.components.find((candidate) => candidate.type === type);
  if (!component) throw new Error(`Terrain editor Scene requires ${type}`);
  return component;
}

function requireScriptComponent(sceneFile: MutableSceneFile, scriptUrl: string): MutableSceneComponent {
  const scriptIndex = sceneFile.refs.findIndex((reference) => reference?.url === scriptUrl);
  const component = sceneFile.components.find(
    (candidate) => candidate.type === "Script" && candidate.script === scriptIndex
  );
  if (!component) throw new Error(`Terrain editor Scene requires script ${JSON.stringify(scriptUrl)}`);
  return component;
}

function requireOptionalEnabled(props: unknown, label: string): boolean {
  const value = requireOptionalObject(props, `${label} props`).enabled;
  if (value === undefined) return true;
  return requireBoolean(value, `${label} enabled`);
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireOptionalObject(value: unknown, label: string): Record<string, unknown> {
  return value === undefined ? {} : requireObject(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be boolean`);
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function requireNonZeroFiniteNumber(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (number === 0) throw new Error(`${label} must be non-zero`);
  return number;
}

function requireNonNegativeFiniteNumber(value: unknown, label: string): number {
  const number = requireFiniteNumber(value, label);
  if (number < 0) throw new Error(`${label} must be non-negative`);
  return number;
}
