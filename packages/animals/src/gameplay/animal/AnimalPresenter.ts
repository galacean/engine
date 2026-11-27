import type { AnimalMotion } from "./Animal";

/** Presentation consumes animal state without exposing asset bones or animation clip names. */
export interface AnimalPresenter {
  /** Apply borrowed, authoritative motion in metres and radians using simulation time. */
  update(motion: AnimalMotion, seconds: number): void;
  /** Destroy owned entities and resources, retaining borrowed assets. */
  dispose(): void;
}
