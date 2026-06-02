import { Color, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import { ParticleRenderer } from "../ParticleRenderer";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { SubEmitter } from "./SubEmitter";

/**
 * Sub Emitters module — fires additional particle systems on parent particle
 * lifecycle events (Birth / Death). Sub particles emit at the parent
 * particle's event position; inherited properties (Color / Size / Rotation)
 * are configured per slot via `inheritProperties`.
 */
export class SubEmittersModule extends ParticleGeneratorModule {
  /** Sub emitter slots. */
  @deepClone
  readonly subEmitters: SubEmitter[] = [];

  /** @internal */
  @ignoreClone
  _probabilityRand = new Rand(0, ParticleRandomSubSeeds.SubEmitter);

  /**
   * Add a sub-emitter slot. `emitter` is required — a slot with no target fires
   * nothing. Tweak a slot's fields later via `subEmitters[index]`.
   */
  addSubEmitter(
    emitter: ParticleRenderer,
    type: ParticleSubEmitterType = ParticleSubEmitterType.Birth,
    inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None,
    emitProbability: number = 1,
    emitCount: number = 1
  ): void {
    const sub = new SubEmitter();
    sub.emitter = emitter;
    sub.type = type;
    sub.inheritProperties = inheritProperties;
    sub.emitProbability = emitProbability;
    sub.emitCount = emitCount;
    this.subEmitters.push(sub);
  }

  /**
   * Remove the sub-emitter slot at `index`.
   */
  removeSubEmitterByIndex(index: number): void {
    this.subEmitters.splice(index, 1);
  }

  /**
   * @internal
   * Fire every slot whose trigger matches `type` for one parent-particle event.
   */
  _dispatchEvent(
    type: ParticleSubEmitterType,
    worldPosition: Vector3,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3
  ): void {
    // Callers (_dispatchBirthEvent / _dispatchDeathEvent) only reach here when
    // the module is enabled, so no `_enabled` re-check is needed.
    const subEmitters = this.subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const sub = subEmitters[i];
      if (sub.type !== type) continue;
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
    // Run non-RNG filters before the probability roll — otherwise dead slots
    // shift `_probabilityRand` for downstream slots in the same event.
    const target = sub.emitter;
    if (target === null || target.destroyed) return;

    const targetGen = target.generator;
    if (targetGen === this._generator) return; // self-reference

    const count = sub.emitCount | 0;
    if (count <= 0) return;

    // `>=` not `>`: Rand.random() includes a 1/2^32 chance of exactly 0.0, so
    // emitProbability = 0 still means "never fire".
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
