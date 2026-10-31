import type { Engine } from "../Engine";
import { ContentRestorer } from "../asset/ContentRestorer";
import { Buffer } from "../graphic/Buffer";
import { IndexBufferBinding } from "../graphic/IndexBufferBinding";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { IndexFormat } from "../graphic/enums/IndexFormat";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { ParticleBillboardVertexAttribute } from "./enums/attributes/BillboardParticleVertexAttribute";
import { ParticleFeedbackVertexAttribute } from "./enums/attributes/ParticleFeedbackVertexAttribute";
import { ParticleInstanceVertexAttribute } from "./enums/attributes/ParticleInstanceVertexAttribute";

/**
 * @internal
 */
export class ParticleBufferUtils {
  // Particle Feedback Pass input from the simulated particle system's CPU instance buffer
  static readonly feedbackInstanceInputVertexElements = [
    new VertexElement(ParticleInstanceVertexAttribute.ShapePositionStartLifeTime, 0, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.DirectionTime, 16, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.StartSizeSpeed, 48, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.WorldPositionGravity, 80, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldRotation, 96, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.VelocityRandomTSA, 112, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.ForceRandomColor, 128, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.UVTilingFrameRandom, 144, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.InheritVelocity, 160, VertexElementFormat.Vector4, 0),
    new VertexElement(ParticleInstanceVertexAttribute.LimitVelocityRandom, 176, VertexElementFormat.Float, 0)
  ];

  // Particle Feedback Pass input from the simulated particle system's previous feedback state buffer
  static readonly feedbackStateInputVertexElements = [
    new VertexElement(ParticleFeedbackVertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
    new VertexElement(ParticleFeedbackVertexAttribute.Velocity, 12, VertexElementFormat.Vector3, 0)
  ];

  // Particle Feedback Pass state input for a parent system that must output trajectory data for child systems
  static readonly feedbackStateWithTrajectoryInputVertexElements = [
    ...ParticleBufferUtils.feedbackStateInputVertexElements,
    new VertexElement(ParticleFeedbackVertexAttribute.WorldPosition, 24, VertexElementFormat.Vector3, 0)
  ];

  // SubEmitterTrajectoryGather Pass input from the parent system, expanded into child-aligned spawn state
  static readonly subEmitterTrajectoryGatherInputVertexElements = [
    new VertexElement(ParticleFeedbackVertexAttribute.WorldPosition, 24, VertexElementFormat.Vector3, 0, 1),
    new VertexElement(ParticleFeedbackVertexAttribute.TrajectoryVelocity, 36, VertexElementFormat.Vector3, 0, 1)
  ];

  // Particle Feedback Pass inputs for a child system: its instance buffer plus parent-aligned spawn state
  static readonly feedbackInstanceWithSpawnStateInputVertexElements = [
    ...ParticleBufferUtils.feedbackInstanceInputVertexElements,
    new VertexElement(ParticleInstanceVertexAttribute.ParentSampleWorldPosition, 0, VertexElementFormat.Vector3, 1),
    new VertexElement(ParticleInstanceVertexAttribute.ParentTrajectoryVelocity, 12, VertexElementFormat.Vector3, 1)
  ];

  // Forward Pass per-instance layout template for the rendered particle system's feedback state buffer
  static readonly forwardFeedbackStateInstanceInputVertexElements = [
    new VertexElement(ParticleFeedbackVertexAttribute.Position, 0, VertexElementFormat.Vector3, 0, 1),
    new VertexElement(ParticleFeedbackVertexAttribute.Velocity, 12, VertexElementFormat.Vector3, 0, 1)
  ];

  // Forward Pass per-instance layout template for a child system's parent-aligned spawn-state buffer
  static readonly forwardSubEmitterSpawnStateInstanceInputVertexElements = [
    new VertexElement(ParticleInstanceVertexAttribute.ParentSampleWorldPosition, 0, VertexElementFormat.Vector3, 0, 1),
    new VertexElement(ParticleInstanceVertexAttribute.ParentTrajectoryVelocity, 12, VertexElementFormat.Vector3, 0, 1)
  ];

  // Forward Pass per-vertex input from the rendered particle system's billboard geometry buffer
  static readonly forwardBillboardInputVertexElement = new VertexElement(
    ParticleBillboardVertexAttribute.cornerTextureCoordinate,
    0,
    VertexElementFormat.Vector4,
    0
  );

  // The first 44 floats are packed into 11 attributes. With two parent-trajectory attributes
  // and three mesh attributes (position, UV, color), the forward pass fits WebGL2's 16 slots.
  // Limit-velocity randomness is feedback-only and follows the forward data.
  static readonly forwardParticleInstanceInputVertexElements = [
    new VertexElement(ParticleInstanceVertexAttribute.ShapePositionStartLifeTime, 0, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.DirectionTime, 16, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartColor, 32, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartSizeSpeed, 48, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.StartRotationRandom, 64, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.WorldPositionGravity, 80, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.SimulationWorldRotation, 96, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.VelocityRandomTSA, 112, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.ForceRandomColor, 128, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.UVTilingFrameRandom, 144, VertexElementFormat.Vector4, 1, 1),
    new VertexElement(ParticleInstanceVertexAttribute.InheritVelocity, 160, VertexElementFormat.Vector4, 1, 1)
  ];

  // Buffer strides
  static readonly feedbackStateVertexStride = 24;
  static readonly feedbackStateWithTrajectoryVertexStride = 48;
  static readonly subEmitterSpawnStateVertexStride = 24;
  static readonly instanceVertexStride = 180;
  static readonly instanceVertexFloatStride = ParticleBufferUtils.instanceVertexStride / 4;

  // Particle instance data offsets
  static readonly startLifeTimeOffset = 3;
  static readonly timeOffset = 7;
  static readonly simulationUVOffset = 36;
  static readonly inheritVelocityOffset = 40;
  static readonly inheritVelocityRandomOffset = 43;
  static readonly limitVelocityRandomOffset = 44;

  // Billboard geometry
  static readonly billboardIndexCount = 6;

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
    billboardGeometryBuffer.isGCIgnored = true;
    this.billboardVertexBufferBinding = new VertexBufferBinding(billboardGeometryBuffer, stride);

    const indexBuffer = new Buffer(
      engine,
      BufferBindFlag.IndexBuffer,
      ParticleBufferUtils.billboardIndexCount,
      BufferUsage.Static,
      false
    );
    indexBuffer.isGCIgnored = true;
    this.billboardIndexBufferBinding = new IndexBufferBinding(indexBuffer, IndexFormat.UInt8);

    const billboardGeometryData = new Float32Array([
      -0.5, -0.5, 0, 1, 0.5, -0.5, 1, 1, 0.5, 0.5, 1, 0, -0.5, 0.5, 0, 0
    ]);
    const indexData = new Uint8Array([0, 2, 3, 0, 1, 2]);

    billboardGeometryBuffer.setData(billboardGeometryData);
    indexBuffer.setData(indexData);

    // Register content restorer
    engine.resourceManager.addContentRestorer(
      new (class extends ContentRestorer<Buffer> {
        constructor() {
          super(billboardGeometryBuffer);
        }
        restoreContent() {
          billboardGeometryBuffer.setData(billboardGeometryData);
        }
      })()
    );

    engine.resourceManager.addContentRestorer(
      new (class extends ContentRestorer<Buffer> {
        constructor() {
          super(indexBuffer);
        }
        restoreContent() {
          indexBuffer.setData(indexData);
        }
      })()
    );
  }
}
