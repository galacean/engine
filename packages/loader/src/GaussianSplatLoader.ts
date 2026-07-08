import {
  AssetPromise,
  AssetType,
  GaussianSplat,
  GaussianSplatData,
  Loader,
  LoadItem,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";
import { GaussianSplatSpzDecoder } from "./GaussianSplatSpzDecoder";

const SH_C0 = 0.28209479177387814;
const PLY_TYPE_SIZE: Record<string, number> = {
  char: 1,
  uchar: 1,
  uint8: 1,
  int8: 1,
  short: 2,
  ushort: 2,
  int16: 2,
  uint16: 2,
  int: 4,
  uint: 4,
  int32: 4,
  uint32: 4,
  float: 4,
  float32: 4,
  double: 8,
  float64: 8
};

@resourceLoader(AssetType.GaussianSplat, ["splat", "ply", "spz"])
class GaussianSplatLoader extends Loader<GaussianSplat> {
  load(item: LoadItem, resourceManager: ResourceManager): AssetPromise<GaussianSplat> {
    const bufferPromise: Promise<ArrayBuffer> =
      // @ts-ignore
      resourceManager._request(item.url, { ...item, type: "arraybuffer" });
    return AssetPromise.resolve(bufferPromise)
      .then((buffer) => GaussianSplatLoader._toSplatData(buffer))
      .then((data) => {
        const splat = new GaussianSplat(resourceManager.engine);
        splat.setData(data);
        return splat;
      });
  }

  /** Decode any supported container (.splat / .ply / .spz) into structured splat data. */
  private static _toSplatData(buffer: ArrayBuffer): GaussianSplatData | Promise<GaussianSplatData> {
    const u8 = new Uint8Array(buffer, 0, 4);
    if (u8[0] === 0x70 && u8[1] === 0x6c && u8[2] === 0x79) {
      return GaussianSplatLoader._parsePLY(buffer); // "ply"
    }
    // SPZ — gzip (v1-3) or "NGSP" (v4) — decoded by the official reference decoder.
    if ((u8[0] === 0x1f && u8[1] === 0x8b) || (u8[0] === 0x4e && u8[1] === 0x47 && u8[2] === 0x53 && u8[3] === 0x50)) {
      return GaussianSplatSpzDecoder.decode(buffer);
    }
    return GaussianSplatLoader._splatBufferToData(buffer); // raw .splat
  }

  /** Unpack the common 32-byte-per-splat layout into structured splat data (no spherical harmonics). */
  private static _splatBufferToData(buffer: ArrayBuffer): GaussianSplatData {
    const u8 = new Uint8Array(buffer);
    const f32 = new Float32Array(buffer);
    const count = (u8.length / 32) | 0;
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const f = i * 8;
      const u = i * 32;
      // 3DGS trainer output is COLMAP-space (Y-down). Reflect Y to engine world by negating y on the
      // position and the qx/qz components of the rotation (equivalent to R := diag(1,-1,1) R diag(1,-1,1)).
      positions[i * 3 + 0] = f32[f + 0];
      positions[i * 3 + 1] = -f32[f + 1];
      positions[i * 3 + 2] = f32[f + 2];
      scales[i * 3 + 0] = f32[f + 3];
      scales[i * 3 + 1] = f32[f + 4];
      scales[i * 3 + 2] = f32[f + 5];
      rotations[i * 4 + 0] = -(u8[u + 29] - 127.5) / 127.5;
      rotations[i * 4 + 1] = (u8[u + 30] - 127.5) / 127.5;
      rotations[i * 4 + 2] = -(u8[u + 31] - 127.5) / 127.5;
      rotations[i * 4 + 3] = (u8[u + 28] - 127.5) / 127.5;
      opacities[i] = u8[u + 27] / 255;
      // sRGB base color byte -> DC spherical-harmonic coefficient.
      colors[i * 3 + 0] = (u8[u + 24] / 255 - 0.5) / SH_C0;
      colors[i * 3 + 1] = (u8[u + 25] / 255 - 0.5) / SH_C0;
      colors[i * 3 + 2] = (u8[u + 26] / 255 - 0.5) / SH_C0;
    }
    return { count, shDegree: 0, positions, scales, rotations, opacities, colors, sh: new Float32Array(0) };
  }

  /**
   * Parse a binary 3DGS `.ply` (Inria training output) into structured splat data, applying the stored
   * activations (scale = exp, opacity = sigmoid) and reading the `f_rest_*` higher-order SH bands when present.
   */
  private static _parsePLY(buffer: ArrayBuffer): GaussianSplatData {
    const headerText = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024 * 10)));
    const marker = "end_header\n";
    const headerEnd = headerText.indexOf(marker);
    if (headerEnd < 0) {
      throw new Error("GaussianSplatLoader: invalid PLY, missing end_header.");
    }

    let count = 0;
    let inVertex = false;
    let stride = 0;
    let restCount = 0;
    const offsets: Record<string, number> = {};
    for (const line of headerText.substring(0, headerEnd).split("\n")) {
      if (line.startsWith("element ")) {
        const tokens = line.split(/\s+/);
        inVertex = tokens[1] === "vertex";
        if (inVertex) {
          count = parseInt(tokens[2]);
        }
      } else if (inVertex && line.startsWith("property ")) {
        const [, type, name] = line.split(/\s+/);
        offsets[name] = stride;
        stride += PLY_TYPE_SIZE[type] ?? 0;
        if (name.startsWith("f_rest_")) restCount++;
      }
    }

    const view = new DataView(buffer, headerEnd + marker.length);
    const get = (row: number, name: string): number => view.getFloat32(row * stride + offsets[name], true);

    const restCoeffs = (restCount / 3) | 0; // vec3 SH coefficients beyond DC
    const shDegree = Math.round(Math.sqrt(restCoeffs + 1)) - 1;

    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count * 3);
    const rotations = new Float32Array(count * 4);
    const opacities = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const sh = new Float32Array(count * restCoeffs * 3);

    for (let i = 0; i < count; i++) {
      // 3DGS trainer output is COLMAP-space (Y-down). Reflect Y to engine world by negating y on the
      // position and the qx/qz components of the rotation (equivalent to R := diag(1,-1,1) R diag(1,-1,1)).
      // Higher-order SH bands are left as-is; PLY splats with SH will show a slight per-view color error
      // until the Y-flip is composed with a Wigner-D rotation of the coefficients.
      positions[i * 3 + 0] = get(i, "x");
      positions[i * 3 + 1] = -get(i, "y");
      positions[i * 3 + 2] = get(i, "z");
      scales[i * 3 + 0] = Math.exp(get(i, "scale_0"));
      scales[i * 3 + 1] = Math.exp(get(i, "scale_1"));
      scales[i * 3 + 2] = Math.exp(get(i, "scale_2"));
      colors[i * 3 + 0] = get(i, "f_dc_0");
      colors[i * 3 + 1] = get(i, "f_dc_1");
      colors[i * 3 + 2] = get(i, "f_dc_2");
      opacities[i] = 1 / (1 + Math.exp(-get(i, "opacity")));

      // PLY stores the quaternion as (w, x, y, z); reorder to the trainer (x, y, z, w) layout setData expects.
      const r0 = get(i, "rot_0");
      const r1 = get(i, "rot_1");
      const r2 = get(i, "rot_2");
      const r3 = get(i, "rot_3");
      const len = Math.hypot(r0, r1, r2, r3) || 1;
      rotations[i * 4 + 0] = -r1 / len;
      rotations[i * 4 + 1] = r2 / len;
      rotations[i * 4 + 2] = -r3 / len;
      rotations[i * 4 + 3] = r0 / len;

      // f_rest is channel-major (all R coefficients, then G, then B); transpose to coefficient-major.
      for (let k = 0; k < restCoeffs; k++) {
        sh[i * restCoeffs * 3 + k * 3 + 0] = get(i, "f_rest_" + k);
        sh[i * restCoeffs * 3 + k * 3 + 1] = get(i, "f_rest_" + (k + restCoeffs));
        sh[i * restCoeffs * 3 + k * 3 + 2] = get(i, "f_rest_" + (k + 2 * restCoeffs));
      }
    }

    return { count, shDegree, positions, scales, rotations, opacities, colors, sh };
  }
}
