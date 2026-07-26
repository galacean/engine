import type { Engine } from "@galacean/engine-core";
import { OceanCoastalRockAsset } from "./OceanCoastalRockAsset";
import { OceanFoamDetailTextureLibrary } from "./OceanFoamDetailTextureLibrary";
import { OceanPbrTextureLibrary } from "./OceanPbrTextureLibrary";
import {
  settleOceanShowcaseAssetLoads,
  type OceanShowcaseAssetBundle as GenericOceanShowcaseAssetBundle
} from "./OceanShowcaseAssetLoadSettlement";

export type OceanShowcaseAssetBundle =
  GenericOceanShowcaseAssetBundle<
    OceanPbrTextureLibrary,
    OceanCoastalRockAsset,
    OceanFoamDetailTextureLibrary
  >;

export function loadOceanShowcaseAssets(
  engine: Engine,
  foamEnabled: boolean
): Promise<OceanShowcaseAssetBundle> {
  return settleOceanShowcaseAssetLoads(
    OceanPbrTextureLibrary.create(engine),
    OceanCoastalRockAsset.load(engine),
    foamEnabled
      ? OceanFoamDetailTextureLibrary.create(engine)
      : Promise.resolve(undefined)
  );
}
