import { Animator, AssetType, Entity, PrefabResource } from "@galacean/engine";
import {
  FARMING_PROP_ANIMATIONS,
  registerFarmingPropResources,
  type FarmingPropAnimationId
} from "./FarmingPropResources";

/** A reusable, presentation-only Prefab player. ResourceManager owns shared models/controllers. */
export class FarmingPropAnimationPlayer {
  private model?: Entity;
  private animator?: Animator;
  private generation = 0;
  private disposed = false;
  private animation: FarmingPropAnimationId = "watering";
  elapsed = 0;
  playing = false;
  loop = true;
  speed = 1;
  ready = false;

  constructor(private readonly parent: Entity) {
    registerFarmingPropResources(parent.engine);
  }

  get id(): FarmingPropAnimationId {
    return this.animation;
  }
  get duration(): number {
    return FARMING_PROP_ANIMATIONS[this.animation].duration;
  }
  get entity(): Entity | undefined {
    return this.model;
  }

  async select(id: FarmingPropAnimationId): Promise<boolean> {
    const generation = ++this.generation;
    this.animation = id;
    this.ready = this.playing = false;
    this.elapsed = 0;
    this.model?.destroy();
    this.model = undefined;
    this.animator = undefined;
    const prop = FARMING_PROP_ANIMATIONS[id];
    const resource = await this.parent.engine.resourceManager.load<PrefabResource>({
      url: prop.prefabUrl,
      type: AssetType.Prefab
    });
    if (this.disposed || generation !== this.generation) return false;
    const model = resource.instantiate();
    this.parent.addChild(model);
    this.model = model;
    const animator = model.getComponent(Animator) ?? model.getComponentsIncludeChildren(Animator, [])[0];
    const state = animator?.animatorController?.layers[0]?.stateMachine.states.find(
      (state) => state.name === prop.state
    );
    if (!animator || !state?.clip || Math.abs(state.clip.length - prop.duration) > 0.05) {
      model.destroy();
      this.model = undefined;
      throw new Error(`${id} 的 Prefab 动作缺失或时长不匹配`);
    }
    this.animator = animator;
    animator.enabled = false;
    model.isActive = true;
    model.transform.setRotation(0, prop.yaw, 0);
    this.ready = true;
    this.seek(0);
    return true;
  }

  seek(seconds: number): void {
    if (!this.ready || !Number.isFinite(seconds)) return;
    this.elapsed = Math.max(0, Math.min(this.duration, seconds));
    this.animator!.play(FARMING_PROP_ANIMATIONS[this.animation].state, 0, this.elapsed / this.duration);
    this.animator!.update(0);
  }

  play(): void {
    if (!this.ready) return;
    if (this.elapsed >= this.duration) this.seek(0);
    this.playing = true;
  }

  update(dt: number): boolean {
    if (!this.ready || !this.playing || dt <= 0 || !Number.isFinite(dt)) return false;
    const next = this.elapsed + dt * this.speed;
    if (next >= this.duration) {
      if (this.loop) {
        this.seek(next % this.duration);
        return true;
      }
      this.seek(this.duration);
      this.playing = false;
    } else {
      this.elapsed = next;
      this.animator!.update(dt * this.speed);
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.ready = this.playing = false;
    this.model?.destroy();
    this.model = undefined;
  }
}
