import { Engine } from "../../Engine";
import { Buffer } from "../../graphic/Buffer";
import { BufferBindFlag } from "../../graphic/enums/BufferBindFlag";
import { VertexElementFormat } from "../../graphic/enums/VertexElementFormat";
import { VertexElement } from "../../graphic/VertexElement";
import { VertexBufferBinding } from "../../graphic/VertexBufferBinding";
import { MeshTopology } from "../../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../../graphic/TransformFeedbackSimulator";
import { Shader } from "../../shader/Shader";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ShaderDataGroup } from "../../shader/enums/ShaderDataGroup";
import { TextureCube } from "../../texture";

const COEFFICIENT_COUNT = 9;
const COEFFICIENT_STRIDE = 16;
const PROJECTION_STRIDE = COEFFICIENT_COUNT * COEFFICIENT_STRIDE;
const PROJECT_SHADER_NAME = "Lighting/RealtimeIBLProjectSH";

/** Double-buffered GPU projection for one pre-scaled three-band SH set. @internal */
export class RealtimeSphericalHarmonicsGPU {
  private static readonly _sourceMapProperty = ShaderProperty.getByName("renderer_SHSourceMap");
  private static readonly _sourceMipLevelProperty = ShaderProperty.getByName("renderer_SHSourceMipLevel");

  private readonly _projectionBuffers = new Set<Buffer>();
  private readonly _projectionSimulator: TransformFeedbackSimulator;
  private readonly _blendSimulator: TransformFeedbackSimulator;
  private readonly _blendInputs: VertexBufferBinding;
  private readonly _blendShaderData = new ShaderData(ShaderDataGroup.Renderer);
  private readonly _blendElements = [
    new VertexElement("a_SourceSH", 0, VertexElementFormat.Vector4, 0),
    new VertexElement("a_TargetSH", 16, VertexElementFormat.Vector4, 0)
  ];
  private readonly _projectionShaderData = new ShaderData(ShaderDataGroup.Renderer);
  private readonly _packedCoefficients = new Float32Array(COEFFICIENT_COUNT * 4);

  /** Buffer currently consumed by realtime-lighting shaders. */
  get currentBuffer(): Buffer {
    return this._projectionSimulator.readBinding.buffer;
  }

  constructor(engine: Engine, initialPreScaledCoefficients: Float32Array) {
    const projectionShader = Shader.find(PROJECT_SHADER_NAME);
    if (!projectionShader) {
      throw new Error(
        "Realtime IBL SH shader is not registered. Run the shader precompile step before constructing the baker."
      );
    }

    const projectionVaryings = projectionShader.subShaders[0].passes[0]._feedbackVaryings;
    const blendVaryings = projectionShader.subShaders[0].passes[1]._feedbackVaryings;
    if (!projectionVaryings || !blendVaryings) {
      throw new Error("Realtime IBL SH transform-feedback varyings are not registered.");
    }
    this._projectionSimulator = new TransformFeedbackSimulator(
      engine,
      PROJECTION_STRIDE,
      1,
      projectionShader.subShaders[0].passes[0],
      projectionVaryings
    );
    this._blendSimulator = new TransformFeedbackSimulator(
      engine,
      16,
      COEFFICIENT_COUNT,
      projectionShader.subShaders[0].passes[1],
      blendVaryings
    );
    this._blendInputs = new VertexBufferBinding(new Buffer(engine, BufferBindFlag.VertexBuffer, 288), 32);
    this.resetCurrent(initialPreScaledCoefficients);
  }

  /** Whether the buffer belongs to the projection staging/current ping-pong pair. */
  ownsCurrentBuffer(buffer: Buffer | null): boolean {
    return buffer !== null && this._projectionBuffers.has(buffer);
  }

  /** Seeds the current projection; the next pass overwrites its entire destination. */
  resetCurrent(preScaledCoefficients: Float32Array): void {
    const packed = this._packedCoefficients;
    for (let coefficient = 0; coefficient < COEFFICIENT_COUNT; coefficient++) {
      const sourceOffset = coefficient * 3;
      const destinationOffset = coefficient * 4;
      packed[destinationOffset] = preScaledCoefficients[sourceOffset];
      packed[destinationOffset + 1] = preScaledCoefficients[sourceOffset + 1];
      packed[destinationOffset + 2] = preScaledCoefficients[sourceOffset + 2];
      packed[destinationOffset + 3] = 0;
    }
    this._projectionSimulator.readBinding.buffer.setData(packed);
    this._projectionBuffers.add(this._projectionSimulator.readBinding.buffer);
  }

  /** Compiles and submits the TF program before realtime frame profiling begins. */
  warmUp(sourceMap: TextureCube, sourceMipLevel: number, initialPreScaledCoefficients: Float32Array): void {
    this.project(sourceMap, sourceMipLevel);
    this.resetCurrent(initialPreScaledCoefficients);
    this.prepareBlend(this.currentBuffer, this.currentBuffer);
    this.blend(0);
  }

  /** Projects a uniformly sampled source mip into a GPU-resident target SH buffer. */
  project(sourceMap: TextureCube, sourceMipLevel: number): void {
    const shaderData = this._projectionShaderData;
    shaderData.setTexture(RealtimeSphericalHarmonicsGPU._sourceMapProperty, sourceMap);
    shaderData.setFloat(RealtimeSphericalHarmonicsGPU._sourceMipLevelProperty, sourceMipLevel);
    const simulator = this._projectionSimulator;
    if (!simulator.beginUpdate(shaderData, [], [], [])) {
      throw new Error("Realtime IBL GPU SH projection shader failed to compile.");
    }
    try {
      simulator.draw(MeshTopology.Points, 0, 1);
    } finally {
      simulator.endUpdate();
      this._projectionBuffers.add(simulator.readBinding.buffer);
    }
  }

  /** Freeze the endpoints on the GPU; no synchronous SH readback. */
  prepareBlend(source: Buffer, target: Buffer): void {
    for (let i = 0; i < COEFFICIENT_COUNT; i++) {
      this._blendInputs.buffer.copyFromBuffer(source, i * 16, i * 32, 16);
      this._blendInputs.buffer.copyFromBuffer(target, i * 16, i * 32 + 16, 16);
    }
  }

  /** Mix nine coefficients, rather than re-projecting or re-baking the sky. */
  blend(weight: number): Buffer {
    this._blendShaderData.setFloat(ShaderProperty.getByName("renderer_SHBlend"), weight);
    const simulator = this._blendSimulator;
    if (!simulator.beginUpdate(this._blendShaderData, [], [this._blendInputs], this._blendElements)) {
      throw new Error("Realtime IBL SH blend shader failed to compile.");
    }
    try {
      simulator.draw(MeshTopology.Points, 0, COEFFICIENT_COUNT);
    } finally {
      simulator.endUpdate();
    }
    return simulator.readBinding.buffer;
  }

  destroy(): void {
    this._blendInputs.buffer.destroy();
    this._blendSimulator.destroy();
    this._projectionSimulator.destroy();
    this._projectionBuffers.clear();
  }
}
