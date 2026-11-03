import { registerWaterContentRestorer } from "../resources/WaterContentRestorer";
import { bindWaterSurfaceCaustics } from "../surface/WaterSurfaceCausticsBinding";
import { registerWaterSurfacePicking } from "../surface/WaterSurfacePicking";
import { bindRiverFlowNormalStrength, bindRiverFoamSampling } from "./RiverMaterialBinding";
import { resolveRiverSurfaceShader } from "./RiverSurfaceShader";
export {
  RIVER_WATER_SURFACE_GEOMETRY_ADAPTER,
  createRiverGeometryShaderFunctions,
  createRiverSurfaceAppearanceV2ShaderSource
} from "./RiverSurfaceShader";
/** River shader creation and material binding. */
import {
  Engine,
  Material,
  ScreenSpaceReflection,
  ScreenSpaceReflectionReceiverMode,
  SystemInfo,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { Vector2, Vector3, Vector4 } from "@galacean/engine-math";
import type { RiverMaterialConfig } from "../../authoring/river/RiverAuthoringTypes";
import type { RiverCompiledSurfaceMotionData } from "../../compiler/river/types";
import riverFoamPixels from "../../resources/river/assets/foam.rgba.base64?raw";
import riverNormalPixels from "../../resources/river/assets/normals.rgba.base64?raw";
import type { WaterReflectionBinding } from "../optics/WaterReflectionService";
import {
  applyWaterSurfaceOpticsBinding,
  applyWaterSurfaceReflectionBinding,
  applyWaterSurfaceTransientOpticalProfile,
  createWaterSurfaceOpticsBindingState
} from "../optics/WaterSurfaceOpticsBinding";
import {
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding,
  type WaterSurfaceOpticsBindingReadback,
  type WaterSurfaceOpticsBindingState,
  type WaterSurfaceOpticsReflectionReadback
} from "../optics/WaterSurfaceOpticsTypes";
import type { WaterSurfaceAppearanceBindingV2 } from "../surface/WaterSurfaceAppearanceRuntimeTypes";
import {
  WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY,
  getWaterSurfaceAppearanceV2BoundaryProperty,
  getWaterSurfaceAppearanceV2DetailProperty
} from "../surface/WaterSurfaceAppearanceV2Shader";
import {
  applyWaterSurfaceDepthResponseV2Uniforms,
  bindWaterSurfaceAppearanceV2Clock,
  updateWaterSurfaceAppearanceV2Clock
} from "../surface/WaterSurfaceAppearanceV2UniformBinding";
import { RIVER_SHADER_PROPERTY } from "./constants";
import {
  bindRiverFlowClock,
  updateRiverFlowClock,
  updateRiverMaterial,
  updateRiverSurfaceMotion
} from "./RiverMaterialBinding";
import { RiverSurfaceDebugMode } from "./RiverRuntimeEnums";

export { hexToColor, updateRiverMaterial, updateRiverSurfaceMotion } from "./RiverMaterialBinding";
const RIVER_SCREEN_SPACE_REFLECTION_COMPOSITE_INTENSITY_PROPERTY =
  "material_WaterScreenSpaceReflectionCompositeIntensity";

const riverSurfaceOpticsBindingStates = new WeakMap<Material, WaterSurfaceOpticsBindingState>();
const riverSurfaceAppearanceStates = new WeakMap<Material, Readonly<{ useLocalMap: boolean }>>();

function getRiverSurfaceOpticsBindingState(material: Material): WaterSurfaceOpticsBindingState {
  const existing = riverSurfaceOpticsBindingStates.get(material);
  if (existing) return existing;
  const state = createWaterSurfaceOpticsBindingState();
  riverSurfaceOpticsBindingStates.set(material, state);
  return state;
}

const surfaceNormalTextures = new WeakMap<Engine, Texture2D>();

const foamTextures = new WeakMap<Engine, Texture2D>();

function getRiverTexture(engine: Engine, cache: WeakMap<Engine, Texture2D>, data: string, name: string): Texture2D {
  const existing = cache.get(engine);
  if (existing && !existing.destroyed) return existing;
  const decoded = atob(data.trim());
  const pixels = Uint8Array.from(decoded, (value) => value.charCodeAt(0));
  const texture = new Texture2D(engine, 512, 512, undefined, true, false);
  texture.name = name;
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Repeat;
  texture.setPixelBuffer(pixels);
  texture.generateMipmaps();
  registerWaterContentRestorer(engine, texture, () => {
    const decoded = atob(data.trim());
    texture.setPixelBuffer(Uint8Array.from(decoded, (value) => value.charCodeAt(0)));
    texture.generateMipmaps();
  });
  cache.set(engine, texture);
  return texture;
}

function configureSurfaceMaterial(
  engine: Engine,
  material: Material,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number,
  motion: RiverCompiledSurfaceMotionData,
  useLocalMap: boolean,
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  opticsBinding: Readonly<WaterSurfaceOpticsBinding>
): Material {
  registerWaterSurfacePicking(material, "depthWriteEnabled");
  riverSurfaceAppearanceStates.set(material, Object.freeze({ useLocalMap }));
  material.shaderData.setTexture(
    RIVER_SHADER_PROPERTY.surfaceNormalTexture,
    getRiverTexture(engine, surfaceNormalTextures, riverNormalPixels, "RiverNormals")
  );
  material.shaderData.setTexture(
    "material_RiverFoamTexture",
    getRiverTexture(engine, foamTextures, riverFoamPixels, "RiverFoam")
  );
  updateRiverMaterial(material, config, flowSpeedMultiplier);
  setRiverSurfaceDepthWriteEnabled(material, false);
  updateRiverSurfaceMotion(material, motion);
  setRiverSurfaceDebugMode(material, RiverSurfaceDebugMode.Off);
  setRiverSurfaceFeatureFlags(material, true, true);
  setRiverSurfaceTimeOverride(material);
  bindRiverFlowClock(material);
  setRiverSurfaceOpticsBinding(material, opticsBinding);
  setRiverScreenSpaceReflectionReceiver(material, false);
  setRiverSurfaceAppearanceBinding(material, binding);
  return material;
}

export function createRiverMaterial(
  engine: Engine,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number,
  motion: RiverCompiledSurfaceMotionData,
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  opticsBinding: Readonly<WaterSurfaceOpticsBinding>
): Material {
  // R8 support is the public SystemInfo capability that requires WebGL2.
  if (!SystemInfo.supportsTextureFormat(engine, TextureFormat.R8))
    throw new Error("River requires WebGL2 integer shader support.");
  return configureSurfaceMaterial(
    engine,
    new Material(engine, resolveRiverSurfaceShader(binding, false)),
    config,
    flowSpeedMultiplier,
    motion,
    false,
    binding,
    opticsBinding
  );
}

export function createRiverLocalMapMaterial(
  engine: Engine,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number,
  motion: RiverCompiledSurfaceMotionData,
  localMapTexture: Texture2D,
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  opticsBinding: Readonly<WaterSurfaceOpticsBinding>
): Material {
  // R8 support is the public SystemInfo capability that requires WebGL2.
  if (!SystemInfo.supportsTextureFormat(engine, TextureFormat.R8))
    throw new Error("River requires WebGL2 integer shader support.");
  const material = configureSurfaceMaterial(
    engine,
    new Material(engine, resolveRiverSurfaceShader(binding, true)),
    config,
    flowSpeedMultiplier,
    motion,
    true,
    binding,
    opticsBinding
  );
  material.shaderData.setTexture(RIVER_SHADER_PROPERTY.localMapTexture, localMapTexture);
  return material;
}

/** Applies one compiled Surface Appearance V2 closure without importing case-owned values. */
export function setRiverSurfaceAppearanceBinding(
  material: Material,
  binding: Readonly<WaterSurfaceAppearanceBindingV2>
): void {
  const state = riverSurfaceAppearanceStates.get(material);
  if (!state) throw new Error("River Surface Appearance requires a V2 River surface material.");
  const appearance = binding.appearance;
  material.shader = resolveRiverSurfaceShader(binding, state.useLocalMap);
  const shaderData = material.shaderData;
  shaderData.setFloat(
    WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.detailEnabled,
    appearance.detailLayers.length > 0 ? 1 : 0
  );
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.depthResponseEnabled, 1);
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.boundaryAlphaEnabled, 1);
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.boundaryMaterialEnabled, 1);
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.refractionUvScale, appearance.refraction.uvScale);
  shaderData.setFloat(
    "material_AppearanceDirectSpecularEnabled",
    binding.featureFlags?.directSpecular === false ? 0 : 1
  );
  const renderContract = binding.renderContract;
  if (!renderContract) throw new Error("River Surface Appearance binding requires its compiled Render Contract.");
  bindRiverFoamSampling(shaderData, renderContract.look.foam);
  bindRiverFlowNormalStrength(shaderData, appearance);

  appearance.detailLayers.forEach((layer, index) => {
    const textureBinding = binding.textureBindings.find((candidate) => candidate.layerId === layer.id);
    if (!textureBinding) throw new Error(`River Surface Appearance layer '${layer.id}' has no texture binding.`);
    shaderData.setTexture(getWaterSurfaceAppearanceV2DetailProperty(index, "texture"), textureBinding.texture);
    shaderData.setVector4(
      getWaterSurfaceAppearanceV2DetailProperty(index, "transform"),
      new Vector4(layer.scale[0], layer.scale[1], layer.velocity[0], layer.velocity[1])
    );
    const rotationRadians = (layer.rotationDegrees * Math.PI) / 180;
    shaderData.setVector2(
      getWaterSurfaceAppearanceV2DetailProperty(index, "rotation"),
      new Vector2(Math.cos(rotationRadians), Math.sin(rotationRadians))
    );
    shaderData.setFloat(getWaterSurfaceAppearanceV2DetailProperty(index, "strength"), layer.strength);
  });

  shaderData.setFloat("material_AppearanceV2DetailNormalStrength", appearance.detailNormalStrength ?? 1);
  applyWaterSurfaceDepthResponseV2Uniforms(shaderData, appearance.depthResponse);
  bindWaterSurfaceCaustics(shaderData, binding);

  appearance.boundaryEffects.forEach((effect, index) => {
    shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "range"), effect.rangeMeters);
    if (effect.exponent !== undefined) {
      shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "exponent"), effect.exponent);
    }
    if (effect.outputs.alpha !== undefined) {
      shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "alpha"), effect.outputs.alpha);
    }
    if (effect.outputs.color !== undefined) {
      shaderData.setVector3(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "color"),
        new Vector3(effect.outputs.color[0], effect.outputs.color[1], effect.outputs.color[2])
      );
    }
    if (effect.outputs.roughness !== undefined) {
      shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "roughness"), effect.outputs.roughness);
    }
    if (effect.outputs.refractionSuppression !== undefined) {
      shaderData.setFloat(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "refractionSuppression"),
        effect.outputs.refractionSuppression
      );
    }
    if (!effect.pattern) return;
    shaderData.setFloat(
      getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternWorldScale"),
      effect.pattern.worldScale
    );
    shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternTimeRate"), effect.pattern.timeRate);
    shaderData.setFloat(getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternOpacity"), effect.pattern.opacity);
    if (effect.pattern.exponent !== undefined) {
      shaderData.setFloat(
        getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternExponent"),
        effect.pattern.exponent
      );
    }
    shaderData.setVector3(
      getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternWeights"),
      new Vector3(
        effect.pattern.octaves.weights[0] ?? 0,
        effect.pattern.octaves.weights[1] ?? 0,
        effect.pattern.octaves.weights[2] ?? 0
      )
    );
    shaderData.setFloat(
      getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternLacunarity"),
      effect.pattern.lacunarity
    );
  });
  bindWaterSurfaceAppearanceV2Clock(material, appearance, true);
  updateRiverFlowClock(material);
}

/** Applies the shared profile/refraction/reflection contract */
export function setRiverSurfaceOpticsBinding(
  material: Material,
  binding: Readonly<WaterSurfaceOpticsBinding>
): Readonly<WaterSurfaceOpticsBindingReadback> {
  return applyWaterSurfaceOpticsBinding(material.shaderData, getRiverSurfaceOpticsBindingState(material), binding);
}

/** Updates only the reflection subset while preserving the existing River Look and refraction state. */
export function setRiverSurfaceReflectionBinding(
  material: Material,
  tier: WaterOpticsTier,
  binding: Readonly<WaterReflectionBinding> | undefined
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  return applyWaterSurfaceReflectionBinding(
    material.shaderData,
    getRiverSurfaceOpticsBindingState(material),
    tier,
    binding
  );
}

/** Updates only the numeric uniforms exposed by V2 live Look tuning. */
export function updateRiverSurfaceTransientOpticalProfile(
  material: Material,
  profile: WaterSurfaceOpticsBinding["opticalProfile"]
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const state = getRiverSurfaceOpticsBindingState(material);
  applyWaterSurfaceTransientOpticalProfile(material.shaderData, state, profile);
  return state.bindingReadback;
}

/** Registers River's explicit Core transparent-receiver contract without owning Camera SSR resources. */
export function setRiverScreenSpaceReflectionReceiver(material: Material, enabled: boolean): void {
  material.shaderData.setFloat(RIVER_SCREEN_SPACE_REFLECTION_COMPOSITE_INTENSITY_PROPERTY, enabled ? 1 : 0);
  // Material.shader is mandatory in the Engine. This guard only permits the narrow
  // ShaderData harnesses used by DOM-free runtime ownership tests.
  if (!material.shader) return;
  const registered = ScreenSpaceReflection.setMaterialReceiver(
    material,
    enabled ? ScreenSpaceReflectionReceiverMode.TransparentSampleOnly : ScreenSpaceReflectionReceiverMode.Disabled,
    enabled ? 1 : 0
  );
  if (!registered) {
    const capability = ScreenSpaceReflection.getMaterialReceiverCapability(material);
    throw new Error(
      `River shader '${material.shader.name}' does not implement the Core SSR receiver contract: ${capability.unsupportedReason ?? "unknown"}.`
    );
  }
}

/** Changes River's forward SSR contribution without releasing its Camera receiver contract. */
export function setRiverScreenSpaceReflectionCompositeIntensity(material: Material, intensity: number): void {
  const resolved = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  material.shaderData.setFloat(RIVER_SCREEN_SPACE_REFLECTION_COMPOSITE_INTENSITY_PROPERTY, resolved);
}

export function setRiverSurfaceDepthWriteEnabled(material: Material, enabled: boolean): void {
  material.shaderData.setInt(RIVER_SHADER_PROPERTY.depthWriteEnabled, enabled ? 1 : 0);
}

export function setRiverSurfaceDebugMode(material: Material, mode: RiverSurfaceDebugMode): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceDebugMode, mode);
}

export function setRiverSurfaceFeatureFlags(
  material: Material,
  macroDisplacementEnabled: boolean,
  microSurfaceEnabled: boolean
): void {
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.macroDisplacementEnabled, macroDisplacementEnabled ? 1 : 0);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.microSurfaceEnabled, microSurfaceEnabled ? 1 : 0);
}

export function setRiverSurfaceTimeOverride(material: Material, elapsedTime?: number): void {
  if (elapsedTime !== undefined && !Number.isFinite(elapsedTime)) {
    throw new RangeError("River surface time must be finite.");
  }
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceTimeOverride, elapsedTime ?? -1);
  updateWaterSurfaceAppearanceV2Clock(material, undefined, true);
  updateRiverFlowClock(material);
}
