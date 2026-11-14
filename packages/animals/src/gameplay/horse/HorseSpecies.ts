import type { AnimalSpeciesDocument } from "../animal/AnimalSpeciesAsset";
import { HORSE_PROFILE } from "./HorseProfile";
import { HORSE_BEHAVIOR } from "./HorseBehaviors";

/** Horse content preset; model URLs, rig names and presentation assets never enter the generic runtime. */
export const HORSE_SPECIES: AnimalSpeciesDocument = {
  version: 1,
  id: "horse",
  modelUrl: "https://mdn.alipayobjects.com/rms/afts/file/A*gGjGT4U0rxYAAAAAgBAAAAgAehQnAQ/horse.gltf",
  companion: {
    behavior: HORSE_BEHAVIOR,
    profile: HORSE_PROFILE,
    dissolve: {
      noiseUrl:
        "https://mdn.alipayobjects.com/oasis_be/afts/img/A*j626TaVnPIQAAAAAAAAAAAAAekp5AQ/original/damien-ramirez-cg-2.jpg",
      particleUrl:
        "https://mdn.alipayobjects.com/oasis_be/afts/img/A*tmDWT5XJwWsAAAAAAAAAAAAADkp5AQ/original/fire_1.png"
    }
  }
};
