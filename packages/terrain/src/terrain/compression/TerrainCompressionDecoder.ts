import { loadOfficialBrotliDecoder, type OfficialBrotliDecoder } from "./OfficialBrotliDecoder";
import {
  TerrainBrotliResultType,
  TerrainCompressionAssetType,
  type TerrainBrotliHeightmapLoaderParams,
  type TerrainBrotliLoaderParams
} from "./TerrainCompressionAssetType";
import { restoreTerrainHeightFromBrotli } from "./TerrainHeightBrotliTransform";

/** Canonical bytes produced by one configured Terrain compression pipeline. */
export interface DecodedTerrainCompressedAsset {
  /** Standard Engine asset representation selected by the Project declaration. */
  readonly resultType: (typeof TerrainBrotliResultType)[keyof typeof TerrainBrotliResultType];
  /** Canonical bytes consumed by the standard Terrain runtime or authoring importer. */
  readonly bytes: Uint8Array;
}

/**
 * Executes the complete decode pipeline selected by one Demo-private Project asset type.
 * @param assetType Compression pipeline declared by the Project resource.
 * @param params Pipeline parameters stored on that resource declaration.
 * @param encoded Complete official Brotli stream.
 * @param decoder Optional initialized decoder for callers that already own one.
 * @returns Canonical bytes and standard result type.
 * @throws If the asset type or params are invalid, or the payload cannot be restored.
 */
export async function decodeTerrainCompressedAsset(
  assetType: string,
  params: unknown,
  encoded: Uint8Array,
  decoder?: OfficialBrotliDecoder
): Promise<DecodedTerrainCompressedAsset> {
  const activeDecoder = decoder ?? (await loadOfficialBrotliDecoder());
  if (assetType === TerrainCompressionAssetType.Brotli) {
    const validatedParams = requireBrotliParams(params);
    const bytes = activeDecoder.decompress(encoded, validatedParams.decodedBytes);
    return { resultType: validatedParams.resultType, bytes };
  }
  if (assetType === TerrainCompressionAssetType.BrotliHeightmap) {
    const validatedParams = requireHeightmapParams(params);
    const prepared = activeDecoder.decompress(encoded, validatedParams.decodedBytes);
    const bytes = restoreTerrainHeightFromBrotli(validatedParams.width, validatedParams.height, prepared);
    return { resultType: TerrainBrotliResultType.Buffer, bytes };
  }
  throw new Error(`Unsupported Terrain compression asset type "${assetType}"`);
}

function requireBrotliParams(params: unknown): TerrainBrotliLoaderParams {
  const value = params as Partial<TerrainBrotliLoaderParams> | undefined;
  requirePositiveInteger(value?.decodedBytes, "Brotli decodedBytes");
  if (value?.resultType !== TerrainBrotliResultType.Buffer && value?.resultType !== TerrainBrotliResultType.JSON) {
    throw new Error("Brotli resultType must be Buffer or JSON");
  }
  return value as TerrainBrotliLoaderParams;
}

function requireHeightmapParams(params: unknown): TerrainBrotliHeightmapLoaderParams {
  const value = params as Partial<TerrainBrotliHeightmapLoaderParams> | undefined;
  requirePositiveInteger(value?.decodedBytes, "Brotli Height decodedBytes");
  requirePositiveInteger(value?.width, "Brotli Height width");
  requirePositiveInteger(value?.height, "Brotli Height height");
  return value as TerrainBrotliHeightmapLoaderParams;
}

function requirePositiveInteger(value: unknown, label: string): asserts value is number {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${label} must be a positive integer`);
}
