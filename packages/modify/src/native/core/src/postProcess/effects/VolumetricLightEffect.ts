import { Color, MathUtil, Vector3 } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { Scene } from "../../Scene";
import { ShadowType } from "../../shadow";
import { ShaderMacro, ShaderProperty } from "../../shader";
import { PostProcessEffect } from "../PostProcessEffect";
import {
  PostProcessEffectColorParameter,
  PostProcessEffectEnumParameter,
  PostProcessEffectFloatParameter,
  PostProcessEffectVector3Parameter
} from "../PostProcessEffectParameter";

/**
 * Quality tiers for {@link VolumetricLightEffect}.
 */
export enum VolumetricLightQuality {
  /**
   * Mobile / low-end 2D screen-space radial shafts (3-pass <=270p R11G11B10F).
   */
  Low = 0,
  /**
   * Standard PC / high-end mobile 3D shadow-map volumetric raymarching (<=360p RG16F, 16 steps + 5-tap bilateral blur).
   */
  Medium = 1,
  /**
   * High-end PC 3D shadow-map volumetric raymarching (<=720p RG16F, 32 steps + 7-tap bilateral blur).
   */
  High = 2
}

export interface VolumetricLightScreenState {
  visible: boolean;
  sunU: number;
  sunV: number;
  effectiveStrength: number;
  aspectRatio: number;
  /** True when Medium/High 3D shadow-map raymarching is active for this frame. */
  useRaymarch?: boolean;
  /** Resolved horizon fade in `[0, 1]`. */
  horizonFade?: number;
  /** Resolved normalized direction pointing toward the sun in world space. */
  dirToSunX?: number;
  dirToSunY?: number;
  dirToSunZ?: number;
}

const VOLUMETRIC_LIGHT_TEMP = {
  dirToSun: new Vector3(),
  viewDir: new Vector3()
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = MathUtil.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Engine-native Uber-pass volumetric light shafts supporting tiered quality:
 * - `Low` (default): 2D screen-space 3-pass cascaded radial scatter (`<=270p R11G11B10F`).
 * - `Medium` / `High`: 3D cascaded shadow-map volumetric raymarching (`<=360p` / `<=720p RG16F`)
 *   with Cornette-Shanks phase function, separable depth-aware bilateral blur, and bilateral Uber upsample.
 */
export class VolumetricLightEffect extends PostProcessEffect {
  /** @internal */
  static readonly _shaderName = "PostProcess/VolumetricLight";
  /** @internal */
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_VOLUMETRIC_LIGHT");
  /** @internal */
  static _raymarchMacro: ShaderMacro = ShaderMacro.getByName("VOLUMETRIC_LIGHT_RAYMARCH");
  /** @internal */
  static _heightFogMacro: ShaderMacro = ShaderMacro.getByName("VOLUMETRIC_LIGHT_HEIGHT_FOG");
  /** @internal */
  static _textureProperty: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightTexture");
  /** @internal */
  static _depthTextureProperty: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightDepthTexture");
  /** @internal */
  static _params0Property: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightParams0");
  /** @internal */
  static _params1Property: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightParams1");
  /** @internal */
  static _compositeParamsProperty: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightCompositeParams");
  /** @internal */
  static _tintProperty: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightTint");
  /** @internal */
  static _thresholdProperty: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightThreshold");
  /** @internal */
  static _raymarchParams0Property: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightRaymarchParams0");
  /** @internal */
  static _raymarchParams1Property: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightRaymarchParams1");
  /** @internal */
  static _sunDirProperty: ShaderProperty = ShaderProperty.getByName("material_VolumetricLightSunDir");
  /** @internal */
  static _bilateralSharpnessProperty: ShaderProperty = ShaderProperty.getByName(
    "material_VolumetricLightBilateralSharpness"
  );

  /** Quality tier (`Low` = 2D radial default, `Medium` = 3D 360p, `High` = 3D 720p). */
  quality = new PostProcessEffectEnumParameter(VolumetricLightQuality, VolumetricLightQuality.Low);

  /** Overall linear intensity of the volumetric light shafts (`0..2.5`). */
  intensity = new PostProcessEffectFloatParameter(0.6, 0, 2.5);

  /** Luminance extraction threshold separating bright sky gaps / silver-lining rims from dark cloud cores (`0..4`, Low mode). */
  threshold = new PostProcessEffectFloatParameter(0.18, 0, 4);

  /** Radial ray span toward the projected sun position (`0.2..1.5`, Low mode). */
  density = new PostProcessEffectFloatParameter(0.72, 0.2, 1.5);

  /** Exponential energy retention along each scatter step (`0.75..0.99`, Low mode). */
  decay = new PostProcessEffectFloatParameter(0.93, 0.75, 0.99);

  /** Depth threshold separating unoccluded sky gaps from foreground geometry (`0.9..0.99998`, Low mode). */
  skyDepthThreshold = new PostProcessEffectFloatParameter(0.9997, 0.9, 0.99998);

  /** Soft highlight roll-off preventing blown-out sky pixels (`0..1`). */
  softKnee = new PostProcessEffectFloatParameter(0.6, 0, 1);

  /** Linear RGB tint of scattered light shafts. */
  tint = new PostProcessEffectColorParameter(new Color(1.0, 0.9, 0.68, 1.0));

  /** Forward scattering anisotropy `g` for Cornette-Shanks phase function (`-0.9..0.95`, Medium/High). */
  anisotropy = new PostProcessEffectFloatParameter(0.72, -0.9, 0.95);

  /** Atmospheric extinction / scattering density coefficient (`0.001..0.25`, Medium/High). */
  extinction = new PostProcessEffectFloatParameter(0.035, 0.001, 0.25);

  /** Maximum 3D raymarching distance in world units (`5..500`, clamped to `scene.shadowDistance`, Medium/High). */
  maxDistance = new PostProcessEffectFloatParameter(80, 5, 500);

  /** Exponential altitude fog density falloff (`0` = uniform medium, Medium/High). */
  heightFalloff = new PostProcessEffectFloatParameter(0, 0, 1);

  /** Base world-space height `Y` for exponential height falloff (Medium/High). */
  baseHeight = new PostProcessEffectFloatParameter(0, -500, 500);

  /** Depth-edge sharpness for separable bilateral blur & upsample (`0.5..64`, Medium/High). */
  bilateralSharpness = new PostProcessEffectFloatParameter(12, 0.5, 64);

  /**
   * Optional light propagation direction (pointing from sun toward ground, matching `DirectLight.direction`
   * and `SunLensFlareEffect.sunDirectionOverride`). When `(0, 0, 0)`, falls back to `scene.sun`.
   */
  sunDirectionOverride = new PostProcessEffectVector3Parameter(new Vector3(0, 0, 0), false);

  /**
   * Astronomical daylight visibility gate in `[0, 1]`. Driven to `0` at night so the GPU raymarch
   * passes and depth resolve are completely skipped with zero GPU cost.
   */
  solarVisibility = new PostProcessEffectFloatParameter(1.0, 0, 1);

  /** @inheritdoc */
  override isValid(): boolean {
    return this.enabled && this.intensity.value > 0.001 && this.solarVisibility.value > 0.001;
  }

  /**
   * Resolves the projected sun UV, raymarch eligibility, and attenuated volumetric shaft strength.
   * @internal
   */
  static _resolveScreenState(
    camera: Camera,
    scene: Scene,
    effect: VolumetricLightEffect,
    out: VolumetricLightScreenState
  ): VolumetricLightScreenState {
    out.visible = false;
    out.sunU = 0.5;
    out.sunV = 0.25;
    out.effectiveStrength = 0;
    out.aspectRatio = Math.max(camera.aspectRatio, 1e-4);
    out.useRaymarch = false;
    out.horizonFade = 0;
    out.dirToSunX = 0;
    out.dirToSunY = 1;
    out.dirToSunZ = 0;

    const solarVisibility = MathUtil.clamp(effect.solarVisibility.value, 0, 1);
    if (!effect.isValid() || solarVisibility <= 1e-4 || camera.isOrthographic) {
      return out;
    }

    const sunlight = scene._lightManager._sunlight ?? scene.sun;
    const dirToSun = VOLUMETRIC_LIGHT_TEMP.dirToSun;
    const overrideDir = effect.sunDirectionOverride.value;
    const overrideLenSq = overrideDir.lengthSquared();
    if (overrideLenSq > 1e-6) {
      const invLen = -1 / Math.sqrt(overrideLenSq);
      dirToSun.set(overrideDir.x * invLen, overrideDir.y * invLen, overrideDir.z * invLen);
    } else {
      if (!sunlight) {
        return out;
      }
      const reverseDir = sunlight.reverseDirection;
      const lenSq = reverseDir.lengthSquared();
      if (lenSq <= 1e-6) {
        return out;
      }
      const invLen = 1 / Math.sqrt(lenSq);
      dirToSun.set(reverseDir.x * invLen, reverseDir.y * invLen, reverseDir.z * invLen);
    }

    const horizonFade = smoothstep(-0.04, 0.12, dirToSun.y);
    if (horizonFade <= 1e-4) {
      return out;
    }

    out.horizonFade = horizonFade;
    out.dirToSunX = dirToSun.x;
    out.dirToSunY = dirToSun.y;
    out.dirToSunZ = dirToSun.z;

    const canRaymarch =
      effect.quality.value !== VolumetricLightQuality.Low &&
      Boolean(
        scene.castShadows &&
          scene.shadowDistance > 0.01 &&
          sunlight &&
          sunlight.shadowType !== ShadowType.None &&
          sunlight.shadowStrength > 0
      );

    const viewDir = VOLUMETRIC_LIGHT_TEMP.viewDir;
    Vector3.transformNormal(dirToSun, camera.viewMatrix, viewDir);
    const vx = viewDir.x;
    const vy = viewDir.y;
    const vz = viewDir.z;
    const forwardDot = -vz;

    const p = camera.projectionMatrix.elements;
    const safeW = 0.5 * (forwardDot + Math.sqrt(forwardDot * forwardDot + 0.08));
    const rawU = ((p[0] * vx) / safeW + 1) * 0.5;
    const rawV = (1 - (p[5] * vy) / safeW) * 0.5;

    const offU = rawU - 0.5;
    const offV = rawV - 0.5;
    const offLen = Math.hypot(offU, offV);
    const maxEmitterRadius = 0.92;
    let sunU = rawU;
    let sunV = rawV;
    if (offLen > maxEmitterRadius) {
      const scale = maxEmitterRadius / offLen;
      sunU = 0.5 + offU * scale;
      sunV = 0.5 + offV * scale;
    }

    if (canRaymarch) {
      // 3D Shadow-Map Raymarching works across full 360-degree camera angles (including backlit & overhead).
      const effectiveStrength = effect.intensity.value * solarVisibility * horizonFade;
      if (effectiveStrength <= 0.001) {
        return out;
      }
      out.visible = true;
      out.useRaymarch = true;
      out.sunU = sunU;
      out.sunV = sunV;
      out.effectiveStrength = effectiveStrength;
      return out;
    }

    // 2D Low radial mode (or fallback when shadows are disabled)
    const highSunBonus = smoothstep(0.25, 0.75, dirToSun.y) * 0.42;
    const phaseVisibility = smoothstep(-0.34 - highSunBonus * 0.35, 0.42, forwardDot);
    if (phaseVisibility <= 1e-4) {
      return out;
    }

    const farAngleFade = 1 - 0.38 * smoothstep(0.85, 2.8, offLen);
    const effectiveStrength = effect.intensity.value * solarVisibility * horizonFade * phaseVisibility * farAngleFade;
    if (effectiveStrength <= 0.001) {
      return out;
    }

    out.visible = true;
    out.sunU = sunU;
    out.sunV = sunV;
    out.effectiveStrength = effectiveStrength;
    return out;
  }
}
