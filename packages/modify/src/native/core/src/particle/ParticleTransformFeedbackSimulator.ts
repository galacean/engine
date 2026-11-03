import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import type { ElementRangeMapping } from "../graphic/ElementRangeMapping";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

const FEEDBACK_SHADER_NAME = "Effect/ParticleFeedback";

/**
 * @internal
 * Particle-specific Transform Feedback simulation.
 */
export class ParticleTransformFeedbackSimulator {
  private static readonly _deltaTimeProperty = ShaderProperty.getByName("renderer_DeltaTime");

  /** @internal */
  _instanceBinding: VertexBufferBinding;

  private _simulator: TransformFeedbackSimulator;
  private _particleInitData = new Float32Array(6);

  /**
   * The current read buffer binding for the render pass.
   */
  get readBinding(): VertexBufferBinding {
    return this._simulator.readBinding;
  }

  constructor(engine: Engine) {
    // Look up the feedback pass dynamically rather than caching it on a
    // built-in pool — `engine-core` no longer ships the built-in shader set
    // itself; the umbrella `@galacean/engine` package registers
    // `Effect/ParticleFeedback` (and configures its transform-feedback
    // varyings) at module load time.
    const feedbackShader = Shader.find(FEEDBACK_SHADER_NAME);
    if (!feedbackShader) {
      throw new Error(
        `${FEEDBACK_SHADER_NAME} shader is not registered. Import "@galacean/engine" before constructing the engine, ` +
          `or register the shader manually if you build a custom engine flavor.`
      );
    }
    this._simulator = new TransformFeedbackSimulator(
      engine,
      ParticleBufferUtils.feedbackVertexStride,
      0,
      feedbackShader.subShaders[0].passes[0],
      ["v_FeedbackPosition", "v_FeedbackVelocity"]
    );
  }

  /** Resize preserving the caller's ring mappings on the GPU. */
  resize(
    particleCount: number,
    instanceBinding: VertexBufferBinding,
    mappings: ReadonlyArray<ElementRangeMapping> = []
  ): void {
    this._simulator.resize(particleCount, mappings);
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
        [this._instanceBinding],
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
