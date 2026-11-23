import type { WebGPUGraphicDevice } from "./WebGPUGraphicDevice";
import { WebGPUTexture } from "./WebGPUTexture";

interface ArrayEntry {
  texture: GPUTexture;
  view: GPUTextureView;
  sources: (GPUTexture | undefined)[];
  revisions: number[];
}

/** Physical array backing for sampled 2D textures in a shader variant that exceeds device binding limits. */
export class WebGPUTextureArrayCache {
  // Keep two material sets resident. Alternating between more sets reuses a compatible allocation in command order.
  private readonly _entries: ArrayEntry[] = [];
  private _recent?: ArrayEntry;

  constructor(private readonly _hardware: WebGPUGraphicDevice) {}

  get(textures: readonly WebGPUTexture[]): GPUTextureView {
    if (!textures.length) throw new Error("A packed texture binding needs at least one source.");
    const recent = this._recent;
    if (recent && recent.sources.length === textures.length) {
      let unchanged = true;
      for (let i = 0; i < textures.length; i++)
        if (recent.sources[i] !== textures[i]._gpuTexture || recent.revisions[i] !== textures[i]._contentRevision) {
          unchanged = false;
          break;
        }
      if (unchanged) return recent.view;
    }
    const first = textures[0]._gpuTexture;
    let base = first;
    for (let i = 1; i < textures.length; i++)
      if (textures[i]._gpuTexture.width > base.width) base = textures[i]._gpuTexture;
    let mipCount = 0;
    let format = first.format;
    const family = WebGPUTexture.arrayFormat(format);
    for (const source of textures) {
      const texture = source._gpuTexture,
        offset = Math.log2(base.width / texture.width);
      if (
        !Number.isInteger(offset) ||
        base.height >> offset !== texture.height ||
        base.height / texture.height !== 2 ** offset ||
        WebGPUTexture.arrayFormat(texture.format) !== family ||
        texture.sampleCount !== 1 ||
        texture.dimension !== "2d" ||
        texture.depthOrArrayLayers !== 1 ||
        !(texture.usage & GPUTextureUsage.COPY_SRC)
      ) {
        throw new Error(
          "Packed texture sources require one physical format and dimensions related by a common power of two."
        );
      }
      mipCount = Math.max(mipCount, offset + texture.mipLevelCount);
      if (texture.format !== first.format) format = family;
    }
    let entry: ArrayEntry | undefined;
    let compatible: ArrayEntry | undefined;
    for (let i = 0; i < this._entries.length; i++) {
      const candidate = this._entries[i];
      const allocation = candidate.texture;
      if (
        allocation.width !== base.width ||
        allocation.height !== base.height ||
        allocation.format !== format ||
        allocation.mipLevelCount !== mipCount ||
        allocation.depthOrArrayLayers !== textures.length
      )
        continue;
      let identical = true;
      for (let j = 0; j < textures.length; j++)
        if (candidate.sources[j] !== textures[j]._gpuTexture) {
          identical = false;
          break;
        }
      if (identical) {
        entry = candidate;
        break;
      }
      if (candidate !== this._recent || !compatible) compatible = candidate;
    }
    if (!entry) {
      if (this._entries.length >= 2) {
        entry = compatible;
        if (!entry) {
          const old = this._entries[0] === this._recent ? 1 : 0;
          this._hardware._retireTexture(this._entries[old].texture);
          this._entries.splice(old, 1);
        }
      }
      if (!entry) {
        const texture = this._hardware.device.createTexture({
          label: "Material texture array",
          size: { width: base.width, height: base.height, depthOrArrayLayers: textures.length },
          format,
          mipLevelCount: mipCount,
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            (format === "rgba8unorm" ? GPUTextureUsage.RENDER_ATTACHMENT : 0)
        });
        entry = { texture, view: texture.createView({ dimension: "2d-array" }), sources: [], revisions: [] };
        this._entries.push(entry);
      }
    }

    let encoder: GPUCommandEncoder | undefined;
    for (let layer = 0; layer < textures.length; layer++) {
      const source = textures[layer];
      const texture = source._gpuTexture;
      if (entry.sources[layer] === texture && entry.revisions[layer] === source._contentRevision) continue;
      const mipOffset = Math.log2(base.width / texture.width);
      encoder ??= this._hardware._getCommandEncoder();
      const { blockWidth, blockHeight } = WebGPUTexture._getTexelLayout(texture.format);
      for (let mip = 0; mip < texture.mipLevelCount; mip++) {
        if (texture.format !== format) {
          this._hardware._expandTextureChannels(texture, mip, entry.texture, mip + mipOffset, layer);
          continue;
        }
        const width = Math.ceil(Math.max(1, texture.width >> mip) / blockWidth) * blockWidth;
        const height = Math.ceil(Math.max(1, texture.height >> mip) / blockHeight) * blockHeight;
        encoder.copyTextureToTexture(
          { texture, mipLevel: mip },
          { texture: entry.texture, mipLevel: mip + mipOffset, origin: { z: layer } },
          { width, height }
        );
      }
      entry.sources[layer] = texture;
      entry.revisions[layer] = source._contentRevision;
    }
    this._recent = entry;
    return entry.view;
  }

  destroy(): void {
    for (const entry of this._entries) this._hardware._retireTexture(entry.texture);
    this._entries.length = 0;
    this._recent = undefined;
  }
}
