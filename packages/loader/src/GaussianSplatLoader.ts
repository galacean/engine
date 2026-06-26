import {
  AssetPromise,
  AssetType,
  GaussianSplat,
  Loader,
  LoadItem,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";

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
      .then((buffer) => GaussianSplatLoader._toSplatBuffer(buffer))
      .then((splatBuffer) => {
        const splat = new GaussianSplat(resourceManager.engine);
        splat.setData(splatBuffer);
        return splat;
      });
  }

  /** Normalize any supported container (.splat / .ply / .spz) to the common 32-byte-per-splat layout. */
  private static _toSplatBuffer(buffer: ArrayBuffer): ArrayBuffer | Promise<ArrayBuffer> {
    const u8 = new Uint8Array(buffer, 0, 4);
    if (u8[0] === 0x70 && u8[1] === 0x6c && u8[2] === 0x79) {
      return GaussianSplatLoader._convertPLYToSplat(buffer); // "ply"
    }
    if (u8[0] === 0x1f && u8[1] === 0x8b) {
      // gzip-wrapped SPZ (v2/v3) — decompress natively, then parse.
      return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")))
        .arrayBuffer()
        .then((spz) => GaussianSplatLoader._parseSpzToSplat(spz));
    }
    if (u8[0] === 0x4e && u8[1] === 0x47 && u8[2] === 0x53 && u8[3] === 0x50) {
      // "NGSP" = SPZ v4, ZSTD-compressed — needs a WASM decoder, not handled by the native path.
      throw new Error("GaussianSplatLoader: SPZ v4 (NGSP) requires a WASM decoder and is not supported yet.");
    }
    return buffer; // raw .splat
  }

  /**
   * Decode the gzip-decompressed SPZ payload (v2/v3) into the 32-byte layout. Spherical-harmonic bands are
   * skipped because the renderer is DC-only. Ported from BabylonJS's ParseSpz.
   */
  private static _parseSpzToSplat(data: ArrayBuffer): ArrayBuffer {
    const ubuf = new Uint8Array(data);
    const header = new Uint32Array(data.slice(0, 12));
    const splatCount = header[2];
    const version = header[1];
    const fractionalBits = ubuf[13];
    if (header[0] !== 0x5053474e || version < 2 || version > 4 || ubuf[15]) {
      throw new Error("GaussianSplatLoader: invalid SPZ data.");
    }

    const out = new ArrayBuffer(32 * splatCount);
    const f32 = new Float32Array(out);
    const u8c = new Uint8ClampedArray(out);

    const positionScale = 1 / (1 << fractionalBits);
    const i32 = new Int32Array(1);
    const i32Bytes = new Uint8Array(i32.buffer);
    const read24 = (off: number): number => {
      i32Bytes[0] = ubuf[off];
      i32Bytes[1] = ubuf[off + 1];
      i32Bytes[2] = ubuf[off + 2];
      i32Bytes[3] = ubuf[off + 2] & 0x80 ? 0xff : 0x00;
      return i32[0] * positionScale;
    };

    let o = 16;
    for (let i = 0; i < splatCount; i++) {
      f32[i * 8 + 0] = read24(o);
      f32[i * 8 + 1] = read24(o + 3);
      f32[i * 8 + 2] = read24(o + 6);
      o += 9;
    }

    // Layout at `o`: [splatCount alphas][splatCount * 3 colors]. The 0.15 factor is SPZ's DC color scale.
    for (let i = 0; i < splatCount; i++) {
      for (let c = 0; c < 3; c++) {
        const value = (ubuf[o + splatCount + i * 3 + c] - 127.5) / (0.15 * 255);
        u8c[i * 32 + 24 + c] = (0.5 + SH_C0 * value) * 255;
      }
      u8c[i * 32 + 24 + 3] = ubuf[o + i];
    }
    o += splatCount * 4;

    for (let i = 0; i < splatCount; i++) {
      f32[i * 8 + 3] = Math.exp(ubuf[o + 0] / 16 - 10);
      f32[i * 8 + 4] = Math.exp(ubuf[o + 1] / 16 - 10);
      f32[i * 8 + 5] = Math.exp(ubuf[o + 2] / 16 - 10);
      o += 3;
    }

    if (version >= 3) {
      // Smallest-three quaternion: largest component dropped (its 2-bit index in the high bits), the other
      // three stored as 10-bit signed magnitudes.
      const cmask = (1 << 9) - 1;
      const shuffle = [3, 0, 1, 2]; // xyzw -> wxyz
      for (let i = 0; i < splatCount; i++) {
        const comp = ubuf[o] + (ubuf[o + 1] << 8) + (ubuf[o + 2] << 16) + (ubuf[o + 3] << 24);
        const iLargest = comp >>> 30;
        const q = [0, 0, 0, 0];
        let remaining = comp;
        let sumSquares = 0;
        for (let k = 3; k >= 0; k--) {
          if (k !== iLargest) {
            const mag = remaining & cmask;
            const negative = (remaining >>> 9) & 0x1;
            remaining = remaining >>> 10;
            q[k] = Math.SQRT1_2 * (mag / cmask) * (negative ? -1 : 1);
            sumSquares += q[k] * q[k];
          }
        }
        q[iLargest] = Math.sqrt(Math.max(1 - sumSquares, 0));
        for (let j = 0; j < 4; j++) {
          u8c[i * 32 + 28 + j] = 127.5 + q[shuffle[j]] * 127.5;
        }
        o += 4;
      }
    } else {
      // Version 2: (x, y, z) stored as int8, w derived.
      for (let i = 0; i < splatCount; i++) {
        const x = ubuf[o];
        const y = ubuf[o + 1];
        const z = ubuf[o + 2];
        const nx = x / 127.5 - 1;
        const ny = y / 127.5 - 1;
        const nz = z / 127.5 - 1;
        u8c[i * 32 + 29] = x;
        u8c[i * 32 + 30] = y;
        u8c[i * 32 + 31] = z;
        const w = 1 - (nx * nx + ny * ny + nz * nz);
        u8c[i * 32 + 28] = 127.5 + Math.sqrt(w < 0 ? 0 : w) * 127.5;
        o += 3;
      }
    }

    return out;
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
