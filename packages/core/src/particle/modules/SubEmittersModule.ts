import { Color, Rand, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../../clone/CloneDecorators";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleSubEmitterInheritProperty } from "../enums/ParticleSubEmitterInheritProperty";
import { ParticleSubEmitterType } from "../enums/ParticleSubEmitterType";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleRenderer } from "../ParticleRenderer";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";
import { SubEmitter } from "./SubEmitter";

/**
 * Fires sub-emitters on parent particle lifecycle events (Birth / Death).
 * @remarks Requires WebGL2; the module stays inactive on WebGL1.
 */
export class SubEmittersModule extends ParticleGeneratorModule {
  private static _cycleVisited = new Set<ParticleGenerator>();
  private static _cycleStack: ParticleGenerator[] = [];

  private static _wouldCreateCycle(target: ParticleRenderer, root: ParticleGenerator): boolean {
    const visited = SubEmittersModule._cycleVisited;
    const stack = SubEmittersModule._cycleStack;
    visited.clear();
    stack.length = 0;
    stack.push(target.generator);

    let found = false;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      if (cur === root) {
        found = true;
        break;
      }
      if (visited.has(cur)) continue;
      visited.add(cur);
      const slots = cur.subEmitters.subEmitters;
      for (let i = 0, n = slots.length; i < n; i++) {
        const child = slots[i].emitter?.generator;
        if (child && !visited.has(child)) stack.push(child);
      }
    }

    visited.clear();
    stack.length = 0;
    return found;
  }

  private _subEmitters: SubEmitter[] = [];

  /**
   * The configured sub-emitters.
   */
  get subEmitters(): readonly SubEmitter[] {
    return this._subEmitters;
  }

  @ignoreClone
  private _probabilityRand = new Rand(0, ParticleRandomSubSeeds.SubEmitter);

  /**
   * Add a sub-emitter slot.
   * @param emitter - Target particle renderer
   * @param type - Trigger event (`Birth` / `Death`)
   * @param inheritProperties - Bitmask of properties inherited from the parent particle
   * @param emitProbability - Per-event fire probability [0, 1]
   * @param emitCount - Number of sub particles emitted per parent event
   */
  addSubEmitter(
    emitter: ParticleRenderer,
    type: ParticleSubEmitterType,
    inheritProperties: ParticleSubEmitterInheritProperty = ParticleSubEmitterInheritProperty.None,
    emitProbability: number = 1,
    emitCount: number = 1
  ): void {
    if (SubEmittersModule._wouldCreateCycle(emitter, this._generator)) {
      throw new Error("Sub-emitter would create a cycle");
    }
    const sub = new SubEmitter();
    sub.emitter = emitter;
    sub.type = type;
    sub.inheritProperties = inheritProperties;
    sub.emitProbability = emitProbability;
    sub.emitCount = emitCount;
    sub._module = this;
    this._subEmitters.push(sub);
    this._generator._setTransformFeedback();
  }

  /**
   * Remove the sub-emitter at the given index.
   * @param index - Index of the sub-emitter to remove
   */
  removeSubEmitterByIndex(index: number): void {
    this._subEmitters.splice(index, 1);
    this._generator._setTransformFeedback();
  }

  /**
   * Remove all sub-emitter slots.
   */
  clear(): void {
    if (this._subEmitters.length === 0) {
      return;
    }
    this._subEmitters.length = 0;
    this._generator._setTransformFeedback();
  }

  override get enabled(): boolean {
    return this._enabled && this._generator._renderer.engine._hardwareRenderer.isWebGL2;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._generator._setTransformFeedback();
    }
  }

  /**
   * @internal
   */
  _dispatchEvent(
    type: ParticleSubEmitterType,
    worldPosition: Vector3,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3,
    worldDirection?: Vector3
  ): void {
    const subEmitters = this.subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      const sub = subEmitters[i];
      if (sub.type !== type) continue;

      const target = sub.emitter;
      if (target === null || target.destroyed) continue;

      const count = sub.emitCount;
      if (count <= 0) continue;

      if (sub.emitProbability < 1.0 && this._probabilityRand.random() >= sub.emitProbability) {
        continue;
      }

      const inherit = sub.inheritProperties;
      const colorOverride = (inherit & ParticleSubEmitterInheritProperty.Color) !== 0 ? parentColor : null;
      const sizeOverride = (inherit & ParticleSubEmitterInheritProperty.Size) !== 0 ? parentSize : null;
      const rotationOverride = (inherit & ParticleSubEmitterInheritProperty.Rotation) !== 0 ? parentRotation : null;
      const directionOverride = (inherit & ParticleSubEmitterInheritProperty.Velocity) !== 0 ? worldDirection : null;

      target.generator._emitFromSubEmitter(
        count,
        worldPosition,
        colorOverride,
        sizeOverride,
        rotationOverride,
        directionOverride
      );
    }
  }

  /**
   * @internal
   */
  _resetRandomSeed(seed: number): void {
    this._probabilityRand.reset(seed, ParticleRandomSubSeeds.SubEmitter);
  }

  /**
   * @internal
   */
  _hasSubEmitterOfType(type: ParticleSubEmitterType): boolean {
    if (!this.enabled) return false;
    const subEmitters = this.subEmitters;
    for (let i = 0, n = subEmitters.length; i < n; i++) {
      if (subEmitters[i].type === type) return true;
    }
    return false;
  }

  /**
   * @internal
   */
  _validateEmitter(emitter: ParticleRenderer): void {
    if (emitter && SubEmittersModule._wouldCreateCycle(emitter, this._generator)) {
      throw new Error("Sub-emitter would create a cycle");
    }
  }
}
