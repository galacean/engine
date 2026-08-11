import type { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { Primitive } from "../graphic/Primitive";
import { SubPrimitive } from "../graphic/SubPrimitive";
import { TransformFeedback } from "../graphic/TransformFeedback";
import { VertexBufferBinding } from "../graphic/VertexBufferBinding";
import { VertexElement } from "../graphic/VertexElement";
import type { ElementRangeMapping } from "../graphic/ElementRangeMapping";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import { MeshTopology } from "../graphic/enums/MeshTopology";
import { VertexElementFormat } from "../graphic/enums/VertexElementFormat";
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import type { ShaderPass } from "../shader/ShaderPass";
import type { ShaderProgram } from "../shader/ShaderProgram";
import { ParticleBufferUtils } from "./ParticleBufferUtils";
import { ParticleFeedbackVertexAttribute } from "./enums/attributes/ParticleFeedbackVertexAttribute";

const FEEDBACK_SHADER_NAME = "Effect/ParticleFeedback";
const GATHER_PASS_NAME = "SubEmitterTrajectoryGather";

/**
 * Stores parent trajectory state aligned with sub-emitted particle slots.
 * @internal
 */
export class ParticleSubEmitterSpawnState {
  private static readonly _gatherVaryings = ["v_ParentSampleWorldPosition", "v_ParentTrajectoryVelocity"];
  private static readonly _gatherMacros = new ShaderMacroCollection();

  private readonly _gatherPass: ShaderPass;
  private readonly _primitive: Primitive;
  private readonly _subPrimitive = new SubPrimitive(0, 0, MeshTopology.Points);
  private readonly _transformFeedback: TransformFeedback;
  private _simulationBinding: VertexBufferBinding;
  private _renderBinding: VertexBufferBinding | null = null;
  private _pendingSourceBinding: VertexBufferBinding;
  private _pendingSourceStart = 0;
  private _pendingTargetStart = 0;
  private _pendingChildrenPerParent = 0;
  private _pendingParentCount = 0;
  private _activeProgram: ShaderProgram | null = null;

  get simulationBinding(): VertexBufferBinding {
    return this._simulationBinding;
  }

  get renderBinding(): VertexBufferBinding {
    return this._renderBinding ?? this._simulationBinding;
  }

  constructor(engine: Engine, particleCount: number, compactForRendering: boolean) {
    const shader = Shader.find(FEEDBACK_SHADER_NAME);
    const gatherPass = shader?.subShaders[0]?.passes.find((pass) => pass.name === GATHER_PASS_NAME);
    if (!gatherPass) {
      throw new Error(`${GATHER_PASS_NAME} pass is not registered in ${FEEDBACK_SHADER_NAME}.`);
    }
    this._gatherPass = gatherPass;

    const primitive = (this._primitive = new Primitive(engine));
    primitive.addVertexElement(
      new VertexElement(
        ParticleFeedbackVertexAttribute.WorldPosition,
        ParticleBufferUtils.feedbackWorldPositionByteOffset,
        VertexElementFormat.Vector3,
        0,
        1
      )
    );
    primitive.addVertexElement(
      new VertexElement(
        ParticleFeedbackVertexAttribute.TrajectoryVelocity,
        ParticleBufferUtils.feedbackTrajectoryVelocityByteOffset,
        VertexElementFormat.Vector3,
        0,
        1
      )
    );
    primitive.enableVAO = false;
    primitive.isGCIgnored = true;
    this._transformFeedback = new TransformFeedback(engine);
    this._transformFeedback.isGCIgnored = true;
    this._simulationBinding = this._createBinding(particleCount);
    this._renderBinding = compactForRendering ? this._createBinding(particleCount) : null;
  }

  resize(particleCount: number, mappings: ReadonlyArray<ElementRangeMapping>): void {
    this.flush();
    const oldSimulationBuffer = this._simulationBinding.buffer;
    this._simulationBinding = this._createBinding(particleCount);
    if (this._renderBinding) {
      this._renderBinding.buffer.destroy();
      this._renderBinding = this._createBinding(particleCount);
    }
    const stride = ParticleBufferUtils.subEmitterSpawnStateVertexStride;
    const simulationBuffer = this._simulationBinding.buffer;
    for (let i = 0, n = mappings.length; i < n; i++) {
      const mapping = mappings[i];
      simulationBuffer.copyFromBuffer(
        oldSimulationBuffer,
        mapping.sourceStart * stride,
        mapping.targetStart * stride,
        mapping.count * stride
      );
    }
    oldSimulationBuffer.destroy();
  }

  compactForRendering(firstActive: number, firstFree: number): void {
    const renderBinding = this._renderBinding;
    if (!renderBinding || firstActive === firstFree) {
      return;
    }

    const stride = ParticleBufferUtils.subEmitterSpawnStateVertexStride;
    const capacity = this._simulationBinding.buffer.byteLength / stride;
    const source = this._simulationBinding.buffer;
    const target = renderBinding.buffer;
    if (firstActive < firstFree) {
      target.copyFromBuffer(source, firstActive * stride, 0, (firstFree - firstActive) * stride);
    } else {
      const tailByteLength = (capacity - firstActive) * stride;
      target.copyFromBuffer(source, firstActive * stride, 0, tailByteLength);
      if (firstFree > 0) {
        target.copyFromBuffer(source, 0, tailByteLength, firstFree * stride);
      }
    }
  }

  enqueueParentTrajectory(
    sourceBinding: VertexBufferBinding,
    sourceIndex: number,
    targetIndex: number,
    childCount: number
  ): void {
    const targetTailCount =
      this._simulationBinding.buffer.byteLength / ParticleBufferUtils.subEmitterSpawnStateVertexStride - targetIndex;
    if (childCount > targetTailCount) {
      this._drawPendingRun();
      this._drawRange(sourceBinding, sourceIndex, targetIndex, targetTailCount, 1);
      this._drawRange(sourceBinding, sourceIndex, 0, childCount - targetTailCount, 1);
      return;
    }

    const parentCount = this._pendingParentCount;
    const canAppend =
      parentCount > 0 &&
      sourceBinding === this._pendingSourceBinding &&
      childCount === this._pendingChildrenPerParent &&
      sourceIndex === this._pendingSourceStart + parentCount &&
      targetIndex === this._pendingTargetStart + parentCount * childCount;
    if (!canAppend) {
      this._drawPendingRun();
      this._pendingSourceBinding = sourceBinding;
      this._pendingSourceStart = sourceIndex;
      this._pendingTargetStart = targetIndex;
      this._pendingChildrenPerParent = childCount;
      this._pendingParentCount = 1;
    } else {
      this._pendingParentCount++;
    }
  }

  flush(): void {
    this._drawPendingRun();
    if (!this._activeProgram) {
      return;
    }

    const renderer = this._primitive.engine._hardwareRenderer;
    this._transformFeedback.unbindBuffer(0);
    this._transformFeedback.unbind();
    renderer.disableRasterizerDiscard();
    renderer.invalidateShaderProgramState();
    this._activeProgram = null;
    this._primitive.vertexBufferBindings.length = 0;
  }

  destroy(): void {
    this._simulationBinding.buffer.destroy();
    this._renderBinding?.buffer.destroy();
    this._primitive.destroy();
    this._transformFeedback.destroy();
  }

  private _createBinding(particleCount: number): VertexBufferBinding {
    const buffer = new Buffer(
      this._primitive.engine,
      BufferBindFlag.VertexBuffer,
      particleCount * ParticleBufferUtils.subEmitterSpawnStateVertexStride,
      BufferUsage.Dynamic,
      false
    );
    buffer.isGCIgnored = true;
    return new VertexBufferBinding(buffer, ParticleBufferUtils.subEmitterSpawnStateVertexStride);
  }

  private _drawPendingRun(): void {
    const parentCount = this._pendingParentCount;
    if (parentCount === 0) {
      return;
    }

    this._drawRange(
      this._pendingSourceBinding,
      this._pendingSourceStart,
      this._pendingTargetStart,
      this._pendingChildrenPerParent,
      parentCount
    );
    this._pendingParentCount = 0;
  }

  private _drawRange(
    sourceBinding: VertexBufferBinding,
    sourceStart: number,
    targetStart: number,
    childrenPerParent: number,
    parentCount: number
  ): void {
    const program = this._beginGather();
    if (!program) {
      return;
    }

    const primitive = this._primitive;
    if (sourceBinding !== primitive.vertexBufferBindings[0]) {
      primitive.setVertexBufferBinding(0, sourceBinding);
    }
    const sourceByteOffset = sourceStart * sourceBinding.stride;
    const elements = primitive.vertexElements;
    elements[0].offset = sourceByteOffset + ParticleBufferUtils.feedbackWorldPositionByteOffset;
    elements[1].offset = sourceByteOffset + ParticleBufferUtils.feedbackTrajectoryVelocityByteOffset;
    primitive.instanceCount = parentCount;

    const outputCount = childrenPerParent * parentCount;
    const outputStride = ParticleBufferUtils.subEmitterSpawnStateVertexStride;
    const transformFeedback = this._transformFeedback;
    transformFeedback.bindBufferRange(
      0,
      this._simulationBinding.buffer,
      targetStart * outputStride,
      outputCount * outputStride
    );
    transformFeedback.begin(MeshTopology.Points);
    const subPrimitive = this._subPrimitive;
    subPrimitive.count = childrenPerParent;
    primitive.draw(program, subPrimitive);
    transformFeedback.end();
  }

  private _beginGather(): ShaderProgram | null {
    const activeProgram = this._activeProgram;
    if (activeProgram) {
      return activeProgram;
    }

    const pass = this._gatherPass;
    const engine = this._primitive.engine;
    const program = pass._getShaderProgram(
      engine,
      ParticleSubEmitterSpawnState._gatherMacros,
      ParticleSubEmitterSpawnState._gatherVaryings
    );
    if (!program.isValid) {
      return null;
    }

    this._activeProgram = program;
    program.bind();
    const renderer = engine._hardwareRenderer;
    renderer.enableRasterizerDiscard();
    this._transformFeedback.bind();
    return program;
  }
}
