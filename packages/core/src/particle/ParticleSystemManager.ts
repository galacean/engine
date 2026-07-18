import { Color, Vector3 } from "@galacean/engine-math";
import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import type { ParticleGenerator } from "./ParticleGenerator";
import type { ParticleRenderer } from "./ParticleRenderer";

/** @internal */
export interface ParticleSubEmitterEmissionCommand {
  target: ParticleGenerator;
  count: number;
  worldPosition: Vector3;
  inheritColor: Color | null;
  inheritSize: Vector3 | null;
  inheritRotation: Vector3 | null;
  eventWorldDirection: Vector3 | null;
  parentWorldVelocity: Vector3 | null;
  emissionNormalizedTime: number | null;
  frameTime: number;
}

/** @internal */
export class ParticleSystemManager {
  private _renderers: ParticleRenderer[] = [];
  private _commands = new Map<ParticleGenerator, ParticleSubEmitterEmissionCommand[]>();

  add(renderer: ParticleRenderer): void {
    if (this._renderers.indexOf(renderer) < 0) {
      this._renderers.push(renderer);
    }
  }

  remove(renderer: ParticleRenderer): void {
    const index = this._renderers.indexOf(renderer);
    if (index >= 0) this._renderers.splice(index, 1);
    this._commands.delete(renderer.generator);
  }

  enqueue(command: ParticleSubEmitterEmissionCommand): void {
    if (command.target._renderer.destroyed) return;
    let commands = this._commands.get(command.target);
    if (!commands) {
      commands = [];
      this._commands.set(command.target, commands);
    }
    commands.push(command);
  }

  update(deltaTime: number): void {
    this._commands.clear();
    const renderers = this._renderers.filter((renderer) => !renderer.destroyed && renderer.enabled);
    const count = renderers.length;
    if (count === 0) return;

    const rendererSet = new Set(renderers);
    const adjacency = new Map<ParticleRenderer, Set<ParticleRenderer>>();
    const indegree = new Map<ParticleRenderer, number>();
    const birthTargets = new Set<ParticleGenerator>();
    for (let i = 0; i < count; i++) indegree.set(renderers[i], 0);

    for (let i = 0; i < count; i++) {
      const source = renderers[i];
      const module = source.generator.subEmitters;
      if (!module.enabled) continue;
      module._validateEmitters();
      const slots = module.subEmitters;
      for (let j = 0, slotCount = slots.length; j < slotCount; j++) {
        const slot = slots[j];
        const target = slot.emitter;
        if (!target || target.destroyed || !rendererSet.has(target)) continue;

        let targets = adjacency.get(source);
        if (!targets) adjacency.set(source, (targets = new Set()));
        if (!targets.has(target)) {
          targets.add(target);
          indegree.set(target, indegree.get(target)! + 1);
        }
        if (slot.type === ParticleSubEmitterType.Birth) {
          birthTargets.add(target.generator);
        }
      }
    }

    const queue: ParticleRenderer[] = [];
    for (let i = 0; i < count; i++) {
      const renderer = renderers[i];
      if (indegree.get(renderer) === 0) queue.push(renderer);
    }

    const ordered: ParticleRenderer[] = [];
    for (let head = 0; head < queue.length; head++) {
      const source = queue[head];
      ordered.push(source);
      const targets = adjacency.get(source);
      if (!targets) continue;
      targets.forEach((target) => {
        const nextDegree = indegree.get(target)! - 1;
        indegree.set(target, nextDegree);
        if (nextDegree === 0) queue.push(target);
      });
    }

    if (ordered.length !== count) {
      for (let i = 0; i < count; i++) {
        const renderer = renderers[i];
        if (ordered.indexOf(renderer) < 0) ordered.push(renderer);
      }
    }

    for (let i = 0; i < ordered.length; i++) {
      const renderer = ordered[i];
      const generator = renderer.generator;
      const incoming = this._commands.get(generator);
      incoming && this._commands.delete(generator);
      renderer._updateParticles(deltaTime, incoming ?? [], birthTargets.has(generator));
    }
    this._commands.clear();
  }
}
