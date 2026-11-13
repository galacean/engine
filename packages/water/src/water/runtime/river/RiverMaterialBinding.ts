import { updateWaterSurfaceAppearanceV2Clock } from "../surface/WaterSurfaceAppearanceV2UniformBinding";
import type { Material, ShaderData } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import type { RiverMaterialConfig } from "../../authoring/river/RiverAuthoringTypes";
import type { RiverCompiledSurfaceMotionData } from "../../compiler/river/types";
import type { RiverSurfaceDomainOffsets } from "../../compiler/river/RiverSurfaceMotion";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { RIVER_DEFAULT_FLOW_NORMAL_STRENGTH, RIVER_SHADER_PROPERTY } from "./constants";

// River-only legacy appearance clock. No authoring/physical identity or shared AOT input.
const flowClocks = new WeakMap<Material, { normal: Vector4; foam: Vector4 }>();

/** Installation/rebind only; both vectors are reused on every subsequent update. */
export function bindRiverFlowClock(material: Material): void {
  if (!flowClocks.has(material)) flowClocks.set(material, { normal: new Vector4(), foam: new Vector4() });
  updateRiverFlowClock(material);
}

function positiveMod(value: number): number {
  return ((value % 1) + 1) % 1;
}

/** CPU double * final UV rate, then mod1. Always refresh, including same-time rebind/seek. */
export function updateRiverFlowClock(material: Material, elapsedTime?: number): void {
  const state = flowClocks.get(material);
  if (!state) return;
  const data = material.shaderData;
  const override = data.getFloat(RIVER_SHADER_PROPERTY.surfaceTimeOverride);
  const selected = elapsedTime ?? (override >= 0 ? override : material.engine.time.elapsedTime);
  const time = Number.isFinite(selected) ? Math.max(0, selected) : 0;
  const speed = Math.max(data.getFloat(RIVER_SHADER_PROPERTY.flowSpeedMultiplier), 0);
  const normalRate = -speed * (1.2 / Math.max(data.getFloat(RIVER_SHADER_PROPERTY.surfaceLengthScale), 0.5));
  // xy: regular primary/secondary; steep uses x twice (its primary y*.5 is already absorbed).
  // zw: unused.
  state.normal.set(positiveMod(time * normalRate), positiveMod(time * (normalRate / 4)), 0, 0);
  // xyz: regular primary (=steep primary), regular secondary, steep secondary.
  state.foam.set(
    positiveMod(time * (-0.2 * speed)),
    positiveMod(time * (-0.025 * speed)),
    positiveMod(time * (-0.05 * speed)),
    0
  );
  data.setVector4(RIVER_SHADER_PROPERTY.flowNormalOffsets, state.normal);
  data.setVector4(RIVER_SHADER_PROPERTY.flowFoamOffsets, state.foam);
}

export function hexToColor(hex: string, alpha: number): Color {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  return new Color(red, green, blue, alpha);
}

export function updateRiverMaterial(
  material: Material,
  config: RiverMaterialConfig,
  flowSpeedMultiplier: number
): void {
  material.shaderData.setColor(
    RIVER_SHADER_PROPERTY.baseColor,
    hexToColor(config.baseColor, 0.88 + (1 - config.clarity) * 0.08)
  );
  material.shaderData.setColor(RIVER_SHADER_PROPERTY.foamColor, hexToColor(config.foamColor, 1));
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.flowSpeedMultiplier, flowSpeedMultiplier);
  updateWaterSurfaceAppearanceV2Clock(material, undefined, true);
  updateRiverFlowClock(material);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, config.foamIntensity);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.clarity, config.clarity);
}

export function updateRiverSurfaceMotion(material: Material, motion: RiverCompiledSurfaceMotionData): void {
  material.shaderData.setVector4(RIVER_SHADER_PROPERTY.surfaceDomainOffsets, new Vector4());
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceWarpOffset, 0);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceSeed, motion.seed);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceMaxDisplacement, motion.maxDisplacement);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceLengthScale, motion.displacementLengthScale);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.shoreDampingWidth, motion.shoreDampingWidth);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceTurbulence, motion.turbulence);
  updateRiverFlowClock(material);
}

/** Reuses the material-owned vector allocated with its static motion bindings. */
export function updateRiverSurfaceDomainOffsets(material: Material, offsets: RiverSurfaceDomainOffsets): void {
  material.shaderData
    .getVector4(RIVER_SHADER_PROPERTY.surfaceDomainOffsets)
    .set(offsets.base, offsets.octave2, offsets.octave3, offsets.ridge);
  material.shaderData.setFloat(RIVER_SHADER_PROPERTY.surfaceWarpOffset, offsets.warp);
}

/**
 * Reconstructs descriptor/body-local XZ from chunk-local object coordinates.
 *
 * Sampling before the renderer model transform is equivalent to applying the
 * complete inverse planar transform, while remaining correct when an outer
 * floating-origin root is moved after activation.
 */
export interface RiverLocalMapRendererBinding {
  readonly chunkLocalOrigin: readonly [x: number, y: number, z: number];
  readonly bodyToUv: readonly [scaleX: number, scaleZ: number, offsetX: number, offsetZ: number];
  readonly uvRect: readonly [minU: number, minV: number, maxU: number, maxV: number];
  readonly confluence: boolean;
}

export function setRiverLocalMapRendererBinding(
  shaderData: ShaderData,
  binding: Readonly<RiverLocalMapRendererBinding>
): void {
  const chunkLocalOrigin = binding.chunkLocalOrigin;
  shaderData.setVector4(
    RIVER_SHADER_PROPERTY.localMapBodyOrigin,
    new Vector4(chunkLocalOrigin[0], chunkLocalOrigin[2], 0, 0)
  );
  shaderData.setVector4(RIVER_SHADER_PROPERTY.localMapBodyToUv, new Vector4(...binding.bodyToUv));
  shaderData.setVector4(RIVER_SHADER_PROPERTY.localMapUvRect, new Vector4(...binding.uvRect));
  shaderData.setFloat(RIVER_SHADER_PROPERTY.localMapConfluence, binding.confluence ? 1 : 0);
}

export function bindRiverFlowNormalStrength(
  shaderData: ShaderData,
  appearance: CompiledWaterSurfaceAppearanceV2
): void {
  const strength =
    appearance.flowNormalStrength ?? appearance.detailLayers[0]?.strength ?? RIVER_DEFAULT_FLOW_NORMAL_STRENGTH;
  shaderData.setFloat(RIVER_SHADER_PROPERTY.flowNormalStrength, strength);
  if (strength > 0) shaderData.enableMacro("MATERIAL_RIVER_FLOW_NORMAL");
  else shaderData.disableMacro("MATERIAL_RIVER_FLOW_NORMAL");
}

export function bindRiverFoamSampling(
  shaderData: ShaderData,
  foam: { readonly enabled: boolean; readonly intensity: number }
): void {
  if (foam.enabled) shaderData.enableMacro("MATERIAL_RIVER_FOAM");
  else shaderData.disableMacro("MATERIAL_RIVER_FOAM");
  shaderData.setFloat(RIVER_SHADER_PROPERTY.crestIntensity, foam.enabled ? foam.intensity : 0);
  shaderData.setFloat(RIVER_SHADER_PROPERTY.foamIntensity, foam.enabled ? foam.intensity : 0);
}
