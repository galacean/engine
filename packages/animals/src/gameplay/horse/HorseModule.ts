import type { Entity } from "@galacean/engine";
import type { BehaviorNode } from "../behavior/BehaviorTree";
import { AnimalComponent } from "../animal/AnimalComponent";
import type { HorseHost } from "./HorseTypes";
import { HORSE_SPECIES } from "./HorseSpecies";

/** Compatibility type for existing Seed rider hosts; instances are standard AnimalComponents. */
export type HorseModule = AnimalComponent;

/** Existing factory signature retained while species behavior and capability execution belong to the animal system. */
export const HorseModule = {
  /**
   * Attach the horse preset through the generic animal component and scene-owned scheduler.
   * @param parent Host-owned parent with an identity world transform.
   * @param host World/player services retained by the host.
   * @param behavior Optional serializable companion tree override.
   * @param scale Positive instance scale relative to the calibrated horse.
   * @returns Ready animal component, initially absent.
   */
  create(
    parent: Entity,
    host: HorseHost,
    behavior: BehaviorNode = HORSE_SPECIES.companion!.behavior,
    scale = 1
  ): Promise<AnimalComponent> {
    const species = { ...HORSE_SPECIES, companion: { ...HORSE_SPECIES.companion!, behavior } };
    return AnimalComponent.create(parent, species, { mode: "companion", host, scale });
  }
};
