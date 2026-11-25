import { Color, MathUtil, Vector3 } from "@galacean/engine-math";
import type { Camera } from "../../Camera";
import type { Scene } from "../../Scene";
import { ShaderMacro, ShaderProperty } from "../../shader";
import { PostProcessEffect } from "../PostProcessEffect";
import {
  PostProcessEffectColorParameter,
  PostProcessEffectFloatParameter,
  PostProcessEffectVector3Parameter
} from "../PostProcessEffectParameter";

export interface VolumetricLightScreenState {
  visible: boolean;
  sunU: number;
  sunV: number;
  effectiveStrength: number;
  aspectRatio: number;
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
 * Screen-space volumetric light shafts (crepuscular rays) executed by the Uber pass.
 *
 * Renders a 2-pass low-resolution cascaded radial scatter buffer (`<=320px` short edge, 64-step
 * equivalent with IGN jitter) and composites directly in HDR linear space inside `PostProcessUberPass`
 * before ToneMapping with zero extra full-resolution render targets or passes.
 */
export class VolumetricLightEffect extends PostProcessEffect {
  /** @internal */
  static readonly _shaderName = "PostProcess/VolumetricLight";
  /** @internal */
  static _enableMacro: ShaderMacro = ShaderMacro.getByName("ENABLE_EFFECT_VOLUMETRIC_LIGHT");
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

  /** Overall linear intensity of the volumetric light shafts (`0..2.5`). */
  intensity = new PostProcessEffectFloatParameter(0.6, 0, 2.5);

  /** Radial ray span toward the projected sun position (`0.2..1.5`). */
  density = new PostProcessEffectFloatParameter(0.72, 0.2, 1.5);

  /** Exponential energy retention along each scatter step (`0.75..0.99`). */
  decay = new PostProcessEffectFloatParameter(0.93, 0.75, 0.99);

  /** Depth threshold separating unoccluded sky gaps from foreground geometry (`0.9..0.99998`). */
  skyDepthThreshold = new PostProcessEffectFloatParameter(0.9997, 0.9, 0.99998);

  /** Soft highlight roll-off preventing blown-out sky pixels (`0..1`). */
  softKnee = new PostProcessEffectFloatParameter(0.6, 0, 1);

  /** Linear RGB tint of scattered light shafts. */
  tint = new PostProcessEffectColorParameter(new Color(1.0, 0.9, 0.68, 1.0));

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
   * Resolves the projected sun UV and attenuated volumetric shaft strength for the active camera.
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

    const solarVisibility = MathUtil.clamp(effect.solarVisibility.value, 0, 1);
    if (!effect.isValid() || solarVisibility <= 1e-4 || camera.isOrthographic) {
      return out;
    }

    const dirToSun = VOLUMETRIC_LIGHT_TEMP.dirToSun;
    const overrideDir = effect.sunDirectionOverride.value;
    const overrideLenSq = overrideDir.lengthSquared();
    if (overrideLenSq > 1e-6) {
      const invLen = -1 / Math.sqrt(overrideLenSq);
      dirToSun.set(overrideDir.x * invLen, overrideDir.y * invLen, overrideDir.z * invLen);
    } else {
      const sunlight = scene._lightManager._sunlight ?? scene.sun;
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

    const viewDir = VOLUMETRIC_LIGHT_TEMP.viewDir;
    Vector3.transformNormal(dirToSun, camera.viewMatrix, viewDir);
    const vx = viewDir.x;
    const vy = viewDir.y;
    const vz = viewDir.z;
    const forwardDot = -vz;

    // For high afternoon sun (~50° elevation), sunlight streams diagonally down through canopy gaps
    // not only when facing the sun directly, but also across side-lit & overhead roaming angles.
    const highSunBonus = smoothstep(0.25, 0.75, dirToSun.y) * 0.42;
    const phaseVisibility = smoothstep(-0.34 - highSunBonus * 0.35, 0.42, forwardDot);
    if (phaseVisibility <= 1e-4) {
      return out;
    }

    const p = camera.projectionMatrix.elements;
    // C-infinity smooth denominator: matches exact perspective projection in front of the camera and
    // transitions seamlessly without any angle jump when roaming sideways past 90° to the sun.
    const safeW = 0.5 * (forwardDot + Math.sqrt(forwardDot * forwardDot + 0.08));
    const rawU = ((p[0] * vx) / safeW + 1) * 0.5;
    const rawV = (1 - (p[5] * vy) / safeW) * 0.5;

    // Bound off-screen sun emitter onto a virtual ring (radius <= 0.92 from screen center) while preserving
    // the exact 3D sun ray direction, so the 8x8 cascaded march never overshoots canopy gaps or drops to 0.
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
