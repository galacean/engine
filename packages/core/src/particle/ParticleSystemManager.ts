import { Color, Vector3 } from "@galacean/engine-math";
import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import type { ParticleGenerator } from "./ParticleGenerator";
import type { ParticleRenderer } from "./ParticleRenderer";
import type { SubEmitter } from "./modules/SubEmitter";

/** @internal */
export interface ParticleSubEmitterEmissionCommand {
  target: ParticleGenerator;
  subEmitter: SubEmitter;
  count: number;
  worldPosition: Vector3;
  inheritColor: Color | null;
  inheritSize: Vector3 | null;
  inheritRotation: Vector3 | null;
  eventWorldDirection: Vector3 | null;
  parentWorldVelocity: Vector3 | null;
  emissionNormalizedTime: number | null;
  frameTime: number;
  emissionTime: number | null;
}

/** @internal */
export class ParticleSystemManager {
  private static readonly _emptyCommands: ReadonlyArray<ParticleSubEmitterEmissionCommand> = [];

  private _renderers: ParticleRenderer[] = [];
  private _commands = new Map<ParticleGenerator, ParticleSubEmitterEmissionCommand[]>();
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
    this._commands.delete(renderer.generator);
  }

  /** @internal */
  _markTopologyDirty(): void {
    if (!this._topologyDirty) {
      this._topologyDirty = true;
      this._orderedRenderers.length = 0;
      this._birthTargets.clear();
    }
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
    if (this._topologyDirty) this._rebuildTopology();

    const ordered = this._orderedRenderers;
    const birthTargets = this._birthTargets;
    for (let i = 0; i < ordered.length; i++) {
      const renderer = ordered[i];
      const generator = renderer.generator;
      const incoming = this._commands.get(generator);
      incoming && this._commands.delete(generator);
      renderer._updateParticles(
        deltaTime,
        incoming ?? ParticleSystemManager._emptyCommands,
        birthTargets.has(generator)
      );
    }
    this._commands.clear();
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
