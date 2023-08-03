import { Vector3 } from "oasis-engine";
import { Buffer } from "./../graphic/Buffer";
import { ParticleData } from "./ParticleData";
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
        for (let i = 0; i < count; i++) {
          position.set(0, 0, 0);
          direction.set(0, 0, -1);
          this._addNewParticle(position, direction);
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
  }

  private _addNewParticle(position: Vector3, direction: Vector3): void {
    direction.normalize();
    let nextFreeParticle = this._firstFreeElement + 1;
    if (nextFreeParticle >= this._maxBufferParticles) {
      nextFreeParticle = 0;
    }

    if (nextFreeParticle === this._firstRetiredElement) {
      // @todo: 查看是否可以扩容
    }
  }

  private _retireActiveParticles(): void {}

  private _freeRetiredParticles(): void {}

  private _addNewParticlesToBuffer(): void {}

  private _createParticleData(main: MainModule, out: ParticleData): void {
    this.main.startColor.evaluate(undefined, Math.random(), out.startColor);

    
  }
}
