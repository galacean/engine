import nativeManifest from "../../native/assets/manifest.json";
import { AssetType, type Engine } from "@galacean/engine-core";

/** Farming-owned prop resources. Virtual paths keep Prefab refs independent of build URLs. */
const nativeUrls = import.meta.glob<string>("../../native/assets/**/*.{mesh,mat,ani,prefab}", {
  eager: true,
  as: "url"
});
export const builtinFarmingPropFiles = [
  ...nativeManifest.map((file) => ({
    virtualPath: file.virtualPath,
    path: nativeUrls[`../../native/assets/${file.file}`],
    type: file.type
  })),
  {
    virtualPath: "Farming/Props/Sowing/seed-sack.prefab",
    path: new URL("../../assets/sowing/seed-sack.prefab", import.meta.url).href,
    type: AssetType.Prefab
  },
  ...Object.entries(import.meta.glob<string>("../../assets/prop-textures/*.ktx2", { eager: true, as: "url" })).map(
    ([path, url]) => ({
      virtualPath: `Farming/Props/prop-textures/${path.slice(path.lastIndexOf("/") + 1)}`,
      path: url,
      type: AssetType.KTX2
    })
  ),
  {
    virtualPath: "Farming/Props/Storage/cart.prefab",
    path: new URL("../../assets/storage/cart.prefab", import.meta.url).href,
    type: AssetType.Prefab
  },
  {
    virtualPath: "Farming/Props/Storage/basket.prefab",
    path: new URL("../../assets/storage/basket.prefab", import.meta.url).href,
    type: AssetType.Prefab
  },
  {
    virtualPath: "Farming/Props/Harvest/basket.prefab",
    path: new URL("../../assets/harvest/basket.prefab", import.meta.url).href,
    type: AssetType.Prefab
  },
  {
    virtualPath: "Farming/Props/Watering/watering-can.glb",
    path: new URL("../../assets/watering/watering-can.glb", import.meta.url).href,
    type: AssetType.GLTF,
    params: { sourceContentRevision: "e0c3b6ee32362b02c6f2f04af82932878f6a314fe83c743fadbff86fb38a1069" }
  },
  {
    virtualPath: "Farming/Props/Watering/watering.animCtrl",
    path: new URL("../../assets/watering/watering.animCtrl", import.meta.url).href,
    type: AssetType.AnimatorController
  },
  {
    virtualPath: "Farming/Props/Watering/watering-can.prefab",
    path: new URL("../../assets/watering/watering-can.prefab", import.meta.url).href,
    type: AssetType.Prefab
  },
  {
    virtualPath: "Farming/Props/Tilling/hoe.animCtrl",
    path: new URL("../../assets/tilling/hoe.animCtrl", import.meta.url).href,
    type: AssetType.AnimatorController
  },
  {
    virtualPath: "Farming/Props/Tilling/hoe.prefab",
    path: new URL("../../assets/tilling/hoe.prefab", import.meta.url).href,
    type: AssetType.Prefab
  },
  {
    virtualPath: "Farming/Props/Tilling/rake.animCtrl",
    path: new URL("../../assets/tilling/rake.animCtrl", import.meta.url).href,
    type: AssetType.AnimatorController
  },
  {
    virtualPath: "Farming/Props/Tilling/rake.prefab",
    path: new URL("../../assets/tilling/rake.prefab", import.meta.url).href,
    type: AssetType.Prefab
  }
] as const;

export const FARMING_PROP_ROOTS: readonly string[] = builtinFarmingPropFiles
  .filter((file) => file.type === AssetType.Prefab || file.type === AssetType.AnimatorController)
  .map((file) => file.virtualPath);

export const FARMING_WATERING_PROP = Object.freeze({
  prefabUrl: "Farming/Props/Watering/watering-can.prefab",
  state: "Watering",
  duration: 2,
  yaw: 180,
  nozzle: "WateringNozzle"
});

export const FARMING_PROP_ANIMATIONS = Object.freeze({
  watering: FARMING_WATERING_PROP,
  hoe: Object.freeze({ prefabUrl: "Farming/Props/Tilling/hoe.prefab", state: "Hoe_Till", duration: 3.6, yaw: 0 }),
  rake: Object.freeze({ prefabUrl: "Farming/Props/Tilling/rake.prefab", state: "Rake_Level", duration: 4, yaw: 0 })
});

export type FarmingPropAnimationId = keyof typeof FARMING_PROP_ANIMATIONS;

/** Register declarations on the host engine; ResourceManager owns the loaded dependencies. */
export function registerFarmingPropResources(engine: Engine): void {
  // A project may already map these paths to edited native assets. Never overwrite that mapping.
  const registered = engine.resourceManager._virtualPathResourceMap;
  engine.resourceManager.registerVirtualResources(
    builtinFarmingPropFiles.filter((file) => !registered[file.virtualPath])
  );
}
