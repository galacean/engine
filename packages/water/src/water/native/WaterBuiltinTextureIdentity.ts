import type { WaterResourceAssetDescriptorV1 } from "../authoring/body/WaterBodyAuthoringTypes";
import conversion from "./assets/conversion.json";

/** Identity is the packaged conversion contract, never a second fetch of a loaded texture. */
export function builtinWaterTextureDescriptor(path: string): WaterResourceAssetDescriptorV1 {
  const asset = conversion.find((asset) => asset.target === path && ["Texture", "KTX2"].includes(asset.type));
  if (!asset) throw new Error(`Missing native Water texture '${path}'.`);
  return Object.freeze({
    schemaVersion: 1,
    id: `builtin-water-texture:${asset.sha256}`,
    kind: "texture",
    contentHash: asset.sha256,
    ownership: "shared",
    fallbackPolicy: "required"
  });
}
