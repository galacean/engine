/** Packed sparse override texel for four automatic terrain layers. */
export interface SurfaceOverrideRGBA8V1 {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly control: number;
}

/** Decoded normalized four-layer override and automatic/manual mix strength. */
export interface SurfaceOverrideWeightsV1 {
  readonly weights: readonly [number, number, number, number];
  readonly strength: number;
}

/**
 * Packs normalized soil, grass, rock, and snow weights into RGB plus one control byte.
 * @param weights Four non-negative layer weights.
 * @param strength Manual influence in `[0, 1]`; zero disables the override bit.
 * @returns Packed three weights and one bit-addressable control byte.
 */
export function packSurfaceOverrideRGBA8(
  weights: readonly [number, number, number, number],
  strength: number
): SurfaceOverrideRGBA8V1 {
  const normalized = normalizeWeights(weights);
  const manualStrength = clampByte(Math.round(Math.max(0, Math.min(1, strength)) * 127));
  return Object.freeze({
    red: clampByte(Math.round(normalized[0] * 255)),
    green: clampByte(Math.round(normalized[1] * 255)),
    blue: clampByte(Math.round(normalized[2] * 255)),
    control: manualStrength > 0 ? 0x80 | manualStrength : 0
  });
}

/**
 * Decodes one packed override texel.
 * @param texel Packed RGB weights and control byte.
 * @returns Normalized four-layer weights plus Auto/Manual mix strength.
 */
export function decodeSurfaceOverrideRGBA8(texel: SurfaceOverrideRGBA8V1): SurfaceOverrideWeightsV1 {
  const fourth = Math.max(0, 255 - texel.red - texel.green - texel.blue);
  return Object.freeze({
    weights: Object.freeze(normalizeWeights([texel.red, texel.green, texel.blue, fourth])),
    strength: (texel.control & 0x80) !== 0 ? (texel.control & 0x7f) / 127 : 0
  });
}

/**
 * Converts one normalized four-channel Alphamap into the sparse override representation.
 * @param alphamap Source RGBA8 texels.
 * @returns Same-size packed override texels using full manual influence.
 * @throws If the source does not contain complete RGBA texels.
 */
export function convertAlphamapToSurfaceOverride(alphamap: Uint8Array): Uint8Array {
  if (alphamap.length % 4 !== 0) throw new Error("Alphamap override source must contain complete RGBA8 texels");
  const output = new Uint8Array(alphamap.length);
  for (let offset = 0; offset < alphamap.length; offset += 4) {
    const packed = packSurfaceOverrideRGBA8(
      [alphamap[offset], alphamap[offset + 1], alphamap[offset + 2], alphamap[offset + 3]],
      1
    );
    output.set([packed.red, packed.green, packed.blue, packed.control], offset);
  }
  return output;
}

function normalizeWeights(values: readonly number[]): [number, number, number, number] {
  const safe = values.map((value) => (Number.isFinite(value) ? Math.max(0, value) : 0));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (total <= Number.EPSILON) return [1, 0, 0, 0];
  return [safe[0] / total, safe[1] / total, safe[2] / total, safe[3] / total];
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, value));
}
