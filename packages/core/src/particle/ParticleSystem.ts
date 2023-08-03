import { Quaternion, Rand, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Transform } from "../Transform";
import { BufferBindFlag, BufferUsage, IndexBufferBinding, VertexBufferBinding, VertexElement } from "../graphic";
import { Buffer } from "./../graphic/Buffer";
import { ParticleData } from "./ParticleData";
import { ParticleRenderer } from "./ParticleRenderer";

import { VertexAttribute } from "../mesh";
import { ParticleBufferDefinition } from "./ParticleBufferUtils";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { EmissionModule } from "./moudules/EmissionModule";
import { MainModule } from "./moudules/MainModule";
import { ShapeModule } from "./moudules/ShapeModule";

/**
 * Particle System.
 */
export class ParticleSystem {
  /** @internal */
  private static _tempVector30: Vector3 = new Vector3();
  /** @internal */
  private static _tempVector31: Vector3 = new Vector3();
  /** @internal */
  private static _particleData: ParticleData = new ParticleData();

  /** Use auto random seed. */
  useAutoRandomSeed: boolean = true;

  /** Main module. */
  readonly main: MainModule = new MainModule();
  /** Emission module. */
  readonly emission: EmissionModule = new EmissionModule();
  /** Shape module. */
  readonly shape: ShapeModule = new ShapeModule();

  private _maxBufferParticles: number = 0;
  private _firstActiveElement: number = 0;
  private _firstNewElement: number = 0;
  private _firstFreeElement: number = 0;
  private _firstRetiredElement: number = 0;

  private _vertexElements: VertexElement[] = [];
  private _vertexBufferBindings: VertexBufferBinding[] = [];
  private _indexBufferBinding: IndexBufferBinding;

  private _instanceVertexBufferBinding: VertexBufferBinding;
  private _instanceVertices: Float32Array;

  private _rand: Rand = new Rand(0);

  private _engine: Engine;
  private _renderer: ParticleRenderer;

  /**
   * Random seed.
   * @remarks If `useAutoRandomSeed` is true, this value will be random changed when play.
   */
  get randomSeed(): number {
    return this._rand.seed;
  }

  set randomSeed(value: number) {
    this._rand.reset(value);
  }

  constructor(renderer: ParticleRenderer) {
    this._renderer = renderer;
  }

  /**
   * Emit a certain number of particles.
   * @param count - Number of particles to emit
   */
  emit(count: number): void {
    const position = ParticleSystem._tempVector30;
    const direction = ParticleSystem._tempVector31;
    if (this.emission.enabled) {
      if (this.shape.enabled) {
      } else {
        const transform = this._renderer.entity.transform;
        for (let i = 0; i < count; i++) {
          position.set(0, 0, 0);
          direction.set(0, 0, -1);
          this._addNewParticle(position, direction, transform);
        }
      }
    }
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

  private _createGeometryBuffers(): void {
    const vertexElements = this._vertexElements;
    const vertexBufferBindings = this._vertexBufferBindings;
    vertexElements.length = 0;
    vertexBufferBindings.length = 0;

    if (this._renderer.renderMode === ParticleRenderMode.Mesh) {
      const mesh = this._renderer.mesh;
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
        vertexElements.push(
          new VertexElement(VertexAttribute.Position, positionElement.offset, positionElement.format, index)
        );
      }

      if (colorBufferBinding) {
        const index = this._addVertexBufferBindingsFilterDuplicate(colorBufferBinding, vertexBufferBindings);
        vertexElements.push(new VertexElement(VertexAttribute.Color, colorElement.offset, colorElement.format, index));
      }

      if (uvBufferBinding) {
        const index = this._addVertexBufferBindingsFilterDuplicate(uvBufferBinding, vertexBufferBindings);
        vertexElements.push(new VertexElement(VertexAttribute.UV, uvElement.offset, uvElement.format, index));
      }

      this._indexBufferBinding = mesh._indexBufferBinding;
    } else {
      vertexElements.push(ParticleBufferDefinition.billboardVertexElement);
      vertexBufferBindings.push(ParticleBufferDefinition.billboardVertexBufferBinding);
      this._indexBufferBinding = ParticleBufferDefinition.billboardIndexBufferBinding;
    }
  }

  private _recreateInstanceBuffer(particleCount: number): void {
    const instanceBinding = this._instanceVertexBufferBinding;
    const vertexBufferBindings = this._vertexBufferBindings;

    if (instanceBinding !== null) {
      instanceBinding.buffer.destroy();
    } else {
      vertexBufferBindings.length++;
    }

    const stride = ParticleBufferDefinition.instanceVertexStride;
    const byteLength = stride * Math.min(particleCount, this.main.maxParticles);
    const vertexInstanceBuffer = new Buffer(
      this._engine,
      BufferBindFlag.VertexBuffer,
      byteLength,
      BufferUsage.Dynamic,
      false
    );
    this._instanceVertices = new Float32Array(byteLength / 4);
    vertexBufferBindings[vertexBufferBindings.length - 1] = new VertexBufferBinding(vertexInstanceBuffer, stride);
  }

  private _addNewParticle(position: Vector3, direction: Vector3, transform: Transform): void {
    direction.normalize();
    let nextFreeParticle = this._firstFreeElement + 1;
    if (nextFreeParticle >= this._maxBufferParticles) {
      nextFreeParticle = 0;
    }

    if (nextFreeParticle === this._firstRetiredElement) {
      // @todo: 查看是否可以扩容
    }

    const main = this.main;
    const out = ParticleSystem._particleData;

    const rand = this._rand;
    main.startColor.evaluate(undefined, rand.random(), out.startColor);

    if (main.startSize3D) {
      out.startSize[0] = main.startSizeX.evaluate(undefined, rand.random());
      out.startSize[1] = main.startSizeY.evaluate(undefined, rand.random());
      out.startSize[2] = main.startSizeZ.evaluate(undefined, rand.random());
    } else {
      out.startSize[0] = main.startSize.evaluate(undefined, rand.random());
    }

    if (main.startRotation3D) {
      out.startRotation[0] = main.startRotationX.evaluate(undefined, rand.random());
      out.startRotation[1] = main.startRotationY.evaluate(undefined, rand.random());
      out.startRotation[2] = main.startRotationZ.evaluate(undefined, rand.random());
    } else {
      out.startRotation[0] = main.startRotation.evaluate(undefined, rand.random());
    }

    out.startLifeTime = main.startLifetime.evaluate(undefined, rand.random());

    let pos: Vector3, rot: Quaternion;
    if (this.main.simulationSpace === ParticleSimulationSpace.World) {
      pos = transform.worldPosition;
      rot = transform.worldRotationQuaternion;
    }

    const startSpeed = main.startSpeed.evaluate(undefined, rand.random());
  }

  private _retireActiveParticles(): void {}

  private _freeRetiredParticles(): void {}

  private _addNewParticlesToBuffer(): void {}

  private _createParticleData(main: MainModule, out: ParticleData): void {}
}
