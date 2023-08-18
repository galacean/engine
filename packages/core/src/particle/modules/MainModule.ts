import { Color, Rand } from "@galacean/engine-math";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleScaleMode } from "../enums/ParticleScaleMode";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";

export class MainModule {
  /** The duration of the Particle System in seconds. */
  duration: number = 5.0;
  /** Specifies whether the Particle System is looping. */
  loop: boolean = true;

  /** Start delay in seconds. */
  startDelay: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** The initial lifetime of particles when emitted. */
  startLifetime: ParticleCompositeCurve = new ParticleCompositeCurve(5);
  /** The initial speed of particles when the Particle System first spawns them. */
  startSpeed: ParticleCompositeCurve = new ParticleCompositeCurve(5);

  /** A flag to enable specifying particle size individually for each axis. */
  startSize3D: boolean = false;
  /** The initial size of particles when the Particle System first spawns them. */
  startSize: ParticleCompositeCurve = new ParticleCompositeCurve(1);
  /** The initial size of particles along the x-axis when the Particle System first spawns them. */
  startSizeX: ParticleCompositeCurve = new ParticleCompositeCurve(1);
  /** The initial size of particles along the y-axis when the Particle System first spawns them. */
  startSizeY: ParticleCompositeCurve = new ParticleCompositeCurve(1);
  /** The initial size of particles along the z-axis when the Particle System first spawns them. */
  startSizeZ: ParticleCompositeCurve = new ParticleCompositeCurve(1);

  /** A flag to enable 3D particle rotation. */
  startRotation3D: boolean = false;
  /** The initial rotation of particles when the Particle System first spawns them. */
  startRotation: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** The initial rotation of particles around the x-axis when emitted.*/
  startRotationX: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** The initial rotation of particles around the y-axis when emitted. */
  startRotationY: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** The initial rotation of particles around the z-axis when emitted. */
  startRotationZ: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** Makes some particles spin in the opposite direction. */
  flipRotation: number = 0;

  /** The mode of start color */
  startColor: ParticleCompositeGradient = new ParticleCompositeGradient(new Color(1, 1, 1, 1));
  /** A scale that this Particle System applies to gravity, defined by Physics.gravity. */
  gravityModifier: ParticleCompositeCurve = new ParticleCompositeCurve(0);
  /** This selects the space in which to simulate particles. It can be either world or local space. */
  simulationSpace = ParticleSimulationSpace.Local;
  /** Override the default playback speed of the Particle System. */
  simulationSpeed: number = 1.0;
  /** Control how the Particle System applies its Transform component to the particles it emits. */
  scalingMode = ParticleScaleMode.Local;
  /** If set to true, the Particle System automatically begins to play on startup. */
  playOnEnabled: boolean = true;

  private _maxParticles: number = 1000;

  private _generator: ParticleGenerator;

  /** @internal */
  _startSpeedRand: Rand = new Rand(0, ParticleRandomSubSeeds.StartSpeed);
  /** @internal */
  _startLifeTimeRand: Rand = new Rand(0, ParticleRandomSubSeeds.StartLifetime);
  /** @internal */
  _startColorRand: Rand = new Rand(0, ParticleRandomSubSeeds.StartColor);
  /** @internal */
  _startSizeRand: Rand = new Rand(0, ParticleRandomSubSeeds.StartSize);
  /** @internal */
  _startRotationRand: Rand = new Rand(0, ParticleRandomSubSeeds.StartRotation);

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
}
