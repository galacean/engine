import { Engine, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "@galacean/engine";
import { HeightMapSpec } from "./ManifestLoader";

export interface HeightMapResult {
  texture: Texture2D;
  resolution: number;
  minMetres: number;
  maxMetres: number;
  /** Raw unorm [0, 1] heightmap kept for CPU-side queries (Consumer waterline, overlay thumbs). */
  heightsNorm: Float32Array;
}

/** IEEE-754 float32 → half-float (uint16 bit pattern). */
function floatToHalf(val: number): number {
  const buf = new Float32Array([val]);
  const int = new Uint32Array(buf.buffer)[0];
  const sign = (int >>> 31) & 0x1;
  const exp = (int >>> 23) & 0xff;
  const mantissa = int & 0x7fffff;
  if (exp === 255) return (sign << 15) | 0x7c00 | (mantissa ? 0x200 : 0);
  if (exp > 142) return (sign << 15) | 0x7c00;
  if (exp < 113) return sign << 15;
  return (sign << 15) | ((exp - 112) << 10) | (mantissa >> 13);
}

/**
 * Load a heightmap from disk into a WebGL2 R16F texture. Values stored are **real metres**, not
 * normalized [0,1] — the shader reads `.r` and gets elevation directly. The manifest `[minMetres,
 * maxMetres]` fields carry the semantic range so raw uint16 payloads (which are unitless) can be
 * decoded to metres at load time; downstream code (culling, LOD) still reads them from the region spec.
 *
 * Format dispatch:
 *   - `r16-unorm-le`: raw Uint16 little-endian, sample_n / 65535 = fraction, then lerp(min, max).
 *   - `png16`: (S1+ once real DEM lands) 16-bit grayscale PNG decoded via Canvas; same fraction lerp.
 */
export async function loadHeightMap(engine: Engine, spec: HeightMapSpec, urlAbs: string): Promise<HeightMapResult> {
  if (spec.format !== "r16-unorm-le") {
    throw new Error(`[HeightMapLoader] unsupported format "${spec.format}" (only r16-unorm-le for now)`);
  }
  const buf = await fetch(urlAbs).then((r) => {
    if (!r.ok) throw new Error(`[HeightMapLoader] fetch ${urlAbs} → ${r.status}`);
    return r.arrayBuffer();
  });
  const u16 = new Uint16Array(buf);
  if (u16.length !== spec.width * spec.height) {
    throw new Error(`[HeightMapLoader] size mismatch: ${u16.length} samples vs manifest ${spec.width}×${spec.height}`);
  }

  // Both the GPU texture (R16F) and the CPU-side copy store unorm [0, 1]. Rescale to metres
  // happens on read (shader `mix(min, max, sample.r)`, TerrainSystem._sampleMetres) so live
  // min/max slider changes propagate everywhere without re-uploading the texture or reallocating.
  const heightsNorm = new Float32Array(u16.length);
  const half = new Uint16Array(u16.length);
  for (let i = 0; i < u16.length; i++) {
    const norm = u16[i] / 65535;
    heightsNorm[i] = norm;
    half[i] = floatToHalf(norm);
  }

  const tex = new Texture2D(engine, spec.width, spec.height, TextureFormat.R16, false, false);
  tex.setPixelBuffer(half);
  tex.filterMode = TextureFilterMode.Bilinear;
  tex.wrapModeU = tex.wrapModeV = TextureWrapMode.Clamp;
  return { texture: tex, resolution: spec.width, minMetres: spec.minMetres, maxMetres: spec.maxMetres, heightsNorm };
}
