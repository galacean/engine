import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleScaleMode } from "../enums/ParticleScaleMode";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleCurve } from "./ParticleCurve";
import { ParticleGradient } from "./ParticleGradient";

export class MainModule {
  /** The duration of the Particle System in seconds. */
  duration: number = 5.0;
  /** Specifies whether the Particle System is looping. */
  loop: boolean = true;

  /** Start delay in seconds. */
  startDelay: ParticleCurve = new ParticleCurve();
  /** The initial lifetime of particles when emitted. */
  startLifetime: ParticleCurve = new ParticleCurve();
  /** The initial speed of particles when the Particle System first spawns them. */
  startSpeed: ParticleCurve = new ParticleCurve();

  /** A flag to enable specifying particle size individually for each axis. */
  startSize3D: boolean = false;
  /** The initial size of particles when the Particle System first spawns them. */
  startSize: ParticleCurve = new ParticleCurve();
  /** The initial size of particles along the x-axis when the Particle System first spawns them. */
  startSizeX: ParticleCurve = new ParticleCurve();
  /** The initial size of particles along the y-axis when the Particle System first spawns them. */
  startSizeY: ParticleCurve = new ParticleCurve();
  /** The initial size of particles along the z-axis when the Particle System first spawns them. */
  startSizeZ: ParticleCurve = new ParticleCurve();

  /** A flag to enable 3D particle rotation. */
  startRotation3D: boolean = false;
  /** The initial rotation of particles when the Particle System first spawns them. */
  startRotation: ParticleCurve = new ParticleCurve();
  /** The initial rotation of particles around the x-axis when emitted.*/
  startRotationX: ParticleCurve = new ParticleCurve();
  /** The initial rotation of particles around the y-axis when emitted. */
  startRotationY: ParticleCurve = new ParticleCurve();
  /** The initial rotation of particles around the z-axis when emitted. */
  startRotationZ: ParticleCurve = new ParticleCurve();
  /** Makes some particles spin in the opposite direction. */
  flipRotation: number = 0;

  /** The mode of start color */
  startColor: ParticleGradient = new ParticleGradient();
  /** A scale that this Particle System applies to gravity, defined by Physics.gravity. */
  gravityModifier: ParticleCurve = new ParticleCurve();
  /** This selects the space in which to simulate particles. It can be either world or local space. */
  simulationSpace = ParticleSimulationSpace.Local;
  /** Override the default playback speed of the Particle System. */
  simulationSpeed: number = 1.0;
  /** Control how the Particle System applies its Transform component to the particles it emits. */
  scalingMode = ParticleScaleMode.Local;
  /** If set to true, the Particle System automatically begins to play on startup. */
  playOnAwake: boolean = true;

  private _bufferMaxParticles: number = 0;
  private _particleSystem: ParticleGenerator;

  /**
   * Max particles count.
   */
  get maxParticles(): number {
    return this._bufferMaxParticles - 1;
  }

  set maxParticles(value: number) {
    var newMaxParticles: number = value + 1;
    if (newMaxParticles !== this._bufferMaxParticles) {
      this._bufferMaxParticles = newMaxParticles;

      const particleSystem = this._particleSystem;
      if (value < particleSystem._currentParticleCount) {
        particleSystem._recreateInstanceBuffer(value);
      }
    }

    // this._updateParticlesSimulationRestart(0);
  }

  constructor(particleSystem: ParticleGenerator) {
    this._particleSystem = particleSystem;
  }

  
}
