/**
 * Generates mip chains for renderable, filterable WebGPU textures.
 * @internal
 */
export class WebGPUMipmapGenerator {
  private readonly _device: GPUDevice;
  private readonly _sampler: GPUSampler;
  private readonly _bindGroupLayout: GPUBindGroupLayout;
  private readonly _pipelineLayout: GPUPipelineLayout;
  private readonly _vertexModule: GPUShaderModule;
  private readonly _fragmentModule: GPUShaderModule;
  private readonly _pipelines = new Map<GPUTextureFormat, GPURenderPipeline>();

  private readonly _levels = new WeakMap<GPUTexture, { destination: GPUTextureView; source: GPUBindGroup }[]>();

  constructor(device: GPUDevice) {
    this._device = device;
    this._sampler = device.createSampler({
      minFilter: "linear",
      magFilter: "linear"
    });
    this._bindGroupLayout = device.createBindGroupLayout({
      label: "Galacean mipmap bind group layout",
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float", viewDimension: "2d" }
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: "filtering" }
        }
      ]
    });
    this._pipelineLayout = device.createPipelineLayout({
      label: "Galacean mipmap pipeline layout",
      bindGroupLayouts: [this._bindGroupLayout]
    });

    // This is a backend-private copy operation, not an alternate source for a
    // user shader. ShaderLab remains the only source for material shaders.
    this._vertexModule = device.createShaderModule({
      label: "Galacean mipmap vertex",
      code: `
        struct VertexOutput {
          @builtin(position) position: vec4f,
          @location(0) uv: vec2f
        }

        @vertex
        fn main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
          var output: VertexOutput;
          let uv = vec2f(
            f32((vertexIndex << 1u) & 2u),
            f32(vertexIndex & 2u)
          );
          output.position = vec4f(uv * vec2f(2.0, -2.0) + vec2f(-1.0, 1.0), 0.0, 1.0);
          output.uv = uv;
          return output;
        }
      `
    });
    this._fragmentModule = device.createShaderModule({
      label: "Galacean mipmap fragment",
      code: `
        @group(0) @binding(0) var sourceTexture: texture_2d<f32>;
        @group(0) @binding(1) var sourceSampler: sampler;

        @fragment
        fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
          return textureSample(sourceTexture, sourceSampler, uv);
        }
      `
    });
  }

  generate(encoder: GPUCommandEncoder, texture: GPUTexture): void {
    const pipeline = this._getPipeline(texture.format);
    let levels = this._levels.get(texture);
    if (!levels) {
      levels = [];
      for (let layer = 0; layer < texture.depthOrArrayLayers; layer++) {
        let previous: GPUTextureView | undefined;
        for (let mip = 0; mip < texture.mipLevelCount; mip++) {
          const view = texture.createView({
            dimension: "2d",
            baseMipLevel: mip,
            mipLevelCount: 1,
            baseArrayLayer: layer,
            arrayLayerCount: 1
          });
          if (previous) {
            const source = this._device.createBindGroup({
              layout: this._bindGroupLayout,
              entries: [
                { binding: 0, resource: previous },
                { binding: 1, resource: this._sampler }
              ]
            });
            levels.push({ destination: view, source });
          }
          previous = view;
        }
      }
      this._levels.set(texture, levels);
    }
    for (const level of levels) {
      const pass = encoder.beginRenderPass({
        label: "Galacean mipmap generation",
        colorAttachments: [{ view: level.destination, loadOp: "clear", storeOp: "store" }]
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, level.source);
      pass.draw(3);
      pass.end();
    }
  }

  private _getPipeline(format: GPUTextureFormat): GPURenderPipeline {
    let pipeline = this._pipelines.get(format);
    if (!pipeline) {
      pipeline = this._device.createRenderPipeline({
        label: `Galacean mipmap ${format}`,
        layout: this._pipelineLayout,
        vertex: {
          module: this._vertexModule,
          entryPoint: "main"
        },
        fragment: {
          module: this._fragmentModule,
          entryPoint: "main",
          targets: [{ format }]
        },
        primitive: { topology: "triangle-list" }
      });
      this._pipelines.set(format, pipeline);
    }
    return pipeline;
  }
}
