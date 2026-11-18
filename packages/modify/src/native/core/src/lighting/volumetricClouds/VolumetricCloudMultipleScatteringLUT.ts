import { Engine } from "../../Engine";
import { GLCapabilityType } from "../../base";
import { Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";
import {
  createVolumetricCloudLightingProfile,
  VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE,
  type VolumetricCloudLightingProfile
} from "./VolumetricCloudLightingProfile";

/** Optical-depth samples stored in the Project Dark-style multiple-scattering LUT. */
export const VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_WIDTH = 16;
/** View/light-angle samples stored in the Project Dark-style multiple-scattering LUT. */
export const VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_HEIGHT = 8;
const HENYEY_GREENSTEIN_MINIMUM_DENOMINATOR = 0.0001;
const HENYEY_GREENSTEIN_DENOMINATOR_EXPONENT = 1.5;
const LUT_TEXEL_COUNT =
  VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_WIDTH * VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_HEIGHT;

/** Scalar LUT values before texture-format encoding, indexed by optical depth then view-light cosine. */
export function buildVolumetricCloudMultipleScatteringLUT(
  lightingProfile: Readonly<VolumetricCloudLightingProfile> = VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE
): Float32Array {
  const profile = createVolumetricCloudLightingProfile(lightingProfile);
  const values = new Float32Array(LUT_TEXEL_COUNT);
  for (let y = 0; y < VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_HEIGHT; y++) {
    const viewSunCosine = (y / (VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_HEIGHT - 1)) * 2 - 1;
    for (let x = 0; x < VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_WIDTH; x++) {
      const opticalDepth =
        (x / (VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_WIDTH - 1)) * profile.multipleScatteringMaxOpticalDepth;
      let scattering = 0;
      let energyScale = profile.singleScatteringAlbedo * profile.multipleScatteringEnergyAttenuation;
      let extinctionScale = profile.multipleScatteringExtinctionAttenuation;
      let anisotropyScale = profile.multipleScatteringAnisotropyAttenuation;
      for (let octave = 1; octave <= profile.multipleScatteringOctaves; octave++) {
        scattering +=
          energyScale *
          Math.exp(-opticalDepth * extinctionScale) *
          dualHenyeyGreenstein(viewSunCosine, anisotropyScale, profile);
        energyScale *= profile.singleScatteringAlbedo * profile.multipleScatteringEnergyAttenuation;
        extinctionScale *= profile.multipleScatteringExtinctionAttenuation;
        anisotropyScale *= profile.multipleScatteringAnisotropyAttenuation;
      }
      values[y * VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_WIDTH + x] = scattering;
    }
  }
  return values;
}

export interface VolumetricCloudMultipleScatteringTexture {
  readonly texture: Texture2D;
  /** Multiplier that restores values normalized into the RGBA8 compatibility encoding. */
  readonly decodeScale: number;
}

/** Create the tiny linear-filtered LUT used by each cloud material. */
export function createVolumetricCloudMultipleScatteringTexture(
  engine: Engine,
  lightingProfile: Readonly<VolumetricCloudLightingProfile> = VOLUMETRIC_CLOUD_DEFAULT_LIGHTING_PROFILE
): VolumetricCloudMultipleScatteringTexture {
  const rhi = engine._hardwareRenderer;
  const supportsLinearHalf =
    rhi.canIUse(GLCapabilityType.textureHalfFloat) && rhi.canIUse(GLCapabilityType.textureHalfFloatLinear);
  const values = buildVolumetricCloudMultipleScatteringLUT(lightingProfile);
  const texture = new Texture2D(
    engine,
    VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_WIDTH,
    VOLUMETRIC_CLOUD_MULTIPLE_SCATTERING_LUT_HEIGHT,
    supportsLinearHalf ? TextureFormat.R16G16B16A16 : TextureFormat.R8G8B8A8,
    false,
    false
  );
  texture.name = "volumetric_cloud_multiple_scattering_lut";
  texture.wrapModeU = texture.wrapModeV = TextureWrapMode.Clamp;
  texture.filterMode = TextureFilterMode.Bilinear;

  if (supportsLinearHalf) {
    const halfValues = new Uint16Array(LUT_TEXEL_COUNT * 4);
    for (let index = 0; index < values.length; index++) {
      halfValues[index * 4] = toHalf(values[index]);
      halfValues[index * 4 + 3] = toHalf(1);
    }
    texture.setPixelBuffer(halfValues);
    return { texture, decodeScale: 1 };
  }

  const encodedValues = new Uint8Array(LUT_TEXEL_COUNT * 4);
  const encodingScale = values.reduce((maximum, value) => Math.max(maximum, value), Number.EPSILON);
  for (let index = 0; index < values.length; index++) {
    encodedValues[index * 4] = Math.round(Math.min(1, values[index] / encodingScale) * 255);
    encodedValues[index * 4 + 3] = 255;
  }
  texture.setPixelBuffer(encodedValues);
  return { texture, decodeScale: encodingScale };
}

function dualHenyeyGreenstein(
  cosine: number,
  anisotropyScale: number,
  profile: Readonly<VolumetricCloudLightingProfile>
): number {
  return (
    henyeyGreenstein(cosine, profile.phaseForwardAnisotropy * anisotropyScale) * (1 - profile.phaseBlend) +
    henyeyGreenstein(cosine, profile.phaseBackwardAnisotropy * anisotropyScale) * profile.phaseBlend
  );
}

function henyeyGreenstein(cosine: number, anisotropy: number): number {
  const anisotropySquared = anisotropy * anisotropy;
  return (
    (1 - anisotropySquared) /
    (4 *
      Math.PI *
      Math.pow(
        Math.max(1 + anisotropySquared - 2 * anisotropy * cosine, HENYEY_GREENSTEIN_MINIMUM_DENOMINATOR),
        HENYEY_GREENSTEIN_DENOMINATOR_EXPONENT
      ))
  );
}

const halfFloat = new Float32Array(1);
const halfInteger = new Int32Array(halfFloat.buffer);

function toHalf(value: number): number {
  halfFloat[0] = value;
  const encoded = halfInteger[0];
  let bits = (encoded >> 16) & 0x8000;
  let mantissa = (encoded >> 12) & 0x07ff;
  const exponent = (encoded >> 23) & 0xff;
  if (exponent < 103) return bits;
  if (exponent > 142) {
    bits |= 0x7c00;
    bits |= (exponent === 255 ? 0 : 1) && encoded & 0x007fffff;
    return bits;
  }
  if (exponent < 113) {
    mantissa |= 0x0800;
    bits |= (mantissa >> (114 - exponent)) + ((mantissa >> (113 - exponent)) & 1);
    return bits;
  }
  bits |= ((exponent - 112) << 10) | (mantissa >> 1);
  bits += mantissa & 1;
  return bits;
}
