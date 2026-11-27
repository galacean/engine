import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Engine,
  IPlatformComputeProgram,
  SetDataOptions,
  ShaderData,
  ShaderProperty,
  Std140FieldWriter,
  Texture
} from "@galacean/engine-core";
import type {
  IWebGPUComputeProgram,
  IWebGPUComputeReflection,
  IWebGPUShaderStorageBuffer,
  IWebGPUShaderStorageTexture,
  IWebGPUShaderTexture,
  IWebGPUShaderUniformBlock
} from "@galacean/engine-design";
import { WebGPUBuffer } from "./WebGPUBuffer";
import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import type { WebGPUTexture } from "./WebGPUTexture";

interface ComputeUniformField {
  readonly propertyId: number;
  readonly writer: Std140FieldWriter;
  readonly view: Float32Array | Int32Array;
  readonly offset: number;
}

interface ComputeUniformBlockSlot {
  readonly layout: IWebGPUShaderUniformBlock;
  readonly staging: Uint32Array;
  readonly fields: ComputeUniformField[];
  readonly buffer: WebGPUBuffer;
}

interface ComputeStorageBufferSlot {
  readonly layout: IWebGPUShaderStorageBuffer;
  readonly propertyId: number;
}

interface ComputeTextureSlot {
  readonly layout: IWebGPUShaderTexture;
  readonly propertyId: number;
  readonly fallback: Texture;
}

interface ComputeStorageTextureSlot {
  readonly layout: IWebGPUShaderStorageTexture;
  readonly propertyId: number;
}

/**
 * WebGPU compute shader program backed by a compiled WGSL module and `GPUComputePipeline`.
 * @internal
 */
export class WebGPUComputeProgram implements IPlatformComputeProgram {
  private _destroyed = false;
  get isValid(): boolean {
    return !this._destroyed;
  }

  readonly reflection: IWebGPUComputeReflection;
  private readonly _pipeline: GPUComputePipeline;
  private readonly _bindGroupLayout: GPUBindGroupLayout;
  private readonly _uniformBlocks: ComputeUniformBlockSlot[] = [];
  private readonly _storageBuffers: ComputeStorageBufferSlot[] = [];
  private readonly _textures: ComputeTextureSlot[] = [];
  private readonly _storageTextures: ComputeStorageTextureSlot[] = [];

  constructor(
    private readonly _graphicDevice: WebGPUGraphicDevice,
    engine: Engine,
    program: IWebGPUComputeProgram
  ) {
    this.reflection = program.reflection;
    const { device } = _graphicDevice;
    const module = device.createShaderModule({ label: "Galacean compute", code: program.compute });

    const entries: GPUBindGroupLayoutEntry[] = [];
    const vis = GPUShaderStage.COMPUTE;

    for (const layout of this.reflection.uniformBlocks) {
      entries.push({
        binding: layout.binding,
        visibility: vis,
        buffer: { type: "uniform", minBindingSize: layout.byteLength }
      });
      const raw = new ArrayBuffer(layout.byteLength);
      const floats = new Float32Array(raw);
      const ints = new Int32Array(raw);
      const staging = new Uint32Array(raw);
      const fields: ComputeUniformField[] = layout.members.map((m) => {
        const writer = new Std140FieldWriter(m.type, m.arrayLength, m.arrayStride, m.matrixStride);
        return {
          propertyId: ShaderProperty.getByName(m.name)._uniqueId,
          writer,
          view: writer.useIntView ? ints : floats,
          offset: m.offset / 4
        };
      });
      const buffer = new WebGPUBuffer(
        _graphicDevice,
        BufferBindFlag.ConstantBuffer,
        layout.byteLength,
        BufferUsage.Dynamic
      );
      this._uniformBlocks.push({ layout, staging, fields, buffer });
    }

    for (const layout of this.reflection.storageBuffers) {
      entries.push({
        binding: layout.binding,
        visibility: vis,
        buffer: { type: layout.access === "read" ? "read-only-storage" : "storage" }
      });
      this._storageBuffers.push({
        layout,
        propertyId: ShaderProperty.getByName(layout.name)._uniqueId
      });
    }

    const res = engine._basicResources;
    for (const layout of this.reflection.textures) {
      const fallback =
        layout.viewDimension === "cube"
          ? res.whiteTextureCube
          : layout.viewDimension === "2d-array"
            ? res.whiteTexture2DArray
            : layout.sampleType === "uint"
              ? res.uintWhiteTexture2D
              : res.whiteTexture2D;
      entries.push({
        binding: layout.textureBinding,
        visibility: vis,
        texture: { sampleType: layout.sampleType, viewDimension: layout.viewDimension }
      });
      if (layout.samplerBinding !== undefined) {
        entries.push({
          binding: layout.samplerBinding,
          visibility: vis,
          sampler: { type: layout.samplerType ?? "filtering" }
        });
      }
      this._textures.push({
        layout,
        propertyId: ShaderProperty.getByName(layout.name)._uniqueId,
        fallback
      });
    }

    for (const layout of this.reflection.storageTextures) {
      entries.push({
        binding: layout.binding,
        visibility: vis,
        storageTexture: {
          access: layout.access,
          format: layout.format as GPUTextureFormat,
          viewDimension: layout.viewDimension
        }
      });
      this._storageTextures.push({
        layout,
        propertyId: ShaderProperty.getByName(layout.name)._uniqueId
      });
    }

    this._bindGroupLayout = device.createBindGroupLayout({ entries });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this._bindGroupLayout] });
    this._pipeline = device.createComputePipeline({
      label: "Galacean compute pipeline",
      layout: pipelineLayout,
      compute: { module, entryPoint: program.entryPoint }
    });
  }

  dispatch(workgroupCountX: number, workgroupCountY: number, workgroupCountZ: number, shaderData: ShaderData): void {
    if (this._destroyed) {
      throw new Error("Cannot dispatch a destroyed WebGPUComputeProgram.");
    }
    const values = shaderData._propertyValueMap;
    const entries: GPUBindGroupEntry[] = [];

    // 1. Pack & bind uniform blocks
    for (let i = 0; i < this._uniformBlocks.length; i++) {
      const slot = this._uniformBlocks[i];
      slot.staging.fill(0);
      for (let j = 0; j < slot.fields.length; j++) {
        const f = slot.fields[j];
        const value = values[f.propertyId];
        if (value !== undefined) {
          f.writer.write(f.view, f.offset, value);
        }
      }
      slot.buffer.setData(slot.layout.byteLength, slot.staging, 0, 0, undefined, SetDataOptions.Discard);
      slot.buffer._markUsed(0, slot.layout.byteLength);
      entries.push({
        binding: slot.layout.binding,
        resource: { buffer: slot.buffer._gpuBuffer, offset: 0, size: slot.layout.byteLength }
      });
    }

    // 2. Bind storage buffers (SSBOs)
    for (let i = 0; i < this._storageBuffers.length; i++) {
      const slot = this._storageBuffers[i];
      const buffer = values[slot.propertyId] as Buffer | undefined;
      if (!buffer || !(buffer instanceof Buffer)) {
        throw new Error(
          `Missing storage buffer "${slot.layout.name}" for ComputeShader dispatch; bind it with shaderData.setBuffer("${slot.layout.name}", buffer).`
        );
      }
      const platform = buffer._platformBuffer as WebGPUBuffer;
      if (slot.layout.access === "read_write") {
        platform._markShaderWrite();
      }
      platform._markUsed();
      entries.push({
        binding: slot.layout.binding,
        resource: { buffer: platform._gpuBuffer }
      });
    }

    // 3. Bind sampled textures & samplers
    for (let i = 0; i < this._textures.length; i++) {
      const slot = this._textures[i];
      const { layout } = slot;
      const raw = values[slot.propertyId];
      let tex: Texture | undefined;
      if (layout.arrayIndex !== undefined && Array.isArray(raw)) {
        tex = raw[layout.arrayIndex];
      } else if (raw instanceof Texture) {
        tex = raw;
      }
      const resolved = tex && !tex.destroyed ? tex : slot.fallback;
      const platformTex = resolved._platformTexture as WebGPUTexture | undefined;
      const view = platformTex?.sampleView(layout.sampleType) ?? this._graphicDevice._fallbackView(layout);
      entries.push({ binding: layout.textureBinding, resource: view });
      if (layout.samplerBinding !== undefined) {
        const samplerType = layout.samplerType ?? "filtering";
        const sampler = platformTex?.getSampler(samplerType) ?? this._graphicDevice._fallbackSampler(samplerType);
        entries.push({ binding: layout.samplerBinding, resource: sampler });
      }
    }

    // 4. Bind storage textures (`image2D`)
    for (let i = 0; i < this._storageTextures.length; i++) {
      const slot = this._storageTextures[i];
      const tex = values[slot.propertyId] as Texture | undefined;
      if (!tex || !(tex instanceof Texture) || tex.destroyed) {
        throw new Error(
          `Missing storage texture "${slot.layout.name}" for ComputeShader dispatch; bind it with shaderData.setTexture("${slot.layout.name}", texture).`
        );
      }
      const platformTex = tex._platformTexture as WebGPUTexture;
      if (slot.layout.access !== "read-only") {
        platformTex._invalidatePixels();
      }
      entries.push({ binding: slot.layout.binding, resource: platformTex.storageView() });
    }

    const bindGroup = this._graphicDevice.device.createBindGroup({
      layout: this._bindGroupLayout,
      entries
    });
    const pass = this._graphicDevice._beginComputePass();
    pass.setPipeline(this._pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
    this._graphicDevice._endComputePass();
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const slot of this._uniformBlocks) {
      slot.buffer.destroy();
    }
    this._uniformBlocks.length = 0;
    this._storageBuffers.length = 0;
    this._textures.length = 0;
    this._storageTextures.length = 0;
  }
}
