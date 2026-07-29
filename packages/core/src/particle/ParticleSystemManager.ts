import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import type { ParticleGenerator } from "./ParticleGenerator";
import type { ParticleRenderer } from "./ParticleRenderer";
import type { BirthSubEmitterCommand } from "./modules/BirthSubEmitterCommand";
import type { DeathSubEmitterCommand } from "./modules/DeathSubEmitterCommand";

/**
 * @internal
 */
export type ParticleSubEmitterCommand = BirthSubEmitterCommand | DeathSubEmitterCommand;

/**
 * @internal
 */
export class ParticleSystemManager {
  private static readonly _emptyCommands: ReadonlyArray<ParticleSubEmitterCommand> = [];

  private _renderers: ParticleRenderer[] = [];
  private _commands = new Map<ParticleGenerator, ParticleSubEmitterCommand[]>();
  private _orderedRenderers: ParticleRenderer[] = [];
  private _birthTargets = new Set<ParticleGenerator>();
  private _rendererSet = new Set<ParticleRenderer>();
  private _adjacency = new Map<ParticleRenderer, ParticleRenderer[]>();
  private _indegree = new Map<ParticleRenderer, number>();
  private _queue: ParticleRenderer[] = [];
  private _adjacencyListPool: ParticleRenderer[][] = [];
  private _topologyDirty = true;

  add(renderer: ParticleRenderer): void {
    if (this._renderers.indexOf(renderer) < 0) {
      this._renderers.push(renderer);
      this._markTopologyDirty();
    }
  }

  remove(renderer: ParticleRenderer): void {
    const index = this._renderers.indexOf(renderer);
    if (index >= 0) {
      this._renderers.splice(index, 1);
      this._markTopologyDirty();
    }
    const generator = renderer.generator;
    const commands = this._commands.get(generator);
    if (commands) {
      this._consumeRemainingCommands(commands);
      this._commands.delete(generator);
    }
  }

  /**
   * @internal
   */
  _markTopologyDirty(): void {
    if (!this._topologyDirty) {
      this._topologyDirty = true;
      this._orderedRenderers.length = 0;
      this._birthTargets.clear();
    }
  }

  enqueue(command: ParticleSubEmitterCommand): void {
    const target = command.target;
    if (target._renderer.destroyed) {
      command.release();
      return;
    }
    let commands = this._commands.get(target);
    if (!commands) {
      commands = [];
      this._commands.set(target, commands);
    }
    commands.push(command);
  }

  update(deltaTime: number): void {
    this._commands.clear();
    if (this._topologyDirty) this._rebuildTopology();

    const ordered = this._orderedRenderers;
    const birthTargets = this._birthTargets;
    for (let i = 0; i < ordered.length; i++) {
      const renderer = ordered[i];
      const generator = renderer.generator;
      const incoming = this._commands.get(generator);
      if (incoming) {
        this._commands.delete(generator);
      }
      renderer._updateParticles(
        deltaTime,
        incoming ?? ParticleSystemManager._emptyCommands,
        birthTargets.has(generator)
      );
    }
    for (const commands of this._commands.values()) {
      this._consumeRemainingCommands(commands);
    }
    this._commands.clear();
  }

  private _consumeRemainingCommands(commands: ReadonlyArray<ParticleSubEmitterCommand>): void {
    for (let i = 0, n = commands.length; i < n; i++) {
      const command = commands[i];
      if (command.type === ParticleSubEmitterType.Birth && !command.target._renderer.destroyed) {
        command.target._consumeBirthSubEmitterCommand(command, 0);
      } else {
        command.release();
      }
    }
  }

  private _rebuildTopology(): void {
    const renderers = this._renderers;
    const ordered = this._orderedRenderers;
    const birthTargets = this._birthTargets;
    const rendererSet = this._rendererSet;
    const adjacency = this._adjacency;
    const indegree = this._indegree;
    const queue = this._queue;
    const adjacencyListPool = this._adjacencyListPool;

    ordered.length = 0;
    birthTargets.clear();
    let count = 0;
    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      if (renderer.destroyed || !renderer.enabled) continue;
      rendererSet.add(renderer);
      indegree.set(renderer, 0);
      count++;
    }

    for (let i = 0, n = renderers.length; i < n; i++) {
      const source = renderers[i];
      if (!rendererSet.has(source)) continue;
      const module = source.generator.subEmitters;
      if (!module.enabled) continue;
      const slots = module.subEmitters;
      for (let j = 0, slotCount = slots.length; j < slotCount; j++) {
        const slot = slots[j];
        const target = slot.emitter;
        if (!target || target.destroyed || !rendererSet.has(target)) continue;

        let targets = adjacency.get(source);
        if (!targets) {
          targets = adjacencyListPool.pop() ?? [];
          adjacency.set(source, targets);
        }
        if (targets.indexOf(target) < 0) {
          targets.push(target);
          indegree.set(target, indegree.get(target)! + 1);
        }
        if (slot.type === ParticleSubEmitterType.Birth) {
          birthTargets.add(target.generator);
        }
      }
    }

    for (let i = 0, n = renderers.length; i < n; i++) {
      const renderer = renderers[i];
      if (rendererSet.has(renderer) && indegree.get(renderer) === 0) queue.push(renderer);
    }

    for (let head = 0; head < queue.length; head++) {
      const source = queue[head];
      ordered.push(source);
      rendererSet.delete(source);
      const targets = adjacency.get(source);
      if (!targets) continue;
      for (let i = 0, n = targets.length; i < n; i++) {
        const target = targets[i];
        const nextDegree = indegree.get(target)! - 1;
        indegree.set(target, nextDegree);
        if (nextDegree === 0) queue.push(target);
      }
    }

    if (ordered.length !== count) {
      for (let i = 0, n = renderers.length; i < n; i++) {
        const renderer = renderers[i];
        if (rendererSet.has(renderer)) ordered.push(renderer);
      }
    }

    for (const targets of adjacency.values()) {
      targets.length = 0;
      adjacencyListPool.push(targets);
    }
    rendererSet.clear();
    adjacency.clear();
    indegree.clear();
    queue.length = 0;
    this._topologyDirty = false;
  }
}
