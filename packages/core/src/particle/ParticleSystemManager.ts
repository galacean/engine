import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import type { ParticleRenderer } from "./ParticleRenderer";

/**
 * @internal
 */
export class ParticleSystemManager {
  private readonly _renderers: ParticleRenderer[] = [];
  private readonly _orderedRenderers: ParticleRenderer[] = [];
  private _topologyDirty = true;

  add(renderer: ParticleRenderer): void {
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
    this._renderers.splice(this._renderers.indexOf(renderer), 1);
    this._markTopologyDirty();
    renderer._particleSystemManager = null;
    const commands = renderer.generator._incomingSubEmitterCommands;
    for (let i = 0, n = commands.length; i < n; i++) {
      commands[i].release();
    }
    commands.length = 0;
  }

  update(deltaTime: number): void {
    if (this._topologyDirty) {
      this._rebuildTopology();
    }

    const ordered = this._orderedRenderers;
    const rendererCount = ordered.length;
    if (rendererCount === 0) {
      return;
    }

    const frameCount = ordered[0].engine.time.frameCount;
    for (let i = 0; i < rendererCount; i++) {
      const renderer = ordered[i];
      const generator = renderer.generator;

      const canEmitToDependents = generator.isAlive || generator._incomingSubEmitterCommands.length > 0;
      const shouldSimulate =
        !renderer.isCulled || (renderer._subEmitterDependencyFrame === frameCount && canEmitToDependents);
      if (!shouldSimulate) {
        generator._resyncAfterCulling();
        continue;
      }

      const subEmitters = generator.subEmitters;
      if (canEmitToDependents && subEmitters.enabled) {
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
      generator._update(deltaTime);
    }
  }

  /**
   * @internal
   */
  _markTopologyDirty(): void {
    this._topologyDirty = true;
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
      if (!module.enabled) {
        continue;
      }
      const slots = module.subEmitters;
      for (let j = 0, slotCount = slots.length; j < slotCount; j++) {
        const slot = slots[j];
        const target = slot.emitter;
        if (!target || target._particleSystemManager !== this) {
          continue;
        }

        target._particleUpdateIndegree++;
      }
    }

    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      if (renderer._particleUpdateIndegree === 0) {
        ordered.push(renderer);
      }
    }

    for (let head = 0; head < ordered.length; head++) {
      const source = ordered[head];
      const module = source.generator.subEmitters;
      if (!module.enabled) {
        continue;
      }
      const slots = module.subEmitters;
      for (let i = 0, n = slots.length; i < n; i++) {
        const dependent = slots[i].emitter;
        if (!dependent || dependent._particleSystemManager !== this) {
          continue;
        }
        if (--dependent._particleUpdateIndegree === 0) {
          ordered.push(dependent);
        }
      }
    }

    this._topologyDirty = false;
  }
}
