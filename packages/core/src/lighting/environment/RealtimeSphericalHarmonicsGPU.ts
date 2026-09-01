import { Engine } from "../../Engine";
import { Buffer } from "../../graphic/Buffer";
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

  private readonly _projectionSimulator: TransformFeedbackSimulator;
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

    this._projectionSimulator = new TransformFeedbackSimulator(
      engine,
      PROJECTION_STRIDE,
      projectionShader.subShaders[0].passes[0]
    );
    this._projectionSimulator.resize(1);
    this.resetCurrent(initialPreScaledCoefficients);
  }

  /** Whether the buffer belongs to the projection staging/current ping-pong pair. */
  ownsCurrentBuffer(buffer: Buffer | null): boolean {
    return (
      buffer === this._projectionSimulator.readBinding.buffer ||
      buffer === this._projectionSimulator.writeBinding.buffer
    );
  }

  /** Seeds both projection buffers from the ordinary CPU-authored ambient-light representation. */
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
    this._projectionSimulator.writeBinding.buffer.setData(packed);
  }

  /** Compiles and submits the TF program before realtime frame profiling begins. */
  warmUp(sourceMap: TextureCube, sourceMipLevel: number, initialPreScaledCoefficients: Float32Array): void {
    this.project(sourceMap, sourceMipLevel);
    this.resetCurrent(initialPreScaledCoefficients);
  }

  /** Projects a uniformly sampled source mip into a GPU-resident target SH buffer. */
  project(sourceMap: TextureCube, sourceMipLevel: number): void {
    const shaderData = this._projectionShaderData;
    shaderData.setTexture(RealtimeSphericalHarmonicsGPU._sourceMapProperty, sourceMap);
    shaderData.setFloat(RealtimeSphericalHarmonicsGPU._sourceMipLevelProperty, sourceMipLevel);
    const simulator = this._projectionSimulator;
    if (!simulator.beginUpdate(shaderData, [], simulator.readBinding, [])) {
      throw new Error("Realtime IBL GPU SH projection shader failed to compile.");
    }
    try {
      simulator.draw(MeshTopology.Points, 0, 1);
    } finally {
      simulator.endUpdate();
    }
  }

  destroy(): void {
    this._projectionSimulator.destroy();
  }
}
