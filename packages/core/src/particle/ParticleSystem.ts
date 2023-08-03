import { Buffer } from "./../graphic/Buffer";

/**
 * Particle System.
 */
export class ParticleSystem {


  private _vertexBuffer: Buffer;
  private _instanceVertexBuffer: Buffer;
  private _indexBuffer: Buffer;

  private _vertices: Float32Array;
  private _instanceVertices: Float32Array;
  private _indices: Uint16Array;

  private _initBuffers() {}
}
