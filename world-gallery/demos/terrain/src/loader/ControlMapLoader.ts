import { Engine, Texture2D, TextureFilterMode, TextureFormat, TextureWrapMode } from "@galacean/engine";
import { ControlMapSpec } from "./ManifestLoader";

export interface ControlMapResult {
  texture: Texture2D;
  resolution: number;
  /** Raw control map kept for CPU-side sampling (Consumers, debug overlay). */
  control: Uint32Array;
}

/**
 * Load a control map from disk. Storage is raw Uint32 little-endian; the shader recovers the
 * bitfield via `floatBitsToUint(texture.r)` — the payload is packed into an RGBA32F texture with
 * the uint bit pattern in the red channel, since WebGL2 sampler2D can only sample float textures
 * with linear filter. Nearest filter is mandatory (bitfield ≠ linearly interpolable).
 */
export async function loadControlMap(engine: Engine, spec: ControlMapSpec, urlAbs: string): Promise<ControlMapResult> {
  if (spec.format !== "uint32-bitfield-le") {
    throw new Error(`[ControlMapLoader] unsupported format "${spec.format}" (only uint32-bitfield-le for now)`);
  }
  const buf = await fetch(urlAbs).then((r) => {
    if (!r.ok) throw new Error(`[ControlMapLoader] fetch ${urlAbs} → ${r.status}`);
    return r.arrayBuffer();
  });
  const control = new Uint32Array(buf);
  if (control.length !== spec.width * spec.height) {
    throw new Error(`[ControlMapLoader] size mismatch: ${control.length} samples vs manifest ${spec.width}×${spec.height}`);
  }

  // Pack as R32G32B32A32 float; bit pattern preserved via aliased Uint32Array view.
  const rgba = new Float32Array(control.length * 4);
  const view = new Uint32Array(rgba.buffer);
  for (let i = 0; i < control.length; i++) view[i * 4] = control[i];

  const tex = new Texture2D(engine, spec.width, spec.height, TextureFormat.R32G32B32A32, false, false);
  tex.setPixelBuffer(rgba);
  tex.filterMode = TextureFilterMode.Point;
  tex.wrapModeU = tex.wrapModeV = TextureWrapMode.Clamp;
  return { texture: tex, resolution: spec.width, control };
}
