/** Shared Surface Appearance V2 numeric bindings and HF/River bounded clocks. */
import type { Material } from "@galacean/engine-core";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import { Vector4 } from "@galacean/engine-math";
import {
  WaterSurfaceDepthResponseModelV2,
  WaterSurfaceDetailSpace,
  WaterPatternModelV2,
  type WaterSurfaceAppearanceAssetV2,
  type WaterSurfaceDepthResponseV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import {
  WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY,
  getWaterSurfaceAppearanceV2ColorStopProperty,
  getWaterSurfaceAppearanceV2DetailProperty,
  getWaterSurfaceAppearanceV2BoundaryProperty,
  getWaterSurfaceAppearanceV2DepthProperty
} from "./WaterSurfaceAppearanceV2Shader";

export interface WaterSurfaceDepthResponseShaderData {
  setFloat(propertyName: string, value: number): void;
  setVector4(propertyName: string, value: Vector4): void;
}

function toVector4(color: readonly [number, number, number, number]): Vector4 {
  return new Vector4(color[0], color[1], color[2], color[3]);
}

export function applyWaterSurfaceDepthResponseV2Uniforms(
  shaderData: WaterSurfaceDepthResponseShaderData,
  depth: Readonly<WaterSurfaceDepthResponseV2>
): void {
  if (depth.model === WaterSurfaceDepthResponseModelV2.BeerLambert) {
    if (depth.scatteringTint) {
      shaderData.setFloat(
        getWaterSurfaceAppearanceV2DepthProperty("coefficient0"),
        depth.scatteringTint.coefficientPerMeter
      );
      shaderData.setVector4(
        getWaterSurfaceAppearanceV2DepthProperty("shallowColor"),
        toVector4(depth.scatteringTint.shallowColor)
      );
      shaderData.setVector4(
        getWaterSurfaceAppearanceV2DepthProperty("deepColor"),
        toVector4(depth.scatteringTint.deepColor)
      );
    }
    return;
  }
  if (depth.model === WaterSurfaceDepthResponseModelV2.LinearColorOpacity) {
    shaderData.setFloat(getWaterSurfaceAppearanceV2DepthProperty("coefficient0"), depth.colorCoefficientPerMeter);
    shaderData.setFloat(getWaterSurfaceAppearanceV2DepthProperty("coefficient1"), depth.opacityCoefficientPerMeter);
    shaderData.setFloat(getWaterSurfaceAppearanceV2DepthProperty("maximumOpacity"), depth.maximumOpacity);
    shaderData.setVector4(getWaterSurfaceAppearanceV2DepthProperty("shallowColor"), toVector4(depth.shallowColor));
    shaderData.setVector4(getWaterSurfaceAppearanceV2DepthProperty("deepColor"), toVector4(depth.deepColor));
    return;
  }
  if (depth.model === WaterSurfaceDepthResponseModelV2.CompositeExponential) {
    shaderData.setFloat(getWaterSurfaceAppearanceV2DepthProperty("coefficient0"), depth.terms[0].coefficientPerMeter);
    shaderData.setFloat(
      getWaterSurfaceAppearanceV2DepthProperty("coefficient1"),
      depth.terms[1]?.coefficientPerMeter ?? 0
    );
    shaderData.setVector4(getWaterSurfaceAppearanceV2DepthProperty("shallowColor"), toVector4(depth.shallowColor));
    shaderData.setVector4(getWaterSurfaceAppearanceV2DepthProperty("deepColor"), toVector4(depth.deepColor));
    return;
  }

  shaderData.setFloat(getWaterSurfaceAppearanceV2DepthProperty("distance"), depth.distanceMeters);
  if (depth.model === WaterSurfaceDepthResponseModelV2.PowerRamp) {
    shaderData.setFloat(getWaterSurfaceAppearanceV2DepthProperty("exponent"), depth.exponent);
    shaderData.setVector4(getWaterSurfaceAppearanceV2DepthProperty("color"), toVector4(depth.color));
    return;
  }

  depth.colors.forEach((stop, index) => {
    shaderData.setFloat(getWaterSurfaceAppearanceV2ColorStopProperty(index, "position"), stop.position);
    shaderData.setVector4(getWaterSurfaceAppearanceV2ColorStopProperty(index, "color"), toVector4(stop.color));
  });
}

/** Binds shared visual-normal and directional-highlight response data. */
export function applyWaterSurfaceLightingV2Uniforms(
  shaderData: WaterSurfaceDepthResponseShaderData,
  appearance: Pick<
    WaterSurfaceAppearanceAssetV2,
    "macroNormalStrength" | "detailNormalStrength" | "directionalHighlight"
  >
): void {
  shaderData.setFloat("material_AppearanceV2DetailNormalStrength", appearance.detailNormalStrength ?? 1);
  if (appearance.macroNormalStrength !== undefined) {
    shaderData.setFloat(
      WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.macroNormalStrength,
      appearance.macroNormalStrength
    );
  }
  const highlight = appearance.directionalHighlight;
  if (!highlight) return;
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.directionalHighlightStrength, highlight.strength);
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.directionalHighlightExponent, highlight.exponent);
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.directionalHighlightDistortion, highlight.distortion);
  shaderData.setFloat(WATER_SURFACE_APPEARANCE_V2_SHADER_PROPERTY.directionalHighlightSharp, highlight.sharp ? 1 : 0);
}

// HF/River S1: double precision time * final rate, then reduce in the
// consumer's real periodic domain. These values never enter compiled assets.
interface WaterAppearanceClockLayer {
  readonly transformProperty: string;
  readonly transform: Vector4;
  readonly velocityX: number;
  readonly velocityY: number;
  readonly advectedX: number;
  readonly advectedY: number;
}

interface WaterAppearanceClockState {
  readonly appearance: Readonly<CompiledWaterSurfaceAppearanceV2>;
  readonly river: boolean;
  readonly layers: readonly WaterAppearanceClockLayer[];
  readonly patterns: readonly { property: string; rate: number; period: number }[];
  readonly causticsTransform?: Vector4;
  lastTime: number;
  lastSpeed: number;
}

const appearanceClocks = new WeakMap<Material, WaterAppearanceClockState>();

function positiveMod(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Reuses Transform.zw for UV offset and PatternTimeRate for bounded phase.
 * Author velocities/rates remain in the immutable appearance, never in readback.
 * HF FlowAdvected (S2) retains its wrapped-time velocity/local-flow semantics.
 */
export function bindWaterSurfaceAppearanceV2Clock(
  material: Material,
  appearance: Readonly<CompiledWaterSurfaceAppearanceV2>,
  river = false
): void {
  const layers = appearance.detailLayers.flatMap((layer, index) => {
    if (!river && layer.space === WaterSurfaceDetailSpace.FlowAdvected) return [];
    const radians = (layer.rotationDegrees * Math.PI) / 180;
    const advected = river && layer.space === WaterSurfaceDetailSpace.FlowAdvected;
    return [
      {
        transformProperty: getWaterSurfaceAppearanceV2DetailProperty(index, "transform"),
        transform: new Vector4(layer.scale[0], layer.scale[1], 0, 0),
        velocityX: layer.velocity[0],
        velocityY: layer.velocity[1],
        advectedX: advected ? -layer.scale[0] * Math.cos(radians) : 0,
        advectedY: advected ? -layer.scale[0] * Math.sin(radians) : 0
      }
    ];
  });
  const c = appearance.caustics;
  appearanceClocks.set(material, {
    appearance,
    river,
    layers,
    patterns: appearance.boundaryEffects.flatMap((effect, index) =>
      effect.pattern
        ? [
            {
              property: getWaterSurfaceAppearanceV2BoundaryProperty(index, "patternTimeRate"),
              rate: effect.pattern.timeRate,
              period: effect.pattern.model === WaterPatternModelV2.AnimatedVoronoiF1 ? 2 * Math.PI : 289
            }
          ]
        : []
    ),
    causticsTransform: c ? new Vector4(c.scale[0], c.scale[1], 0, 0) : undefined,
    lastTime: Number.NaN,
    lastSpeed: Number.NaN
  });
  updateWaterSurfaceAppearanceV2Clock(material, undefined, true);
}

/** No per-frame allocations; same-time seek/rebind and multiplier changes refresh.
 * The material setter path also refreshes immediately, before its next draw.
 */
export function updateWaterSurfaceAppearanceV2Clock(material: Material, elapsedTime?: number, force = false): void {
  const state = appearanceClocks.get(material);
  if (!state) return;
  const data = material.shaderData;
  const override = data.getFloat("material_SurfaceTimeOverride");
  const selected = elapsedTime ?? (override >= 0 ? override : material.engine.time.elapsedTime);
  const time = Number.isFinite(selected) ? Math.max(0, selected) : 0;
  // s is the uniform material multiplier, never the per-pixel local flow speed.
  const speed = state.river ? Math.max(data.getFloat("material_FlowSpeed"), 0) : 0;
  if (!force && time === state.lastTime && speed === state.lastSpeed) return;
  for (let index = 0; index < state.layers.length; index++) {
    const layer = state.layers[index];
    const transform = layer.transform;
    transform.z = positiveMod(time * (layer.velocityX + speed * layer.advectedX), 1);
    transform.w = positiveMod(time * (layer.velocityY + speed * layer.advectedY), 1);
    data.setVector4(layer.transformProperty, transform);
  }
  const c = state.appearance.caustics;
  if (c && state.causticsTransform) {
    state.causticsTransform.z = positiveMod(time * c.velocity[0], 1);
    state.causticsTransform.w = positiveMod(time * c.velocity[1], 1);
    data.setVector4("material_AppearanceV2CausticsTransform", state.causticsTransform);
  }
  for (let index = 0; index < state.patterns.length; index++) {
    const pattern = state.patterns[index];
    data.setFloat(pattern.property, positiveMod(time * pattern.rate, pattern.period));
  }
  state.lastTime = time;
  state.lastSpeed = speed;
}
