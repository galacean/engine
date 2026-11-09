import { Material, Texture2D } from "@galacean/engine-core";
import { resolveWaterMaterialProfile, validateWaterShaderCapabilities } from "./WaterAuthoring";
import { Color } from "@galacean/engine-math";
import type { WaterLookAuthoringComponents } from "../authoring/surface/WaterLookAuthoringSnapshot";
import type { WaterResourceAssetDescriptorV1 } from "../authoring/body/WaterBodyAuthoringTypes";
import type { WaterRuntimeResourceFactory } from "../runtime/resources/WaterRuntimeResourceRegistry";
import { digestSha256Hex } from "../resources/sha256";
import { hashStableValue } from "../compiler/shared/determinism";
import { WaterBodyAssetRegistry } from "../runtime/body/WaterBodyAssetRegistry";
import { registerLakeWaterLook, LAKE_WATER_LOOK_PRESET_ID } from "../presets/lake/LakeWaterLook";
import { registerFarmlandsRiverLook, FARMLANDS_RIVER_LOOK_ID } from "../authoring/river/FarmlandsRiverLook";
import { registerRiverWaterBodyPresets } from "../authoring/river/RiverWaterBodyAuthoring";
import { registerOceanLook } from "../authoring/ocean/OceanAuthoring";
import { OCEAN_LOOK_ID } from "../presets/ocean/index";
import * as Surface from "../authoring/surface/WaterSurfaceAppearanceTypes";

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
  shaderRef: { url: string };
  macros: { name: string; value?: string }[];
  shaderData: Record<string, { type: ParameterType | "Texture"; value: unknown }>;
}
export type WaterMaterialProfile = "lake" | "river" | "ocean";
const profiles: WaterMaterialProfile[] = ["lake", "river", "ocean"];
const definitions = new Map<string, WaterLookAuthoringComponents>();

/** Fixed shader/field structure comes from the existing compiler presets, never an author asset. */
function defaultLook(profile: WaterMaterialProfile, drops: boolean): WaterLookAuthoringComponents {
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

/** One native Material owns visual values, texture references and appearance policies. */
export function createWaterMaterialFile(
  look: WaterLookAuthoringComponents,
  profile: WaterMaterialProfile,
  shader: { name: string; path: string },
  texturePaths: ReadonlyMap<string, string>
): WaterMaterialFile {
  const material: WaterMaterialFile = {
    name: look.look.id,
    shader: shader.name,
    shaderRef: { url: shader.path },
    macros: [],
    shaderData: {
      material_WaterProfile: { type: "Integer", value: profiles.indexOf(profile) },
      material_WaterRiverDrops: { type: "Boolean", value: !!look.look.riverDrops }
    }
  };
  materialDefinition(
    look,
    (name, type, value) => {
      material.shaderData[name] = { type, value };
    },
    (id) => {
      const path = texturePaths.get(id);
      if (!path) throw new Error(`Missing native Water texture '${id}'.`);
      return { url: path };
    }
  );
  return material;
}

/** Derive binding addresses and immutable field dependencies from shader-family code. */
function materialDefinition(
  look: WaterLookAuthoringComponents,
  write?: (name: string, type: ParameterType | "Texture", value: unknown) => void,
  texturePath?: (id: string) => unknown
): Record<string, any> {
  const texture = (id: string, name: string): TextureParameter => {
    write?.(name, "Texture", texturePath?.(id));
    return { $waterTexture: name };
  };
  const visit = (value: any, path: string): any => {
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
          ? Object.fromEntries(value.map((item: number, index: number) => ["xyzw"[index], item]))
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

function definitionForMaterial(material: Material) {
  if (!(material instanceof Material) || material.destroyed)
    throw new TypeError("Water requires a live native Material.");
  const index = material.shaderData.getInt("material_WaterProfile");
  const drops = material.shaderData.getInt("material_WaterRiverDrops");
  const profile = resolveWaterMaterialProfile(index, drops);
  validateWaterShaderCapabilities(
    profile,
    material.shader.subShaders.map((sub) => sub.name)
  );
  return materialDefinition(defaultLook(profile, !!drops));
}

/** Resolve transient compiler input solely from a native Material. No Look author asset is required. */
export function resolveWaterMaterialLook(material: Material): WaterLookAuthoringComponents {
  const source = definitionForMaterial(material);
  const readTexture = (value: TextureParameter) => {
    const texture = material.shaderData.getTexture(value.$waterTexture);
    if (!(texture instanceof Texture2D) || texture.destroyed)
      throw new TypeError(`Water Material '${material.name}' is missing Texture2D '${value.$waterTexture}'.`);
    const identity = textureIdentities.get(texture);
    if (!identity) throw new Error(`Water texture '${texture.name}' is not prepared.`);
    return { assetId: identity.id, contentHash: identity.contentHash };
  };
  const enumValue = (name: string, options: readonly string[]) => {
    const value = material.shaderData.getInt(name);
    if (!Number.isInteger(value) || options[value] === undefined)
      throw new TypeError(`Invalid Water Material policy '${name}'.`);
    return options[value];
  };
  const visit = (value: any): any => {
    if (!value || typeof value !== "object") return value;
    if (value.$waterTexture) return readTexture(value);
    if (value.$waterFallbacks)
      return value.$waterFallbacks.flatMap((name: string) =>
        material.shaderData.getInt(name) === -1
          ? []
          : [enumValue(name, enumFields["reflectionPolicy.policy.preferred"])]
      );
    if (value.$waterParameter) {
      const name = value.$waterParameter,
        data = material.shaderData;
      if (value.options) return enumValue(name, value.options);
      if (["Float", "Integer", "Boolean"].includes(value.type)) {
        const number = value.type === "Float" ? data.getFloat(name) : data.getInt(name);
        if (!Number.isFinite(number)) throw new TypeError(`Missing finite Water Material parameter '${name}'.`);
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
    if ($waterSurfaceTexture) {
      const identity = readTexture($waterSurfaceTexture);
      result.textureAssetId = identity.assetId;
      result.textureContentHash = identity.contentHash;
    }
    return result;
  };
  return visit(source);
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

const textureIdentities = new WeakMap<Texture2D, WaterResourceAssetDescriptorV1>();
const textureLoads = new WeakMap<Texture2D, Promise<void>>();

export function waterMaterialTextures(material: Material): Texture2D[] {
  return [
    ...new Set(
      material.shaderData
        .getProperties()
        .map((property) => material.shaderData.getTexture(property))
        .filter((value): value is Texture2D => value instanceof Texture2D)
    )
  ];
}

/** Hash the bytes addressed by this loaded native resource, including detached withAsset namespaces. */
export async function prepareWaterMaterial(material: Material, signal?: AbortSignal): Promise<void> {
  if (!(material instanceof Material) || material.destroyed)
    throw new TypeError("Water requires a live native Material.");
  for (const texture of waterMaterialTextures(material)) {
    signal?.throwIfAborted();
    let loading = textureLoads.get(texture);
    if (!loading) {
      loading = (async () => {
        const path = texture.engine.resourceManager.getAssetPath(texture.instanceId);
        if (!path) throw new Error(`Water texture '${texture.name}' has no native source URL.`);
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Water texture '${path}': HTTP ${response.status}.`);
        const contentHash = await digestSha256Hex(await response.arrayBuffer());
        textureIdentities.set(texture, {
          schemaVersion: 1,
          id: `native-water-texture:${contentHash}:${texture.isSRGBColorSpace ? "srgb" : "linear"}`,
          kind: "texture",
          contentHash,
          ownership: "shared",
          fallbackPolicy: "required"
        });
      })();
      textureLoads.set(texture, loading);
      void loading.catch(() => textureLoads.delete(texture));
    }
    await loading;
    const identity = textureIdentities.get(texture)!;
    // Decoding the same image with a different mip policy changes the sampled
    // resource. Active leases must not reuse the previous native mip chain.
    textureIdentities.set(texture, {
      ...identity,
      id: `native-water-texture:${identity.contentHash}:${hashStableValue([
        texture.isSRGBColorSpace,
        texture.wrapModeU,
        texture.wrapModeV,
        texture.filterMode,
        texture.anisoLevel,
        texture.mipmapCount
      ])}`
    });
    signal?.throwIfAborted();
  }
}

export function waterMaterialKey(material?: Material): string | undefined {
  if (!material) return;
  return hashStableValue([
    material.shader.name,
    shaderIdentity(material.shader),
    material.shaderData.getProperties().map((property) => {
      const texture = material.shaderData.getTexture(property);
      if (texture instanceof Texture2D)
        return [
          property.name,
          texture.instanceId,
          texture.wrapModeU,
          texture.wrapModeV,
          texture.filterMode,
          texture.anisoLevel,
          texture.mipmapCount
        ];
      return [
        property.name,
        material.shaderData.getFloat(property),
        material.shaderData.getInt(property),
        material.shaderData.getVector2(property),
        material.shaderData.getVector3(property),
        material.shaderData.getVector4(property),
        material.shaderData.getColor(property)
      ];
    })
  ]);
}

export function waterMaterialFactories(material: Material): WaterRuntimeResourceFactory[] {
  return waterMaterialTextures(material).map((texture) => {
    const descriptor = textureIdentities.get(texture);
    if (!descriptor) throw new Error(`Water texture '${texture.name}' is not prepared.`);
    return {
      descriptor,
      load: () => {
        texture._addReferCount(1);
        return { texture };
      },
      destroy: () => {
        // Native project textures are borrowed assets, not Water-owned allocations.
        texture._addReferCount(-1);
      }
    };
  });
}

const shaderIdentities = new WeakMap<object, number>();
let nextShaderIdentity = 0;
function shaderIdentity(shader: object): number {
  let identity = shaderIdentities.get(shader);
  if (identity === undefined) shaderIdentities.set(shader, (identity = ++nextShaderIdentity));
  return identity;
}
