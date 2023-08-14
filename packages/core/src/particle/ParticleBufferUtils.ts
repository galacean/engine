import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { ParticleBillboardVertexAttribute } from "./enums/attributes/BillboardParticleVertexAttribute";
import { ParticleInstanceVertexAttribute } from "./enums/attributes/ParticleInstanceVertexAttribute";

/**
 * @internal
 */
export class ParticleBufferUtils {
  readonly billboardVertexElement = new VertexElement(
    ParticleBillboardVertexAttribute.cornerTextureCoordinate,
    0,
    VertexElementFormat.Vector4,
    0
  );

  readonly instanceVertexElements = [
    new VertexElement(ParticleInstanceVertexAttribute.ShapePositionStartLifeTime, 0, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.DirectionTime, 16, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartColor, 32, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartSize, 48, VertexElementFormat.Vector3, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartRotation0, 60, VertexElementFormat.Vector3, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartSpeed, 72, VertexElementFormat.Float, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.Random0, 76, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.Random1, 92, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldPosition, 108, VertexElementFormat.Vector3, 1, 1), //TODO:local模式下可省去内存
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldRotation, 120, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationUV, 136, VertexElementFormat.Vector4, 1, 1)
  ];

  readonly instanceVertexStride = 152;
  readonly instanceVertexFloatStride = this.instanceVertexStride / 4;

  readonly startLifeTimeOffset = 3;
  readonly timeOffset = 7;
  readonly simulationOffset = 34;

  readonly billboardIndexCount = 6;

  readonly billboardVertexBufferBinding: VertexBufferBinding;
  readonly billboardIndexBufferBinding: IndexBufferBinding;

  constructor(engine: Engine) {
    const stride = 16;
    const billboardGeometryBuffer = new Buffer(
      engine,
      BufferBindFlag.VertexBuffer,
      stride * 4,
      BufferUsage.Static,
      false
    );
    const billboardVertices = new Float32Array([-0.5, -0.5, 0, 1, 0.5, -0.5, 1, 1, 0.5, 0.5, 1, 0, -0.5, 0.5, 0, 0]);
    billboardGeometryBuffer.setData(billboardVertices);
    this.billboardVertexBufferBinding = new VertexBufferBinding(billboardGeometryBuffer, stride);

    const indexBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      this.billboardIndexCount,
      BufferUsage.Static,
      false
    );
    const billboardIndices = new Uint8Array([0, 2, 1, 0, 3, 2]);
    indexBuffer.setData(billboardIndices);
    this.billboardIndexBufferBinding = new IndexBufferBinding(indexBuffer, IndexFormat.UInt8);
  }
}
