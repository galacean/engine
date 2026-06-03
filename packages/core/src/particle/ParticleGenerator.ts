import { BoundingBox, Color, Matrix, Quaternion, Vector2, Vector3 } from "@galacean/engine-math";
import { Transform } from "../Transform";
import { deepClone, ignoreClone } from "../clone/CloneManager";
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
import { Buffer } from "./../graphic/Buffer";
import { ParticleBufferUtils } from "./ParticleBufferUtils";
import { ParticleRenderer, ParticleUpdateFlags } from "./ParticleRenderer";
import { ParticleTransformFeedbackSimulator } from "./ParticleTransformFeedbackSimulator";
import { ParticleCurveMode } from "./enums/ParticleCurveMode";
import { ParticleGradientMode } from "./enums/ParticleGradientMode";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ParticleStopMode } from "./enums/ParticleStopMode";
import { ParticleSubEmitterType } from "./enums/ParticleSubEmitterType";
import { ParticleFeedbackVertexAttribute } from "./enums/attributes/ParticleFeedbackVertexAttribute";
import { ColorOverLifetimeModule } from "./modules/ColorOverLifetimeModule";
import { CustomDataModule } from "./modules/CustomDataModule";
import { EmissionModule } from "./modules/EmissionModule";
import { ForceOverLifetimeModule } from "./modules/ForceOverLifetimeModule";
import { LimitVelocityOverLifetimeModule } from "./modules/LimitVelocityOverLifetimeModule";
import { MainModule } from "./modules/MainModule";
import { ParticleCompositeCurve } from "./modules/ParticleCompositeCurve";
import { ParticleCurve } from "./modules/ParticleCurve";
import { RotationOverLifetimeModule } from "./modules/RotationOverLifetimeModule";
import { SizeOverLifetimeModule } from "./modules/SizeOverLifetimeModule";
import { TextureSheetAnimationModule } from "./modules/TextureSheetAnimationModule";
import { NoiseModule } from "./modules/NoiseModule";
import { VelocityOverLifetimeModule } from "./modules/VelocityOverLifetimeModule";
import { SubEmittersModule } from "./modules/SubEmittersModule";

/**
 * Particle Generator.
 */
export class ParticleGenerator {
  private static _tempVector20 = new Vector2();
  private static _tempVector21 = new Vector2();
  private static _tempVector22 = new Vector2();
  private static _tempVector30 = new Vector3();
  private static _tempVector31 = new Vector3();
  private static _tempVector32 = new Vector3();
  private static _tempMat = new Matrix();
  private static _tempColor0 = new Color();
  private static _tempColor1 = new Color();
  private static _tempQuat0 = new Quaternion();
  private static _tempParticleRenderers = new Array<ParticleRenderer>();

  private static readonly _particleIncreaseCount = 128;
  private static readonly _transformedBoundsIncreaseCount = 16;
  private static readonly _transformFeedbackMacro = ShaderMacro.getByName("RENDERER_TRANSFORM_FEEDBACK");

  /** Use auto random seed. */
  useAutoRandomSeed = true;

  /** Main module. */
  @deepClone
  readonly main: MainModule;
  /** Emission module. */
  @deepClone
  readonly emission = new EmissionModule(this);
  /** Velocity over lifetime module. */
  @deepClone
  readonly velocityOverLifetime: VelocityOverLifetimeModule;
  /** Force over lifetime module. */
  @deepClone
  readonly forceOverLifetime: ForceOverLifetimeModule;
  /** Limit velocity over lifetime module. */
  @deepClone
  readonly limitVelocityOverLifetime: LimitVelocityOverLifetimeModule;
  /** Size over lifetime module. */
  @deepClone
  readonly sizeOverLifetime: SizeOverLifetimeModule;
  /** Rotation over lifetime module. */
  @deepClone
  readonly rotationOverLifetime = new RotationOverLifetimeModule(this);
  /** Color over lifetime module. */
  @deepClone
  readonly colorOverLifetime = new ColorOverLifetimeModule(this);
  /** Texture sheet animation module. */
  @deepClone
  readonly textureSheetAnimation = new TextureSheetAnimationModule(this);
  /** Noise module. */
  @deepClone
  readonly noise: NoiseModule;
  /** Sub emitters module — fires another particle renderer on Birth/Death events. */
  @deepClone
  readonly subEmitters: SubEmittersModule;
  /** Custom data module. */
  @deepClone
  readonly customData: CustomDataModule;

  /** @internal */
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
  _feedbackSimulator: ParticleTransformFeedbackSimulator;
  /** @internal */
  @ignoreClone
  _useTransformFeedback = false;
  /** @internal */
  @ignoreClone
  private _feedbackBindingIndex = -1;

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
  private _transformedBoundsArray: Float32Array;
  @ignoreClone
  private _transformedBoundsCount = 0;
  @ignoreClone
  private _firstActiveTransformedBoundingBox = 0;
  @ignoreClone
  private _firstFreeTransformedBoundingBox = 0;
  @ignoreClone
  private _playStartDelay = 0;

  // ─── Sub emitter override slots ──────────────────────────────────────
  // Set by `_emitFromSubEmitter` before calling `_addNewParticle`; consumed
  // and cleared by `_addNewParticle`. Non-null means override the next emit.
  @ignoreClone
  private _subEmitColorOverride: Color = null;
  @ignoreClone
  private _subEmitSizeOverride: Vector3 = null;
  @ignoreClone
  private _subEmitRotationOverride: Vector3 = null;
  @ignoreClone
  private _suppressSubEmitterDispatch = false;

  // Per-generator scratch buffers for Birth/Death dispatch payloads.
  // Allocated per instance so recursive sub-emit on a different generator
  // doesn't clobber the parent's in-flight payload (class-level statics
  // would be unsafe under nested dispatch).
  @ignoreClone
  private _eventPos = new Vector3();
  @ignoreClone
  private _eventColor = new Color();
  @ignoreClone
  private _eventSize = new Vector3();
  @ignoreClone
  private _eventRotation = new Vector3();

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

        this._firstActiveTransformedBoundingBox = this._firstFreeTransformedBoundingBox;
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
    const budget = main.maxParticles - this._getNotRetiredParticleCount();
    if (count > budget) {
      count = budget;
    }
    if (count <= 0) {
      return 0;
    }

    const position = ParticleGenerator._tempVector30;
    const direction = ParticleGenerator._tempVector31;
    const transform = this._renderer.entity.transform;
    const shape = emission.shape;
    const positionScale = main._getPositionScale();
    for (let i = 0; i < count; i++) {
      if (shape?.enabled) {
        shape._generatePositionAndDirection(emission._shapeRand, playTime, position, direction);
        position.multiply(positionScale);
        direction.normalize().multiply(positionScale);
      } else {
        position.set(0, 0, 0);
        direction.set(0, 0, -1);
        // Speed is scaled by shape scale in world simulation space
        // So if no shape and in world simulation space, we shouldn't scale the speed
        if (main.simulationSpace === ParticleSimulationSpace.Local) {
          direction.multiply(positionScale);
        }
      }
      this._addNewParticle(position, direction, transform, playTime, emitWorldPositionOverride);
    }
    return count;
  }

  /**
   * @internal
   */
  _update(elapsedTime: number): void {
    const lastAlive = this.isAlive;
    const { main, emission } = this;
    const duration = main.duration;
    const lastPlayTime = this._playTime;
    const deltaTime = elapsedTime * main.simulationSpeed;

    // Process start delay time
    if (this._playStartDelay > 0) {
      const remainingDelay = (this._playStartDelay -= deltaTime);
      if (remainingDelay < 0) {
        this._playTime -= remainingDelay;
        this._playStartDelay = 0;
      } else {
        return;
      }
    }

    this._playTime += deltaTime;

    this._retireActiveParticles();
    this._freeRetiredParticles();

    if (main.simulationSpace === ParticleSimulationSpace.World) {
      this._retireTransformedBounds();
    }

    if (emission.enabled && this._isPlaying) {
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

    // Retire all particles on device restore before bounds/volume bookkeeping
    const isContentLost = this._instanceVertexBufferBinding._buffer.isContentLost;
    if (isContentLost) {
      this._firstActiveElement = 0;
      this._firstNewElement = 0;
      this._firstFreeElement = 0;
      this._firstRetiredElement = 0;
      this._waitProcessRetiredElementCount = 0;
      this._firstActiveTransformedBoundingBox = this._firstFreeTransformedBoundingBox;
    }

    if (this.isAlive) {
      if (main.simulationSpace === ParticleSimulationSpace.World) {
        this._generateTransformedBounds();
      }
    } else {
      // Reset play time when is not playing and no active particles to avoid potential precision problems in GPU
      const discardTime = Math.min(emission._frameRateTime, Math.floor(this._playTime / duration) * duration);
      this._playTime -= discardTime;
      emission._frameRateTime -= discardTime;
    }

    if (this.isAlive !== lastAlive) {
      this._renderer._onWorldVolumeChanged();
    }

    if (
      this._firstNewElement != this._firstFreeElement ||
      this._waitProcessRetiredElementCount > 0 ||
      this._instanceBufferResized
    ) {
      this._addActiveParticlesToVertexBuffer();
    }
  }

  /**
   * @internal
   * Run Transform Feedback simulation pass.
   */
  _updateFeedback(shaderData: ShaderData, deltaTime: number): void {
    this._feedbackSimulator.update(
      shaderData,
      this._currentParticleCount,
      this._firstActiveElement,
      this._firstFreeElement,
      deltaTime
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
      primitive.addVertexElement(particleUtils.billboardVertexElement);
      vertexBufferBindings.push(particleUtils.billboardVertexBufferBinding);
      primitive.setIndexBufferBinding(particleUtils.billboardIndexBufferBinding);
      this._subPrimitive.count = ParticleBufferUtils.billboardIndexCount;
    }

    const instanceVertexElements = particleUtils.instanceVertexElements;
    const bindingIndex = vertexBufferBindings.length;
    for (let i = 0, n = instanceVertexElements.length; i < n; i++) {
      const element = instanceVertexElements[i];
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
      this._feedbackSimulator.resize(newParticleCount, vertexBufferBinding);
    }

    if (lastInstanceVertices) {
      const { instanceVertexFloatStride: floatStride, feedbackVertexStride } = ParticleBufferUtils;
      const firstFreeElement = this._firstFreeElement;
      const firstRetiredElement = this._firstRetiredElement;

      if (isIncrease) {
        // Copy front segment [0, firstFreeElement)
        instanceVertices.set(new Float32Array(lastInstanceVertices.buffer, 0, firstFreeElement * floatStride));

        // Copy tail segment shifted by increaseCount
        const nextFreeElement = firstFreeElement + 1;
        const tailCount = this._currentParticleCount - nextFreeElement;
        const tailDstElement = nextFreeElement + increaseCount;
        instanceVertices.set(
          new Float32Array(lastInstanceVertices.buffer, nextFreeElement * floatStride * 4),
          tailDstElement * floatStride
        );

        if (useFeedback) {
          this._feedbackSimulator.copyOldBufferData(0, 0, firstFreeElement * feedbackVertexStride);
          this._feedbackSimulator.copyOldBufferData(
            nextFreeElement * feedbackVertexStride,
            tailDstElement * feedbackVertexStride,
            tailCount * feedbackVertexStride
          );
        }

        this._firstNewElement > firstFreeElement && (this._firstNewElement += increaseCount);
        this._firstActiveElement > firstFreeElement && (this._firstActiveElement += increaseCount);
        firstRetiredElement > firstFreeElement && (this._firstRetiredElement += increaseCount);
      } else {
        let migrateCount: number, bufferOffset: number;
        if (firstRetiredElement <= firstFreeElement) {
          migrateCount = firstFreeElement - firstRetiredElement;
          bufferOffset = 0;
          this._firstFreeElement -= firstRetiredElement;
          this._firstNewElement -= firstRetiredElement;
          this._firstActiveElement -= firstRetiredElement;
          this._firstRetiredElement = 0;
        } else {
          migrateCount = this._currentParticleCount - firstRetiredElement;
          bufferOffset = firstFreeElement;
          this._firstNewElement > firstFreeElement && (this._firstNewElement -= firstFreeElement);
          this._firstActiveElement > firstFreeElement && (this._firstActiveElement -= firstFreeElement);
          firstRetiredElement > firstFreeElement && (this._firstRetiredElement -= firstFreeElement);
        }

        instanceVertices.set(
          new Float32Array(
            lastInstanceVertices.buffer,
            firstRetiredElement * floatStride * 4,
            migrateCount * floatStride
          ),
          bufferOffset * floatStride
        );

        if (useFeedback) {
          this._feedbackSimulator.copyOldBufferData(
            firstRetiredElement * feedbackVertexStride,
            bufferOffset * feedbackVertexStride,
            migrateCount * feedbackVertexStride
          );
        }
      }

      if (useFeedback) {
        this._feedbackSimulator.destroyOldBuffers();
      }
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
    this.velocityOverLifetime._updateShaderData(shaderData);
    this.forceOverLifetime._updateShaderData(shaderData);
    this.limitVelocityOverLifetime._updateShaderData(shaderData);
    this.textureSheetAnimation._updateShaderData(shaderData);
    this.sizeOverLifetime._updateShaderData(shaderData);
    this.rotationOverLifetime._updateShaderData(shaderData);
    this.colorOverLifetime._updateShaderData(shaderData);
    this.noise._updateShaderData(shaderData);
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
    this.rotationOverLifetime._resetRandomSeed(seed);
    this.colorOverLifetime._resetRandomSeed(seed);
    this.noise._resetRandomSeed(seed);
    this.subEmitters._resetRandomSeed(seed);
  }

  /**
   * @internal
   */
  _setTransformFeedback(): void {
    const needed = this.limitVelocityOverLifetime.enabled || this.noise.enabled;
    if (needed === this._useTransformFeedback) return;
    this._useTransformFeedback = needed;

    // Switching TF mode invalidates all active particle state: feedback buffers and instance
    // buffer layout are incompatible between the two paths. Clear rather than show a one-frame
    // jump; new particles will fill in naturally from the next emit cycle.
    this._clearActiveParticles();

    if (needed) {
      if (!this._feedbackSimulator) {
        this._feedbackSimulator = new ParticleTransformFeedbackSimulator(this._renderer.engine);
      }
      const simulator = this._feedbackSimulator;
      const readBinding = simulator.readBinding;
      if (
        !readBinding ||
        readBinding.buffer.byteLength !== this._currentParticleCount * ParticleBufferUtils.feedbackVertexStride
      ) {
        simulator.resize(this._currentParticleCount, this._instanceVertexBufferBinding);
        simulator.destroyOldBuffers();
      } else {
        simulator._instanceBinding = this._instanceVertexBufferBinding;
      }
      this._renderer.shaderData.enableMacro(ParticleGenerator._transformFeedbackMacro);
      // Feedback buffer swaps every frame; VAO caching would bake stale buffer handles.
      this._primitive.enableVAO = false;
    } else {
      this._renderer.shaderData.disableMacro(ParticleGenerator._transformFeedbackMacro);
      this._primitive.enableVAO = true;
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
   * @internal
   */
  _cloneTo(target: ParticleGenerator): void {
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

    this._addGravityToBounds(maxLifetime, transformedBounds, bounds);
  }

  /**
   * @internal
   */
  _updateBoundsSimulationWorld(bounds: BoundingBox): void {
    const boundsArray = this._transformedBoundsArray;
    const firstActiveElement = this._firstActiveTransformedBoundingBox;
    const firstFreeElement = this._firstFreeTransformedBoundingBox;

    const index = firstActiveElement * ParticleBufferUtils.boundsFloatStride;
    bounds.min.copyFromArray(boundsArray, index);
    bounds.max.copyFromArray(boundsArray, index + 3);

    if (firstActiveElement < firstFreeElement) {
      for (let i = firstActiveElement + 1; i < firstFreeElement; i++) {
        this._mergeTransformedBounds(i, bounds);
      }
    } else {
      for (let i = firstActiveElement + 1, n = this._transformedBoundsCount; i < n; i++) {
        this._mergeTransformedBounds(i, bounds);
      }
      if (firstFreeElement > 0) {
        for (let i = 0; i < firstFreeElement; i++) {
          this._mergeTransformedBounds(i, bounds);
        }
      }
    }

    const maxLifetime = this.main.startLifetime._getMax();
    this._addGravityToBounds(maxLifetime, bounds, bounds);
  }

  /**
   * @internal
   */
  _freeBoundsArray(): void {
    this._transformedBoundsArray = null;

    this._transformedBoundsCount = 0;
    this._firstActiveTransformedBoundingBox = 0;
    this._firstFreeTransformedBoundingBox = 0;
  }

  /**
   * @internal
   */
  _generateTransformedBounds(): void {
    const renderer = this._renderer;
    // Get longest Lifetime
    const maxLifetime = this.main.startLifetime._getMax();

    const generatorBounds = renderer._generatorBounds;
    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume)) {
      this._calculateGeneratorBounds(maxLifetime, generatorBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    const { boundsFloatStride, boundsTimeOffset, boundsMaxLifetimeOffset } = ParticleBufferUtils;
    const firstFreeElement = this._firstFreeTransformedBoundingBox;
    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
      // Resize transformed bounds if needed
      let nextFreeElement = firstFreeElement + 1;
      if (nextFreeElement >= this._transformedBoundsCount) {
        nextFreeElement = 0;
      }
      if (nextFreeElement === this._firstActiveTransformedBoundingBox) {
        this._resizeTransformedBoundsArray();
        nextFreeElement = firstFreeElement + 1;
      }

      // Generate transformed bounds
      const transformedBounds = renderer._transformedBounds;
      this._calculateTransformedBounds(maxLifetime, generatorBounds, transformedBounds);

      const boundsOffset = firstFreeElement * boundsFloatStride;
      const boundsArray = this._transformedBoundsArray;
      transformedBounds.min.copyToArray(boundsArray, boundsOffset);
      transformedBounds.max.copyToArray(boundsArray, boundsOffset + 3);

      boundsArray[boundsOffset + boundsTimeOffset] = this._playTime;
      boundsArray[boundsOffset + boundsMaxLifetimeOffset] = maxLifetime;

      this._firstFreeTransformedBoundingBox = nextFreeElement;
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
    } else {
      let previousFreeElement = this._firstFreeTransformedBoundingBox - 1;
      if (previousFreeElement < 0) {
        previousFreeElement = this._transformedBoundsCount;
      }
      this._transformedBoundsArray[previousFreeElement * ParticleBufferUtils.boundsFloatStride + boundsTimeOffset] =
        this._playTime;
    }
  }

  private _addNewParticle(
    position: Vector3,
    direction: Vector3,
    transform: Transform,
    playTime: number,
    emitWorldPositionOverride?: Vector3
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
      pos = emitWorldPositionOverride ?? transform.worldPosition;
      rot = transform.worldRotationQuaternion;
    }

    const startSpeed = main.startSpeed.evaluate(undefined, main._startSpeedRand.random());

    const instanceVertices = this._instanceVertices;
    const offset = firstFreeElement * ParticleBufferUtils.instanceVertexFloatStride;

    // Position
    position.copyToArray(instanceVertices, offset);

    // Start life time
    instanceVertices[offset + ParticleBufferUtils.startLifeTimeOffset] = main.startLifetime.evaluate(
      undefined,
      main._startLifeTimeRand.random()
    );

    // Direction
    direction.copyToArray(instanceVertices, offset + 4);

    // Time
    instanceVertices[offset + ParticleBufferUtils.timeOffset] = playTime;

    // Color
    const startColor = ParticleGenerator._tempColor0;
    main.startColor.evaluate(undefined, main._startColorRand.random(), startColor);

    startColor.copyToArray(instanceVertices, offset + 8);

    const duration = this.main.duration;
    const normalizedEmitAge = (playTime % duration) / duration;

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

    if (this.noise.enabled) {
      instanceVertices[offset + 21] = this.noise._noiseRand.random();
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
    if (
      velocityOverLifetime.enabled &&
      velocityOverLifetime.velocityX.mode === ParticleCurveMode.TwoConstants &&
      velocityOverLifetime.velocityY.mode === ParticleCurveMode.TwoConstants &&
      velocityOverLifetime.velocityZ.mode === ParticleCurveMode.TwoConstants
    ) {
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

    // ─── Sub-emitter inherit overrides (multiplicative for color/size, additive for rotation) ──
    const colorOverride = this._subEmitColorOverride;
    if (colorOverride) {
      const colorOffset = offset + 8;
      instanceVertices[colorOffset] *= colorOverride.r;
      instanceVertices[colorOffset + 1] *= colorOverride.g;
      instanceVertices[colorOffset + 2] *= colorOverride.b;
      instanceVertices[colorOffset + 3] *= colorOverride.a;
    }
    const sizeOverride = this._subEmitSizeOverride;
    if (sizeOverride) {
      const sizeOffset = offset + 12;
      instanceVertices[sizeOffset] *= sizeOverride.x;
      instanceVertices[sizeOffset + 1] *= sizeOverride.y;
      instanceVertices[sizeOffset + 2] *= sizeOverride.z;
    }
    const rotationOverride = this._subEmitRotationOverride;
    if (rotationOverride) {
      instanceVertices[offset + 15] += rotationOverride.x;
      instanceVertices[offset + 16] += rotationOverride.y;
      instanceVertices[offset + 17] += rotationOverride.z;
    }

    // Initialize feedback buffer for this particle
    if (this._useTransformFeedback) {
      this._addFeedbackParticle(firstFreeElement, position, direction, startSpeed, transform, pos);
    }

    this._firstFreeElement = nextFreeElement;

    // ─── Sub-emitter Birth dispatch (symmetric with _dispatchDeathEvent) ──
    this._dispatchBirthEvent(offset, position, transform);
  }

  /**
   * @internal
   * Birth event for one just-spawned parent particle — mirror of
   * `_dispatchDeathEvent`. No-op when sub-emitters are disabled, have no slots,
   * or this emit was itself triggered by a sub-emitter (self-recursion guard).
   */
  private _dispatchBirthEvent(offset: number, position: Vector3, transform: Transform): void {
    // Skip when this very emit was triggered BY a sub-emitter (avoids self-recursion);
    // also skip when the module has no slots at all (cheap early-out).
    const subEmitters = this.subEmitters;
    if (this._suppressSubEmitterDispatch || !subEmitters.enabled || subEmitters.subEmitters.length === 0) {
      return;
    }

    const instanceVertices = this._instanceVertices;

    const birthPos = this._eventPos;
    Vector3.transformByQuat(position, transform.worldRotationQuaternion, birthPos);
    birthPos.add(transform.worldPosition);

    // Read AFTER the sub-emit override was applied above — for nested A→B→C this
    // gives C the cascaded color (B's startColor × inheritFromA), so inheritance
    // accumulates down the chain rather than resetting to B's raw start values.
    const parentColor = this._eventColor;
    parentColor.r = instanceVertices[offset + 8];
    parentColor.g = instanceVertices[offset + 9];
    parentColor.b = instanceVertices[offset + 10];
    parentColor.a = instanceVertices[offset + 11];

    const parentSize = this._eventSize;
    parentSize.set(instanceVertices[offset + 12], instanceVertices[offset + 13], instanceVertices[offset + 14]);

    const parentRotation = this._eventRotation;
    parentRotation.set(instanceVertices[offset + 15], instanceVertices[offset + 16], instanceVertices[offset + 17]);

    // Apply COL/SOL/ROL modulation at normalizedAge = 0 so children inherit
    // the parent's visible appearance at the moment of birth, not the raw
    // pre-modulation start values.
    this._modulateInheritByLifetime(offset, 0, parentColor, parentSize, parentRotation);

    subEmitters._dispatchEvent(ParticleSubEmitterType.Birth, birthPos, parentColor, parentSize, parentRotation);
  }

  /**
   * @internal
   * Emit `count` particles into this generator at `worldPosition`, with optional
   * inherit-overrides multiplied/added into per-particle start values.
   *
   * Called by `SubEmittersModule` when a parent particle's Birth or Death
   * event fires. Bypasses the emission shape (position is event-driven, not
   * shape-derived); direction defaults to `(0, 0, -1)`.
   */
  _emitFromSubEmitter(
    count: number,
    worldPosition: Vector3,
    inheritColor: Color,
    inheritSize: Vector3,
    inheritRotation: Vector3
  ): void {
    if (count <= 0) return;

    const main = this.main;
    const notRetired = this._getNotRetiredParticleCount();
    const available = main.maxParticles - notRetired;
    if (available <= 0) return;
    if (count > available) count = available;

    const transform = this._renderer.entity.transform;
    const worldPos = transform.worldPosition;
    const worldRot = transform.worldRotationQuaternion;

    // Convert event world position into local emission space for a_ShapePos
    const localPos = ParticleGenerator._tempVector30;
    Vector3.subtract(worldPosition, worldPos, localPos);
    const invRot = ParticleGenerator._tempQuat0;
    Quaternion.invert(worldRot, invRot);
    Vector3.transformByQuat(localPos, invRot, localPos);

    const direction = ParticleGenerator._tempVector31;
    direction.set(0, 0, -1);

    this._subEmitColorOverride = inheritColor;
    this._subEmitSizeOverride = inheritSize;
    this._subEmitRotationOverride = inheritRotation;
    this._suppressSubEmitterDispatch = true;

    const playTime = this._playTime;
    for (let i = 0; i < count; i++) {
      this._addNewParticle(localPos, direction, transform, playTime);
    }

    this._subEmitColorOverride = null;
    this._subEmitSizeOverride = null;
    this._subEmitRotationOverride = null;
    this._suppressSubEmitterDispatch = false;
  }

  private _addFeedbackParticle(
    index: number,
    shapePosition: Vector3,
    direction: Vector3,
    startSpeed: number,
    transform: Transform,
    emitWorldPosition?: Vector3
  ): void {
    let position: Vector3;
    if (this.main.simulationSpace === ParticleSimulationSpace.Local) {
      position = shapePosition;
    } else {
      position = ParticleGenerator._tempVector32;
      Vector3.transformByQuat(shapePosition, transform.worldRotationQuaternion, position);
      position.add(emitWorldPosition ?? transform.worldPosition);
    }

    this._feedbackSimulator.writeParticleData(
      index,
      position,
      direction.x * startSpeed,
      direction.y * startSpeed,
      direction.z * startSpeed
    );
  }

  private _clearActiveParticles(): void {
    const firstFreeElement = this._firstFreeElement;
    this._firstRetiredElement = firstFreeElement;
    this._firstActiveElement = firstFreeElement;
    this._firstNewElement = firstFreeElement;
    this._firstActiveTransformedBoundingBox = this._firstFreeTransformedBoundingBox;
  }

  private _retireActiveParticles(): void {
    const engine = this._renderer.engine;

    const frameCount = engine.time.frameCount;
    const instanceVertices = this._instanceVertices;

    // Pre-flight: are there any Death sub-emitter slots? (avoid per-particle scan)
    let hasDeathSlot = false;
    const subEmitters = this.subEmitters;
    if (subEmitters.enabled && !this._suppressSubEmitterDispatch) {
      const slots = subEmitters.subEmitters;
      for (let i = 0, n = slots.length; i < n; i++) {
        if (slots[i].type === ParticleSubEmitterType.Death) {
          hasDeathSlot = true;
          break;
        }
      }
    }

    while (this._firstActiveElement !== this._firstNewElement) {
      const activeParticleOffset = this._firstActiveElement * ParticleBufferUtils.instanceVertexFloatStride;
      const activeParticleTimeOffset = activeParticleOffset + ParticleBufferUtils.timeOffset;

      const particleAge = this._playTime - instanceVertices[activeParticleTimeOffset];
      // Use `Math.fround` to ensure the precision of comparison is same
      if (Math.fround(particleAge) < instanceVertices[activeParticleOffset + ParticleBufferUtils.startLifeTimeOffset]) {
        break;
      }

      if (hasDeathSlot) {
        this._dispatchDeathEvent(activeParticleOffset);
      }

      // Store frame count in time offset to free retired particle
      instanceVertices[activeParticleTimeOffset] = frameCount;
      if (++this._firstActiveElement >= this._currentParticleCount) {
        this._firstActiveElement = 0;
      }

      // Record wait process retired element count
      this._waitProcessRetiredElementCount++;
    }
  }

  /**
   * Compute approximate death-time world position via ballistic formula
   * (a_ShapePos + dir·speed·lifetime + ½·gravity·r0·lifetime²) and dispatch
   * Death event to sub-emitter slots. Does NOT account for VOL/FOL/Noise
   * contributions — particle systems with those modules enabled will see
   * sub-emitter spawn locations drift from the visual particle's last frame.
   */
  private _dispatchDeathEvent(particleOffset: number): void {
    const instanceVertices = this._instanceVertices;
    const main = this.main;
    const transform = this._renderer.entity.transform;
    const simSpaceLocal = main.simulationSpace === ParticleSimulationSpace.Local;

    const lifetime = instanceVertices[particleOffset + 3];
    const startSpeed = instanceVertices[particleOffset + 18];
    const gravityMod = instanceVertices[particleOffset + 19];

    // Local-space end position before world rotation: a_ShapePos + dir·speed·lifetime
    const local = this._eventPos;
    local.set(
      instanceVertices[particleOffset + 0] + instanceVertices[particleOffset + 4] * startSpeed * lifetime,
      instanceVertices[particleOffset + 1] + instanceVertices[particleOffset + 5] * startSpeed * lifetime,
      instanceVertices[particleOffset + 2] + instanceVertices[particleOffset + 6] * startSpeed * lifetime
    );

    let worldRotation: Quaternion;
    if (simSpaceLocal) {
      worldRotation = transform.worldRotationQuaternion;
    } else {
      const tempQ = ParticleGenerator._tempQuat0;
      tempQ.set(
        instanceVertices[particleOffset + 30],
        instanceVertices[particleOffset + 31],
        instanceVertices[particleOffset + 32],
        instanceVertices[particleOffset + 33]
      );
      worldRotation = tempQ;
    }
    Vector3.transformByQuat(local, worldRotation, local);

    if (simSpaceLocal) {
      local.add(transform.worldPosition);
    } else {
      local.x += instanceVertices[particleOffset + 27];
      local.y += instanceVertices[particleOffset + 28];
      local.z += instanceVertices[particleOffset + 29];
    }

    // Gravity contribution: 0.5 · gravity · gravityMod · lifetime² (world-space)
    const gravity = this._renderer.scene.physics.gravity;
    const halfTSquaredR = 0.5 * lifetime * lifetime * gravityMod;
    local.x += gravity.x * halfTSquaredR;
    local.y += gravity.y * halfTSquaredR;
    local.z += gravity.z * halfTSquaredR;

    const parentColor = this._eventColor;
    parentColor.r = instanceVertices[particleOffset + 8];
    parentColor.g = instanceVertices[particleOffset + 9];
    parentColor.b = instanceVertices[particleOffset + 10];
    parentColor.a = instanceVertices[particleOffset + 11];

    const parentSize = this._eventSize;
    parentSize.set(
      instanceVertices[particleOffset + 12],
      instanceVertices[particleOffset + 13],
      instanceVertices[particleOffset + 14]
    );

    const parentRotation = this._eventRotation;
    parentRotation.set(
      instanceVertices[particleOffset + 15],
      instanceVertices[particleOffset + 16],
      instanceVertices[particleOffset + 17]
    );

    // Apply COL/SOL/ROL modulation at the parent's normalizedAge so children
    // inherit the parent's visible appearance at death rather than the raw
    // pre-modulation start values.
    const bornTime = instanceVertices[particleOffset + 7];
    const normalizedAge = Math.min(Math.max((this._playTime - bornTime) / lifetime, 0), 1);
    this._modulateInheritByLifetime(particleOffset, normalizedAge, parentColor, parentSize, parentRotation);

    this.subEmitters._dispatchEvent(ParticleSubEmitterType.Death, local, parentColor, parentSize, parentRotation);
  }

  /**
   * Multiply COL / SOL into parentColor/parentSize and add ROL into
   * parentRotation, mirroring the per-vertex modulation the shader performs at
   * `normalizedAge`. Random factors used by Two* modes are read from the same
   * instance-buffer slots the shader samples (`a_Random0.y/z/w` → byte offsets
   * 20/21/22).
   *
   * SOL only contributes in Curve / TwoCurves modes (shader gates on
   * `RENDERER_SOL_CURVE_MODE`); Constant / TwoConstants are silently dropped
   * shader-side so we match that.
   */
  private _modulateInheritByLifetime(
    particleOffset: number,
    normalizedAge: number,
    parentColor: Color,
    parentSize: Vector3,
    parentRotation: Vector3
  ): void {
    const instanceVertices = this._instanceVertices;

    const col = this.colorOverLifetime;
    if (col.enabled) {
      const colRand = instanceVertices[particleOffset + 20];
      const tmp = ParticleGenerator._tempColor1;
      col.color.evaluate(normalizedAge, colRand, tmp);
      parentColor.r *= tmp.r;
      parentColor.g *= tmp.g;
      parentColor.b *= tmp.b;
      parentColor.a *= tmp.a;
    }

    const sol = this.sizeOverLifetime;
    if (sol.enabled) {
      const sizeRand = instanceVertices[particleOffset + 21];
      const solMode = sol.sizeX.mode;
      if (solMode === ParticleCurveMode.Curve || solMode === ParticleCurveMode.TwoCurves) {
        if (sol.separateAxes) {
          parentSize.x *= sol.sizeX.evaluate(normalizedAge, sizeRand);
          parentSize.y *= sol.sizeY.evaluate(normalizedAge, sizeRand);
          parentSize.z *= sol.sizeZ.evaluate(normalizedAge, sizeRand);
        } else {
          const factor = sol.sizeX.evaluate(normalizedAge, sizeRand);
          parentSize.x *= factor;
          parentSize.y *= factor;
          parentSize.z *= factor;
        }
      }
    }

    const rol = this.rotationOverLifetime;
    if (rol.enabled) {
      const rotRand = instanceVertices[particleOffset + 22];
      const lifetime = instanceVertices[particleOffset + 3];
      const rolZ = ParticleGenerator._curveCumulative(rol.rotationZ, normalizedAge, rotRand) * lifetime;
      if (rol.separateAxes) {
        // Per-axis ROL: shader treats X/Y/Z independently (3D rotation mode
        // implicitly enabled by separateAxes).
        parentRotation.x += ParticleGenerator._curveCumulative(rol.rotationX, normalizedAge, rotRand) * lifetime;
        parentRotation.y += ParticleGenerator._curveCumulative(rol.rotationY, normalizedAge, rotRand) * lifetime;
        parentRotation.z += rolZ;
      } else if (this.main.startRotation3D) {
        // 3D start rotation: Z accumulates into the Z Euler component.
        parentRotation.z += rolZ;
      } else {
        // 2D start rotation (default): the shader stores the Z angle in
        // a_StartRotation0.x, so ROL cumulative goes into the .x slot.
        parentRotation.x += rolZ;
      }
    }
  }

  /**
   * Trapezoidal-integrate a `ParticleCompositeCurve` from 0 to `normalizedAge`.
   * Mirrors shader `evaluateParticleCurveCumulative`. Only used by sub-emitter
   * Rotation-Over-Lifetime accumulation; caller multiplies the returned value
   * by lifetime to convert from normalizedAge units to age units.
   */
  private static _curveCumulative(curve: ParticleCompositeCurve, normalizedAge: number, lerpFactor: number): number {
    switch (curve.mode) {
      case ParticleCurveMode.Constant:
        return curve.constantMax * normalizedAge;
      case ParticleCurveMode.TwoConstants: {
        const value = curve.constantMin + (curve.constantMax - curve.constantMin) * lerpFactor;
        return value * normalizedAge;
      }
      case ParticleCurveMode.Curve:
        return ParticleGenerator._curveKeysIntegral(curve.curve, normalizedAge);
      case ParticleCurveMode.TwoCurves: {
        const min = ParticleGenerator._curveKeysIntegral(curve.curveMin, normalizedAge);
        const max = ParticleGenerator._curveKeysIntegral(curve.curveMax, normalizedAge);
        return min + (max - min) * lerpFactor;
      }
      default:
        return 0;
    }
  }

  private static _curveKeysIntegral(curve: ParticleCurve, normalizedAge: number): number {
    if (!curve) return 0;
    const keys = curve.keys;
    const length = keys.length;
    if (length < 2) return 0;

    let cumulative = 0;
    for (let i = 1; i < length; i++) {
      const key = keys[i];
      const lastKey = keys[i - 1];
      const segmentTime = key.time - lastKey.time;
      if (segmentTime <= 0) continue;

      if (key.time >= normalizedAge) {
        const offsetTime = normalizedAge - lastKey.time;
        const t = offsetTime / segmentTime;
        const currentValue = lastKey.value + (key.value - lastKey.value) * t;
        cumulative += (lastKey.value + currentValue) * 0.5 * offsetTime;
        return cumulative;
      }
      cumulative += (lastKey.value + key.value) * 0.5 * segmentTime;
    }
    return cumulative;
  }

  private _freeRetiredParticles(): void {
    const frameCount = this._renderer.engine.time.frameCount;

    while (this._firstRetiredElement !== this._firstActiveElement) {
      const offset =
        this._firstRetiredElement * ParticleBufferUtils.instanceVertexFloatStride +
        ParticleBufferUtils.startLifeTimeOffset;
      const age = frameCount - this._instanceVertices[offset];

      // WebGL don't support map buffer range, so off this optimization
      if (age < 0) {
        break;
      }

      if (++this._firstRetiredElement >= this._currentParticleCount) {
        this._firstRetiredElement = 0;
      }
    }
  }

  private _addActiveParticlesToVertexBuffer(): void {
    const firstActiveElement = this._firstActiveElement;
    const firstFreeElement = this._firstFreeElement;

    // firstActiveElement == firstFreeElement should not update
    if (firstActiveElement === firstFreeElement) {
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

  private _resizeTransformedBoundsArray(): void {
    const floatStride = ParticleBufferUtils.boundsFloatStride;
    const increaseCount = ParticleGenerator._transformedBoundsIncreaseCount;

    this._transformedBoundsCount += increaseCount;
    const lastBoundsArray = this._transformedBoundsArray;
    const boundsArray = new Float32Array(this._transformedBoundsCount * floatStride);

    if (lastBoundsArray) {
      const firstFreeElement = this._firstFreeTransformedBoundingBox;
      boundsArray.set(new Float32Array(lastBoundsArray.buffer, 0, firstFreeElement * floatStride));

      const nextFreeElement = firstFreeElement + 1;
      const freeEndOffset = (nextFreeElement + increaseCount) * floatStride;
      boundsArray.set(new Float32Array(lastBoundsArray.buffer, nextFreeElement * floatStride * 4), freeEndOffset);

      const firstActiveElement = this._firstActiveTransformedBoundingBox;
      if (firstActiveElement > firstFreeElement) {
        this._firstActiveTransformedBoundingBox += increaseCount;
      }
    }

    this._transformedBoundsArray = boundsArray;
  }

  private _retireTransformedBounds(): void {
    const { boundsFloatStride, boundsTimeOffset, boundsMaxLifetimeOffset } = ParticleBufferUtils;
    const boundsArray = this._transformedBoundsArray;
    const firstFreeElement = this._firstFreeTransformedBoundingBox;
    const count = this._transformedBoundsCount;

    while (this._firstActiveTransformedBoundingBox !== firstFreeElement) {
      const index = this._firstActiveTransformedBoundingBox * boundsFloatStride;
      const age = this._playTime - boundsArray[index + boundsTimeOffset];
      if (age <= boundsArray[index + boundsMaxLifetimeOffset]) {
        break;
      }

      if (++this._firstActiveTransformedBoundingBox >= count) {
        this._firstActiveTransformedBoundingBox = 0;
      }
      this._renderer._onWorldVolumeChanged();
    }
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

    // StartSize's impact
    let maxSize = main.startSize._getMax();

    if (main.startSize3D) {
      const startSizeYMax = main.startSizeY._getMax();
      if (
        this._renderer.renderMode === ParticleRenderMode.Billboard ||
        ParticleRenderMode.StretchBillboard ||
        ParticleRenderMode.HorizontalBillboard
      ) {
        maxSize = Math.max(maxSize, startSizeYMax);
      } else {
        const startSizeZMax = main.startSizeZ._getMax();
        maxSize = Math.max(maxSize, startSizeYMax, startSizeZMax);
      }
    }

    // Use diagonal for potential rotation
    maxSize *= 1.414;

    // SizeOverLifetime impact
    const { sizeOverLifetime } = this;
    if (sizeOverLifetime.enabled) {
      let maxSizeOverLifetime = sizeOverLifetime.size._getMax();
      if (sizeOverLifetime.separateAxes) {
        const maxSizeOverLifetimeY = sizeOverLifetime.sizeY._getMax();
        const maxSizeOverLifetimeZ = sizeOverLifetime.sizeZ._getMax();
        maxSizeOverLifetime = Math.max(maxSizeOverLifetime, maxSizeOverLifetimeY, maxSizeOverLifetimeZ);
      }

      maxSize *= maxSizeOverLifetime;
    }

    min.set(min.x - maxSize, min.y - maxSize, min.z - maxSize);
    max.set(max.x + maxSize, max.y + maxSize, max.z + maxSize);
  }

  private _mergeTransformedBounds(index: number, bounds: BoundingBox): void {
    const { min, max } = bounds;
    const boundsArray = this._transformedBoundsArray;

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
  }

  private _calculateTransformedBounds(maxLifetime: number, origin: BoundingBox, out: BoundingBox): void {
    const {
      _tempVector20: velMinMaxX,
      _tempVector21: velMinMaxY,
      _tempVector22: velMinMaxZ,
      _tempVector30: worldOffsetMin,
      _tempVector31: worldOffsetMax,
      _tempMat: rotateMat
    } = ParticleGenerator;
    worldOffsetMin.set(0, 0, 0);
    worldOffsetMax.set(0, 0, 0);

    const { transform } = this._renderer.entity;
    const worldPosition = transform.worldPosition;
    Matrix.rotationQuaternion(transform.worldRotationQuaternion, rotateMat);

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

    out.transform(rotateMat);
    min.add(worldOffsetMin);
    max.add(worldOffsetMax);

    // Noise module impact: noise output is normalized to [-1, 1],
    // max displacement = |strength_max|
    const { noise } = this;
    if (noise.enabled) {
      let noiseMaxX: number, noiseMaxY: number, noiseMaxZ: number;
      if (noise.separateAxes) {
        noiseMaxX = Math.abs(noise.strengthX._getMax());
        noiseMaxY = Math.abs(noise.strengthY._getMax());
        noiseMaxZ = Math.abs(noise.strengthZ._getMax());
      } else {
        noiseMaxX = noiseMaxY = noiseMaxZ = Math.abs(noise.strengthX._getMax());
      }
      min.set(min.x - noiseMaxX, min.y - noiseMaxY, min.z - noiseMaxZ);
      max.set(max.x + noiseMaxX, max.y + noiseMaxY, max.z + noiseMaxZ);
    }

    min.add(worldPosition);
    max.add(worldPosition);
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
