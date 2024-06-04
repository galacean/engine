import { BoundingBox, Color, MathUtil, Quaternion, Vector2, Vector3 } from "@galacean/engine-math";
import { Transform } from "../Transform";
import { deepClone, ignoreClone } from "../clone/CloneManager";
import { ColorSpace } from "../enums/ColorSpace";
import { Primitive } from "../graphic/Primitive";
import { SubMesh } from "../graphic/SubMesh";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { SetDataOptions } from "../graphic/enums/SetDataOptions";
import { VertexAttribute } from "../mesh";
import { ShaderData } from "../shader";
import { Buffer } from "./../graphic/Buffer";
import { ParticleRenderer, ParticleUpdateFlags } from "./ParticleRenderer";
import { ParticleCurveMode } from "./enums/ParticleCurveMode";
import { ParticleGradientMode } from "./enums/ParticleGradientMode";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ParticleStopMode } from "./enums/ParticleStopMode";
import { ColorOverLifetimeModule } from "./modules/ColorOverLifetimeModule";
import { EmissionModule } from "./modules/EmissionModule";
import { MainModule } from "./modules/MainModule";
import { RotationOverLifetimeModule } from "./modules/RotationOverLifetimeModule";
import { SizeOverLifetimeModule } from "./modules/SizeOverLifetimeModule";
import { TextureSheetAnimationModule } from "./modules/TextureSheetAnimationModule";
import { VelocityOverLifetimeModule } from "./modules/VelocityOverLifetimeModule";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

/**
 * Particle Generator.
 */
export class ParticleGenerator {
  private static _tempVector20 = new Vector2();
  private static _tempVector21 = new Vector2();
  private static _tempVector22 = new Vector2();
  private static _tempVector30 = new Vector3();
  private static _tempVector31 = new Vector3();
  private static _tempColor0 = new Color();
  private static _tempBoundingBox = new BoundingBox();
  private static _tempParticleRenderers = new Array<ParticleRenderer>();
  private static readonly _particleIncreaseCount = 128;
  private static readonly _transformedBoundsIncreaseCount = 16;

  /** Use auto random seed. */
  useAutoRandomSeed = true;

  /** Main module. */
  @deepClone
  readonly main = new MainModule(this);
  /** Emission module. */
  @deepClone
  readonly emission = new EmissionModule(this);
  /** Velocity over lifetime module. */
  @deepClone
  readonly velocityOverLifetime = new VelocityOverLifetimeModule(this);
  /** Size over lifetime module. */
  @deepClone
  readonly sizeOverLifetime = new SizeOverLifetimeModule(this);
  /** Rotation over lifetime module. */
  @deepClone
  readonly rotationOverLifetime = new RotationOverLifetimeModule(this);
  /** Color over lifetime module. */
  @deepClone
  readonly colorOverLifetime = new ColorOverLifetimeModule(this);
  /** Texture sheet animation module. */
  @deepClone
  readonly textureSheetAnimation = new TextureSheetAnimationModule(this);

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
  @ignoreClone
  readonly _renderer: ParticleRenderer;

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
  private _transformedBoundsArrayCapacity = 0;
  @ignoreClone
  private _firstActiveTransformedBoundingBox = 0;
  @ignoreClone
  private _firstFreeTransformedBoundingBox = 0;

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
        // Move the pointer to free immediately
        const firstFreeElement = this._firstFreeElement;
        this._firstRetiredElement = firstFreeElement;
        this._firstActiveElement = firstFreeElement;
        this._firstNewElement = firstFreeElement;
        this._playTime = 0;

        this._firstActiveTransformedBoundingBox = this._firstFreeTransformedBoundingBox;

        this.emission._reset();
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
  _emit(time: number, count: number): void {
    if (this.emission.enabled) {
      // Wait the existing particles to be retired
      if (this.main._maxParticleBuffer < this._currentParticleCount) {
        return;
      }
      const position = ParticleGenerator._tempVector30;
      const direction = ParticleGenerator._tempVector31;
      const transform = this._renderer.entity.transform;
      const shape = this.emission.shape;
      for (let i = 0; i < count; i++) {
        if (shape?.enabled) {
          shape._generatePositionAndDirection(this.emission._shapeRand, time, position, direction);
          const positionScale = this.main._getPositionScale();
          position.multiply(positionScale);
          direction.normalize().multiply(positionScale);
        } else {
          position.set(0, 0, 0);
          direction.set(0, 0, -1);
        }
        this._addNewParticle(position, direction, transform, time);
      }
    }
  }

  /**
   * @internal
   */
  _update(elapsedTime: number): void {
    const lastAlive = this.isAlive;
    const { main, emission } = this;
    const duration = main.duration;
    const lastPlayTime = this._playTime;

    this._playTime += elapsedTime * main.simulationSpeed;

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

    const isAlive = this.isAlive;
    if (isAlive) {
      if (main.simulationSpace === ParticleSimulationSpace.World) {
        this._generateTransformedBounds();
      }
    } else {
      // Reset play time when is not playing and no active particles to avoid potential precision problems in GPU
      const discardTime = Math.min(emission._frameRateTime, Math.floor(this._playTime / duration) * duration);
      this._playTime -= discardTime;
      emission._frameRateTime -= discardTime;
    }

    if (isAlive !== lastAlive) {
      this._renderer._onWorldVolumeChanged();
    }
    // Add new particles to vertex buffer when has wait process retired element or new particle
    //
    // Another choice is just add new particles to vertex buffer and render all particles ignore the retired particle in shader, especially billboards
    // But webgl don't support map buffer range, so this choice don't have performance advantage even less set data to GPU
    if (
      this._firstNewElement != this._firstFreeElement ||
      this._waitProcessRetiredElementCount > 0 ||
      this._instanceBufferResized ||
      this._instanceVertexBufferBinding._buffer.isContentLost
    ) {
      this._addActiveParticlesToVertexBuffer();
    }
  }

  /**
   * @internal
   */
  _reorganizeGeometryBuffers(): void {
    const renderer = this._renderer;
    const particleUtils = renderer.engine._particleBufferUtils;
    const primitive = this._primitive;
    const vertexBufferBindings = this._vertexBufferBindings;

    primitive.clearVertexElements();
    vertexBufferBindings.length = 0;

    if (renderer.renderMode === ParticleRenderMode.Mesh) {
      const mesh = renderer.mesh;
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
      }

      if (uvBufferBinding) {
        const index = this._addVertexBufferBindingsFilterDuplicate(uvBufferBinding, vertexBufferBindings);
        primitive.addVertexElement(new VertexElement(VertexAttribute.UV, uvElement.offset, uvElement.format, index));
      }

      // @todo: multi subMesh or not support
      const indexBufferBinding = mesh._primitive.indexBufferBinding;
      primitive.setIndexBufferBinding(indexBufferBinding);
      this._subPrimitive.count = indexBufferBinding.buffer.byteLength / primitive._glIndexByteCount;
    } else {
      primitive.addVertexElement(particleUtils.billboardVertexElement);
      vertexBufferBindings.push(particleUtils.billboardVertexBufferBinding);
      primitive.setIndexBufferBinding(particleUtils.billboardIndexBufferBinding);
      this._subPrimitive.count = ParticleBufferUtils.billboardIndexCount;
    }
    primitive.setVertexBufferBindings(vertexBufferBindings);

    const instanceVertexElements = particleUtils.instanceVertexElements;
    const bindingIndex = vertexBufferBindings.length;
    for (let i = 0, n = instanceVertexElements.length; i < n; i++) {
      const element = instanceVertexElements[i];
      primitive.addVertexElement(
        new VertexElement(element.attribute, element.offset, element.format, bindingIndex, element.instanceStepRate)
      );
    }
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

    const instanceVertices = new Float32Array(newByteLength / 4);

    const lastInstanceVertices = this._instanceVertices;
    if (lastInstanceVertices) {
      const floatStride = ParticleBufferUtils.instanceVertexFloatStride;

      const firstFreeElement = this._firstFreeElement;
      const firstRetiredElement = this._firstRetiredElement;
      if (isIncrease) {
        instanceVertices.set(new Float32Array(lastInstanceVertices.buffer, 0, firstFreeElement * floatStride));

        const nextFreeElement = firstFreeElement + 1;
        const freeEndOffset = (nextFreeElement + increaseCount) * floatStride;
        instanceVertices.set(
          new Float32Array(lastInstanceVertices.buffer, nextFreeElement * floatStride * 4),
          freeEndOffset
        );

        // Maintain expanded pointers
        this._firstNewElement > firstFreeElement && (this._firstNewElement += increaseCount);
        this._firstActiveElement > firstFreeElement && (this._firstActiveElement += increaseCount);
        firstRetiredElement > firstFreeElement && (this._firstRetiredElement += increaseCount);
      } else {
        let migrateCount: number, bufferOffset: number;
        if (firstRetiredElement <= firstFreeElement) {
          migrateCount = firstFreeElement - firstRetiredElement;
          bufferOffset = 0;

          // Maintain expanded pointers
          this._firstFreeElement -= firstRetiredElement;
          this._firstNewElement -= firstRetiredElement;
          this._firstActiveElement -= firstRetiredElement;
          this._firstRetiredElement = 0;
        } else {
          migrateCount = this._currentParticleCount - firstRetiredElement;
          bufferOffset = firstFreeElement;

          // Maintain expanded pointers
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
      }

      this._instanceBufferResized = true;
    }
    // Instance buffer always at last
    this._primitive.setVertexBufferBinding(
      lastInstanceVertices ? vertexBufferBindings.length - 1 : vertexBufferBindings.length,
      vertexBufferBinding
    );

    this._instanceVertices = instanceVertices;
    this._instanceVertexBufferBinding = vertexBufferBinding;
    this._currentParticleCount = newParticleCount;
  }

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    this.main._updateShaderData(shaderData);
    this.velocityOverLifetime._updateShaderData(shaderData);
    this.textureSheetAnimation._updateShaderData(shaderData);
    this.sizeOverLifetime._updateShaderData(shaderData);
    this.rotationOverLifetime._updateShaderData(shaderData);
    this.colorOverLifetime._updateShaderData(shaderData);
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
    this.rotationOverLifetime._resetRandomSeed(seed);
    this.colorOverLifetime._resetRandomSeed(seed);
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
  _destroy(): void {
    this._instanceVertexBufferBinding.buffer.destroy();
    this._primitive.destroy();
  }

  /**
   * @internal
   */
  _updateBoundsSimulationLocal(bounds: BoundingBox): void {
    const renderer = this._renderer;
    const generatorBounds = renderer._generatorBounds;

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume)) {
      this._calculateGeneratorBounds(generatorBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    const transformedBounds = ParticleGenerator._tempBoundingBox;

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
      this._addRotationAndVelocityOverLifetimeToBounds(generatorBounds, transformedBounds);

      const worldPosition = this._renderer.entity.transform.worldPosition;
      transformedBounds.min.add(worldPosition);
      transformedBounds.max.add(worldPosition);

      renderer._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
    }

    this._addGravityToBounds(transformedBounds, bounds);
  }

  /**
   * @internal
   */
  _updateBoundsSimulationWorld(bounds: BoundingBox): void {
    const transformedBoundsArray = this._transformedBoundsArray;
    const firstActiveTransformedBoundingBox = this._firstActiveTransformedBoundingBox;
    const firstFreeTransformedBoundingBox = this._firstFreeTransformedBoundingBox;
    const transformedBoundsArrayCapacity = this._transformedBoundsArrayCapacity;

    const index = firstActiveTransformedBoundingBox * ParticleBufferUtils.boundsFloatStride;
    bounds.min.copyFromArray(transformedBoundsArray, index);
    bounds.max.copyFromArray(transformedBoundsArray, index + 3);

    if (firstActiveTransformedBoundingBox < firstFreeTransformedBoundingBox) {
      for (let i = firstActiveTransformedBoundingBox; i < firstFreeTransformedBoundingBox; i++) {
        this._mergeTransformedBounds(i, bounds);
      }
    } else {
      for (let i = firstActiveTransformedBoundingBox; i < transformedBoundsArrayCapacity; i++) {
        this._mergeTransformedBounds(i, bounds);
      }
      if (firstFreeTransformedBoundingBox > 0) {
        for (let i = 0; i < firstFreeTransformedBoundingBox; i++) {
          this._mergeTransformedBounds(i, bounds);
        }
      }
    }
    this._addGravityToBounds(bounds, bounds);
  }

  /**
   * @internal
   */
  _resizeBoundsArray(): void {
    const floatStride = ParticleBufferUtils.boundsFloatStride;
    const increaseCount = ParticleGenerator._transformedBoundsIncreaseCount;
    const firstFreeTransformedBoundingBox = this._firstFreeTransformedBoundingBox;
    const firstActiveTransformedBoundingBox = this._firstActiveTransformedBoundingBox;

    this._transformedBoundsArrayCapacity += increaseCount;
    const lastBoundsArray = this._transformedBoundsArray;
    const boundsArray = new Float32Array(this._transformedBoundsArrayCapacity * floatStride);

    if (lastBoundsArray) {
      boundsArray.set(new Float32Array(lastBoundsArray.buffer, 0, firstFreeTransformedBoundingBox * floatStride));

      const nextFreeTransformedBoundingBox = firstFreeTransformedBoundingBox + 1;
      const freeEndOffset = (nextFreeTransformedBoundingBox + increaseCount) * floatStride;
      boundsArray.set(
        new Float32Array(lastBoundsArray.buffer, nextFreeTransformedBoundingBox * floatStride * 4),
        freeEndOffset
      );

      if (firstActiveTransformedBoundingBox > firstFreeTransformedBoundingBox) {
        this._firstActiveTransformedBoundingBox += increaseCount;
      }
    }

    this._transformedBoundsArray = boundsArray;
  }

  /**
   * @internal
   */
  _freeBoundsArray(): void {
    this._transformedBoundsArray = null;

    this._transformedBoundsArrayCapacity = 0;
    this._firstActiveTransformedBoundingBox = 0;
    this._firstFreeTransformedBoundingBox = 0;
  }

  /**
   * @internal
   */
  _generateTransformedBounds(): void {
    const renderer = this._renderer;
    const generatorBounds = renderer._generatorBounds;

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.GeneratorVolume)) {
      this._calculateGeneratorBounds(generatorBounds);
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.GeneratorVolume);
    }

    const { boundsFloatStride, boundsTimeOffset, boundsMaxLifetimeOffset } = ParticleBufferUtils;

    if (renderer._isContainDirtyFlag(ParticleUpdateFlags.TransformVolume)) {
      // Resize transformed bounds if needed
      let nextFreeTransformedBoundingBox = this._firstFreeTransformedBoundingBox + 1;
      if (nextFreeTransformedBoundingBox >= this._transformedBoundsArrayCapacity) {
        nextFreeTransformedBoundingBox = 0;
      }
      if (nextFreeTransformedBoundingBox === this._firstActiveTransformedBoundingBox) {
        this._resizeBoundsArray();

        nextFreeTransformedBoundingBox = this._firstFreeTransformedBoundingBox + 1;
      }

      // Generate transformed bounds
      const worldPosition = renderer.entity.transform.worldPosition;
      const transformedBounds = ParticleGenerator._tempBoundingBox;
      this._addRotationAndVelocityOverLifetimeToBounds(generatorBounds, transformedBounds);

      const { min, max } = transformedBounds;
      min.add(worldPosition);
      max.add(worldPosition);

      const boundsOffset = this._firstFreeTransformedBoundingBox * boundsFloatStride;
      const transformedBoundsArray = this._transformedBoundsArray;
      min.copyToArray(transformedBoundsArray, boundsOffset);
      max.copyToArray(transformedBoundsArray, boundsOffset + 3);

      const maxLifetime = this.main.startLifetime._getMax();
      transformedBoundsArray[boundsOffset + boundsTimeOffset] = this._playTime;
      transformedBoundsArray[boundsOffset + boundsMaxLifetimeOffset] = maxLifetime;

      this._firstFreeTransformedBoundingBox = nextFreeTransformedBoundingBox;
      renderer._setDirtyFlagFalse(ParticleUpdateFlags.TransformVolume);
    } else {
      const previousBoundsOffset =
        ((this._firstFreeTransformedBoundingBox - 1) % this._transformedBoundsArrayCapacity) * boundsFloatStride;

      this._transformedBoundsArray[previousBoundsOffset + boundsTimeOffset] = this._playTime;
    }
  }

  private _addNewParticle(position: Vector3, direction: Vector3, transform: Transform, time: number): void {
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
      pos = transform.worldPosition;
      rot = transform.worldRotationQuaternion;
    }

    const startSpeed = main.startSpeed.evaluate(undefined, main._startSpeedRand.random());

    const instanceVertices = this._instanceVertices;
    const offset = firstFreeElement * ParticleBufferUtils.instanceVertexFloatStride;

    // Position
    instanceVertices[offset] = position.x;
    instanceVertices[offset + 1] = position.y;
    instanceVertices[offset + 2] = position.z;

    // Start life time
    instanceVertices[offset + ParticleBufferUtils.startLifeTimeOffset] = main.startLifetime.evaluate(
      undefined,
      main._startLifeTimeRand.random()
    );

    // Direction
    instanceVertices[offset + 4] = direction.x;
    instanceVertices[offset + 5] = direction.y;
    instanceVertices[offset + 6] = direction.z;

    // Time
    instanceVertices[offset + ParticleBufferUtils.timeOffset] = time;

    // Color
    const startColor = ParticleGenerator._tempColor0;
    main.startColor.evaluate(undefined, main._startColorRand.random(), startColor);
    if (this._renderer.engine.settings.colorSpace === ColorSpace.Linear) {
      startColor.toLinear(startColor);
    }

    instanceVertices[offset + 8] = startColor.r;
    instanceVertices[offset + 9] = startColor.g;
    instanceVertices[offset + 10] = startColor.b;
    instanceVertices[offset + 11] = startColor.a;

    // Start size
    const startSizeRand = main._startSizeRand;
    if (main.startSize3D) {
      instanceVertices[offset + 12] = main.startSizeX.evaluate(undefined, startSizeRand.random());
      instanceVertices[offset + 13] = main.startSizeY.evaluate(undefined, startSizeRand.random());
      instanceVertices[offset + 14] = main.startSizeZ.evaluate(undefined, startSizeRand.random());
    } else {
      const size = main.startSize.evaluate(undefined, startSizeRand.random());
      instanceVertices[offset + 12] = size;
      instanceVertices[offset + 13] = size;
      instanceVertices[offset + 14] = size;
    }

    // Start rotation
    const startRotationRand = main._startRotationRand;
    if (main.startRotation3D) {
      instanceVertices[offset + 15] = MathUtil.degreeToRadian(
        main.startRotationX.evaluate(undefined, startRotationRand.random())
      );
      instanceVertices[offset + 16] = MathUtil.degreeToRadian(
        main.startRotationY.evaluate(undefined, startRotationRand.random())
      );
      instanceVertices[offset + 17] = MathUtil.degreeToRadian(
        main.startRotationZ.evaluate(undefined, startRotationRand.random())
      );
    } else {
      instanceVertices[offset + 15] = MathUtil.degreeToRadian(
        main.startRotationZ.evaluate(undefined, startRotationRand.random())
      );
    }

    // Start speed
    instanceVertices[offset + 18] = startSpeed;

    // Unused, Color, size, rotation,
    // instanceVertices[offset + 19] = rand.random();
    const colorOverLifetime = this.colorOverLifetime;
    if (colorOverLifetime.enabled && colorOverLifetime.color.mode === ParticleGradientMode.TwoGradients) {
      instanceVertices[offset + 20] = colorOverLifetime._colorGradientRand.random();
    }

    // instanceVertices[offset + 21] = rand.random();

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
      instanceVertices[offset + 27] = pos.x;
      instanceVertices[offset + 28] = pos.y;
      instanceVertices[offset + 29] = pos.z;

      // Simulation world position
      instanceVertices[offset + 30] = rot.x;
      instanceVertices[offset + 31] = rot.y;
      instanceVertices[offset + 32] = rot.z;
      instanceVertices[offset + 33] = rot.w;
    }

    // Simulation UV
    if (this.textureSheetAnimation.enabled) {
      const tillingInfo = this.textureSheetAnimation._tillingInfo;
      instanceVertices[offset + ParticleBufferUtils.simulationUVOffset] = tillingInfo.x;
      instanceVertices[offset + 35] = tillingInfo.y;
      instanceVertices[offset + 36] = 0;
      instanceVertices[offset + 37] = 0;
    } else {
      instanceVertices[offset + ParticleBufferUtils.simulationUVOffset] = 1;
      instanceVertices[offset + 35] = 1;
      instanceVertices[offset + 36] = 0;
      instanceVertices[offset + 37] = 0;
    }

    this._firstFreeElement = nextFreeElement;
  }

  private _retireActiveParticles(): void {
    const engine = this._renderer.engine;

    const frameCount = engine.time.frameCount;
    const instanceVertices = this._instanceVertices;

    while (this._firstActiveElement !== this._firstNewElement) {
      const activeParticleOffset = this._firstActiveElement * ParticleBufferUtils.instanceVertexFloatStride;
      const activeParticleTimeOffset = activeParticleOffset + ParticleBufferUtils.timeOffset;

      const particleAge = this._playTime - instanceVertices[activeParticleTimeOffset];
      // Use `Math.fround` to ensure the precision of comparison is same
      if (Math.fround(particleAge) < instanceVertices[activeParticleOffset + ParticleBufferUtils.startLifeTimeOffset]) {
        break;
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
    const start = firstActiveElement * byteStride;
    const instanceBuffer = this._instanceVertexBufferBinding.buffer;
    const dataBuffer = this._instanceVertices.buffer;

    if (firstActiveElement < firstFreeElement) {
      instanceBuffer.setData(
        dataBuffer,
        0,
        start,
        (firstFreeElement - firstActiveElement) * byteStride,
        SetDataOptions.Discard
      );
    } else {
      const firstSegmentCount = (this._currentParticleCount - firstActiveElement) * byteStride;
      instanceBuffer.setData(dataBuffer, 0, start, firstSegmentCount, SetDataOptions.Discard);

      if (firstFreeElement > 0) {
        instanceBuffer.setData(dataBuffer, firstSegmentCount, 0, firstFreeElement * byteStride);
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

  private _retireTransformedBounds(): void {
    const { boundsFloatStride, boundsTimeOffset, boundsMaxLifetimeOffset } = ParticleBufferUtils;
    const transformedBoundsArray = this._transformedBoundsArray;
    const firstFreeTransformedBoundingBox = this._firstFreeTransformedBoundingBox;

    while (this._firstActiveTransformedBoundingBox !== firstFreeTransformedBoundingBox) {
      const index = this._firstActiveTransformedBoundingBox * boundsFloatStride;
      const age = this._playTime - transformedBoundsArray[index + boundsTimeOffset];
      if (age <= transformedBoundsArray[index + boundsMaxLifetimeOffset]) {
        break;
      }

      if (++this._firstActiveTransformedBoundingBox >= this._transformedBoundsArrayCapacity) {
        this._firstActiveTransformedBoundingBox = 0;
      }
      this._renderer._onWorldVolumeChanged();
    }
  }

  private _calculateGeneratorBounds(bounds: BoundingBox): void {
    const directionMax = ParticleGenerator._tempVector30;
    const directionMin = ParticleGenerator._tempVector31;
    const speedMinMax = ParticleGenerator._tempVector20;
    const { min, max } = bounds;
    const { main } = this;

    // Get longest Lifetime
    const maxLifetime = main.startLifetime._getMax();

    // StartSpeed's impact
    const { shape } = this.emission;
    if (shape?.enabled) {
      shape._getStartPositionRange(min, max);
      shape._getDirectionRange(directionMin, directionMax);
    } else {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
      directionMin.set(0, 0, -1);
      directionMax.set(0, 0, 0);
    }
    main.startSpeed._getMinMax(speedMinMax);
    this._getExtremeValueFromZero(speedMinMax);

    const { x: speedMin, y: speedMax } = speedMinMax;
    const { x: minX, y: minY, z: minZ } = directionMin;
    const { x: maxX, y: maxY, z: maxZ } = directionMax;

    min.set(
      min.x + Math.min(minX * speedMax, maxX * speedMin) * maxLifetime,
      min.y + Math.min(minY * speedMax, maxY * speedMin) * maxLifetime,
      min.z + Math.min(minZ * speedMax, maxZ * speedMin) * maxLifetime
    );

    max.set(
      max.x + Math.max(minX * speedMin, maxX * speedMax) * maxLifetime,
      max.y + Math.max(minY * speedMin, maxY * speedMax) * maxLifetime,
      max.z + Math.max(minZ * speedMin, maxZ * speedMax) * maxLifetime
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

    min.set(min.x - maxSize, min.y - maxSize, min.z - maxSize);
    max.set(max.x + maxSize, max.y + maxSize, max.z + maxSize);
  }

  private _mergeTransformedBounds(index: number, bounds: BoundingBox): void {
    const { min, max } = bounds;
    const transformedBoundsArray = this._transformedBoundsArray;

    const baseIndex = index * ParticleBufferUtils.boundsFloatStride;

    min.set(
      Math.min(min.x, transformedBoundsArray[baseIndex]),
      Math.min(min.y, transformedBoundsArray[baseIndex + 1]),
      Math.min(min.z, transformedBoundsArray[baseIndex + 2])
    );

    max.set(
      Math.max(max.x, transformedBoundsArray[baseIndex + 3]),
      Math.max(max.y, transformedBoundsArray[baseIndex + 4]),
      Math.max(max.z, transformedBoundsArray[baseIndex + 5])
    );
  }

  private _addRotationAndVelocityOverLifetimeToBounds(origin: BoundingBox, out: BoundingBox): void {
    const directionMax = ParticleGenerator._tempVector30;
    const directionMin = ParticleGenerator._tempVector31;
    const minmaxX = ParticleGenerator._tempVector20;
    const minmaxY = ParticleGenerator._tempVector21;
    const minmaxZ = ParticleGenerator._tempVector22;
    const worldRotation = this._renderer.entity.transform.worldRotationQuaternion;

    out.copyFrom(origin);
    const { min, max } = out;

    if (this.velocityOverLifetime.enabled) {
      const { velocityX, velocityY, velocityZ, space } = this.velocityOverLifetime;
      const maxLifetime = this.main.startLifetime._getMax();

      velocityX._getMinMax(minmaxX);
      this._getExtremeValueFromZero(minmaxX);
      velocityY._getMinMax(minmaxY);
      this._getExtremeValueFromZero(minmaxY);
      velocityZ._getMinMax(minmaxZ);
      this._getExtremeValueFromZero(minmaxZ);

      directionMin.set(minmaxX.x, minmaxY.x, minmaxZ.x);
      directionMax.set(minmaxX.y, minmaxY.y, minmaxZ.y);

      if (space === ParticleSimulationSpace.Local) {
        min.x += directionMin.x * maxLifetime;
        max.x += directionMax.x * maxLifetime;

        min.y += directionMin.y * maxLifetime;
        max.y += directionMax.y * maxLifetime;

        min.z += directionMin.z * maxLifetime;
        max.z += directionMax.z * maxLifetime;

        min.transformByQuat(worldRotation);
        max.transformByQuat(worldRotation);
      } else {
        min.transformByQuat(worldRotation);
        max.transformByQuat(worldRotation);

        min.x += directionMin.x * maxLifetime;
        max.x += directionMax.x * maxLifetime;

        min.y += directionMin.y * maxLifetime;
        max.y += directionMax.y * maxLifetime;

        min.z += directionMin.z * maxLifetime;
        max.z += directionMax.z * maxLifetime;
      }
    } else {
      min.transformByQuat(worldRotation);
      max.transformByQuat(worldRotation);
    }
  }

  private _addGravityToBounds(origin: BoundingBox, out: BoundingBox): void {
    const { min, max } = origin;
    const { min: worldMin, max: worldMax } = out;
    const gravityMinMax = ParticleGenerator._tempVector20;

    const maxLifetime = this.main.startLifetime._getMax();

    // Gravity Modifier Impact
    this.main.gravityModifier._getMinMax(gravityMinMax);
    this._getExtremeValueFromZero(gravityMinMax);
    const direction = this._renderer.scene.physics.gravity;

    const gravityDisplacement = 0.5 * maxLifetime * maxLifetime;
    const gravityMinVelocity = gravityMinMax.x * gravityDisplacement;
    const gravityMaxVelocity = gravityMinMax.y * gravityDisplacement;

    const xMinGravityVelocity = direction.x * gravityMinVelocity;
    const xMaxGravityVelocity = direction.x * gravityMaxVelocity;
    worldMin.x = Math.min(xMinGravityVelocity, xMaxGravityVelocity) + min.x;
    worldMax.x = Math.max(xMinGravityVelocity, xMaxGravityVelocity) + max.x;

    const yMinGravityVelocity = direction.y * gravityMinVelocity;
    const yMaxGravityVelocity = direction.y * gravityMaxVelocity;
    worldMin.y = Math.min(yMinGravityVelocity, yMaxGravityVelocity) + min.y;
    worldMax.y = Math.max(yMinGravityVelocity, yMaxGravityVelocity) + max.y;

    const zMinGravityVelocity = direction.z * gravityMinVelocity;
    const zMaxGravityVelocity = direction.z * gravityMaxVelocity;
    worldMin.z = Math.min(zMinGravityVelocity, zMaxGravityVelocity) + min.z;
    worldMax.z = Math.max(zMinGravityVelocity, zMaxGravityVelocity) + max.z;
  }

  private _getExtremeValueFromZero(out: Vector2): void {
    out.x = Math.min(0, out.x);
    out.y = Math.max(0, out.y);
  }
}
