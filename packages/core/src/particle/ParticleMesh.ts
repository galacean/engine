import {
  BoundingBox,
  BoundingSphere,
  Color,
  MathUtil,
  Quaternion,
  Rand,
  Vector2,
  Vector3
} from "@galacean/engine-math";
import { ParticleRenderer } from "./ParticleRenderer";
import { BufferMesh, ModelMesh } from "../mesh";
import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  IndexBufferBinding,
  IndexFormat,
  SubMesh,
  VertexBufferBinding,
  VertexElement,
  VertexElementFormat
} from "../graphic";
import {
  BoxShape,
  Burst,
  CircleShape,
  ColorGradient,
  ColorOverLifetimeModule,
  ConeShape,
  EmissionModule,
  FrameOverTime,
  HemisphereShape,
  ParticleCurve,
  RotationOverLifetimeModule,
  RotationVelocityGradient,
  SizeGradient,
  SizeOverLifetimeModule,
  SphereShape,
  TextureSheetAnimationModule,
  VelocityGradient,
  VelocityOverLifetimeModule
} from "./module";
import { BaseShape } from "./module/shape/BaseShape";
import { ParticleShaderDeclaration } from "./ParticleShaderDeclaration";
import { ParticleData } from "./ParticleData";
import { ParticleCurveMode, ParticleRenderMode, ParticleScaleMode, ParticleSimulationSpace } from "./enum";
import { ParticleShapeType } from "./enum/ParticleShapeType";
import { ParticleGradientMode } from "./enum/ParticleGradientMode";

/**
 * Particle Mesh
 */
export class ParticleMesh extends BufferMesh {
  protected static VERTEX_STRIDE = 168;
  protected static VERTEX_ELEMENTS = [
    new VertexElement("a_CornerTextureCoordinate", 0, VertexElementFormat.Vector4, 0),
    new VertexElement("a_ShapePositionStartLifeTime", 16, VertexElementFormat.Vector4, 0),
    new VertexElement("a_DirectionTime", 32, VertexElementFormat.Vector4, 0),
    new VertexElement("a_StartColor", 48, VertexElementFormat.Vector4, 0),
    new VertexElement("a_StartSize", 64, VertexElementFormat.Vector3, 0),
    new VertexElement("a_StartRotation0", 76, VertexElementFormat.Vector3, 0),
    new VertexElement("a_StartSpeed", 88, VertexElementFormat.Float, 0),
    new VertexElement("a_Random0", 92, VertexElementFormat.Vector4, 0),
    new VertexElement("a_Random1", 108, VertexElementFormat.Vector4, 0),
    new VertexElement("a_SimulationWorldPosition", 124, VertexElementFormat.Vector3, 0),
    new VertexElement("a_SimulationWorldRotation", 136, VertexElementFormat.Vector4, 0),
    new VertexElement("a_SimulationUV", 152, VertexElementFormat.Vector4, 0)
  ];

  /**
   * @internal
   * 0:Burst,
   * 1:预留,
   * 2:StartDelay,
   * 3:StartColor,
   * 4:StartSize,
   * 5:StartRotation,
   * 6:randomizeRotationDirection,
   * 7:StartLifetime,
   * 8:StartSpeed,
   * 9:VelocityOverLifetime,
   * 10:ColorOverLifetime,
   * 11:SizeOverLifetime,
   * 12:RotationOverLifetime,
   * 13-15:TextureSheetAnimation,
   * 16-17:Shape
   */
  protected static _RANDOM_OFFSET: Uint32Array = new Uint32Array([
    0x23571a3e, 0xc34f56fe, 0x13371337, 0x12460f3b, 0x6aed452e, 0xdec4aea1, 0x96aa4de3, 0x8d2c8431, 0xf3857f6f,
    0xe0fbd834, 0x13740583, 0x591bc05c, 0x40eb95e4, 0xbc524e5f, 0xaf502044, 0xa614b381, 0x1034e524, 0xfc524e5f
  ]);

  protected static halfKSqrtOf2: number = 1.42 * 0.5;
  protected static g: number = 9.8;
  protected static _maxElapsedTime: number = 1.0 / 3.0;

  protected static _tempVector30 = new Vector3();
  protected static _tempVector31 = new Vector3();
  protected static _tempVector32 = new Vector3();
  protected static _tempVector33 = new Vector3();
  protected static _tempVector34 = new Vector3();
  protected static _tempVector35 = new Vector3();
  protected static _tempVector36 = new Vector3();
  protected static _tempVector37 = new Vector3();
  protected static _tempPosition = new Vector3();
  protected static _tempDirection = new Vector3();

  /** @internal */
  _boundingSphere = new BoundingSphere(new Vector3(), Number.MAX_VALUE);
  /** @internal */
  _boundingBox = new BoundingBox(
    new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE),
    new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE)
  );
  /** @internal */
  _boundingBoxCorners: Vector3[] = [];
  /** @internal */
  _customBounds: BoundingBox = null;
  /** @internal */
  _useCustomBounds: boolean = false;
  /** @internal 重力影响偏移, 用于计算世界包围盒 */
  _gravityOffset = new Vector2();

  /**@internal */
  _currentTime = 0;

  /**@internal */
  _rand: Rand = new Rand(0);
  /**@internal */
  _randomSeeds = new Uint32Array(ParticleMesh._RANDOM_OFFSET.length);

  protected _simulateUpdate = false;
  protected _drawCounter = 0;
  protected _isEmitting = false;
  protected _isPlaying = false;
  protected _isPaused = false;
  protected _playStartDelay = 0;
  protected _frameRateTime = 0;
  protected _emissionTime = 0;
  protected _totalDelayTime = 0;
  protected _emissionDistance = 0;
  protected _emissionLastPosition = new Vector3();
  protected _uvLength = new Vector2();

  protected _renderer: ParticleRenderer = null;
  protected _indexBuffer: Buffer = null;
  protected _vertexBuffer: Buffer = null;
  protected _vertices: Float32Array = null;
  protected _simulationUV_Index = 0;
  protected _startLifeTimeIndex = 0;
  protected _timeIndex = 0;
  protected _burstsIndex = 0;
  protected _firstActiveElement = 0;
  protected _firstNewElement = 0;
  protected _firstFreeElement = 0;
  protected _firstRetiredElement = 0;
  protected _vertexStride = 0;
  protected _indexStride = 0;
  protected _floatCountPerVertex = 0;
  protected _bufferMaxParticles = 1;

  protected _emission = new EmissionModule();
  protected _shape: BaseShape = null;
  protected _velocityOverLifetime: VelocityOverLifetimeModule = null;
  protected _colorOverLifetime: ColorOverLifetimeModule = null;
  protected _sizeOverLifetime: SizeOverLifetimeModule = null;
  protected _rotationOverLifetime: RotationOverLifetimeModule = null;
  protected _textureSheetAnimation: TextureSheetAnimationModule = null;

  protected _startLifetimeType = ParticleCurveMode.Constant;
  protected _startLifetimeConstant = 5.0;
  protected _startLifeTimeGradient = new ParticleCurve();
  protected _startLifetimeConstantMin = 0;
  protected _startLifetimeConstantMax = 5.0;
  protected _startLifeTimeGradientMin = new ParticleCurve();
  protected _startLifeTimeGradientMax = new ParticleCurve();
  protected _maxStartLifetime = 5.0;

  //---------------------------- Particle Force Field -------------------------//
  /** The mode of drag */
  dragType = ParticleCurveMode.Constant;
  /** Apply drag to particles within the volume of the Force Field. */
  dragConstant = 0;
  /** Min apply drag to particles within the volume of the Force Field. */
  dragSpeedConstantMin = 0;
  /** Max apply drag to particles within the volume of the Force Field. */
  dragSpeedConstantMax = 0;

  //---------------------------- Random seed ----------------------------------//
  /** Random seed.(should set before play()) */
  randomSeed = new Uint32Array(1);
  /** Whether to use random seed */
  autoRandomSeed = true;
  /** Whether to use performance mode, which will delay particle release.*/
  isPerformanceMode = true;

  //---------------------------- Main Module ----------------------------------//
  /** The duration of the Particle System in seconds. */
  duration = 5.0;
  /** Specifies whether the Particle System is looping. */
  looping = true;

  /** A scale that this Particle System applies to gravity, defined by Physics.gravity. */
  gravityModifier = 0;
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

  /**
   * The mode of total lifetime.
   */
  get startLifetimeType(): ParticleCurveMode {
    return this._startLifetimeType;
  }

  set startLifetimeType(value: ParticleCurveMode) {
    let i: number, n: number;
    switch (this.startLifetimeType) {
      case ParticleCurveMode.Constant:
        this._maxStartLifetime = this.startLifetimeConstant;
        break;
      case ParticleCurveMode.Curve:
        this._maxStartLifetime = -Number.MAX_VALUE;
        const startLifeTimeGradient = this.startLifeTimeGradient;
        for (i = 0, n = startLifeTimeGradient.gradientCount; i < n; i++)
          this._maxStartLifetime = Math.max(this._maxStartLifetime, startLifeTimeGradient.getValueByIndex(i));
        break;
      case ParticleCurveMode.TwoConstants:
        this._maxStartLifetime = Math.max(this.startLifetimeConstantMin, this.startLifetimeConstantMax);
        break;
      case ParticleCurveMode.TwoCurves:
        this._maxStartLifetime = -Number.MAX_VALUE;
        const startLifeTimeGradientMin = this.startLifeTimeGradientMin;
        for (i = 0, n = startLifeTimeGradientMin.gradientCount; i < n; i++)
          this._maxStartLifetime = Math.max(this._maxStartLifetime, startLifeTimeGradientMin.getValueByIndex(i));
        const startLifeTimeGradientMax = this.startLifeTimeGradientMax;
        for (i = 0, n = startLifeTimeGradientMax.gradientCount; i < n; i++)
          this._maxStartLifetime = Math.max(this._maxStartLifetime, startLifeTimeGradientMax.getValueByIndex(i));
        break;
    }
    this._startLifetimeType = value;
  }

  /**
   * The total lifetime in seconds that each new particle has.
   */
  get startLifetimeConstant(): number {
    return this._startLifetimeConstant;
  }

  set startLifetimeConstant(value: number) {
    if (this._startLifetimeType === ParticleCurveMode.Constant) this._maxStartLifetime = value;
    this._startLifetimeConstant = value;
  }

  /**
   * The total lifetime in seconds that each new particle has.
   */
  get startLifeTimeGradient(): ParticleCurve {
    return this._startLifeTimeGradient;
  }

  set startLifeTimeGradient(value: ParticleCurve) {
    if (this._startLifetimeType === ParticleCurveMode.Curve) {
      this._maxStartLifetime = -Number.MAX_VALUE;
      for (let i: number = 0, n: number = value.gradientCount; i < n; i++)
        this._maxStartLifetime = Math.max(this._maxStartLifetime, value.getValueByIndex(i));
    }
    this._startLifeTimeGradient = value;
  }

  /**
   * The lower total lifetime in seconds that each new particle has.
   */
  get startLifetimeConstantMin(): number {
    return this._startLifetimeConstantMin;
  }

  set startLifetimeConstantMin(value: number) {
    if (this._startLifetimeType === ParticleCurveMode.TwoConstants)
      this._maxStartLifetime = Math.max(value, this._startLifetimeConstantMax);
    this._startLifetimeConstantMin = value;
  }

  /**
   * The upper total lifetime in seconds that each new particle has.
   */
  get startLifetimeConstantMax(): number {
    return this._startLifetimeConstantMax;
  }

  set startLifetimeConstantMax(value: number) {
    if (this._startLifetimeType === ParticleCurveMode.TwoConstants)
      this._maxStartLifetime = Math.max(this._startLifetimeConstantMin, value);
    this._startLifetimeConstantMax = value;
  }

  /**
   * The lower total lifetime in seconds that each new particle has.
   */
  get startLifeTimeGradientMin(): ParticleCurve {
    return this._startLifeTimeGradientMin;
  }

  set startLifeTimeGradientMin(value: ParticleCurve) {
    if (this._startLifetimeType === ParticleCurveMode.TwoCurves) {
      let i: number, n: number;
      this._maxStartLifetime = -Number.MAX_VALUE;
      for (i = 0, n = value.gradientCount; i < n; i++)
        this._maxStartLifetime = Math.max(this._maxStartLifetime, value.getValueByIndex(i));
      for (i = 0, n = this._startLifeTimeGradientMax.gradientCount; i < n; i++)
        this._maxStartLifetime = Math.max(this._maxStartLifetime, this._startLifeTimeGradientMax.getValueByIndex(i));
    }
    this._startLifeTimeGradientMin = value;
  }

  /**
   * The upper total lifetime in seconds that each new particle has.
   */
  get startLifeTimeGradientMax(): ParticleCurve {
    return this._startLifeTimeGradientMax;
  }

  set startLifeTimeGradientMax(value: ParticleCurve) {
    if (this._startLifetimeType === ParticleCurveMode.TwoCurves) {
      let i: number, n: number;
      this._maxStartLifetime = -Number.MAX_VALUE;
      for (i = 0, n = this._startLifeTimeGradientMin.gradientCount; i < n; i++)
        this._maxStartLifetime = Math.max(this._maxStartLifetime, this._startLifeTimeGradientMin.getValueByIndex(i));
      for (i = 0, n = value.gradientCount; i < n; i++)
        this._maxStartLifetime = Math.max(this._maxStartLifetime, value.getValueByIndex(i));
    }
    this._startLifeTimeGradientMax = value;
  }

  //---------------------------- Particle Shape Field -------------------------//
  /**
   * The ShapeModule of a Particle System.
   */
  get shape(): BaseShape {
    return this._shape;
  }

  set shape(value: BaseShape) {
    if (this._shape !== value) {
      if (value && value.enable) this._renderer.shaderData.enableMacro(ParticleShaderDeclaration.SHAPE);
      else this._renderer.shaderData.enableMacro(ParticleShaderDeclaration.SHAPE);
      this._shape = value;
    }
  }

  /**
   * The maximum number of particles to emit.
   */
  get maxParticles(): number {
    return this._bufferMaxParticles - 1;
  }

  set maxParticles(value: number) {
    const newMaxParticles: number = value + 1;
    if (newMaxParticles !== this._bufferMaxParticles) {
      this._bufferMaxParticles = newMaxParticles;
      this._initBuffer();
    }
  }

  /**
   * the sum of all alive particles within the particle system.
   */
  get aliveParticleCount(): number {
    if (this._firstNewElement >= this._firstRetiredElement) return this._firstNewElement - this._firstRetiredElement;
    else return this._bufferMaxParticles - this._firstRetiredElement + this._firstNewElement;
  }

  /**
   * The emission time of the Particle System in seconds.
   */
  get emissionTime(): number {
    return this._emissionTime > this.duration ? this.duration : this._emissionTime;
  }

  /**
   * The EmissionModule of a Particle System.
   */
  get emission(): EmissionModule {
    return this._emission;
  }

  /**
   * Determines whether the Particle System is alive
   */
  get isAlive(): boolean {
    return this._isPlaying || this.aliveParticleCount > 0;
  }

  /**
   * Determines whether the Particle System is emitting particles.
   */
  get isEmitting(): boolean {
    return this._isEmitting;
  }

  /**
   * Determines whether the Particle System is playing.
   */
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  /**
   * Determines whether the Particle System is paused.
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  //---------------------------- Particle Velocity Field-----------------------//
  /**
   * The VelocityOverLifetimeModule of a Particle System.
   */
  get velocityOverLifetime(): VelocityOverLifetimeModule {
    return this._velocityOverLifetime;
  }

  set velocityOverLifetime(value: VelocityOverLifetimeModule) {
    const shaDat = this._renderer.shaderData;
    if (value) {
      const velocity: VelocityGradient = value.velocity;
      const velocityType = velocity.mode;
      if (value.enable) {
        switch (velocityType) {
          case ParticleCurveMode.Constant:
            shaDat.enableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_CONSTANT);
            break;
          case ParticleCurveMode.Curve:
            shaDat.enableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_CURVE);
            break;
          case ParticleCurveMode.TwoConstants:
            shaDat.enableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_RANDOM_CONSTANT);
            break;
          case ParticleCurveMode.TwoCurves:
            shaDat.enableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_RANDOM_CURVE);
            break;
        }
      } else {
        shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_CONSTANT);
        shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_CURVE);
        shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_RANDOM_CONSTANT);
        shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_RANDOM_CURVE);
      }

      switch (velocityType) {
        case ParticleCurveMode.Constant:
          shaDat.setVector3(ParticleShaderDeclaration.VOL_VELOCITY_CONST, velocity.constant);
          break;
        case ParticleCurveMode.Curve:
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTX, velocity.gradientX._elements);
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTY, velocity.gradientY._elements);
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTZ, velocity.gradientZ._elements);
          break;
        case ParticleCurveMode.TwoConstants:
          shaDat.setVector3(ParticleShaderDeclaration.VOL_VELOCITY_CONST, velocity.constantMin);
          shaDat.setVector3(ParticleShaderDeclaration.VOL_VELOCITY_CONST_MAX, velocity.constantMax);
          break;
        case ParticleCurveMode.TwoCurves:
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTX, velocity.gradientXMin._elements);
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTX_MAX, velocity.gradientXMax._elements);
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTY, velocity.gradientYMin._elements);
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTY_MAX, velocity.gradientYMax._elements);
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTZ, velocity.gradientZMin._elements);
          shaDat.setFloatArray(ParticleShaderDeclaration.VOL_VELOCITY_GRADIENTZ_MAX, velocity.gradientZMax._elements);
          break;
      }
      shaDat.setInt(ParticleShaderDeclaration.VOL_SPACE_TYPE, value.space);
    } else {
      shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_CONSTANT);
      shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_CURVE);
      shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_RANDOM_CONSTANT);
      shaDat.disableMacro(ParticleShaderDeclaration.VELOCITY_OVER_LIFETIME_RANDOM_CURVE);
    }
    this._velocityOverLifetime = value;
  }

  //---------------------------- Particle Color Field--------------------------//
  /**
   * The ColorOverLifetimeModule of a Particle System.
   */
  get colorOverLifetime(): ColorOverLifetimeModule {
    return this._colorOverLifetime;
  }

  set colorOverLifetime(value: ColorOverLifetimeModule) {
    const shaDat = this._renderer.shaderData;
    if (value) {
      const color: ColorGradient = value.color;
      if (value.enable) {
        switch (color.mode) {
          case ParticleGradientMode.Gradient:
            shaDat.enableMacro(ParticleShaderDeclaration.COLOR_OVER_LIFETIME);
            break;
          case ParticleGradientMode.TwoGradients:
            shaDat.enableMacro(ParticleShaderDeclaration.RANDOM_COLOR_OVER_LIFETIME);
            break;
        }
      } else {
        shaDat.disableMacro(ParticleShaderDeclaration.COLOR_OVER_LIFETIME);
        shaDat.disableMacro(ParticleShaderDeclaration.RANDOM_COLOR_OVER_LIFETIME);
      }

      switch (color.mode) {
        case ParticleGradientMode.Gradient:
          const gradientColor = color.gradient;
          shaDat.setFloatArray(ParticleShaderDeclaration.COLOR_OVER_LIFE_GRADIENT_ALPHAS, gradientColor.alphaElements);
          shaDat.setFloatArray(ParticleShaderDeclaration.COLOR_OVER_LIFE_GRADIENT_COLORS, gradientColor.rgbElements);
          const ranges = gradientColor.keyRanges;
          ranges.set(1, 0, 1, 0);
          for (let index = 0; index < gradientColor.colorRGBKeysCount; index++) {
            let colorKey = gradientColor.rgbElements[index * 4];
            ranges.x = Math.min(ranges.x, colorKey);
            ranges.y = Math.max(ranges.y, colorKey);
          }
          for (let index = 0; index < gradientColor.colorAlphaKeysCount; index++) {
            let alphaKey = gradientColor.alphaElements[index * 2];
            ranges.z = Math.min(ranges.z, alphaKey);
            ranges.w = Math.max(ranges.w, alphaKey);
          }
          shaDat.setVector4(ParticleShaderDeclaration.COLOR_OVER_LIFE_GRADIENT_RANGES, ranges);

          if (gradientColor.maxColorAlphaKeysCount == 8) {
            shaDat.enableMacro(ParticleShaderDeclaration.COLOR_KEY_COUNT_8);
          } else {
            shaDat.disableMacro(ParticleShaderDeclaration.COLOR_KEY_COUNT_8);
          }
          break;
        case ParticleGradientMode.TwoGradients:
          const minGradientColor = color.gradientMin;
          const maxGradientColor = color.gradientMax;
          shaDat.setFloatArray(
            ParticleShaderDeclaration.COLOR_OVER_LIFE_GRADIENT_ALPHAS,
            minGradientColor.alphaElements
          );
          shaDat.setFloatArray(ParticleShaderDeclaration.COLOR_OVER_LIFE_GRADIENT_COLORS, minGradientColor.rgbElements);
          shaDat.setFloatArray(
            ParticleShaderDeclaration.MAX_COLOR_OVER_LIFE_GRADIENT_ALPHAS,
            maxGradientColor.alphaElements
          );
          shaDat.setFloatArray(
            ParticleShaderDeclaration.MAX_COLOR_OVER_LIFE_GRADIENT_COLORS,
            maxGradientColor.rgbElements
          );

          let minRanges = minGradientColor.keyRanges;
          minRanges.set(1, 0, 1, 0);
          for (let index = 0; index < minGradientColor.colorRGBKeysCount; index++) {
            let colorKey = minGradientColor.rgbElements[index * 4];
            minRanges.x = Math.min(minRanges.x, colorKey);
            minRanges.y = Math.max(minRanges.y, colorKey);
          }
          for (let index = 0; index < minGradientColor.colorAlphaKeysCount; index++) {
            let alphaKey = minGradientColor.alphaElements[index * 2];
            minRanges.z = Math.min(minRanges.z, alphaKey);
            minRanges.w = Math.max(minRanges.w, alphaKey);
          }
          shaDat.setVector4(ParticleShaderDeclaration.COLOR_OVER_LIFE_GRADIENT_RANGES, minRanges);
          let maxRanges = maxGradientColor.keyRanges;
          maxRanges.set(1, 0, 1, 0);
          for (let index = 0; index < maxGradientColor.colorRGBKeysCount; index++) {
            let colorKey = maxGradientColor.rgbElements[index * 4];
            maxRanges.x = Math.min(maxRanges.x, colorKey);
            maxRanges.y = Math.max(maxRanges.y, colorKey);
          }
          for (let index = 0; index < maxGradientColor.colorAlphaKeysCount; index++) {
            let alphaKey = maxGradientColor.alphaElements[index * 2];
            maxRanges.z = Math.min(maxRanges.z, alphaKey);
            maxRanges.w = Math.max(maxRanges.w, alphaKey);
          }
          shaDat.setVector4(ParticleShaderDeclaration.MAX_COLOR_OVER_LIFE_GRADIENT_RANGES, maxRanges);

          const maxKeyCount = Math.max(
            minGradientColor.maxColorAlphaKeysCount,
            maxGradientColor.maxColorAlphaKeysCount
          );
          if (maxKeyCount == 8) {
            shaDat.enableMacro(ParticleShaderDeclaration.COLOR_KEY_COUNT_8);
          } else {
            shaDat.disableMacro(ParticleShaderDeclaration.COLOR_KEY_COUNT_8);
          }

          break;
      }
    } else {
      shaDat.disableMacro(ParticleShaderDeclaration.COLOR_OVER_LIFETIME);
      shaDat.disableMacro(ParticleShaderDeclaration.RANDOM_COLOR_OVER_LIFETIME);
    }
    this._colorOverLifetime = value;
  }

  //---------------------------- Particle Size Field--------------------------//
  /**
   * The SizeOverLifetimeModule of a Particle System.
   */
  get sizeOverLifetime(): SizeOverLifetimeModule {
    return this._sizeOverLifetime;
  }

  set sizeOverLifetime(value: SizeOverLifetimeModule) {
    const shaDat = this._renderer.shaderData;
    if (value) {
      const size: SizeGradient = value.size;
      const sizeSeparate = size.separateAxes;
      const sizeType = size.mode;
      if (value.enable) {
        switch (sizeType) {
          case ParticleCurveMode.Curve:
            if (sizeSeparate) shaDat.enableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_CURVE_SEPARATE);
            else shaDat.enableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_CURVE);
            break;
          case ParticleCurveMode.TwoCurves:
            if (sizeSeparate) shaDat.enableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE);
            else shaDat.enableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_RANDOM_CURVES);
            break;
        }
      } else {
        shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_CURVE);
        shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_CURVE_SEPARATE);
        shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_RANDOM_CURVES);
        shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE);
      }

      switch (sizeType) {
        case ParticleCurveMode.Curve:
          if (sizeSeparate) {
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTX, size.gradientX._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTY, size.gradientY._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTZ, size.gradientZ._elements);
          } else {
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENT, size.gradient._elements);
          }
          break;
        case ParticleCurveMode.TwoCurves:
          if (sizeSeparate) {
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTX, size.gradientXMin._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTX_MAX, size.gradientXMax._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTY, size.gradientYMin._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTY_MAX, size.gradientYMax._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTZ, size.gradientZMin._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENTZ_MAX, size.gradientZMax._elements);
          } else {
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENT, size.gradientMin._elements);
            shaDat.setFloatArray(ParticleShaderDeclaration.SOL_SIZE_GRADIENT_Max, size.gradientMax._elements);
          }
          break;
      }
    } else {
      shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_CURVE);
      shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_CURVE_SEPARATE);
      shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_RANDOM_CURVES);
      shaDat.disableMacro(ParticleShaderDeclaration.SIZE_OVER_LIFETIME_RANDOM_CURVES_SEPARATE);
    }
    this._sizeOverLifetime = value;
  }

  //---------------------------- Particle Rotation Field-----------------------//
  /**
   * The RotationOverLifetimeModule of a Particle System.
   */
  get rotationOverLifetime(): RotationOverLifetimeModule {
    return this._rotationOverLifetime;
  }

  set rotationOverLifetime(value: RotationOverLifetimeModule) {
    const shaDat = this._renderer.shaderData;
    if (value) {
      const rotation: RotationVelocityGradient = value.angularVelocity;

      if (!rotation) return;

      const rotationSeparate: boolean = rotation.separateAxes;
      const rotationType = rotation.mode;
      if (value.enable) {
        if (rotationSeparate) {
          shaDat.enableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_SEPARATE);
          shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME);
        } else {
          shaDat.enableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME);
          shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_SEPARATE);
        }
        switch (rotationType) {
          case ParticleCurveMode.Constant:
            shaDat.enableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CONSTANT);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CURVE);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CURVES);
            break;
          case ParticleCurveMode.Curve:
            shaDat.enableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CURVE);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CONSTANT);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CURVES);
            break;
          case ParticleCurveMode.TwoConstants:
            shaDat.enableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CONSTANT);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CURVE);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CURVES);
            break;
          case ParticleCurveMode.TwoCurves:
            shaDat.enableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CURVES);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CONSTANT);
            shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CURVE);
            break;
        }
      } else {
        shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME);
        shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_SEPARATE);
        shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CONSTANT);
        shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CURVE);
        shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS);
        shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CURVES);
      }

      switch (rotationType) {
        case ParticleCurveMode.Constant:
          if (rotationSeparate) {
            shaDat.setVector3(ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_CONST_SEPARATE, rotation.constantSeparate);
          } else {
            shaDat.setFloat(ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_CONST, rotation.constant);
          }
          break;
        case ParticleCurveMode.Curve:
          if (rotationSeparate) {
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTX,
              rotation.gradientX._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTY,
              rotation.gradientY._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTZ,
              rotation.gradientZ._elements
            );
          } else {
            shaDat.setFloatArray(ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENT, rotation.gradient._elements);
          }
          break;
        case ParticleCurveMode.TwoConstants:
          if (rotationSeparate) {
            shaDat.setVector3(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_CONST_SEPARATE,
              rotation.constantMinSeparate
            );
            shaDat.setVector3(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_CONST_MAX_SEPARATE,
              rotation.constantMaxSeparate
            );
          } else {
            shaDat.setFloat(ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_CONST, rotation.constantMin);
            shaDat.setFloat(ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_CONST_MAX, rotation.constantMax);
          }
          break;
        case ParticleCurveMode.TwoCurves:
          if (rotationSeparate) {
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTX,
              rotation.gradientXMin._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTX_MAX,
              rotation.gradientXMax._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTY,
              rotation.gradientYMin._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTY_MAX,
              rotation.gradientYMax._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTZ,
              rotation.gradientZMin._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENTZ_MAX,
              rotation.gradientZMax._elements
            );
          } else {
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENT,
              rotation.gradientMin._elements
            );
            shaDat.setFloatArray(
              ParticleShaderDeclaration.ROL_ANGULAR_VELOCITY_GRADIENT_MAX,
              rotation.gradientMax._elements
            );
          }
          break;
      }
    } else {
      shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME);
      shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME);
      shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CONSTANT);
      shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_CURVE);
      shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CONSTANTS);
      shaDat.disableMacro(ParticleShaderDeclaration.ROTATION_OVER_LIFETIME_RANDOM_CURVES);
    }
    this._rotationOverLifetime = value;
  }

  //------------------- Particle Animation Sheet Field-------------------------//
  /**
   * The TextureSheetAnimationModule of a Particle System.
   */
  get textureSheetAnimation(): TextureSheetAnimationModule {
    return this._textureSheetAnimation;
  }

  set textureSheetAnimation(value: TextureSheetAnimationModule) {
    const shaDat = this._renderer.shaderData;
    if (value) {
      const frameOverTime: FrameOverTime = value.frameOverTime;
      const textureAniType = frameOverTime.mode;
      if (value.enable) {
        switch (textureAniType) {
          case ParticleCurveMode.Curve:
            shaDat.enableMacro(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_CURVE);
            break;
          case ParticleCurveMode.TwoCurves:
            shaDat.enableMacro(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_RANDOM_CURVE);
            break;
        }
      } else {
        shaDat.disableMacro(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_CURVE);
        shaDat.disableMacro(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_RANDOM_CURVE);
      }

      if (textureAniType === ParticleCurveMode.Curve || textureAniType === ParticleCurveMode.TwoCurves) {
        shaDat.setFloat(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_CYCLES, value.cyclesCount);
        const uvLength = this._uvLength;
        uvLength.set(1.0 / value.numTilesX, 1.0 / value.numTilesY);
        shaDat.setVector2(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_SUB_UV_LENGTH, uvLength);
      }
      switch (textureAniType) {
        case ParticleCurveMode.Curve:
          shaDat.setFloatArray(
            ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_GRADIENT_UVS,
            frameOverTime.frameOverTimeData._elements
          );
          break;
        case ParticleCurveMode.TwoCurves:
          shaDat.setFloatArray(
            ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_GRADIENT_UVS,
            frameOverTime.frameOverTimeDataMin._elements
          );
          shaDat.setFloatArray(
            ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_GRADIENT_MAX_UVS,
            frameOverTime.frameOverTimeDataMax._elements
          );
          break;
      }
    } else {
      shaDat.disableMacro(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_CURVE);
      shaDat.disableMacro(ParticleShaderDeclaration.TEXTURE_SHEET_ANIMATION_RANDOM_CURVE);
    }
    this._textureSheetAnimation = value;
  }

  /**
   * Self-defined bounding box
   */
  get customBounds(): BoundingBox {
    return this._customBounds;
  }

  set customBounds(value: BoundingBox) {
    this._useCustomBounds = !!value;
    this._customBounds = value;
  }

  constructor(renderer: ParticleRenderer) {
    super(renderer.engine);
    this._renderer = renderer;

    this.addSubMesh(new SubMesh());
    this.addSubMesh(new SubMesh()); // for special situation.
    this.setVertexBufferBinding(new VertexBufferBinding(null, 0), 0);
    this.setIndexBufferBinding(new IndexBufferBinding(null, IndexFormat.UInt16));
  }

  /**
   * Starts the Particle System.
   */
  play(): void {
    this._burstsIndex = 0;
    this._isEmitting = true;
    this._isPlaying = true;
    this._isPaused = false;
    this._emissionTime = 0;
    this._emissionDistance = 0;
    this._emissionLastPosition.copyFrom(this._renderer.entity.transform.worldPosition);
    this._totalDelayTime = 0;

    if (!this.autoRandomSeed) {
      for (let i: number = 0, n: number = this._randomSeeds.length; i < n; i++)
        this._randomSeeds[i] = this.randomSeed[0] + ParticleMesh._RANDOM_OFFSET[i];
    }

    switch (this.startDelayType) {
      case ParticleCurveMode.Constant:
        this._playStartDelay = this.startDelay;
        break;
      case ParticleCurveMode.Curve:
        if (this.autoRandomSeed) {
          this._playStartDelay = MathUtil.lerp(this.startDelayMin, this.startDelayMax, Math.random());
        } else {
          this._rand.seed = this._randomSeeds[2];
          this._playStartDelay = MathUtil.lerp(this.startDelayMin, this.startDelayMax, this._rand.getFloat());
          this._randomSeeds[2] = this._rand.seed;
        }
        break;
      default:
        throw new Error("Utils3D: startDelayType is invalid.");
    }
    //同步频率模式发射时间,更新函数中小于延迟时间不会更新此时间。
    this._frameRateTime = this._currentTime + this._playStartDelay;
  }

  /**
   * Pauses the system so no new particles are emitted and the existing particles are not updated.
   */
  pause(): void {
    this._isPaused = true;
  }

  /**
   * Fast-forwards the Particle System by simulating particles over the given period of time, then pauses it.
   * @param time - Time period in seconds to advance the ParticleSystem simulation by.
   * @param restart - Restart and start from the beginning.
   */
  simulate(time: number, restart: boolean = true): void {
    this._simulateUpdate = true;

    if (restart) {
      this._updateParticlesSimulationRestart(time);
    } else {
      //如果当前状态为暂停则无法发射粒子
      this._isPaused = false;
      this._updateParticles(time);
    }

    this.pause();
  }

  /**
   * Stops playing the Particle System using the supplied stop behaviour.
   */
  stop(): void {
    this._burstsIndex = 0;
    this._isEmitting = false;
    this._emissionTime = 0;
  }

  /**
   * @internal
   */
  _simulationSupported(): boolean {
    return !(this.simulationSpace == ParticleSimulationSpace.World && this.emission.emissionRateOverDistance > 0);
  }

  /**
   * @internal
   */
  _initBuffer(): void {
    if (this._vertexBuffer) {
      this._vertexBuffer.destroy();
      this._indexBuffer.destroy();
    }
    const { renderMode, engine } = this._renderer;
    if (this.maxParticles > 0) {
      let indices: Uint16Array;
      let i: number;
      let indexOffset: number;
      let perPartOffset: number;
      const mesh = <ModelMesh>this._renderer.mesh;
      if (renderMode == ParticleRenderMode.Mesh && mesh) {
        this._vertexElements = mesh._vertexElements;
        this._vertexElementMap = mesh._vertexElementMap;
        this._setVertexElements(ParticleMesh.VERTEX_ELEMENTS);
        this._floatCountPerVertex = ParticleMesh.VERTEX_STRIDE / 4;
        this._simulationUV_Index = this._vertexElementMap["a_SimulationUV"].offset / 4;
        this._startLifeTimeIndex = 12;
        this._timeIndex = 16;
        this._vertexStride = mesh._vertexBufferBindings[0].buffer.byteLength / mesh._vertexBufferBindings[0].stride;
        const totalVertexCount: number = this._bufferMaxParticles * this._vertexStride;
        const vbCount: number = Math.floor(totalVertexCount / 65535) + 1;
        const lastVBVertexCount: number = totalVertexCount % 65535;
        if (vbCount > 1) {
          throw new Error("ParticleSystem:the maxParticleCount multiply mesh vertexCount is large than 65535.");
        }
        this._vertexBuffer = new Buffer(
          engine,
          BufferBindFlag.VertexBuffer,
          ParticleMesh.VERTEX_STRIDE * lastVBVertexCount,
          BufferUsage.Dynamic
        );
        this._vertexBufferBindings[0]._buffer = this._vertexBuffer;
        this._vertexBufferBindings[0]._stride = ParticleMesh.VERTEX_STRIDE;

        this._indexStride = mesh._indexBufferBinding._buffer.byteLength;
        const indexDatas = mesh.getIndices();
        const indexCount: number = this._bufferMaxParticles * this._indexStride;
        this._indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexCount * 2, BufferUsage.Static);
        indices = new Uint16Array(indexCount);
        indexOffset = 0;
        for (let i = 0; i < this._bufferMaxParticles; i++) {
          const indexValueOffset: number = i * this._vertexStride;
          for (let j = 0, m = indexDatas.length; j < m; j++) indices[indexOffset++] = indexValueOffset + indexDatas[j];
        }
        this._indexBuffer.setData(indices);
        this._indexBufferBinding._buffer = this._indexBuffer;
      } else {
        this._setVertexElements(ParticleMesh.VERTEX_ELEMENTS);
        this._floatCountPerVertex = ParticleMesh.VERTEX_STRIDE / 4;
        this._startLifeTimeIndex = 7;
        this._simulationUV_Index = this._vertexElementMap["a_SimulationUV"].offset / 4;
        this._timeIndex = 11;
        this._vertexStride = 4;
        this._vertices = new Float32Array(this._floatCountPerVertex * this._bufferMaxParticles * this._vertexStride);
        for (i = 0; i < this._bufferMaxParticles; i++) {
          perPartOffset = i * this._floatCountPerVertex * this._vertexStride;
          this._vertices[perPartOffset] = -0.5;
          this._vertices[perPartOffset + 1] = -0.5;
          this._vertices[perPartOffset + 2] = 0;
          this._vertices[perPartOffset + 3] = 1;

          perPartOffset += this._floatCountPerVertex;
          this._vertices[perPartOffset] = 0.5;
          this._vertices[perPartOffset + 1] = -0.5;
          this._vertices[perPartOffset + 2] = 1;
          this._vertices[perPartOffset + 3] = 1;

          perPartOffset += this._floatCountPerVertex;
          this._vertices[perPartOffset] = 0.5;
          this._vertices[perPartOffset + 1] = 0.5;
          this._vertices[perPartOffset + 2] = 1;
          this._vertices[perPartOffset + 3] = 0;

          perPartOffset += this._floatCountPerVertex;
          this._vertices[perPartOffset] = -0.5;
          this._vertices[perPartOffset + 1] = 0.5;
          this._vertices[perPartOffset + 2] = 0;
          this._vertices[perPartOffset + 3] = 0;
        }
        this._vertexBuffer = new Buffer(
          engine,
          BufferBindFlag.VertexBuffer,
          ParticleMesh.VERTEX_STRIDE * this._bufferMaxParticles * this._vertexStride,
          BufferUsage.Dynamic
        );
        this._vertexBufferBindings[0]._buffer = this._vertexBuffer;
        this._vertexBufferBindings[0]._stride = ParticleMesh.VERTEX_STRIDE;

        // index buffer recreation
        this._indexStride = 6;
        indices = new Uint16Array(this._bufferMaxParticles * 6);
        for (i = 0; i < this._bufferMaxParticles; i++) {
          indexOffset = i * 6;
          const firstVertex: number = i * this._vertexStride;
          const secondVertex: number = firstVertex + 2;
          indices[indexOffset++] = firstVertex;
          indices[indexOffset++] = secondVertex;
          indices[indexOffset++] = firstVertex + 1;
          indices[indexOffset++] = firstVertex;
          indices[indexOffset++] = firstVertex + 3;
          indices[indexOffset++] = secondVertex;
        }
        this._indexBuffer = new Buffer(
          engine,
          BufferBindFlag.IndexBuffer,
          this._bufferMaxParticles * 6 * 2,
          BufferUsage.Static
        );
        this._indexBuffer.setData(indices);
        this._indexBufferBinding._buffer = this._indexBuffer;
      }
    }
  }

  /**
   * @internal
   * @param elapsedTime - The time
   */
  _prepareRender(elapsedTime: number) {
    this._updateEmission(elapsedTime);
    //设备丢失时, setData  here
    if (this._firstNewElement != this._firstFreeElement) this._addNewParticlesToVertexBuffer();
    this._drawCounter++;

    const firstSubMesh = this.subMeshes[0];
    const secondSubMesh = this.subMeshes[1];
    firstSubMesh.count = firstSubMesh.start = 0;
    secondSubMesh.count = secondSubMesh.start = 0;

    if (this._firstActiveElement < this._firstFreeElement) {
      firstSubMesh.count = (this._firstFreeElement - this._firstActiveElement) * this._indexStride;
      firstSubMesh.start = this._firstActiveElement * this._indexStride;
    } else {
      firstSubMesh.count = (this._bufferMaxParticles - this._firstActiveElement) * this._indexStride;
      firstSubMesh.start = this._firstActiveElement * this._indexStride;
      if (this._firstFreeElement > 0) {
        secondSubMesh.count = this._firstFreeElement * this._indexStride;
        secondSubMesh.start = 0;
      }
    }
  }

  protected _updateEmission(elapsedTime: number): void {
    if (!this.isAlive) return;
    if (this._simulateUpdate) {
      this._simulateUpdate = false;
    } else {
      elapsedTime = Math.min(ParticleMesh._maxElapsedTime, elapsedTime * this.simulationSpeed);
      this._updateParticles(elapsedTime);
    }
  }

  protected _updateParticles(elapsedTime: number): void {
    if (this._renderer.renderMode === ParticleRenderMode.Mesh && !this._renderer.mesh) return;

    this._currentTime += elapsedTime;
    this._retireActiveParticles();
    this._freeRetiredParticles();

    this._totalDelayTime += elapsedTime;
    if (this._totalDelayTime < this._playStartDelay) {
      return;
    }

    if (this._emission.enable && this._isEmitting && !this._isPaused) {
      this._advanceTime(elapsedTime, this._currentTime);
      if (this.emission.emissionRateOverDistance > 0) {
        this._advanceDistance(this._currentTime);
      }
    }
  }

  protected _advanceTime(elapsedTime: number, emitTime: number): void {
    let i: number;
    const lastEmissionTime: number = this._emissionTime;
    this._emissionTime += elapsedTime;
    let totalEmitCount: number = 0;
    if (this._emissionTime > this.duration) {
      if (this.looping) {
        //使用_emissionTime代替duration，否则无法触发time等于duration的burst //爆裂剩余未触发的
        totalEmitCount += this._burst(lastEmissionTime, this._emissionTime);
        this._emissionTime -= this.duration;
        this._burstsIndex = 0;
        totalEmitCount += this._burst(0, this._emissionTime);
      } else {
        totalEmitCount = Math.min(this.maxParticles - this.aliveParticleCount, totalEmitCount);
        for (i = 0; i < totalEmitCount; i++) this._emit(emitTime);

        this._isPlaying = false;
        this.stop();
        return;
      }
    } else {
      totalEmitCount += this._burst(lastEmissionTime, this._emissionTime);
    }
    //粒子的增加数量，不能超过maxParticles
    totalEmitCount = Math.min(this.maxParticles - this.aliveParticleCount, totalEmitCount);
    for (i = 0; i < totalEmitCount; i++) this._emit(emitTime);
    //粒子发射速率
    const emissionRate: number = this.emission.emissionRate;
    if (emissionRate > 0) {
      //每多少秒发射一个粒子
      const minEmissionTime: number = 1 / emissionRate;
      this._frameRateTime += minEmissionTime;
      //大于最大声明周期的粒子一定会死亡，所以直接略过
      this._frameRateTime = this._currentTime - ((this._currentTime - this._frameRateTime) % this._maxStartLifetime);
      while (this._frameRateTime <= emitTime) {
        if (this._emit(this._frameRateTime)) this._frameRateTime += minEmissionTime;
        else break;
      }
      this._frameRateTime = Math.floor(emitTime / minEmissionTime) * minEmissionTime;
    }
  }

  protected _advanceDistance(emitTime: number): void {
    const position = this._renderer.entity.transform.worldPosition;
    const offsetDistance = Vector3.distance(position, this._emissionLastPosition);
    const rateOverDistance = this.emission.emissionRateOverDistance;
    const distance = this._emissionDistance + offsetDistance;

    const ed = 1.0 / rateOverDistance;
    if (distance > ed) {
      let emitCount = distance * rateOverDistance;
      emitCount = Math.floor(emitCount);
      emitCount = Math.min(this.maxParticles - this.aliveParticleCount, emitCount);
      for (let index = 0; index < emitCount; index++) {
        this._emit(emitTime);
      }
      this._emissionDistance = 0;
    } else {
      this._emissionDistance = distance;
    }

    this._emissionLastPosition.copyFrom(position);
  }

  protected _burst(fromTime: number, toTime: number): number {
    let totalEmitCount: number = 0;
    const bursts = this._emission.bursts;
    for (const n: number = bursts.length; this._burstsIndex < n; this._burstsIndex++) {
      const burst: Burst = bursts[this._burstsIndex];
      const burstTime: number = burst.time;
      if (fromTime <= burstTime && burstTime < toTime) {
        let emitCount: number;
        if (this.autoRandomSeed) {
          emitCount = MathUtil.lerp(burst.minCount, burst.maxCount, Math.random());
        } else {
          this._rand.seed = this._randomSeeds[0];
          emitCount = MathUtil.lerp(burst.minCount, burst.maxCount, this._rand.getFloat());
          this._randomSeeds[0] = this._rand.seed;
        }
        totalEmitCount += emitCount;
      } else {
        break;
      }
    }
    return totalEmitCount;
  }

  protected _retireActiveParticles(): void {
    const epsilon: number = 0.0001;
    while (this._firstActiveElement != this._firstNewElement) {
      const index: number = this._firstActiveElement * this._floatCountPerVertex * this._vertexStride;
      const timeIndex: number = index + this._timeIndex;

      const particleAge: number = this._currentTime - this._vertices[timeIndex];
      //7为真实lifeTime,particleAge>0为生命周期为负时
      if (particleAge + epsilon < this._vertices[index + this._startLifeTimeIndex]) break;

      this._vertices[timeIndex] = this._drawCounter;
      this._firstActiveElement++;
      if (this._firstActiveElement >= this._bufferMaxParticles) this._firstActiveElement = 0;
    }
  }

  protected _freeRetiredParticles(): void {
    while (this._firstRetiredElement != this._firstActiveElement) {
      const age: number =
        this._drawCounter -
        this._vertices[this._firstRetiredElement * this._floatCountPerVertex * this._vertexStride + this._timeIndex]; //11为Time
      //GPU从不滞后于CPU两帧，出于显卡驱动BUG等安全因素考虑滞后三帧
      if (age < 3) break;

      this._firstRetiredElement++;
      if (this._firstRetiredElement >= this._bufferMaxParticles) this._firstRetiredElement = 0;
    }
  }

  protected _emit(time: number): boolean {
    const position: Vector3 = ParticleMesh._tempPosition;
    const direction: Vector3 = ParticleMesh._tempDirection;
    if (this._shape && this._shape.enable) {
      if (this.autoRandomSeed) this._shape._generatePositionAndDirection(position, direction);
      else this._shape._generatePositionAndDirection(position, direction, this._rand, this._randomSeeds);
    } else {
      position.x = position.y = position.z = 0;
      direction.x = 0;
      direction.y = 0;
      direction.z = -1;
    }

    return this._addParticle(position, direction, time);
  }

  protected _addParticle(position: Vector3, direction: Vector3, time: number): boolean {
    Vector3.normalize(direction, direction);
    //下一个粒子
    let nextFreeParticle: number = this._firstFreeElement + 1;
    if (nextFreeParticle >= this._bufferMaxParticles) nextFreeParticle = 0;

    if (nextFreeParticle === this._firstRetiredElement) return false;

    const transform = this._renderer.entity.transform;
    ParticleData.create(this._renderer);

    const particleAge: number = this._currentTime - time;
    //如果时间已大于声明周期，则直接跳过
    if (particleAge >= ParticleData.startLifeTime) return true;

    let pos: Vector3, rot: Quaternion;
    if (this.simulationSpace == ParticleSimulationSpace.World) {
      pos = transform.worldPosition;
      rot = transform.worldRotationQuaternion;
    }

    //StartSpeed
    let startSpeed: number;
    switch (this.startSpeedType) {
      case ParticleCurveMode.Constant:
        startSpeed = this.startSpeedConstant;
        break;
      case ParticleCurveMode.TwoConstants:
        if (this.autoRandomSeed) {
          startSpeed = MathUtil.lerp(this.startSpeedConstantMin, this.startSpeedConstantMax, Math.random());
        } else {
          this._rand.seed = this._randomSeeds[8];
          startSpeed = MathUtil.lerp(this.startSpeedConstantMin, this.startSpeedConstantMax, this._rand.getFloat());
          this._randomSeeds[8] = this._rand.seed;
        }
        break;
    }

    let randomVelocityX: number,
      randomVelocityY: number,
      randomVelocityZ: number,
      randomColor: number,
      randomSize: number,
      randomRotation: number,
      randomTextureAnimation: number;
    let needRandomVelocity: boolean = this._velocityOverLifetime && this._velocityOverLifetime.enable;
    if (needRandomVelocity) {
      const velocityType = this._velocityOverLifetime.velocity.mode;
      if (velocityType === ParticleCurveMode.TwoConstants || velocityType === ParticleCurveMode.TwoCurves) {
        if (this.autoRandomSeed) {
          randomVelocityX = Math.random();
          randomVelocityY = Math.random();
          randomVelocityZ = Math.random();
        } else {
          this._rand.seed = this._randomSeeds[9];
          randomVelocityX = this._rand.getFloat();
          randomVelocityY = this._rand.getFloat();
          randomVelocityZ = this._rand.getFloat();
          this._randomSeeds[9] = this._rand.seed;
        }
      } else {
        needRandomVelocity = false;
      }
    } else {
      needRandomVelocity = false;
    }
    let needRandomColor: boolean = this._colorOverLifetime && this._colorOverLifetime.enable;
    if (needRandomColor) {
      const colorType = this._colorOverLifetime.color.mode;
      if (colorType === ParticleGradientMode.TwoGradients) {
        if (this.autoRandomSeed) {
          randomColor = Math.random();
        } else {
          this._rand.seed = this._randomSeeds[10];
          randomColor = this._rand.getFloat();
          this._randomSeeds[10] = this._rand.seed;
        }
      } else {
        needRandomColor = false;
      }
    } else {
      needRandomColor = false;
    }
    let needRandomSize: boolean = this._sizeOverLifetime && this._sizeOverLifetime.enable;
    if (needRandomSize) {
      const sizeType = this._sizeOverLifetime.size.mode;
      if (sizeType === ParticleCurveMode.TwoCurves) {
        if (this.autoRandomSeed) {
          randomSize = Math.random();
        } else {
          this._rand.seed = this._randomSeeds[11];
          randomSize = this._rand.getFloat();
          this._randomSeeds[11] = this._rand.seed;
        }
      } else {
        needRandomSize = false;
      }
    } else {
      needRandomSize = false;
    }
    let needRandomRotation: boolean = this._rotationOverLifetime && this._rotationOverLifetime.enable;
    if (needRandomRotation) {
      const rotationType = this._rotationOverLifetime.angularVelocity.mode;
      if (rotationType === ParticleCurveMode.TwoConstants || rotationType === ParticleCurveMode.TwoCurves) {
        if (this.autoRandomSeed) {
          randomRotation = Math.random();
        } else {
          this._rand.seed = this._randomSeeds[12];
          randomRotation = this._rand.getFloat();
          this._randomSeeds[12] = this._rand.seed;
        }
      } else {
        needRandomRotation = false;
      }
    } else {
      needRandomRotation = false;
    }
    let needRandomTextureAnimation: boolean = this._textureSheetAnimation && this._textureSheetAnimation.enable;
    if (needRandomTextureAnimation) {
      const textureAnimationType: number = this._textureSheetAnimation.frameOverTime.mode;
      if (textureAnimationType === 3) {
        if (this.autoRandomSeed) {
          randomTextureAnimation = Math.random();
        } else {
          this._rand.seed = this._randomSeeds[15];
          randomTextureAnimation = this._rand.getFloat();
          this._randomSeeds[15] = this._rand.seed;
        }
      } else {
        needRandomTextureAnimation = false;
      }
    } else {
      needRandomTextureAnimation = false;
    }

    const startIndex: number = this._firstFreeElement * this._floatCountPerVertex * this._vertexStride;
    const subU: number = ParticleData.startUVInfo.x;
    const subV: number = ParticleData.startUVInfo.y;
    const startU: number = ParticleData.startUVInfo.z;
    const startV: number = ParticleData.startUVInfo.w;

    let meshVertices: Float32Array,
      meshVertexStride: number,
      meshPosOffset: number,
      meshCorOffset: number,
      meshUVOffset: number,
      meshVertexIndex: number;
    const render = this._renderer;
    if (render.renderMode === ParticleRenderMode.Mesh) {
      const meshVB = <ModelMesh>render.mesh;
      const vertexBufferBinding = meshVB._vertexBufferBindings[0];
      meshVertices = new Float32Array(vertexBufferBinding.buffer.byteLength / 4);
      vertexBufferBinding.buffer.getData(meshVertices);
      const meshVertexDeclaration = meshVB._vertexElementMap;
      meshPosOffset = meshVertexDeclaration["POSITION"].offset / 4;
      const colorElement: VertexElement = meshVertexDeclaration["COLOR_0"];
      meshCorOffset = colorElement ? colorElement.offset / 4 : -1;
      const uvElement: VertexElement = meshVertexDeclaration["TEXCOORD_0"];
      meshUVOffset = uvElement ? uvElement.offset / 4 : -1;
      meshVertexStride = vertexBufferBinding.stride / 4;
      meshVertexIndex = 0;
    }

    for (
      let i = startIndex, n = startIndex + this._floatCountPerVertex * this._vertexStride;
      i < n;
      i += this._floatCountPerVertex
    ) {
      let offset: number;
      if (render.renderMode === ParticleRenderMode.Mesh) {
        offset = i;
        const vertexOffset = meshVertexStride * meshVertexIndex++;
        let meshOffset = vertexOffset + meshPosOffset;
        this._vertices[offset++] = meshVertices[meshOffset++];
        this._vertices[offset++] = meshVertices[meshOffset++];
        this._vertices[offset++] = meshVertices[meshOffset];
        if (meshCorOffset === -1) {
          this._vertices[offset++] = 1.0;
          this._vertices[offset++] = 1.0;
          this._vertices[offset++] = 1.0;
          this._vertices[offset++] = 1.0;
        } else {
          meshOffset = vertexOffset + meshCorOffset;
          this._vertices[offset++] = meshVertices[meshOffset++];
          this._vertices[offset++] = meshVertices[meshOffset++];
          this._vertices[offset++] = meshVertices[meshOffset++];
          this._vertices[offset++] = meshVertices[meshOffset];
        }
        if (meshUVOffset === -1) {
          this._vertices[offset++] = 0.0;
          this._vertices[offset++] = 0.0;
        } else {
          meshOffset = vertexOffset + meshUVOffset;
          this._vertices[offset++] = meshVertices[meshOffset++];
          this._vertices[offset++] = meshVertices[meshOffset];
        }
      } else {
        offset = i + 4;
      }

      this._vertices[offset++] = position.x;
      this._vertices[offset++] = position.y;
      this._vertices[offset++] = position.z;

      this._vertices[offset++] = ParticleData.startLifeTime;

      this._vertices[offset++] = direction.x;
      this._vertices[offset++] = direction.y;
      this._vertices[offset++] = direction.z;
      this._vertices[offset++] = time;

      this._vertices[offset++] = ParticleData.startColor.r;
      this._vertices[offset++] = ParticleData.startColor.g;
      this._vertices[offset++] = ParticleData.startColor.b;
      this._vertices[offset++] = ParticleData.startColor.a;

      this._vertices[offset++] = ParticleData.startSize.x;
      this._vertices[offset++] = ParticleData.startSize.y;
      this._vertices[offset++] = ParticleData.startSize.z;

      this._vertices[offset++] = ParticleData.startRotation.x;
      this._vertices[offset++] = ParticleData.startRotation.y;
      this._vertices[offset++] = ParticleData.startRotation.z;

      //StartSpeed
      this._vertices[offset++] = startSpeed;

      //this._vertices[offset] = Math.random();

      needRandomColor && (this._vertices[offset + 1] = randomColor);
      needRandomSize && (this._vertices[offset + 2] = randomSize);
      needRandomRotation && (this._vertices[offset + 3] = randomRotation);
      needRandomTextureAnimation && (this._vertices[offset + 4] = randomTextureAnimation);
      if (needRandomVelocity) {
        this._vertices[offset + 5] = randomVelocityX;
        this._vertices[offset + 6] = randomVelocityY;
        this._vertices[offset + 7] = randomVelocityZ;
      }

      switch (this.simulationSpace) {
        case ParticleSimulationSpace.World:
          offset += 8;
          this._vertices[offset++] = pos.x;
          this._vertices[offset++] = pos.y;
          this._vertices[offset++] = pos.z;
          this._vertices[offset++] = rot.x;
          this._vertices[offset++] = rot.y;
          this._vertices[offset++] = rot.z;
          this._vertices[offset++] = rot.w;
          break;
        case ParticleSimulationSpace.Local:
          break;
      }
      offset = i + this._simulationUV_Index;
      this._vertices[offset++] = startU;
      this._vertices[offset++] = startV;
      this._vertices[offset++] = subU;
      this._vertices[offset] = subV;
    }

    this._firstFreeElement = nextFreeParticle;
    return true;
  }

  protected _addNewParticlesToVertexBuffer(): void {
    let start: number;
    const byteStride = this._vertexStride * this._floatCountPerVertex * 4;
    if (this._firstNewElement < this._firstFreeElement) {
      start = this._firstNewElement * byteStride;
      this._vertexBuffer.setData(
        this._vertices.buffer,
        start,
        start,
        (this._firstFreeElement - this._firstNewElement) * byteStride
      );
    } else {
      start = this._firstNewElement * byteStride;
      this._vertexBuffer.setData(
        this._vertices.buffer,
        start,
        start,
        (this._bufferMaxParticles - this._firstNewElement) * byteStride
      );

      if (this._firstFreeElement > 0) {
        this._vertexBuffer.setData(this._vertices.buffer, 0, 0, this._firstFreeElement * byteStride);
      }
    }
    this._firstNewElement = this._firstFreeElement;
  }

  protected _updateParticlesSimulationRestart(time: number): void {
    this._firstActiveElement = 0;
    this._firstNewElement = 0;
    this._firstFreeElement = 0;
    this._firstRetiredElement = 0;

    this._burstsIndex = 0;
    this._frameRateTime = time;
    this._emissionTime = 0;
    this._emissionDistance = 0;
    this._totalDelayTime = 0;
    this._currentTime = time;

    const delayTime = time;
    if (delayTime < this._playStartDelay) {
      this._totalDelayTime = delayTime;
      return;
    }

    if (this._emission.enable) {
      this._advanceTime(time, time);
      if (this.emission.emissionRateOverDistance > 0) {
        this._advanceDistance(this._currentTime);
      }
    }
  }

  /**
   * @internal
   */
  override _onDestroy(): void {
    if (this._vertexBuffer) {
      this._vertexBuffer.destroy();
      this._vertexBuffer = null;
    }
    if (this._indexBuffer) {
      this._indexBuffer.destroy();
      this._indexBuffer = null;
    }
    this._emission.clearBurst();
    this._boundingBox = null;
    this._boundingSphere = null;
    this._boundingBoxCorners = null;
    this._customBounds = null;
    this._renderer = null;
    this._vertices = null;
    this._emission = null;
    this._shape = null;
    this.startLifeTimeGradient = null;
    this.startLifeTimeGradientMin = null;
    this.startLifeTimeGradientMax = null;
    this.startSizeConstantSeparate = null;
    this.startSizeConstantMinSeparate = null;
    this.startSizeConstantMaxSeparate = null;
    this.startRotationConstantSeparate = null;
    this.startRotationConstantMinSeparate = null;
    this.startRotationConstantMaxSeparate = null;
    this.startColorConstant = null;
    this.startColorConstantMin = null;
    this.startColorConstantMax = null;
    this._velocityOverLifetime = null;
    this._colorOverLifetime = null;
    this._sizeOverLifetime = null;
    this._rotationOverLifetime = null;
    this._textureSheetAnimation = null;
  }

  /**
   * @internal
   */
  _generateBoundingSphere(): void {
    const centerE: Vector3 = this._boundingSphere.center;
    centerE.x = 0;
    centerE.y = 0;
    centerE.z = 0;
    this._boundingSphere.radius = Number.MAX_VALUE;
  }

  /**
   * @internal
   */
  _generateBounds(): void {
    const particleRender = this._renderer;
    const { min: boundsMin, max: boundsMax } = this.bounds;

    // lifeTime
    let time: number = 0;
    switch (this.startLifetimeType) {
      case ParticleCurveMode.Constant:
        time = this._startLifetimeConstant;
        break;
      case ParticleCurveMode.TwoConstants:
        time = this._startLifetimeConstantMax;
        break;
      case ParticleCurveMode.Curve:
      case ParticleCurveMode.TwoCurves:
      default:
        break;
    }

    // speed
    let speedOrigin: number = 0;
    switch (this.startSpeedType) {
      case ParticleCurveMode.Constant:
        speedOrigin = this.startSpeedConstant;
        break;
      case ParticleCurveMode.TwoConstants:
        speedOrigin = this.startSpeedConstantMax;
        break;
      case ParticleCurveMode.Curve:
      case ParticleCurveMode.TwoCurves:
      default:
        break;
    }

    // size
    let maxSizeScale = 0;
    if (this.startSize3D) {
      switch (this.startSizeType) {
        case ParticleCurveMode.Constant:
          maxSizeScale = Math.max(
            this.startSizeConstantSeparate.x,
            this.startSizeConstantSeparate.y,
            this.startSizeConstantSeparate.z
          );
          break;
        case ParticleCurveMode.TwoConstants:
          maxSizeScale = Math.max(
            this.startSizeConstantMaxSeparate.x,
            this.startSizeConstantMaxSeparate.y,
            this.startSizeConstantMaxSeparate.z
          );
          break;
        case ParticleCurveMode.Curve:
        case ParticleCurveMode.TwoCurves:
        default:
          break;
      }
    } else {
      switch (this.startSizeType) {
        case ParticleCurveMode.Constant:
          maxSizeScale = this.startSizeConstant;
          break;
        case ParticleCurveMode.TwoConstants:
          maxSizeScale = this.startSizeConstantMax;
          break;
        case ParticleCurveMode.Curve:
        case ParticleCurveMode.TwoCurves:
        default:
          break;
      }
    }

    // shape
    const zDirectionSpeed: Vector3 = ParticleMesh._tempVector30;
    const fDirectionSpeed: Vector3 = ParticleMesh._tempVector31;
    const zEmissionOffsetXYZ: Vector3 = ParticleMesh._tempVector32;
    const fEmissionOffsetXYZ: Vector3 = ParticleMesh._tempVector33;

    zDirectionSpeed.set(0, 0, 1);
    fDirectionSpeed.set(0, 0, 0);
    zEmissionOffsetXYZ.set(0, 0, 0);
    fEmissionOffsetXYZ.set(0, 0, 0);

    if (this.shape && this.shape.enable) {
      switch (this.shape.shapeType) {
        case ParticleShapeType.Sphere:
          const sphere: SphereShape = <SphereShape>this.shape;
          zDirectionSpeed.set(1, 1, 1);
          fDirectionSpeed.set(1, 1, 1);
          zEmissionOffsetXYZ.set(sphere.radius, sphere.radius, sphere.radius);
          fEmissionOffsetXYZ.set(sphere.radius, sphere.radius, sphere.radius);
          break;
        case ParticleShapeType.Hemisphere:
          const hemisphere: HemisphereShape = <HemisphereShape>this.shape;
          zDirectionSpeed.set(1, 1, 1);
          fDirectionSpeed.set(1, 1, 1);
          zEmissionOffsetXYZ.set(hemisphere.radius, hemisphere.radius, hemisphere.radius);
          fEmissionOffsetXYZ.set(hemisphere.radius, hemisphere.radius, 0.0);
          break;
        case ParticleShapeType.Cone:
          const cone: ConeShape = <ConeShape>this.shape;
          // Base || BaseShell
          if (cone.emitType == 0 || cone.emitType == 1) {
            // const angle: number = cone.angle * Math.PI / 180;
            const angle: number = cone.angle;
            const sinAngle: number = Math.sin(angle);
            zDirectionSpeed.set(sinAngle, sinAngle, 1.0);
            fDirectionSpeed.set(sinAngle, sinAngle, 0.0);
            zEmissionOffsetXYZ.set(cone.radius, cone.radius, 0.0);
            fEmissionOffsetXYZ.set(cone.radius, cone.radius, 0.0);
            break;
          }
          // Volume || VolumeShell
          else if (cone.emitType == 2 || cone.emitType == 3) {
            // const angle: number = cone.angle * Math.PI / 180;
            const angle: number = cone.angle;
            const sinAngle: number = Math.sin(angle);
            const coneLength: number = cone.length;
            zDirectionSpeed.set(sinAngle, sinAngle, 1.0);
            fDirectionSpeed.set(sinAngle, sinAngle, 0.0);
            const tanAngle: number = Math.tan(angle);
            const rPLCT: number = cone.radius + coneLength * tanAngle;
            zEmissionOffsetXYZ.set(rPLCT, rPLCT, coneLength);
            fEmissionOffsetXYZ.set(rPLCT, rPLCT, 0.0);
          }
          break;
        case ParticleShapeType.Box:
          const box: BoxShape = <BoxShape>this.shape;
          if (this.shape.randomDirectionAmount != 0) {
            zDirectionSpeed.set(1, 1, 1);
            fDirectionSpeed.set(1, 1, 1);
          }
          Vector3.scale(box.size, 0.5, zEmissionOffsetXYZ);
          Vector3.scale(box.size, 0.5, fEmissionOffsetXYZ);
          break;
        case ParticleShapeType.Circle:
          const circle: CircleShape = <CircleShape>this.shape;
          zDirectionSpeed.set(1, 1, 1);
          fDirectionSpeed.set(1, 1, 1);
          zEmissionOffsetXYZ.set(circle.radius, circle.radius, 0);
          fEmissionOffsetXYZ.set(circle.radius, circle.radius, 0);
          break;
        default:
          break;
      }
    }

    // size
    let meshSize: number = 0;
    // 是否是 mesh 模式
    const meshMode: boolean = particleRender.renderMode == ParticleRenderMode.Mesh;
    switch (particleRender.renderMode) {
      case ParticleRenderMode.Billboard:
      case ParticleRenderMode.Stretch:
      case ParticleRenderMode.HorizontalBillboard:
      case ParticleRenderMode.VerticalBillboard:
        meshSize = ParticleMesh.halfKSqrtOf2; // Math.sqrt(2) / 2.0;
        break;
      case ParticleRenderMode.Mesh: // mesh
        const extent: Vector3 = ParticleMesh._tempVector36;
        const meshBounds: BoundingBox = particleRender.mesh.bounds;
        meshBounds.getExtent(extent);
        meshSize = extent.length();
        break;
      default:
        break;
    }

    const endSizeOffset: Vector3 = ParticleMesh._tempVector36;
    endSizeOffset.set(1, 1, 1);
    if (this.sizeOverLifetime && this.sizeOverLifetime.enable) {
      const gradientSize: SizeGradient = this.sizeOverLifetime.size;
      const maxSize: number = gradientSize.getMaxSizeInGradient(meshMode);

      endSizeOffset.set(maxSize, maxSize, maxSize);
    }

    const offsetSize: number = meshSize * maxSizeScale;
    Vector3.scale(endSizeOffset, offsetSize, endSizeOffset);

    // const distance: number = speedOrigin * time;
    const speedZOffset: Vector3 = ParticleMesh._tempVector34;
    const speedFOffset: Vector3 = ParticleMesh._tempVector35;

    if (speedOrigin > 0) {
      Vector3.scale(zDirectionSpeed, speedOrigin, speedZOffset);
      Vector3.scale(fDirectionSpeed, speedOrigin, speedFOffset);
    } else {
      Vector3.scale(zDirectionSpeed, -speedOrigin, speedFOffset);
      Vector3.scale(fDirectionSpeed, -speedOrigin, speedZOffset);
    }

    if (this.velocityOverLifetime && this.velocityOverLifetime.enable) {
      const gradientVelocity: VelocityGradient = this.velocityOverLifetime.velocity;
      const velocitySpeedOffset: Vector3 = ParticleMesh._tempVector37;
      velocitySpeedOffset.set(0, 0, 0);
      switch (gradientVelocity.mode) {
        case ParticleCurveMode.Constant:
          velocitySpeedOffset.copyFrom(gradientVelocity.constant);
          break;
        case ParticleCurveMode.TwoConstants:
          velocitySpeedOffset.copyFrom(gradientVelocity.constantMax);
          break;
        case ParticleCurveMode.Curve:
          const curveX: number = gradientVelocity.gradientX.getAverageValue();
          const curveY: number = gradientVelocity.gradientY.getAverageValue();
          const curveZ: number = gradientVelocity.gradientZ.getAverageValue();
          velocitySpeedOffset.set(curveX, curveY, curveZ);
          break;
        case ParticleCurveMode.TwoCurves:
          const xMax: number = gradientVelocity.gradientXMax.getAverageValue();
          const yMax: number = gradientVelocity.gradientYMax.getAverageValue();
          const zMax: number = gradientVelocity.gradientZMax.getAverageValue();
          velocitySpeedOffset.set(xMax, yMax, zMax);
          break;
        default:
          break;
      }

      // 速度空间 world
      if (this.velocityOverLifetime.space == 1) {
        Vector3.transformToVec3(velocitySpeedOffset, this._renderer.entity.transform.worldMatrix, velocitySpeedOffset);
      }

      Vector3.add(speedZOffset, velocitySpeedOffset, speedZOffset);
      Vector3.subtract(speedFOffset, velocitySpeedOffset, speedFOffset);

      speedZOffset.x = Math.max(speedZOffset.x, 0);
      speedZOffset.y = Math.max(speedZOffset.y, 0);
      speedZOffset.z = Math.max(speedZOffset.z, 0);

      speedFOffset.x = Math.max(speedFOffset.x, 0);
      speedFOffset.y = Math.max(speedFOffset.y, 0);
      speedFOffset.z = Math.max(speedFOffset.z, 0);
    }

    Vector3.scale(speedZOffset, time, speedZOffset);
    Vector3.scale(speedFOffset, time, speedFOffset);

    //gravity重力值
    const gravity: number = this.gravityModifier;
    if (gravity != 0) {
      // 记录重力影响偏移
      const gravityOffset: number = 0.5 * ParticleMesh.g * gravity * time * time;

      let speedZOffsetY = speedZOffset.y - gravityOffset;
      let speedFOffsetY = speedFOffset.y + gravityOffset;

      speedZOffsetY = speedZOffsetY > 0 ? speedZOffsetY : 0;
      speedFOffsetY = speedFOffsetY > 0 ? speedFOffsetY : 0;

      this._gravityOffset.set(speedZOffset.y - speedZOffsetY, speedFOffsetY - speedFOffset.y);
    }

    // speedOrigin * directionSpeed * time + directionOffset + size * maxsizeScale
    Vector3.add(speedZOffset, endSizeOffset, boundsMax);
    Vector3.add(boundsMax, zEmissionOffsetXYZ, boundsMax);

    Vector3.add(speedFOffset, endSizeOffset, boundsMin);
    Vector3.add(boundsMin, fEmissionOffsetXYZ, boundsMin);
    Vector3.scale(boundsMin, -1, boundsMin);
  }
}
