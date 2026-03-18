import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { ShaderData } from "../shader/ShaderData";
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
      `#include <particle_feedback_simulation>`,
      `void main() { discard; }`,
      ["v_FeedbackPosition", "v_FeedbackVelocity"]
    );
  }

  /**
   * Resize feedback buffers, old data is preserved via GPU buffer copy.
   * @param particleCount - Number of particles to allocate
   * @param instanceBinding - New instance vertex buffer binding
   */
  resize(particleCount: number, instanceBinding: VertexBufferBinding): void {
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
