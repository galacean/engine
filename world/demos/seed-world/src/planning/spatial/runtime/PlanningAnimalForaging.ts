import type { AnimalTaskProfile } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";

/**
 * Check whether a model can execute a meal with a registered eating animation.
 * @param profile Capability-filtered behavior of the selected model.
 * @returns Whether food queries may participate in its weighted autonomy.
 */
export function planningAnimalCanEat(profile: AnimalTaskProfile): boolean {
  return !!profile.skills.eat && !!profile.animationSlots.eat?.length;
}
