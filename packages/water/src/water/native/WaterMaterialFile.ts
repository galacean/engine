import { validateWaterSurfaceAppearanceV2Asset } from "../compiler/surface/WaterSurfaceAppearanceV2Validator";
import type { Material } from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { registerOceanLook } from "../authoring/ocean/OceanAuthoring";
import { FARMLANDS_RIVER_LOOK_ID, registerFarmlandsRiverLook } from "../authoring/river/FarmlandsRiverLook";
import { registerRiverWaterBodyPresets } from "../authoring/river/RiverWaterBodyAuthoring";
import type { WaterLookAuthoringComponents } from "../authoring/surface/WaterLookAuthoringSnapshot";
import * as Surface from "../authoring/surface/WaterSurfaceAppearanceTypes";
import { LAKE_WATER_LOOK_PRESET_ID, registerLakeWaterLook } from "../presets/lake/LakeWaterLook";
import { OCEAN_LOOK_ID } from "../presets/ocean/index";
import { WaterBodyAssetRegistry } from "../runtime/body/WaterBodyAssetRegistry";
import { resolveWaterMaterialProfile } from "./WaterAuthoring";
import { waterBuiltinMaterialTextures } from "./WaterBuiltinMaterialTextures";
import { WATER_BUILTIN_SHADER_NAMES } from "./WaterBuiltinShaderNames";

type ParameterType = "Float" | "Integer" | "Boolean" | "Vector2" | "Vector3" | "Vector4" | "Color";
interface Parameter {
  $waterParameter: string;
  type: ParameterType;
  options?: readonly string[];
}
interface TextureParameter {
  $waterTexture: string;
}
export interface WaterMaterialFile {
  name: string;
  shader: string;
  macros: { name: string; value?: string }[];
  shaderData: Record<string, { type: ParameterType | "Texture"; value: unknown }>;
}
export type WaterMaterialProfile = "lake" | "river" | "ocean";
const profiles: WaterMaterialProfile[] = ["lake", "river", "ocean"];
const definitions = new Map<string, WaterLookAuthoringComponents>();
/** Fixed shader/field structure comes from the existing compiler presets, never an author asset. */
/** @internal Shared native/file decoder implementation. */
export function defaultLook(profile: WaterMaterialProfile, drops: boolean): WaterLookAuthoringComponents {
  const key = `${profile}:${drops}`;
  let value = definitions.get(key);
  if (!value) {
    const registry = new WaterBodyAssetRegistry();
    const id =
      profile === "lake" ? LAKE_WATER_LOOK_PRESET_ID : profile === "river" ? FARMLANDS_RIVER_LOOK_ID : OCEAN_LOOK_ID;
    if (profile === "lake") registerLakeWaterLook(registry);
    else if (profile === "river") {
      registerRiverWaterBodyPresets(registry);
      registerFarmlandsRiverLook(registry);
    } else registerOceanLook(registry);
    value = registry.getLookAuthoringSnapshot(id)!;
    if (!drops) {
      const { riverDrops: _drops, ...look } = value.look;
      value = { ...value, look };
    }
    definitions.set(key, value);
  }
  return value;
}

const enumFields: Record<string, readonly string[]> = {
  "reflectionPolicy.policy.preferred": ["environment", "ssr", "analytic"],
  "renderState.queue": ["opaque", "alpha-test", "transparent"],
  "renderState.cullMode": ["off", "front", "back"],
  "renderState.blendMode": ["opaque", "alpha", "premultiplied-alpha", "additive"],
  "appearance.appearance.refraction.normalSource": Object.values(Surface.WaterRefractionNormalSourceV2),
  "appearance.appearance.refraction.validation": Object.values(Surface.WaterRefractionValidationModeV2),
  "appearance.appearance.composition": Object.values(Surface.WaterSurfaceCompositionV2),
  "appearance.appearance.primaryColorClosure": Object.values(Surface.WaterSurfacePrimaryColorClosure)
};
for (const [field, values] of Object.entries({
  space: Surface.WaterSurfaceDetailSpace,
  normalConvention: Surface.WaterSurfaceNormalConvention,
  strengthMode: Surface.WaterSurfaceNormalStrengthModeV2,
  blend: Surface.WaterSurfaceDetailBlend
}))
  for (let i = 0; i < 2; i++) enumFields[`appearance.appearance.detailLayers.${i}.${field}`] = Object.values(values);

function property(path: string): string {
  const direct: Record<string, string> = {
    "appearance.appearance.depthResponse.color": "material_AppearanceV2DepthColor",
    "appearance.appearance.depthResponse.shallowColor": "material_AppearanceV2DepthShallowColor",
    "appearance.appearance.depthResponse.deepColor": "material_AppearanceV2DepthDeepColor",
    "appearance.appearance.depthResponse.distanceMeters": "material_AppearanceV2DepthDistance",
    "appearance.appearance.depthResponse.exponent": "material_AppearanceV2DepthExponent",
    "appearance.appearance.refraction.uvScale": "material_AppearanceV2RefractionUvScale",
    "appearance.appearance.detailNormalStrength": "material_AppearanceV2DetailNormalStrength",
    "appearance.appearance.macroNormalStrength": "material_AppearanceV2MacroNormalStrength"
  };
  return direct[path] ?? `material_Water_${path.replaceAll(".", "_")}`;
}

/** One native Material owns visual values and appearance policies; textures are Engine built-ins. */
export function createWaterMaterialFile(
  look: WaterLookAuthoringComponents,
  profile: WaterMaterialProfile
): WaterMaterialFile {
  const material: WaterMaterialFile = {
    name: look.look.id,
    shader: WATER_BUILTIN_SHADER_NAMES[profile],
    macros: [],
    shaderData: {
      material_WaterProfile: { type: "Integer", value: profiles.indexOf(profile) },
      material_WaterRiverDrops: { type: "Boolean", value: !!look.look.riverDrops }
    }
  };
  materialDefinition(look, (name, type, value) => {
    if (type !== "Texture") material.shaderData[name] = { type, value };
  });
  return material;
}

/** Derive binding addresses and immutable field dependencies from shader-family code. */
/** @internal Shared native/file decoder implementation. */
export function materialDefinition(
  look: WaterLookAuthoringComponents,
  write?: (name: string, type: ParameterType | "Texture", value: unknown) => void,
  texturePath?: (id: string) => unknown
): Record<string, any> {
  const texture = (id: string, name: string): TextureParameter => {
    write?.(name, "Texture", texturePath?.(id));
    return { $waterTexture: name };
  };
  const visit = (value: any, path: string): any => {
    if (look.look.id === LAKE_WATER_LOOK_PRESET_ID && path === "look.foam") return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (typeof value.assetId === "string" && typeof value.contentHash === "string")
        return texture(value.assetId, property(path));
      const result = Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== "textureAssetId" && key !== "textureContentHash")
          .map(([key, child]) => [key, key === "schemaVersion" ? child : visit(child, path ? `${path}.${key}` : key)])
      );
      if (typeof value.textureAssetId === "string")
        result.$waterSurfaceTexture = texture(value.textureAssetId, property(`${path}.texture`));
      return result;
    }
    if (path === "reflectionPolicy.policy.fallbacks")
      return {
        $waterFallbacks: [0, 1].map((index) => {
          const name = `material_WaterReflectionFallback${index}`;
          write?.(
            name,
            "Integer",
            value[index] === undefined ? -1 : enumFields["reflectionPolicy.policy.preferred"].indexOf(value[index])
          );
          return name;
        })
      };
    const options = enumFields[path];
    const visual =
      (path.startsWith("look.") ||
        path.startsWith("appearance.") ||
        path.startsWith("optics.") ||
        path.startsWith("renderState.")) &&
      !path.includes("fieldDependencies") &&
      !path.endsWith(".schemaVersion");
    let type: ParameterType | undefined;
    if (options) type = "Integer";
    else if (visual && typeof value === "number") type = "Float";
    else if (visual && typeof value === "boolean") type = "Boolean";
    else if (path.endsWith(".octaves.weights")) type = "Vector3";
    else if (
      visual &&
      Array.isArray(value) &&
      value.length >= 2 &&
      value.length <= 4 &&
      value.every((item) => typeof item === "number")
    )
      type = `Vector${value.length}` as ParameterType;
    else if (visual && typeof value === "string" && /^#[a-f\d]{6}$/i.test(value)) type = "Color";
    if (type) {
      const name = property(path);
      const entry = options
        ? options.indexOf(value)
        : type.startsWith("Vector")
          ? Object.fromEntries(
              Array.from({ length: Number(type.slice(-1)) }, (_, index) => ["xyzw"[index], value[index] ?? 0])
            )
          : type === "Color"
            ? {
                r: parseInt(value.slice(1, 3), 16) / 255,
                g: parseInt(value.slice(3, 5), 16) / 255,
                b: parseInt(value.slice(5, 7), 16) / 255,
                a: 1
              }
            : value;
      write?.(name, type, entry);
      return { $waterParameter: name, type, ...(options ? { options } : {}) } satisfies Parameter;
    }
    return Array.isArray(value) ? value.map((child, index) => visit(child, `${path}.${index}`)) : value;
  };
  return visit(look, "");
}

/** CPU-only decoding and validation of native .mat parameters, shared with Editor save/build preflight. */
export function resolveWaterMaterialFileLook(file: WaterMaterialFile): WaterLookAuthoringComponents {
  const read = (name: string, type: ParameterType) => {
    const entry = file.shaderData?.[name];
    if (!entry || entry.type !== type) throw new TypeError(`Missing Water Material ${type} parameter '${name}'.`);
    return entry.value as any;
  };
  const data = {
    getInt: (name: string) => {
      const entry = file.shaderData?.[name];
      if (entry?.type === "Boolean") {
        if (typeof entry.value !== "boolean" && entry.value !== 0 && entry.value !== 1)
          throw new TypeError(`Invalid Water Material boolean '${name}'.`);
        return Number(entry.value);
      }
      return read(name, "Integer");
    },
    getFloat: (name: string) => read(name, "Float"),
    getVector2: (name: string) => read(name, "Vector2"),
    getVector3: (name: string) => read(name, "Vector3"),
    getVector4: (name: string) => read(name, "Vector4"),
    getColor: (name: string) => {
      const value = read(name, "Color");
      if (!value || ![value.r, value.g, value.b, value.a].every(Number.isFinite))
        throw new TypeError(`Invalid Water Material color '${name}'.`);
      return new Color(value.r, value.g, value.b, value.a);
    }
  };
  const drops = data.getInt("material_WaterRiverDrops");
  const profile = resolveWaterMaterialProfile(data.getInt("material_WaterProfile"), drops);
  return decodeWaterMaterialLook(
    materialDefinition(defaultLook(profile, !!drops)),
    data as Material["shaderData"],
    waterBuiltinMaterialTextures(profile, !!drops)
  );
}

/** @internal Shared native/file decoder implementation. */
export function decodeWaterMaterialLook(
  source: Record<string, any>,
  data: Material["shaderData"],
  bindings: ReturnType<typeof waterBuiltinMaterialTextures>
): WaterLookAuthoringComponents {
  const textures = new Map(bindings.map((binding) => [binding.slot, binding.descriptor]));
  const readTexture = (value: TextureParameter) => {
    const identity = textures.get(value.$waterTexture);
    if (!identity) throw new Error(`Missing built-in Water texture mapping '${value.$waterTexture}'.`);
    return { assetId: identity.id, contentHash: identity.contentHash };
  };
  const enumValue = (name: string, options: readonly string[]) => {
    const value = data.getInt(name);
    if (!Number.isInteger(value) || options[value] === undefined)
      throw new TypeError(`Invalid Water Material policy '${name}'.`);
    return options[value];
  };
  const visit = (value: any): any => {
    if (!value || typeof value !== "object") return value;
    if (value.$waterTexture) return readTexture(value);
    if (value.$waterFallbacks)
      return value.$waterFallbacks.flatMap((name: string) =>
        data.getInt(name) === -1 ? [] : [enumValue(name, enumFields["reflectionPolicy.policy.preferred"])]
      );
    if (value.$waterParameter) {
      const name = value.$waterParameter;
      if (value.options) return enumValue(name, value.options);
      if (["Float", "Integer", "Boolean"].includes(value.type)) {
        const number = value.type === "Float" ? data.getFloat(name) : data.getInt(name);
        if (!Number.isFinite(number)) throw new TypeError(`Missing finite Water Material parameter '${name}'.`);
        if (value.type === "Boolean" && number !== 0 && number !== 1)
          throw new TypeError(`Invalid Water Material boolean '${name}'.`);
        return value.type === "Boolean" ? Boolean(number) : number;
      }
      if (value.type === "Color") {
        const color = data.getColor(name);
        if (!(color instanceof Color)) throw new TypeError(`Missing Water Material color '${name}'.`);
        return (
          "#" +
          [color.r, color.g, color.b]
            .map((channel) =>
              Math.round(channel * 255)
                .toString(16)
                .padStart(2, "0")
            )
            .join("")
        );
      }
      const vector =
        value.type === "Vector2"
          ? data.getVector2(name)
          : value.type === "Vector3"
            ? data.getVector3(name)
            : data.getVector4(name);
      if (!vector) throw new TypeError(`Missing Water Material vector '${name}'.`);
      return Array.from({ length: Number(value.type.slice(-1)) }, (_, index) => Reflect.get(vector, "xyzw"[index]));
    }
    if (Array.isArray(value)) return value.map(visit);
    const { $waterSurfaceTexture, ...fields } = value;
    const result = Object.fromEntries(Object.entries(fields).map(([key, child]) => [key, visit(child)]));
    if (fields.weights?.$waterParameter?.endsWith("_octaves_weights")) {
      if (!Number.isInteger(result.count) || result.count < 1 || result.count > 3)
        throw new TypeError("Expected an integer octave count in [1, 3].");
      if (
        !result.weights.every((weight: unknown) => typeof weight === "number" && Number.isFinite(weight) && weight >= 0)
      )
        throw new TypeError("Expected finite non-negative octave weights.");
      result.weights = result.weights.slice(0, result.count);
    }
    if ($waterSurfaceTexture) {
      const identity = readTexture($waterSurfaceTexture);
      result.textureAssetId = identity.assetId;
      result.textureContentHash = identity.contentHash;
    }
    return result;
  };
  const result = visit(source) as WaterLookAuthoringComponents;
  const validation = validateWaterSurfaceAppearanceV2Asset(result.appearance.appearance);
  if (!validation.valid)
    throw new TypeError(
      validation.diagnostics.map((diagnostic) => diagnostic.message).join("; ") || "Invalid Water surface appearance."
    );
  return result;
}

/** Standard Shader Editor.Properties metadata; enum storage is backed by ordinary int declarations. */
export function waterMaterialShaderSource(source: string, material: WaterMaterialFile): string {
  const properties: string[] = [],
    declarations: string[] = [];
  const reflection = enumFields["reflectionPolicy.policy.preferred"];
  for (const [name, entry] of Object.entries(material.shaderData)) {
    const path = Object.keys(enumFields).find((path) => property(path) === name);
    const options = name === "material_WaterProfile" ? profiles : path ? enumFields[path] : undefined;
    const fallback = name.startsWith("material_WaterReflectionFallback");
    const type =
      options || fallback
        ? `Enum(${[...(fallback ? ["None:-1"] : []), ...(options ?? reflection).map((label, index) => `${label}:${index}`)].join(", ")})`
        : entry.type === "Texture"
          ? "Texture2D"
          : entry.type === "Integer"
            ? "Int"
            : entry.type;
    const value = entry.value as any;
    const literal =
      entry.type === "Texture"
        ? ""
        : ` = ${typeof value === "object" ? `(${Object.values(value).join(", ")})` : String(value)}`;
    properties.push(`${name}("${name}", ${type})${literal};`);
    if (!new RegExp(`\\b${name}\\s*(?:;|\\[)`).test(source))
      declarations.push(
        `${entry.type === "Texture" ? "sampler2D" : entry.type === "Boolean" || entry.type === "Integer" ? "int" : entry.type === "Float" ? "float" : entry.type === "Color" ? "vec4" : `vec${entry.type.slice(-1)}`} ${name};`
      );
  }
  return source.replace(
    /(Shader\s+"[^"\n]+"\s*\{)/,
    `$1\n${declarations.join("\n")}\nEditor { Properties {\n${properties.join("\n")}\n} }\n`
  );
}

/** Write supported native parameters, preserving shader and texture identity. */
export function updateWaterMaterialParameters(
  file: WaterMaterialFile,
  next: WaterLookAuthoringComponents
): WaterMaterialFile {
  const result = structuredClone(file);
  materialDefinition(next, (name, type, value) => {
    if (type !== "Texture") result.shaderData[name] = { type, value };
  });
  return result;
}

/** Detached .mat defaults for Editor and standalone callers; no shaderRef or texture slots. */
export function createWaterMaterialDefaults(profile: WaterMaterialProfile, riverDrops = false): WaterMaterialFile {
  if (!profiles.includes(profile) || (riverDrops && profile !== "river"))
    throw new TypeError("Unsupported Water material preset.");
  return createWaterMaterialFile(defaultLook(profile, riverDrops), profile);
}
