import { Material, type Shader, Texture2D, TextureFormat } from "@galacean/engine-core";
import type { WaterLookAuthoringComponents } from "../authoring/surface/WaterLookAuthoringSnapshot";
import { hashStableValue } from "../compiler/shared/determinism";
import type { WaterRuntimeResourceFactory } from "../runtime/resources/WaterRuntimeResourceRegistry";
import { resolveWaterMaterialProfile, validateWaterShaderCapabilities } from "./WaterAuthoring";
import { WATER_MATERIAL_TEXTURE_SLOTS, validateWaterMaterialTextureMetadata } from "./WaterMaterialTextureSlots";
import type { WaterResourceAssetDescriptorV1 } from "../authoring/body/WaterBodyAuthoringTypes";
import { defaultLook, materialDefinition, decodeWaterMaterialLook } from "./WaterMaterialFile";

export {
  WATER_MATERIAL_TEXTURE_SLOTS,
  validateWaterMaterialTextureMetadata,
  type WaterMaterialTextureSlot,
  type WaterMaterialTextureMetadata,
  createWaterMaterialDefaults,
  createWaterMaterialFile,
  resolveWaterMaterialFileLook,
  updateWaterMaterialParameters,
  waterMaterialShaderSource,
  waterMaterialProperties,
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

/** Current native handles; no fetch, image hashing or additional persistent asset identity. */
export function waterMaterialTextures(material: Material) {
  const data = material.shaderData;
  const profile = resolveWaterMaterialProfile(
    data.getInt("material_WaterProfile"),
    data.getInt("material_WaterRiverDrops")
  );
  return WATER_MATERIAL_TEXTURE_SLOTS[profile].flatMap((slot) => {
    const texture = data.getTexture(slot.slot);
    if (texture == null) return [];
    if (!(texture instanceof Texture2D) || texture.destroyed || texture.engine !== material.engine)
      throw new TypeError(`Water texture '${slot.slot}' requires a live Texture2D from the same Engine.`);
    validateWaterMaterialTextureMetadata(slot, texture);
    if (texture._isDepthTexture || texture.format === TextureFormat.R32G32B32A32_UInt)
      throw new TypeError(`Water texture '${slot.slot}' requires a sampled image, not a depth or integer texture.`);
    const state = hashStableValue([
      texture.instanceId,
      texture.width,
      texture.height,
      texture.format,
      texture.isSRGBColorSpace,
      texture.mipmapCount,
      texture.wrapModeU,
      texture.wrapModeV,
      texture.filterMode,
      texture.anisoLevel
    ]);
    const descriptor: WaterResourceAssetDescriptorV1 = {
      schemaVersion: 1,
      id: `native-texture:${texture.instanceId}:${state}`,
      kind: "texture",
      // The existing compiler DTO calls this contentHash. Here it is a transient
      // native-handle/sampling fingerprint, never a source-file hash or admission rule.
      contentHash: state.repeat(4),
      ownership: "instance",
      fallbackPolicy: "required"
    };
    return [{ slot: slot.slot, texture, descriptor }];
  });
}

/** Validate authoring input; the runtime registry borrows native references without owning the textures. */
export async function prepareWaterMaterial(material: Material, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  definitionForMaterial(material);
  waterMaterialTextures(material);
}

interface WaterMaterialTextureSlotSnapshot {
  texture: Texture2D | null;
  width: number;
  height: number;
  format: number;
  isSRGBColorSpace: boolean;
  mipmapCount: number;
  wrapModeU: number;
  wrapModeV: number;
  filterMode: number;
  anisoLevel: number;
}

type WaterMaterialSlotProfile = keyof typeof WATER_MATERIAL_TEXTURE_SLOTS;

export interface WaterMaterialTextureKeyCache {
  material?: Material;
  profileIndex: number;
  riverDrops: number;
  profile: WaterMaterialSlotProfile;
  slots: WaterMaterialTextureSlotSnapshot[];
  key: string | undefined;
}

function isWaterTextureSnapshotMatch(cache: WaterMaterialTextureKeyCache, material?: Material): boolean {
  if (!material) return cache.material === undefined;
  if (cache.material !== material || material.destroyed) return false;
  const data = material.shaderData;
  if (
    data.getInt("material_WaterProfile") !== cache.profileIndex ||
    data.getInt("material_WaterRiverDrops") !== cache.riverDrops
  )
    return false;
  const defs = WATER_MATERIAL_TEXTURE_SLOTS[cache.profile];
  if (defs.length !== cache.slots.length) return false;
  for (let i = 0; i < defs.length; i++) {
    const tex = data.getTexture(defs[i].slot) ?? null;
    const entry = cache.slots[i];
    if (tex !== entry.texture) return false;
    if (tex !== null) {
      if (
        tex.destroyed ||
        tex.width !== entry.width ||
        tex.height !== entry.height ||
        tex.format !== entry.format ||
        tex.isSRGBColorSpace !== entry.isSRGBColorSpace ||
        tex.mipmapCount !== entry.mipmapCount ||
        tex.wrapModeU !== entry.wrapModeU ||
        tex.wrapModeV !== entry.wrapModeV ||
        tex.filterMode !== entry.filterMode ||
        tex.anisoLevel !== entry.anisoLevel
      )
        return false;
    }
  }
  return true;
}

/** Native texture and sampler changes invalidate derived bindings; pixel writes use the same GPU object. */
export function waterMaterialTextureKey(material?: Material): string | undefined {
  return (
    material && hashStableValue(waterMaterialTextures(material).map(({ slot, descriptor }) => [slot, descriptor.id]))
  );
}

/** Cached variant of `waterMaterialTextureKey` that avoids reallocating/hashing when texture properties are unchanged. */
export function resolveCachedWaterMaterialTextureKey(
  material: Material | undefined,
  cache?: WaterMaterialTextureKeyCache
): WaterMaterialTextureKeyCache {
  if (cache && isWaterTextureSnapshotMatch(cache, material)) return cache;
  const key = waterMaterialTextureKey(material);
  if (!material) {
    return {
      material: undefined,
      profileIndex: 0,
      riverDrops: 0,
      profile: "lake",
      slots: [],
      key
    };
  }
  const data = material.shaderData;
  const profileIndex = data.getInt("material_WaterProfile");
  const riverDrops = data.getInt("material_WaterRiverDrops");
  const profile = resolveWaterMaterialProfile(profileIndex, riverDrops);
  const defs = WATER_MATERIAL_TEXTURE_SLOTS[profile];
  const slots: WaterMaterialTextureSlotSnapshot[] = new Array(defs.length);
  for (let i = 0; i < defs.length; i++) {
    const tex = data.getTexture(defs[i].slot) as Texture2D | null | undefined;
    if (tex == null) {
      slots[i] = {
        texture: null,
        width: 0,
        height: 0,
        format: 0,
        isSRGBColorSpace: false,
        mipmapCount: 0,
        wrapModeU: 0,
        wrapModeV: 0,
        filterMode: 0,
        anisoLevel: 0
      };
    } else {
      slots[i] = {
        texture: tex,
        width: tex.width,
        height: tex.height,
        format: tex.format,
        isSRGBColorSpace: tex.isSRGBColorSpace,
        mipmapCount: tex.mipmapCount,
        wrapModeU: tex.wrapModeU,
        wrapModeV: tex.wrapModeV,
        filterMode: tex.filterMode,
        anisoLevel: tex.anisoLevel
      };
    }
  }
  return { material, profileIndex, riverDrops, profile, slots, key };
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
      waterMaterialTextures(material).map(({ texture, descriptor }) => {
        // Registry factory metadata may outlive a retired generation; do not retain its image.
        const handle = new WeakRef(texture);
        const factory: WaterRuntimeResourceFactory = {
          descriptor,
          load: ({ signal }) => {
            signal?.throwIfAborted();
            const texture = handle.deref();
            if (!texture || texture.destroyed)
              throw new Error(`Water texture '${descriptor.id}' is no longer available.`);
            texture._addReferCount(1);
            return { texture };
          },
          destroy: (resource) => (resource as { texture: Texture2D }).texture._addReferCount(-1)
        };
        return [descriptor.id, factory] as const;
      })
    ).values()
  ];
}
