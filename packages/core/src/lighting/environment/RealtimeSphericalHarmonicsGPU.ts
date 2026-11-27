import { Vector4 } from "@galacean/engine-math";
import { Engine } from "../../Engine";
import { EngineEventType } from "../../EngineEventType";
import { Buffer } from "../../graphic/Buffer";
import { BufferBindFlag } from "../../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../../graphic/enums/BufferUsage";
import { VertexElementFormat } from "../../graphic/enums/VertexElementFormat";
import { VertexElement } from "../../graphic/VertexElement";
import { VertexBufferBinding } from "../../graphic/VertexBufferBinding";
import { MeshTopology } from "../../graphic/enums/MeshTopology";
import { TransformFeedbackSimulator } from "../../graphic/TransformFeedbackSimulator";
import { ComputeShader } from "../../shader/ComputeShader";
import { Shader } from "../../shader/Shader";
import { ShaderData } from "../../shader/ShaderData";
import { ShaderProperty } from "../../shader/ShaderProperty";
import { ShaderDataGroup } from "../../shader/enums/ShaderDataGroup";
import { TextureCube } from "../../texture";

const COEFFICIENT_COUNT = 9;
const COEFFICIENT_STRIDE = 16;
const PROJECTION_STRIDE = COEFFICIENT_COUNT * COEFFICIENT_STRIDE;
const PROJECT_SHADER_NAME = "Lighting/RealtimeIBLProjectSH";
const PROJECT_COMPUTE_SHADER_NAME = "Lighting/RealtimeIBLProjectSHCompute";

const computeShaderCache = new WeakMap<Engine, ComputeShader>();

function getOrCreateSHComputeShader(engine: Engine): ComputeShader {
  let cs = computeShaderCache.get(engine);
  if (!cs || cs.destroyed) {
    const precompiled = engine._builtinShaders.computeByName[PROJECT_COMPUTE_SHADER_NAME];
    if (!precompiled) {
      throw new Error(`Built-in ComputeShader "${PROJECT_COMPUTE_SHADER_NAME}" is not registered.`);
    }
    cs = ComputeShader.createFromPrecompiled(precompiled, engine);
    computeShaderCache.set(engine, cs);
    engine.once(EngineEventType.Shutdown, () => {
      if (computeShaderCache.get(engine) === cs) {
        computeShaderCache.delete(engine);
      }
      cs!.destroy();
    });
  }
  return cs;
}

/** Double-buffered GPU projection for one pre-scaled three-band SH set. @internal */
export class RealtimeSphericalHarmonicsGPU {
  private static readonly _sourceMapProperty = ShaderProperty.getByName("renderer_SHSourceMap");
  private static readonly _sourceMipLevelProperty = ShaderProperty.getByName("renderer_SHSourceMipLevel");
  private static readonly _blendProperty = ShaderProperty.getByName("renderer_SHBlend");
  private static readonly _defaultViewport = new Vector4(0, 0, 1, 1);

  private readonly _engine: Engine;
  private readonly _useCompute: boolean;
  private readonly _projectionBuffers = new Set<Buffer>();

  // WebGL2 Transform Feedback path
  private readonly _projectionSimulator?: TransformFeedbackSimulator;
  private readonly _blendSimulator?: TransformFeedbackSimulator;
  private readonly _blendInputs?: VertexBufferBinding;
  private readonly _blendElements = [
    new VertexElement("a_SourceSH", 0, VertexElementFormat.Vector4, 0),
    new VertexElement("a_TargetSH", 16, VertexElementFormat.Vector4, 0)
  ];

  // WebGPU ComputeShader path
  private readonly _computeShader?: ComputeShader;
  private readonly _computeProjA?: Buffer;
  private readonly _computeProjB?: Buffer;
  private readonly _computeBlendOut?: Buffer;
  private _computeProjReadIsA = true;
  private _blendSource: Buffer | null = null;
  private _blendTarget: Buffer | null = null;

  private readonly _blendShaderData = new ShaderData(ShaderDataGroup.Renderer);
  private readonly _projectionShaderData = new ShaderData(ShaderDataGroup.Renderer);
  private readonly _packedCoefficients = new Float32Array(COEFFICIENT_COUNT * 4);

  /** Buffer currently consumed by realtime-lighting shaders. */
  get currentBuffer(): Buffer {
    if (this._useCompute) {
      return this._computeProjReadIsA ? this._computeProjA! : this._computeProjB!;
    }
    return this._projectionSimulator!.readBinding.buffer;
  }

  constructor(engine: Engine, initialPreScaledCoefficients: Float32Array) {
    this._engine = engine;
    this._useCompute = engine._hardwareRenderer.supportsCompute;

    if (this._useCompute) {
      this._computeShader = getOrCreateSHComputeShader(engine);
      this._computeProjA = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        PROJECTION_STRIDE,
        BufferUsage.Dynamic,
        false
      );
      this._computeProjB = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        PROJECTION_STRIDE,
        BufferUsage.Dynamic,
        false
      );
      this._computeBlendOut = new Buffer(
        engine,
        BufferBindFlag.VertexBuffer,
        PROJECTION_STRIDE,
        BufferUsage.Dynamic,
        false
      );
      this._computeProjA.isGCIgnored = true;
      this._computeProjB.isGCIgnored = true;
      this._computeBlendOut.isGCIgnored = true;
      this._projectionBuffers.add(this._computeProjA);
      this._projectionBuffers.add(this._computeProjB);
    } else {
      const projectionShader = engine._builtinShaders.byName[PROJECT_SHADER_NAME] ?? Shader.find(PROJECT_SHADER_NAME);
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
    }
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
    const current = this.currentBuffer;
    current.setData(packed);
    this._projectionBuffers.add(current);
  }

  /** Compiles and submits the GPU program before realtime frame profiling begins. */
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

    if (this._useCompute) {
      const writeBuf = this._computeProjReadIsA ? this._computeProjB! : this._computeProjA!;
      shaderData.setBuffer("OutSH", writeBuf);
      this._computeShader!.dispatch("Project", 1, 1, 1, shaderData);
      this._computeProjReadIsA = !this._computeProjReadIsA;
      return;
    }

    // Unbind any active offscreen FBO before Transform Feedback samples `sourceMap`.
    // WebGL2/ANGLE still rejects framebuffer-texture feedback loops even under RASTERIZER_DISCARD,
    // which otherwise drops the draw with GL_INVALID_OPERATION when draining baker steps back-to-back.
    this._engine._hardwareRenderer.activeRenderTarget(null, RealtimeSphericalHarmonicsGPU._defaultViewport, false);
    const simulator = this._projectionSimulator!;
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
    if (this._useCompute) {
      this._blendSource = source;
      this._blendTarget = target;
      return;
    }
    for (let i = 0; i < COEFFICIENT_COUNT; i++) {
      this._blendInputs!.buffer.copyFromBuffer(source, i * 16, i * 32, 16);
      this._blendInputs!.buffer.copyFromBuffer(target, i * 16, i * 32 + 16, 16);
    }
  }

  /** Mix nine coefficients, rather than re-projecting or re-baking the sky. */
  blend(weight: number): Buffer {
    this._blendShaderData.setFloat(RealtimeSphericalHarmonicsGPU._blendProperty, weight);
    if (this._useCompute) {
      this._blendShaderData.setBuffer("SourceSH", this._blendSource!);
      this._blendShaderData.setBuffer("TargetSH", this._blendTarget!);
      this._blendShaderData.setBuffer("OutSH", this._computeBlendOut!);
      this._computeShader!.dispatch("Blend", 1, 1, 1, this._blendShaderData);
      return this._computeBlendOut!;
    }
    const simulator = this._blendSimulator!;
    if (!simulator.beginUpdate(this._blendShaderData, [], [this._blendInputs!], this._blendElements)) {
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
    this._blendInputs?.buffer.destroy();
    this._blendSimulator?.destroy();
    this._projectionSimulator?.destroy();
    this._computeProjA?.destroy();
    this._computeProjB?.destroy();
    this._computeBlendOut?.destroy();
    this._blendSource = null;
    this._blendTarget = null;
    this._projectionBuffers.clear();
  }
}
