import { Rand } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { BaseShape } from "./shape/BaseShape";

/**
 * Shape module of `ParticleGenerator`.
 */
export class ShapeModule extends ParticleGeneratorModule {
  /** The shape of the emitter. */
  @deepClone
  shape: BaseShape;

  /** @internal */
  @ignoreClone
  _shapeRand = new Rand(0, ParticleRandomSubSeeds.Shape);

  /**
   * @internal
   */
  _resetRandomSeed(randomSeed: number): void {
    this._shapeRand.reset(randomSeed, ParticleRandomSubSeeds.Shape);
  }
}
