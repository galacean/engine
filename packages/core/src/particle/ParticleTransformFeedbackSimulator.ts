import type { Engine } from "../Engine";
import { EngineEventType } from "../EngineEventType";
import { Buffer } from "../graphic/Buffer";
import type { ElementRangeMapping } from "../graphic/ElementRangeMapping";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../graphic/TransformFeedbackSimulator";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import type { VertexElement } from "../graphic/VertexElement";
import { ComputeShader } from "../shader/ComputeShader";
import type { Shader } from "../shader/Shader";
import type { ShaderData } from "../shader/ShaderData";
import { ShaderProperty } from "../shader/ShaderProperty";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

const FEEDBACK_PASS_NAME = "TransformFeedback";

const PARTICLE_SIMULATE_COMPUTE_SOURCE = `ComputeShader "Effect/ParticleSimulationCompute" {
  WorkgroupSize = (64, 1, 1);
  ComputeKernel = csSimulate;

  int renderer_DispatchStart;
  int renderer_DispatchCount;

  #include "ShaderLibrary/Particle/ParticleFeedbackCore.glsl"

  readonly storage PrevStateBuf {
    float prevState[];
  };

  storage NextStateBuf {
    float nextState[];
  };

  readonly storage InstanceBuf {
    float instData[];
  };

  #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
    readonly storage SpawnStateBuf {
      float spawnData[];
    };
  #endif

  vec3 readVec3Prev(uint offset) {
    return vec3(prevState[offset], prevState[offset + 1u], prevState[offset + 2u]);
  }

  vec4 readVec4Inst(uint offset) {
    return vec4(instData[offset], instData[offset + 1u], instData[offset + 2u], instData[offset + 3u]);
  }

  void writeVec3Next(uint offset, vec3 v) {
    nextState[offset] = v.x;
    nextState[offset + 1u] = v.y;
    nextState[offset + 2u] = v.z;
  }

  void csSimulate() {
    uint localIdx = gl_GlobalInvocationID.x;
    if (int(localIdx) >= renderer_DispatchCount) {
      return;
    }
    uint idx = uint(renderer_DispatchStart) + localIdx;

    #ifdef RENDERER_TRAJECTORY_FEEDBACK
      uint stateBase = idx * 12u;
    #else
      uint stateBase = idx * 6u;
    #endif
    uint instBase = idx * 45u;

    Attributes attr;
    attr.a_FeedbackPosition = readVec3Prev(stateBase);
    attr.a_FeedbackVelocity = readVec3Prev(stateBase + 3u);
    #ifdef RENDERER_TRAJECTORY_FEEDBACK
      attr.a_FeedbackWorldPosition = readVec3Prev(stateBase + 6u);
    #endif
    attr.a_ShapePositionStartLifeTime = readVec4Inst(instBase);
    attr.a_DirectionTime = readVec4Inst(instBase + 4u);
    attr.a_StartSizeSpeed = readVec4Inst(instBase + 12u);
    attr.a_WorldPositionGravity = readVec4Inst(instBase + 20u);
    attr.a_SimulationWorldRotation = readVec4Inst(instBase + 24u);
    #if defined(RENDERER_VOL_IS_RANDOM_TWO) || defined(RENDERER_VOL_ORBITAL_IS_RANDOM_TWO) || defined(RENDERER_VOL_RADIAL_IS_RANDOM_TWO)
      attr.a_VelocityRandomTSA = readVec4Inst(instBase + 28u);
    #endif
    #if defined(RENDERER_FOL_CONSTANT_MODE) || defined(RENDERER_FOL_CURVE_MODE)
      attr.a_ForceRandomColor = readVec4Inst(instBase + 32u);
    #endif
    #ifdef RENDERER_NOISE_MODULE_ENABLED
      attr.a_UVTilingFrameRandom = readVec4Inst(instBase + 36u);
    #endif
    #if defined(RENDERER_INHERIT_VELOCITY_INITIAL_CURVE) || defined(RENDERER_INHERIT_VELOCITY_RANDOM) || defined(RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES)
      attr.a_InheritVelocity = readVec4Inst(instBase + 40u);
    #endif
    #ifdef RENDERER_LVL_MODULE_ENABLED
      attr.a_LimitVelocityRandom = instData[instBase + 44u];
    #endif
    #ifdef RENDERER_HAS_SUB_EMITTER_SPAWNED_PARTICLES
      uint spawnBase = idx * 6u;
      attr.a_ParentSampleWorldPosition = vec3(spawnData[spawnBase], spawnData[spawnBase + 1u], spawnData[spawnBase + 2u]);
      attr.a_ParentTrajectoryVelocity = vec3(spawnData[spawnBase + 3u], spawnData[spawnBase + 4u], spawnData[spawnBase + 5u]);
    #endif

    ParticleFeedbackOutput res = runParticleFeedback(attr, int(idx));
    writeVec3Next(stateBase, res.position);
    writeVec3Next(stateBase + 3u, res.velocity);
    #ifdef RENDERER_TRAJECTORY_FEEDBACK
      writeVec3Next(stateBase + 6u, res.worldPosition);
      writeVec3Next(stateBase + 9u, res.trajectoryVelocity);
    #endif
  }
}`;

const particleComputeShaderCache = new WeakMap<Engine, ComputeShader>();

function getOrCreateParticleComputeShader(engine: Engine): ComputeShader {
  let cs = particleComputeShaderCache.get(engine);
  if (!cs || cs.destroyed) {
    cs = ComputeShader.create(PARTICLE_SIMULATE_COMPUTE_SOURCE, engine);
    particleComputeShaderCache.set(engine, cs);
    engine.once(EngineEventType.Shutdown, () => {
      if (particleComputeShaderCache.get(engine) === cs) {
        particleComputeShaderCache.delete(engine);
      }
      cs!.destroy();
    });
  }
  return cs;
}

/**
 * @internal
 * Particle GPU state simulation: dispatches native `ComputeShader` on WebGPU or Transform Feedback on WebGL2.
 */
export class ParticleTransformFeedbackSimulator {
  private static readonly _deltaTimeProperty = ShaderProperty.getByName("renderer_DeltaTime");
  private static readonly _resetTrajectoryProperty = ShaderProperty.getByName("renderer_ResetTrajectory");
  private static readonly _firstNewParticleProperty = ShaderProperty.getByName("renderer_FirstNewParticle");
  private static readonly _firstFreeParticleProperty = ShaderProperty.getByName("renderer_FirstFreeParticle");
  private static readonly _dispatchStartProperty = ShaderProperty.getByName("renderer_DispatchStart");
  private static readonly _dispatchCountProperty = ShaderProperty.getByName("renderer_DispatchCount");
  private static readonly _stateVaryings = ["v_FeedbackPosition", "v_FeedbackVelocity"];
  private static readonly _trajectoryStateVaryings = [
    ...ParticleTransformFeedbackSimulator._stateVaryings,
    "v_FeedbackWorldPosition",
    "v_FeedbackTrajectoryVelocity"
  ];
  private static readonly _inputBindings: VertexBufferBinding[] = [];

  /** Whether parent trajectory data is captured for sub-emitters. */
  readonly trajectoryEnabled: boolean;

  private readonly _engine: Engine;
  private readonly _useCompute: boolean;
  private readonly _vertexStride: number;

  // WebGL2 Transform Feedback path
  private readonly _simulator?: TransformFeedbackSimulator;
  private readonly _stateInputVertexElements: VertexElement[];

  // WebGPU ComputeShader path
  private readonly _computeShader?: ComputeShader;
  private _computeBindingA?: VertexBufferBinding;
  private _computeBindingB?: VertexBufferBinding;
  private _computeReadIsA = true;

  /**
   * The current read buffer binding for the render pass.
   */
  get readBinding(): VertexBufferBinding {
    if (this._useCompute) {
      return this._computeReadIsA ? this._computeBindingA! : this._computeBindingB!;
    }
    return this._simulator!.readBinding;
  }

  constructor(engine: Engine, shader: Shader, trajectoryEnabled: boolean, particleCount: number) {
    this._engine = engine;
    this.trajectoryEnabled = trajectoryEnabled;
    this._useCompute = engine._hardwareRenderer.supportsCompute;

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
    this._vertexStride = vertexStride;

    if (this._useCompute) {
      this._computeShader = getOrCreateParticleComputeShader(engine);
      this._computeBindingA = this._createComputeBinding(particleCount);
      this._computeBindingB = this._createComputeBinding(particleCount);
    } else {
      const feedbackPass =
        !shader.destroyed && shader.subShaders[0]?.passes.find((pass) => pass.name === FEEDBACK_PASS_NAME);
      if (!feedbackPass) {
        throw new Error(`${FEEDBACK_PASS_NAME} pass is not available in ${shader.name}.`);
      }
      this._simulator = new TransformFeedbackSimulator(
        engine,
        vertexStride,
        particleCount,
        feedbackPass,
        feedbackVaryings
      );
    }
  }

  /**
   * Resize feedback buffers.
   * @param particleCount - Number of particles to allocate
   * @param mappings - Ranges to preserve from the previous buffers
   */
  resize(particleCount: number, mappings: ReadonlyArray<ElementRangeMapping>): void {
    if (this._useCompute) {
      const oldA = this._computeBindingA!;
      const oldB = this._computeBindingB!;
      const oldRead = this.readBinding.buffer;
      this._computeBindingA = this._createComputeBinding(particleCount);
      this._computeBindingB = this._createComputeBinding(particleCount);
      const stride = this._vertexStride;
      const newRead = this.readBinding.buffer;
      for (let i = 0, n = mappings.length; i < n; i++) {
        const mapping = mappings[i];
        newRead.copyFromBuffer(
          oldRead,
          mapping.sourceStart * stride,
          mapping.targetStart * stride,
          mapping.count * stride
        );
      }
      oldA.buffer.destroy();
      oldB.buffer.destroy();
      return;
    }
    this._simulator!.resize(particleCount, mappings);
  }

  /**
   * Run one simulation step.
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

    if (this._useCompute) {
      const readBinding = this._computeReadIsA ? this._computeBindingA! : this._computeBindingB!;
      const writeBinding = this._computeReadIsA ? this._computeBindingB! : this._computeBindingA!;
      shaderData.setBuffer("PrevStateBuf", readBinding.buffer);
      shaderData.setBuffer("NextStateBuf", writeBinding.buffer);
      shaderData.setBuffer("InstanceBuf", particleInputBinding.buffer);
      if (subEmitterSpawnStateBinding) {
        shaderData.setBuffer("SpawnStateBuf", subEmitterSpawnStateBinding.buffer);
      }

      const cs = this._computeShader!;
      const dispatchRange = (start: number, count: number) => {
        if (count <= 0) return;
        shaderData.setInt(ParticleTransformFeedbackSimulator._dispatchStartProperty, start);
        shaderData.setInt(ParticleTransformFeedbackSimulator._dispatchCountProperty, count);
        cs.dispatch(Math.ceil(count / 64), 1, 1, shaderData);
      };

      try {
        if (firstElement < firstFree) {
          dispatchRange(firstElement, firstFree - firstElement);
        } else {
          dispatchRange(firstElement, particleCount - firstElement);
          if (firstFree > 0) {
            dispatchRange(0, firstFree);
          }
        }
      } finally {
        shaderData.setBuffer("PrevStateBuf", null);
        shaderData.setBuffer("NextStateBuf", null);
        shaderData.setBuffer("InstanceBuf", null);
        if (subEmitterSpawnStateBinding) {
          shaderData.setBuffer("SpawnStateBuf", null);
        }
      }
      this._computeReadIsA = !this._computeReadIsA;
      return;
    }

    const inputBindings = ParticleTransformFeedbackSimulator._inputBindings;
    inputBindings[0] = particleInputBinding;
    if (subEmitterSpawnStateBinding) {
      inputBindings[1] = subEmitterSpawnStateBinding;
      inputBindings.length = 2;
    } else {
      inputBindings.length = 1;
    }
    const didBeginUpdate = this._simulator!.beginUpdate(
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
      this._simulator!.draw(MeshTopology.Points, firstElement, firstFree - firstElement);
    } else {
      this._simulator!.draw(MeshTopology.Points, firstElement, particleCount - firstElement);
      if (firstFree > 0) {
        this._simulator!.draw(MeshTopology.Points, 0, firstFree);
      }
    }
    this._simulator!.endUpdate();
  }

  destroy(): void {
    this._simulator?.destroy();
    this._computeBindingA?.buffer.destroy();
    this._computeBindingB?.buffer.destroy();
    this._computeBindingA = undefined;
    this._computeBindingB = undefined;
  }

  private _createComputeBinding(particleCount: number): VertexBufferBinding {
    const buffer = new Buffer(
      this._engine,
      BufferBindFlag.VertexBuffer,
      Math.max(1, particleCount) * this._vertexStride,
      BufferUsage.Dynamic,
      false
    );
    buffer.isGCIgnored = true;
    return new VertexBufferBinding(buffer, this._vertexStride);
  }
}
