import { Buffer } from "../graphic/Buffer";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { ShaderData } from "../shader/ShaderData";
import { ShaderPool } from "../shader/ShaderPool";
import { ShaderProperty } from "../shader/ShaderProperty";
import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

/**
 * @internal
 * Particle-specific Transform Feedback simulation.
 */
export class ParticleTransformFeedbackSimulator {
  private static readonly _deltaTimeProperty = ShaderProperty.getByName("renderer_DeltaTime");

  private _simulator: TransformFeedbackSimulator;
  private _particleInitData = new Float32Array(6);
  private _instanceBinding: VertexBufferBinding;
  private _oldReadBuffer: Buffer;
  private _oldWriteBuffer: Buffer;

  /**
   * The current read buffer binding for the render pass.
   */
  get readBinding(): VertexBufferBinding {
    return this._simulator.readBinding;
  }

  constructor(engine: Engine) {
    this._simulator = new TransformFeedbackSimulator(
      engine,
      ParticleBufferUtils.feedbackVertexStride,
      ShaderPool.particleFeedbackShader
    );
  }

  /**
   * Resize feedback buffers.
   * Saves pre-resize buffers internally for subsequent `copyOldBufferData` / `destroyOldBuffers` calls.
   * @param particleCount - Number of particles to allocate
   * @param instanceBinding - New instance vertex buffer binding
   */
  resize(particleCount: number, instanceBinding: VertexBufferBinding): void {
    this._oldReadBuffer = this._simulator.readBinding?.buffer;
    this._oldWriteBuffer = this._simulator.writeBinding?.buffer;
    this._simulator.resize(particleCount);
    this._instanceBinding = instanceBinding;
  }

  /**
   * Write initial position and velocity for a newly emitted particle.
   */
  writeParticleData(index: number, position: Vector3, vx: number, vy: number, vz: number): void {
    const data = this._particleInitData;
    data[0] = position.x;
    data[1] = position.y;
    data[2] = position.z;
    data[3] = vx;
    data[4] = vy;
    data[5] = vz;
    const simulator = this._simulator;
    const byteOffset = index * ParticleBufferUtils.feedbackVertexStride;
    simulator.readBinding.buffer.setData(data, byteOffset);
    simulator.writeBinding.buffer.setData(data, byteOffset);
  }

  /**
   * Copy data from pre-resize buffers to current buffers.
   * Must be called after `resize` which saves the old buffers.
   */
  copyOldBufferData(srcByteOffset: number, dstByteOffset: number, byteLength: number): void {
    this._simulator.readBinding.buffer.copyFromBuffer(this._oldReadBuffer, srcByteOffset, dstByteOffset, byteLength);
    this._simulator.writeBinding.buffer.copyFromBuffer(this._oldWriteBuffer, srcByteOffset, dstByteOffset, byteLength);
  }

  /**
   * Destroy pre-resize buffers saved during `resize`.
   */
  destroyOldBuffers(): void {
    this._oldReadBuffer.destroy();
    this._oldWriteBuffer.destroy();
    this._oldReadBuffer = null;
    this._oldWriteBuffer = null;
  }

  /**
   * Run one simulation step.
   * @param shaderData - Shader data with current macros and uniforms
   * @param particleCount - Total particle slot count
   * @param firstActive - First active particle index in ring buffer
   * @param firstFree - First free particle index in ring buffer
   * @param deltaTime - Frame delta time
   */
  update(
    shaderData: ShaderData,
    particleCount: number,
    firstActive: number,
    firstFree: number,
    deltaTime: number
  ): void {
    if (firstActive === firstFree) return;

    shaderData.setFloat(ParticleTransformFeedbackSimulator._deltaTimeProperty, deltaTime);

    if (
      !this._simulator.beginUpdate(
        shaderData,
        ParticleBufferUtils.feedbackVertexElements,
        this._instanceBinding,
        ParticleBufferUtils.feedbackInstanceElements
      )
    )
      return;

    if (firstActive < firstFree) {
      this._simulator.draw(MeshTopology.Points, firstActive, firstFree - firstActive);
    } else {
      this._simulator.draw(MeshTopology.Points, firstActive, particleCount - firstActive);
      if (firstFree > 0) {
        this._simulator.draw(MeshTopology.Points, 0, firstFree);
      }
    }

    this._simulator.endUpdate();
  }

  destroy(): void {
    this._simulator?.destroy();
  }
}
