import { IClone } from "@galacean/engine-design";
import { Color, Rand, Vector3 } from "@galacean/engine-math";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleScaleMode } from "../enums/ParticleScaleMode";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";

export class MainModule implements IClone {
  /** The duration of the Particle System in seconds. */
  duration: number = 5.0;
  /** Specifies whether the Particle System loops. */
  isLoop: boolean = true;

  /** Start delay in seconds. */
  @deepClone
  startDelay: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** The initial lifetime of particles when emitted. */
  @deepClone
  startLifetime: ParticleCompositeCurve = new ParticleCompositeCurve(5);
  /** The initial speed of particles when the Particle System first spawns them. */
  @deepClone
  startSpeed: ParticleCompositeCurve = new ParticleCompositeCurve(5);

  /** A flag to enable specifying particle size individually for each axis. */
  startSize3D: boolean = false;
  /** The initial size of particles when the Particle System first spawns them. */
  @deepClone
  startSize: ParticleCompositeCurve = new ParticleCompositeCurve(1);
  /** The initial size of particles along the x-axis when the Particle System first spawns them. */
  @deepClone
  startSizeX: ParticleCompositeCurve = new ParticleCompositeCurve(1);
  /** The initial size of particles along the y-axis when the Particle System first spawns them. */
  @deepClone
  startSizeY: ParticleCompositeCurve = new ParticleCompositeCurve(1);
  /** The initial size of particles along the z-axis when the Particle System first spawns them. */
  @deepClone
  startSizeZ: ParticleCompositeCurve = new ParticleCompositeCurve(1);

  /** A flag to enable 3D particle rotation. */
  startRotation3D: boolean = false;
  /** The initial rotation of particles when the Particle System first spawns them. */
  @deepClone
  startRotation: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** The initial rotation of particles around the x-axis when emitted.*/
  @deepClone
  startRotationX: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** The initial rotation of particles around the y-axis when emitted. */
  @deepClone
  startRotationY: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  @deepClone
  /** The initial rotation of particles around the z-axis when emitted. */
  @deepClone
  startRotationZ: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Makes some particles spin in the opposite direction. */
  flipRotation: number = 0;

  /** The mode of start color */
  @deepClone
  startColor: ParticleCompositeGradient = new ParticleCompositeGradient(new Color(1, 1, 1, 1));
  /** A scale that this Particle System applies to gravity, defined by Physics.gravity. */
  @deepClone
  gravityModifier: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** This selects the space in which to simulate particles. It can be either world or local space. */
  simulationSpace = ParticleSimulationSpace.Local;
  /** Override the default playback speed of the Particle System. */
  simulationSpeed: number = 1.0;
  /** Control how the Particle System applies its Transform component to the particles it emits. */
  scalingMode = ParticleScaleMode.Local;
  /** If set to true, the Particle Generator automatically begins to play on startup. */
  playOnEnabled: boolean = true;

  @ignoreClone
  private _maxParticles: number = 1000;
  @ignoreClone
  private _generator: ParticleGenerator;

  /** @internal */
  @ignoreClone
  readonly _startSpeedRand = new Rand(0, ParticleRandomSubSeeds.StartSpeed);
  /** @internal */
  @ignoreClone
  readonly _startLifeTimeRand = new Rand(0, ParticleRandomSubSeeds.StartLifetime);
  /** @internal */
  @ignoreClone
  readonly _startColorRand = new Rand(0, ParticleRandomSubSeeds.StartColor);
  /** @internal */
  @ignoreClone
  readonly _startSizeRand = new Rand(0, ParticleRandomSubSeeds.StartSize);
  /** @internal */
  @ignoreClone
  readonly _startRotationRand = new Rand(0, ParticleRandomSubSeeds.StartRotation);

  /**
   * Max particles count.
   */
  get maxParticles(): number {
    return this._maxParticles;
  }

  set maxParticles(value: number) {
    if (this._maxParticles !== value) {
      this._maxParticles = value;

      const generator = this._generator;
      if (value < generator._currentParticleCount) {
        generator._resizeInstanceBuffer(value);
      }
    }

    // this._updateParticlesSimulationRestart(0);
  }

  constructor(generator: ParticleGenerator) {
    this._generator = generator;
  }

  /**
   * @internal
   */
  _resetRandomSeed(randomSeed: number): void {
    this._startSpeedRand.reset(randomSeed, ParticleRandomSubSeeds.StartSpeed);
    this._startLifeTimeRand.reset(randomSeed, ParticleRandomSubSeeds.StartLifetime);
    this._startColorRand.reset(randomSeed, ParticleRandomSubSeeds.StartColor);
    this._startSizeRand.reset(randomSeed, ParticleRandomSubSeeds.StartSize);
    this._startRotationRand.reset(randomSeed, ParticleRandomSubSeeds.StartRotation);
  }

  /**
   * @internal
   */
  _getPositionScale(): Vector3 {
    const transform = this._generator._renderer.entity.transform;
    switch (this.scalingMode) {
      case ParticleScaleMode.Hierarchy:
      case ParticleScaleMode.World:
        return transform.lossyWorldScale;
      case ParticleScaleMode.Local:
        return transform.scale;
    }
  }

  /**
   * @internal
   */
  clone(): Object {
    return null;
  }

  /**
   * @internal
   */
  cloneTo(target: MainModule): void {
    target.maxParticles = this.maxParticles;
    console.log("dsd",this._generator._renderer.engine.time.frameCount);
  }
}
