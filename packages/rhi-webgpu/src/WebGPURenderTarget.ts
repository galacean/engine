import {
  CameraClearFlags,
  IPlatformRenderTarget,
  RenderTarget,
  Texture,
  TextureCube,
  TextureCubeFace,
  TextureFormat
} from "@galacean/engine-core";
import { Color } from "@galacean/engine-math";
import { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import { WebGPUTexture } from "./WebGPUTexture";

/**
 * WebGPU render target attachments.
 * @internal
 */
export class WebGPURenderTarget implements IPlatformRenderTarget {
  private readonly _device: WebGPUGraphicDevice;
  private readonly _target: RenderTarget;
  private _multisampledColors: GPUTexture[] = [];
  private _ownedDepth?: GPUTexture;
  private readonly _transients = new Map<number, { colors: GPUTexture[]; depth?: GPUTexture }>();
  private _mipLevel = 0;
  private _faceIndex?: TextureCubeFace;

  constructor(device: WebGPUGraphicDevice, target: RenderTarget) {
    this._device = device;
    this._target = target;

    target._antiAliasing = target.antiAliasing > 1 ? 4 : 1;
    this._selectAttachments(0, 0);
  }

  private _selectAttachments(mip: number, face: number): void {
    const target = this._target,
      samples = target.antiAliasing;
    const depth = target._depth;
    if (samples === 1 && typeof depth !== "number") return;
    const key = mip * 6 + (samples > 1 ? face : 0);
    let set = this._transients.get(key);
    if (!set) {
      const size = { width: Math.max(1, target.width >> mip), height: Math.max(1, target.height >> mip) };
      const colors =
        samples === 1
          ? []
          : target.colorTextures.map((color) =>
              this._device.device.createTexture({
                label: "RenderTarget MSAA",
                size,
                sampleCount: samples,
                format: (color._platformTexture as WebGPUTexture)._format,
                usage: GPUTextureUsage.RENDER_ATTACHMENT
              })
            );
      const format = this.depthStencilFormat;
      const attachment =
        format && (typeof depth === "number" || samples > 1)
          ? this._device.device.createTexture({
              label: "RenderTarget depth",
              size,
              sampleCount: samples,
              format,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            })
          : undefined;
      set = { colors, depth: attachment };
      this._transients.set(key, set);
    }
    this._multisampledColors = set.colors;
    this._ownedDepth = set.depth;
  }

  _invalidatePixels(): void {
    for (const texture of this._target.colorTextures) (texture._platformTexture as WebGPUTexture)._invalidatePixels();
    const depth = this._target.depthTexture;
    if (depth) (depth._platformTexture as WebGPUTexture)._invalidatePixels();
  }

  activeRenderTarget(mipLevel: number = 0, faceIndex?: TextureCubeFace): void {
    this._mipLevel = mipLevel;
    this._faceIndex = faceIndex;
    this._selectAttachments(mipLevel, faceIndex ?? 0);
    this._device._setRenderTarget(this);
  }

  blitRenderTarget(): void {
    this._device._finishTarget(this);
    const depth = this._target.depthTexture;
    if (this._target.antiAliasing > 1 && depth) {
      this._device._resolveDepth(
        this._ownedDepth!,
        (depth._platformTexture as WebGPUTexture)._gpuTexture,
        this._mipLevel,
        this._faceIndex ?? 0
      );
    }
  }

  colorTexture(index = 0): GPUTexture {
    return (this._target.getColorTexture(index)!._platformTexture as WebGPUTexture)._gpuTexture;
  }

  colorAttachment(index = 0): GPUTexture {
    return this._multisampledColors[index] ?? this.colorTexture(index);
  }

  colorView(forAttachment = false): GPUTextureViewDescriptor | undefined {
    return forAttachment && this.sampleCount > 1 ? undefined : this._viewDescriptor(this._target.getColorTexture(0)!);
  }

  depthView(): GPUTextureViewDescriptor | undefined {
    const depth = this._target.depthTexture;
    return !this._ownedDepth && depth ? this._viewDescriptor(depth) : undefined;
  }

  depthTexture(): GPUTexture | undefined {
    const depth = this._target._depth;
    return (
      this._ownedDepth ?? (depth instanceof Texture ? (depth._platformTexture as WebGPUTexture)._gpuTexture : undefined)
    );
  }

  destroy(): void {
    for (const set of this._transients.values()) {
      for (const texture of set.colors) this._device._retireTexture(texture);
      if (set.depth) this._device._retireTexture(set.depth);
    }
    this._transients.clear();
  }

  /** @internal */
  get colorFormats(): readonly GPUTextureFormat[] {
    return this._target.colorTextures.map(
      (texture) => ((texture as TextureInternal)._platformTexture as WebGPUTexture)._format
    );
  }

  /** @internal */
  get depthStencilFormat(): GPUTextureFormat | undefined {
    const depthFormat = (this._target as RenderTargetInternal)._depthFormat;
    return depthFormat === null ? undefined : WebGPUTexture._getFormat(depthFormat, false);
  }

  /** @internal */
  get sampleCount(): number {
    return this._target.antiAliasing;
  }

  /** @internal */
  get width(): number {
    return Math.max(1, this._target.width >> this._mipLevel);
  }

  /** @internal */
  get height(): number {
    return Math.max(1, this._target.height >> this._mipLevel);
  }

  /** @internal */
  createDescriptor(clearFlags: CameraClearFlags, clearColor?: Color): GPURenderPassDescriptor {
    const target = this._target;
    const sampleCount = target.antiAliasing;
    const clearColorAttachment = (clearFlags & CameraClearFlags.Color) !== 0;
    const clearDepth = (clearFlags & CameraClearFlags.Depth) !== 0;
    const clearStencil = (clearFlags & CameraClearFlags.Stencil) !== 0;
    const colorAttachments: GPURenderPassColorAttachment[] = target.colorTextures.map((texture, index) => {
      const platformTexture = (texture as TextureInternal)._platformTexture as WebGPUTexture;
      const resolveTarget = platformTexture._gpuTexture.createView(this._viewDescriptor(texture));
      return {
        view: sampleCount > 1 ? this._multisampledColors[index].createView() : resolveTarget,
        resolveTarget: sampleCount > 1 ? resolveTarget : undefined,
        clearValue: clearColorAttachment
          ? {
              r: clearColor?.r ?? 0,
              g: clearColor?.g ?? 0,
              b: clearColor?.b ?? 0,
              a: clearColor?.a ?? 0
            }
          : undefined,
        loadOp: clearColorAttachment ? "clear" : "load",
        storeOp: "store"
      };
    });

    const targetInternal = target as RenderTargetInternal;
    const depth = targetInternal._depth;
    let depthStencilAttachment: GPURenderPassDepthStencilAttachment | undefined;
    if (depth !== null) {
      const view =
        this._ownedDepth?.createView() ??
        ((depth as TextureInternal)._platformTexture as WebGPUTexture)._gpuTexture.createView(
          this._viewDescriptor(depth as Texture)
        );
      const depthFormat = targetInternal._depthFormat;
      const hasStencil =
        depthFormat === TextureFormat.Stencil ||
        depthFormat === TextureFormat.DepthStencil ||
        depthFormat === TextureFormat.Depth24Stencil8 ||
        depthFormat === TextureFormat.Depth32Stencil8;
      depthStencilAttachment = {
        view,
        depthClearValue: clearDepth && depthFormat !== TextureFormat.Stencil ? 1 : undefined,
        depthLoadOp: depthFormat === TextureFormat.Stencil ? undefined : clearDepth ? "clear" : "load",
        depthStoreOp: depthFormat === TextureFormat.Stencil ? undefined : "store",
        stencilClearValue: clearStencil ? 0 : undefined,
        stencilLoadOp: hasStencil ? (clearStencil ? "clear" : "load") : undefined,
        stencilStoreOp: hasStencil ? "store" : undefined
      };
    }

    return { colorAttachments, depthStencilAttachment };
  }

  private _viewDescriptor(texture: Texture): GPUTextureViewDescriptor {
    const isCube = texture instanceof TextureCube;
    return {
      dimension: "2d",
      baseMipLevel: this._mipLevel,
      mipLevelCount: 1,
      baseArrayLayer: isCube ? (this._faceIndex ?? 0) : 0,
      arrayLayerCount: 1
    };
  }
}

type TextureInternal = Texture & {
  _platformTexture: WebGPUTexture;
};

type RenderTargetInternal = RenderTarget & {
  _depth: Texture | TextureFormat | null;
  _depthFormat: TextureFormat | null;
};
