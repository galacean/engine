import { Vector3 } from "@galacean/engine-math";
import { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { Shader } from "../shader/Shader";
import { ShaderData } from "../shader/ShaderData";
import { ShaderPass } from "../shader/ShaderPass";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

const FEEDBACK_SHADER_NAME = "Effect/ParticleFeedback";

/**
 * @internal
 * Particle-specific Transform Feedback simulation.
 */
export class ParticleTransformFeedbackSimulator {
  private static readonly _deltaTimeProperty = ShaderProperty.getByName("renderer_DeltaTime");
  private static readonly _feedbackVaryings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
  private static readonly _trajectoryFeedbackVaryings = [
    "v_FeedbackPosition",
    "v_FeedbackVelocity",
    "v_FeedbackWorldPosition",
    "v_FeedbackTrajectoryVelocity"
  ];

  /** @internal */
  _instanceBinding: VertexBufferBinding;

  readonly vertexStride: number;
  readonly trajectoryEnabled: boolean;

  private _simulator: TransformFeedbackSimulator;
  private _feedbackPass: ShaderPass;
  private _feedbackVaryings: string[];
  private _feedbackVertexElements = ParticleBufferUtils.feedbackVertexElements;
  private _particleInitData: Float32Array;
  private _oldReadBuffer: Buffer;
  private _oldWriteBuffer: Buffer;

  /**
   * The current read buffer binding for the render pass.
   */
  get readBinding(): VertexBufferBinding {
    return this._simulator.readBinding;
  }

  constructor(engine: Engine, trajectoryEnabled: boolean = false) {
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
    this.trajectoryEnabled = trajectoryEnabled;
    this.vertexStride = trajectoryEnabled
      ? ParticleBufferUtils.trajectoryFeedbackVertexStride
      : ParticleBufferUtils.feedbackVertexStride;
    if (trajectoryEnabled) {
      this._feedbackVertexElements = ParticleBufferUtils.trajectoryFeedbackVertexElements;
    }
    this._particleInitData = new Float32Array(this.vertexStride / 4);
    this._feedbackPass = feedbackShader.subShaders[0].passes[0];
    this._feedbackVaryings = trajectoryEnabled
      ? ParticleTransformFeedbackSimulator._trajectoryFeedbackVaryings
      : ParticleTransformFeedbackSimulator._feedbackVaryings;
    this._simulator = new TransformFeedbackSimulator(engine, this.vertexStride, this._feedbackPass);
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
   * Write initial feedback state for a newly emitted particle.
   */
  writeParticleData(
    index: number,
    position: Vector3,
    worldPosition: Vector3,
    vx: number,
    vy: number,
    vz: number
  ): void {
    const data = this._particleInitData;
    data[0] = position.x;
    data[1] = position.y;
    data[2] = position.z;
    data[3] = vx;
    data[4] = vy;
    data[5] = vz;
    if (this.trajectoryEnabled) {
      data[6] = worldPosition.x;
      data[7] = worldPosition.y;
      data[8] = worldPosition.z;
      data[9] = data[10] = data[11] = 0;
    }
    const byteOffset = index * this.vertexStride;
    this._simulator.readBinding.buffer.setData(data, byteOffset);
    this._simulator.writeBinding.buffer.setData(data, byteOffset);
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

  /** @internal */
  syncWriteBuffer(): void {
    const readBuffer = this._simulator.readBinding.buffer;
    this._simulator.writeBinding.buffer.copyFromBuffer(readBuffer, 0, 0, readBuffer.byteLength);
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
    this._feedbackPass._feedbackVaryings = this._feedbackVaryings;
    if (
      !this._simulator.beginUpdate(
        shaderData,
        this._feedbackVertexElements,
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
