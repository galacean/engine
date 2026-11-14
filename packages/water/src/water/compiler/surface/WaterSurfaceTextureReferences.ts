/** Single pure projection shared by appearance compilation and registry resource resolution. */
import {
  WaterSurfaceDetailSource,
  type WaterSurfaceAppearanceAssetV2
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type { CompiledWaterSurfaceTextureReferenceV2 } from "./CompiledWaterSurfaceAppearanceTypes";

type AppearanceTextures = Pick<WaterSurfaceAppearanceAssetV2, "detailLayers" | "caustics">;

export function collectWaterSurfaceTextureReferences(
  appearance: AppearanceTextures
): readonly CompiledWaterSurfaceTextureReferenceV2[] {
  return Object.freeze([
    ...appearance.detailLayers
      .filter((layer) => layer.source === WaterSurfaceDetailSource.NormalTexture && !!layer.textureAssetId)
      .map((layer) =>
        Object.freeze({
          layerId: layer.id,
          textureAssetId: layer.textureAssetId as string,
          textureContentHash: layer.textureContentHash as string
        })
      ),
    ...(appearance.caustics
      ? [
          Object.freeze({
            layerId: appearance.caustics.id,
            textureAssetId: appearance.caustics.textureAssetId,
            textureContentHash: appearance.caustics.textureContentHash
          })
        ]
      : [])
  ]);
}

/** Layer ids (including caustics) are unique in a validated appearance. */
export function waterSurfaceTextureReferencePath(
  appearance: AppearanceTextures,
  reference: CompiledWaterSurfaceTextureReferenceV2
): string {
  const index = appearance.detailLayers.findIndex((layer) => layer.id === reference.layerId);
  return index < 0 ? "$.appearance.caustics" : `$.appearance.detailLayers[${index}]`;
}

export function waterTextureResourceIssue(
  expectedHash: string,
  resource: Readonly<{ contentHash: string }> | undefined
): "missing" | "hash-mismatch" | undefined {
  if (!resource) return "missing";
  if (resource.contentHash.toLowerCase() !== expectedHash.toLowerCase()) return "hash-mismatch";
  return undefined;
}
