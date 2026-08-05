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
    renderer._hasParticleSystemUpdated = false;
    renderer._isBirthSubEmitterTarget = false;
    this._renderers.push(renderer);
    // Treat a newly enabled system as visible until the first culling result
    renderer._renderFrameCount = renderer.engine.time.frameCount;
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
    for (let i = 0; i < ordered.length; i++) {
      const renderer = ordered[i];
      const generator = renderer.generator;
      const subEmitters = generator.subEmitters;
      if ((renderer._isBirthSubEmitterTarget || generator._hasActiveParticleWork()) && subEmitters.enabled) {
        const slots = subEmitters.subEmitters;
        for (let j = 0, n = slots.length; j < n; j++) {
          const slot = slots[j];
          const target = slot.emitter;
          if (
            slot.type === ParticleSubEmitterType.Birth &&
            target?._particleSystemManager === this &&
            !target._isBirthSubEmitterTarget
          ) {
            target._isBirthSubEmitterTarget = true;
            target.generator.stop(false);
          }
        }
      }
      if (
        renderer.isCulled &&
        renderer._hasParticleSystemUpdated &&
        generator._incomingSubEmitterCommands.length === 0
      ) {
        generator._processFeedbackReadbacks();
      } else {
        renderer._hasParticleSystemUpdated = true;
        renderer._updateParticles(deltaTime);
      }
      renderer._isBirthSubEmitterTarget = false;
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
