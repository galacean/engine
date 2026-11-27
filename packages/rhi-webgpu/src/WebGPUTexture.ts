import {
  IPlatformTexture,
  Texture,
  TextureDepthCompareFunction,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@galacean/engine-core";
import { WebGPUDepthTransfer } from "./WebGPUDepthTransfer";
import {
  pixelPacking,
  packRGBA8Row,
  unpackRGBA8,
  packR11G11B10,
  readPixelBytes,
  expandReadRow
} from "./WebGPUPixelConversion";
import { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";

/**
 * Shared WebGPU texture implementation.
 * @internal
 */
export abstract class WebGPUTexture implements IPlatformTexture {
  readonly _gpuTexture: GPUTexture;
  private readonly _scaledArrayKey?: string;
  private readonly _exactArrayKey?: string;
  get arrayKey(): string | undefined {
    // Native anisotropic footprints can depend on the original base extent even with LOD clamps.
    return this._anisoLevel > 1 && this._filterMode !== TextureFilterMode.Point
      ? this._exactArrayKey
      : this._scaledArrayKey;
  }
  static arrayFormat(format: GPUTextureFormat): GPUTextureFormat {
    return format === "r8unorm" || format === "rg8unorm" ? "rgba8unorm" : format;
  }
  private static readonly _STORAGE_FORMATS = new Set<GPUTextureFormat>([
    "rgba8unorm",
    "rgba8snorm",
    "rgba8uint",
    "rgba8sint",
    "rgba16uint",
    "rgba16sint",
    "rgba16float",
    "r32uint",
    "r32sint",
    "r32float",
    "rg32uint",
    "rg32sint",
    "rg32float",
    "rgba32uint",
    "rgba32sint",
    "rgba32float"
  ]);
  /** @internal */
  readonly _format: GPUTextureFormat;
  /** @internal */
  readonly _viewDimension: GPUTextureViewDimension;

  protected readonly _device: WebGPUGraphicDevice;
  protected readonly _texture: Texture;
  protected readonly _layerCount: number;
  private _readablePixels?: Map<number, Uint8Array>;
  _contentRevision = 0;

  private _wrapModeU = TextureWrapMode.Clamp;
  private _wrapModeV = TextureWrapMode.Clamp;
  private _filterMode = TextureFilterMode.Bilinear;
  private _anisoLevel = 1;
  private _depthCompareFunction = TextureDepthCompareFunction.LessEqual;
  private readonly _samplers: Partial<Record<GPUSamplerBindingType, GPUSampler>> = {};
  private _mipSamplers?: Map<number, GPUSampler>;
  private _view: GPUTextureView;
  private _depthView?: GPUTextureView;
  private _storageView?: GPUTextureView;

  get wrapModeU(): TextureWrapMode {
    return this._wrapModeU;
  }

  set wrapModeU(value: TextureWrapMode) {
    this._wrapModeU = value;
    this._invalidateSamplers();
  }

  get wrapModeV(): TextureWrapMode {
    return this._wrapModeV;
  }

  set wrapModeV(value: TextureWrapMode) {
    this._wrapModeV = value;
    this._invalidateSamplers();
  }

  get filterMode(): TextureFilterMode {
    return this._filterMode;
  }

  set filterMode(value: TextureFilterMode) {
    this._filterMode = value;
    this._invalidateSamplers();
  }

  get anisoLevel(): number {
    return this._anisoLevel;
  }

  set anisoLevel(value: number) {
    this._anisoLevel = value;
    this._invalidateSamplers();
  }

  get depthCompareFunction(): TextureDepthCompareFunction {
    return this._depthCompareFunction;
  }

  set depthCompareFunction(value: TextureDepthCompareFunction) {
    this._depthCompareFunction = value;
    this._invalidateSamplers();
  }

  private _invalidateSamplers(): void {
    this._samplers.filtering = this._samplers.comparison = this._samplers["non-filtering"] = undefined;
    this._mipSamplers?.clear();
  }

  /** @internal */
  get view(): GPUTextureView {
    return (this._view ??= this._gpuTexture.createView({ dimension: this._viewDimension }));
  }

  /** @internal Single-mip 2D view for WebGPU storage texture bindings (`image2D`). */
  storageView(): GPUTextureView {
    return (this._storageView ??= this._gpuTexture.createView({
      dimension: "2d",
      baseMipLevel: 0,
      mipLevelCount: 1
    }));
  }

  private _rangeView?: GPUTextureView;
  private _mipViews?: Map<number, GPUTextureView>;

  setMipLevelRange(first: number, last: number): void {
    if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || first < 0 || last < first)
      throw new RangeError("Invalid texture mip range.");
    const count = this._gpuTexture.mipLevelCount;
    const base = Math.min(first, count - 1);
    const end = Math.min(last, count - 1);
    if (!base && end === count - 1) {
      this._rangeView = undefined;
      return;
    }
    const key = base * count + end;
    const cache = (this._mipViews ??= new Map());
    let view = cache.get(key);
    if (!view) {
      view = this._gpuTexture.createView({
        dimension: this._viewDimension,
        baseMipLevel: base,
        mipLevelCount: end - base + 1,
        aspect: this._format.startsWith("depth") ? "depth-only" : "all"
      });
      cache.set(key, view);
    }
    this._rangeView = view;
  }

  sampleView(type: GPUTextureSampleType): GPUTextureView | undefined {
    if (this._format.startsWith("depth")) {
      return (
        this._rangeView ??
        (this._depthView ??= this._gpuTexture.createView({
          dimension: this._viewDimension,
          aspect: "depth-only"
        }))
      );
    }
    if (type === "depth") return undefined;
    if ((type === "sint") !== this._format.endsWith("sint") || (type === "uint") !== this._format.endsWith("uint"))
      return undefined;
    return this._rangeView ?? this.view;
  }

  getSampler(type: GPUSamplerBindingType, mipOffset?: number, mipCount?: number): GPUSampler {
    const levelKey =
      mipCount === undefined
        ? undefined
        : ((type === "filtering" ? 1 : type === "comparison" ? 2 : 3) * 32 + (mipOffset ?? 0)) * 32 + mipCount;
    let sampler = levelKey === undefined ? this._samplers[type] : this._mipSamplers?.get(levelKey);
    if (!sampler) {
      const nearest = type === "non-filtering" || this._filterMode === TextureFilterMode.Point;
      const anisotropy = nearest ? 1 : Math.min(16, Math.max(1, Math.floor(this._anisoLevel)));
      sampler = this._device._getSampler({
        addressModeU: WebGPUTexture._getAddressMode(this._wrapModeU),
        addressModeV: WebGPUTexture._getAddressMode(this._wrapModeV),
        minFilter: nearest ? "nearest" : "linear",
        magFilter: nearest ? "nearest" : "linear",
        mipmapFilter:
          !nearest && (this._filterMode === TextureFilterMode.Trilinear || anisotropy > 1) ? "linear" : "nearest",
        maxAnisotropy: anisotropy,
        lodMinClamp: mipOffset,
        lodMaxClamp: mipCount === undefined ? undefined : (mipOffset ?? 0) + mipCount - 1,
        compare: type === "comparison" ? WebGPUTexture._getCompareFunction(this.depthCompareFunction) : undefined
      });
      if (levelKey === undefined) this._samplers[type] = sampler;
      else (this._mipSamplers ??= new Map()).set(levelKey, sampler);
    }
    return sampler;
  }

  protected constructor(
    device: WebGPUGraphicDevice,
    texture: Texture,
    dimension: GPUTextureDimension,
    viewDimension: GPUTextureViewDimension,
    layerCount: number
  ) {
    this._device = device;
    this._texture = texture;
    this._layerCount = layerCount;
    this._viewDimension = viewDimension;
    this._format = WebGPUTexture._getFormat(texture.format, texture.isSRGBColorSpace);
    if (viewDimension === "2d" && !/^(depth|stencil)/.test(this._format)) {
      const { width, height } = texture;
      // The lowest set bit of the combined extents is their largest shared power-of-two divisor.
      const extents = width | height;
      const sharedScale = width && height ? extents & -extents : 1;
      const family = WebGPUTexture.arrayFormat(this._format);
      this._scaledArrayKey = [family, width / sharedScale, height / sharedScale].join("/");
      this._exactArrayKey = [family, "exact", texture.width, texture.height, texture.mipmapCount].join("/");
    }
    this._gpuTexture = device.device.createTexture({
      label: texture.name,
      size: {
        width: texture.width,
        height: texture.height,
        depthOrArrayLayers: layerCount
      },
      mipLevelCount: texture.mipmapCount,
      sampleCount: 1,
      dimension,
      format: this._format,
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.COPY_SRC |
        (device.supportsRenderTargetColorFormat(texture.format) || /^(depth|stencil)/.test(this._format)
          ? GPUTextureUsage.RENDER_ATTACHMENT
          : 0) |
        (dimension === "2d" && viewDimension === "2d" && WebGPUTexture._STORAGE_FORMATS.has(this._format)
          ? GPUTextureUsage.STORAGE_BINDING
          : 0)
    });
  }

  destroy(): void {
    this._rangeView = undefined;
    this._storageView = undefined;
    this._mipViews?.clear();
    this._invalidatePixels();
    this._device._retireTexture(this._gpuTexture);
  }

  generateMipmaps(): void {
    if (!this._device.supportsGenerateMipmaps(this._texture.format, this._texture.isSRGBColorSpace)) return;
    this._invalidatePixels();
    this._device._generateMipmaps(this._gpuTexture);
  }

  protected _writeTexture(
    colorBuffer: ArrayBufferView,
    mipLevel: number,
    origin: { x: number; y: number; z: number },
    width: number,
    height: number,
    depthOrArrayLayers: number
  ): void {
    this._invalidatePixels();
    const layout = WebGPUTexture._getTexelLayout(this._format);
    const packing = pixelPacking(this._texture.format);
    const byteLength =
      Math.ceil(width / layout.blockWidth) *
      Math.ceil(height / layout.blockHeight) *
      (packing?.bytes ?? layout.bytesPerBlock) *
      depthOrArrayLayers;
    this._validateRegion(mipLevel, origin.x, origin.y, origin.z, width, height, depthOrArrayLayers, layout);
    if (colorBuffer.byteLength < byteLength) throw new RangeError("Texture upload source is too small.");
    if (!byteLength) return;
    if (this._format.startsWith("depth") || this._format === "stencil8") {
      WebGPUDepthTransfer.forDevice(this._device).write(
        this._device,
        this._gpuTexture,
        this._texture.format,
        mipLevel,
        origin.z,
        origin.x,
        origin.y,
        width,
        height,
        depthOrArrayLayers,
        colorBuffer
      );
      return;
    }
    if (this._texture.format === TextureFormat.R11G11B10_UFloat)
      colorBuffer = packR11G11B10(colorBuffer, width * height * depthOrArrayLayers);
    if (packing) colorBuffer = unpackRGBA8(colorBuffer, width * height * depthOrArrayLayers, packing);
    this._device.flush();
    this._device.device.queue.writeTexture(
      { texture: this._gpuTexture, mipLevel, origin },
      colorBuffer,
      {
        bytesPerRow: Math.ceil(width / layout.blockWidth) * layout.bytesPerBlock,
        rowsPerImage: Math.ceil(height / layout.blockHeight)
      },
      {
        width: Math.ceil(width / layout.blockWidth) * layout.blockWidth,
        height: Math.ceil(height / layout.blockHeight) * layout.blockHeight,
        depthOrArrayLayers
      }
    );
  }

  protected _copyExternalImage(
    source: TexImageSource,
    mipLevel: number,
    origin: GPUOrigin3D,
    flipY: boolean,
    premultipliedAlpha: boolean
  ): void {
    this._invalidatePixels();
    const dimensions = WebGPUTexture._getExternalImageSize(source);
    this._device.flush();
    this._device.device.queue.copyExternalImageToTexture(
      { source, flipY },
      {
        texture: this._gpuTexture,
        mipLevel,
        origin,
        premultipliedAlpha
      },
      {
        width: dimensions.width,
        height: dimensions.height,
        depthOrArrayLayers: 1
      }
    );
  }

  /** @internal */
  _invalidatePixels(): void {
    this._contentRevision++;
    this._readablePixels?.clear();
  }

  makePixelBufferReadable(mipLevel: number, layer: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (
        !Number.isInteger(mipLevel) ||
        mipLevel < 0 ||
        mipLevel >= this._texture.mipmapCount ||
        !Number.isInteger(layer) ||
        layer < 0 ||
        layer >= this._layerCount
      )
        throw new RangeError("Invalid texture subresource.");
      const width = Math.max(1, this._texture.width >> mipLevel);
      const height = Math.max(1, this._texture.height >> mipLevel);
      const { blockWidth, blockHeight, bytesPerBlock } = WebGPUTexture._getTexelLayout(this._format);
      const bytes = readPixelBytes(this._texture.format, bytesPerBlock);
      const pixels = new Uint8Array(Math.ceil(width / blockWidth) * Math.ceil(height / blockHeight) * bytes);
      const revision = this._contentRevision;
      const cache = (this._readablePixels ??= new Map());
      resolve(
        this._readPixels(layer, 0, 0, width, height, mipLevel, pixels).then(() => {
          if (this._contentRevision !== revision) throw new Error("The texture changed during readback.");
          cache.set(layer * this._texture.mipmapCount + mipLevel, pixels);
        })
      );
    });
  }

  protected _readCachedPixels(
    layer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void {
    const cache = this._readablePixels?.get(layer * this._texture.mipmapCount + mipLevel);
    if (!cache)
      throw new Error(
        "Use getPixelBufferAsync() or complete makePixelBufferReadable() before synchronous texture readback."
      );
    const { blockWidth, blockHeight, bytesPerBlock } = WebGPUTexture._getTexelLayout(this._format);
    const bytes = readPixelBytes(this._texture.format, bytesPerBlock);
    const w = Math.max(1, this._texture.width >> mipLevel);
    const h = Math.max(1, this._texture.height >> mipLevel);
    const stride = Math.ceil(w / blockWidth) * bytes;
    const pitch = Math.ceil(width / blockWidth) * bytes;
    const rows = Math.ceil(height / blockHeight);
    if (
      x < 0 ||
      y < 0 ||
      width < 0 ||
      height < 0 ||
      x + width > w ||
      y + height > h ||
      x % blockWidth ||
      y % blockHeight ||
      out.byteLength < pitch * rows
    )
      throw new RangeError("Invalid texture readback rectangle or destination.");
    const destination = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
    let start = (y / blockHeight) * stride + (x / blockWidth) * bytes;
    for (let row = 0; row < rows; row++, start += stride)
      destination.set(cache.subarray(start, start + pitch), row * pitch);
  }

  protected _readPixels(
    layer: number,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): Promise<void> {
    let staging: GPUBuffer;
    return new Promise<void>((resolve) => {
      const layout = WebGPUTexture._getTexelLayout(this._format);
      const bytes = Math.ceil(width / layout.blockWidth) * layout.bytesPerBlock;
      const rows = Math.ceil(height / layout.blockHeight);
      const pitch = Math.ceil(bytes / 256) * 256;
      const packing = pixelPacking(this._texture.format);
      const dstPitch =
        Math.ceil(width / layout.blockWidth) * readPixelBytes(this._texture.format, layout.bytesPerBlock);
      if (out.byteLength < dstPitch * rows) throw new RangeError("Readback destination is too small.");
      this._validateRegion(mipLevel, x, y, layer, width, height, 1, layout);
      if (!rows || !bytes) {
        resolve();
        return;
      }
      if (this._format.startsWith("depth") || this._format === "stencil8") {
        resolve(
          WebGPUDepthTransfer.forDevice(this._device).read(
            this._device,
            this._gpuTexture,
            this._texture.format,
            mipLevel,
            layer,
            x,
            y,
            width,
            height,
            out
          )
        );
        return;
      }
      staging = this._device.device.createBuffer({
        size: rows * pitch,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
      });
      this._device
        ._getCommandEncoder()
        .copyTextureToBuffer(
          { texture: this._gpuTexture, mipLevel, origin: { x, y, z: layer } },
          { buffer: staging, bytesPerRow: pitch },
          { width: Math.ceil(width / layout.blockWidth) * layout.blockWidth, height: rows * layout.blockHeight }
        );
      this._device.flush();
      resolve(
        staging.mapAsync(GPUMapMode.READ).then(() => {
          const mapped = new Uint8Array(staging.getMappedRange());
          const dst = new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
          const srcView = new DataView(mapped.buffer),
            dstView = new DataView(out.buffer, out.byteOffset, out.byteLength);
          for (let i = 0; i < rows; i++) {
            if (expandReadRow(this._texture.format, srcView, i * pitch, dstView, i * dstPitch, width)) continue;
            if (packing?.bits) packRGBA8Row(mapped, i * pitch, dst, i * dstPitch, width, packing);
            else dst.set(mapped.subarray(i * pitch, i * pitch + bytes), i * dstPitch);
          }
        })
      );
    }).finally(() => staging?.destroy());
  }

  private _validateRegion(
    mip: number,
    x: number,
    y: number,
    layer: number,
    width: number,
    height: number,
    layers: number,
    layout: { blockWidth: number; blockHeight: number }
  ): void {
    const w = Math.max(1, this._texture.width >> mip),
      h = Math.max(1, this._texture.height >> mip);
    if (
      !Number.isInteger(mip) ||
      mip < 0 ||
      mip >= this._texture.mipmapCount ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(layer) ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      !Number.isInteger(layers) ||
      x < 0 ||
      y < 0 ||
      layer < 0 ||
      width < 0 ||
      height < 0 ||
      layers < 0 ||
      x + width > w ||
      y + height > h ||
      layer + layers > this._layerCount ||
      x % layout.blockWidth ||
      y % layout.blockHeight ||
      (width % layout.blockWidth && x + width !== w) ||
      (height % layout.blockHeight && y + height !== h)
    )
      throw new RangeError("Invalid texture subresource or region.");
  }

  /** @internal */
  static _getFormat(format: TextureFormat, srgb: boolean): GPUTextureFormat {
    const mapped = WebGPUTexture._findFormat(format, srgb);
    if (!mapped) throw new Error(`Texture format ${TextureFormat[format]} is not supported by the WebGPU backend.`);
    return mapped;
  }

  /** @internal */
  static _findFormat(format: TextureFormat, srgb: boolean): GPUTextureFormat | undefined {
    switch (format) {
      case TextureFormat.R16_UNorm:
        return "r16unorm";
      case TextureFormat.R16G16_SFloat:
        return "rg16float";
      case TextureFormat.R32_SFloat:
        return "r32float";
      case TextureFormat.R32G32_SFloat:
        return "rg32float";
      case TextureFormat.Stencil:
        return "stencil8";
      case TextureFormat.R8G8B8_UNorm:
      case TextureFormat.R4G4B4A4_UNorm:
      case TextureFormat.R5G5B5A1_UNorm:
      case TextureFormat.R5G6B5_UNorm:
      case TextureFormat.R8G8B8A8_UNorm:
        return srgb ? "rgba8unorm-srgb" : "rgba8unorm";
      case TextureFormat.R16G16B16A16_SFloat:
        return "rgba16float";
      case TextureFormat.R32G32B32A32_SFloat:
        return "rgba32float";
      case TextureFormat.R32G32B32A32_UInt:
        return "rgba32uint";
      case TextureFormat.R11G11B10_UFloat:
        return "rg11b10ufloat";
      case TextureFormat.R8_UNorm:
        return "r8unorm";
      case TextureFormat.R8G8_UNorm:
        return "rg8unorm";
      case TextureFormat.R16_SFloat:
        return "r16float";
      case TextureFormat.BC1:
        return srgb ? "bc1-rgba-unorm-srgb" : "bc1-rgba-unorm";
      case TextureFormat.BC3:
        return srgb ? "bc3-rgba-unorm-srgb" : "bc3-rgba-unorm";
      case TextureFormat.BC7:
        return srgb ? "bc7-rgba-unorm-srgb" : "bc7-rgba-unorm";
      case TextureFormat.BC6H:
        return "bc6h-rgb-ufloat";
      case TextureFormat.ETC2_RGB:
      case TextureFormat.ETC1_RGB:
        return srgb ? "etc2-rgb8unorm-srgb" : "etc2-rgb8unorm";
      case TextureFormat.ETC2_RGBA5:
        return srgb ? "etc2-rgb8a1unorm-srgb" : "etc2-rgb8a1unorm";
      case TextureFormat.ETC2_RGBA8:
        return srgb ? "etc2-rgba8unorm-srgb" : "etc2-rgba8unorm";
      case TextureFormat.ASTC_4x4:
        return srgb ? "astc-4x4-unorm-srgb" : "astc-4x4-unorm";
      case TextureFormat.ASTC_5x5:
        return srgb ? "astc-5x5-unorm-srgb" : "astc-5x5-unorm";
      case TextureFormat.ASTC_6x6:
        return srgb ? "astc-6x6-unorm-srgb" : "astc-6x6-unorm";
      case TextureFormat.ASTC_8x8:
        return srgb ? "astc-8x8-unorm-srgb" : "astc-8x8-unorm";
      case TextureFormat.ASTC_10x10:
        return srgb ? "astc-10x10-unorm-srgb" : "astc-10x10-unorm";
      case TextureFormat.ASTC_12x12:
        return srgb ? "astc-12x12-unorm-srgb" : "astc-12x12-unorm";
      case TextureFormat.Depth:
      case TextureFormat.Depth32:
        return "depth32float";
      case TextureFormat.Depth16:
        return "depth16unorm";
      case TextureFormat.DepthStencil:
      case TextureFormat.Depth24Stencil8:
        return "depth24plus-stencil8";
      case TextureFormat.Depth24:
        return "depth24plus";
      case TextureFormat.Depth32Stencil8:
        return "depth32float-stencil8";
    }
  }

  private static _getAddressMode(mode: TextureWrapMode): GPUAddressMode {
    switch (mode) {
      case TextureWrapMode.Repeat:
        return "repeat";
      case TextureWrapMode.Mirror:
        return "mirror-repeat";
      default:
        return "clamp-to-edge";
    }
  }

  private static _getCompareFunction(compare: TextureDepthCompareFunction): GPUCompareFunction {
    return (
      [
        "never",
        "less",
        "equal",
        "less-equal",
        "greater",
        "not-equal",
        "greater-equal",
        "always"
      ] as GPUCompareFunction[]
    )[compare];
  }

  static _getTexelLayout(format: GPUTextureFormat): {
    bytesPerBlock: number;
    blockWidth: number;
    blockHeight: number;
  } {
    if (format.startsWith("bc1") || format.startsWith("etc2-rgb8") || format.startsWith("etc2-rgb8a1")) {
      return { bytesPerBlock: 8, blockWidth: 4, blockHeight: 4 };
    }
    if (format.startsWith("bc") || format.startsWith("etc2-rgba8") || format.startsWith("astc-4x4")) {
      return { bytesPerBlock: 16, blockWidth: 4, blockHeight: 4 };
    }
    const astcMatch = /^astc-(\d+)x(\d+)/.exec(format);
    if (astcMatch) {
      return {
        bytesPerBlock: 16,
        blockWidth: Number(astcMatch[1]),
        blockHeight: Number(astcMatch[2])
      };
    }
    switch (format) {
      case "stencil8":
      case "r8unorm":
        return { bytesPerBlock: 1, blockWidth: 1, blockHeight: 1 };
      case "rg8unorm":
      case "r16unorm":
      case "r16float":
      case "depth16unorm":
        return { bytesPerBlock: 2, blockWidth: 1, blockHeight: 1 };
      case "depth32float-stencil8":
      case "rgba16float":
      case "rg32float":
        return { bytesPerBlock: 8, blockWidth: 1, blockHeight: 1 };
      case "rgba32float":
      case "rgba32uint":
        return { bytesPerBlock: 16, blockWidth: 1, blockHeight: 1 };
      default:
        return { bytesPerBlock: 4, blockWidth: 1, blockHeight: 1 };
    }
  }

  private static _getExternalImageSize(source: TexImageSource): { width: number; height: number } {
    if ("codedWidth" in source) {
      return { width: source.codedWidth, height: source.codedHeight };
    }
    if ("videoWidth" in source && source.videoWidth) {
      return { width: source.videoWidth, height: source.videoHeight };
    }
    return { width: source.width, height: source.height };
  }
}
