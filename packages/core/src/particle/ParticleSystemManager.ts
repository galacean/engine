import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import type { ParticleRenderer } from "./ParticleRenderer";

/**
 * @internal
 */
export class ParticleSystemManager {
  private _renderers: ParticleRenderer[] = [];
  private _orderedRenderers: ParticleRenderer[] = [];
  private _topologyDirty = true;

  add(renderer: ParticleRenderer): void {
    if (renderer._particleSystemManager) return;

    renderer._particleSystemManager = this;
    renderer._subEmitterDependencyFrame = -1;
    this._renderers.push(renderer);
    // Treat a newly enabled system as visible until the first culling result
    const engine = renderer.engine;
    const frameCount = engine.time.frameCount;
    renderer._renderFrameCount = engine._frameInProcess ? frameCount - 1 : frameCount;
    this._markTopologyDirty();
  }

  remove(renderer: ParticleRenderer): void {
    if (renderer._particleSystemManager !== this) return;

    const index = this._renderers.indexOf(renderer);
    if (index >= 0) {
      this._renderers.splice(index, 1);
      this._markTopologyDirty();
    }
    renderer._particleSystemManager = null;
    const commands = renderer.generator._incomingSubEmitterCommands;
    for (let i = 0, n = commands.length; i < n; i++) {
      commands[i].cancel();
    }
    commands.length = 0;
  }

  update(deltaTime: number): void {
    if (this._topologyDirty) this._rebuildTopology();

    const ordered = this._orderedRenderers;
    for (let i = 0, n = ordered.length; i < n; i++) {
      ordered[i].generator._suppressPendingBirthTargetEmission();
    }

    for (let i = 0; i < ordered.length; i++) {
      const renderer = ordered[i];
      const generator = renderer.generator;
      const frameCount = renderer.engine.time.frameCount;
      const incomingCommands = generator._incomingSubEmitterCommands;
      for (let j = 0, n = incomingCommands.length; j < n; j++) {
        if (incomingCommands[j].type === ParticleSubEmitterType.Birth) {
          generator.stop(false);
          break;
        }
      }

      const isSubEmitterDependency = renderer._subEmitterDependencyFrame === frameCount;
      const hasIncomingCommands = incomingCommands.length > 0;
      const shouldUpdate = isSubEmitterDependency || !renderer.isCulled || hasIncomingCommands;
      const subEmitters = generator.subEmitters;
      if (shouldUpdate && (isSubEmitterDependency || generator.isAlive || hasIncomingCommands) && subEmitters.enabled) {
        const slots = subEmitters.subEmitters;
        for (let j = 0, n = slots.length; j < n; j++) {
          const slot = slots[j];
          const target = slot.emitter;
          if (target?._particleSystemManager === this) {
            target._subEmitterDependencyFrame = frameCount;
            if (slot.type === ParticleSubEmitterType.Birth) {
              target.generator.stop(false);
            }
          }
        }
      }
      if (shouldUpdate) {
        renderer._updateParticles(deltaTime);
      } else {
        generator._processFeedbackReadbacks();
      }
    }
  }

  /**
   * @internal
   */
  _markTopologyDirty(): void {
    if (!this._topologyDirty) {
      this._topologyDirty = true;
      this._orderedRenderers.length = 0;
    }
  }

  private _rebuildTopology(): void {
    const renderers = this._renderers;
    const ordered = this._orderedRenderers;

    ordered.length = 0;
    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      renderer._particleUpdateIndegree = 0;
    }

    for (let i = 0, n = renderers.length; i < n; i++) {
      const source = renderers[i];
      const module = source.generator.subEmitters;
      if (!module.enabled) continue;
      const slots = module.subEmitters;
      for (let j = 0, slotCount = slots.length; j < slotCount; j++) {
        const slot = slots[j];
        const target = slot.emitter;
        if (!target || target._particleSystemManager !== this) continue;

        target._particleUpdateIndegree++;
      }
    }

    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      if (renderer._particleUpdateIndegree === 0) ordered.push(renderer);
    }

    for (let head = 0; head < ordered.length; head++) {
      const source = ordered[head];
      const module = source.generator.subEmitters;
      if (!module.enabled) continue;
      const slots = module.subEmitters;
      for (let i = 0, n = slots.length; i < n; i++) {
        const dependent = slots[i].emitter;
        if (!dependent || dependent._particleSystemManager !== this) continue;
        if (--dependent._particleUpdateIndegree === 0) ordered.push(dependent);
      }
    }

    if (ordered.length !== renderers.length) {
      for (let i = 0, n = renderers.length; i < n; i++) {
        const renderer = renderers[i];
        if (renderer._particleUpdateIndegree > 0) ordered.push(renderer);
      }
    }

    this._topologyDirty = false;
  }
}
