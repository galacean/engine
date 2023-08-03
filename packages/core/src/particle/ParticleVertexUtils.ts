import { VertexElement } from "../graphic/VertexElement";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { ParticleBillboardVertexAttribute } from "./enums/attributes/BillboardParticleVertexAttribute";
import { MeshParticleVertexAttribute } from "./enums/attributes/MeshParticleVertexAttribute";
import { ParticleInstanceVertexAttribute } from "./enums/attributes/ParticleInstanceVertexAttribute";

/**
 * @internal
 */
export class ParticleBufferUtils {
  static readonly billboardVertexElements = [
    new VertexElement(ParticleBillboardVertexAttribute.cornerTextureCoordinate, 0, VertexElementFormat.Vector4, 0)
  ];
  static readonly meshVertexElements = [
    new VertexElement(MeshParticleVertexAttribute.MeshPosition, 0, VertexElementFormat.Vector3, 0),
    new VertexElement(MeshParticleVertexAttribute.MeshColor, 12, VertexElementFormat.Vector4, 0),
    new VertexElement(MeshParticleVertexAttribute.MeshTextureCoordinate, 28, VertexElementFormat.Vector2, 0)
  ];
  static readonly instanceVertexElement = [
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

  static readonly billboardVertexStride = 16;
  static readonly meshVertexStride = 36;
  static readonly instanceVertexStride = 152;

  static readonly billboardVertices = new Float32Array([
    -0.5, -0.5, 0, 1, 0.5, -0.5, 1, 1, 0.5, 0.5, 1, 0, -0.5, 0.5, 0, 0
  ]);
  static readonly billboardIndices = new Uint16Array([0, 2, 1, 0, 3, 2]);
}
