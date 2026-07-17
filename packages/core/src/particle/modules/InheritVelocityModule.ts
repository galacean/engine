import { Rand } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleInheritVelocityMode } from "../enums/ParticleInheritVelocityMode";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/** Adds a sub-emitter parent's world velocity to newly emitted child particles. */
export class InheritVelocityModule extends ParticleGeneratorModule {
  /** Whether to capture the initial velocity or follow the current emitter velocity. */
  mode = ParticleInheritVelocityMode.Initial;

  /** Scale applied to the inherited velocity. */
  @deepClone
  curve = new ParticleCompositeCurve(0);

  /** @internal */
  @ignoreClone
  readonly _curveRand = new Rand(0, ParticleRandomSubSeeds.InheritVelocity);

  /** @internal */
  _resetRandomSeed(seed: number): void {
    this._curveRand.reset(seed, ParticleRandomSubSeeds.InheritVelocity);
  }
}
