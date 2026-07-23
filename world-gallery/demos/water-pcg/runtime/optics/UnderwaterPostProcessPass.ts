/** Fully-underwater fullscreen medium pass; half-submerged waterlines remain a P2 concern. */
import {
  Blitter,
  type Camera,
  type Engine,
  Material,
  PostProcessPass,
  PostProcessPassEvent,
  type RenderTarget,
  Shader,
  type Texture2D
} from "@galacean/engine-core";
import { Vector3 } from "@galacean/engine-math";
import type { WaterOpticalProfile } from "./WaterOpticalProfile";
import { sanitizeWaterOpticalProfileInto, type MutableResolvedWaterOpticalProfile } from "./WaterSurfaceOpticsMath";
import type { ResolvedWaterOpticalProfile } from "./WaterSurfaceOpticsTypes";

const UNDERWATER_SHADER_NAME = "AIWorld/UnderwaterPostProcess";
const ABSORPTION_PROPERTY = "material_AbsorptionCoefficient";
const SCATTERING_COLOR_PROPERTY = "material_ScatteringColor";
const SCATTERING_COEFFICIENT_PROPERTY = "material_ScatteringCoefficient";
const MAXIMUM_VIEW_DISTANCE_PROPERTY = "material_MaximumViewDistance";

export const UNDERWATER_POST_PROCESS_SHADER_SOURCE = `
Shader "${UNDERWATER_SHADER_NAME}" {
  SubShader "Default" {
    Pass "FullscreenMedium" {
      DepthState = {
        Enabled = false;
        WriteEnabled = false;
      }

      VertexShader = vert;
      FragmentShader = frag;

      mediump sampler2D renderer_BlitTexture;
      highp sampler2D camera_DepthTexture;
      vec4 camera_DepthBufferParams;
      vec4 camera_ProjectionParams;
      vec3 material_AbsorptionCoefficient;
      vec3 material_ScatteringColor;
      float material_ScatteringCoefficient;
      float material_MaximumViewDistance;

      struct Attributes {
        vec4 POSITION_UV;
      };

      struct Varyings {
        vec2 v_uv;
      };

      Varyings vert(Attributes attributes) {
        Varyings output;
        gl_Position = vec4(attributes.POSITION_UV.xy, 0.0, 1.0);
        output.v_uv = attributes.POSITION_UV.zw;
        return output;
      }

      float sRgbChannelToLinear(float value) {
        float low = value / 12.92;
        float high = pow((value + 0.055) / 1.055, 2.4);
        return value <= 0.04045 ? low : high;
      }

      vec4 sampleSceneColor(vec2 uv) {
        vec4 color = texture2D(renderer_BlitTexture, uv);
        #ifdef ENGINE_NO_SRGB
          color.rgb = vec3(
            sRgbChannelToLinear(color.r),
            sRgbChannelToLinear(color.g),
            sRgbChannelToLinear(color.b)
          );
        #endif
        return color;
      }

      float eyeDepthFromBuffer(float depth) {
        #ifdef CAMERA_ORTHOGRAPHIC
          return camera_ProjectionParams.y + (camera_ProjectionParams.z - camera_ProjectionParams.y) * depth;
        #else
          return 1.0 / (camera_DepthBufferParams.z * depth + camera_DepthBufferParams.w);
        #endif
      }

      void frag(Varyings input) {
        vec4 source = sampleSceneColor(input.v_uv);
        float rawDepth = texture2D(camera_DepthTexture, input.v_uv).r;
        float eyeDepth = eyeDepthFromBuffer(rawDepth);
        float opticalDistance = clamp(eyeDepth, 0.0, max(material_MaximumViewDistance, 0.0));
        vec3 transmittance = exp(-max(material_AbsorptionCoefficient, vec3(0.0)) * opticalDistance);
        float scatteringWeight = 1.0 - exp(-max(material_ScatteringCoefficient, 0.0) * opticalDistance);
        vec3 mediumColor = source.rgb * transmittance + material_ScatteringColor * scatteringWeight;
        gl_FragColor = vec4(mediumColor, source.a);
      }
    }
  }
}`;

export interface UnderwaterPostProcessMetrics {
  readonly executionCount: number;
  /** Number of real material uniform writes, excluding inactive profile resolution. */
  readonly opticalProfileBindCount: number;
  /** Canonical fingerprint of the current sanitized CPU profile. */
  readonly resolvedOpticalProfileFingerprint: string;
  /** Last profile fingerprint written to a real shader material. */
  readonly shaderBoundOpticalProfileFingerprint: string;
}

export interface UnderwaterPostProcessResourceMetrics {
  readonly materialAllocated: boolean;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
}

export interface UnderwaterPostProcessTarget {
  isActive: boolean;
  readonly metrics: UnderwaterPostProcessMetrics;
  setOpticalProfile(profile: WaterOpticalProfile): void;
}

function createMutableResolvedOpticalProfile(): MutableResolvedWaterOpticalProfile {
  return {
    absorptionCoefficient: [0, 0, 0],
    scatteringColor: [0, 0, 0],
    scatteringCoefficient: 0,
    maximumViewDistance: 0,
    indexOfRefraction: 1,
    fresnelF0: 0,
    maximumSurfaceOpticalDistance: 0,
    refractionStrength: 0,
    roughness: 0,
    reflectionIntensity: 0
  };
}

/** Stable, JSON-safe identity for resolved surface and underwater shader inputs. */
export function createResolvedWaterOpticalProfileFingerprint(profile: Readonly<ResolvedWaterOpticalProfile>): string {
  return JSON.stringify([
    ...profile.absorptionCoefficient,
    ...profile.scatteringColor,
    profile.scatteringCoefficient,
    profile.maximumViewDistance,
    profile.indexOfRefraction,
    profile.fresnelF0,
    profile.maximumSurfaceOpticalDistance,
    profile.refractionStrength,
    profile.roughness,
    profile.reflectionIntensity
  ]);
}

export class UnderwaterPostProcessPass extends PostProcessPass implements UnderwaterPostProcessTarget {
  private _material?: Material;
  private readonly _absorption = new Vector3();
  private readonly _scatteringColor = new Vector3();
  private readonly _resolvedProfile = createMutableResolvedOpticalProfile();
  private _sourceProfile?: WaterOpticalProfile;
  private _resolvedOpticalProfileFingerprint = "";
  private _shaderBoundOpticalProfileFingerprint = "";
  private _executionCount = 0;
  private _opticalProfileBindCount = 0;
  private _materialCreateCount = 0;
  private _materialDestroyCount = 0;

  constructor(engine: Engine) {
    super(engine);
    this.event = PostProcessPassEvent.BeforeUber;
    this.isActive = false;
  }

  override get isActive(): boolean {
    return super.isActive;
  }

  override set isActive(value: boolean) {
    super.isActive = value;
    if (!value) this._destroyMaterial();
  }

  get metrics(): UnderwaterPostProcessMetrics & UnderwaterPostProcessResourceMetrics {
    return Object.freeze({
      executionCount: this._executionCount,
      opticalProfileBindCount: this._opticalProfileBindCount,
      resolvedOpticalProfileFingerprint: this._resolvedOpticalProfileFingerprint,
      shaderBoundOpticalProfileFingerprint: this._shaderBoundOpticalProfileFingerprint,
      materialAllocated: this._material !== undefined,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount
    });
  }

  /** Original profile identity used by WaterWorld/controller reference diagnostics. */
  get sourceOpticalProfile(): WaterOpticalProfile | undefined {
    return this._sourceProfile;
  }

  /** Sanitized values consumed by the underwater shader material. */
  get resolvedOpticalProfile(): Readonly<ResolvedWaterOpticalProfile> {
    return this._resolvedProfile;
  }

  setOpticalProfile(profile: WaterOpticalProfile): void {
    this._sourceProfile = profile;
    sanitizeWaterOpticalProfileInto(profile, this._resolvedProfile);
    this._resolvedOpticalProfileFingerprint = createResolvedWaterOpticalProfileFingerprint(this._resolvedProfile);
    if (!this.isActive) return;
    this._bindOpticalProfile(this._ensureMaterial());
  }

  onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget): void {
    const material = this._ensureMaterial();
    if (this._sourceProfile) this._bindOpticalProfile(material);
    this._executionCount++;
    const viewport = destTarget === camera.renderTarget ? camera.viewport : undefined;
    Blitter.blitTexture(camera.engine, srcTexture, destTarget, 0, viewport, material);
  }

  override _onDestroy(): void {
    this._destroyMaterial();
    super._onDestroy();
  }

  private _ensureMaterial(): Material {
    const existing = this._material;
    if (existing) return existing;
    const shader = Shader.find(UNDERWATER_SHADER_NAME) ?? Shader.create(UNDERWATER_POST_PROCESS_SHADER_SOURCE);
    const material = new Material(this.engine, shader);
    this._material = material;
    this._materialCreateCount++;
    return material;
  }

  private _bindOpticalProfile(material: Material): void {
    const profile = this._resolvedProfile;
    const absorption = profile.absorptionCoefficient;
    const scatteringColor = profile.scatteringColor;
    this._absorption.set(absorption[0], absorption[1], absorption[2]);
    this._scatteringColor.set(scatteringColor[0], scatteringColor[1], scatteringColor[2]);
    const shaderData = material.shaderData;
    shaderData.setVector3(ABSORPTION_PROPERTY, this._absorption);
    shaderData.setVector3(SCATTERING_COLOR_PROPERTY, this._scatteringColor);
    shaderData.setFloat(SCATTERING_COEFFICIENT_PROPERTY, profile.scatteringCoefficient);
    shaderData.setFloat(MAXIMUM_VIEW_DISTANCE_PROPERTY, profile.maximumViewDistance);
    this._shaderBoundOpticalProfileFingerprint = this._resolvedOpticalProfileFingerprint;
    this._opticalProfileBindCount++;
  }

  private _destroyMaterial(): void {
    const material = this._material;
    if (!material) return;
    this._material = undefined;
    material.destroy();
    this._materialDestroyCount++;
  }
}
