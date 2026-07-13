import { GaussianSplatData } from "@galacean/engine-core";

/**
 * Read enough of the container to expose the SPZ 16-byte header. Gzip files (v1~v3) get inflated;
 * NGSP files (v4) are read raw.
 */
async function readSpzHeader(buffer: ArrayBuffer): Promise<{ version: number; coord: number }> {
  const magic = new Uint8Array(buffer, 0, 2);
  let head: Uint8Array;
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    const stream = new Response(buffer).body!.pipeThrough(new DecompressionStream("gzip"));
    head = (await stream.getReader().read()).value!.subarray(0, 16);
  } else {
    head = new Uint8Array(buffer, 0, 16);
  }
  const dv = new DataView(head.buffer, head.byteOffset);
  return { version: dv.getUint32(4, true), coord: dv.getUint8(15) };
}

/**
 * Decodes `.spz` gaussian splats (every version, including the current ZSTD format) with the official SPZ
 * reference decoder. The decoder is an inlined-WASM ES module fetched from the CDN on first use, so it adds no
 * baseline weight and stays byte-exact with the format spec.
 */
export class GaussianSplatSpzDecoder {
  /** CDN-hosted official SPZ decoder module. */
  static decoderUrl = "https://mdn.alipayobjects.com/rms/afts/file/A*ifx0TpdqT88AAAAAc_AAAAgAehQnAQ/spz.js";

  private static _modulePromise: Promise<any> | null = null;

  static async decode(buffer: ArrayBuffer): Promise<GaussianSplatData> {
    const [module, header] = await Promise.all([(this._modulePromise ??= this._loadModule()), readSpzHeader(buffer)]);
    const cloud = module.loadSpzFromBuffer(new Uint8Array(buffer), { to: module.CoordinateSystem.UNSPECIFIED });
    // v2 = Niantic Marble/Scaniverse already RH Y-up. v3+ with explicit RH Y-up (coord=2) same.
    // Everything else assumed COLMAP RH Y-down and needs Y reflected to reach engine Y-up.
    const shouldFlipY = header.version >= 3 && header.coord !== 2;
    return GaussianSplatSpzDecoder._cloudToData(cloud, shouldFlipY);
  }

  private static _loadModule(): Promise<any> {
    return fetch(this.decoderUrl)
      .then((res) => res.text())
      .then((source) => {
        const blobUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        return import(/* @vite-ignore */ blobUrl).then((module) => {
          URL.revokeObjectURL(blobUrl);
          return module.default();
        });
      });
  }

  /** Convert the decoder's GaussianCloud (log scale, logit opacity, x,y,z,w rotation) to our common layout. */
  private static _cloudToData(cloud: any, flipY: boolean): GaussianSplatData {
    const count: number = cloud.numPoints;
    if (!count) {
      throw new Error("GaussianSplatLoader: failed to decode SPZ data.");
    }
    const scales = new Float32Array(count * 3);
    for (let i = 0, n = count * 3; i < n; i++) {
      scales[i] = Math.exp(cloud.scales[i]);
    }
    const opacities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      opacities[i] = 1 / (1 + Math.exp(-cloud.alphas[i]));
    }
    const positions = cloud.positions.slice();
    const rotations = cloud.rotations.slice();
    if (flipY) {
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 1] = -positions[i * 3 + 1];
        rotations[i * 4 + 0] = -rotations[i * 4 + 0];
        rotations[i * 4 + 2] = -rotations[i * 4 + 2];
      }
    }
    return {
      count,
      shDegree: cloud.shDegree,
      positions,
      scales,
      rotations,
      opacities,
      colors: cloud.colors.slice(),
      sh: cloud.sh.slice()
    };
  }
}
