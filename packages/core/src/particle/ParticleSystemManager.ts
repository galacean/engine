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
      if (
        renderer.isCulled &&
        renderer._hasParticleSystemUpdated &&
        generator._incomingSubEmitterCommands.length === 0
      ) {
        generator._processFeedbackReadbacks();
        continue;
      }

      renderer._hasParticleSystemUpdated = true;
      renderer._updateParticles(deltaTime, renderer._isBirthSubEmitterTarget);
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
      renderer._particleSystemTargets.length = 0;
      renderer._particleSystemIndegree = 0;
      renderer._isBirthSubEmitterTarget = false;
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

        const targets = source._particleSystemTargets;
        if (targets.indexOf(target) < 0) {
          targets.push(target);
          target._particleSystemIndegree++;
        }
        if (slot.type === ParticleSubEmitterType.Birth) {
          target._isBirthSubEmitterTarget = true;
        }
      }
    }

    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      if (renderer._particleSystemIndegree === 0) ordered.push(renderer);
    }

    for (let head = 0; head < ordered.length; head++) {
      const source = ordered[head];
      const targets = source._particleSystemTargets;
      for (let i = 0, n = targets.length; i < n; i++) {
        const target = targets[i];
        if (--target._particleSystemIndegree === 0) ordered.push(target);
      }
    }

    if (ordered.length !== renderers.length) {
      for (let i = 0, n = renderers.length; i < n; i++) {
        const renderer = renderers[i];
        if (renderer._particleSystemIndegree > 0) ordered.push(renderer);
      }
    }

    this._topologyDirty = false;
  }
}
