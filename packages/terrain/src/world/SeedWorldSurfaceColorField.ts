import { sampleSeedWorldCenteredFbm } from "./SeedWorldFbm";

/** Fixed world edge covered exactly once by the Seed World Vista field. */
export const SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES = 3_072;
/** Mobile-oriented packed field resolution, yielding eight metres per Vista texel. */
export const SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION = 384;
/** Resolution of the authored scalar pattern used as the only colour source. */
export const SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION = 256;
/** Interleaved local-detail and whole-world Vista channels stored by each texel. */
export const SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS = 2;

const SAMPLE_COUNT = SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION ** 2;
const TEXEL_SIZE_METRES = SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES / SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION;
const VISTA_WARP_WAVELENGTH_METRES = 960;
const VISTA_WARP_AMPLITUDE_METRES = 120;
const VISTA_LOW_PASS_RADIUS_METRES = 192;
const VISTA_LOW_PASS_RADIUS_TEXELS = Math.round(VISTA_LOW_PASS_RADIUS_METRES / TEXEL_SIZE_METRES);

/**
 * Packs one authored pattern into local-detail R and whole-world Vista G.
 * R is a seed-independent resample of the source. Root Seed changes only the source-space
 * arrangement used by G, whose final values are a low-pass of that same authored pattern.
 * @param rootSeed - Unsigned Root Seed owning the generated world
 * @param templateSamples - Authored 256-square R8 colour-field source
 * @returns X-fast row-major interleaved RG8 samples
 */
export function bakeSeedWorldSurfaceColorField(rootSeed: number, templateSamples: Uint8Array): Uint8Array {
  validateRootSeed(rootSeed);
  validateTemplateSamples(templateSamples);
  const detail = resampleDetailTemplate(templateSamples);
  const expandedVista = expandVistaFromDetail(detail, rootSeed);
  const vista = triangularLowPass(expandedVista, VISTA_LOW_PASS_RADIUS_TEXELS);
  const output = new Uint8Array(SAMPLE_COUNT * SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS);
  for (let index = 0; index < SAMPLE_COUNT; index++) {
    output[index * SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS] = Math.round(detail[index]! * 255);
    output[index * SEED_WORLD_SURFACE_COLOR_FIELD_CHANNELS + 1] = Math.round(vista[index]! * 255);
  }
  return output;
}

function resampleDetailTemplate(templateSamples: Uint8Array): Float32Array {
  const detail = new Float32Array(SAMPLE_COUNT);
  for (let row = 0; row < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; row++) {
    const v = (row + 0.5) / SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION;
    for (let column = 0; column < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; column++) {
      const u = (column + 0.5) / SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION;
      detail[row * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION + column] = sampleR8TemplateMirror(templateSamples, u, v);
    }
  }
  return detail;
}

function expandVistaFromDetail(detail: Float32Array, rootSeed: number): Float32Array {
  const warpXSeed = mixSeed(rootSeed, 0x9e37_79b9);
  const warpZSeed = mixSeed(rootSeed, 0x85eb_ca6b);
  const orientation = rootSeed & 7;
  const expanded = new Float32Array(SAMPLE_COUNT);
  for (let row = 0; row < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; row++) {
    const worldZ = (row + 0.5) * TEXEL_SIZE_METRES - SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES * 0.5;
    for (let column = 0; column < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; column++) {
      const worldX = (column + 0.5) * TEXEL_SIZE_METRES - SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES * 0.5;
      const warpX =
        sampleSeedWorldCenteredFbm(
          worldX / VISTA_WARP_WAVELENGTH_METRES,
          worldZ / VISTA_WARP_WAVELENGTH_METRES,
          warpXSeed,
          2
        ) * VISTA_WARP_AMPLITUDE_METRES;
      const warpZ =
        sampleSeedWorldCenteredFbm(
          worldX / VISTA_WARP_WAVELENGTH_METRES,
          worldZ / VISTA_WARP_WAVELENGTH_METRES,
          warpZSeed,
          2
        ) * VISTA_WARP_AMPLITUDE_METRES;
      const normalizedX = (worldX + warpX) / SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES;
      const normalizedZ = (worldZ + warpZ) / SEED_WORLD_SURFACE_COLOR_FIELD_WORLD_SIZE_METRES;
      const [sourceX, sourceZ] = orientTemplateCoordinates(normalizedX, normalizedZ, orientation);
      expanded[row * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION + column] = sampleDetailMirror(
        detail,
        sourceX + 0.5,
        sourceZ + 0.5
      );
    }
  }
  return expanded;
}

function sampleR8TemplateMirror(templateSamples: Uint8Array, u: number, v: number): number {
  const x = mirrorCoordinate(u) * SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION - 0.5;
  const z = mirrorCoordinate(v) * SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION - 0.5;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const amountX = x - x0;
  const amountZ = z - z0;
  const near = mix(templateR8At(templateSamples, x0, z0), templateR8At(templateSamples, x0 + 1, z0), amountX);
  const far = mix(templateR8At(templateSamples, x0, z0 + 1), templateR8At(templateSamples, x0 + 1, z0 + 1), amountX);
  return mix(near, far, amountZ) / 255;
}

function templateR8At(templateSamples: Uint8Array, x: number, z: number): number {
  const column = Math.max(0, Math.min(SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION - 1, x));
  const row = Math.max(0, Math.min(SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION - 1, z));
  return templateSamples[row * SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION + column]!;
}

function sampleDetailMirror(detail: Float32Array, u: number, v: number): number {
  const x = mirrorCoordinate(u) * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION - 0.5;
  const z = mirrorCoordinate(v) * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION - 0.5;
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const amountX = x - x0;
  const amountZ = z - z0;
  const near = mix(detailAt(detail, x0, z0), detailAt(detail, x0 + 1, z0), amountX);
  const far = mix(detailAt(detail, x0, z0 + 1), detailAt(detail, x0 + 1, z0 + 1), amountX);
  return mix(near, far, amountZ);
}

function detailAt(detail: Float32Array, x: number, z: number): number {
  const column = Math.max(0, Math.min(SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION - 1, x));
  const row = Math.max(0, Math.min(SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION - 1, z));
  return detail[row * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION + column]!;
}

function mirrorCoordinate(value: number): number {
  const period = ((value % 2) + 2) % 2;
  return period <= 1 ? period : 2 - period;
}

function orientTemplateCoordinates(x: number, z: number, orientation: number): readonly [x: number, z: number] {
  switch (orientation) {
    case 0:
      return [x, z];
    case 1:
      return [-z, x];
    case 2:
      return [-x, -z];
    case 3:
      return [z, -x];
    case 4:
      return [-x, z];
    case 5:
      return [z, x];
    case 6:
      return [x, -z];
    default:
      return [-z, -x];
  }
}

function triangularLowPass(source: Float32Array, radius: number): Float32Array {
  const horizontal = new Float32Array(SAMPLE_COUNT);
  const output = new Float32Array(SAMPLE_COUNT);
  const weightSum = (radius + 1) ** 2;
  for (let row = 0; row < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; row++) {
    const rowOffset = row * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION;
    for (let column = 0; column < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; column++) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceColumn = Math.max(0, Math.min(SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION - 1, column + offset));
        sum += source[rowOffset + sourceColumn]! * (radius + 1 - Math.abs(offset));
      }
      horizontal[rowOffset + column] = sum / weightSum;
    }
  }
  for (let row = 0; row < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; row++) {
    for (let column = 0; column < SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION; column++) {
      let sum = 0;
      for (let offset = -radius; offset <= radius; offset++) {
        const sourceRow = Math.max(0, Math.min(SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION - 1, row + offset));
        sum +=
          horizontal[sourceRow * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION + column]! * (radius + 1 - Math.abs(offset));
      }
      output[row * SEED_WORLD_SURFACE_COLOR_FIELD_RESOLUTION + column] = sum / weightSum;
    }
  }
  return output;
}

function validateTemplateSamples(templateSamples: Uint8Array): void {
  if (
    !(templateSamples instanceof Uint8Array) ||
    templateSamples.length !== SEED_WORLD_SURFACE_COLOR_FIELD_TEMPLATE_RESOLUTION ** 2
  ) {
    throw new RangeError("Seed World surface colour field template must contain exactly 256 square R8 samples");
  }
}

function validateRootSeed(rootSeed: number): void {
  if (!Number.isInteger(rootSeed) || rootSeed < 0 || rootSeed > 0xffff_ffff) {
    throw new RangeError("Seed World surface colour field Root Seed must be an unsigned 32-bit integer");
  }
}

function mixSeed(rootSeed: number, stream: number): number {
  let value = (rootSeed ^ stream) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb_352d);
  value = Math.imul(value ^ (value >>> 15), 0x846c_a68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}
