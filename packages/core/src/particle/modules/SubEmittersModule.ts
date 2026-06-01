import { Color, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { SubEmitter } from "./SubEmitter";

/**
 * Sub Emitters module — fires additional particle systems on parent particle
 * lifecycle events (Birth / Death).
 *
 * Each slot in `subEmitters` references a target `ParticleRenderer` and
 * configures the trigger event, inherited properties, emit probability, and
 * burst count. The target renderer's own emission/lifetime/curves are
 * preserved; only `Color/Size/Rotation` (when flagged in `inheritProperties`)
 * are multiplied/added on top of the sub particle's start values, and
 * Position is implicitly the parent particle's event position.
 */
export class SubEmittersModule extends ParticleGeneratorModule {
  /** Sub emitter slots. */
  @deepClone
  readonly subEmitters: SubEmitter[] = [];

  /** @internal */
  @ignoreClone
  _probabilityRand = new Rand(0, ParticleRandomSubSeeds.SubEmitter);

  constructor(generator: ParticleGenerator) {
    super(generator);
  }

  /**
   * Add a new sub-emitter slot. Returns the created `SubEmitter` for further
   * configuration.
   */
  addSubEmitter(): SubEmitter {
    const sub = new SubEmitter();
    this.subEmitters.push(sub);
    return sub;
  }

  /**
   * @internal
   * Dispatch a Birth event for one parent particle.
   *
   * @param worldPosition - parent particle's emission position in world space
   * @param parentColor - parent particle's raw start color
   * @param parentSize - parent particle's raw start size
   * @param parentRotation - parent particle's raw start rotation (radians, vec3)
   */
  _onParticleBirth(worldPosition: Vector3, parentColor: Color, parentSize: Vector3, parentRotation: Vector3): void {
    if (!this._enabled) return;

    const slots = this.subEmitters;
    for (let i = 0, n = slots.length; i < n; i++) {
      const sub = slots[i];
      if (sub.type !== ParticleSubEmitterType.Birth) continue;
      this._fireSlot(sub, worldPosition, parentColor, parentSize, parentRotation);
    }
  }

  /**
   * @internal
   * Dispatch a Death event for one parent particle.
   */
  _onParticleDeath(worldPosition: Vector3, parentColor: Color, parentSize: Vector3, parentRotation: Vector3): void {
    if (!this._enabled) return;

    const slots = this.subEmitters;
    for (let i = 0, n = slots.length; i < n; i++) {
      const sub = slots[i];
      if (sub.type !== ParticleSubEmitterType.Death) continue;
      this._fireSlot(sub, worldPosition, parentColor, parentSize, parentRotation);
    }
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._probabilityRand.reset(seed, ParticleRandomSubSeeds.SubEmitter);
  }

  private _fireSlot(
    sub: SubEmitter,
    worldPosition: Vector3,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3
  ): void {
    // Run all non-RNG filters BEFORE the probability roll so an invalid slot
    // (null / destroyed target, self-reference, emitCount <= 0) never consumes
    // a random number. Otherwise the per-event `_probabilityRand` sequence
    // becomes sensitive to dead slots — adding a no-op slot would shift every
    // downstream probability check.
    const target = sub.emitter;
    if (target === null || target.destroyed) return;

    const targetGen = target.generator;
    if (targetGen === this._generator) {
      // Self-reference would recurse infinitely on Birth; bail.
      return;
    }

    // Per-event emit count is the slot's explicit `emitCount`. The target
    // renderer's own EmissionModule (bursts / rate / playOnEnabled) is left
    // alone so it can co-exist with sub-emit driving without double-firing
    // bursts. (Reading bursts here would duplicate any burst that the
    // target's own EmissionModule fires when it plays.)
    const count = sub.emitCount | 0;
    if (count <= 0) return;

    // Rand.random() returns the closed interval [0, 1]; using `>=` here makes
    // emitProbability = 0 mean "never fire" instead of leaking through when
    // the RNG happens to produce exactly 0.0 (probability 1 / 2^32).
    if (sub.emitProbability < 1.0 && this._probabilityRand.random() >= sub.emitProbability) {
      return;
    }

    const inherit = sub.inheritProperties;
    const colorOverride = (inherit & ParticleSubEmitterInheritProperty.Color) !== 0 ? parentColor : null;
    const sizeOverride = (inherit & ParticleSubEmitterInheritProperty.Size) !== 0 ? parentSize : null;
    const rotationOverride = (inherit & ParticleSubEmitterInheritProperty.Rotation) !== 0 ? parentRotation : null;

    targetGen._emitFromSubEmitter(count, worldPosition, colorOverride, sizeOverride, rotationOverride);
  }
}
