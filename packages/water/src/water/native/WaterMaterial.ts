import { Material, type Shader, Texture } from "@galacean/engine-core";
import type { WaterLookAuthoringComponents } from "../authoring/surface/WaterLookAuthoringSnapshot";
import { hashStableValue } from "../compiler/shared/determinism";
import type { WaterRuntimeResourceFactory } from "../runtime/resources/WaterRuntimeResourceRegistry";
import { resolveWaterMaterialProfile, validateWaterShaderCapabilities } from "./WaterAuthoring";
import { builtinWaterTextureFactory } from "./WaterBuiltinAssets";
import { waterBuiltinMaterialTextures } from "./WaterBuiltinMaterialTextures";
import { defaultLook, materialDefinition, decodeWaterMaterialLook } from "./WaterMaterialFile";

export {
  createWaterMaterialDefaults,
  createWaterMaterialFile,
  resolveWaterMaterialFileLook,
  updateWaterMaterialParameters,
  waterMaterialShaderSource,
  type WaterMaterialFile,
  type WaterMaterialProfile
} from "./WaterMaterialFile";

// Shader names are not unique; equivalent materials must share the same Shader instance.
const shaderIdentities = new WeakMap<Shader, number>();
let nextShaderIdentity = 0;

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
  return decodeWaterMaterialLook(source, material.shaderData, waterMaterialTextures(material));
}

/** Built-in bindings, not texture values authored on the Material. No GPU ownership is acquired here. */
export function waterMaterialTextures(material: Material) {
  const data = material.shaderData;
  const drops = data.getInt("material_WaterRiverDrops");
  const profile = resolveWaterMaterialProfile(data.getInt("material_WaterProfile"), drops);
  warnIgnoredTextures(material);
  return waterBuiltinMaterialTextures(profile, !!drops);
}

const warnedMaterials = new WeakSet<Material>();
function warnIgnoredTextures(material: Material): void {
  if (warnedMaterials.has(material)) return;
  if (
    material.shaderData.getProperties().some((property) => material.shaderData.getTexture(property) instanceof Texture)
  ) {
    warnedMaterials.add(material);
    console.warn(
      `Water Material '${material.name}' contains authored textures; only Engine built-in textures are used.`
    );
  }
}

/** Validate authoring input; the runtime registry acquires and releases the built-in textures. */
export async function prepareWaterMaterial(material: Material, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  definitionForMaterial(material);
  waterMaterialTextures(material);
}

export function waterMaterialKey(material?: Material): string | undefined {
  if (!material) return;
  const shader = material.shader;
  let shaderIdentity = shaderIdentities.get(shader);
  if (shaderIdentity === undefined) shaderIdentities.set(shader, (shaderIdentity = ++nextShaderIdentity));
  const drops = material.shaderData.getInt("material_WaterRiverDrops");
  const profile = resolveWaterMaterialProfile(material.shaderData.getInt("material_WaterProfile"), drops);
  const values: unknown[] = [];
  materialDefinition(defaultLook(profile, !!drops), (name, type) => {
    const data = material.shaderData;
    if (type !== "Texture")
      values.push([
        name,
        type === "Float"
          ? data.getFloat(name)
          : type === "Integer" || type === "Boolean"
            ? data.getInt(name)
            : type === "Color"
              ? data.getColor(name)
              : type === "Vector2"
                ? data.getVector2(name)
                : type === "Vector3"
                  ? data.getVector3(name)
                  : data.getVector4(name)
      ]);
  });
  return hashStableValue([
    shaderIdentity,
    profile,
    !!drops,
    values,
    waterMaterialTextures(material).map(({ slot, descriptor }) => [slot, descriptor.contentHash])
  ]);
}

export function waterMaterialFactories(material: Material): WaterRuntimeResourceFactory[] {
  return [
    ...new Map(
      waterMaterialTextures(material).map(({ path, descriptor }) => [
        descriptor.id,
        builtinWaterTextureFactory(material.engine, descriptor, path)
      ])
    ).values()
  ];
}
