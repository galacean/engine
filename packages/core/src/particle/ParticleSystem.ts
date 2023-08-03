import { Quaternion, Rand, Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Transform } from "../Transform";
import { BufferBindFlag, BufferUsage } from "../graphic";
import { Buffer } from "./../graphic/Buffer";
import { ParticleData } from "./ParticleData";
import { ParticleRenderer } from "./ParticleRenderer";
import { ParticleBufferUtils as ParticleBufferUtils } from "./ParticleVertexUtils";
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

  private _vertexBuffer: Buffer;
  private _instanceVertexBuffer: Buffer;
  private _indexBuffer: Buffer;

  private _vertices: Float32Array;
  private _instanceVertices: Float32Array;
  private _indices: Uint16Array;
  private _vertexStride: number = 0;
  private _instanceVertexStride: number = 0;

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

  private _recreateBuffers(): void {
    if (this._vertexBuffer) {
      this._vertexBuffer.destroy();
      this._instanceVertexBuffer.destroy();
      this._indexBuffer.destroy();
    }

    if (this._renderer.renderMode === ParticleRenderMode.Mesh) {
    } else {
      const engine = this._engine;
      const vertexBillboardStride = ParticleBufferUtils.billboardVertexStride * 4;
      const vertexBuffer = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        vertexBillboardStride,
        BufferUsage.Static,
        false
      );
      vertexBuffer.setData(ParticleBufferUtils.billboardVertices);
      this._vertexBuffer = vertexBuffer;

      const indexStride = 2 * 6;
      const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indexStride, BufferUsage.Static, false);
      indexBuffer.setData(ParticleBufferUtils.billboardIndices);
      this._indexBuffer = indexBuffer;

      const vertexInstanceStride = ParticleBufferUtils.instanceVertexStride * this.main.maxParticles;
      const vertexInstanceBuffer = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        vertexInstanceStride,
        BufferUsage.Static,
        false
      );
      this._instanceVertices = new Float32Array(vertexInstanceStride / 4);
    }
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
