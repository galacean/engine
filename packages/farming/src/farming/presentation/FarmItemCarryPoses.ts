import type { FarmItemType } from "../domain/FarmItems";

type PoseVector = readonly [number, number, number];
export interface FarmItemCarryPose {
  /** Camera-local metres: +X right, +Y up, -Z in front of the player. */
  readonly position: PoseVector;
  /** Euler degrees, applied outside the imported prefab's own transform. */
  readonly rotation: PoseVector;
  /** Physical scale is calibrated once from the model; carry overrides cannot resize it. */
  readonly scale: 1;
  /** Per-item movement from the resting pose while using the item. */
  readonly useRotation: PoseVector;
}
export interface FarmItemCarryProfile {
  readonly landscape: FarmItemCarryPose;
  readonly portrait: FarmItemCarryPose;
}
export type FarmItemCarryPoseOverrides = Partial<Readonly<Record<FarmItemType, FarmItemCarryProfile>>>;

/** Each prop is calibrated separately; prefab transforms must not dictate the player's grip. */
const defaultCarryPoses: Readonly<Record<FarmItemType, FarmItemCarryProfile>> = {
  hoe: {
    landscape: { position: [0.38, -0.65, -1.65], rotation: [35, -12, -8], scale: 1, useRotation: [-12, 0, 8] },
    portrait: { position: [0.22, -0.75, -2.3], rotation: [35, -12, -8], scale: 1, useRotation: [-12, 0, 8] }
  },
  "watering-can": {
    // The imported WateringMotion is yawed +30 degrees and its nozzle points along +Z.
    // +150 here makes the nozzle point along camera -Z, away from the player.
    landscape: { position: [0.38, -0.32, -1.15], rotation: [-10, 150, -5], scale: 1, useRotation: [-25, 0, 0] },
    portrait: { position: [0.18, -0.44, -1.55], rotation: [0, 155, 0], scale: 1, useRotation: [-25, 0, 0] }
  },
  "harvest-basket": {
    landscape: { position: [-0.58, -0.5, -0.9], rotation: [0, 12, 8], scale: 1, useRotation: [0, 0, -5] },
    portrait: { position: [-0.3, -0.6, -1.5], rotation: [-5, 12, 8], scale: 1, useRotation: [0, 0, -5] }
  },
  "seed-bag": {
    landscape: { position: [-0.28, -0.2, -0.75], rotation: [65, 0, -8], scale: 1, useRotation: [-8, 0, -12] },
    portrait: { position: [-0.09, -0.34, -1.4], rotation: [65, 0, -8], scale: 1, useRotation: [-8, 0, -12] }
  }
};

// Keep the table identity used by existing presenters while Vite replaces this module.
// Changing grip parameters must not dispose the scene or regenerate the planned world.
export const FARM_ITEM_CARRY_POSES: Readonly<Record<FarmItemType, FarmItemCarryProfile>> =
  (import.meta.hot?.data.farmCarryPoses as Readonly<Record<FarmItemType, FarmItemCarryProfile>> | undefined) ??
  defaultCarryPoses;

if (import.meta.hot) {
  Object.assign(FARM_ITEM_CARRY_POSES, defaultCarryPoses);
  import.meta.hot.data.farmCarryPoses = FARM_ITEM_CARRY_POSES;
  import.meta.hot.accept();
}

export function farmItemCarryPose(
  type: FarmItemType,
  portrait: boolean,
  overrides: FarmItemCarryPoseOverrides = {}
): FarmItemCarryPose {
  const profile = overrides[type] ?? FARM_ITEM_CARRY_POSES[type];
  return portrait ? profile.portrait : profile.landscape;
}
