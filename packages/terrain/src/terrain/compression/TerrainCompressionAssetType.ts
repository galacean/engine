/** Demo-private resource types that select one complete decompression pipeline. */
export const TerrainCompressionAssetType = {
  /** Official Brotli decode with no preprocessing transform. */
  Brotli: "Brotli",
  /** Official Brotli decode followed by the lossless Height R16 inverse transform. */
  BrotliHeightmap: "BrotliHeightmap"
} as const;

/** Canonical Engine asset produced by the pure Brotli loader. */
export const TerrainBrotliResultType = {
  /** Produces a standard `BufferAsset`. */
  Buffer: "Buffer",
  /** Produces a standard `JSONAsset`. */
  JSON: "JSON"
} as const;

/** Project parameters consumed by the pure Brotli loader. */
export interface TerrainBrotliLoaderParams {
  /** Exact byte count produced by the official Brotli decoder. */
  readonly decodedBytes: number;
  /** Standard Engine asset representation returned to the caller. */
  readonly resultType: (typeof TerrainBrotliResultType)[keyof typeof TerrainBrotliResultType];
}

/** Project parameters consumed by the Height R16 Brotli loader. */
export interface TerrainBrotliHeightmapLoaderParams {
  /** Exact intermediate byte count produced by the official Brotli decoder. */
  readonly decodedBytes: number;
  /** Height sample count on the local X axis. */
  readonly width: number;
  /** Height sample count on the local Z axis. */
  readonly height: number;
}
