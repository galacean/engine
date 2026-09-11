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
import { Shader } from "../shader/Shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import type { ShaderPass } from "../shader/ShaderPass";
import type { ShaderProgram } from "../shader/ShaderProgram";
import { ParticleBufferUtils } from "./ParticleBufferUtils";

const FEEDBACK_SHADER_NAME = "Effect/ParticleFeedback";
const GATHER_PASS_NAME = "SubEmitterTrajectoryGather";

/**
 * Maintains parent trajectory state aligned with sub-emitted particle slots.
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
  private _pendingParentTrajectoryBinding: VertexBufferBinding | null = null;
  private _pendingParentStart = 0;
  private _pendingChildStart = 0;
  private _pendingChildrenPerParent = 0;
  private _pendingParentCount = 0;
  private _activeGatherProgram: ShaderProgram | null = null;

  get simulationBinding(): VertexBufferBinding {
    return this._simulationBinding;
  }

  get renderBinding(): VertexBufferBinding {
    return this._renderBinding ?? this._simulationBinding;
  }

  constructor(engine: Engine, particleCapacity: number, needsRenderBinding: boolean) {
    const gatherPass = Shader.find(FEEDBACK_SHADER_NAME)?.subShaders[0]?.passes.find(
      (pass) => pass.name === GATHER_PASS_NAME
    );
    if (!gatherPass) {
      throw new Error(`${GATHER_PASS_NAME} pass is not registered in ${FEEDBACK_SHADER_NAME}.`);
    }
    this._gatherPass = gatherPass;

    const primitive = (this._primitive = new Primitive(engine));
    const gatherInputLayout = ParticleBufferUtils.subEmitterTrajectoryGatherInputVertexElements;
    for (let i = 0, n = gatherInputLayout.length; i < n; i++) {
      const element = gatherInputLayout[i];
      primitive.addVertexElement(
        new VertexElement(element.attribute, element.offset, element.format, 0, element.instanceStepRate)
      );
    }
    // Source offsets vary per batch, so a cached VAO would retain stale attribute pointers
    primitive.enableVAO = false;
    primitive.isGCIgnored = true;
    this._transformFeedback = new TransformFeedback(engine);
    this._transformFeedback.isGCIgnored = true;
    this._simulationBinding = this._createSpawnStateBinding(particleCapacity);
    this._renderBinding = needsRenderBinding ? this._createSpawnStateBinding(particleCapacity) : null;
  }

  resize(particleCapacity: number, mappings: ReadonlyArray<ElementRangeMapping>): void {
    this.flush();
    const oldSimulationBuffer = this._simulationBinding.buffer;
    this._simulationBinding = this._createSpawnStateBinding(particleCapacity);
    if (this._renderBinding) {
      this._renderBinding.buffer.destroy();
      this._renderBinding = this._createSpawnStateBinding(particleCapacity);
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

  copyActiveRangeForRendering(firstActiveIndex: number, firstFreeIndex: number): void {
    const renderBinding = this._renderBinding;
    if (!renderBinding || firstActiveIndex === firstFreeIndex) {
      return;
    }

    const stride = ParticleBufferUtils.subEmitterSpawnStateVertexStride;
    const capacity = this._simulationBinding.buffer.byteLength / stride;
    const simulationBuffer = this._simulationBinding.buffer;
    const renderBuffer = renderBinding.buffer;
    if (firstActiveIndex < firstFreeIndex) {
      renderBuffer.copyFromBuffer(
        simulationBuffer,
        firstActiveIndex * stride,
        0,
        (firstFreeIndex - firstActiveIndex) * stride
      );
    } else {
      const tailByteLength = (capacity - firstActiveIndex) * stride;
      renderBuffer.copyFromBuffer(simulationBuffer, firstActiveIndex * stride, 0, tailByteLength);
      if (firstFreeIndex > 0) {
        renderBuffer.copyFromBuffer(simulationBuffer, 0, tailByteLength, firstFreeIndex * stride);
      }
    }
  }

  enqueueParentTrajectory(
    parentTrajectoryBinding: VertexBufferBinding,
    parentIndex: number,
    firstChildIndex: number,
    childCount: number
  ): void {
    const childrenBeforeWrap =
      this._simulationBinding.buffer.byteLength / ParticleBufferUtils.subEmitterSpawnStateVertexStride -
      firstChildIndex;
    if (childCount > childrenBeforeWrap) {
      this._drawPendingBatch();
      this._drawBatch(parentTrajectoryBinding, parentIndex, firstChildIndex, childrenBeforeWrap, 1);
      this._drawBatch(parentTrajectoryBinding, parentIndex, 0, childCount - childrenBeforeWrap, 1);
      return;
    }

    const parentCount = this._pendingParentCount;
    if (
      parentTrajectoryBinding === this._pendingParentTrajectoryBinding &&
      childCount === this._pendingChildrenPerParent &&
      parentIndex === this._pendingParentStart + parentCount &&
      firstChildIndex === this._pendingChildStart + parentCount * childCount
    ) {
      this._pendingParentCount = parentCount + 1;
      return;
    }

    this._drawPendingBatch();
    this._pendingParentTrajectoryBinding = parentTrajectoryBinding;
    this._pendingParentStart = parentIndex;
    this._pendingChildStart = firstChildIndex;
    this._pendingChildrenPerParent = childCount;
    this._pendingParentCount = 1;
  }

  flush(): void {
    this._drawPendingBatch();
    if (!this._activeGatherProgram) {
      return;
    }

    this._transformFeedback.end();
    this._transformFeedback.unbindBuffer(0);
    this._transformFeedback.unbind();
    this._primitive.engine._hardwareRenderer.disableRasterizerDiscard();
    this._activeGatherProgram = null;
    this._primitive.vertexBufferBindings.length = 0;
  }

  destroy(): void {
    this._simulationBinding.buffer.destroy();
    this._renderBinding?.buffer.destroy();
    this._primitive.destroy();
    this._transformFeedback.destroy();
  }

  private _createSpawnStateBinding(particleCapacity: number): VertexBufferBinding {
    const buffer = new Buffer(
      this._primitive.engine,
      BufferBindFlag.VertexBuffer,
      particleCapacity * ParticleBufferUtils.subEmitterSpawnStateVertexStride,
      BufferUsage.Dynamic,
      false
    );
    buffer.isGCIgnored = true;
    return new VertexBufferBinding(buffer, ParticleBufferUtils.subEmitterSpawnStateVertexStride);
  }

  private _drawPendingBatch(): void {
    const parentTrajectoryBinding = this._pendingParentTrajectoryBinding;
    if (!parentTrajectoryBinding) {
      return;
    }

    this._pendingParentTrajectoryBinding = null;
    this._drawBatch(
      parentTrajectoryBinding,
      this._pendingParentStart,
      this._pendingChildStart,
      this._pendingChildrenPerParent,
      this._pendingParentCount
    );
  }

  private _drawBatch(
    parentTrajectoryBinding: VertexBufferBinding,
    parentStart: number,
    childStart: number,
    childrenPerParent: number,
    parentCount: number
  ): void {
    const activeGatherProgram = this._activeGatherProgram;
    const program = activeGatherProgram ?? this._beginGatherScope();
    if (!program) {
      return;
    }

    const primitive = this._primitive;
    if (parentTrajectoryBinding !== primitive.vertexBufferBindings[0]) {
      primitive.setVertexBufferBinding(0, parentTrajectoryBinding);
    }
    const parentByteOffset = parentStart * parentTrajectoryBinding.stride;
    const boundElements = primitive.vertexElements;
    const inputLayout = ParticleBufferUtils.subEmitterTrajectoryGatherInputVertexElements;
    boundElements[0].offset = parentByteOffset + inputLayout[0].offset;
    boundElements[1].offset = parentByteOffset + inputLayout[1].offset;
    primitive.instanceCount = parentCount;

    const transformFeedback = this._transformFeedback;
    // Target slots are enqueued in ring order, so only index 0 starts a new output range
    if (!activeGatherProgram || childStart === 0) {
      if (activeGatherProgram) {
        transformFeedback.end();
      }
      const spawnStateBuffer = this._simulationBinding.buffer;
      const spawnStateOffset = childStart * ParticleBufferUtils.subEmitterSpawnStateVertexStride;
      // Bind through the buffer tail so contiguous batches can share one Transform Feedback scope
      transformFeedback.bindBufferRange(
        0,
        spawnStateBuffer,
        spawnStateOffset,
        spawnStateBuffer.byteLength - spawnStateOffset
      );
      transformFeedback.begin(MeshTopology.Points);
    }
    const subPrimitive = this._subPrimitive;
    subPrimitive.count = childrenPerParent;
    primitive.draw(program, subPrimitive);
  }

  private _beginGatherScope(): ShaderProgram | null {
    const engine = this._primitive.engine;
    const program = this._gatherPass._getShaderProgram(
      engine,
      ParticleSubEmitterSpawnState._gatherMacros,
      ParticleSubEmitterSpawnState._gatherVaryings
    );
    if (!program.isValid) {
      return null;
    }

    program.bind();
    engine._hardwareRenderer.enableRasterizerDiscard();
    this._transformFeedback.bind();
    this._activeGatherProgram = program;
    return program;
  }
}
