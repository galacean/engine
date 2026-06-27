import {
  AssetPromise,
  AssetType,
  GaussianSplat,
  Loader,
  LoadItem,
  ResourceManager,
  resourceLoader
} from "@galacean/engine-core";
import { decompress as zstdDecompress } from "fzstd";

const SH_C0 = 0.28209479177387814;
const SPZ_MAGIC = 0x5053474e; // "NGSP"
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

  /** Normalize any supported container (.splat / .ply / .spz v1-4) to the common 32-byte-per-splat layout. */
  private static _toSplatBuffer(buffer: ArrayBuffer): ArrayBuffer | Promise<ArrayBuffer> {
    const u8 = new Uint8Array(buffer, 0, 4);
    if (u8[0] === 0x70 && u8[1] === 0x6c && u8[2] === 0x79) {
      return GaussianSplatLoader._convertPLYToSplat(buffer); // "ply"
    }
    if (u8[0] === 0x1f && u8[1] === 0x8b) {
      // gzip-wrapped SPZ (v2/v3) — decompress natively, then parse.
      return new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip")))
        .arrayBuffer()
        .then((spz) => GaussianSplatLoader._parseSpzGzip(spz));
    }
    if (u8[0] === 0x4e && u8[1] === 0x47 && u8[2] === 0x53 && u8[3] === 0x50) {
      return GaussianSplatLoader._parseSpzNgsp(buffer); // "NGSP" = SPZ v4 (ZSTD)
    }
    return buffer; // raw .splat
  }

  /**
   * Parse a gzip-decompressed SPZ payload (v2/v3): a 16-byte header followed by the columnar attribute blocks
   * concatenated in one stream. Follows the SPZ spec (nianticlabs/spz).
   */
  private static _parseSpzGzip(data: ArrayBuffer): ArrayBuffer {
    const u8 = new Uint8Array(data);
    const view = new DataView(data);
    const version = view.getUint32(4, true);
    const splatCount = view.getUint32(8, true);
    const fractionalBits = u8[13];
    if (view.getUint32(0, true) !== SPZ_MAGIC || version < 2 || version > 3 || u8[15]) {
      throw new Error("GaussianSplatLoader: invalid SPZ data.");
    }
    const smallestThree = version >= 3;

    let o = 16;
    const positions = u8.subarray(o, (o += 9 * splatCount));
    const alphas = u8.subarray(o, (o += splatCount));
    const colors = u8.subarray(o, (o += 3 * splatCount));
    const scales = u8.subarray(o, (o += 3 * splatCount));
    const rotations = u8.subarray(o, (o += (smallestThree ? 4 : 3) * splatCount));
    return GaussianSplatLoader._decodeSpzColumns(
      positions,
      alphas,
      colors,
      scales,
      rotations,
      splatCount,
      fractionalBits,
      smallestThree
    );
  }

  /**
   * Parse an SPZ v4 ("NGSP") file: a 32-byte header, a TOC, and one independent ZSTD stream per attribute. The
   * per-attribute quantization is identical to v3, so the inflated columns feed the same decoder. Decoding is
   * pure-JS (fzstd) — no external WASM/CDN dependency — so a v4 file either decodes or fails with a clear error.
   */
  private static _parseSpzNgsp(buffer: ArrayBuffer): ArrayBuffer {
    const u8 = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const version = view.getUint32(4, true);
    const splatCount = view.getUint32(8, true);
    const shDegree = u8[12];
    const fractionalBits = u8[13];
    const numStreams = u8[15];
    const tocByteOffset = view.getUint32(16, true);
    // Streams (in order): positions, alphas, colors, scales, rotations, then one SH stream iff shDegree > 0. The
    // renderer is DC-only, so only the first five are inflated; the stream count is checked against shDegree so a
    // file with an unexpected layout fails loudly instead of decoding the wrong columns.
    if (version !== 4 || numStreams !== (shDegree > 0 ? 6 : 5)) {
      throw new Error(`GaussianSplatLoader: unsupported SPZ v4 data (version ${version}, ${numStreams} streams).`);
    }

    // The TOC holds each stream's (compressed, uncompressed) byte size; streams are laid out back-to-back after it.
    // Sizes are u64 but always fit in 32 bits for any real asset, so only the low word is read.
    const columns: Uint8Array[] = [];
    let streamOffset = tocByteOffset + numStreams * 16;
    for (let i = 0; i < 5; i++) {
      const compressedSize = view.getUint32(tocByteOffset + i * 16, true);
      const uncompressedSize = view.getUint32(tocByteOffset + i * 16 + 8, true);
      let column: Uint8Array;
      try {
        column = zstdDecompress(u8.subarray(streamOffset, streamOffset + compressedSize));
      } catch {
        throw new Error(`GaussianSplatLoader: SPZ v4 stream ${i} ZSTD decompression failed.`);
      }
      if (column.length !== uncompressedSize) {
        throw new Error(`GaussianSplatLoader: SPZ v4 stream ${i} size mismatch.`);
      }
      columns.push(column);
      streamOffset += compressedSize;
    }

    return GaussianSplatLoader._decodeSpzColumns(
      columns[0],
      columns[1],
      columns[2],
      columns[3],
      columns[4],
      splatCount,
      fractionalBits,
      true
    );
  }

  /**
   * Dequantize the SPZ columnar attributes into the 32-byte-per-splat layout. Spherical-harmonic bands beyond the
   * DC term are skipped because the renderer is DC-only. Shared by the gzip (v2/v3) and ZSTD (v4) paths.
   */
  private static _decodeSpzColumns(
    positions: Uint8Array,
    alphas: Uint8Array,
    colors: Uint8Array,
    scales: Uint8Array,
    rotations: Uint8Array,
    splatCount: number,
    fractionalBits: number,
    smallestThree: boolean
  ): ArrayBuffer {
    const out = new ArrayBuffer(32 * splatCount);
    const f32 = new Float32Array(out);
    const u8c = new Uint8ClampedArray(out);

    const positionScale = 1 / (1 << fractionalBits);
    const read24 = (off: number): number => {
      const v = positions[off] | (positions[off + 1] << 8) | (positions[off + 2] << 16);
      return ((v << 8) >> 8) * positionScale; // shift up then arithmetic-shift down to sign-extend the 24-bit value
    };

    for (let i = 0; i < splatCount; i++) {
      f32[i * 8 + 0] = read24(i * 9);
      f32[i * 8 + 1] = read24(i * 9 + 3);
      f32[i * 8 + 2] = read24(i * 9 + 6);
    }

    // The 0.15 factor is SPZ's DC color scale; recombine into base RGB via 0.5 + C0 * coefficient.
    for (let i = 0; i < splatCount; i++) {
      for (let c = 0; c < 3; c++) {
        const value = (colors[i * 3 + c] - 127.5) / (0.15 * 255);
        u8c[i * 32 + 24 + c] = (0.5 + SH_C0 * value) * 255;
      }
      u8c[i * 32 + 24 + 3] = alphas[i];
    }

    for (let i = 0; i < splatCount; i++) {
      f32[i * 8 + 3] = Math.exp(scales[i * 3] / 16 - 10);
      f32[i * 8 + 4] = Math.exp(scales[i * 3 + 1] / 16 - 10);
      f32[i * 8 + 5] = Math.exp(scales[i * 3 + 2] / 16 - 10);
    }

    if (smallestThree) {
      // Largest component dropped (its 2-bit index in the high bits); the other three are 10-bit signed magnitudes.
      const cmask = (1 << 9) - 1;
      const shuffle = [3, 0, 1, 2]; // xyzw -> wxyz
      const q = [0, 0, 0, 0]; // reused across splats — every slot is overwritten each iteration
      for (let i = 0; i < splatCount; i++) {
        const o = i * 4;
        const comp = rotations[o] + (rotations[o + 1] << 8) + (rotations[o + 2] << 16) + (rotations[o + 3] << 24);
        const iLargest = comp >>> 30;
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
      }
    } else {
      // Version 2: (x, y, z) stored as int8, w derived.
      for (let i = 0; i < splatCount; i++) {
        const o = i * 3;
        const x = rotations[o];
        const y = rotations[o + 1];
        const z = rotations[o + 2];
        const nx = x / 127.5 - 1;
        const ny = y / 127.5 - 1;
        const nz = z / 127.5 - 1;
        u8c[i * 32 + 29] = x;
        u8c[i * 32 + 30] = y;
        u8c[i * 32 + 31] = z;
        const w = 1 - (nx * nx + ny * ny + nz * nz);
        u8c[i * 32 + 28] = 127.5 + Math.sqrt(w < 0 ? 0 : w) * 127.5;
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
