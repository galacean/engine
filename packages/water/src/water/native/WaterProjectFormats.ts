import { parseWaterData, type WaterResourceFile } from "./WaterResources";
import { WaterBodyAssetRegistry } from "../runtime/body/WaterBodyAssetRegistry";
import { createWaterQualityPlanV2 } from "../authoring/quality/WaterQualityPlan";
import { copyWaterTerrainSnapshot } from "../authoring/terrain/WaterTerrainSnapshot";

/** Water files contain pure domain data. Texture/Material references belong to native Scene/Prefab fields. */
export function validateWaterResourceFile(content: string): WaterResourceFile {
  const file = parseWaterData(content) as WaterResourceFile;
  if (file?.version !== 1) throw new RangeError("Unsupported Water resource version.");
  const registry = new WaterBodyAssetRegistry();
  switch (file.kind) {
    case "body":
      registry.registerAsset(file.data);
      break;
    case "quality":
      createWaterQualityPlanV2(file.data);
      break;
    case "terrain":
      copyWaterTerrainSnapshot(file.data);
      break;
    default:
      throw new TypeError("Unsupported Water resource kind.");
  }
  return file;
}

export const waterProjectFormats = new Map([
  [
    "WaterResource",
    {
      contentEncoding: "utf8" as const,
      referenceTypes: [] as readonly string[],
      validate(content: string | Uint8Array) {
        if (typeof content !== "string") throw new TypeError("Water assets require text content.");
        validateWaterResourceFile(content);
      },
      references: () => []
    }
  ]
]);
