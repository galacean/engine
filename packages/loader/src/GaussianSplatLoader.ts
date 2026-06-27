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
      return GaussianSplatLoader._splatBufferToData(GaussianSplatLoader._convertPLYToSplat(buffer)); // "ply"
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
      positions[i * 3 + 0] = f32[f + 0];
      positions[i * 3 + 1] = f32[f + 1];
      positions[i * 3 + 2] = f32[f + 2];
      scales[i * 3 + 0] = f32[f + 3];
      scales[i * 3 + 1] = f32[f + 4];
      scales[i * 3 + 2] = f32[f + 5];
      // Trainer-space quaternion (x, y, z, w); the packed bytes store w at offset 28.
      rotations[i * 4 + 0] = (u8[u + 29] - 127.5) / 127.5;
      rotations[i * 4 + 1] = (u8[u + 30] - 127.5) / 127.5;
      rotations[i * 4 + 2] = (u8[u + 31] - 127.5) / 127.5;
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
   * Convert a binary 3DGS `.ply` (Inria training output) into the 32-byte-per-splat layout, applying the
   * stored activations: scale = exp(s), opacity = sigmoid(o), color = 0.5 + C0 * f_dc, quaternion normalized.
   */
  private static _convertPLYToSplat(buffer: ArrayBuffer): ArrayBuffer {
    const headerText = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024 * 10)));
    const marker = "end_header\n";
    const headerEnd = headerText.indexOf(marker);
    if (headerEnd < 0) {
      throw new Error("GaussianSplatLoader: invalid PLY, missing end_header.");
    }

    let vertexCount = 0;
    let inVertex = false;
    let stride = 0;
    const offsets: Record<string, number> = {};
    for (const line of headerText.substring(0, headerEnd).split("\n")) {
      if (line.startsWith("element ")) {
        const tokens = line.split(/\s+/);
        inVertex = tokens[1] === "vertex";
        if (inVertex) {
          vertexCount = parseInt(tokens[2]);
        }
      } else if (inVertex && line.startsWith("property ")) {
        const [, type, name] = line.split(/\s+/);
        offsets[name] = stride;
        stride += PLY_TYPE_SIZE[type] ?? 0;
      }
    }

    const view = new DataView(buffer, headerEnd + marker.length);
    const out = new ArrayBuffer(vertexCount * 32);
    const f32 = new Float32Array(out);
    const u8 = new Uint8ClampedArray(out);
    const get = (row: number, name: string): number => view.getFloat32(row * stride + offsets[name], true);

    for (let i = 0; i < vertexCount; i++) {
      const fo = i * 8;
      const uo = i * 32;
      f32[fo + 0] = get(i, "x");
      f32[fo + 1] = get(i, "y");
      f32[fo + 2] = get(i, "z");
      f32[fo + 3] = Math.exp(get(i, "scale_0"));
      f32[fo + 4] = Math.exp(get(i, "scale_1"));
      f32[fo + 5] = Math.exp(get(i, "scale_2"));

      u8[uo + 24] = (0.5 + SH_C0 * get(i, "f_dc_0")) * 255;
      u8[uo + 25] = (0.5 + SH_C0 * get(i, "f_dc_1")) * 255;
      u8[uo + 26] = (0.5 + SH_C0 * get(i, "f_dc_2")) * 255;
      u8[uo + 27] = (1 / (1 + Math.exp(-get(i, "opacity")))) * 255;

      const r0 = get(i, "rot_0");
      const r1 = get(i, "rot_1");
      const r2 = get(i, "rot_2");
      const r3 = get(i, "rot_3");
      const len = Math.hypot(r0, r1, r2, r3) || 1;
      u8[uo + 28] = (r0 / len) * 128 + 128;
      u8[uo + 29] = (r1 / len) * 128 + 128;
      u8[uo + 30] = (r2 / len) * 128 + 128;
      u8[uo + 31] = (r3 / len) * 128 + 128;
    }

    return out;
  }
}
