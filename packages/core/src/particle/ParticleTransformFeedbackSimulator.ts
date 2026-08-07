import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
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
  private static readonly _firstNewParticleProperty = ShaderProperty.getByName("renderer_FirstNewParticle");
  private static readonly _firstFreeParticleProperty = ShaderProperty.getByName("renderer_FirstFreeParticle");
  private static readonly _stateVaryings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
  private static readonly _trajectoryStateVaryings = [
    ...ParticleTransformFeedbackSimulator._stateVaryings,
    "v_FeedbackWorldPosition",
    "v_FeedbackTrajectoryVelocity"
  ];

  readonly vertexStride: number;

  private _simulator: TransformFeedbackSimulator;
  private _feedbackStateVertexElements: VertexElement[];
  private _oldReadBuffer: Buffer;
  private _oldWriteBuffer: Buffer;

  /**
   * The current read buffer binding for the render pass.
   */
  get readBinding(): VertexBufferBinding {
    return this._simulator.readBinding;
  }

  constructor(engine: Engine, trajectoryEnabled: boolean) {
    // The engine flavor owns shader registration; engine-core resolves the registered pass when needed
    const feedbackShader = Shader.find(FEEDBACK_SHADER_NAME);
    if (!feedbackShader) {
      throw new Error(
        `${FEEDBACK_SHADER_NAME} shader is not registered. Import "@galacean/engine" before constructing the engine, ` +
          `or register the shader manually if you build a custom engine flavor.`
      );
    }
    let feedbackVaryings: string[];
    if (trajectoryEnabled) {
      this.vertexStride = ParticleBufferUtils.feedbackTrajectoryStateVertexStride;
      this._feedbackStateVertexElements = ParticleBufferUtils.feedbackTrajectoryStateVertexElements;
      feedbackVaryings = ParticleTransformFeedbackSimulator._trajectoryStateVaryings;
    } else {
      this.vertexStride = ParticleBufferUtils.feedbackStateVertexStride;
      this._feedbackStateVertexElements = ParticleBufferUtils.feedbackStateVertexElements;
      feedbackVaryings = ParticleTransformFeedbackSimulator._stateVaryings;
    }
    this._simulator = new TransformFeedbackSimulator(
      engine,
      this.vertexStride,
      feedbackShader.subShaders[0].passes[0],
      feedbackVaryings
    );
  }

  /**
   * Resize feedback buffers.
   * Saves pre-resize buffers internally for subsequent `copyOldBufferData` / `destroyOldBuffers` calls.
   * @param particleCount - Number of particles to allocate
   */
  resize(particleCount: number): void {
    this._oldReadBuffer = this._simulator.readBinding?.buffer;
    this._oldWriteBuffer = this._simulator.writeBinding?.buffer;
    this._simulator.resize(particleCount);
  }

  /**
   * Copy data from pre-resize buffers to current buffers.
   * Must be called after `resize` which saves the old buffers.
   */
  copyOldBufferData(srcElement: number, dstElement: number, elementCount: number): void {
    const srcByteOffset = srcElement * this.vertexStride;
    const dstByteOffset = dstElement * this.vertexStride;
    const byteLength = elementCount * this.vertexStride;
    this._simulator.readBinding.buffer.copyFromBuffer(this._oldReadBuffer, srcByteOffset, dstByteOffset, byteLength);
    this._simulator.writeBinding.buffer.copyFromBuffer(this._oldWriteBuffer, srcByteOffset, dstByteOffset, byteLength);
  }

  /**
   * Destroy pre-resize buffers saved during `resize`.
   */
  destroyOldBuffers(): void {
    this._oldReadBuffer?.destroy();
    this._oldWriteBuffer?.destroy();
    this._oldReadBuffer = null;
    this._oldWriteBuffer = null;
  }

  /**
   * Run one simulation step.
   * @param shaderData - Shader data with current macros and uniforms
   * @param particleCount - Total particle slot count
   * @param firstElement - First particle index to update in the ring buffer
   * @param firstFree - First free particle index in ring buffer
   * @param firstNew - First particle initialized during this update
   * @param deltaTime - Frame delta time
   * @param particleInputBinding - Particle input vertex buffer binding
   */
  update(
    shaderData: ShaderData,
    particleCount: number,
    firstElement: number,
    firstFree: number,
    firstNew: number,
    deltaTime: number,
    particleInputBinding: VertexBufferBinding
  ): void {
    if (firstElement === firstFree) return;

    shaderData.setFloat(ParticleTransformFeedbackSimulator._deltaTimeProperty, deltaTime);
    shaderData.setInt(ParticleTransformFeedbackSimulator._firstNewParticleProperty, firstNew);
    shaderData.setInt(ParticleTransformFeedbackSimulator._firstFreeParticleProperty, firstFree);
    if (
      !this._simulator.beginUpdate(
        shaderData,
        this._feedbackStateVertexElements,
        particleInputBinding,
        ParticleBufferUtils.feedbackInitialDataVertexElements
      )
    )
      return;

    if (firstElement < firstFree) {
      this._simulator.draw(MeshTopology.Points, firstElement, firstFree - firstElement);
    } else {
      this._simulator.draw(MeshTopology.Points, firstElement, particleCount - firstElement);
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
