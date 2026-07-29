import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import type { ParticleRenderer } from "./ParticleRenderer";
import type { BirthSubEmitterCommand } from "./modules/BirthSubEmitterCommand";
import type { DeathSubEmitterCommand } from "./modules/DeathSubEmitterCommand";

/**
 * @internal
 */
export type ParticleSubEmitterCommand = BirthSubEmitterCommand | DeathSubEmitterCommand;

/**
 * Stores reusable scheduling state for one particle system.
 * @internal
 */
export class ParticleSystemNode {
  readonly commands: ParticleSubEmitterCommand[] = [];
  readonly targets: ParticleSystemNode[] = [];
  manager: ParticleSystemManager | null = null;
  indegree = 0;
  isBirthTarget = false;
  hasUpdated = false;

  constructor(readonly renderer: ParticleRenderer) {}
}

/**
 * @internal
 */
export class ParticleSystemManager {
  private _nodes: ParticleSystemNode[] = [];
  private _orderedNodes: ParticleSystemNode[] = [];
  private _topologyDirty = true;

  add(renderer: ParticleRenderer): void {
    const node = (renderer._particleSystemNode ??= new ParticleSystemNode(renderer));
    if (node.manager) return;

    node.manager = this;
    node.hasUpdated = false;
    this._nodes.push(node);
    // Treat a newly enabled system as visible until the first culling result
    renderer._renderFrameCount = renderer.engine.time.frameCount;
    this._markTopologyDirty();
  }

  remove(renderer: ParticleRenderer): void {
    const node = renderer._particleSystemNode;
    if (!node || node.manager !== this) return;

    const index = this._nodes.indexOf(node);
    if (index >= 0) {
      this._nodes.splice(index, 1);
      this._markTopologyDirty();
    }
    node.manager = null;
    const commands = node.commands;
    for (let i = 0, n = commands.length; i < n; i++) {
      this._cancelCommand(commands[i]);
    }
    commands.length = 0;
  }

  /**
   * @internal
   */
  _markTopologyDirty(): void {
    if (!this._topologyDirty) {
      this._topologyDirty = true;
      this._orderedNodes.length = 0;
    }
  }

  enqueue(command: ParticleSubEmitterCommand): void {
    const node = command.target._renderer._particleSystemNode;
    if (!node || node.manager !== this) {
      this._cancelCommand(command);
      return;
    }
    node.commands.push(command);
  }

  update(deltaTime: number): void {
    if (this._topologyDirty) this._rebuildTopology();

    const ordered = this._orderedNodes;
    for (let i = 0; i < ordered.length; i++) {
      const node = ordered[i];
      const renderer = node.renderer;
      const generator = renderer.generator;
      const commands = node.commands;
      if (renderer.isCulled && node.hasUpdated && commands.length === 0) {
        generator._processFeedbackReadbacks();
        continue;
      }

      node.hasUpdated = true;
      renderer._updateParticles(deltaTime, commands, node.isBirthTarget);
      commands.length = 0;
    }
  }

  private _cancelCommand(command: ParticleSubEmitterCommand): void {
    if (command.type === ParticleSubEmitterType.Birth && !command.target._renderer.destroyed) {
      command.target._consumeBirthSubEmitterCommand(command, 0);
    } else {
      command.release();
    }
  }

  private _rebuildTopology(): void {
    const nodes = this._nodes;
    const ordered = this._orderedNodes;

    ordered.length = 0;
    for (let i = 0, n = nodes.length; i < n; i++) {
      const node = nodes[i];
      node.targets.length = 0;
      node.indegree = 0;
      node.isBirthTarget = false;
    }

    for (let i = 0, n = nodes.length; i < n; i++) {
      const source = nodes[i];
      const module = source.renderer.generator.subEmitters;
      if (!module.enabled) continue;
      const slots = module.subEmitters;
      for (let j = 0, slotCount = slots.length; j < slotCount; j++) {
        const slot = slots[j];
        const targetRenderer = slot.emitter;
        if (!targetRenderer) continue;
        const target = targetRenderer._particleSystemNode;
        if (!target || target.manager !== this) continue;

        const targets = source.targets;
        if (targets.indexOf(target) < 0) {
          targets.push(target);
          target.indegree++;
        }
        if (slot.type === ParticleSubEmitterType.Birth) {
          target.isBirthTarget = true;
        }
      }
    }

    for (let i = 0, n = nodes.length; i < n; i++) {
      const node = nodes[i];
      if (node.indegree === 0) ordered.push(node);
    }

    for (let head = 0; head < ordered.length; head++) {
      const source = ordered[head];
      const targets = source.targets;
      for (let i = 0, n = targets.length; i < n; i++) {
        const target = targets[i];
        if (--target.indegree === 0) ordered.push(target);
      }
    }

    if (ordered.length !== nodes.length) {
      for (let i = 0, n = nodes.length; i < n; i++) {
        const node = nodes[i];
        if (node.indegree > 0) ordered.push(node);
      }
    }

    this._topologyDirty = false;
  }
}
