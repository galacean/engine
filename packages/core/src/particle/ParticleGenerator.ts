import { Color, MathUtil, Quaternion, Vector3, Vector4 } from "@galacean/engine-math";
import { Transform } from "../Transform";
import { BufferBindFlag, BufferUsage, MeshTopology, SubMesh, VertexBufferBinding, VertexElement } from "../graphic";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { VertexAttribute } from "../mesh";
import { ShaderData } from "../shader";
import { Buffer } from "./../graphic/Buffer";
import { ParticleRenderer } from "./ParticleRenderer";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ColorOverLifetimeModule } from "./modules/ColorOverLifetimeModule";
import { EmissionModule } from "./modules/EmissionModule";
import { MainModule } from "./modules/MainModule";
import { RotationOverLifetimeModule } from "./modules/RotationOverLifetimeModule";
import { ShapeModule } from "./modules/ShapeModule";
import { SizeOverLifetimeModule } from "./modules/SizeOverLifetimeModule";
import { TextureSheetAnimationModule } from "./modules/TextureSheetAnimationModule";
import { VelocityOverLifetimeModule } from "./modules/VelocityOverLifetimeModule";

/**
 * Particle System.
 */
export class ParticleGenerator {
  /** @internal */
  private static _tempVector30: Vector3 = new Vector3();
  /** @internal */
  private static _tempVector31: Vector3 = new Vector3();
  /** @internal */
  private static _tempVector40: Vector4 = new Vector4();
  /** @internal */
  private static _tempColor0: Color = new Color();

  /** Use auto random seed. */
  useAutoRandomSeed: boolean = true;

  /** Main module. */
  readonly main: MainModule = new MainModule(this);
  /** Emission module. */
  readonly emission: EmissionModule = new EmissionModule(this);
  /** Shape module. */
  readonly shape: ShapeModule = new ShapeModule(this);
  /** Velocity over lifetime module. */
  readonly velocityOverLifetime: VelocityOverLifetimeModule = new VelocityOverLifetimeModule(this);
  /** Size over lifetime module. */
  readonly sizeOverLifetime: SizeOverLifetimeModule = new SizeOverLifetimeModule(this);
  /** Rotation over lifetime module. */
  readonly rotationOverLifetime: RotationOverLifetimeModule = new RotationOverLifetimeModule(this);
  /** Color over lifetime module. */
  readonly colorOverLifetime: ColorOverLifetimeModule = new ColorOverLifetimeModule(this);
  /** Texture sheet animation module. */
  readonly textureSheetAnimation: TextureSheetAnimationModule = new TextureSheetAnimationModule(this);

  /** @internal */
  _currentParticleCount: number = 0;
  /** @internal */
  _playTime: number = 0;

  /** @internal */
  _firstNewElement: number = 0;
  /** @internal */
  _firstActiveElement: number = 0;
  /** @internal */
  _firstFreeElement: number = 0;
  /** @internal */
  _firstRetiredElement: number = 0;
  /** @internal */
  _primitive: Primitive;
  /** @internal */
  _vertexBufferBindings: VertexBufferBinding[] = [];
  /** @internal */
  _subPrimitive: SubMesh = new SubMesh(0, 0, MeshTopology.Triangles);

  private _instanceBufferResized: boolean = false;
  private _waitProcessRetiredElementCount: number = 0;
  private _instanceVertexBufferBinding: VertexBufferBinding;
  private _instanceVertices: Float32Array;
  private _randomSeed: number = 0;

  private readonly _renderer: ParticleRenderer;
  private readonly _particleIncreaseCount: number = 128;

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

  constructor(renderer: ParticleRenderer) {
    this._renderer = renderer;
    const subPrimitive = new SubPrimitive();
    subPrimitive.start = 0;

    this._primitive = new Primitive(renderer.engine);
    this._reorganizeGeometryBuffers();
    this._resizeInstanceBuffer(this._particleIncreaseCount);

    this.emission.enabled = true;
    this.shape.enabled = true;
  }

  /**
   * Emit a certain number of particles.
   * @param count - Number of particles to emit
   */
  emit(count: number): void {
    this._emit(this._playTime, count);
  }

  /**
   * @internal
   */
  _emit(time: number, count: number): void {
    const position = ParticleGenerator._tempVector30;
    const direction = ParticleGenerator._tempVector31;
    if (this.emission.enabled) {
      const transform = this._renderer.entity.transform;
      const shape = this.shape;
      const shapeEnabled = shape.enabled;
      for (let i = 0; i < count; i++) {
        if (shapeEnabled) {
          shape.shape._generatePositionAndDirection(position, direction);
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
    const lastPlayTime = this._playTime;
    this._playTime += elapsedTime;

    this._retireActiveParticles();
    this._freeRetiredParticles();

    if (this.emission.enabled && this._playTime) {
      this.emission._emit(lastPlayTime, this._playTime);
    }

    // Add new particles to vertex buffer when has wait process retired element or new particle
    // @todo: just update new particle buffer to instance buffer, ignore retired particle in shader, especially billboard
    if (
      this._firstNewElement != this._firstFreeElement ||
      this._waitProcessRetiredElementCount > 0 ||
      this._instanceBufferResized
    ) {
      this._addNewParticlesToVertexBuffer();
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
      this._subPrimitive.count = particleUtils.billboardIndexCount;
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
  _resizeInstanceBuffer(increaseCount: number): void {
    this._instanceVertexBufferBinding?.buffer.destroy();

    const particleUtils = this._renderer.engine._particleBufferUtils;
    const stride = particleUtils.instanceVertexStride;
    const particleCount = this._currentParticleCount + increaseCount;
    const byteLength = stride * particleCount;
    const engine = this._renderer.engine;
    const vertexInstanceBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      byteLength,
      BufferUsage.Dynamic,
      false
    );

    const vertexBufferBindings = this._primitive.vertexBufferBindings;
    const instanceVertexBufferBinding = new VertexBufferBinding(vertexInstanceBuffer, stride);

    const instanceVertices = new Float32Array(byteLength / 4);
    const lastInstanceVertices = this._instanceVertices;
    if (lastInstanceVertices) {
      const stride = particleUtils.instanceVertexFloatStride;

      const freeOffset = this._firstFreeElement * stride;
      instanceVertices.set(new Float32Array(lastInstanceVertices.buffer, 0, freeOffset));
      const freeEndOffset = (this._firstFreeElement + increaseCount) * stride;
      instanceVertices.set(new Float32Array(lastInstanceVertices.buffer, freeOffset), freeEndOffset);

      this._instanceBufferResized = true;
    }
    this._primitive.setVertexBufferBinding(vertexBufferBindings.length, instanceVertexBufferBinding);

    this._instanceVertices = instanceVertices;
    this._instanceVertexBufferBinding = instanceVertexBufferBinding;
    this._currentParticleCount = particleCount;
  }

  private _addNewParticle(position: Vector3, direction: Vector3, transform: Transform, time: number): void {
    const particleUtils = this._renderer.engine._particleBufferUtils;

    direction.normalize();

    const firstFreeElement = this._firstFreeElement;
    let nextFreeElement = firstFreeElement + 1;
    if (nextFreeElement >= this._currentParticleCount) {
      nextFreeElement = 0;
    }

    // Check if can be expanded
    if (nextFreeElement === this._firstRetiredElement) {
      const increaseCount = Math.min(this._particleIncreaseCount, this.main.maxParticles - this._currentParticleCount);
      if (increaseCount === 0) {
        return;
      }

      this._resizeInstanceBuffer(increaseCount);

      // Maintain expanded pointers
      this._firstNewElement > firstFreeElement && (this._firstNewElement += increaseCount);
      this._firstActiveElement > firstFreeElement && (this._firstActiveElement += increaseCount);
      this._firstRetiredElement > firstFreeElement && (this._firstRetiredElement += increaseCount);
    }

    const main = this.main;

    let pos: Vector3, rot: Quaternion;
    if (this.main.simulationSpace === ParticleSimulationSpace.World) {
      pos = transform.worldPosition;
      rot = transform.worldRotationQuaternion;
    }

    const startSpeed = main.startSpeed.evaluate(undefined, main._startSpeedRand.random());

    const instanceVertices = this._instanceVertices;
    const offset = firstFreeElement * particleUtils.instanceVertexFloatStride;

    // Position
    instanceVertices[offset] = position.x;
    instanceVertices[offset + 1] = position.y;
    instanceVertices[offset + 2] = position.z;

    // Start life time
    instanceVertices[offset + particleUtils.startLifeTimeOffset] = main.startLifetime.evaluate(
      undefined,
      main._startLifeTimeRand.random()
    );

    // Direction
    instanceVertices[offset + 4] = direction.x;
    instanceVertices[offset + 5] = direction.y;
    instanceVertices[offset + 6] = direction.z;

    // Time
    instanceVertices[offset + particleUtils.timeOffset] = time;

    // Color
    const startColor = ParticleGenerator._tempColor0;
    main.startColor.evaluate(undefined, this.main._startColorRand.random(), startColor);
    instanceVertices[offset + 8] = startColor.r;
    instanceVertices[offset + 9] = startColor.g;
    instanceVertices[offset + 10] = startColor.b;
    instanceVertices[offset + 11] = startColor.a;

    // Start size
    const startSizeRand = this.main._startSizeRand;
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
    const startRotationRand = this.main._startRotationRand;
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
        main.startRotation.evaluate(undefined, startRotationRand.random())
      );
    }

    // Start speed
    instanceVertices[offset + 18] = startSpeed;

    // @todo
    // Color, size, rotation, texture animation
    // instanceVertices[offset + 19] = rand.random();
    // instanceVertices[offset + 20] = rand.random();
    // instanceVertices[offset + 21] = rand.random();
    // instanceVertices[offset + 22] = rand.random();

    // @todo
    // Velocity random
    // instanceVertices[offset + 23] = rand.random();
    // instanceVertices[offset + 24] = rand.random();
    // instanceVertices[offset + 25] = rand.random();
    // instanceVertices[offset + 26] = rand.random();

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
      instanceVertices[offset + particleUtils.simulationUVOffset] = tillingInfo.x;
      instanceVertices[offset + 35] = tillingInfo.y;
      instanceVertices[offset + 36] = 0;
      instanceVertices[offset + 37] = 0;
    } else {
      instanceVertices[offset + particleUtils.simulationUVOffset] = 1;
      instanceVertices[offset + 35] = 1;
      instanceVertices[offset + 36] = 0;
      instanceVertices[offset + 37] = 0;
    }

    this._firstFreeElement = nextFreeElement;
  }

  private _retireActiveParticles(): void {
    const particleUtils = this._renderer.engine._particleBufferUtils;

    const epsilon = 0.0001;
    const frameCount = this._renderer.engine.time.frameCount;
    const instanceVertices = this._instanceVertices;

    while (this._firstActiveElement != this._firstNewElement) {
      const activeParticleOffset = this._firstActiveElement * particleUtils.instanceVertexFloatStride;
      const activeParticleTimeOffset = activeParticleOffset + particleUtils.timeOffset;

      const particleAge = this._playTime - instanceVertices[activeParticleTimeOffset];
      if (particleAge + epsilon < instanceVertices[activeParticleOffset + particleUtils.startLifeTimeOffset]) {
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

  /**
   * @internal
   */
  _updateShaderData(shaderData: ShaderData): void {
    this.textureSheetAnimation._updateShaderData(shaderData);
    this.sizeOverLifetime._updateShaderData(shaderData);
    this.colorOverLifetime._updateShaderData(shaderData);
  }

  /**
   * @internal
   */
  _resetGlobalRandSeed(seed: number): void {
    this._randomSeed = seed;
    this.main._resetRandomSeed(seed);
    this.emission._resetRandomSeed(seed);
    this.shape._resetRandomSeed(seed);
  }

  private _freeRetiredParticles(): void {
    const particleUtils = this._renderer.engine._particleBufferUtils;
    const frameCount = this._renderer.engine.time.frameCount;

    while (this._firstRetiredElement != this._firstActiveElement) {
      const offset =
        this._firstRetiredElement * particleUtils.instanceVertexFloatStride + particleUtils.startLifeTimeOffset;
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

  private _addNewParticlesToVertexBuffer(): void {
    const byteStride = this._renderer.engine._particleBufferUtils.instanceVertexStride;
    const firstActiveElement = this._firstActiveElement;
    const firstFreeElement = this._firstFreeElement;
    const start = firstActiveElement * byteStride;
    const instanceBuffer = this._instanceVertexBufferBinding.buffer;
    const dataBuffer = this._instanceVertices.buffer;

    if (firstActiveElement < firstFreeElement) {
      instanceBuffer.setData(dataBuffer, 0, start, (firstFreeElement - firstActiveElement) * byteStride);
    } else {
      const firstSegmentCount = (this._currentParticleCount - firstActiveElement) * byteStride;
      instanceBuffer.setData(dataBuffer, 0, start, firstSegmentCount);

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
}
