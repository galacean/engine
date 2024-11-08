import { Color, Rand, Vector3, Vector4 } from "@galacean/engine-math";
import { TransformModifyFlags } from "../../Transform";
import { deepClone, ignoreClone } from "../../clone/CloneManager";
import { ICustomClone } from "../../clone/ComponentCloner";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleRandomSubSeeds } from "../enums/ParticleRandomSubSeeds";
import { ParticleScaleMode } from "../enums/ParticleScaleMode";
import { ParticleSimulationSpace } from "../enums/ParticleSimulationSpace";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";
import { ParticleCompositeGradient } from "./ParticleCompositeGradient";

export class MainModule implements ICustomClone {
  private _tempVector40 = new Vector4();
  private static _vector3One = new Vector3(1, 1, 1);

  private static readonly _positionScale = ShaderProperty.getByName("renderer_PositionScale");
  private static readonly _sizeScale = ShaderProperty.getByName("renderer_SizeScale");
  private static readonly _worldPosition = ShaderProperty.getByName("renderer_WorldPosition");
  private static readonly _worldRotation = ShaderProperty.getByName("renderer_WorldRotation");
  private static readonly _gravity = ShaderProperty.getByName("renderer_Gravity");
  private static readonly _simulationSpace = ShaderProperty.getByName("renderer_SimulationSpace");
  private static readonly _startRotation3D = ShaderProperty.getByName("renderer_ThreeDStartRotation");
  private static readonly _scaleMode = ShaderProperty.getByName("renderer_ScalingMode");

  /** The duration of the Particle Generator in seconds. */
  duration = 5.0;
  /** Specifies whether the Particle Generator loops. */
  isLoop = true;

  /** Start delay in seconds. */
  @deepClone
  startDelay = new ParticleCompositeCurve(0);

  /** A flag to enable 3D particle rotation, when disabled, only `startRotationZ` is used. */
  startRotation3D = false;
  /** The initial rotation of particles around the x-axis when emitted.*/
  @deepClone
  startRotationX = new ParticleCompositeCurve(0);
  /** The initial rotation of particles around the y-axis when emitted. */
  @deepClone
  startRotationY = new ParticleCompositeCurve(0);
  /** The initial rotation of particles around the z-axis when emitted. */
  @deepClone
  startRotationZ = new ParticleCompositeCurve(0);
  /** Makes some particles spin in the opposite direction. */
  flipRotation = 0;

  /** The mode of start color */
  @deepClone
  startColor = new ParticleCompositeGradient(new Color(1, 1, 1, 1));
  /** A scale that this Particle Generator applies to gravity, defined by Physics.gravity. */
  /** Override the default playback speed of the Particle Generator. */
  simulationSpeed = 1.0;
  /** Control how the Particle Generator applies its Transform component to the particles it emits. */
  scalingMode = ParticleScaleMode.Local;
  /** If set to true, the Particle Generator automatically begins to play on startup. */
  playOnEnabled = true;

  /** @internal */
  @ignoreClone
  _maxParticleBuffer = 1000;
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

  @ignoreClone
  readonly _gravityModifierRand = new Rand(0, ParticleRandomSubSeeds.GravityModifier);

  @deepClone
  private _startLifetime: ParticleCompositeCurve;
  @deepClone
  private _startSpeed: ParticleCompositeCurve;
  private _startSize3D = false;
  @deepClone
  private _startSizeX: ParticleCompositeCurve;
  @deepClone
  private _startSizeY: ParticleCompositeCurve;
  @deepClone
  private _startSizeZ: ParticleCompositeCurve;
  @deepClone
  private _gravityModifier: ParticleCompositeCurve;
  private _simulationSpace = ParticleSimulationSpace.Local;
  @ignoreClone
  private _generator: ParticleGenerator;

  /**
   * The initial lifetime of particles when emitted.
   */
  get startLifetime(): ParticleCompositeCurve {
    return this._startLifetime;
  }

  set startLifetime(value: ParticleCompositeCurve) {
    const lastValue = this._startLifetime;
    if (value !== lastValue) {
      this._startLifetime = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * The initial speed of particles when the Particle Generator first spawns them.
   */
  get startSpeed(): ParticleCompositeCurve {
    return this._startSpeed;
  }

  set startSpeed(value: ParticleCompositeCurve) {
    const lastValue = this._startSpeed;
    if (value !== lastValue) {
      this._startSpeed = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * A flag to enable specifying particle size individually for each axis.
   */
  get startSize3D(): boolean {
    return this._startSize3D;
  }

  set startSize3D(value: boolean) {
    if (value !== this._startSize3D) {
      this._startSize3D = value;
      this._generator._renderer._onGeneratorParamsChanged();
    }
  }

  /**
   * The initial size of particles along the x-axis when the Particle Generator first spawns them.
   */
  get startSizeX(): ParticleCompositeCurve {
    return this._startSizeX;
  }

  set startSizeX(value: ParticleCompositeCurve) {
    const lastValue = this._startSizeX;
    if (value !== lastValue) {
      this._startSizeX = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * The initial size of particles along the y-axis when the Particle Generator first spawns them.
   */
  get startSizeY(): ParticleCompositeCurve {
    return this._startSizeY;
  }

  set startSizeY(value: ParticleCompositeCurve) {
    const lastValue = this._startSizeY;
    if (value !== lastValue) {
      this._startSizeY = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * The initial size of particles along the z-axis when the Particle Generator first spawns them.
   */
  get startSizeZ(): ParticleCompositeCurve {
    return this._startSizeZ;
  }

  set startSizeZ(value: ParticleCompositeCurve) {
    const lastValue = this._startSizeZ;
    if (value !== lastValue) {
      this._startSizeZ = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * A scale that this Particle Generator applies to gravity, defined by Physics.gravity.
   */
  get gravityModifier(): ParticleCompositeCurve {
    return this._gravityModifier;
  }

  set gravityModifier(value: ParticleCompositeCurve) {
    const lastValue = this._gravityModifier;
    if (value !== lastValue) {
      this._gravityModifier = value;
      this._onCompositeCurveChange(lastValue, value);
    }
  }

  /**
   * This selects the space in which to simulate particles. It can be either world or local space.
   */
  get simulationSpace(): ParticleSimulationSpace {
    return this._simulationSpace;
  }

  set simulationSpace(value: ParticleSimulationSpace) {
    if (value !== this._simulationSpace) {
      this._simulationSpace = value;

      const generator = this._generator;
      generator._renderer._onTransformChanged(TransformModifyFlags.WorldMatrix);

      if (value === ParticleSimulationSpace.Local) {
        generator._freeBoundsArray();
      }
    }
  }

  /**
   * Max particles count.
   */
  get maxParticles(): number {
    return this._maxParticleBuffer - 1;
  }

  set maxParticles(value: number) {
    this._maxParticleBuffer = value + 1;
  }

  /**
   * The initial size of particles when the Particle Generator first spawns them.
   */
  get startSize(): ParticleCompositeCurve {
    return this.startSizeX;
  }

  set startSize(value: ParticleCompositeCurve) {
    this.startSizeX = value;
  }

  /**
   * @internal
   */
  constructor(generator: ParticleGenerator) {
    this._generator = generator;

    this.startLifetime = new ParticleCompositeCurve(5);
    this.startSpeed = new ParticleCompositeCurve(5);
    this.startSizeX = new ParticleCompositeCurve(1);
    this.startSizeY = new ParticleCompositeCurve(1);
    this.startSizeZ = new ParticleCompositeCurve(1);
    this.gravityModifier = new ParticleCompositeCurve(0);
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
  _updateShaderData(shaderData: ShaderData): void {
    const renderer = this._generator._renderer;
    const transform = renderer.entity.transform;

    switch (this.simulationSpace) {
      case ParticleSimulationSpace.Local:
        shaderData.setVector3(MainModule._worldPosition, transform.worldPosition);
        const worldRotation = transform.worldRotationQuaternion;
        const worldRotationV4 = this._tempVector40.copyFrom(worldRotation); // Maybe shaderData should support Quaternion
        shaderData.setVector4(MainModule._worldRotation, worldRotationV4);
        break;
      case ParticleSimulationSpace.World:
        break;
      default:
        throw new Error("ParticleRenderer: SimulationSpace value is invalid.");
    }

    switch (this.scalingMode) {
      case ParticleScaleMode.Hierarchy:
        var scale = transform.lossyWorldScale;
        shaderData.setVector3(MainModule._positionScale, scale);
        shaderData.setVector3(MainModule._sizeScale, scale);
        break;
      case ParticleScaleMode.Local:
        var scale = transform.scale;
        shaderData.setVector3(MainModule._positionScale, scale);
        shaderData.setVector3(MainModule._sizeScale, scale);
        break;
      case ParticleScaleMode.World:
        shaderData.setVector3(MainModule._positionScale, transform.lossyWorldScale);
        shaderData.setVector3(MainModule._sizeScale, MainModule._vector3One);
        break;
    }

    shaderData.setVector3(MainModule._gravity, renderer.scene.physics.gravity);
    shaderData.setInt(MainModule._simulationSpace, this.simulationSpace);
    shaderData.setFloat(MainModule._startRotation3D, +this.startRotation3D);
    shaderData.setInt(MainModule._scaleMode, this.scalingMode);
  }

  /**
   * @internal
   */
  _cloneTo(target: MainModule): void {
    target.maxParticles = this.maxParticles;

    if (target._simulationSpace === ParticleSimulationSpace.World) {
      target._generator._generateTransformedBounds();
    }
  }

  private _onCompositeCurveChange(lastValue: ParticleCompositeCurve, value: ParticleCompositeCurve): void {
    const renderer = this._generator._renderer;
    lastValue?._unRegisterOnValueChanged(renderer._onGeneratorParamsChanged);
    value?._registerOnValueChanged(renderer._onGeneratorParamsChanged);
    renderer._onGeneratorParamsChanged();
  }
}
