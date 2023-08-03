import { Buffer } from "./../graphic/Buffer";
import { MainModule } from "./moudules/MainModule";

/**
 * Particle System.
 */
export class ParticleSystem {
  /** Main Particle System module. */
  readonly main: MainModule = new MainModule();
  /** Emission Particle System module. */
  readonly emission: MainModule = new MainModule();

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

  private _recreateBuffers(): void {
    if (this._vertexBuffer) {
      this._vertexBuffer.destroy();
      this._instanceVertexBuffer.destroy();
      this._indexBuffer.destroy();
    }
  }
}
