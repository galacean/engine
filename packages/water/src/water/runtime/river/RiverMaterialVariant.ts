import { createWaterMaterialVariant, type WaterMaterialVariant } from "../material/WaterMaterialVariant";
import { RIVER_LOCAL_MAP_COORDINATE_CONTRACT_VERSION, RIVER_LOCAL_MAP_SHADER_NAME } from "./constants";

export type RiverMaterialPass = "surface";

export interface RiverMaterialVariantResolution {
  readonly variant: WaterMaterialVariant;
  readonly shaderName: string;
  readonly localMap: boolean;
  readonly pass: RiverMaterialPass;
}

export function resolveRiverMaterialVariant(
  pass: RiverMaterialPass,
  localMap = false,
  appearanceVariantKey?: string
): RiverMaterialVariantResolution {
  const variant = createWaterMaterialVariant("river", {
    localMap,
    pass,
    ...(localMap ? { localMapCoordinateContract: RIVER_LOCAL_MAP_COORDINATE_CONTRACT_VERSION } : {}),
    ...(appearanceVariantKey ? { appearance: appearanceVariantKey } : {})
  });
  const baseShaderName = localMap ? RIVER_LOCAL_MAP_SHADER_NAME : "AIWorld/RiverSurface";
  const shaderName = appearanceVariantKey
    ? `${baseShaderName}AppearanceV2${appearanceVariantKey.replace(/[^A-Za-z0-9]/g, "")}`
    : baseShaderName;
  return Object.freeze({ variant, shaderName, localMap, pass });
}
