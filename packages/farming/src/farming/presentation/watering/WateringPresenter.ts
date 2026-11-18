import { Animator, AssetType, Entity, PrefabResource, Script, Texture2D, Vector3 } from "@galacean/engine";
import { FARMING_WATERING_PROP as prop, registerFarmingPropResources } from "../props/FarmingPropResources";
import { WATERING_CONFIG as config, waterFlightSeconds } from "./WateringConfig";
import { WateringParticles } from "./WateringParticles";

export interface WateringTarget {
  readonly id: string;
  readonly position: readonly [number, number, number];
  readonly yaw: number;
  /** Release the soil's visual transition on first impact, skip, or load failure. */
  readonly releaseSoil: () => void;
}

interface Impact {
  at: number;
  position: Vector3;
}

/** Presentation only. One reusable prop, one latest pending target, no gameplay mutations. */
export class WateringPresenter extends Script {
  /** A persistent carried instance supplies the prop in immersive hosts. */
  showProp = true;
  private model?: Entity;
  private nozzle?: Entity;
  private animator?: Animator;
  private particles?: WateringParticles;
  private active?: WateringTarget;
  private pending?: WateringTarget;
  private elapsed = 0;
  private clock = 0;
  private dropRemainder = 0;
  private nextImpact = 0;
  private impacts: Impact[] = [];
  private soilReleased = false;
  private disposed = false;
  private ready = false;
  private error: string | null = null;
  private playCount = 0;
  private emittedDrops = 0;
  private loadTask?: Promise<void>;
  private readonly direction = new Vector3();
  private readonly lookTarget = new Vector3();

  static create(parent: Entity): WateringPresenter {
    const effect = parent.createChild("Farm watering presentation").addComponent(WateringPresenter);
    effect.loadTask = effect.load();
    return effect;
  }
  async whenReady(): Promise<boolean> {
    await this.loadTask;
    return this.ready && !this.disposed && !this.error;
  }
  get workPose(): { model: Entity; elapsed: number } | null {
    return this.active && this.model ? { model: this.model, elapsed: this.elapsed } : null;
  }
  cancel(): void {
    this.active?.releaseSoil();
    this.pending?.releaseSoil();
    this.active = this.pending = undefined;
    this.impacts.length = 0;
    if (this.model) this.model.isActive = false;
  }

  request(target: WateringTarget): void {
    if (this.disposed || this.error) {
      target.releaseSoil();
      return;
    }
    // Each request owns a distinct batch hold. Replacing a pending request must
    // release its neighbors too, even when the source plot is unchanged.
    this.pending?.releaseSoil();
    this.pending = target;
    if (this.active?.id === target.id && this.soilReleased) target.releaseSoil();
    if (this.ready && !this.active) this.startNext();
  }

  get diagnostics() {
    const nozzlePosition = this.nozzle?.transform.worldPosition;
    return {
      ready: this.ready,
      error: this.error,
      activePlotId: this.active?.id ?? null,
      pendingPlotId: this.pending?.id ?? null,
      elapsed: this.elapsed,
      emitting: Boolean(this.active && this.elapsed >= config.waterOn && this.elapsed < config.waterOff),
      particlesAlive: this.particles?.alive ?? false,
      playCount: this.playCount,
      emittedDrops: this.emittedDrops,
      nozzlePosition: nozzlePosition ? [nozzlePosition.x, nozzlePosition.y, nozzlePosition.z] : null,
      impactQueueLength: this.impacts.length
    };
  }

  override onUpdate(dt: number): void {
    if (this.disposed || !this.ready || dt <= 0) return;
    this.clock += dt;
    if (this.active) {
      const previous = this.elapsed;
      this.elapsed = Math.min(config.duration, this.elapsed + dt);
      // The disabled Animator is advanced here so pose, emission and impacts share one clock.
      this.animator!.update(dt);
      const emissionDt = Math.max(0, Math.min(this.elapsed, config.waterOff) - Math.max(previous, config.waterOn));
      if (emissionDt > 0) this.emitWater(emissionDt);
    }
    while (this.impacts.length && this.impacts[0].at <= this.clock) {
      const impact = this.impacts.shift()!;
      this.particles!.splash.entity.transform.worldPosition = impact.position;
      this.particles!.mist.entity.transform.worldPosition = impact.position;
      this.particles!.splash.generator.emit(1);
      this.particles!.mist.generator.emit(3);
      if (this.active && !this.soilReleased) {
        this.active.releaseSoil();
        this.soilReleased = true;
      }
    }
    if (this.active && this.elapsed >= config.duration) {
      this.active.releaseSoil();
      this.active = undefined;
      this.model!.isActive = false;
      this.startNext();
    }
  }

  override onDestroy(): void {
    this.disposed = true;
    this.active?.releaseSoil();
    this.pending?.releaseSoil();
    this.active = this.pending = undefined;
    this.impacts.length = 0;
    this.particles?.dispose();
    this.model?.destroy();
  }

  private async load(): Promise<void> {
    try {
      registerFarmingPropResources(this.engine);
      const [resource, splash] = await Promise.all([
        this.engine.resourceManager.load<PrefabResource>({ url: prop.prefabUrl, type: AssetType.Prefab }),
        this.engine.resourceManager.load<Texture2D>({ url: config.splashUrl, type: AssetType.Texture })
      ]);
      if (this.disposed) return;
      this.model = resource.instantiate();
      this.entity.addChild(this.model);
      this.nozzle = this.model.findByName(prop.nozzle) ?? undefined;
      this.animator = this.model.getComponent(Animator) ?? this.model.getComponentsIncludeChildren(Animator, [])[0];
      if (!this.nozzle || !this.animator) throw new Error("水壶缺少 Animator 或壶嘴挂点");
      const state = this.animator.animatorController?.layers[0]?.stateMachine.states.find(
        (state) => state.name === prop.state
      );
      if (!state?.clip || Math.abs(state.clip.length - config.duration) > 0.05)
        throw new Error("Watering Prefab 动作缺失或时长不匹配");
      this.model.isActive = false;
      this.particles = new WateringParticles(this.entity, splash);
      this.ready = true;
      this.startNext();
    } catch (error) {
      if (this.disposed) return;
      this.error = error instanceof Error ? error.message : String(error);
      this.pending?.releaseSoil();
      this.pending = undefined;
      this.model?.destroy();
      console.warn("Watering presentation unavailable:", this.error);
    }
  }

  private startNext(): void {
    if (!this.pending || !this.ready) return;
    this.active = this.pending;
    this.pending = undefined;
    this.elapsed = this.dropRemainder = 0;
    this.nextImpact = config.waterOn;
    this.soilReleased = false;
    this.model!.isActive = this.showProp;
    this.model!.transform.setPosition(...this.active.position);
    this.model!.transform.setRotation(0, this.active.yaw, 0);
    this.animator!.play(prop.state, 0, 0);
    this.animator!.update(0);
    this.playCount++;
  }

  private emitWater(dt: number): void {
    const origin = this.nozzle!.transform.worldPosition;
    // Blender +Z becomes glTF local +Y; native cone particles emit along local -Z.
    Vector3.transformNormal(this.direction.set(0, 1, 0), this.nozzle!.transform.worldMatrix, this.direction);
    this.direction.normalize();
    const flight = waterFlightSeconds(origin.y - this.active!.position[1], this.direction.y * config.speed);
    if (!flight || this.direction.y >= 0) return;
    const flow = Math.min(1, Math.max(0, (-this.direction.y - 0.12) / 0.5));
    if (!flow) return;
    const drops = this.particles!.drops;
    drops.entity.transform.worldPosition = origin;
    Vector3.add(origin, this.direction, this.lookTarget);
    drops.entity.transform.lookAt(this.lookTarget);
    drops.generator.main.startLifetime.constant = flight;
    this.dropRemainder += config.dropsPerSecond * flow * dt;
    const count = Math.floor(this.dropRemainder);
    this.dropRemainder -= count;
    drops.generator.emit(count);
    this.emittedDrops += count;
    if (this.elapsed >= this.nextImpact) {
      this.nextImpact = this.elapsed + config.impactInterval;
      this.impacts.push({
        at: this.clock + flight,
        position: new Vector3(
          origin.x + this.direction.x * config.speed * flight,
          this.active!.position[1] + 0.04,
          origin.z + this.direction.z * config.speed * flight
        )
      });
    }
  }
}
