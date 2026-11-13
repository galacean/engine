import type { Engine } from "../Engine";
import type { ElementRangeMapping } from "../graphic/ElementRangeMapping";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import type { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import type { VertexElement } from "../graphic/VertexElement";
import { Shader } from "../shader/Shader";
import type { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

const FEEDBACK_SHADER_NAME = "Effect/ParticleFeedback";
const FEEDBACK_PASS_NAME = "TransformFeedback";

/**
 * @internal
 * Particle-specific Transform Feedback simulation.
 */
export class ParticleTransformFeedbackSimulator {
  private static readonly _deltaTimeProperty = ShaderProperty.getByName("renderer_DeltaTime");
  private static readonly _resetTrajectoryProperty = ShaderProperty.getByName("renderer_ResetTrajectory");
  private static readonly _firstNewParticleProperty = ShaderProperty.getByName("renderer_FirstNewParticle");
  private static readonly _firstFreeParticleProperty = ShaderProperty.getByName("renderer_FirstFreeParticle");
  private static readonly _stateVaryings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
  private static readonly _trajectoryStateVaryings = [
    ...ParticleTransformFeedbackSimulator._stateVaryings,
    "v_FeedbackWorldPosition",
    "v_FeedbackTrajectoryVelocity"
  ];
  private static readonly _inputBindings: VertexBufferBinding[] = [];

  /** Whether parent trajectory data is captured for sub-emitters. */
  readonly trajectoryEnabled: boolean;

  private readonly _simulator: TransformFeedbackSimulator;
  private readonly _stateInputVertexElements: VertexElement[];

  /**
   * The current read buffer binding for the render pass.
   */
  get readBinding(): VertexBufferBinding {
    return this._simulator.readBinding;
  }

  /**
   * @param engine - Engine instance
   * @param trajectoryEnabled - Whether parent trajectory data is captured for sub-emitters
   * @param particleCount - Number of particle slots to allocate
   */
  constructor(engine: Engine, trajectoryEnabled: boolean, particleCount: number) {
    this.trajectoryEnabled = trajectoryEnabled;
    // The engine flavor owns shader registration; engine-core resolves the registered pass when needed
    const feedbackShader = Shader.find(FEEDBACK_SHADER_NAME);
    if (!feedbackShader) {
      throw new Error(
        `${FEEDBACK_SHADER_NAME} shader is not registered. Import "@galacean/engine" before constructing the engine, ` +
          `or register the shader manually if you build a custom engine flavor.`
      );
    }
    const feedbackPass = feedbackShader.subShaders[0]?.passes.find((pass) => pass.name === FEEDBACK_PASS_NAME);
    if (!feedbackPass) {
      throw new Error(`${FEEDBACK_PASS_NAME} pass is not registered in ${FEEDBACK_SHADER_NAME}.`);
    }

    let vertexStride: number;
    let feedbackVaryings: string[];
    if (trajectoryEnabled) {
      vertexStride = ParticleBufferUtils.feedbackStateWithTrajectoryVertexStride;
      this._stateInputVertexElements = ParticleBufferUtils.feedbackStateWithTrajectoryInputVertexElements;
      feedbackVaryings = ParticleTransformFeedbackSimulator._trajectoryStateVaryings;
    } else {
      vertexStride = ParticleBufferUtils.feedbackStateVertexStride;
      this._stateInputVertexElements = ParticleBufferUtils.feedbackStateInputVertexElements;
      feedbackVaryings = ParticleTransformFeedbackSimulator._stateVaryings;
    }
    this._simulator = new TransformFeedbackSimulator(
      engine,
      vertexStride,
      particleCount,
      feedbackPass,
      feedbackVaryings
    );
  }

  /**
   * Resize feedback buffers.
   * @param particleCount - Number of particles to allocate
   * @param mappings - Ranges to preserve from the previous buffers
   */
  resize(particleCount: number, mappings: ReadonlyArray<ElementRangeMapping>): void {
    this._simulator.resize(particleCount, mappings);
  }

  /**
   * Run one simulation step.
   * @param shaderData - Shader data with current macros and uniforms
   * @param particleCount - Total particle slot count
   * @param firstElement - First particle index to update in the ring buffer
   * @param firstFree - First free particle index in ring buffer
   * @param firstNew - First particle initialized during this update
   * @param deltaTime - Frame delta time
   * @param resetTrajectory - Whether to discard the trajectory baseline from before a culling pause, or undefined when
   * trajectory feedback is disabled
   * @param particleInputBinding - Particle input vertex buffer binding
   * @param subEmitterSpawnStateBinding - Resolved sub-emitter spawn state, when present
   */
  update(
    shaderData: ShaderData,
    particleCount: number,
    firstElement: number,
    firstFree: number,
    firstNew: number,
    deltaTime: number,
    resetTrajectory: boolean | undefined,
    particleInputBinding: VertexBufferBinding,
    subEmitterSpawnStateBinding?: VertexBufferBinding
  ): void {
    shaderData.setFloat(ParticleTransformFeedbackSimulator._deltaTimeProperty, deltaTime);
    if (resetTrajectory !== undefined) {
      shaderData.setInt(ParticleTransformFeedbackSimulator._resetTrajectoryProperty, resetTrajectory ? 1 : 0);
    }
    shaderData.setInt(ParticleTransformFeedbackSimulator._firstNewParticleProperty, firstNew);
    shaderData.setInt(ParticleTransformFeedbackSimulator._firstFreeParticleProperty, firstFree);
    const inputBindings = ParticleTransformFeedbackSimulator._inputBindings;
    inputBindings[0] = particleInputBinding;
    if (subEmitterSpawnStateBinding) {
      inputBindings[1] = subEmitterSpawnStateBinding;
      inputBindings.length = 2;
    } else {
      inputBindings.length = 1;
    }
    const didBeginUpdate = this._simulator.beginUpdate(
      shaderData,
      this._stateInputVertexElements,
      inputBindings,
      subEmitterSpawnStateBinding
        ? ParticleBufferUtils.feedbackInstanceWithSpawnStateInputVertexElements
        : ParticleBufferUtils.feedbackInstanceInputVertexElements
    );
    inputBindings.length = 0;
    if (!didBeginUpdate) {
      return;
    }

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
    this._simulator.destroy();
  }
}
