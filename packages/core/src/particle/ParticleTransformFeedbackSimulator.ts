import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { Buffer } from "../graphic/Buffer";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
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
      `#include <particle_transform_feedback_update>`,
      `void main() { discard; }`,
      ["v_FeedbackPosition", "v_FeedbackVelocity"]
    );
  }

  /**
   * Resize feedback buffers.
   * @param particleCount - Number of particles to allocate
   */
  resize(particleCount: number): void {
    this._simulator.resize(particleCount);
  }

  /**
   * Write initial position and velocity for a newly emitted particle.
   */
  writeParticleData(index: number, px: number, py: number, pz: number, vx: number, vy: number, vz: number): void {
    const data = this._particleInitData;
    data[0] = px;
    data[1] = py;
    data[2] = pz;
    data[3] = vx;
    data[4] = vy;
    data[5] = vz;
    const byteOffset = index * ParticleBufferUtils.feedbackVertexStride;
    this._simulator.readBinding.buffer.setData(data, byteOffset);
    this._simulator.writeBinding.buffer.setData(data, byteOffset);
  }

  /**
   * Run one simulation step.
   * @param instanceBuffer - Particle instance data buffer
   * @param shaderData - Shader data with current macros and uniforms
   * @param particleCount - Total particle slot count
   * @param firstActive - First active particle index in ring buffer
   * @param firstFree - First free particle index in ring buffer
   * @param deltaTime - Frame delta time
   */
  update(
    instanceBuffer: Buffer,
    shaderData: ShaderData,
    particleCount: number,
    firstActive: number,
    firstFree: number,
    deltaTime: number
  ): void {
    if (firstActive === firstFree) return;

    shaderData.setFloat(ParticleTransformFeedbackSimulator._deltaTimeProperty, deltaTime);

    const instanceBinding = new VertexBufferBinding(instanceBuffer, ParticleBufferUtils.instanceVertexStride);
    if (
      !this._simulator.beginUpdate(
        shaderData,
        ParticleBufferUtils.feedbackVertexElements,
        instanceBinding,
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
