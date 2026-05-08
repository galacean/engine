import { Color, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSubEmitterProperty } from "../enums/ParticleSubEmitterProperty";
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
   * @param parentStartColor - parent particle's start color (already multiplied by main.startColor)
   * @param parentStartSize - parent particle's start size
   * @param parentStartRotation - parent particle's start rotation (degrees)
   */
  _onParticleBirth(
    worldPosition: Vector3,
    parentStartColor: Color,
    parentStartSize: Vector3,
    parentStartRotation: Vector3
  ): void {
    if (!this._enabled) return;

    const slots = this.subEmitters;
    for (let i = 0, n = slots.length; i < n; i++) {
      const sub = slots[i];
      if (sub.type !== ParticleSubEmitterType.Birth) continue;
      this._fireSlot(sub, worldPosition, parentStartColor, parentStartSize, parentStartRotation);
    }
  }

  /**
   * @internal
   * Dispatch a Death event for one parent particle.
   */
  _onParticleDeath(
    worldPosition: Vector3,
    parentStartColor: Color,
    parentStartSize: Vector3,
    parentStartRotation: Vector3
  ): void {
    if (!this._enabled) return;

    const slots = this.subEmitters;
    for (let i = 0, n = slots.length; i < n; i++) {
      const sub = slots[i];
      if (sub.type !== ParticleSubEmitterType.Death) continue;
      this._fireSlot(sub, worldPosition, parentStartColor, parentStartSize, parentStartRotation);
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
    parentStartColor: Color,
    parentStartSize: Vector3,
    parentStartRotation: Vector3
  ): void {
    const target = sub.emitter;
    if (target === null || target.destroyed) return;

    if (sub.emitProbability < 1.0 && this._probabilityRand.random() > sub.emitProbability) {
      return;
    }

    const targetGen = target.generator;
    if (targetGen === this._generator) {
      // Self-reference would recurse infinitely on Birth; bail.
      return;
    }

    // Per-event emit count comes from the sub system's own EmissionModule:
    // sum the counts of bursts at time === 0; default to 1 when none.
    // (Mirrors Unity's "Sub-emitter triggers re-play sub system at t=0" semantics.)
    const bursts = targetGen.emission.bursts;
    let count = 0;
    const rand = this._probabilityRand;
    for (let i = 0, n = bursts.length; i < n; i++) {
      const burst = bursts[i];
      if (burst.time === 0) {
        count += burst.count.evaluate(undefined, rand.random()) | 0;
      }
    }
    if (count <= 0) count = 1;

    const inherit = sub.inheritProperties;
    const colorOverride = (inherit & ParticleSubEmitterProperty.Color) !== 0 ? parentStartColor : null;
    const sizeOverride = (inherit & ParticleSubEmitterProperty.Size) !== 0 ? parentStartSize : null;
    const rotationOverride = (inherit & ParticleSubEmitterProperty.Rotation) !== 0 ? parentStartRotation : null;

    targetGen._emitFromSubEmitter(count, worldPosition, colorOverride, sizeOverride, rotationOverride);
  }
}
