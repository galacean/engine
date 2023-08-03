import { ParticleScaleMode } from "../enums/ParticleScaleMode";
import { ParticleCurve } from "./ParticleCurve";

export class MainModule {
  /** The duration of the Particle System in seconds. */
  duration: number = 5.0;
  /** Specifies whether the Particle System is looping. */
  loop: boolean = true;
  /** A scale that this Particle System applies to gravity, defined by Physics.gravity. */
  gravityModifier: ParticleCurve = new ParticleCurve();
  /** Control how the Particle System applies its Transform component to the particles it emits. */
  scalingMode = ParticleScaleMode.Local;

  
  /** This selects the space in which to simulate particles. It can be either world or local space. */
  simulationSpace = ParticleSimulationSpace.Local;
  /** Override the default playback speed of the Particle System. */
  simulationSpeed = 1.0;
  /** If set to true, the Particle System automatically begins to play on startup. */
  playOnAwake = true;
  /** Makes some particles spin in the opposite direction. */
  flipRotation = 0;

  /** Start delay mode. */
  startDelayType = ParticleCurveMode.Constant;
  /** Start delay in seconds. */
  startDelay = 0;
  /** Start delay in min seconds. */
  startDelayMin = 0;
  /** Start delay in max seconds. */
  startDelayMax = 0;

  /** The mode of start particles speed */
  startSpeedType = ParticleCurveMode.Constant;
  /** The initial speed of particles when the Particle System first spawns them. */
  startSpeedConstant = 5.0;
  /** The min initial speed of particles when the Particle System first spawns them. */
  startSpeedConstantMin = 0;
  /** The max initial speed of particles when the Particle System first spawns them. */
  startSpeedConstantMax = 5.0;

  /** A flag to enable 3D particle rotation. */
  startRotation3D = false;
  /** The mode of start rotation */
  startRotationType = ParticleCurveMode.Constant;
  /** The initial rotation of particles when the Particle System first spawns them. */
  startRotationConstant = 0;
  /** The initial rotation of particles when the Particle System first spawns them. */
  startRotationConstantSeparate = new Vector3(0, 0, 0);
  /** The min initial rotation of particles when the Particle System first spawns them. */
  startRotationConstantMin = 0;
  /** The max initial rotation of particles when the Particle System first spawns them. */
  startRotationConstantMax = 0;
  /** The min initial rotation of particles when the Particle System first spawns them. */
  startRotationConstantMinSeparate = new Vector3(0, 0, 0);
  /** The max initial rotation of particles when the Particle System first spawns them. */
  startRotationConstantMaxSeparate = new Vector3(0, 0, 0);

  /** A flag to enable specifying particle size individually for each axis. */
  startSize3D = false;
  /** The mode of start size */
  startSizeType = ParticleCurveMode.Constant;
  /** The initial size of particles when the Particle System first spawns them. */
  startSizeConstant = 1;
  /** The initial size of particles when the Particle System first spawns them. */
  startSizeConstantSeparate = new Vector3(1, 1, 1);
  /** The min initial size of particles when the Particle System first spawns them. */
  startSizeConstantMin = 0;
  /** The max initial size of particles when the Particle System first spawns them. */
  startSizeConstantMax = 1;
  /** The min initial size of particles when the Particle System first spawns them. */
  startSizeConstantMinSeparate = new Vector3(0, 0, 0);
  /** The max initial size of particles when the Particle System first spawns them. */
  startSizeConstantMaxSeparate = new Vector3(1, 1, 1);

  /** The mode of start color */
  startColorType = ParticleCurveMode.Constant;
  /** The initial color of particles when the Particle System first spawns them. */
  startColorConstant = new Color(1, 1, 1, 1);
  /** The min initial color of particles when the Particle System first spawns them. */
  startColorConstantMin = new Color(0, 0, 0, 0);
  /** The max initial color of particles when the Particle System first spawns them. */
  startColorConstantMax = new Color(1, 1, 1, 1);
}
