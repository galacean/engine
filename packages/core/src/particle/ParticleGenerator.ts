import { DataObject } from "../base/DataObject";
import { BoundingBox, Color, MathUtil, Matrix, Quaternion, Vector2, Vector3 } from "@galacean/engine-math";
import { ignoreClone } from "../clone/CloneDecorators";
import type { ICloneHook } from "../clone/ICloneHook";
import { Primitive } from "../graphic/Primitive";
import { SubMesh } from "../graphic/SubMesh";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { MeshRenderer, VertexAttribute } from "../mesh";
import { ShaderData } from "../shader";
import { ShaderMacro } from "../shader/ShaderMacro";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Buffer } from "./../graphic/Buffer";
import { ParticleBufferUtils } from "./ParticleBufferUtils";
import { ParticleRenderer, ParticleUpdateFlags } from "./ParticleRenderer";
import { ParticleTrajectoryReadback } from "./ParticleTrajectoryReadback";
import { ParticleTransformFeedbackSimulator } from "./ParticleTransformFeedbackSimulator";
import { ParticleCurveMode } from "./enums/ParticleCurveMode";
import { ParticleGradientMode } from "./enums/ParticleGradientMode";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ParticleStopMode } from "./enums/ParticleStopMode";
import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import { ParticleSubEmitterInheritProperty } from "./enums/ParticleSubEmitterInheritProperty";
import { ParticleFeedbackVertexAttribute } from "./enums/attributes/ParticleFeedbackVertexAttribute";
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
import { DeathSubEmitterCommand } from "./modules/DeathSubEmitterCommand";

/**
 * Particle Generator.
 */
export class ParticleGenerator extends DataObject implements ICloneHook<ParticleGenerator> {
  private static _tempVector20 = new Vector2();
  private static _tempVector21 = new Vector2();
  private static _tempVector22 = new Vector2();
  private static _tempVector30 = new Vector3();
  private static _tempVector31 = new Vector3();
  private static _tempVector32 = new Vector3();
  private static _tempVector33 = new Vector3();
  private static _tempVector34 = new Vector3();
  private static _tempVector35 = new Vector3();
  private static _tempVector36 = new Vector3();
  private static _tempMat = new Matrix();
  private static _tempColor = new Color();
  private static _tempQuat0 = new Quaternion();
  private static _tempEmissionBounds = new BoundingBox();
  private static _tempParticleRenderers = new Array<ParticleRenderer>();
  private static _tempEmissionBoundsRecord = new Float32Array(ParticleBufferUtils.boundsFloatStride);

  private static readonly _particleIncreaseCount = 128;
  private static readonly _emissionBoundsIncreaseCount = 16;
  // Negative value distinguishes velocity already baked into particle state from shader-evaluated Initial curves
  private static readonly _bakedInitialVelocityFactor = -1;
  private static readonly _transformFeedbackMacro = ShaderMacro.getByName("RENDERER_TRANSFORM_FEEDBACK");
  private static readonly _trajectoryFeedbackMacro = ShaderMacro.getByName("RENDERER_TRAJECTORY_FEEDBACK");
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
  _primitive: Primitive;
  /** @internal */
  @ignoreClone
  _vertexBufferBindings = new Array<VertexBufferBinding>();
  /** @internal */
  @ignoreClone
  _subPrimitive = new SubMesh(0, 0, MeshTopology.Triangles);
  /** @internal */
  readonly _renderer: ParticleRenderer;
  /** @internal */
  @ignoreClone
  readonly _incomingSubEmitterCommands: ParticleSubEmitterCommand[] = [];
  /** @internal */
  @ignoreClone
  _pendingBirthSubEmitterCommands: BirthSubEmitterCommand[] | null = null;

  /** @internal */
  @ignoreClone
  _feedbackSimulator: ParticleTransformFeedbackSimulator;
  /** @internal */
  @ignoreClone
  _useTransformFeedback = false;
  @ignoreClone
  private _useTrajectoryFeedback = false;
  /** @internal */
  @ignoreClone
  private _feedbackBindingIndex = -1;
  @ignoreClone
  private _trajectoryReadback: ParticleTrajectoryReadback | null = null;

  @ignoreClone
  private _isPlaying = false;
  @ignoreClone
  private _instanceBufferResized = false;
  @ignoreClone
  private _waitProcessRetiredElementCount = 0;
  @ignoreClone
  private _instanceVertexBufferBinding: VertexBufferBinding;
  @ignoreClone
  private _instanceVertices: Float32Array;
  private _randomSeed = 0;
  @ignoreClone
  private _emissionBoundsRecords: Float32Array;
  @ignoreClone
  private _emissionBoundsCapacity = 0;
  @ignoreClone
  private _firstActiveEmissionBounds = 0;
  @ignoreClone
  private _firstFreeEmissionBounds = 0;
  @ignoreClone
  private _nextEmissionBoundsExpiry = Infinity;
  @ignoreClone
  private _lastEmissionBoundsFrame = -1;
  @ignoreClone
  private _currentInheritedBoundsDisplacement: Vector3 | null = null;
  @ignoreClone
  private _currentInheritedBoundsReach = 0;
  @ignoreClone
  private _lastInitialCurveBoundsFactor = 0;
  @ignoreClone
  private _playStartDelay = 0;

  @ignoreClone
  private _eventPos = new Vector3();
  @ignoreClone
  private _eventColor = new Color();
  @ignoreClone
  private _eventSize = new Vector3();
  @ignoreClone
  private _eventRotation = new Vector3();
  @ignoreClone
  private _emitLocalPos = new Vector3();
  @ignoreClone
  private _emitDirection = new Vector3();

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
    const subPrimitive = new SubPrimitive();
    subPrimitive.start = 0;

    this._primitive = new Primitive(renderer.engine);
    this._reorganizeGeometryBuffers();
    this._resizeInstanceBuffer(true, ParticleGenerator._particleIncreaseCount);

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
        this._playTime = 0;
      }
    }
  }

  /**
   * Manually emit certain number of particles immediately.
   * @param count - Number of particles to emit
   */
  emit(count: number): void {
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
      main.maxParticles - this._getNotRetiredParticleCount(),
      main.simulationSpace === ParticleSimulationSpace.World ? emitWorldPositionOverride : undefined
    );
  }

  /**
   * @internal
   */
  _update(elapsedTime: number): boolean {
    const shaderData = this._renderer.shaderData;
    const isContentLost = this._processFeedbackReadbacks();

    const lastAlive = this.isAlive;
    const { main, emission } = this;
    const duration = main.duration;
    const lastPlayTime = this._playTime;
    let deltaTime = elapsedTime * main.simulationSpeed;
    this.inheritVelocity._updateEmitterVelocity(elapsedTime);

    if (this._playStartDelay > 0) {
      if (deltaTime <= this._playStartDelay) {
        this._playStartDelay -= deltaTime;
        deltaTime = 0;
      } else {
        deltaTime -= this._playStartDelay;
        this._playStartDelay = 0;
      }
    }

    this._playTime += deltaTime;
    const useTrajectoryFeedback = this._useTrajectoryFeedback;
    const hasBirthSubEmitter =
      useTrajectoryFeedback && this.subEmitters._hasSubEmitterOfType(ParticleSubEmitterType.Birth);
    const hasDeathSubEmitter =
      useTrajectoryFeedback && this.subEmitters._hasSubEmitterOfType(ParticleSubEmitterType.Death);
    const frameEngineTime = useTrajectoryFeedback ? this._renderer.engine.time.elapsedTime : 0;
    const frameLastEngineTime = frameEngineTime - elapsedTime;
    // Keep trajectory slots active through the single feedback pass; retirement makes them reusable next update
    if (!useTrajectoryFeedback) {
      this._retireActiveParticles(false, lastPlayTime, frameLastEngineTime, frameEngineTime);
      this._freeRetiredParticles();
    }

    if (
      main.simulationSpace === ParticleSimulationSpace.World ||
      this._firstActiveEmissionBounds !== this._firstFreeEmissionBounds
    ) {
      this._retireEmissionBounds();
    }

    if (deltaTime > 0 && emission.enabled && this._isPlaying) {
      // If maxParticles is changed dynamically, currentParticleCount may be greater than maxParticles
      if (this._currentParticleCount > main._maxParticleBuffer) {
        const notRetireParticleCount = this._getNotRetiredParticleCount();
        if (notRetireParticleCount < main._maxParticleBuffer) {
          this._resizeInstanceBuffer(false);
        }
      }
      emission._emit(lastPlayTime, this._playTime);
      if (!main.isLoop && this._playTime > duration) {
        this._isPlaying = false;
      }
    }

    const incomingCommands = this._incomingSubEmitterCommands;
    if (incomingCommands.length > 0) {
      let remainingSubEmitterCapacity = Math.max(Math.floor(main.maxParticles) - this._getNotRetiredParticleCount(), 0);
      for (let i = 0, n = incomingCommands.length; i < n; i++) {
        const command = incomingCommands[i];
        let emittedCount: number;
        if (command.type === ParticleSubEmitterType.Birth) {
          emittedCount = this._consumeBirthSubEmitterCommand(command, remainingSubEmitterCapacity);
        } else {
          if (remainingSubEmitterCapacity <= 0) {
            command.release();
            continue;
          }
          const emitPlayTime =
            this._playTime -
            Math.max(this._renderer.engine.time.elapsedTime - command.eventEngineTime, 0) * main.simulationSpeed;
          emittedCount = this._emitDeathSubEmitter(command, emitPlayTime, remainingSubEmitterCapacity);
          command.release();
        }
        remainingSubEmitterCapacity -= emittedCount;
      }
      incomingCommands.length = 0;
    }

    // Retire all particles on device restore before bounds/volume bookkeeping
    if (isContentLost) {
      this._firstActiveElement = 0;
      this._firstNewElement = 0;
      this._firstFreeElement = 0;
      this._firstRetiredElement = 0;
      this._waitProcessRetiredElementCount = 0;
      this._firstActiveEmissionBounds = this._firstFreeEmissionBounds;
      this._nextEmissionBoundsExpiry = Infinity;
      this.subEmitters._retireAllBirthStates();
      this._resetEmissionBoundsState();
    } else {
      const firstNewElement = this._firstNewElement;
      const hasNewParticles = firstNewElement !== this._firstFreeElement;
      if (hasNewParticles || this._waitProcessRetiredElementCount > 0 || this._instanceBufferResized) {
        this._addActiveParticlesToVertexBuffer();
      }

      const hasActiveParticles = this._firstActiveElement !== this._firstFreeElement;
      const shouldUpdateFeedback =
        this._useTransformFeedback && hasActiveParticles && (deltaTime > 0 || hasNewParticles);
      if (hasActiveParticles) {
        shaderData.setFloat(ParticleGenerator._currentTimeProperty, this._playTime);
        this._updateShaderData(shaderData);
      }
      if (shouldUpdateFeedback) {
        this._updateFeedback(shaderData, deltaTime, firstNewElement);
        this._accumulateCurrentInheritedBounds(deltaTime);
        if (hasBirthSubEmitter) {
          this._prepareBirthRange(
            this._firstActiveElement,
            this._firstFreeElement,
            lastPlayTime,
            this._playTime,
            frameLastEngineTime,
            frameEngineTime
          );
        }
      }

      if (useTrajectoryFeedback && shouldUpdateFeedback) {
        this._retireActiveParticles(hasDeathSubEmitter, lastPlayTime, frameLastEngineTime, frameEngineTime);
        this._trajectoryReadback?.submitPendingBatch(this._feedbackSimulator.readBinding.buffer);
        this._freeRetiredParticles();
      }
    }

    if (this.isAlive) {
      if (main.simulationSpace === ParticleSimulationSpace.World) {
        this._generateTransformedBounds();
      }
    } else {
      if (lastAlive && !isContentLost) {
        this._resetEmissionBoundsState();
      }
      // Reset play time when is not playing and no active particles to avoid potential precision problems in GPU
      const discardTime = emission._shiftTimeOrigin(Math.floor(this._playTime / duration) * duration);
      this._playTime -= discardTime;
    }

    if (this.isAlive !== lastAlive) {
      this._renderer._onWorldVolumeChanged();
    }
    return this._firstActiveElement !== this._firstFreeElement;
  }

  /**
   * @internal
   */
  _processFeedbackReadbacks(): boolean {
    const isContentLost = this._instanceVertexBufferBinding._buffer.isContentLost;
    if (isContentLost) {
      this._trajectoryReadback?.destroy();
      this._trajectoryReadback = null;
    } else {
      this._trajectoryReadback?.processCompletedBatches();
    }
    return isContentLost;
  }

  /**
   * @internal
   */
  _hasPendingBirthSubEmitterCommand(): boolean {
    const commands = this._pendingBirthSubEmitterCommands;
    if (!commands?.length) return false;

    const manager = this._renderer._particleSystemManager;
    for (let i = 0, n = commands.length; i < n; i++) {
      const command = commands[i];
      if (command.isQueuedForTarget || command.source._renderer._particleSystemManager === manager) {
        return true;
      }
    }
    return false;
  }

  private _updateFeedback(shaderData: ShaderData, deltaTime: number, firstNewElement: number): void {
    this._feedbackSimulator.update(
      shaderData,
      this._currentParticleCount,
      this._firstActiveElement,
      this._firstFreeElement,
      firstNewElement,
      deltaTime,
      this._instanceVertexBufferBinding
    );

    // After swap, update the render pass buffer binding to point to the latest output.
    // VAO is disabled in TF mode so direct assignment is safe (no stale VAO issue).
    this._primitive.vertexBufferBindings[this._feedbackBindingIndex] = this._feedbackSimulator.readBinding;
  }

  /**
   * @internal
   */
  _reorganizeGeometryBuffers(): void {
    const { _renderer: renderer, _primitive: primitive, _vertexBufferBindings: vertexBufferBindings } = this;
    const { _particleBufferUtils: particleUtils } = renderer.engine;

    primitive.clearVertexElements();
    vertexBufferBindings.length = 0;

    if (renderer.renderMode === ParticleRenderMode.Mesh) {
      const { mesh } = renderer;
      if (!mesh) {
        return;
      }
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
      primitive.addVertexElement(ParticleBufferUtils.renderBillboardVertexElement);
      vertexBufferBindings.push(particleUtils.billboardVertexBufferBinding);
      primitive.setIndexBufferBinding(particleUtils.billboardIndexBufferBinding);
      this._subPrimitive.count = ParticleBufferUtils.billboardIndexCount;
    }

    const renderInstanceVertexElements = ParticleBufferUtils.renderInstanceVertexElements;
    const bindingIndex = vertexBufferBindings.length;
    for (let i = 0, n = renderInstanceVertexElements.length; i < n; i++) {
      const element = renderInstanceVertexElements[i];
      primitive.addVertexElement(
        new VertexElement(element.attribute, element.offset, element.format, bindingIndex, element.instanceStepRate)
      );
    }

    // If instance buffer already created
    if (this._instanceVertexBufferBinding) {
      vertexBufferBindings.push(this._instanceVertexBufferBinding);
    }

    // Add feedback buffer binding for render pass
    if (this._useTransformFeedback) {
      this._feedbackBindingIndex = vertexBufferBindings.length;
      primitive.addVertexElement(
        new VertexElement(
          ParticleFeedbackVertexAttribute.Position,
          0,
          VertexElementFormat.Vector3,
          this._feedbackBindingIndex,
          1
        )
      );
      primitive.addVertexElement(
        new VertexElement(
          ParticleFeedbackVertexAttribute.Velocity,
          12,
          VertexElementFormat.Vector3,
          this._feedbackBindingIndex,
          1
        )
      );
      vertexBufferBindings.push(this._feedbackSimulator.readBinding);
    } else {
      this._feedbackBindingIndex = -1;
    }

    primitive.setVertexBufferBindings(vertexBufferBindings);
  }

  /**
   * @internal
   */
  _resizeInstanceBuffer(isIncrease: boolean, increaseCount?: number): void {
    this._instanceVertexBufferBinding?.buffer.destroy();

    const stride = ParticleBufferUtils.instanceVertexStride;
    const newParticleCount = isIncrease ? this._currentParticleCount + increaseCount : this.main._maxParticleBuffer;
    const newByteLength = stride * newParticleCount;
    const engine = this._renderer.engine;
    const vertexInstanceBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      newByteLength,
      BufferUsage.Dynamic,
      false
    );
    vertexInstanceBuffer.isGCIgnored = true;

    const vertexBufferBindings = this._primitive.vertexBufferBindings;
    const vertexBufferBinding = new VertexBufferBinding(vertexInstanceBuffer, stride);

    const lastInstanceVertices = this._instanceVertices;
    const useFeedback = this._useTransformFeedback;

    const instanceVertices = new Float32Array(newByteLength / 4);
    if (useFeedback) {
      this._feedbackSimulator.resize(newParticleCount);
    }

    if (lastInstanceVertices) {
      const { instanceVertexFloatStride: floatStride } = ParticleBufferUtils;
      const firstFreeElement = this._firstFreeElement;
      const firstRetiredElement = this._firstRetiredElement;
      const runtimeMappings: Array<{ source: number; target: number; count: number }> = [];

      if (isIncrease) {
        // Copy front segment [0, firstFreeElement)
        instanceVertices.set(new Float32Array(lastInstanceVertices.buffer, 0, firstFreeElement * floatStride));

        // Copy tail segment shifted by increaseCount
        const nextFreeElement = firstFreeElement + 1;
        const tailCount = this._currentParticleCount - nextFreeElement;
        const tailDstElement = nextFreeElement + increaseCount;
        firstFreeElement > 0 && runtimeMappings.push({ source: 0, target: 0, count: firstFreeElement });
        tailCount > 0 && runtimeMappings.push({ source: nextFreeElement, target: tailDstElement, count: tailCount });
        instanceVertices.set(
          new Float32Array(lastInstanceVertices.buffer, nextFreeElement * floatStride * 4),
          tailDstElement * floatStride
        );
        if (useFeedback) {
          this._feedbackSimulator.copyOldBufferData(0, 0, firstFreeElement);
          this._feedbackSimulator.copyOldBufferData(nextFreeElement, tailDstElement, tailCount);
        }

        this._firstNewElement > firstFreeElement && (this._firstNewElement += increaseCount);
        this._firstActiveElement > firstFreeElement && (this._firstActiveElement += increaseCount);
        firstRetiredElement > firstFreeElement && (this._firstRetiredElement += increaseCount);
      } else {
        const particleCount = this._currentParticleCount;
        const migrateCount = this._getNotRetiredParticleCount();
        const tailCount = Math.min(migrateCount, particleCount - firstRetiredElement);
        const frontCount = migrateCount - tailCount;
        const firstActiveOffset = this._getRingDistance(firstRetiredElement, this._firstActiveElement, particleCount);
        const firstNewOffset = this._getRingDistance(firstRetiredElement, this._firstNewElement, particleCount);

        if (tailCount > 0) {
          instanceVertices.set(
            new Float32Array(
              lastInstanceVertices.buffer,
              firstRetiredElement * floatStride * 4,
              tailCount * floatStride
            )
          );
          runtimeMappings.push({ source: firstRetiredElement, target: 0, count: tailCount });
          if (useFeedback) {
            this._feedbackSimulator.copyOldBufferData(firstRetiredElement, 0, tailCount);
          }
        }
        if (frontCount > 0) {
          instanceVertices.set(
            new Float32Array(lastInstanceVertices.buffer, 0, frontCount * floatStride),
            tailCount * floatStride
          );
          runtimeMappings.push({ source: 0, target: tailCount, count: frontCount });
          if (useFeedback) {
            this._feedbackSimulator.copyOldBufferData(0, tailCount, frontCount);
          }
        }

        this._firstRetiredElement = 0;
        this._firstActiveElement = firstActiveOffset;
        this._firstNewElement = firstNewOffset;
        this._firstFreeElement = migrateCount;
      }

      if (useFeedback) {
        this._feedbackSimulator.destroyOldBuffers();
      }
      this.subEmitters?._remapBirthStates(newParticleCount, runtimeMappings);
      this._instanceBufferResized = true;
    }

    // Update instance buffer binding
    const instanceBindingIndex = lastInstanceVertices
      ? vertexBufferBindings.length - 1 - (useFeedback ? 1 : 0)
      : vertexBufferBindings.length;
    this._primitive.setVertexBufferBinding(instanceBindingIndex, vertexBufferBinding);

    this._instanceVertices = instanceVertices;
    this._instanceVertexBufferBinding = vertexBufferBinding;
    this._currentParticleCount = newParticleCount;
    if (useFeedback) {
      this._primitive.setVertexBufferBinding(this._feedbackBindingIndex, this._feedbackSimulator.readBinding);
    }
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
    this.inheritVelocity._updateShaderData(shaderData);
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
  _setTransformFeedback(): void {
    const isWebGL2 = this._renderer.engine._hardwareRenderer.isWebGL2;
    const useTrajectory = !!(
      isWebGL2 &&
      (this.subEmitters?._hasSubEmitterOfType(ParticleSubEmitterType.Death) ||
        this.subEmitters?._hasSubEmitterOfType(ParticleSubEmitterType.Birth))
    );
    const useFeedback = !!(
      isWebGL2 &&
      (useTrajectory ||
        this.limitVelocityOverLifetime?.enabled ||
        this.noise?.enabled ||
        this.inheritVelocity?._needTransformFeedback() ||
        this.velocityOverLifetime?._needTransformFeedback())
    );
    if (useFeedback === this._useTransformFeedback && useTrajectory === this._useTrajectoryFeedback) return;

    const trajectoryChanged = useTrajectory !== this._useTrajectoryFeedback;
    this._clearActiveParticles();
    this._useTransformFeedback = useFeedback;
    this._useTrajectoryFeedback = useTrajectory;

    if (trajectoryChanged) {
      this._feedbackSimulator?.destroy();
      this._feedbackSimulator = null;
    }
    if (useFeedback) {
      if (!this._feedbackSimulator) {
        this._feedbackSimulator = new ParticleTransformFeedbackSimulator(this._renderer.engine, useTrajectory);
      }
      const simulator = this._feedbackSimulator;
      const readBinding = simulator.readBinding;
      const needsResize =
        !readBinding || readBinding.buffer.byteLength !== this._currentParticleCount * simulator.vertexStride;
      if (needsResize) {
        simulator.resize(this._currentParticleCount);
        simulator.destroyOldBuffers();
      }
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
      this._trajectoryReadback?.destroy();
      this._trajectoryReadback = null;
    }

    this._reorganizeGeometryBuffers();
  }

  /**
   * @internal
   */
  _getAliveParticleCount(): number {
    if (this._firstActiveElement <= this._firstFreeElement) {
      return this._firstFreeElement - this._firstActiveElement;
    } else {
      let instanceCount = this._currentParticleCount - this._firstActiveElement;
      if (this._firstFreeElement > 0) {
        instanceCount += this._firstFreeElement;
      }
      return instanceCount;
    }
  }

  /**
   * @internal
   */
  _getNotRetiredParticleCount(): number {
    if (this._firstRetiredElement <= this._firstFreeElement) {
      return this._firstFreeElement - this._firstRetiredElement;
    } else {
      let instanceCount = this._currentParticleCount - this._firstRetiredElement;
      if (this._firstFreeElement > 0) {
        instanceCount += this._firstFreeElement;
      }
      return instanceCount;
    }
  }

  /**
   * @inheritdoc
   */
  _onClone(target: ParticleGenerator): void {
    target._setTransformFeedback();
  }

  /**
   * @internal
   */
  _destroy(): void {
    this._trajectoryReadback?.destroy();
    this._instanceVertexBufferBinding.buffer.destroy();
    this._primitive.destroy();
    this.emission._destroy();
    this._feedbackSimulator?.destroy();
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
      this._calculateGeneratorBounds(maxLifetime, generatorBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
      this._calculateTransformedBounds(maxLifetime, generatorBounds, transformedBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
    }

    const hasEmissionBounds = this._firstActiveEmissionBounds !== this._firstFreeEmissionBounds;
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
    const firstActiveElement = this._firstActiveEmissionBounds;
    const firstFreeElement = this._firstFreeEmissionBounds;
    const isPlaying = this._isPlaying;
    const useOrbitalBounds = this._useOrbitalBounds();
    let maxLifetime = isPlaying ? this.main.startLifetime._getMax() : 0;
    if (isPlaying) {
      bounds.copyFrom(this._renderer._transformedBounds);
    }
    if (firstActiveElement !== firstFreeElement) {
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
      if (firstActiveElement < firstFreeElement) {
        maxLifetime = Math.max(
          maxLifetime,
          this._mergeWorldEmissionBoundsRange(
            firstActiveElement,
            firstFreeElement,
            bounds,
            useOrbitalBounds,
            currentInheritedVelocity,
            currentInheritedSpeed
          )
        );
      } else {
        maxLifetime = Math.max(
          maxLifetime,
          this._mergeWorldEmissionBoundsRange(
            firstActiveElement,
            this._emissionBoundsCapacity,
            bounds,
            useOrbitalBounds,
            currentInheritedVelocity,
            currentInheritedSpeed
          ),
          this._mergeWorldEmissionBoundsRange(
            0,
            firstFreeElement,
            bounds,
            useOrbitalBounds,
            currentInheritedVelocity,
            currentInheritedSpeed
          )
        );
      }
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
    this._emissionBoundsCapacity = 0;
    this._firstActiveEmissionBounds = 0;
    this._firstFreeEmissionBounds = 0;
    this._nextEmissionBoundsExpiry = Infinity;
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
      this._calculateGeneratorBounds(maxLifetime, generatorBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
      const transformedBounds = renderer._transformedBounds;
      this._calculateTransformedBounds(maxLifetime, generatorBounds, transformedBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
    }

    if (generatorBoundsDirty) {
      const initialCurveFactor = this.inheritVelocity._usesInitialCurve()
        ? this.inheritVelocity.curve._getMaxMagnitude()
        : 0;
      if (initialCurveFactor !== this._lastInitialCurveBoundsFactor) {
        if (initialCurveFactor > this._lastInitialCurveBoundsFactor) {
          this._preserveInitialCurveBoundsFactor(initialCurveFactor);
        }
        this._lastInitialCurveBoundsFactor = initialCurveFactor;
      }
    }
  }

  private _addNewParticle(
    position: Vector3,
    direction: Vector3,
    emitterWorldPosition: Vector3,
    emitterWorldRotation: Quaternion,
    playTime: number,
    usesInitialInheritCurve: boolean,
    emitWorldPositionOverride?: Vector3,
    inheritColor?: Color,
    inheritSize?: Vector3,
    inheritRotation?: Vector3,
    parentWorldVelocity?: Vector3,
    normalizedEmitAgeOverride?: number
  ): void {
    const firstFreeElement = this._firstFreeElement;
    let nextFreeElement = firstFreeElement + 1;
    if (nextFreeElement >= this._currentParticleCount) {
      nextFreeElement = 0;
    }

    const main = this.main;
    // Check if can be expanded

    // Using 'nextFreeElement' instead of 'freeElement' when comparing with '_firstRetiredElement'
    // aids in definitively identifying the head and tail of the circular queue.

    // Failure to adopt this approach may impede growth initiation
    // due to the initial alignment of 'freeElement' and 'firstRetiredElement'.
    if (nextFreeElement === this._firstRetiredElement) {
      const increaseCount = Math.min(
        ParticleGenerator._particleIncreaseCount,
        main._maxParticleBuffer - this._currentParticleCount
      );
      if (increaseCount === 0) {
        return;
      }

      this._resizeInstanceBuffer(true, increaseCount);

      // Recalculate nextFreeElement after resize
      nextFreeElement = firstFreeElement + 1;
    }

    let pos: Vector3, rot: Quaternion;
    if (main.simulationSpace === ParticleSimulationSpace.World) {
      pos = emitWorldPositionOverride ?? emitterWorldPosition;
      rot = emitterWorldRotation;
    }

    let startSpeed = main.startSpeed.evaluate(undefined, main._startSpeedRand.random());
    const duration = this.main.duration;
    const normalizedEmitAge = normalizedEmitAgeOverride ?? (duration > 0 ? (playTime % duration) / duration : 0);
    let particleDirection = direction;
    const inheritVelocity = this.inheritVelocity;
    const inheritedWorldVelocity = ParticleGenerator._tempVector34;
    const hasInheritedVelocity = inheritVelocity._getInitialVelocity(inheritedWorldVelocity, parentWorldVelocity);
    let inheritedBoundsX = hasInheritedVelocity ? Math.abs(inheritedWorldVelocity.x) : 0;
    let inheritedBoundsY = hasInheritedVelocity ? Math.abs(inheritedWorldVelocity.y) : 0;
    let inheritedBoundsZ = hasInheritedVelocity ? Math.abs(inheritedWorldVelocity.z) : 0;

    if (hasInheritedVelocity && !usesInitialInheritCurve) {
      const inheritedLocalVelocity = ParticleGenerator._tempVector35;
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
      const inheritedBounds = ParticleGenerator._tempVector33;
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

    if (this.main.simulationSpace === ParticleSimulationSpace.World) {
      // Simulation world position
      pos.copyToArray(instanceVertices, offset + 27);

      // Simulation world position
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
    if (usesInitialInheritCurve) {
      inheritedWorldVelocity.copyToArray(instanceVertices, inheritVelocityOffset);
    } else {
      instanceVertices[inheritVelocityOffset] = 0;
      instanceVertices[inheritVelocityOffset + 1] = 0;
      instanceVertices[inheritVelocityOffset + 2] = 0;
    }
    instanceVertices[offset + ParticleBufferUtils.inheritVelocityRandomOffset] = inheritVelocity._needsShaderRandom()
      ? inheritVelocity._curveRand.random()
      : 0;

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

  private _emitDeathSubEmitter(command: DeathSubEmitterCommand, playTime: number, available: number): number {
    const inheritProperties = command.inheritProperties;
    const parentWorldVelocity = command.parentWorldVelocity;
    return this._emitParticles(
      playTime,
      command.count,
      available,
      command.worldPosition,
      command,
      (inheritProperties & ParticleSubEmitterInheritProperty.Color) !== 0 ? command.parentColor! : undefined,
      (inheritProperties & ParticleSubEmitterInheritProperty.Size) !== 0 ? command.parentSize! : undefined,
      (inheritProperties & ParticleSubEmitterInheritProperty.Rotation) !== 0 ? command.parentRotation! : undefined,
      (inheritProperties & ParticleSubEmitterInheritProperty.Velocity) !== 0 ? parentWorldVelocity : undefined,
      parentWorldVelocity,
      1
    );
  }

  private _consumeBirthSubEmitterCommand(command: BirthSubEmitterCommand, available: number): number {
    let emittedCount = 0;

    command.finalizeRequests(available);
    const requests = command.requests;
    for (let i = 0, n = command.requestCount; i < n && available > 0; i++) {
      const request = requests[i];
      const emitted = this._emitBirthSubEmitterParticles(
        command,
        request.time,
        request.count,
        request.hasPosition ? request.position! : undefined,
        available
      );
      available -= emitted;
      emittedCount += emitted;
    }
    command.release();
    return emittedCount;
  }

  private _emitBirthSubEmitterParticles(
    command: BirthSubEmitterCommand,
    emissionTime: number,
    count: number,
    emissionPositionOverride: Vector3 | undefined,
    available: number
  ): number {
    if (available <= 0) {
      return 0;
    }

    const { source, parentWorldPosition, parentWorldVelocity } = command;
    const frameDelta = command.framePlayTime - command.frameLastPlayTime;
    const frameStartParentAge = Math.min(Math.max(command.frameLastPlayTime - command.bornTime, 0), command.lifetime);
    const currentParentAge = Math.min(Math.max(command.framePlayTime - command.bornTime, 0), command.lifetime);
    const parentAgeDelta = currentParentAge - frameStartParentAge;
    const parentAge = emissionTime + command.state.startDelay;
    const emissionPosition = this._eventPos;
    if (emissionPositionOverride) {
      emissionPosition.copyFrom(emissionPositionOverride);
    } else {
      const emissionAge = MathUtil.clamp(currentParentAge - parentAge, 0, parentAgeDelta);
      emissionPosition.set(
        parentWorldPosition.x - parentWorldVelocity.x * emissionAge,
        parentWorldPosition.y - parentWorldVelocity.y * emissionAge,
        parentWorldPosition.z - parentWorldVelocity.z * emissionAge
      );
    }

    const absoluteEmissionTime = command.bornTime + parentAge;
    const frameTime =
      frameDelta > MathUtil.zeroTolerance
        ? MathUtil.clamp((absoluteEmissionTime - command.frameLastPlayTime) / frameDelta, 0, 1)
        : 1;
    const parentNormalizedAge = command.lifetime > 0 ? MathUtil.clamp(parentAge / command.lifetime, 0, 1) : 1;
    const normalizedEmissionAge = command.lifetime > 0 ? MathUtil.clamp(emissionTime / command.lifetime, 0, 1) : 1;
    const { simulationSpeed } = this.main;
    const inherit = command.inheritProperties;
    const inheritParticleProperties = inherit & ParticleGenerator._particleValueInheritanceMask;
    if (inheritParticleProperties !== ParticleSubEmitterInheritProperty.None) {
      source._evaluateOverLifetime(
        command.parentParticleSnapshot!,
        0,
        parentNormalizedAge,
        this._eventColor,
        this._eventSize,
        this._eventRotation
      );
    }
    const eventEngineTime =
      command.frameLastEngineTime + (command.frameEngineTime - command.frameLastEngineTime) * frameTime;
    const playTime =
      this._playTime - Math.max(this._renderer.engine.time.elapsedTime - eventEngineTime, 0) * simulationSpeed;
    return this._emitParticles(
      playTime,
      count,
      available,
      emissionPosition,
      command,
      (inherit & ParticleSubEmitterInheritProperty.Color) !== 0 ? this._eventColor : undefined,
      (inherit & ParticleSubEmitterInheritProperty.Size) !== 0 ? this._eventSize : undefined,
      (inherit & ParticleSubEmitterInheritProperty.Rotation) !== 0 ? this._eventRotation : undefined,
      (inherit & ParticleSubEmitterInheritProperty.Velocity) !== 0 ? parentWorldVelocity : undefined,
      parentWorldVelocity,
      normalizedEmissionAge
    );
  }

  private _emitParticles(
    playTime: number,
    requestedCount: number,
    available: number,
    emitWorldPosition?: Vector3,
    subEmitterCommand?: ParticleSubEmitterCommand,
    inheritColor?: Color,
    inheritSize?: Vector3,
    inheritRotation?: Vector3,
    eventWorldDirection?: Vector3,
    parentWorldVelocity?: Vector3,
    normalizedEmitAgeOverride?: number
  ): number {
    const count = Math.min(Math.ceil(requestedCount), Math.max(Math.floor(available), 0));
    if (count <= 0) {
      return 0;
    }

    const main = this.main;
    const transform = this._renderer.entity.transform;
    const isSubEmitter = !!subEmitterCommand;
    const targetWorldPosition = subEmitterCommand?.targetWorldPosition ?? transform.worldPosition;
    const targetWorldRotation = subEmitterCommand?.targetWorldRotation ?? transform.worldRotationQuaternion;
    const positionScale = subEmitterCommand?.targetPositionScale ?? main._getPositionScale();
    const localPos = this._emitLocalPos;
    const invRot = ParticleGenerator._tempQuat0;
    if (isSubEmitter) {
      Vector3.subtract(emitWorldPosition!, targetWorldPosition, localPos);
      Quaternion.invert(targetWorldRotation, invRot);
      Vector3.transformByQuat(localPos, invRot, localPos);
    }

    const { emission } = this;
    const shape = emission.shape;
    const simulationLocal = main.simulationSpace === ParticleSimulationSpace.Local;
    const usesInitialInheritCurve = this.inheritVelocity._usesInitialCurve();
    const duration = main.duration;
    const normalizedEmitAge = normalizedEmitAgeOverride ?? (duration > 0 ? (playTime % duration) / duration : 0);
    const inheritedBounds = ParticleGenerator._tempVector33;
    inheritedBounds.set(0, 0, 0);
    const eventVelocityBounds = eventWorldDirection ? ParticleGenerator._tempVector36 : null;
    eventVelocityBounds?.set(0, 0, 0);
    const configuredSizeBounds = inheritSize ? this._getConfiguredParticleSizeBoundsExtent() : 0;
    let eventSizeBounds = 0;
    let emittedCount = 0;
    for (; emittedCount < count; emittedCount++) {
      const position = ParticleGenerator._tempVector30;
      const direction = this._emitDirection;
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

      if (eventWorldDirection) {
        Vector3.transformByQuat(eventWorldDirection, invRot, direction);
        const length = direction.length();
        if (length > MathUtil.zeroTolerance) {
          direction.scale(1 / length);
        } else {
          direction.set(0, 0, -1);
        }
      }

      if (isSubEmitter && simulationLocal) {
        position.add(localPos);
      }
      const firstFreeElement = this._firstFreeElement;
      this._addNewParticle(
        position,
        direction,
        targetWorldPosition,
        targetWorldRotation,
        playTime,
        usesInitialInheritCurve,
        isSubEmitter && simulationLocal ? undefined : emitWorldPosition,
        inheritColor,
        inheritSize,
        inheritRotation,
        parentWorldVelocity,
        normalizedEmitAge
      );
      if (this._firstFreeElement === firstFreeElement) {
        break;
      }
      if (eventWorldDirection || inheritSize) {
        const particleOffset = firstFreeElement * ParticleBufferUtils.instanceVertexFloatStride;
        const instanceVertices = this._instanceVertices;
        if (eventWorldDirection) {
          const startLifetime = instanceVertices[particleOffset + ParticleBufferUtils.startLifeTimeOffset];
          const startSpeed = instanceVertices[particleOffset + 18];
          const startVelocity = ParticleGenerator._tempVector35;
          startVelocity.set(
            instanceVertices[particleOffset + 4] * startSpeed,
            instanceVertices[particleOffset + 5] * startSpeed,
            instanceVertices[particleOffset + 6] * startSpeed
          );
          if (!simulationLocal) {
            Vector3.transformByQuat(startVelocity, targetWorldRotation, startVelocity);
          }
          eventVelocityBounds!.set(
            Math.max(eventVelocityBounds.x, Math.abs(startVelocity.x) * startLifetime),
            Math.max(eventVelocityBounds.y, Math.abs(startVelocity.y) * startLifetime),
            Math.max(eventVelocityBounds.z, Math.abs(startVelocity.z) * startLifetime)
          );
        }
        if (inheritSize) {
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
    }
    if (emittedCount > 0) {
      if (simulationLocal) {
        if (isSubEmitter) {
          this._recordLocalSubEmitterBounds(playTime, localPos, inheritedBounds, eventVelocityBounds, eventSizeBounds);
        }
      } else {
        this._recordWorldEmissionBounds(
          playTime,
          emitWorldPosition,
          inheritedBounds,
          usesInitialInheritCurve,
          eventVelocityBounds,
          eventSizeBounds,
          isSubEmitter ? targetWorldPosition : null,
          isSubEmitter ? targetWorldRotation : null
        );
      }
    }
    return emittedCount;
  }

  private _prepareBirthRange(
    firstElement: number,
    endElement: number,
    frameLastPlayTime: number,
    framePlayTime: number,
    frameLastEngineTime: number,
    frameEngineTime: number
  ): void {
    const floatStride = ParticleBufferUtils.instanceVertexFloatStride;
    const instanceVertices = this._instanceVertices;
    const commands = this._getTrajectoryReadback().getPendingCommands(firstElement, this._currentParticleCount);

    let ringIndex = firstElement;
    while (ringIndex !== endElement) {
      const particleOffset = ringIndex * floatStride;
      const lifetime = instanceVertices[particleOffset + ParticleBufferUtils.startLifeTimeOffset];
      const bornTime = instanceVertices[particleOffset + ParticleBufferUtils.timeOffset];
      const commandStart = commands.length;
      this.subEmitters._prepareBirthCommandsForParticle(
        ringIndex,
        bornTime,
        lifetime,
        frameLastPlayTime,
        framePlayTime,
        frameLastEngineTime,
        frameEngineTime,
        commands
      );
      for (let i = commandStart, n = commands.length; i < n; i++) {
        const command = commands[i];
        if (command.type === ParticleSubEmitterType.Birth) {
          this._snapshotBirthCommand(command, particleOffset);
        }
      }
      ringIndex = this._nextRingIndex(ringIndex);
    }
  }

  private _snapshotBirthCommand(command: BirthSubEmitterCommand, particleOffset: number): void {
    const inherit = command.inheritProperties;
    if ((inherit & ParticleGenerator._particleValueInheritanceMask) === ParticleSubEmitterInheritProperty.None) {
      return;
    }
    const snapshot = (command.parentParticleSnapshot ||= new Float32Array(
      ParticleBufferUtils.instanceVertexFloatStride
    ));
    const instanceVertices = this._instanceVertices;
    for (let i = 0, n = snapshot.length; i < n; i++) {
      snapshot[i] = instanceVertices[particleOffset + i];
    }
  }

  private _clearActiveParticles(): void {
    this._trajectoryReadback?.cancel();
    const firstFreeElement = this._firstFreeElement;
    this._firstRetiredElement = firstFreeElement;
    this._firstActiveElement = firstFreeElement;
    this._firstNewElement = firstFreeElement;
    this._firstActiveEmissionBounds = this._firstFreeEmissionBounds;
    this._nextEmissionBoundsExpiry = Infinity;
    this.subEmitters?._retireAllBirthStates();
    this._resetEmissionBoundsState();
  }

  private _recordLocalSubEmitterBounds(
    playTime: number,
    localPosition: Vector3,
    inheritedBounds: Vector3,
    eventVelocityBounds: Vector3 | null,
    eventSizeBounds: number
  ): void {
    const renderer = this._renderer;
    const generatorBounds = renderer._generatorBounds;
    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume)) {
      this._calculateGeneratorBounds(this.main.startLifetime._getMax(), generatorBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    const record = ParticleGenerator._tempEmissionBoundsRecord;
    record.fill(0);
    const { min, max } = generatorBounds;
    const { x, y, z } = localPosition;
    const extentX = Math.max(inheritedBounds.x, eventVelocityBounds?.x ?? 0) + eventSizeBounds;
    const extentY = Math.max(inheritedBounds.y, eventVelocityBounds?.y ?? 0) + eventSizeBounds;
    const extentZ = Math.max(inheritedBounds.z, eventVelocityBounds?.z ?? 0) + eventSizeBounds;
    record[0] = min.x + x - extentX;
    record[1] = min.y + y - extentY;
    record[2] = min.z + z - extentZ;
    record[3] = max.x + x + extentX;
    record[4] = max.y + y + extentY;
    record[5] = max.z + z + extentZ;
    record[ParticleBufferUtils.boundsTimeOffset] = playTime;
    record[ParticleBufferUtils.boundsMaxLifetimeOffset] = this.main.startLifetime._getMax();

    const frameCount = renderer.engine.time.frameCount;
    if (
      frameCount === this._lastEmissionBoundsFrame &&
      this._firstActiveEmissionBounds !== this._firstFreeEmissionBounds
    ) {
      let previousElement = this._firstFreeEmissionBounds - 1;
      if (previousElement < 0) {
        previousElement = this._emissionBoundsCapacity - 1;
      }
      this._mergeEmissionBoundsRecord(previousElement * ParticleBufferUtils.boundsFloatStride, record);
    } else {
      this._lastEmissionBoundsFrame = frameCount;
      this._appendEmissionBoundsRecord(record);
    }
    renderer._onWorldVolumeChanged();
  }

  private _recordWorldEmissionBounds(
    playTime: number,
    worldPosition: Vector3 | undefined,
    inheritedBounds: Vector3,
    usesInitialInheritCurve: boolean,
    eventVelocityBounds: Vector3 | null,
    eventSizeBounds: number,
    targetWorldPosition: Vector3 | null,
    targetWorldRotation: Quaternion | null
  ): void {
    const inheritedBoundsX = inheritedBounds.x;
    const inheritedBoundsY = inheritedBounds.y;
    const inheritedBoundsZ = inheritedBounds.z;
    const renderer = this._renderer;
    let transformedBounds: BoundingBox;
    if (targetWorldPosition) {
      const generatorBounds = renderer._generatorBounds;
      if (renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume)) {
        this._calculateGeneratorBounds(this.main.startLifetime._getMax(), generatorBounds);
        renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
      }
      transformedBounds = ParticleGenerator._tempEmissionBounds;
      this._calculateTransformedBounds(
        this.main.startLifetime._getMax(),
        generatorBounds,
        transformedBounds,
        targetWorldPosition,
        targetWorldRotation!
      );
    } else {
      if (
        renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume) ||
        renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)
      ) {
        this._generateTransformedBounds();
      }
      transformedBounds = renderer._transformedBounds;
    }
    const {
      boundsTimeOffset,
      boundsMaxLifetimeOffset,
      boundsCurrentDisplacementOffset,
      boundsCurrentReachOffset,
      boundsInitialDisplacementOffset,
      boundsInitialFactorOffset
    } = ParticleBufferUtils;
    const record = ParticleGenerator._tempEmissionBoundsRecord;
    const emitterWorldPosition = targetWorldPosition ?? renderer.entity.transform.worldPosition;
    const maxLifetime = this.main.startLifetime._getMax();
    const offsetX = worldPosition ? worldPosition.x - emitterWorldPosition.x : 0;
    const offsetY = worldPosition ? worldPosition.y - emitterWorldPosition.y : 0;
    const offsetZ = worldPosition ? worldPosition.z - emitterWorldPosition.z : 0;
    const eventExtentX = (eventVelocityBounds?.x ?? 0) + eventSizeBounds;
    const eventExtentY = (eventVelocityBounds?.y ?? 0) + eventSizeBounds;
    const eventExtentZ = (eventVelocityBounds?.z ?? 0) + eventSizeBounds;
    record[0] = transformedBounds.min.x + offsetX - eventExtentX;
    record[1] = transformedBounds.min.y + offsetY - eventExtentY;
    record[2] = transformedBounds.min.z + offsetZ - eventExtentZ;
    record[3] = transformedBounds.max.x + offsetX + eventExtentX;
    record[4] = transformedBounds.max.y + offsetY + eventExtentY;
    record[5] = transformedBounds.max.z + offsetZ + eventExtentZ;
    record[boundsTimeOffset] = playTime;
    record[boundsMaxLifetimeOffset] = maxLifetime;
    const displacement = this._currentInheritedBoundsDisplacement;
    record[boundsCurrentDisplacementOffset] = displacement?.x ?? 0;
    record[boundsCurrentDisplacementOffset + 1] = displacement?.y ?? 0;
    record[boundsCurrentDisplacementOffset + 2] = displacement?.z ?? 0;
    record[boundsCurrentReachOffset] = this._currentInheritedBoundsReach;
    const storesInheritedDisplacement = usesInitialInheritCurve || eventVelocityBounds === null;
    const initialDisplacementX = storesInheritedDisplacement ? inheritedBoundsX : 0;
    const initialDisplacementY = storesInheritedDisplacement ? inheritedBoundsY : 0;
    const initialDisplacementZ = storesInheritedDisplacement ? inheritedBoundsZ : 0;
    record[boundsInitialDisplacementOffset] = initialDisplacementX;
    record[boundsInitialDisplacementOffset + 1] = initialDisplacementY;
    record[boundsInitialDisplacementOffset + 2] = initialDisplacementZ;
    const hasInitialDisplacement =
      initialDisplacementX !== 0 || initialDisplacementY !== 0 || initialDisplacementZ !== 0;
    record[boundsInitialFactorOffset] = hasInitialDisplacement
      ? usesInitialInheritCurve
        ? this.inheritVelocity.curve._getMaxMagnitude()
        : ParticleGenerator._bakedInitialVelocityFactor
      : 0;

    const frameCount = renderer.engine.time.frameCount;
    if (
      frameCount === this._lastEmissionBoundsFrame &&
      this._firstActiveEmissionBounds !== this._firstFreeEmissionBounds
    ) {
      let previousElement = this._firstFreeEmissionBounds - 1;
      if (previousElement < 0) {
        previousElement = this._emissionBoundsCapacity - 1;
      }
      const previousOffset = previousElement * ParticleBufferUtils.boundsFloatStride;
      const previousFactor = this._emissionBoundsRecords[previousOffset + boundsInitialFactorOffset];
      const bakedFactor = ParticleGenerator._bakedInitialVelocityFactor;
      if (
        this._emissionBoundsRecords[previousOffset + boundsMaxLifetimeOffset] === maxLifetime &&
        (previousFactor === bakedFactor) === (record[boundsInitialFactorOffset] === bakedFactor)
      ) {
        this._mergeEmissionBoundsRecord(previousOffset, record);
      } else {
        this._appendEmissionBoundsRecord(record);
      }
    } else {
      this._lastEmissionBoundsFrame = frameCount;
      this._appendEmissionBoundsRecord(record);
    }
    renderer._onWorldVolumeChanged();
  }

  private _resetEmissionBoundsState(): void {
    this._lastEmissionBoundsFrame = -1;
    this._currentInheritedBoundsDisplacement?.set(0, 0, 0);
    this._currentInheritedBoundsReach = 0;
    this._lastInitialCurveBoundsFactor = 0;
    this._renderer._onWorldVolumeChanged();
  }

  private _retireActiveParticles(
    hasDeathSubEmitter: boolean,
    frameLastPlayTime: number,
    frameLastEngineTime: number,
    frameEngineTime: number
  ): void {
    const engine = this._renderer.engine;
    const frameCount = engine.time.frameCount;
    const instanceVertices = this._instanceVertices;
    const firstNewElement = this._firstNewElement;
    const framePlayTimeDelta = this._playTime - frameLastPlayTime;
    const frameEngineTimeDelta = frameEngineTime - frameLastEngineTime;

    let ringIndex = this._firstActiveElement;
    while (ringIndex !== firstNewElement) {
      const activeParticleOffset = ringIndex * ParticleBufferUtils.instanceVertexFloatStride;
      const activeParticleTimeOffset = activeParticleOffset + ParticleBufferUtils.timeOffset;

      const bornTime = instanceVertices[activeParticleTimeOffset];
      const lifetime = instanceVertices[activeParticleOffset + ParticleBufferUtils.startLifeTimeOffset];
      const particleAge = this._playTime - bornTime;
      // Use `Math.fround` to ensure the precision of comparison is same
      if (Math.fround(particleAge) < lifetime) {
        break;
      }

      if (hasDeathSubEmitter) {
        const frameTime =
          framePlayTimeDelta > MathUtil.zeroTolerance
            ? MathUtil.clamp((bornTime + lifetime - frameLastPlayTime) / framePlayTimeDelta, 0, 1)
            : 1;
        const commands = this._getTrajectoryReadback().getPendingCommands(ringIndex, this._currentParticleCount);
        const commandStart = commands.length;
        const inheritedProperties = this.subEmitters._prepareDeathCommands(
          ringIndex,
          frameLastEngineTime + frameEngineTimeDelta * frameTime,
          commands
        );
        if (
          (inheritedProperties & ParticleGenerator._particleValueInheritanceMask) !==
          ParticleSubEmitterInheritProperty.None
        ) {
          this._evaluateOverLifetime(
            instanceVertices,
            activeParticleOffset,
            1,
            this._eventColor,
            this._eventSize,
            this._eventRotation
          );
          for (let i = commandStart, n = commands.length; i < n; i++) {
            const command = commands[i];
            if (command.type === ParticleSubEmitterType.Death) {
              command.snapshotParentValues(this._eventColor, this._eventSize, this._eventRotation);
            }
          }
        }
      }

      this.subEmitters._retireParticle(ringIndex);
      instanceVertices[activeParticleTimeOffset] = frameCount;
      this._firstActiveElement = ringIndex = this._nextRingIndex(ringIndex);
      if (!this._useTransformFeedback) {
        this._waitProcessRetiredElementCount++;
      }
    }
  }

  private _getRingDistance(
    firstElement: number,
    endElement: number,
    particleCount = this._currentParticleCount
  ): number {
    return endElement >= firstElement ? endElement - firstElement : particleCount - firstElement + endElement;
  }

  private _nextRingIndex(ringIndex: number, particleCount = this._currentParticleCount): number {
    return ringIndex + 1 < particleCount ? ringIndex + 1 : 0;
  }

  private _getTrajectoryReadback(): ParticleTrajectoryReadback {
    return (this._trajectoryReadback ||= new ParticleTrajectoryReadback(this));
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
    const firstActiveElement = this._firstActiveElement;
    const firstFreeElement = this._firstFreeElement;

    // firstActiveElement == firstFreeElement should not update
    if (firstActiveElement === firstFreeElement) {
      this._firstNewElement = firstFreeElement;
      this._waitProcessRetiredElementCount = 0;
      this._instanceBufferResized = false;
      return;
    }

    const byteStride = ParticleBufferUtils.instanceVertexStride;
    const instanceBuffer = this._instanceVertexBufferBinding.buffer;
    const dataBuffer = this._instanceVertices.buffer;

    // Feedback mode: upload in-place (indices match feedback buffer slots)
    // Non-feedback mode: compact to GPU offset 0
    const compact = !this._useTransformFeedback;
    const start = firstActiveElement * byteStride;
    if (firstActiveElement < firstFreeElement) {
      instanceBuffer.setData(
        dataBuffer as ArrayBuffer,
        compact ? 0 : start,
        start,
        (firstFreeElement - firstActiveElement) * byteStride,
        SetDataOptions.Discard
      );
    } else {
      const firstSegmentSize = (this._currentParticleCount - firstActiveElement) * byteStride;
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
    this._firstNewElement = firstFreeElement;
    this._waitProcessRetiredElementCount = 0;
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
    const displacement = (this._currentInheritedBoundsDisplacement ||= new Vector3());
    displacement.set(
      displacement.x + velocity.x * deltaTime,
      displacement.y + velocity.y * deltaTime,
      displacement.z + velocity.z * deltaTime
    );
    this._currentInheritedBoundsReach += velocity.length() * deltaTime;
    this._renderer._onWorldVolumeChanged();
  }

  private _appendEmissionBoundsRecord(record: Float32Array): void {
    const { boundsFloatStride, boundsTimeOffset, boundsMaxLifetimeOffset } = ParticleBufferUtils;
    const expiry = record[boundsTimeOffset] + record[boundsMaxLifetimeOffset];
    const firstActiveElement = this._firstActiveEmissionBounds;
    const firstFreeElement = this._firstFreeEmissionBounds;
    if (firstActiveElement !== firstFreeElement) {
      let previousElement = firstFreeElement - 1;
      if (previousElement < 0) {
        previousElement = this._emissionBoundsCapacity - 1;
      }
      const previousOffset = previousElement * boundsFloatStride;
      const boundsArray = this._emissionBoundsRecords;
      let canMerge = true;
      for (let i = 0; i < boundsFloatStride; i++) {
        if (i !== boundsTimeOffset && boundsArray[previousOffset + i] !== record[i]) {
          canMerge = false;
          break;
        }
      }
      if (canMerge) {
        boundsArray[previousOffset + boundsTimeOffset] = Math.max(
          boundsArray[previousOffset + boundsTimeOffset],
          record[boundsTimeOffset]
        );
        this._nextEmissionBoundsExpiry = Math.min(this._nextEmissionBoundsExpiry, expiry);
        return;
      }
    }

    if (this._emissionBoundsCapacity === 0) {
      this._resizeEmissionBoundsRecords();
    }
    let nextFreeElement = this._firstFreeEmissionBounds + 1;
    if (nextFreeElement >= this._emissionBoundsCapacity) {
      nextFreeElement = 0;
    }
    if (nextFreeElement === this._firstActiveEmissionBounds) {
      this._resizeEmissionBoundsRecords();
      nextFreeElement = this._firstFreeEmissionBounds + 1;
    }
    this._emissionBoundsRecords.set(record, this._firstFreeEmissionBounds * ParticleBufferUtils.boundsFloatStride);
    this._firstFreeEmissionBounds = nextFreeElement;
    this._nextEmissionBoundsExpiry = Math.min(this._nextEmissionBoundsExpiry, expiry);
  }

  private _mergeEmissionBoundsRecord(offset: number, record: Float32Array): void {
    const boundsArray = this._emissionBoundsRecords;
    for (let i = 0; i < 3; i++) {
      boundsArray[offset + i] = Math.min(boundsArray[offset + i], record[i]);
      boundsArray[offset + i + 3] = Math.max(boundsArray[offset + i + 3], record[i + 3]);
    }
    boundsArray[offset + ParticleBufferUtils.boundsTimeOffset] = Math.max(
      boundsArray[offset + ParticleBufferUtils.boundsTimeOffset],
      record[ParticleBufferUtils.boundsTimeOffset]
    );
    boundsArray[offset + ParticleBufferUtils.boundsMaxLifetimeOffset] = Math.max(
      boundsArray[offset + ParticleBufferUtils.boundsMaxLifetimeOffset],
      record[ParticleBufferUtils.boundsMaxLifetimeOffset]
    );
    for (
      let i = ParticleBufferUtils.boundsCurrentDisplacementOffset;
      i <= ParticleBufferUtils.boundsCurrentReachOffset;
      i++
    ) {
      boundsArray[offset + i] = Math.min(boundsArray[offset + i], record[i]);
    }
    for (let i = ParticleBufferUtils.boundsInitialDisplacementOffset; i < ParticleBufferUtils.boundsFloatStride; i++) {
      boundsArray[offset + i] = Math.max(boundsArray[offset + i], record[i]);
    }
    this._nextEmissionBoundsExpiry = Math.min(
      this._nextEmissionBoundsExpiry,
      record[ParticleBufferUtils.boundsTimeOffset] + record[ParticleBufferUtils.boundsMaxLifetimeOffset]
    );
  }

  private _preserveInitialCurveBoundsFactor(factor: number): void {
    const factorOffset = ParticleBufferUtils.boundsInitialFactorOffset;
    const displacementOffset = ParticleBufferUtils.boundsInitialDisplacementOffset;
    const boundsArray = this._emissionBoundsRecords;
    const count = this._emissionBoundsCapacity;
    let index = this._firstActiveEmissionBounds;
    const firstFreeElement = this._firstFreeEmissionBounds;
    while (index !== firstFreeElement) {
      const offset = index * ParticleBufferUtils.boundsFloatStride;
      if (
        boundsArray[offset + factorOffset] !== ParticleGenerator._bakedInitialVelocityFactor &&
        (boundsArray[offset + displacementOffset] !== 0 ||
          boundsArray[offset + displacementOffset + 1] !== 0 ||
          boundsArray[offset + displacementOffset + 2] !== 0)
      ) {
        boundsArray[offset + factorOffset] = Math.max(boundsArray[offset + factorOffset], factor);
      }
      if (++index >= count) {
        index = 0;
      }
    }
  }

  private _resizeEmissionBoundsRecords(): void {
    const floatStride = ParticleBufferUtils.boundsFloatStride;
    const increaseCount = ParticleGenerator._emissionBoundsIncreaseCount;

    this._emissionBoundsCapacity += increaseCount;
    const lastBoundsArray = this._emissionBoundsRecords;
    const boundsArray = new Float32Array(this._emissionBoundsCapacity * floatStride);

    if (lastBoundsArray) {
      const firstFreeElement = this._firstFreeEmissionBounds;
      boundsArray.set(new Float32Array(lastBoundsArray.buffer, 0, firstFreeElement * floatStride));

      const nextFreeElement = firstFreeElement + 1;
      const freeEndOffset = (nextFreeElement + increaseCount) * floatStride;
      boundsArray.set(new Float32Array(lastBoundsArray.buffer, nextFreeElement * floatStride * 4), freeEndOffset);

      const firstActiveElement = this._firstActiveEmissionBounds;
      if (firstActiveElement > firstFreeElement) {
        this._firstActiveEmissionBounds += increaseCount;
      }
    }

    this._emissionBoundsRecords = boundsArray;
  }

  private _retireEmissionBounds(): void {
    const playTime = this._playTime;
    if (playTime <= this._nextEmissionBoundsExpiry) {
      return;
    }

    const { boundsFloatStride, boundsTimeOffset, boundsMaxLifetimeOffset } = ParticleBufferUtils;
    const boundsArray = this._emissionBoundsRecords;
    const firstFreeElement = this._firstFreeEmissionBounds;
    const count = this._emissionBoundsCapacity;
    let firstActiveElement = this._firstActiveEmissionBounds;
    let firstActiveOffset = firstActiveElement * boundsFloatStride;
    let retired = false;
    while (
      firstActiveElement !== firstFreeElement &&
      playTime >
        boundsArray[firstActiveOffset + boundsTimeOffset] + boundsArray[firstActiveOffset + boundsMaxLifetimeOffset]
    ) {
      retired = true;
      if (++firstActiveElement >= count) {
        firstActiveElement = 0;
      }
      firstActiveOffset = firstActiveElement * boundsFloatStride;
    }
    this._firstActiveEmissionBounds = firstActiveElement;

    let readElement = firstActiveElement;
    let writeElement = readElement;
    let nextExpiry = Infinity;
    while (readElement !== firstFreeElement) {
      const readOffset = readElement * boundsFloatStride;
      const expiry = boundsArray[readOffset + boundsTimeOffset] + boundsArray[readOffset + boundsMaxLifetimeOffset];
      if (playTime > expiry) {
        retired = true;
      } else {
        if (readElement !== writeElement) {
          const writeOffset = writeElement * boundsFloatStride;
          boundsArray.copyWithin(writeOffset, readOffset, readOffset + boundsFloatStride);
        }
        nextExpiry = Math.min(nextExpiry, expiry);
        if (++writeElement >= count) {
          writeElement = 0;
        }
      }
      if (++readElement >= count) {
        readElement = 0;
      }
    }
    this._firstFreeEmissionBounds = writeElement;
    this._nextEmissionBoundsExpiry = nextExpiry;
    if (retired) {
      this._renderer._onWorldVolumeChanged();
    }
    if (this._firstActiveEmissionBounds === writeElement) {
      this._currentInheritedBoundsDisplacement?.set(0, 0, 0);
      this._currentInheritedBoundsReach = 0;
    }
  }

  private _mergeLocalEmissionBounds(bounds: BoundingBox): number {
    const boundsArray = this._emissionBoundsRecords;
    const count = this._emissionBoundsCapacity;
    const firstFreeElement = this._firstFreeEmissionBounds;
    const { min, max } = bounds;
    let maxLifetime = 0;
    let index = this._firstActiveEmissionBounds;
    while (index !== firstFreeElement) {
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
      if (++index >= count) {
        index = 0;
      }
    }
    return maxLifetime;
  }

  private _calculateGeneratorBounds(maxLifetime: number, bounds: BoundingBox): void {
    const { _tempVector30: directionMax, _tempVector31: directionMin, _tempVector20: speedMinMax } = ParticleGenerator;
    const { min, max } = bounds;
    const { main } = this;

    // StartSpeed's impact
    const { shape } = this.emission;
    if (shape?.enabled) {
      shape._getPositionRange(bounds);
      shape._getDirectionRange(directionMin, directionMax);
    } else {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
      directionMin.set(0, 0, -1);
      directionMax.set(0, 0, 0);
    }
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

    const maxSize = this._getConfiguredParticleSizeBoundsExtent();

    min.set(min.x - maxSize, min.y - maxSize, min.z - maxSize);
    max.set(max.x + maxSize, max.y + maxSize, max.z + maxSize);
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
    index: number,
    bounds: BoundingBox,
    useOrbitalBounds: boolean,
    currentInheritedVelocity: Vector3,
    currentInheritedSpeed: number
  ): number {
    const boundsArray = this._emissionBoundsRecords;
    const offset = index * ParticleBufferUtils.boundsFloatStride;
    const extent = ParticleGenerator._tempVector34;
    this._getInheritedBoundsExtent(offset, useOrbitalBounds, currentInheritedVelocity, currentInheritedSpeed, extent);
    const { min, max } = bounds;
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
    return boundsArray[offset + ParticleBufferUtils.boundsMaxLifetimeOffset];
  }

  private _mergeWorldEmissionBoundsRange(
    start: number,
    end: number,
    bounds: BoundingBox,
    useOrbitalBounds: boolean,
    currentInheritedVelocity: Vector3,
    currentInheritedSpeed: number
  ): number {
    let maxLifetime = 0;
    for (let i = start; i < end; i++) {
      maxLifetime = Math.max(
        maxLifetime,
        this._mergeWorldEmissionBounds(i, bounds, useOrbitalBounds, currentInheritedVelocity, currentInheritedSpeed)
      );
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
    const currentDisplacementOffset = ParticleBufferUtils.boundsCurrentDisplacementOffset;
    const currentDisplacement = this._currentInheritedBoundsDisplacement;
    const currentX = Math.max((currentDisplacement?.x ?? 0) - boundsArray[offset + currentDisplacementOffset], 0);
    const currentY = Math.max((currentDisplacement?.y ?? 0) - boundsArray[offset + currentDisplacementOffset + 1], 0);
    const currentZ = Math.max((currentDisplacement?.z ?? 0) - boundsArray[offset + currentDisplacementOffset + 2], 0);
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
        this._currentInheritedBoundsReach - boundsArray[offset + ParticleBufferUtils.boundsCurrentReachOffset],
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
