import { DataObject } from "../base/DataObject";
import { BoundingBox, Color, MathUtil, Matrix, Quaternion, Vector2, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
import { Buffer } from "../graphic/Buffer";
import type { ElementRangeMapping } from "../graphic/ElementRangeMapping";
import { Primitive } from "../graphic/Primitive";
import { SubMesh } from "../graphic/SubMesh";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
import { MeshRenderer, VertexAttribute } from "../mesh";
import type { ShaderData } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleBufferUtils } from "./ParticleBufferUtils";
import { ParticleRenderer, ParticleUpdateFlags } from "./ParticleRenderer";
import { ParticleSubEmitterSpawnState } from "./ParticleSubEmitterSpawnState";
import { ParticleTransformFeedbackSimulator } from "./ParticleTransformFeedbackSimulator";
import { ParticleCurveMode } from "./enums/ParticleCurveMode";
import { ParticleGradientMode } from "./enums/ParticleGradientMode";
import { ParticleInheritVelocityMode } from "./enums/ParticleInheritVelocityMode";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ParticleStopMode } from "./enums/ParticleStopMode";
import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import { ParticleSubEmitterInheritProperty } from "./enums/ParticleSubEmitterInheritProperty";
import { ColorOverLifetimeModule } from "./modules/ColorOverLifetimeModule";
import { CustomDataModule } from "./modules/CustomDataModule";
import { EmissionModule } from "./modules/EmissionModule";
import { InheritVelocityModule } from "./modules/InheritVelocityModule";
import { ForceOverLifetimeModule } from "./modules/ForceOverLifetimeModule";
import { LimitVelocityOverLifetimeModule } from "./modules/LimitVelocityOverLifetimeModule";
import { MainModule } from "./modules/MainModule";
import { ParticleCompositeCurve } from "./modules/ParticleCompositeCurve";
import { RotationOverLifetimeModule } from "./modules/RotationOverLifetimeModule";
import { SizeOverLifetimeModule } from "./modules/SizeOverLifetimeModule";
import { TextureSheetAnimationModule } from "./modules/TextureSheetAnimationModule";
import { NoiseModule } from "./modules/NoiseModule";
import { VelocityOverLifetimeModule } from "./modules/VelocityOverLifetimeModule";
import { SubEmittersModule, type ParticleSubEmitterCommand } from "./modules/SubEmittersModule";
import type { BirthSubEmitterCommand } from "./modules/BirthSubEmitterCommand";

/**
 * Particle Generator.
 */
export class ParticleGenerator extends DataObject implements ICloneHook<ParticleGenerator> {
  private static readonly _tempVector20 = new Vector2();
  private static readonly _tempVector21 = new Vector2();
  private static readonly _tempVector22 = new Vector2();
  private static readonly _tempVector30 = new Vector3();
  private static readonly _tempVector31 = new Vector3();
  private static readonly _tempVector32 = new Vector3();
  private static readonly _tempVector33 = new Vector3();
  private static readonly _tempVector34 = new Vector3();
  private static readonly _tempMat = new Matrix();
  private static readonly _tempColor = new Color();
  private static readonly _tempQuat0 = new Quaternion();
  private static readonly _tempEmissionBounds = new BoundingBox();
  private static readonly _tempEmissionBounds1 = new BoundingBox();
  private static readonly _tempParticleRenderers = new Array<ParticleRenderer>();
  private static readonly _tempEmissionBoundsRecord = new Float32Array(ParticleBufferUtils.boundsFloatStride);
  private static readonly _vertexBufferBindingScratch: VertexBufferBinding[] = [];
  private static readonly _eventColor = new Color();
  private static readonly _eventSize = new Vector3();
  private static readonly _eventRotation = new Vector3();

  private static readonly _particleIncreaseCount = 128;
  private static readonly _emissionBoundsIncreaseCount = 16;
  // Negative value distinguishes velocity already baked into particle state from shader-evaluated Initial curves
  private static readonly _bakedInitialVelocityFactor = -1;
  private static readonly _transformFeedbackMacro = ShaderMacro.getByName("RENDERER_TRANSFORM_FEEDBACK");
  private static readonly _trajectoryFeedbackMacro = ShaderMacro.getByName("RENDERER_TRAJECTORY_FEEDBACK");
  private static readonly _hasSubEmitterSpawnedParticlesMacro = ShaderMacro.getByName(
    "RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES"
  );
  private static readonly _currentTimeProperty = ShaderProperty.getByName("renderer_CurrentTime");
  private static readonly _particleValueInheritanceMask =
    ParticleSubEmitterInheritProperty.Color |
    ParticleSubEmitterInheritProperty.Size |
    ParticleSubEmitterInheritProperty.Rotation;

  /** Use auto random seed. */
  useAutoRandomSeed = true;

  /** Main module. */
  readonly main: MainModule;
  /** Emission module. */
  readonly emission = new EmissionModule(this);
  /** Velocity over lifetime module. */
  readonly velocityOverLifetime: VelocityOverLifetimeModule;
  /** Force over lifetime module. */
  readonly forceOverLifetime: ForceOverLifetimeModule;
  /** Limit velocity over lifetime module. */
  readonly limitVelocityOverLifetime: LimitVelocityOverLifetimeModule;
  /** Size over lifetime module. */
  readonly sizeOverLifetime: SizeOverLifetimeModule;
  /** Rotation over lifetime module. */
  readonly rotationOverLifetime = new RotationOverLifetimeModule(this);
  /** Color over lifetime module. */
  readonly colorOverLifetime = new ColorOverLifetimeModule(this);
  /** Texture sheet animation module. */
  readonly textureSheetAnimation = new TextureSheetAnimationModule(this);
  /** Noise module. */
  readonly noise: NoiseModule;
  /** Inherit velocity module. */
  readonly inheritVelocity: InheritVelocityModule;
  /** Sub emitters module. */
  readonly subEmitters: SubEmittersModule;
  /** Custom data module. */
  readonly customData: CustomDataModule;

  /** @internal */
  @ignoreClone
  _currentParticleCount = 0;
  /** @internal */
  @ignoreClone
  _playTime = 0;

  /** @internal */
  @ignoreClone
  _firstNewElement = 0;
  /** @internal */
  @ignoreClone
  _firstActiveElement = 0;
  /** @internal */
  @ignoreClone
  _firstFreeElement = 0;
  /** @internal */
  @ignoreClone
  _firstRetiredElement = 0;
  /** @internal */
  @ignoreClone
  readonly _primitive: Primitive;
  /** @internal */
  @ignoreClone
  readonly _subPrimitive = new SubMesh(0, 0, MeshTopology.Triangles);
  /** @internal */
  readonly _renderer: ParticleRenderer;
  /** @internal */
  @ignoreClone
  readonly _incomingSubEmitterCommands: ParticleSubEmitterCommand[] = [];

  /** @internal */
  @ignoreClone
  _feedbackSimulator: ParticleTransformFeedbackSimulator | null = null;
  @ignoreClone
  private _subEmitterSpawnState: ParticleSubEmitterSpawnState | null = null;
  @ignoreClone
  private _activeSubEmitterParticleCount = 0;
  @ignoreClone
  private _subEmitterSourceBounds: BoundingBox;
  @ignoreClone
  private _subEmitterSourceBoundsFrame = -1;
  @ignoreClone
  private _previousTrajectoryBounds: BoundingBox;
  @ignoreClone
  private _trajectoryFrameDisplacement: Vector3;
  @ignoreClone
  private _resetTrajectoryOnNextFeedback = true;
  @ignoreClone
  private _isPlaying = false;
  @ignoreClone
  private _instanceBufferResized = false;
  @ignoreClone
  private _particleCapacityDirty = false;
  @ignoreClone
  private _instanceVertexBufferBinding: VertexBufferBinding;
  @ignoreClone
  private _instanceVertices: Float32Array;
  private _randomSeed = 0;
  @ignoreClone
  private _emissionBoundsRecords: Float32Array | null = null;
  @ignoreClone
  private _emissionBoundsRecordCount = 0;
  @ignoreClone
  private _nextEmissionBoundsExpiry = Infinity;
  @ignoreClone
  private _lastEmissionBoundsFrame = -1;
  @ignoreClone
  private _currentInheritedBoundsAxisReach: Vector3 | null = null;
  @ignoreClone
  private _currentInheritedBoundsPathReach = 0;
  @ignoreClone
  private _lastInitialCurveBoundsFactor = 0;
  @ignoreClone
  private _playStartDelay = 0;

  /**
   * Whether the particle generator is contain alive or is still creating particles.
   */
  get isAlive(): boolean {
    if (this._isPlaying) {
      return true;
    }

    return this._firstActiveElement !== this._firstFreeElement;
  }

  /**
   * Random seed.
   *
   * @remarks
   * If `useAutoRandomSeed` is true, this value will be random changed when play.
   * If you set this value custom, `useAutoRandomSeed` will be false.
   */
  get randomSeed(): number {
    return this._randomSeed;
  }

  set randomSeed(value: number) {
    this._resetGlobalRandSeed(value);
    this.useAutoRandomSeed = false;
  }

  /**
   * @internal
   */
  constructor(renderer: ParticleRenderer) {
    super();
    this._renderer = renderer;

    this._primitive = new Primitive(renderer.engine);
    this._reorganizeGeometryBuffers();
    this._resizeInstanceBuffer(ParticleGenerator._particleIncreaseCount);

    this.main = new MainModule(this);
    this.velocityOverLifetime = new VelocityOverLifetimeModule(this);
    this.forceOverLifetime = new ForceOverLifetimeModule(this);
    this.sizeOverLifetime = new SizeOverLifetimeModule(this);
    this.limitVelocityOverLifetime = new LimitVelocityOverLifetimeModule(this);
    this.noise = new NoiseModule(this);
    this.inheritVelocity = new InheritVelocityModule(this);
    this.subEmitters = new SubEmittersModule(this);
    this.customData = new CustomDataModule(this);

    this.emission.enabled = true;
  }

  /**
   * Start emitting particles.
   * @param withChildren - Whether to start the particle generator of the child entity
   */
  play(withChildren: boolean = true): void {
    if (withChildren) {
      const particleRenderers = this._renderer.entity.getComponentsIncludeChildren(
        ParticleRenderer,
        ParticleGenerator._tempParticleRenderers
      );
      for (let i = 0, n = particleRenderers.length; i < n; i++) {
        const particleRenderer = particleRenderers[i];
        particleRenderer.generator.play(false);
      }
    } else {
      this._isPlaying = true;
      if (this.useAutoRandomSeed) {
        this._resetGlobalRandSeed(Math.floor(Math.random() * 0xffffffff)); // 2^32 - 1
      }

      this._playStartDelay = this.main.startDelay.evaluate(undefined, this.main._startDelayRand.random());
      this.emission._resyncCursors(this._playTime);
    }
  }

  /**
   * Stop emitting particles.
   * @param withChildren - Whether to stop the particle generator of the child entity
   * @param stopMode - Stop mode
   */
  stop(withChildren: boolean = true, stopMode: ParticleStopMode = ParticleStopMode.StopEmitting): void {
    if (withChildren) {
      const particleRenderers = this._renderer.entity.getComponentsIncludeChildren(
        ParticleRenderer,
        ParticleGenerator._tempParticleRenderers
      );
      for (let i = 0, n = particleRenderers.length; i < n; i++) {
        const particleRenderer = particleRenderers[i];
        particleRenderer.generator.stop(false, stopMode);
      }
    } else {
      this._isPlaying = false;
      if (stopMode === ParticleStopMode.StopEmittingAndClear) {
        this._clearActiveParticles();
        this._releaseSubEmitterSpawnStateIfUnused();
        this._playTime = 0;
      }
    }
  }

  /**
   * Manually emit certain number of particles immediately.
   * @param count - Number of particles to emit
   */
  emit(count: number): void {
    this._discardLostGPUParticleState();
    this._emit(this._playTime, count);
  }

  /**
   * @internal
   */
  _emit(playTime: number, count: number, emitWorldPositionOverride?: Vector3): number {
    const { emission, main } = this;
    if (!emission.enabled) {
      return 0;
    }
    return this._emitParticles(
      playTime,
      count,
      main.maxParticles - this._getAliveParticleCount(),
      main.simulationSpace === ParticleSimulationSpace.World ? emitWorldPositionOverride : undefined
    );
  }

  /**
   * @internal
   */
  _update(elapsedTime: number): void {
    this._discardLostGPUParticleState();
    const shaderData = this._renderer.shaderData;
    const instanceBufferContentLost = this._instanceVertexBufferBinding.buffer.isContentLost;

    const lastAlive = this.isAlive;
    const { main, emission } = this;
    const duration = main.duration;
    const lastPlayTime = this._playTime;
    let deltaTime = elapsedTime * main.simulationSpeed;
    // Normalized frame position at which simulation starts after Start Delay
    let frameSimulationStart = 0;
    if (this.inheritVelocity.enabled) {
      this.inheritVelocity._updateEmitterVelocity(elapsedTime);
    }

    if (this._isPlaying && this._playStartDelay > 0) {
      if (deltaTime <= this._playStartDelay) {
        this._playStartDelay -= deltaTime;
        deltaTime = 0;
        frameSimulationStart = 1;
      } else {
        frameSimulationStart = this._playStartDelay / deltaTime;
        deltaTime -= this._playStartDelay;
        this._playStartDelay = 0;
      }
    }

    this._playTime += deltaTime;
    const useTrajectoryFeedback = this._feedbackSimulator?.trajectoryEnabled ?? false;
    let didRetireParticles = false;
    if (useTrajectoryFeedback && this._firstActiveElement !== this._firstFreeElement) {
      this._captureSubEmitterSourceBounds();
    }
    this._retireExpiredParticles(this._firstNewElement);
    // Trajectory feedback keeps logically retired slots intact until their final GPU state is copied
    if (!useTrajectoryFeedback) {
      didRetireParticles = this._finalizeRetiredParticles(false, lastPlayTime, frameSimulationStart);
      this._freeRetiredParticles();
    }

    if (main.simulationSpace === ParticleSimulationSpace.World || this._emissionBoundsRecordCount > 0) {
      this._retireEmissionBounds();
    }

    // Only a maxParticles change requests compaction. Trajectory retirement may temporarily grow the ring
    // beyond this size, and that high-water capacity is retained to avoid shrinking and regrowing every frame
    if (this._particleCapacityDirty) {
      if (
        this._currentParticleCount > main._maxParticleBuffer &&
        (!useTrajectoryFeedback || this._firstRetiredElement === this._firstActiveElement)
      ) {
        if (this._getNotRetiredParticleCount() < main._maxParticleBuffer) {
          this._resizeInstanceBuffer(main._maxParticleBuffer);
          this._particleCapacityDirty = false;
        }
      } else if (this._currentParticleCount <= main._maxParticleBuffer) {
        this._particleCapacityDirty = false;
      }
    }

    if (deltaTime > 0 && emission.enabled && this._isPlaying) {
      emission._emit(lastPlayTime, this._playTime);
      if (!main.isLoop && this._playTime > duration) {
        this._isPlaying = false;
      }
    }

    const incomingCommands = this._incomingSubEmitterCommands;
    if (incomingCommands.length > 0) {
      let remainingSubEmitterCapacity = Math.max(Math.floor(main.maxParticles) - this._getAliveParticleCount(), 0);
      for (let i = 0, n = incomingCommands.length; i < n; i++) {
        const command = incomingCommands[i];
        let emittedCount = 0;
        if (remainingSubEmitterCapacity > 0) {
          if (command.isBirth === true) {
            emittedCount = this._consumeBirthSubEmitterCommand(
              command,
              remainingSubEmitterCapacity,
              lastPlayTime,
              frameSimulationStart
            );
          } else {
            const emitPlayTime = this._getFramePlayTime(command.frameTime, lastPlayTime, frameSimulationStart);
            emittedCount = this._emitParticles(
              emitPlayTime,
              command.count,
              remainingSubEmitterCapacity,
              undefined,
              command,
              1
            );
          }
        }
        if (emittedCount > 0) {
          let firstEmittedElement = this._firstFreeElement - emittedCount;
          if (firstEmittedElement < 0) {
            firstEmittedElement += this._currentParticleCount;
          }
          this._subEmitterSpawnState!.enqueueParentTrajectory(
            command.source._feedbackSimulator.readBinding,
            command.ringIndex,
            firstEmittedElement,
            emittedCount
          );
        }
        command.release();
        remainingSubEmitterCapacity -= emittedCount;
      }
      incomingCommands.length = 0;
      this._subEmitterSpawnState?.flush();
    }

    if (useTrajectoryFeedback && this._firstNewElement !== this._firstFreeElement) {
      this._captureSubEmitterSourceBounds();
    }

    // Non-trajectory simulation does not need retired slots after spawn state has been gathered
    // Retire catch-up emissions before compacting CPU data or simulating their first frame
    if (!useTrajectoryFeedback && this._firstNewElement !== this._firstFreeElement) {
      this._retireExpiredParticles(this._firstFreeElement);
      didRetireParticles =
        this._finalizeRetiredParticles(false, lastPlayTime, frameSimulationStart) || didRetireParticles;
      this._freeRetiredParticles();
    }

    const firstNewElement = this._firstNewElement;
    const hasNewParticles = firstNewElement !== this._firstFreeElement;
    if (
      hasNewParticles ||
      (!this._feedbackSimulator && didRetireParticles) ||
      this._instanceBufferResized ||
      instanceBufferContentLost
    ) {
      this._addActiveParticlesToVertexBuffer();
    }

    const firstSimulationElement = useTrajectoryFeedback ? this._firstRetiredElement : this._firstActiveElement;
    const hasSimulationParticles = firstSimulationElement !== this._firstFreeElement;
    const shouldUpdateFeedback =
      this._feedbackSimulator !== null && hasSimulationParticles && (deltaTime > 0 || hasNewParticles);
    if (hasSimulationParticles) {
      shaderData.setFloat(ParticleGenerator._currentTimeProperty, this._playTime);
      this._updateShaderData(shaderData);
    }
    if (shouldUpdateFeedback) {
      const resetTrajectory = this._resetTrajectoryOnNextFeedback;
      this._updateFeedback(
        shaderData,
        deltaTime,
        firstSimulationElement,
        firstNewElement,
        useTrajectoryFeedback ? resetTrajectory : undefined
      );
      if (useTrajectoryFeedback) {
        this._resetTrajectoryOnNextFeedback = false;
      }
      this._accumulateCurrentInheritedBounds(deltaTime);
      if (useTrajectoryFeedback && this.subEmitters._hasSubEmitterOfType(ParticleSubEmitterType.Birth, true)) {
        this._prepareBirthRange(
          firstSimulationElement,
          this._firstFreeElement,
          lastPlayTime,
          this._playTime,
          frameSimulationStart
        );
      }
      if (useTrajectoryFeedback) {
        // New particles may already have reached the end of their lifetime while catching up to this frame
        if (hasNewParticles) {
          this._retireExpiredParticles(this._firstFreeElement);
        }
        this._finalizeRetiredParticles(
          this.subEmitters._hasSubEmitterOfType(ParticleSubEmitterType.Death, true),
          lastPlayTime,
          frameSimulationStart
        );
        this._freeRetiredParticles();
        this._captureTrajectoryBounds(resetTrajectory);
      }
    } else if (useTrajectoryFeedback) {
      this._resetTrajectoryFeedbackBaseline();
    }

    const isAlive = this.isAlive;
    if (isAlive) {
      if (main.simulationSpace === ParticleSimulationSpace.World) {
        this._generateTransformedBounds();
      }
    } else {
      if (lastAlive) {
        this._resetEmissionBoundsState();
      }
      // Reset play time when is not playing and no active particles to avoid potential precision problems in GPU
      this._playTime -= emission._shiftTimeOrigin(Math.floor(this._playTime / duration) * duration);
    }

    if (isAlive !== lastAlive) {
      this._renderer._onWorldVolumeChanged();
    }
    this._releaseSubEmitterSpawnStateIfUnused();
  }

  /**
   * @internal
   */
  _reorganizeGeometryBuffers(): void {
    const { _renderer: renderer, _primitive: primitive } = this;
    const vertexBufferBindings = ParticleGenerator._vertexBufferBindingScratch;
    const { _particleBufferUtils: particleUtils } = renderer.engine;

    primitive.clearVertexElements();
    vertexBufferBindings.length = 0;

    if (renderer.renderMode === ParticleRenderMode.Mesh) {
      const { mesh } = renderer;
      if (mesh) {
        const positionElement = mesh.getVertexElement(VertexAttribute.Position);
        const colorElement = mesh.getVertexElement(VertexAttribute.Color);
        const uvElement = mesh.getVertexElement(VertexAttribute.UV);
        const positionBufferBinding = positionElement ? mesh.vertexBufferBindings[positionElement.bindingIndex] : null;
        const colorBufferBinding = colorElement ? mesh.vertexBufferBindings[colorElement.bindingIndex] : null;
        const uvBufferBinding = uvElement ? mesh.vertexBufferBindings[uvElement.bindingIndex] : null;

        if (positionBufferBinding) {
          const index = this._addVertexBufferBindingsFilterDuplicate(positionBufferBinding, vertexBufferBindings);
          primitive.addVertexElement(
            new VertexElement(VertexAttribute.Position, positionElement.offset, positionElement.format, index)
          );
        }

        if (colorBufferBinding) {
          const index = this._addVertexBufferBindingsFilterDuplicate(colorBufferBinding, vertexBufferBindings);
          primitive.addVertexElement(
            new VertexElement(VertexAttribute.Color, colorElement.offset, colorElement.format, index)
          );
          renderer.shaderData.enableMacro(MeshRenderer._enableVertexColorMacro);
        } else {
          renderer.shaderData.disableMacro(MeshRenderer._enableVertexColorMacro);
        }

        if (uvBufferBinding) {
          const index = this._addVertexBufferBindingsFilterDuplicate(uvBufferBinding, vertexBufferBindings);
          primitive.addVertexElement(new VertexElement(VertexAttribute.UV, uvElement.offset, uvElement.format, index));
        }

        primitive.setIndexBufferBinding(mesh._primitive.indexBufferBinding);
        const { subMesh } = mesh;
        const { _subPrimitive: subPrimitive } = this;
        subPrimitive.start = subMesh.start;
        subPrimitive.topology = subMesh.topology;
        subPrimitive.count = subMesh.count;
      } else {
        renderer.shaderData.disableMacro(MeshRenderer._enableVertexColorMacro);
        primitive.setIndexBufferBinding(null);
        primitive.vertexBufferBindings.length = 0;
        return;
      }
    } else {
      renderer.shaderData.disableMacro(MeshRenderer._enableVertexColorMacro);
      primitive.addVertexElement(ParticleBufferUtils.forwardBillboardInputVertexElement);
      vertexBufferBindings.push(particleUtils.billboardVertexBufferBinding);
      primitive.setIndexBufferBinding(particleUtils.billboardIndexBufferBinding);
      this._subPrimitive.count = ParticleBufferUtils.billboardIndexCount;
    }

    const bindingIndex = vertexBufferBindings.length;
    ParticleGenerator._addVertexInputLayout(
      primitive,
      ParticleBufferUtils.forwardParticleInstanceInputVertexElements,
      bindingIndex
    );

    // If instance buffer already created
    if (this._instanceVertexBufferBinding) {
      vertexBufferBindings.push(this._instanceVertexBufferBinding);
    }

    const subEmitterSpawnState = this._subEmitterSpawnState;
    if (subEmitterSpawnState) {
      ParticleGenerator._addVertexInputLayout(
        primitive,
        ParticleBufferUtils.forwardSubEmitterSpawnStateInstanceInputVertexElements,
        vertexBufferBindings.length
      );
      vertexBufferBindings.push(subEmitterSpawnState.renderBinding);
    }

    // Add feedback buffer binding for render pass
    if (this._feedbackSimulator) {
      ParticleGenerator._addVertexInputLayout(
        primitive,
        ParticleBufferUtils.forwardFeedbackStateInstanceInputVertexElements,
        vertexBufferBindings.length
      );
      vertexBufferBindings.push(this._feedbackSimulator.readBinding);
    }

    primitive.vertexBufferBindings.length = vertexBufferBindings.length;
    primitive.setVertexBufferBindings(vertexBufferBindings);
    vertexBufferBindings.length = 0;
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    this.main._updateShaderData(shaderData);
    this.emission._updateShaderData(shaderData);
    this.velocityOverLifetime._updateShaderData(shaderData);
    this.forceOverLifetime._updateShaderData(shaderData);
    this.limitVelocityOverLifetime._updateShaderData(shaderData);
    this.textureSheetAnimation._updateShaderData(shaderData);
    this.sizeOverLifetime._updateShaderData(shaderData);
    this.rotationOverLifetime._updateShaderData(shaderData);
    this.colorOverLifetime._updateShaderData(shaderData);
    this.noise._updateShaderData(shaderData);
    this.inheritVelocity._updateShaderData(shaderData, this._subEmitterSpawnState !== null);
    this.customData._updateShaderData(shaderData);
  }

  /**
   * @internal
   */
  _resetGlobalRandSeed(seed: number): void {
    this._randomSeed = seed;
    this.main._resetRandomSeed(seed);
    this.emission._resetRandomSeed(seed);
    this.textureSheetAnimation._resetRandomSeed(seed);
    this.velocityOverLifetime._resetRandomSeed(seed);
    this.forceOverLifetime._resetRandomSeed(seed);
    this.limitVelocityOverLifetime._resetRandomSeed(seed);
    this.sizeOverLifetime._resetRandomSeed(seed);
    this.rotationOverLifetime._resetRandomSeed(seed);
    this.colorOverLifetime._resetRandomSeed(seed);
    this.noise._resetRandomSeed(seed);
    this.inheritVelocity._resetRandomSeed(seed);
    this.subEmitters._resetRandomSeed(seed);
  }

  /**
   * @internal
   */
  _markParticleCapacityDirty(): void {
    this._particleCapacityDirty = true;
  }

  /**
   * @internal
   */
  _setTransformFeedback(): void {
    const isWebGL2 = this._renderer.engine._hardwareRenderer.isWebGL2;
    const useTrajectory =
      isWebGL2 &&
      (this.subEmitters._hasSubEmitterOfType(ParticleSubEmitterType.Death, false) ||
        this.subEmitters._hasSubEmitterOfType(ParticleSubEmitterType.Birth, false));
    const useFeedback =
      isWebGL2 &&
      (useTrajectory ||
        this.limitVelocityOverLifetime.enabled ||
        this.noise.enabled ||
        this.inheritVelocity._needTransformFeedback() ||
        this.velocityOverLifetime._needTransformFeedback());
    const feedbackLayoutChanged = useTrajectory !== (this._feedbackSimulator?.trajectoryEnabled ?? false);
    if (useFeedback === (this._feedbackSimulator !== null) && !feedbackLayoutChanged) {
      return;
    }

    this._clearActiveParticles();

    this._feedbackSimulator?.destroy();
    this._feedbackSimulator = useFeedback
      ? new ParticleTransformFeedbackSimulator(this._renderer.engine, useTrajectory, this._currentParticleCount)
      : null;
    if (useFeedback) {
      this._renderer.shaderData.enableMacro(ParticleGenerator._transformFeedbackMacro);
      // Feedback buffer swaps every frame; VAO caching would bake stale buffer handles.
      this._primitive.enableVAO = false;
    } else {
      this._renderer.shaderData.disableMacro(ParticleGenerator._transformFeedbackMacro);
      this._primitive.enableVAO = true;
    }

    if (useTrajectory) {
      this._renderer.shaderData.enableMacro(ParticleGenerator._trajectoryFeedbackMacro);
    } else {
      this._renderer.shaderData.disableMacro(ParticleGenerator._trajectoryFeedbackMacro);
    }
    if (this._subEmitterSpawnState) {
      this._releaseSubEmitterSpawnStateIfUnused();
    } else {
      this._reorganizeGeometryBuffers();
    }
  }

  /**
   * @internal
   */
  _resyncAfterCulling(): void {
    this.inheritVelocity._resyncEmitterVelocity();
    if (this._feedbackSimulator?.trajectoryEnabled) {
      this._resetTrajectoryFeedbackBaseline();
    }
  }

  /**
   * @internal
   */
  _getAliveParticleCount(): number {
    return this._getRingDistance(this._firstActiveElement, this._firstFreeElement);
  }

  /**
   * @inheritdoc
   */
  _onClone(target: ParticleGenerator): void {
    target._resetGlobalRandSeed(target._randomSeed);
    target._particleCapacityDirty = true;
    target._setTransformFeedback();
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._instanceVertexBufferBinding.buffer.destroy();
    this._primitive.destroy();
    this.emission._destroy();
    this._feedbackSimulator?.destroy();
    this._subEmitterSpawnState?.destroy();
  }

  /**
   * @internal
   */
  _updateBoundsSimulationLocal(bounds: BoundingBox): void {
    const renderer = this._renderer;
    // Get longest Lifetime
    const maxLifetime = this.main.startLifetime._getMax();

    const { _generatorBounds: generatorBounds, _transformedBounds: transformedBounds } = renderer;
    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume)) {
      this._calculateGeneratorBounds(maxLifetime, generatorBounds, true);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
      this._calculateTransformedBounds(maxLifetime, generatorBounds, transformedBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
    }

    const hasEmissionBounds = this._emissionBoundsRecordCount > 0;
    const useOrbitalBounds = this._useOrbitalBounds();
    if (hasEmissionBounds) {
      const localBounds = ParticleGenerator._tempEmissionBounds;
      localBounds.copyFrom(generatorBounds);
      const boundsLifetime = Math.max(maxLifetime, this._mergeLocalEmissionBounds(localBounds));
      this._calculateTransformedBounds(boundsLifetime, localBounds, bounds);
      if (!useOrbitalBounds) {
        this._addGravityToBounds(boundsLifetime, bounds, bounds);
      }
    } else if (useOrbitalBounds) {
      bounds.copyFrom(transformedBounds);
    } else {
      this._addGravityToBounds(maxLifetime, transformedBounds, bounds);
    }
  }

  /**
   * @internal
   */
  _updateBoundsSimulationWorld(bounds: BoundingBox): void {
    const emissionBoundsRecordCount = this._emissionBoundsRecordCount;
    const isPlaying = this._isPlaying;
    const useOrbitalBounds = this._useOrbitalBounds();
    let maxLifetime = isPlaying ? this.main.startLifetime._getMax() : 0;
    if (isPlaying) {
      bounds.copyFrom(this._renderer._transformedBounds);
    }
    if (emissionBoundsRecordCount > 0) {
      if (!isPlaying) {
        const extent = Number.MAX_VALUE;
        bounds.min.set(extent, extent, extent);
        bounds.max.set(-extent, -extent, -extent);
      }
      const currentInheritedVelocity = ParticleGenerator._tempVector33;
      if (!this.inheritVelocity._getCurrentBoundsVelocity(currentInheritedVelocity)) {
        currentInheritedVelocity.set(0, 0, 0);
      }
      const currentInheritedSpeed = currentInheritedVelocity.length();
      maxLifetime = Math.max(
        maxLifetime,
        this._mergeWorldEmissionBounds(bounds, useOrbitalBounds, currentInheritedVelocity, currentInheritedSpeed)
      );
    }
    if (!useOrbitalBounds) {
      this._addGravityToBounds(maxLifetime, bounds, bounds);
    }
  }

  /**
   * @internal
   */
  _releaseEmissionBoundsRecords(): void {
    this._emissionBoundsRecords = null;
    this._resetEmissionBoundsState();
  }

  /**
   * @internal
   */
  _generateTransformedBounds(): void {
    const renderer = this._renderer;
    const maxLifetime = this.main.startLifetime._getMax();

    const generatorBounds = renderer._generatorBounds;
    const generatorBoundsDirty = renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume);
    if (generatorBoundsDirty) {
      this._calculateGeneratorBounds(maxLifetime, generatorBounds, true);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
      const transformedBounds = renderer._transformedBounds;
      this._calculateTransformedBounds(maxLifetime, generatorBounds, transformedBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
    }

    if (generatorBoundsDirty) {
      const initialCurveFactor = this.inheritVelocity._usesInitialCurve(false)
        ? this.inheritVelocity.curve._getMaxMagnitude()
        : 0;
      if (initialCurveFactor > this._lastInitialCurveBoundsFactor && this._emissionBoundsRecordCount > 0) {
        this._preserveInitialCurveBoundsFactor(initialCurveFactor);
      }
      this._lastInitialCurveBoundsFactor = initialCurveFactor;
    }
  }

  private _updateFeedback(
    shaderData: ShaderData,
    deltaTime: number,
    firstFeedbackElement: number,
    firstNewElement: number,
    resetTrajectory: boolean | undefined
  ): void {
    this._feedbackSimulator.update(
      shaderData,
      this._currentParticleCount,
      firstFeedbackElement,
      this._firstFreeElement,
      firstNewElement,
      deltaTime,
      resetTrajectory,
      this._instanceVertexBufferBinding,
      this._subEmitterSpawnState?.simulationBinding
    );

    // Feedback is always the final render binding when render geometry exists
    const vertexBufferBindings = this._primitive.vertexBufferBindings;
    if (vertexBufferBindings.length > 0) {
      vertexBufferBindings[vertexBufferBindings.length - 1] = this._feedbackSimulator.readBinding;
    }
  }

  private _resizeInstanceBuffer(newParticleCount: number): void {
    const vertexBufferBindings = this._primitive.vertexBufferBindings;
    const lastInstanceBinding = this._instanceVertexBufferBinding;
    const instanceBindingIndex = lastInstanceBinding
      ? vertexBufferBindings.indexOf(lastInstanceBinding)
      : vertexBufferBindings.length > 0
        ? vertexBufferBindings.length
        : -1;
    const subEmitterSpawnState = this._subEmitterSpawnState;
    const subEmitterBindingIndex = subEmitterSpawnState
      ? vertexBufferBindings.indexOf(subEmitterSpawnState.renderBinding)
      : -1;
    lastInstanceBinding?.buffer.destroy();

    const stride = ParticleBufferUtils.instanceVertexStride;
    const oldParticleCount = this._currentParticleCount;
    const newByteLength = stride * newParticleCount;
    const vertexInstanceBuffer = new Buffer(
      this._renderer.engine,
      BufferBindFlag.VertexBuffer,
      newByteLength,
      BufferUsage.Dynamic,
      false
    );
    vertexInstanceBuffer.isGCIgnored = true;

    const vertexBufferBinding = new VertexBufferBinding(vertexInstanceBuffer, stride);

    const lastInstanceVertices = this._instanceVertices;
    const useFeedback = this._feedbackSimulator !== null;

    const instanceVertices = new Float32Array(newByteLength / 4);
    const runtimeMappings: ElementRangeMapping[] | undefined = useFeedback || subEmitterSpawnState ? [] : undefined;

    if (lastInstanceVertices) {
      const firstFreeElement = this._firstFreeElement;
      const firstRetiredElement = this._firstRetiredElement;
      if (newParticleCount > oldParticleCount) {
        if (firstRetiredElement <= firstFreeElement) {
          ParticleGenerator._copyParticleRange(
            lastInstanceVertices,
            instanceVertices,
            firstRetiredElement,
            firstRetiredElement,
            firstFreeElement - firstRetiredElement,
            runtimeMappings
          );
        } else {
          const increaseCount = newParticleCount - oldParticleCount;
          const targetFirstRetiredElement = firstRetiredElement + increaseCount;
          ParticleGenerator._copyParticleRange(
            lastInstanceVertices,
            instanceVertices,
            firstRetiredElement,
            targetFirstRetiredElement,
            oldParticleCount - firstRetiredElement,
            runtimeMappings
          );
          ParticleGenerator._copyParticleRange(
            lastInstanceVertices,
            instanceVertices,
            0,
            0,
            firstFreeElement,
            runtimeMappings
          );
          this._firstRetiredElement = targetFirstRetiredElement;
          if (this._firstActiveElement >= firstRetiredElement) {
            this._firstActiveElement += increaseCount;
          }
          if (this._firstNewElement >= firstRetiredElement) {
            this._firstNewElement += increaseCount;
          }
        }
      } else {
        const migrateCount = this._getNotRetiredParticleCount();
        const tailCount = Math.min(migrateCount, oldParticleCount - firstRetiredElement);
        const frontCount = migrateCount - tailCount;
        const firstActiveOffset = this._getRingDistance(firstRetiredElement, this._firstActiveElement);
        const firstNewOffset = this._getRingDistance(firstRetiredElement, this._firstNewElement);

        ParticleGenerator._copyParticleRange(
          lastInstanceVertices,
          instanceVertices,
          firstRetiredElement,
          0,
          tailCount,
          runtimeMappings
        );
        ParticleGenerator._copyParticleRange(
          lastInstanceVertices,
          instanceVertices,
          0,
          tailCount,
          frontCount,
          runtimeMappings
        );

        this._firstRetiredElement = 0;
        this._firstActiveElement = firstActiveOffset;
        this._firstNewElement = firstNewOffset;
        this._firstFreeElement = migrateCount;
      }

      if (runtimeMappings && this._feedbackSimulator?.trajectoryEnabled) {
        this.subEmitters._remapBirthStates(newParticleCount, runtimeMappings);
      }
      this._instanceBufferResized = true;
    }
    if (runtimeMappings) {
      if (useFeedback) {
        this._feedbackSimulator.resize(newParticleCount, runtimeMappings);
      }
      if (subEmitterSpawnState) {
        subEmitterSpawnState.resize(newParticleCount, runtimeMappings);
      }
    }

    // Update instance buffer binding
    if (instanceBindingIndex >= 0) {
      this._primitive.setVertexBufferBinding(instanceBindingIndex, vertexBufferBinding);
    }
    if (subEmitterBindingIndex >= 0) {
      this._primitive.setVertexBufferBinding(subEmitterBindingIndex, subEmitterSpawnState.renderBinding);
    }

    this._instanceVertices = instanceVertices;
    this._instanceVertexBufferBinding = vertexBufferBinding;
    this._currentParticleCount = newParticleCount;
    if (useFeedback && vertexBufferBindings.length > 0) {
      this._primitive.setVertexBufferBinding(vertexBufferBindings.length - 1, this._feedbackSimulator.readBinding);
    }
  }

  private static _copyParticleRange(
    source: Float32Array,
    target: Float32Array,
    sourceStart: number,
    targetStart: number,
    count: number,
    mappings: ElementRangeMapping[] | undefined
  ): void {
    if (count <= 0) {
      return;
    }
    const stride = ParticleBufferUtils.instanceVertexFloatStride;
    target.set(
      new Float32Array(source.buffer, sourceStart * stride * Float32Array.BYTES_PER_ELEMENT, count * stride),
      targetStart * stride
    );
    mappings?.push({ sourceStart, targetStart, count });
  }

  private static _addVertexInputLayout(
    primitive: Primitive,
    layout: readonly VertexElement[],
    bindingIndex: number
  ): void {
    for (let i = 0, n = layout.length; i < n; i++) {
      const element = layout[i];
      primitive.addVertexElement(
        new VertexElement(element.attribute, element.offset, element.format, bindingIndex, element.instanceStepRate)
      );
    }
  }

  private _addNewParticle(
    position: Vector3,
    direction: Vector3,
    emitterWorldPosition: Vector3,
    emitterWorldRotation: Quaternion,
    playTime: number,
    usesInitialInheritCurve: boolean,
    inheritedBounds: Vector3,
    emitWorldPositionOverride: Vector3 | undefined,
    inheritColor: Color | undefined,
    inheritSize: Vector3 | undefined,
    inheritRotation: Vector3 | undefined,
    normalizedEmitAge: number,
    isSubEmitterSpawned: boolean,
    trajectoryTimeOffset: number,
    inheritParentDirection: boolean
  ): void {
    const firstFreeElement = this._firstFreeElement;
    let nextFreeElement = firstFreeElement + 1;
    if (nextFreeElement >= this._currentParticleCount) {
      nextFreeElement = 0;
    }

    const main = this.main;

    let pos: Vector3, rot: Quaternion;
    if (main.simulationSpace === ParticleSimulationSpace.World || isSubEmitterSpawned) {
      pos = isSubEmitterSpawned ? emitterWorldPosition : (emitWorldPositionOverride ?? emitterWorldPosition);
      rot = emitterWorldRotation;
    }

    let startSpeed = main.startSpeed.evaluate(undefined, main._startSpeedRand.random());
    let particleDirection = direction;
    const inheritVelocity = this.inheritVelocity;
    const inheritedWorldVelocity = ParticleGenerator._tempVector34;
    const hasInheritedVelocity = !isSubEmitterSpawned && inheritVelocity._getInitialVelocity(inheritedWorldVelocity);
    let inheritedBoundsX = hasInheritedVelocity ? Math.abs(inheritedWorldVelocity.x) : 0;
    let inheritedBoundsY = hasInheritedVelocity ? Math.abs(inheritedWorldVelocity.y) : 0;
    let inheritedBoundsZ = hasInheritedVelocity ? Math.abs(inheritedWorldVelocity.z) : 0;

    if (hasInheritedVelocity && !usesInitialInheritCurve) {
      const inheritedLocalVelocity = ParticleGenerator._tempVector32;
      const invWorldRotation = ParticleGenerator._tempQuat0;
      Quaternion.invert(emitterWorldRotation, invWorldRotation);
      Vector3.transformByQuat(inheritedWorldVelocity, invWorldRotation, inheritedLocalVelocity);
      if (main.simulationSpace === ParticleSimulationSpace.Local) {
        inheritedBoundsX = Math.abs(inheritedLocalVelocity.x);
        inheritedBoundsY = Math.abs(inheritedLocalVelocity.y);
        inheritedBoundsZ = Math.abs(inheritedLocalVelocity.z);
      }

      inheritedWorldVelocity.set(
        direction.x * startSpeed + inheritedLocalVelocity.x,
        direction.y * startSpeed + inheritedLocalVelocity.y,
        direction.z * startSpeed + inheritedLocalVelocity.z
      );
      startSpeed = inheritedWorldVelocity.length();
      if (startSpeed > MathUtil.zeroTolerance) {
        inheritedWorldVelocity.scale(1 / startSpeed);
      } else {
        inheritedWorldVelocity.set(0, 0, -1);
        startSpeed = 0;
      }
      particleDirection = inheritedWorldVelocity;
    }

    const instanceVertices = this._instanceVertices;
    const offset = firstFreeElement * ParticleBufferUtils.instanceVertexFloatStride;

    // Position
    position.copyToArray(instanceVertices, offset);

    // Start life time
    const startLifetime = main.startLifetime.evaluate(undefined, main._startLifeTimeRand.random());
    instanceVertices[offset + ParticleBufferUtils.startLifeTimeOffset] = startLifetime;
    if (hasInheritedVelocity) {
      inheritedBounds.set(
        Math.max(inheritedBounds.x, inheritedBoundsX * startLifetime),
        Math.max(inheritedBounds.y, inheritedBoundsY * startLifetime),
        Math.max(inheritedBounds.z, inheritedBoundsZ * startLifetime)
      );
    }

    // Direction
    particleDirection.copyToArray(instanceVertices, offset + 4);

    // Time
    instanceVertices[offset + ParticleBufferUtils.timeOffset] = playTime;

    // Color
    const startColor = ParticleGenerator._tempColor;
    main.startColor.evaluate(undefined, main._startColorRand.random(), startColor);

    startColor.copyToArray(instanceVertices, offset + 8);

    // Start size
    const startSizeRand = main._startSizeRand;
    if (main.startSize3D) {
      instanceVertices[offset + 12] = main.startSizeX.evaluate(normalizedEmitAge, startSizeRand.random());
      instanceVertices[offset + 13] = main.startSizeY.evaluate(normalizedEmitAge, startSizeRand.random());
      instanceVertices[offset + 14] = main.startSizeZ.evaluate(normalizedEmitAge, startSizeRand.random());
    } else {
      const size = main.startSize.evaluate(normalizedEmitAge, startSizeRand.random());
      instanceVertices[offset + 12] = size;
      instanceVertices[offset + 13] = size;
      instanceVertices[offset + 14] = size;
    }

    // Start rotation
    const { _startRotationRand: startRotationRand, flipRotation } = main;
    const isFlip = flipRotation > startRotationRand.random();

    const rotationZ = main.startRotationZ.evaluate(undefined, startRotationRand.random());
    if (main.startRotation3D) {
      const rotationX = main.startRotationX.evaluate(undefined, startRotationRand.random());
      const rotationY = main.startRotationY.evaluate(undefined, startRotationRand.random());
      instanceVertices[offset + 15] = isFlip ? -rotationX : rotationX;
      instanceVertices[offset + 16] = isFlip ? -rotationY : rotationY;
      instanceVertices[offset + 17] = isFlip ? -rotationZ : rotationZ;
    } else {
      instanceVertices[offset + 15] = isFlip ? -rotationZ : rotationZ;
    }

    // Start speed
    instanceVertices[offset + 18] = startSpeed;

    // Gravity, color, size, rotation
    switch (main.gravityModifier.mode) {
      case ParticleCurveMode.Constant:
        instanceVertices[offset + 19] = main.gravityModifier.constant;
        break;
      case ParticleCurveMode.TwoConstants:
        instanceVertices[offset + 19] = main.gravityModifier.evaluate(undefined, main._gravityModifierRand.random());
        break;
    }

    const colorOverLifetime = this.colorOverLifetime;
    if (colorOverLifetime.enabled && colorOverLifetime.color.mode === ParticleGradientMode.TwoGradients) {
      instanceVertices[offset + 20] = colorOverLifetime._colorGradientRand.random();
    }

    // Noise and size-over-lifetime temporarily share slot 21 (a_Random0.z), so noise takes precedence
    // Track independent module randomness and instance layout optimization in #3075
    const sizeOverLifetime = this.sizeOverLifetime;
    if (this.noise.enabled) {
      instanceVertices[offset + 21] = this.noise._noiseRand.random();
    } else if (sizeOverLifetime.enabled && sizeOverLifetime._isRandomCurveMode()) {
      instanceVertices[offset + 21] = sizeOverLifetime._sizeRand.random();
    }

    const rotationOverLifetime = this.rotationOverLifetime;
    if (rotationOverLifetime.enabled && rotationOverLifetime.rotationZ.mode === ParticleCurveMode.TwoConstants) {
      instanceVertices[offset + 22] = rotationOverLifetime._rotationRand.random();
    }

    // Texture sheet animation
    const textureSheetAnimation = this.textureSheetAnimation;
    if (textureSheetAnimation.enabled && textureSheetAnimation.frameOverTime.mode === ParticleCurveMode.TwoCurves) {
      instanceVertices[offset + 23] = textureSheetAnimation._frameOverTimeRand.random();
    }

    // Velocity random
    const velocityOverLifetime = this.velocityOverLifetime;
    if (velocityOverLifetime.enabled && velocityOverLifetime._isRandomMode()) {
      const rand = velocityOverLifetime._velocityRand;
      instanceVertices[offset + 24] = rand.random();
      instanceVertices[offset + 25] = rand.random();
      instanceVertices[offset + 26] = rand.random();
    }

    if (pos) {
      // Simulation world position
      pos.copyToArray(instanceVertices, offset + 27);

      // Simulation world rotation
      rot.copyToArray(instanceVertices, offset + 30);
    }

    // Simulation UV
    if (textureSheetAnimation.enabled) {
      const { frameOverTime } = textureSheetAnimation;
      const { x, y, z } = textureSheetAnimation._tillingInfo;

      let tileRow = 0;
      if (frameOverTime.mode === ParticleCurveMode.Constant || frameOverTime.mode === ParticleCurveMode.TwoConstants) {
        tileRow =
          Math.floor(frameOverTime.evaluate(undefined, textureSheetAnimation._frameOverTimeRand.random()) * z) * x;
      }
      const tileRowIndex = Math.floor(tileRow);

      instanceVertices[offset + ParticleBufferUtils.simulationUVOffset] = x;
      instanceVertices[offset + 35] = y;
      instanceVertices[offset + 36] = tileRow - tileRowIndex;
      instanceVertices[offset + 37] = tileRowIndex * y;
    } else {
      instanceVertices[offset + ParticleBufferUtils.simulationUVOffset] = 1;
      instanceVertices[offset + 35] = 1;
      instanceVertices[offset + 36] = 0;
      instanceVertices[offset + 37] = 0;
    }

    const { forceOverLifetime } = this;
    if (forceOverLifetime.enabled && forceOverLifetime._isRandomMode()) {
      const rand = forceOverLifetime._forceRand;
      instanceVertices[offset + 38] = rand.random();
      instanceVertices[offset + 39] = rand.random();
      instanceVertices[offset + 40] = rand.random();
    }

    const { limitVelocityOverLifetime } = this;
    if (
      limitVelocityOverLifetime.enabled &&
      (limitVelocityOverLifetime._isSpeedRandomMode() || limitVelocityOverLifetime._isDragRandomMode())
    ) {
      instanceVertices[offset + 41] = limitVelocityOverLifetime._speedRand.random();
    }

    const inheritVelocityOffset = offset + ParticleBufferUtils.inheritVelocityOffset;
    if (isSubEmitterSpawned) {
      instanceVertices[inheritVelocityOffset] = inheritVelocity._getTrajectoryInitialFactor();
      instanceVertices[inheritVelocityOffset + 1] = inheritParentDirection ? -1 : 1;
      instanceVertices[inheritVelocityOffset + 2] = trajectoryTimeOffset;
    } else if (usesInitialInheritCurve) {
      inheritedWorldVelocity.copyToArray(instanceVertices, inheritVelocityOffset);
    } else {
      instanceVertices[inheritVelocityOffset] = 0;
      instanceVertices[inheritVelocityOffset + 1] = 0;
      instanceVertices[inheritVelocityOffset + 2] = 0;
    }
    const inheritVelocityRandom =
      (inheritVelocity._needTransformFeedback() || usesInitialInheritCurve) && inheritVelocity.curve._isRandomMode()
        ? inheritVelocity._curveRand.random()
        : 0;
    instanceVertices[offset + ParticleBufferUtils.inheritVelocityRandomOffset] = isSubEmitterSpawned
      ? -inheritVelocityRandom - 1
      : inheritVelocityRandom;

    // Apply sub-emit inherit: multiply color/size, add rotation
    if (inheritColor) {
      instanceVertices[offset + 8] *= inheritColor.r;
      instanceVertices[offset + 9] *= inheritColor.g;
      instanceVertices[offset + 10] *= inheritColor.b;
      instanceVertices[offset + 11] *= inheritColor.a;
    }
    if (inheritSize) {
      instanceVertices[offset + 12] *= inheritSize.x;
      instanceVertices[offset + 13] *= inheritSize.y;
      instanceVertices[offset + 14] *= inheritSize.z;
    }
    if (inheritRotation) {
      instanceVertices[offset + 15] += inheritRotation.x;
      instanceVertices[offset + 16] += inheritRotation.y;
      instanceVertices[offset + 17] += inheritRotation.z;
    }

    this._firstFreeElement = nextFreeElement;
  }

  private _consumeBirthSubEmitterCommand(
    command: BirthSubEmitterCommand,
    available: number,
    targetLastPlayTime: number,
    targetFrameSimulationStart: number
  ): number {
    let emittedCount = 0;

    const requests = command.requests;
    for (let i = 0, n = command.requestCount; i < n && available > 0; i++) {
      const request = requests[i];
      const emissionTime = request.time;
      const parentAge = emissionTime + command.startDelay;
      const parentNormalizedAge = command.lifetime > 0 ? MathUtil.clamp(parentAge / command.lifetime, 0, 1) : 1;
      const playTime = this._getFramePlayTime(
        command.getFrameTime(emissionTime),
        targetLastPlayTime,
        targetFrameSimulationStart
      );
      const emitted = this._emitParticles(
        playTime,
        request.count,
        available,
        undefined,
        command,
        parentNormalizedAge,
        command.getTrajectoryTimeOffset(emissionTime)
      );
      available -= emitted;
      emittedCount += emitted;
    }
    return emittedCount;
  }

  private _emitParticles(
    playTime: number,
    requestedCount: number,
    available: number,
    emitWorldPosition?: Vector3,
    subEmitterCommand?: ParticleSubEmitterCommand,
    normalizedEmitAgeOverride?: number,
    trajectoryTimeOffset: number = 0
  ): number {
    const count = Math.min(Math.ceil(requestedCount), Math.max(Math.floor(available), 0));
    if (count <= 0) {
      return 0;
    }

    this._ensureParticleCapacity(count);
    const main = this.main;
    const transform = this._renderer.entity.transform;
    const isSubEmitterSpawned = !!subEmitterCommand;
    if (isSubEmitterSpawned) {
      this._ensureSubEmitterSpawnState();
    }
    const targetWorldPosition = transform.worldPosition;
    const targetWorldRotation = transform.worldRotationQuaternion;
    const positionScale = main._getPositionScale();

    const { emission } = this;
    const shape = emission.shape;
    const simulationLocal = main.simulationSpace === ParticleSimulationSpace.Local;
    const usesInitialInheritCurve = this.inheritVelocity._usesInitialCurve(isSubEmitterSpawned);
    const duration = main.duration;
    const normalizedEmitAge = normalizedEmitAgeOverride ?? (duration > 0 ? (playTime % duration) / duration : 0);
    const inheritProperties = subEmitterCommand?.inheritProperties ?? ParticleSubEmitterInheritProperty.None;
    if ((inheritProperties & ParticleGenerator._particleValueInheritanceMask) !== 0) {
      const source = subEmitterCommand.source;
      source._evaluateOverLifetime(
        source._instanceVertices,
        subEmitterCommand.ringIndex * ParticleBufferUtils.instanceVertexFloatStride,
        normalizedEmitAge,
        ParticleGenerator._eventColor,
        ParticleGenerator._eventSize,
        ParticleGenerator._eventRotation
      );
    }
    const inheritColor =
      (inheritProperties & ParticleSubEmitterInheritProperty.Color) !== 0 ? ParticleGenerator._eventColor : undefined;
    const inheritSize =
      (inheritProperties & ParticleSubEmitterInheritProperty.Size) !== 0 ? ParticleGenerator._eventSize : undefined;
    const inheritRotation =
      (inheritProperties & ParticleSubEmitterInheritProperty.Rotation) !== 0
        ? ParticleGenerator._eventRotation
        : undefined;
    const inheritedBounds = ParticleGenerator._tempVector33;
    inheritedBounds.set(0, 0, 0);
    const position = ParticleGenerator._tempVector30;
    const direction = ParticleGenerator._tempVector31;
    const inheritParentDirection =
      isSubEmitterSpawned && (subEmitterCommand.inheritProperties & ParticleSubEmitterInheritProperty.Velocity) !== 0;
    const configuredSizeBounds = inheritSize ? this._getConfiguredParticleSizeBoundsExtent() : 0;
    let eventSizeBounds = 0;
    for (let i = 0; i < count; i++) {
      if (shape?.enabled) {
        shape._generatePositionAndDirection(emission._shapeRand, playTime, position, direction);
        position.multiply(positionScale);
        direction.normalize().multiply(positionScale);
      } else {
        position.set(0, 0, 0);
        direction.set(0, 0, -1);
        if (simulationLocal) {
          direction.multiply(positionScale);
        }
      }

      const firstFreeElement = this._firstFreeElement;
      this._addNewParticle(
        position,
        direction,
        targetWorldPosition,
        targetWorldRotation,
        playTime,
        usesInitialInheritCurve,
        inheritedBounds,
        emitWorldPosition,
        inheritColor,
        inheritSize,
        inheritRotation,
        normalizedEmitAge,
        isSubEmitterSpawned,
        trajectoryTimeOffset,
        inheritParentDirection
      );
      if (inheritSize) {
        const particleOffset = firstFreeElement * ParticleBufferUtils.instanceVertexFloatStride;
        const instanceVertices = this._instanceVertices;
        eventSizeBounds = Math.max(
          eventSizeBounds,
          this._getParticleSizeBoundsExtent(
            instanceVertices[particleOffset + 12],
            instanceVertices[particleOffset + 13],
            instanceVertices[particleOffset + 14]
          ) - configuredSizeBounds
        );
      }
    }
    if (isSubEmitterSpawned) {
      this._activeSubEmitterParticleCount += count;
      this._recordSubEmitterTrajectoryBounds(playTime, subEmitterCommand, eventSizeBounds);
    } else if (!simulationLocal) {
      this._recordWorldEmissionBounds(playTime, emitWorldPosition, inheritedBounds, usesInitialInheritCurve);
    }
    return count;
  }

  private _ensureParticleCapacity(additionalCount: number): void {
    const requiredCapacity = this._getNotRetiredParticleCount() + additionalCount + 1;
    if (requiredCapacity > this._currentParticleCount) {
      const protectedRetiredCount = this._getRingDistance(this._firstRetiredElement, this._firstActiveElement);
      const maxCapacity = Math.max(Math.floor(this.main.maxParticles), 0) + protectedRetiredCount + 1;
      const increaseCount = Math.min(
        Math.max(requiredCapacity - this._currentParticleCount, ParticleGenerator._particleIncreaseCount),
        maxCapacity - this._currentParticleCount
      );
      this._resizeInstanceBuffer(this._currentParticleCount + increaseCount);
    }
  }

  private _prepareBirthRange(
    firstElement: number,
    endElement: number,
    frameLastPlayTime: number,
    framePlayTime: number,
    frameSimulationStart: number
  ): void {
    const floatStride = ParticleBufferUtils.instanceVertexFloatStride;
    const instanceVertices = this._instanceVertices;
    let ringIndex = firstElement;
    while (ringIndex !== endElement) {
      const particleOffset = ringIndex * floatStride;
      const lifetime = instanceVertices[particleOffset + ParticleBufferUtils.startLifeTimeOffset];
      const bornTime = instanceVertices[particleOffset + ParticleBufferUtils.timeOffset];
      this.subEmitters._prepareBirthCommandsForParticle(
        ringIndex,
        bornTime,
        lifetime,
        frameLastPlayTime,
        framePlayTime,
        frameSimulationStart
      );
      ringIndex = this._nextRingIndex(ringIndex);
    }
  }

  private _clearActiveParticles(): void {
    const incomingCommands = this._incomingSubEmitterCommands;
    for (let i = 0, n = incomingCommands.length; i < n; i++) {
      incomingCommands[i].release();
    }
    incomingCommands.length = 0;
    this._discardActiveParticles();
  }

  private _discardLostGPUParticleState(): void {
    if (
      this._instanceVertexBufferBinding.buffer.isContentLost &&
      !this._renderer.engine._isDeviceLost &&
      (this._feedbackSimulator || this._subEmitterSpawnState)
    ) {
      // GPU-generated state cannot be reconstructed from the CPU instance data
      this._discardActiveParticles();
      this._resizeInstanceBuffer(this._currentParticleCount);
    }
  }

  private _discardActiveParticles(): void {
    const firstFreeElement = this._firstFreeElement;
    this._firstRetiredElement = firstFreeElement;
    this._firstActiveElement = firstFreeElement;
    this._firstNewElement = firstFreeElement;
    this.subEmitters._retireAllBirthStates();
    this._resetEmissionBoundsState();
    this._activeSubEmitterParticleCount = 0;
    this._subEmitterSourceBoundsFrame = -1;
    this._resetTrajectoryFeedbackBaseline();
  }

  private _recordSubEmitterTrajectoryBounds(
    playTime: number,
    command: ParticleSubEmitterCommand,
    eventSizeBounds: number
  ): void {
    // The source snapshot is captured before retirement can collapse its bounds to the emitter position
    const source = command.source;
    const sourceRenderer = source._renderer;
    const sourceBounds =
      source._subEmitterSourceBoundsFrame === sourceRenderer.engine.time.frameCount
        ? source._subEmitterSourceBounds
        : sourceRenderer.bounds;
    const { min: sourceMin, max: sourceMax } = sourceBounds;
    const maxLifetime = this.main.startLifetime._getMax();
    const targetTransform = this._renderer.entity.transform;
    const inheritParentDirection = (command.inheritProperties & ParticleSubEmitterInheritProperty.Velocity) !== 0;
    const generatorBounds = this._getSubEmitterGeneratorBounds(
      maxLifetime,
      this.main._getPositionScale(),
      inheritParentDirection
    );
    const worldBounds = ParticleGenerator._tempEmissionBounds;

    let extraExtent = eventSizeBounds;
    if (inheritParentDirection) {
      const speedRange = ParticleGenerator._tempVector20;
      this._getExtremeValueFromZero(this.main.startSpeed, speedRange);
      extraExtent += Math.max(Math.abs(speedRange.x), Math.abs(speedRange.y)) * maxLifetime;
    }

    const inheritVelocity = this.inheritVelocity;
    let inheritedExtentX = 0;
    let inheritedExtentY = 0;
    let inheritedExtentZ = 0;
    if (inheritVelocity.enabled && inheritVelocity.mode === ParticleInheritVelocityMode.Initial) {
      const trajectoryDuration =
        command.isBirth === true ? command.getTrajectoryDuration() : command.trajectoryDuration;
      if (trajectoryDuration > MathUtil.zeroTolerance) {
        const trajectoryDisplacement = command.source._trajectoryFrameDisplacement;
        const factor = (inheritVelocity.curve._getMaxMagnitude() * maxLifetime) / trajectoryDuration;
        inheritedExtentX = trajectoryDisplacement.x * factor;
        inheritedExtentY = trajectoryDisplacement.y * factor;
        inheritedExtentZ = trajectoryDisplacement.z * factor;
      }
    }

    worldBounds.min.set(
      sourceMin.x - extraExtent - inheritedExtentX,
      sourceMin.y - extraExtent - inheritedExtentY,
      sourceMin.z - extraExtent - inheritedExtentZ
    );
    worldBounds.max.set(
      sourceMax.x + extraExtent + inheritedExtentX,
      sourceMax.y + extraExtent + inheritedExtentY,
      sourceMax.z + extraExtent + inheritedExtentZ
    );

    if (this.main.simulationSpace === ParticleSimulationSpace.Local) {
      const inverseTargetWorld = ParticleGenerator._tempMat;
      Matrix.affineTransformation(
        ParticleGenerator._tempVector34.set(1, 1, 1),
        targetTransform.worldRotationQuaternion,
        targetTransform.worldPosition,
        inverseTargetWorld
      );
      inverseTargetWorld.invert();
      BoundingBox.transform(worldBounds, inverseTargetWorld, worldBounds);
      worldBounds.min.add(generatorBounds.min);
      worldBounds.max.add(generatorBounds.max);
    } else {
      const sourceWorldMinX = worldBounds.min.x;
      const sourceWorldMinY = worldBounds.min.y;
      const sourceWorldMinZ = worldBounds.min.z;
      const sourceWorldMaxX = worldBounds.max.x;
      const sourceWorldMaxY = worldBounds.max.y;
      const sourceWorldMaxZ = worldBounds.max.z;
      this._calculateTransformedBounds(
        maxLifetime,
        generatorBounds,
        worldBounds,
        ParticleGenerator._tempVector34.set(0, 0, 0),
        targetTransform.worldRotationQuaternion
      );
      worldBounds.min.set(
        worldBounds.min.x + sourceWorldMinX,
        worldBounds.min.y + sourceWorldMinY,
        worldBounds.min.z + sourceWorldMinZ
      );
      worldBounds.max.set(
        worldBounds.max.x + sourceWorldMaxX,
        worldBounds.max.y + sourceWorldMaxY,
        worldBounds.max.z + sourceWorldMaxZ
      );
    }
    this._recordFixedEmissionBounds(playTime, maxLifetime, worldBounds);
  }

  private _recordFixedEmissionBounds(playTime: number, maxLifetime: number, bounds: BoundingBox): void {
    const record = ParticleGenerator._tempEmissionBoundsRecord;
    record.fill(0);
    const { min, max } = bounds;
    record[0] = min.x;
    record[1] = min.y;
    record[2] = min.z;
    record[3] = max.x;
    record[4] = max.y;
    record[5] = max.z;
    record[ParticleBufferUtils.boundsTimeOffset] = playTime;
    record[ParticleBufferUtils.boundsMaxLifetimeOffset] = maxLifetime;
    const axisReach = this._currentInheritedBoundsAxisReach;
    record[ParticleBufferUtils.boundsCurrentAxisReachOffset] = axisReach?.x ?? 0;
    record[ParticleBufferUtils.boundsCurrentAxisReachOffset + 1] = axisReach?.y ?? 0;
    record[ParticleBufferUtils.boundsCurrentAxisReachOffset + 2] = axisReach?.z ?? 0;
    record[ParticleBufferUtils.boundsCurrentPathReachOffset] = this._currentInheritedBoundsPathReach;
    this._storeEmissionBoundsRecord(record);
  }

  private _recordWorldEmissionBounds(
    playTime: number,
    worldPosition: Vector3 | undefined,
    inheritedBounds: Vector3,
    usesInitialInheritCurve: boolean
  ): void {
    const inheritedBoundsX = inheritedBounds.x;
    const inheritedBoundsY = inheritedBounds.y;
    const inheritedBoundsZ = inheritedBounds.z;
    const renderer = this._renderer;
    const maxLifetime = this.main.startLifetime._getMax();
    if (
      renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume) ||
      renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)
    ) {
      this._generateTransformedBounds();
    }
    const transformedBounds = renderer._transformedBounds;
    const {
      boundsTimeOffset,
      boundsMaxLifetimeOffset,
      boundsCurrentAxisReachOffset,
      boundsCurrentPathReachOffset,
      boundsInitialDisplacementOffset,
      boundsInitialFactorOffset
    } = ParticleBufferUtils;
    const record = ParticleGenerator._tempEmissionBoundsRecord;
    const emitterWorldPosition = renderer.entity.transform.worldPosition;
    const offsetX = worldPosition ? worldPosition.x - emitterWorldPosition.x : 0;
    const offsetY = worldPosition ? worldPosition.y - emitterWorldPosition.y : 0;
    const offsetZ = worldPosition ? worldPosition.z - emitterWorldPosition.z : 0;
    record[0] = transformedBounds.min.x + offsetX;
    record[1] = transformedBounds.min.y + offsetY;
    record[2] = transformedBounds.min.z + offsetZ;
    record[3] = transformedBounds.max.x + offsetX;
    record[4] = transformedBounds.max.y + offsetY;
    record[5] = transformedBounds.max.z + offsetZ;
    record[boundsTimeOffset] = playTime;
    record[boundsMaxLifetimeOffset] = maxLifetime;
    const axisReach = this._currentInheritedBoundsAxisReach;
    record[boundsCurrentAxisReachOffset] = axisReach?.x ?? 0;
    record[boundsCurrentAxisReachOffset + 1] = axisReach?.y ?? 0;
    record[boundsCurrentAxisReachOffset + 2] = axisReach?.z ?? 0;
    record[boundsCurrentPathReachOffset] = this._currentInheritedBoundsPathReach;
    record[boundsInitialDisplacementOffset] = inheritedBoundsX;
    record[boundsInitialDisplacementOffset + 1] = inheritedBoundsY;
    record[boundsInitialDisplacementOffset + 2] = inheritedBoundsZ;
    const hasInitialDisplacement = inheritedBoundsX !== 0 || inheritedBoundsY !== 0 || inheritedBoundsZ !== 0;
    record[boundsInitialFactorOffset] = hasInitialDisplacement
      ? usesInitialInheritCurve
        ? this.inheritVelocity.curve._getMaxMagnitude()
        : ParticleGenerator._bakedInitialVelocityFactor
      : 0;

    this._storeEmissionBoundsRecord(record);
  }

  private _storeEmissionBoundsRecord(record: Float32Array): void {
    const renderer = this._renderer;
    const frameCount = renderer.engine.time.frameCount;
    const {
      boundsFloatStride,
      boundsTimeOffset,
      boundsMaxLifetimeOffset,
      boundsCurrentAxisReachOffset,
      boundsCurrentPathReachOffset,
      boundsInitialDisplacementOffset,
      boundsInitialFactorOffset
    } = ParticleBufferUtils;
    const recordCount = this._emissionBoundsRecordCount;
    const sameFrame = frameCount === this._lastEmissionBoundsFrame;
    const expiry = record[boundsTimeOffset] + record[boundsMaxLifetimeOffset];
    let records = this._emissionBoundsRecords;
    let merged = false;
    this._lastEmissionBoundsFrame = frameCount;

    if (recordCount > 0) {
      const previousOffset = (recordCount - 1) * boundsFloatStride;
      const bakedFactor = ParticleGenerator._bakedInitialVelocityFactor;
      if (
        sameFrame &&
        records[previousOffset + boundsMaxLifetimeOffset] === record[boundsMaxLifetimeOffset] &&
        (records[previousOffset + boundsInitialFactorOffset] === bakedFactor) ===
          (record[boundsInitialFactorOffset] === bakedFactor)
      ) {
        for (let i = 0; i < 3; i++) {
          records[previousOffset + i] = Math.min(records[previousOffset + i], record[i]);
          records[previousOffset + i + 3] = Math.max(records[previousOffset + i + 3], record[i + 3]);
        }
        records[previousOffset + boundsTimeOffset] = Math.max(
          records[previousOffset + boundsTimeOffset],
          record[boundsTimeOffset]
        );
        for (let i = boundsCurrentAxisReachOffset; i <= boundsCurrentPathReachOffset; i++) {
          records[previousOffset + i] = Math.min(records[previousOffset + i], record[i]);
        }
        for (let i = boundsInitialDisplacementOffset; i < boundsFloatStride; i++) {
          records[previousOffset + i] = Math.max(records[previousOffset + i], record[i]);
        }
        merged = true;
      } else if (!sameFrame) {
        let sameRecord = true;
        for (let i = 0; i < boundsFloatStride; i++) {
          if (i !== boundsTimeOffset && records[previousOffset + i] !== record[i]) {
            sameRecord = false;
            break;
          }
        }
        if (sameRecord) {
          records[previousOffset + boundsTimeOffset] = Math.max(
            records[previousOffset + boundsTimeOffset],
            record[boundsTimeOffset]
          );
          merged = true;
        }
      }
    }

    if (!merged) {
      if (!records || recordCount * boundsFloatStride === records.length) {
        const lastCapacity = records ? records.length / boundsFloatStride : 0;
        const capacity = lastCapacity + Math.max(lastCapacity, ParticleGenerator._emissionBoundsIncreaseCount);
        const resizedRecords = new Float32Array(capacity * boundsFloatStride);
        if (records) {
          resizedRecords.set(records);
        }
        this._emissionBoundsRecords = records = resizedRecords;
      }
      records.set(record, recordCount * boundsFloatStride);
      this._emissionBoundsRecordCount = recordCount + 1;
    }
    this._nextEmissionBoundsExpiry = Math.min(this._nextEmissionBoundsExpiry, expiry);
    renderer._onWorldVolumeChanged();
  }

  private _resetEmissionBoundsState(): void {
    this._emissionBoundsRecordCount = 0;
    this._nextEmissionBoundsExpiry = Infinity;
    this._lastEmissionBoundsFrame = -1;
    this._currentInheritedBoundsAxisReach?.set(0, 0, 0);
    this._currentInheritedBoundsPathReach = 0;
    this._lastInitialCurveBoundsFactor = 0;
    this._renderer._onWorldVolumeChanged();
  }

  private _captureTrajectoryBounds(resetBaseline: boolean): void {
    const renderer = this._renderer;
    const currentBounds =
      this._subEmitterSourceBoundsFrame === renderer.engine.time.frameCount
        ? this._subEmitterSourceBounds
        : renderer.bounds;
    const currentMin = currentBounds.min;
    const currentMax = currentBounds.max;
    let previousBounds = this._previousTrajectoryBounds;
    const displacement = (this._trajectoryFrameDisplacement ||= new Vector3());
    if (previousBounds && !resetBaseline) {
      const previousMin = previousBounds.min;
      const previousMax = previousBounds.max;
      displacement.set(
        Math.max(Math.abs(currentMin.x - previousMax.x), Math.abs(currentMax.x - previousMin.x)),
        Math.max(Math.abs(currentMin.y - previousMax.y), Math.abs(currentMax.y - previousMin.y)),
        Math.max(Math.abs(currentMin.z - previousMax.z), Math.abs(currentMax.z - previousMin.z))
      );
    } else {
      previousBounds ??= this._previousTrajectoryBounds = new BoundingBox();
      displacement.set(currentMax.x - currentMin.x, currentMax.y - currentMin.y, currentMax.z - currentMin.z);
    }
    previousBounds.copyFrom(currentBounds);
  }

  private _resetTrajectoryFeedbackBaseline(): void {
    if (this._resetTrajectoryOnNextFeedback) {
      return;
    }
    this._resetTrajectoryOnNextFeedback = true;
    this._trajectoryFrameDisplacement?.set(0, 0, 0);
  }

  private _captureSubEmitterSourceBounds(): void {
    const renderer = this._renderer;
    const frameCount = renderer.engine.time.frameCount;
    const currentBounds = renderer.bounds;
    let sourceBounds = this._subEmitterSourceBounds;
    if (sourceBounds && this._subEmitterSourceBoundsFrame === frameCount) {
      BoundingBox.merge(sourceBounds, currentBounds, sourceBounds);
    } else {
      sourceBounds = this._subEmitterSourceBounds ||= new BoundingBox();
      sourceBounds.copyFrom(currentBounds);
      this._subEmitterSourceBoundsFrame = frameCount;
    }
  }

  private _retireExpiredParticles(endElement: number): void {
    const instanceVertices = this._instanceVertices;
    const playTime = Math.fround(this._playTime);

    let ringIndex = this._firstActiveElement;
    while (ringIndex !== endElement) {
      const particleOffset = ringIndex * ParticleBufferUtils.instanceVertexFloatStride;
      const bornTime = instanceVertices[particleOffset + ParticleBufferUtils.timeOffset];
      const lifetime = instanceVertices[particleOffset + ParticleBufferUtils.startLifeTimeOffset];
      // Match GPU float precision at the lifetime boundary
      if (Math.fround(playTime - bornTime) < lifetime) {
        break;
      }

      this._firstActiveElement = ringIndex = this._nextRingIndex(ringIndex);
    }
  }

  private _finalizeRetiredParticles(
    hasDeathSubEmitter: boolean,
    frameLastPlayTime: number,
    frameSimulationStart: number
  ): boolean {
    const instanceVertices = this._instanceVertices;
    const framePlayTimeDelta = this._playTime - frameLastPlayTime;

    let ringIndex = this._firstRetiredElement;
    const firstActiveElement = this._firstActiveElement;
    const hasRetiredParticles = ringIndex !== firstActiveElement;
    while (ringIndex !== firstActiveElement) {
      const activeParticleOffset = ringIndex * ParticleBufferUtils.instanceVertexFloatStride;
      const bornTime = instanceVertices[activeParticleOffset + ParticleBufferUtils.timeOffset];
      const lifetime = instanceVertices[activeParticleOffset + ParticleBufferUtils.startLifeTimeOffset];

      if (instanceVertices[activeParticleOffset + ParticleBufferUtils.inheritVelocityRandomOffset] < 0) {
        this._activeSubEmitterParticleCount--;
      }

      if (hasDeathSubEmitter) {
        const activeFrameTime =
          framePlayTimeDelta > MathUtil.zeroTolerance
            ? MathUtil.clamp((bornTime + lifetime - frameLastPlayTime) / framePlayTimeDelta, 0, 1)
            : 1;
        const frameTime = frameSimulationStart + activeFrameTime * (1 - frameSimulationStart);
        const frameStartAge = MathUtil.clamp(frameLastPlayTime - bornTime, 0, lifetime);
        this.subEmitters._prepareDeathCommands(ringIndex, frameTime, lifetime - frameStartAge);
      }

      this.subEmitters._retireParticle(ringIndex);
      ringIndex = this._nextRingIndex(ringIndex);
    }
    return hasRetiredParticles;
  }

  private _releaseSubEmitterSpawnStateIfUnused(): void {
    const state = this._subEmitterSpawnState;
    if (this._activeSubEmitterParticleCount > 0 || !state) {
      return;
    }

    this._renderer.shaderData.disableMacro(ParticleGenerator._hasSubEmitterSpawnedParticlesMacro);
    state.destroy();
    this._subEmitterSpawnState = null;
    this.inheritVelocity._updateShaderData(this._renderer.shaderData, false);
    this._reorganizeGeometryBuffers();
  }

  private _ensureSubEmitterSpawnState(): void {
    if (this._subEmitterSpawnState) {
      return;
    }

    this._subEmitterSpawnState = new ParticleSubEmitterSpawnState(
      this._renderer.engine,
      this._currentParticleCount,
      !this._feedbackSimulator
    );
    this._renderer.shaderData.enableMacro(ParticleGenerator._hasSubEmitterSpawnedParticlesMacro);
    this._reorganizeGeometryBuffers();
  }

  private _getRingDistance(firstElement: number, endElement: number): number {
    return endElement >= firstElement
      ? endElement - firstElement
      : this._currentParticleCount - firstElement + endElement;
  }

  private _getNotRetiredParticleCount(): number {
    return this._getRingDistance(this._firstRetiredElement, this._firstFreeElement);
  }

  private _getFramePlayTime(frameTime: number, lastPlayTime: number, frameSimulationStart: number): number {
    const simulationFrameDuration = 1 - frameSimulationStart;
    if (simulationFrameDuration <= MathUtil.zeroTolerance || frameTime <= frameSimulationStart) {
      return lastPlayTime;
    }
    const simulationProgress = Math.min((frameTime - frameSimulationStart) / simulationFrameDuration, 1);
    return lastPlayTime + (this._playTime - lastPlayTime) * simulationProgress;
  }

  private _nextRingIndex(ringIndex: number): number {
    return ringIndex + 1 < this._currentParticleCount ? ringIndex + 1 : 0;
  }

  private _evaluateOverLifetime(
    instanceVertices: Float32Array,
    particleOffset: number,
    normalizedAge: number,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3
  ): void {
    let r = instanceVertices[particleOffset + 8];
    let g = instanceVertices[particleOffset + 9];
    let b = instanceVertices[particleOffset + 10];
    let a = instanceVertices[particleOffset + 11];
    const col = this.colorOverLifetime;
    if (col.enabled) {
      const colorFactor = ParticleGenerator._tempColor;
      col.color.evaluate(normalizedAge, instanceVertices[particleOffset + 20], colorFactor);
      r *= colorFactor.r;
      g *= colorFactor.g;
      b *= colorFactor.b;
      a *= colorFactor.a;
    }
    parentColor.set(r, g, b, a);

    let sx = instanceVertices[particleOffset + 12];
    let sy = instanceVertices[particleOffset + 13];
    let sz = instanceVertices[particleOffset + 14];
    const sol = this.sizeOverLifetime;
    // SOL only contributes in Curve / TwoCurves modes (shader gates on RENDERER_SOL_CURVE_MODE)
    if (sol.enabled && (sol.sizeX.mode === ParticleCurveMode.Curve || sol.sizeX.mode === ParticleCurveMode.TwoCurves)) {
      const sizeRand = instanceVertices[particleOffset + 21];
      if (sol.separateAxes) {
        sx *= sol.sizeX.evaluate(normalizedAge, sizeRand);
        sy *= sol.sizeY.evaluate(normalizedAge, sizeRand);
        sz *= sol.sizeZ.evaluate(normalizedAge, sizeRand);
      } else {
        const factor = sol.sizeX.evaluate(normalizedAge, sizeRand);
        sx *= factor;
        sy *= factor;
        sz *= factor;
      }
    }
    parentSize.set(sx, sy, sz);

    let rx = instanceVertices[particleOffset + 15];
    let ry = instanceVertices[particleOffset + 16];
    let rz = instanceVertices[particleOffset + 17];
    const rol = this.rotationOverLifetime;
    if (rol.enabled) {
      const rotRand = instanceVertices[particleOffset + 22];
      const lifetime = instanceVertices[particleOffset + 3];
      const rolZ = rol.rotationZ._evaluateCumulative(normalizedAge, rotRand) * lifetime;
      if (rol.separateAxes) {
        rx += rol.rotationX._evaluateCumulative(normalizedAge, rotRand) * lifetime;
        ry += rol.rotationY._evaluateCumulative(normalizedAge, rotRand) * lifetime;
        rz += rolZ;
      } else if (this.main.startRotation3D) {
        rz += rolZ;
      } else {
        rx += rolZ; // 2D rotation: shader stores the Z angle in a_StartRotation0.x
      }
    }
    parentRotation.set(rx, ry, rz);
  }

  private _freeRetiredParticles(): void {
    this._firstRetiredElement = this._firstActiveElement;
  }

  private _addActiveParticlesToVertexBuffer(): void {
    const firstUploadElement =
      this._feedbackSimulator?.trajectoryEnabled && this._instanceBufferResized
        ? this._firstRetiredElement
        : this._firstActiveElement;
    const firstFreeElement = this._firstFreeElement;

    if (firstUploadElement === firstFreeElement) {
      this._firstNewElement = firstFreeElement;
      this._instanceBufferResized = false;
      return;
    }

    const byteStride = ParticleBufferUtils.instanceVertexStride;
    const instanceBuffer = this._instanceVertexBufferBinding.buffer;
    const dataBuffer = this._instanceVertices.buffer;

    // Feedback mode: upload in-place (indices match feedback buffer slots)
    // Non-feedback mode: compact to GPU offset 0
    const compact = !this._feedbackSimulator;
    const start = firstUploadElement * byteStride;
    if (firstUploadElement < firstFreeElement) {
      instanceBuffer.setData(
        dataBuffer as ArrayBuffer,
        compact ? 0 : start,
        start,
        (firstFreeElement - firstUploadElement) * byteStride,
        SetDataOptions.Discard
      );
    } else {
      const firstSegmentSize = (this._currentParticleCount - firstUploadElement) * byteStride;
      instanceBuffer.setData(
        dataBuffer as ArrayBuffer,
        compact ? 0 : start,
        start,
        firstSegmentSize,
        SetDataOptions.Discard
      );
      if (firstFreeElement > 0) {
        instanceBuffer.setData(
          dataBuffer as ArrayBuffer,
          compact ? firstSegmentSize : 0,
          0,
          firstFreeElement * byteStride
        );
      }
    }
    if (compact) {
      this._subEmitterSpawnState?.copyActiveRangeForRendering(this._firstActiveElement, firstFreeElement);
    }
    this._firstNewElement = firstFreeElement;
    this._instanceBufferResized = false;
  }

  private _addVertexBufferBindingsFilterDuplicate(
    vertexBufferBinding: VertexBufferBinding,
    out: VertexBufferBinding[]
  ): number {
    let index = 0;
    for (let n = out.length; index < n; index++) {
      if (out[index] === vertexBufferBinding) {
        return index;
      }
    }
    out.push(vertexBufferBinding);
    return index;
  }

  private _accumulateCurrentInheritedBounds(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }
    const velocity = ParticleGenerator._tempVector34;
    if (!this.inheritVelocity._getCurrentBoundsVelocity(velocity)) {
      return;
    }
    const axisReach = (this._currentInheritedBoundsAxisReach ||= new Vector3());
    axisReach.set(
      axisReach.x + velocity.x * deltaTime,
      axisReach.y + velocity.y * deltaTime,
      axisReach.z + velocity.z * deltaTime
    );
    this._currentInheritedBoundsPathReach += velocity.length() * deltaTime;
    this._renderer._onWorldVolumeChanged();
  }

  private _preserveInitialCurveBoundsFactor(factor: number): void {
    const factorOffset = ParticleBufferUtils.boundsInitialFactorOffset;
    const displacementOffset = ParticleBufferUtils.boundsInitialDisplacementOffset;
    const boundsArray = this._emissionBoundsRecords;
    const count = this._emissionBoundsRecordCount;
    for (let index = 0; index < count; index++) {
      const offset = index * ParticleBufferUtils.boundsFloatStride;
      if (
        boundsArray[offset + factorOffset] !== ParticleGenerator._bakedInitialVelocityFactor &&
        (boundsArray[offset + displacementOffset] !== 0 ||
          boundsArray[offset + displacementOffset + 1] !== 0 ||
          boundsArray[offset + displacementOffset + 2] !== 0)
      ) {
        boundsArray[offset + factorOffset] = Math.max(boundsArray[offset + factorOffset], factor);
      }
    }
  }

  private _retireEmissionBounds(): void {
    const playTime = this._playTime;
    if (playTime <= this._nextEmissionBoundsExpiry) {
      return;
    }

    const { boundsFloatStride, boundsTimeOffset, boundsMaxLifetimeOffset } = ParticleBufferUtils;
    const boundsArray = this._emissionBoundsRecords;
    let recordCount = this._emissionBoundsRecordCount;
    let retired = false;
    let nextExpiry = Infinity;
    let index = 0;
    while (index < recordCount) {
      const offset = index * boundsFloatStride;
      const expiry = boundsArray[offset + boundsTimeOffset] + boundsArray[offset + boundsMaxLifetimeOffset];
      if (playTime > expiry) {
        retired = true;
        recordCount--;
        if (index < recordCount) {
          const lastOffset = recordCount * boundsFloatStride;
          boundsArray.copyWithin(offset, lastOffset, lastOffset + boundsFloatStride);
        }
      } else {
        nextExpiry = Math.min(nextExpiry, expiry);
        index++;
      }
    }
    this._emissionBoundsRecordCount = recordCount;
    this._nextEmissionBoundsExpiry = nextExpiry;
    if (retired) {
      this._renderer._onWorldVolumeChanged();
    }
    if (recordCount === 0) {
      this._currentInheritedBoundsAxisReach?.set(0, 0, 0);
      this._currentInheritedBoundsPathReach = 0;
    }
  }

  private _mergeLocalEmissionBounds(bounds: BoundingBox): number {
    const boundsArray = this._emissionBoundsRecords;
    const { min, max } = bounds;
    let maxLifetime = 0;
    for (let index = 0, n = this._emissionBoundsRecordCount; index < n; index++) {
      const offset = index * ParticleBufferUtils.boundsFloatStride;
      min.set(
        Math.min(min.x, boundsArray[offset]),
        Math.min(min.y, boundsArray[offset + 1]),
        Math.min(min.z, boundsArray[offset + 2])
      );
      max.set(
        Math.max(max.x, boundsArray[offset + 3]),
        Math.max(max.y, boundsArray[offset + 4]),
        Math.max(max.z, boundsArray[offset + 5])
      );
      maxLifetime = Math.max(maxLifetime, boundsArray[offset + ParticleBufferUtils.boundsMaxLifetimeOffset]);
    }
    return maxLifetime;
  }

  private _getSubEmitterGeneratorBounds(
    maxLifetime: number,
    positionScale: Vector3,
    inheritParentDirection: boolean
  ): BoundingBox {
    const renderer = this._renderer;
    const generatorBounds = renderer._generatorBounds;
    if (!inheritParentDirection && positionScale.x === 1 && positionScale.y === 1 && positionScale.z === 1) {
      if (renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume)) {
        this._calculateGeneratorBounds(maxLifetime, generatorBounds, true);
        renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
      }
      return generatorBounds;
    }

    const scaledBounds = ParticleGenerator._tempEmissionBounds1;
    this._calculateGeneratorBounds(maxLifetime, scaledBounds, !inheritParentDirection, positionScale);
    return scaledBounds;
  }

  private _calculateGeneratorBounds(
    maxLifetime: number,
    bounds: BoundingBox,
    includeStartSpeed: boolean,
    positionScale?: Vector3
  ): void {
    const { _tempVector30: directionMax, _tempVector31: directionMin, _tempVector20: speedMinMax } = ParticleGenerator;
    const { min, max } = bounds;
    const { main } = this;

    // Shape position and initial velocity
    const { shape } = this.emission;
    if (shape?.enabled) {
      shape._getPositionRange(bounds);
      if (includeStartSpeed) {
        shape._getDirectionRange(directionMin, directionMax);
      }
      if (positionScale) {
        ParticleGenerator._scaleRange(min, max, positionScale);
        if (includeStartSpeed) {
          ParticleGenerator._scaleRange(directionMin, directionMax, positionScale);
        }
      }
    } else {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
      if (includeStartSpeed) {
        directionMin.set(0, 0, -1);
        directionMax.set(0, 0, 0);
        if (positionScale && main.simulationSpace === ParticleSimulationSpace.Local) {
          ParticleGenerator._scaleRange(directionMin, directionMax, positionScale);
        }
      }
    }
    if (includeStartSpeed) {
      this._getExtremeValueFromZero(main.startSpeed, speedMinMax);

      const { x: speedMin, y: speedMax } = speedMinMax;
      const { x: dirMinX, y: dirMinY, z: dirMinZ } = directionMin;
      const { x: dirMaxX, y: dirMaxY, z: dirMaxZ } = directionMax;

      min.set(
        min.x + Math.min(dirMinX * speedMax, dirMaxX * speedMin) * maxLifetime,
        min.y + Math.min(dirMinY * speedMax, dirMaxY * speedMin) * maxLifetime,
        min.z + Math.min(dirMinZ * speedMax, dirMaxZ * speedMin) * maxLifetime
      );

      max.set(
        max.x + Math.max(dirMinX * speedMin, dirMaxX * speedMax) * maxLifetime,
        max.y + Math.max(dirMinY * speedMin, dirMaxY * speedMax) * maxLifetime,
        max.z + Math.max(dirMinZ * speedMin, dirMaxZ * speedMax) * maxLifetime
      );
    }

    const maxSize = this._getConfiguredParticleSizeBoundsExtent();

    min.set(min.x - maxSize, min.y - maxSize, min.z - maxSize);
    max.set(max.x + maxSize, max.y + maxSize, max.z + maxSize);
  }

  private static _scaleRange(min: Vector3, max: Vector3, scale: Vector3): void {
    const minX = min.x * scale.x;
    const minY = min.y * scale.y;
    const minZ = min.z * scale.z;
    const maxX = max.x * scale.x;
    const maxY = max.y * scale.y;
    const maxZ = max.z * scale.z;
    min.set(Math.min(minX, maxX), Math.min(minY, maxY), Math.min(minZ, maxZ));
    max.set(Math.max(minX, maxX), Math.max(minY, maxY), Math.max(minZ, maxZ));
  }

  private _getConfiguredParticleSizeBoundsExtent(): number {
    const { main } = this;
    return this._getParticleSizeBoundsExtent(
      main.startSizeX._getMax(),
      main.startSizeY._getMax(),
      main.startSizeZ._getMax()
    );
  }

  private _getParticleSizeBoundsExtent(sizeX: number, sizeY: number, sizeZ: number): number {
    const { main, sizeOverLifetime } = this;
    let maxSize = Math.abs(sizeX);
    if (main.startSize3D) {
      maxSize = Math.max(maxSize, Math.abs(sizeY));
      if (this._renderer.renderMode === ParticleRenderMode.Mesh) {
        maxSize = Math.max(maxSize, Math.abs(sizeZ));
      }
    }

    if (sizeOverLifetime.enabled) {
      let maxSizeOverLifetime = sizeOverLifetime.size._getMax();
      if (sizeOverLifetime.separateAxes) {
        maxSizeOverLifetime = Math.max(
          maxSizeOverLifetime,
          sizeOverLifetime.sizeY._getMax(),
          sizeOverLifetime.sizeZ._getMax()
        );
      }
      maxSize *= maxSizeOverLifetime;
    }
    return maxSize * 1.414;
  }

  private _mergeWorldEmissionBounds(
    bounds: BoundingBox,
    useOrbitalBounds: boolean,
    currentInheritedVelocity: Vector3,
    currentInheritedSpeed: number
  ): number {
    const boundsArray = this._emissionBoundsRecords;
    const { min, max } = bounds;
    const extent = ParticleGenerator._tempVector34;
    let maxLifetime = 0;
    for (let i = 0, n = this._emissionBoundsRecordCount; i < n; i++) {
      const offset = i * ParticleBufferUtils.boundsFloatStride;
      this._getInheritedBoundsExtent(offset, useOrbitalBounds, currentInheritedVelocity, currentInheritedSpeed, extent);
      min.set(
        Math.min(min.x, boundsArray[offset] - extent.x),
        Math.min(min.y, boundsArray[offset + 1] - extent.y),
        Math.min(min.z, boundsArray[offset + 2] - extent.z)
      );
      max.set(
        Math.max(max.x, boundsArray[offset + 3] + extent.x),
        Math.max(max.y, boundsArray[offset + 4] + extent.y),
        Math.max(max.z, boundsArray[offset + 5] + extent.z)
      );
      maxLifetime = Math.max(maxLifetime, boundsArray[offset + ParticleBufferUtils.boundsMaxLifetimeOffset]);
    }
    return maxLifetime;
  }

  private _getInheritedBoundsExtent(
    offset: number,
    useOrbitalBounds: boolean,
    currentInheritedVelocity: Vector3,
    currentInheritedSpeed: number,
    out: Vector3
  ): void {
    const boundsArray = this._emissionBoundsRecords;
    const currentAxisReachOffset = ParticleBufferUtils.boundsCurrentAxisReachOffset;
    const currentAxisReach = this._currentInheritedBoundsAxisReach;
    const currentX = Math.max((currentAxisReach?.x ?? 0) - boundsArray[offset + currentAxisReachOffset], 0);
    const currentY = Math.max((currentAxisReach?.y ?? 0) - boundsArray[offset + currentAxisReachOffset + 1], 0);
    const currentZ = Math.max((currentAxisReach?.z ?? 0) - boundsArray[offset + currentAxisReachOffset + 2], 0);
    const initialDisplacementOffset = ParticleBufferUtils.boundsInitialDisplacementOffset;
    const storedInitialFactor = boundsArray[offset + ParticleBufferUtils.boundsInitialFactorOffset];
    const initialFactor =
      storedInitialFactor === ParticleGenerator._bakedInitialVelocityFactor ? 1 : storedInitialFactor;
    const initialX = boundsArray[offset + initialDisplacementOffset] * initialFactor;
    const initialY = boundsArray[offset + initialDisplacementOffset + 1] * initialFactor;
    const initialZ = boundsArray[offset + initialDisplacementOffset + 2] * initialFactor;
    const remainingLifetime = Math.max(
      boundsArray[offset + ParticleBufferUtils.boundsMaxLifetimeOffset] -
        (this._playTime - boundsArray[offset + ParticleBufferUtils.boundsTimeOffset]),
      0
    );
    if (useOrbitalBounds) {
      const currentReach = Math.max(
        this._currentInheritedBoundsPathReach - boundsArray[offset + ParticleBufferUtils.boundsCurrentPathReachOffset],
        0
      );
      const initialReach = Math.sqrt(initialX * initialX + initialY * initialY + initialZ * initialZ);
      const reach = currentReach + currentInheritedSpeed * remainingLifetime + initialReach;
      out.set(reach, reach, reach);
    } else {
      out.set(
        currentX + currentInheritedVelocity.x * remainingLifetime + initialX,
        currentY + currentInheritedVelocity.y * remainingLifetime + initialY,
        currentZ + currentInheritedVelocity.z * remainingLifetime + initialZ
      );
    }
  }

  private _calculateTransformedBounds(
    maxLifetime: number,
    origin: BoundingBox,
    out: BoundingBox,
    worldPositionOverride?: Vector3,
    worldRotationOverride?: Quaternion
  ): void {
    const {
      _tempVector20: velMinMaxX,
      _tempVector21: velMinMaxY,
      _tempVector22: velMinMaxZ,
      _tempVector30: worldOffsetMin,
      _tempVector31: worldOffsetMax,
      _tempVector32: noiseBoundsExtents,
      _tempMat: rotateMat
    } = ParticleGenerator;
    worldOffsetMin.set(0, 0, 0);
    worldOffsetMax.set(0, 0, 0);

    const { transform } = this._renderer.entity;
    const worldPosition = worldPositionOverride ?? transform.worldPosition;
    Matrix.rotationQuaternion(worldRotationOverride ?? transform.worldRotationQuaternion, rotateMat);

    const { min, max } = out;
    min.copyFrom(origin.min);
    max.copyFrom(origin.max);

    const { velocityOverLifetime } = this;
    if (velocityOverLifetime.enabled) {
      this._getExtremeValueFromZero(velocityOverLifetime.velocityX, velMinMaxX);
      this._getExtremeValueFromZero(velocityOverLifetime.velocityY, velMinMaxY);
      this._getExtremeValueFromZero(velocityOverLifetime.velocityZ, velMinMaxZ);

      velMinMaxX.scale(maxLifetime);
      velMinMaxY.scale(maxLifetime);
      velMinMaxZ.scale(maxLifetime);

      if (velocityOverLifetime.space === ParticleSimulationSpace.Local) {
        min.set(min.x + velMinMaxX.x, min.y + velMinMaxY.x, min.z + velMinMaxZ.x);
        max.set(max.x + velMinMaxX.y, max.y + velMinMaxY.y, max.z + velMinMaxZ.y);
      } else {
        worldOffsetMin.set(
          worldOffsetMin.x + velMinMaxX.x,
          worldOffsetMin.y + velMinMaxY.x,
          worldOffsetMin.z + velMinMaxZ.x
        );
        worldOffsetMax.set(
          worldOffsetMax.x + velMinMaxX.y,
          worldOffsetMax.y + velMinMaxY.y,
          worldOffsetMax.z + velMinMaxZ.y
        );
      }
    }

    const { forceOverLifetime } = this;
    if (forceOverLifetime.enabled) {
      const {
        _tempVector20: forceMinMaxX,
        _tempVector21: forceMinMaxY,
        _tempVector22: forceMinMaxZ
      } = ParticleGenerator;
      this._getExtremeValueFromZero(forceOverLifetime.forceX, forceMinMaxX);
      this._getExtremeValueFromZero(forceOverLifetime.forceY, forceMinMaxY);
      this._getExtremeValueFromZero(forceOverLifetime.forceZ, forceMinMaxZ);

      const coefficient = 0.5 * maxLifetime * maxLifetime;
      forceMinMaxX.scale(coefficient);
      forceMinMaxY.scale(coefficient);
      forceMinMaxZ.scale(coefficient);

      if (forceOverLifetime.space === ParticleSimulationSpace.Local) {
        min.set(min.x + forceMinMaxX.x, min.y + forceMinMaxY.x, min.z + forceMinMaxZ.x);
        max.set(max.x + forceMinMaxX.y, max.y + forceMinMaxY.y, max.z + forceMinMaxZ.y);
      } else {
        worldOffsetMin.set(
          worldOffsetMin.x + forceMinMaxX.x,
          worldOffsetMin.y + forceMinMaxY.x,
          worldOffsetMin.z + forceMinMaxZ.x
        );
        worldOffsetMax.set(
          worldOffsetMax.x + forceMinMaxX.y,
          worldOffsetMax.y + forceMinMaxY.y,
          worldOffsetMax.z + forceMinMaxZ.y
        );
      }
    }

    const { noise } = this;
    this._getNoiseBoundsExtents(maxLifetime, noiseBoundsExtents);

    const needTransformFeedback = velocityOverLifetime._needTransformFeedback();
    const orbitalActive = needTransformFeedback && velocityOverLifetime._isOrbitalActive();
    if (needTransformFeedback) {
      const centerOffset = velocityOverLifetime.centerOffset;
      let radialReach = 0;
      if (velocityOverLifetime._isRadialActive()) {
        this._getExtremeValueFromZero(velocityOverLifetime.radial, velMinMaxX);
        radialReach = Math.max(Math.abs(velMinMaxX.x), Math.abs(velMinMaxX.y)) * maxLifetime;
      }
      if (orbitalActive) {
        const dx = Math.max(Math.abs(min.x - centerOffset.x), Math.abs(max.x - centerOffset.x));
        const dy = Math.max(Math.abs(min.y - centerOffset.y), Math.abs(max.y - centerOffset.y));
        const dz = Math.max(Math.abs(min.z - centerOffset.z), Math.abs(max.z - centerOffset.z));
        const worldReach = this._getRangeReach(worldOffsetMin, worldOffsetMax);
        const noiseReach = this._getVectorReach(noiseBoundsExtents);
        const gravityReach = this._getGravityBoundsReach(maxLifetime);
        const reach = Math.sqrt(dx * dx + dy * dy + dz * dz) + worldReach + noiseReach + gravityReach + radialReach;
        min.set(
          Math.min(min.x, centerOffset.x - reach),
          Math.min(min.y, centerOffset.y - reach),
          Math.min(min.z, centerOffset.z - reach)
        );
        max.set(
          Math.max(max.x, centerOffset.x + reach),
          Math.max(max.y, centerOffset.y + reach),
          Math.max(max.z, centerOffset.z + reach)
        );
      } else if (radialReach > 0) {
        min.set(min.x - radialReach, min.y - radialReach, min.z - radialReach);
        max.set(max.x + radialReach, max.y + radialReach, max.z + radialReach);
      }
    }

    out.transform(rotateMat);
    if (!orbitalActive) {
      min.add(worldOffsetMin);
      max.add(worldOffsetMax);

      if (noise.enabled) {
        min.set(min.x - noiseBoundsExtents.x, min.y - noiseBoundsExtents.y, min.z - noiseBoundsExtents.z);
        max.set(max.x + noiseBoundsExtents.x, max.y + noiseBoundsExtents.y, max.z + noiseBoundsExtents.z);
      }
    }

    min.add(worldPosition);
    max.add(worldPosition);
  }

  private _useOrbitalBounds(): boolean {
    const { velocityOverLifetime } = this;
    return velocityOverLifetime._needTransformFeedback() && velocityOverLifetime._isOrbitalActive();
  }

  private _getNoiseBoundsExtents(maxLifetime: number, out: Vector3): void {
    const { noise } = this;
    if (!noise.enabled) {
      out.set(0, 0, 0);
      return;
    }

    let noiseMaxX: number, noiseMaxY: number, noiseMaxZ: number;
    if (noise.separateAxes) {
      noiseMaxX = noise.strengthX._getMaxMagnitude();
      noiseMaxY = noise.strengthY._getMaxMagnitude();
      noiseMaxZ = noise.strengthZ._getMaxMagnitude();
    } else {
      noiseMaxX = noiseMaxY = noiseMaxZ = noise.strengthX._getMaxMagnitude();
    }
    out.set(noiseMaxX * maxLifetime, noiseMaxY * maxLifetime, noiseMaxZ * maxLifetime);
  }

  private _getGravityBoundsReach(maxLifetime: number): number {
    const modifierMinMax = ParticleGenerator._tempVector20;
    this._getExtremeValueFromZero(this.main.gravityModifier, modifierMinMax);

    const coefficient = 0.5 * maxLifetime * maxLifetime;
    const minGravityEffect = modifierMinMax.x * coefficient;
    const maxGravityEffect = modifierMinMax.y * coefficient;
    const { x, y, z } = this._renderer.scene.physics.gravity;

    const gravityBoundsExtents = ParticleGenerator._tempVector33;
    gravityBoundsExtents.set(
      Math.max(Math.abs(x * minGravityEffect), Math.abs(x * maxGravityEffect)),
      Math.max(Math.abs(y * minGravityEffect), Math.abs(y * maxGravityEffect)),
      Math.max(Math.abs(z * minGravityEffect), Math.abs(z * maxGravityEffect))
    );
    return this._getVectorReach(gravityBoundsExtents);
  }

  private _getRangeReach(min: Vector3, max: Vector3): number {
    const x = Math.max(Math.abs(min.x), Math.abs(max.x));
    const y = Math.max(Math.abs(min.y), Math.abs(max.y));
    const z = Math.max(Math.abs(min.z), Math.abs(max.z));
    return Math.sqrt(x * x + y * y + z * z);
  }

  private _getVectorReach(value: Vector3): number {
    return Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
  }

  private _addGravityToBounds(maxLifetime: number, origin: BoundingBox, out: BoundingBox): void {
    const { min: originMin, max: originMax } = origin;
    const modifierMinMax = ParticleGenerator._tempVector20;

    // Gravity modifier impact
    this._getExtremeValueFromZero(this.main.gravityModifier, modifierMinMax);
    const { x, y, z } = this._renderer.scene.physics.gravity;

    const coefficient = 0.5 * maxLifetime * maxLifetime;

    const minGravityEffect = modifierMinMax.x * coefficient;
    const maxGravityEffect = modifierMinMax.y * coefficient;

    const gravityEffectMinX = x * minGravityEffect;
    const gravityEffectMaxX = x * maxGravityEffect;

    const gravityEffectMinY = y * minGravityEffect;
    const gravityEffectMaxY = y * maxGravityEffect;

    const gravityEffectMinZ = z * minGravityEffect;
    const gravityEffectMaxZ = z * maxGravityEffect;

    // `origin` and `out` maybe is same reference
    out.min.set(
      Math.min(gravityEffectMinX, gravityEffectMaxX) + originMin.x,
      Math.min(gravityEffectMinY, gravityEffectMaxY) + originMin.y,
      Math.min(gravityEffectMinZ, gravityEffectMaxZ) + originMin.z
    );

    out.max.set(
      Math.max(gravityEffectMinX, gravityEffectMaxX) + originMax.x,
      Math.max(gravityEffectMinY, gravityEffectMaxY) + originMax.y,
      Math.max(gravityEffectMinZ, gravityEffectMaxZ) + originMax.z
    );
  }

  private _getExtremeValueFromZero(curve: ParticleCompositeCurve, out: Vector2): void {
    curve._getMinMax(out);
    out.x = Math.min(0, out.x);
    out.y = Math.max(0, out.y);
  }
}
