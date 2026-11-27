import type { IWebGPUShaderOptions, IWebGPUShaderReflection, IWebGPUShaderTexture } from "@galacean/engine-design";
import { GLCapabilityType } from "../base/Constant";
import type { IHardwareRenderer, IPlatformShaderProgram } from "../renderingHardwareInterface";
import type { Texture } from "../texture/Texture";
import { TextureFormat } from "../texture/enums/TextureFormat";
import { ShaderData } from "./ShaderData";
import type { ShaderProgramMap } from "./ShaderProgramMap";
import { ShaderProperty } from "./ShaderProperty";

interface TextureSlot {
  layout: IWebGPUShaderTexture;
  property: ShaderProperty;
  name: string;
  fallback?: Texture;
  unfilterable: boolean;
  samplerClass: number;
  textureClass: number;
  arrayClass: number;
  width: number;
  height: number;
  mipCount: number;
  format: string;
}

export type ShaderTextureOptions = Pick<
  IWebGPUShaderOptions,
  "unfilterableTextures" | "samplerKeys" | "textureKeys" | "textureArrayKeys" | "textureExtents"
>;

function equivalenceClass<T>(value: T, seen: T[]): number {
  const index = seen.indexOf(value);
  if (index >= 0) return index;
  seen.push(value);
  return seen.length - 1;
}

/** Select the pipeline layout required by the actual textures supplied for this draw. */
export class ShaderTextureLayout {
  private readonly _slots: TextureSlot[] = [];
  private readonly _float32Filterable: boolean;
  private readonly _samplerIdentities?: object[];

  private readonly _textureIdentities?: (Texture | undefined)[];
  private readonly _arrayFormats?: string[];

  constructor(
    private readonly _device: IHardwareRenderer,
    reflection: IWebGPUShaderReflection,
    program: IPlatformShaderProgram
  ) {
    this._float32Filterable = _device.canIUse(GLCapabilityType.textureFloatLinear);
    if (reflection.requiresSamplerKeys) this._samplerIdentities = [];
    if (reflection.requiresTextureKeys) {
      this._textureIdentities = [];
      this._arrayFormats = [];
    }
    for (const layout of reflection.textures) {
      if (
        !reflection.requiresTextureKeys &&
        layout.sampleType !== "float" &&
        !(reflection.requiresSamplerKeys && layout.samplerBinding !== undefined)
      )
        continue;
      const property = ShaderProperty.getByName(layout.name);
      const value = program.uniforms.find((uniform) => uniform.propertyId === property._uniqueId)?.textureDefault;
      this._slots.push({
        layout,
        property,
        name: layout.arrayIndex === undefined ? layout.name : `${layout.name}[${layout.arrayIndex}]`,
        fallback: Array.isArray(value) ? value[layout.arrayIndex ?? 0] : value,
        unfilterable: false,
        samplerClass: -1,
        textureClass: -1,
        width: 0,
        height: 0,
        mipCount: 0,
        format: "",
        arrayClass: -1
      });
    }
  }

  select(
    base: ShaderProgramMap,
    scene?: ShaderData,
    camera?: ShaderData,
    renderer?: ShaderData,
    material?: ShaderData,
    element?: ShaderData
  ): ShaderProgramMap {
    const identities = this._samplerIdentities;
    let map = base;
    if (identities) {
      identities.length = 0;
      map = map.specialize("sampler classes");
    }
    const textures = this._textureIdentities;
    const formats = this._arrayFormats;
    if (textures) map = map.specialize("texture classes");
    for (const slot of this._slots) {
      const { layout, property } = slot;
      const value = ShaderData._findValue(
        property._uniqueId,
        scene,
        camera,
        renderer,
        material,
        element,
        property._groups
      );
      const supplied =
        layout.arrayIndex === undefined ? (value as Texture) : (value as Texture[] | undefined)?.[layout.arrayIndex];
      const texture = supplied && !supplied.destroyed ? supplied : slot.fallback;
      const format = texture?.format;
      slot.unfilterable =
        layout.sampleType === "float" &&
        !!texture &&
        (texture._isDepthTexture ||
          (!this._float32Filterable &&
            (format === TextureFormat.R32_SFloat ||
              format === TextureFormat.R32G32_SFloat ||
              format === TextureFormat.R32G32B32A32_SFloat)));
      if (slot.unfilterable) map = map.specialize(slot.name);
      if (identities && layout.samplerType && layout.samplerBinding !== undefined) {
        const sampler = this._device.getTextureSamplerKey!(
          texture,
          slot.unfilterable ? "non-filtering" : layout.samplerType
        );
        slot.samplerClass = equivalenceClass(sampler, identities);
        map = map.specialize(slot.samplerClass);
      }
      if (textures && formats) {
        slot.textureClass = equivalenceClass(texture, textures);
        const key = texture && this._device.getTextureArrayKey?.(texture);
        slot.arrayClass = key === undefined ? -1 : equivalenceClass(key, formats);
        slot.width = texture?.width ?? 0;
        slot.height = texture?.height ?? 0;
        slot.mipCount = texture?.mipmapCount ?? 0;
        slot.format = format === undefined ? "unbound" : TextureFormat[format];
        map = map
          .specialize(slot.textureClass)
          .specialize(slot.arrayClass)
          .specialize(slot.width)
          .specialize(slot.height)
          .specialize(slot.mipCount);
      }
    }
    // The partition is independent of resource identity. Do not retain the previous material.
    if (textures) textures.length = 0;
    if (formats) formats.length = 0;
    return map;
  }

  /** Materialize compiler inputs only on a variant cache miss. */
  options(): ShaderTextureOptions {
    const unfilterableTextures = new Set<string>();
    const samplerKeys: Record<string, string> | undefined = this._samplerIdentities ? Object.create(null) : undefined;
    const textureKeys: Record<string, string> | undefined = this._textureIdentities ? Object.create(null) : undefined;
    const textureArrayKeys: Record<string, string> | undefined = this._arrayFormats ? Object.create(null) : undefined;
    const textureExtents:
      | Record<string, { width: number; height: number; mipCount: number; format: string }>
      | undefined = this._arrayFormats ? Object.create(null) : undefined;
    for (const slot of this._slots) {
      if (textureExtents)
        textureExtents[slot.name] = {
          width: slot.width,
          height: slot.height,
          mipCount: slot.mipCount,
          format: slot.format
        };
      if (textureKeys) textureKeys[slot.name] = String(slot.textureClass);
      if (textureArrayKeys && slot.arrayClass >= 0) textureArrayKeys[slot.name] = String(slot.arrayClass);
      if (slot.unfilterable) unfilterableTextures.add(slot.name);
      if (samplerKeys && slot.samplerClass >= 0) samplerKeys[slot.name] = String(slot.samplerClass);
    }
    return { unfilterableTextures, samplerKeys, textureKeys, textureArrayKeys, textureExtents };
  }
}
