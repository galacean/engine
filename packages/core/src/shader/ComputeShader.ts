import type { IComputeProgramSource, IWebGPUComputeProgram } from "@galacean/engine-design";
import type { Engine } from "../Engine";
import { EngineEventType } from "../EngineEventType";
import { GLCapabilityType } from "../base/Constant";
import type { IPlatformComputeProgram } from "../renderingHardwareInterface/IPlatformComputeProgram";
import { Texture } from "../texture/Texture";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { ShaderData } from "./ShaderData";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";
import { ShaderMacroProcessor } from "./ShaderMacroProcessor";
import { ShaderProperty } from "./ShaderProperty";

interface CompiledComputeKernel {
  readonly name: string;
  readonly source: IComputeProgramSource;
  readonly variants: Map<string, IPlatformComputeProgram>;
}

/**
 * WebGPU compute shader compiled from ShaderLab `ComputeShader` source.
 *
 * Supports both single-kernel (`WorkgroupSize` + `ComputeKernel`) and multi-kernel
 * (`Kernel "Name" { ... }`) definitions with SSBOs, storage textures, workgroup shared memory,
 * atomics, and uniforms bound through `shaderData`.
 */
export class ComputeShader {
  /**
   * Create a compute shader from ShaderLab `ComputeShader` source.
   * @param source - ShaderLab `ComputeShader "..." { ... }` source code
   * @param engine - Engine instance (must use the WebGPU backend)
   * @returns Compiled `ComputeShader`
   */
  static create(source: string, engine: Engine): ComputeShader {
    const rhi = engine._hardwareRenderer;
    if (!rhi.supportsCompute || !rhi.createPlatformComputeProgram) {
      throw new Error("ComputeShader requires a WebGPU engine; compute shaders are not supported on this backend.");
    }
    const compiler = engine._shaderCompiler;
    if (!compiler || !compiler._parseComputeKernel) {
      throw new Error("This engine was created without a compute-capable shader compiler.");
    }
    if (!engine._webGPUShaderCompiler?.compileWebGPUComputeVariant) {
      throw new Error("This engine was created without a WebGPU shader compiler.");
    }

    const parsed = compiler._parseShaderSource(source);
    if (parsed.kind !== "compute" || !parsed.computeKernels?.length) {
      throw new Error(`Expected ComputeShader source, but received "${parsed.name}" without compute kernels.`);
    }

    const kernels = new Map<string, CompiledComputeKernel>();
    const kernelNames: string[] = [];
    for (const kernelSource of parsed.computeKernels) {
      const compiled = compiler._parseComputeKernel(
        kernelSource.contents,
        kernelSource.entry,
        kernelSource.workgroupSize,
        undefined,
        kernelSource.contentScopeStarts
      );
      if (!compiled) {
        throw new Error(`ComputeShader "${parsed.name}" kernel "${kernelSource.name}" compilation failed.`);
      }
      kernels.set(kernelSource.name, {
        name: kernelSource.name,
        source: compiled,
        variants: new Map()
      });
      kernelNames.push(kernelSource.name);
    }

    return new ComputeShader(engine, parsed.name, kernels, kernelNames);
  }

  /** Compute shader name. */
  readonly name: string;
  /** Default resource and uniform binding container for this compute shader. */
  readonly shaderData: ShaderData;
  /** Ordered list of kernel names declared in this compute shader. */
  readonly kernelNames: readonly string[];

  private readonly _engine: Engine;
  private readonly _kernels: Map<string, CompiledComputeKernel>;
  private readonly _defaultKernelName: string;
  private readonly _onDeviceInvalidated = (): void => {
    this._invalidateVariants();
  };
  private _destroyed = false;

  /** Whether this compute shader has been destroyed. */
  get destroyed(): boolean {
    return this._destroyed;
  }

  private constructor(
    engine: Engine,
    name: string,
    kernels: Map<string, CompiledComputeKernel>,
    kernelNames: string[]
  ) {
    this._engine = engine;
    this.name = name;
    this._kernels = kernels;
    this.kernelNames = Object.freeze(kernelNames);
    this._defaultKernelName = kernelNames[0];
    this.shaderData = new ShaderData(ShaderDataGroup.Material);
    this.shaderData._addReferCount(1);
    engine.on(EngineEventType.DeviceLost, this._onDeviceInvalidated);
    engine.on(EngineEventType.DeviceRestored, this._onDeviceInvalidated);
  }

  /**
   * Dispatch the default (first) compute kernel.
   * @param workgroupCountX - Number of workgroups in X
   * @param workgroupCountY - Number of workgroups in Y (default 1)
   * @param workgroupCountZ - Number of workgroups in Z (default 1)
   * @param shaderData - Optional override ShaderData (defaults to `this.shaderData`)
   */
  dispatch(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number, shaderData?: ShaderData): void;

  /**
   * Dispatch a named compute kernel.
   * @param kernelName - Kernel name declared via `Kernel "Name" { ... }`
   * @param workgroupCountX - Number of workgroups in X
   * @param workgroupCountY - Number of workgroups in Y (default 1)
   * @param workgroupCountZ - Number of workgroups in Z (default 1)
   * @param shaderData - Optional override ShaderData (defaults to `this.shaderData`)
   */
  dispatch(
    kernelName: string,
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number,
    shaderData?: ShaderData
  ): void;

  dispatch(
    kernelNameOrX: string | number,
    xOrY?: number,
    yOrZ?: number,
    zOrData?: number | ShaderData,
    maybeData?: ShaderData
  ): void {
    if (this._destroyed) {
      throw new Error(`ComputeShader "${this.name}" has been destroyed.`);
    }

    let kernelName: string;
    let x: number;
    let y: number;
    let z: number;
    let data: ShaderData;

    if (typeof kernelNameOrX === "string") {
      kernelName = kernelNameOrX;
      x = xOrY ?? 1;
      y = yOrZ ?? 1;
      z = typeof zOrData === "number" ? zOrData : 1;
      data = maybeData ?? (zOrData instanceof ShaderData ? zOrData : this.shaderData);
    } else {
      kernelName = this._defaultKernelName;
      x = kernelNameOrX;
      y = xOrY ?? 1;
      z = yOrZ ?? 1;
      data = zOrData instanceof ShaderData ? zOrData : this.shaderData;
    }

    const kernel = this._kernels.get(kernelName);
    if (!kernel) {
      throw new Error(`ComputeShader "${this.name}" has no kernel named "${kernelName}".`);
    }

    const program = this._getOrCompileVariant(kernel, data);
    program.dispatch(x, y, z, data);
  }

  /**
   * Retrieve the linked WGSL program & reflection for a kernel with optional macros (useful for diagnostics).
   * @internal
   */
  _linkVariant(kernelName = this._defaultKernelName, data: ShaderData = this.shaderData): IWebGPUComputeProgram {
    const kernel = this._kernels.get(kernelName);
    if (!kernel) {
      throw new Error(`ComputeShader "${this.name}" has no kernel named "${kernelName}".`);
    }
    return this._compileWGSLVariant(kernel, data);
  }

  /** Destroy all GPU pipelines and resources owned by this compute shader. */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._engine.off(EngineEventType.DeviceLost, this._onDeviceInvalidated);
    this._engine.off(EngineEventType.DeviceRestored, this._onDeviceInvalidated);
    this.shaderData._addReferCount(-1);
    this._invalidateVariants();
    this._kernels.clear();
  }

  private _invalidateVariants(): void {
    this._kernels.forEach((kernel) => {
      kernel.variants.forEach((program) => program.destroy());
      kernel.variants.clear();
    });
  }

  private _collectUnfilterableTextures(data: ShaderData): Set<string> | undefined {
    const float32Filterable = this._engine._hardwareRenderer.canIUse(GLCapabilityType.textureFloatLinear);
    const props = data._propertyValueMap;
    let unfilterable: Set<string> | undefined;
    for (const id in props) {
      const value = props[id];
      if (!(value instanceof Texture) || value.destroyed) continue;
      const fmt = value.format;
      const isUnfilterable =
        value._isDepthTexture ||
        (!float32Filterable &&
          (fmt === TextureFormat.R32_SFloat ||
            fmt === TextureFormat.R32G32_SFloat ||
            fmt === TextureFormat.R32G32B32A32_SFloat));
      if (isUnfilterable) {
        const prop = ShaderProperty._propertyIdMap[id];
        if (prop) {
          (unfilterable ??= new Set()).add(prop.name);
        }
      }
    }
    return unfilterable;
  }

  private _getOrCompileVariant(kernel: CompiledComputeKernel, data: ShaderData): IPlatformComputeProgram {
    const macros = data.getMacros();
    let key = "";
    if (macros.length) {
      const parts = macros.map((m) => (m.value !== undefined ? `${m.name}=${m.value}` : m.name)).sort();
      key = parts.join("|");
    }
    const unfilterable = this._collectUnfilterableTextures(data);
    if (unfilterable) {
      key += `#uf:${Array.from(unfilterable).sort().join(",")}`;
    }
    let program = kernel.variants.get(key);
    if (program && !program.isValid) {
      program.destroy();
      kernel.variants.delete(key);
      program = undefined;
    }
    if (!program) {
      const linked = this._compileWGSLVariant(kernel, data, unfilterable);
      program = this._engine._hardwareRenderer.createPlatformComputeProgram!(this._engine, linked);
      kernel.variants.set(key, program);
    }
    return program;
  }

  private _compileWGSLVariant(
    kernel: CompiledComputeKernel,
    data: ShaderData,
    unfilterableTextures?: Set<string>
  ): IWebGPUComputeProgram {
    const webgpuCompiler = this._engine._webGPUShaderCompiler!;
    const macros = new Map(ShaderMacroProcessor._defaultWebGPUMacros);
    const enabled = data.getMacros();
    for (let i = 0; i < enabled.length; i++) {
      const m = enabled[i];
      macros.set(m.name, m.value ?? "");
    }
    const instructions = kernel.source.wgslComputeInstructions;
    if (!instructions) {
      if (kernel.source.wgsl) return kernel.source.wgsl;
      throw new Error(`ComputeShader "${this.name}" kernel "${kernel.name}" is missing WGSL instructions.`);
    }
    const evaluated = ShaderMacroProcessor.evaluate(instructions, macros);
    const rhi = this._engine._hardwareRenderer;
    const resolveConstant = (name: string): number | undefined => {
      const fromMacro = macros.get(name);
      if (fromMacro !== undefined && /^-?\d+$/.test(fromMacro.trim())) return Number(fromMacro.trim());
      return rhi.resolveShaderConstant(name);
    };
    return webgpuCompiler.compileWebGPUComputeVariant!(evaluated, {
      uniformBlocks: kernel.source.uniformBlocks,
      workgroupSize: kernel.source.workgroupSize,
      resolveConstant,
      maxUniformBlockBytes: rhi.maxUniformBlockSize,
      unfilterableTextures
    });
  }
}
