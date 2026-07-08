import { GaussianSplatData } from "@galacean/engine-core";

/**
 * Decodes `.spz` gaussian splats (every version, including the current ZSTD format) with the official SPZ
 * reference decoder. The decoder is an inlined-WASM ES module fetched from the CDN on first use, so it adds no
 * baseline weight and stays byte-exact with the format spec.
 */
export class GaussianSplatSpzDecoder {
  /** CDN-hosted official SPZ decoder module. */
  static decoderUrl = "https://mdn.alipayobjects.com/rms/afts/file/A*ifx0TpdqT88AAAAAc_AAAAgAehQnAQ/spz.js";

  private static _modulePromise: Promise<any> | null = null;

  static decode(buffer: ArrayBuffer): Promise<GaussianSplatData> {
    return (this._modulePromise ??= this._loadModule()).then((spz) => {
      const cloud = spz.loadSpzFromBuffer(new Uint8Array(buffer), { to: spz.CoordinateSystem.UNSPECIFIED });
      return GaussianSplatSpzDecoder._cloudToData(cloud);
    });
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
  private static _cloudToData(cloud: any): GaussianSplatData {
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
    // Match the other loaders: reflect Y (negate position.y and qx/qz) so every splat asset lives in
    // engine-native Y-up world regardless of the file's source axis.
    const positions = cloud.positions.slice();
    const rotations = cloud.rotations.slice();
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] = -positions[i * 3 + 1];
      rotations[i * 4 + 0] = -rotations[i * 4 + 0];
      rotations[i * 4 + 2] = -rotations[i * 4 + 2];
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
