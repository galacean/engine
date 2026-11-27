import type { IShaderUniformBlock } from "@galacean/engine-design";
import type { Engine } from "../Engine";
import { Buffer } from "../graphic/Buffer";
import { BufferBindFlag } from "../graphic/enums/BufferBindFlag";
import { BufferUsage } from "../graphic/enums/BufferUsage";
import type { IPlatformBuffer } from "../renderingHardwareInterface/IPlatformBuffer";
import { ShaderData } from "./ShaderData";
import { RendererUniformCache } from "./RendererUniformCache";
import { RendererUniformKey } from "./RendererUniformKey";
import { Std140FieldWriter } from "./Std140FieldWriter";
import { ShaderProperty } from "./ShaderProperty";
import { ShaderDataGroup } from "./enums/ShaderDataGroup";

/** Engine-owned, reference-counted storage for one compiler-defined std140 layout. */
export class GlobalUniformBlock {
  static acquire(engine: Engine, layout: IShaderUniformBlock, binding: number): GlobalUniformBlock {
    const cache = (engine._globalUniformBlocks ??= new Map());
    // Constructed at program link, never during drawing. Different shaders may declare
    // different layouts with the same block name, including the same total byte length.
    const key = JSON.stringify([
      layout.name,
      binding,
      layout.byteLength,
      ...layout.members.map((m) => [m.name, m.type, m.offset, m.arrayLength, m.arrayStride, m.matrixStride])
    ]);
    let block = cache.get(key);
    if (!block) {
      block = new GlobalUniformBlock(engine, layout, binding, key);
      cache.set(key, block);
    }
    block._references++;
    return block;
  }

  private _references = 0;
  private readonly _fields: UniformBlockField[];
  private readonly _group: ShaderDataGroup;
  private readonly _staging: Uint32Array;
  private readonly _previous: Uint32Array;
  private readonly _materialRanges?: { words: Uint32Array; offset: number }[];
  private readonly _cacheRendererValues: boolean;
  private readonly _rendererKey?: RendererUniformKey;
  private _nextMaterialRange = 0;
  private _rendererRanges?: RendererUniformCache;
  private readonly _stride: number;
  private readonly _buffer: Buffer;
  private readonly _largeMatrixArray?: {
    field: UniformBlockField;
    end: number;
    platform?: IPlatformBuffer;
    revision?: number;
  };
  private _offset = -1;

  private constructor(
    private readonly _engine: Engine,
    layout: IShaderUniformBlock,
    private readonly _binding: number,
    private readonly _key: string
  ) {
    const rhi = _engine._hardwareRenderer;
    const size = layout.byteLength;
    if (size <= 0 || size % 16 !== 0 || size > rhi.maxUniformBlockSize) {
      throw new Error(`Uniform block ${layout.name} has unsupported byte length ${size}.`);
    }
    const data = new ArrayBuffer(size);
    const floats = new Float32Array(data);
    const integers = new Int32Array(data);
    this._staging = new Uint32Array(data);
    this._previous = new Uint32Array(size / 4);
    // A compact per-draw block can contain both transform matrices and material values.
    this._cacheRendererValues = layout.name === "Auto" && size <= 256;
    if (this._cacheRendererValues) this._rendererKey = RendererUniformKey.create(layout);
    // Retain at most 1 KiB of extra packed values for small automatically grouped blocks.
    if (layout.name === "Auto" && size <= 128) {
      this._materialRanges = Array.from({ length: 8 }, () => ({ words: new Uint32Array(size / 4), offset: -1 }));
    }
    this._group =
      layout.name === "Scene"
        ? ShaderDataGroup.Scene
        : layout.name === "Camera"
          ? ShaderDataGroup.Camera
          : ShaderDataGroup.None;
    this._fields = layout.members.map(({ name, type, arrayLength, arrayStride, matrixStride, offset }) => {
      const writer = new Std140FieldWriter(type, arrayLength, arrayStride, matrixStride);
      const property = ShaderProperty.getByName(name);
      return {
        property,
        overrideGroups: property._builtinGlobalGroup === this._group ? ~this._group : 0,
        writer,
        view: writer.useIntView ? integers : floats,
        offset: offset / 4
      };
    });
    const alignment = rhi.uniformBufferOffsetAlignment;
    this._stride = Math.ceil(size / alignment) * alignment;
    const slots = Math.max(2, Math.floor(16384 / this._stride));
    this._buffer = new Buffer(_engine, BufferBindFlag.ConstantBuffer, this._stride * slots, BufferUsage.Dynamic);
    this._buffer.isGCIgnored = true;
    if (layout.name === "Auto" && this._buffer._platformBuffer.writeUniformArrayRange) {
      // A short packed mat4[] owns a known-zero suffix. Other fields may follow it in the same block.
      let largest = 0;
      for (let i = 0; i < layout.members.length; i++) {
        const member = layout.members[i];
        if (
          member.type === "mat4" &&
          member.arrayStride === 64 &&
          member.matrixStride === 16 &&
          member.arrayLength >= 128 &&
          member.arrayLength > largest
        ) {
          largest = member.arrayLength;
          const field = this._fields[i];
          this._largeMatrixArray = { field, end: field.offset + largest * 16 };
        }
      }
    }
  }

  bind(
    scene: ShaderData | undefined,
    camera: ShaderData | undefined,
    renderer?: ShaderData,
    material?: ShaderData,
    element?: ShaderData
  ): void {
    const owner = renderer?._rendererId;
    const key = owner ? this._rendererKey?.read(renderer!, material) : undefined;
    if (key && this._rendererRanges?.bindUnchanged(owner!, key)) return;
    const fields = this._fields;
    const values = (this._group === ShaderDataGroup.Scene ? scene : camera)?._propertyValueMap;
    let groups = ShaderDataGroup.None;
    let hasRendererValue = false;
    for (let i = 0; i < fields.length; ++i) {
      const field = fields[i];
      const property = field.property;
      const id = property._uniqueId;
      groups |= property._groups;
      const value =
        this._group === ShaderDataGroup.None || property._groups & field.overrideGroups
          ? ShaderData._findValue(id, scene, camera, renderer, material, element, property._groups)
          : values?.[id];
      if (
        value != null &&
        property._groups & ShaderDataGroup.Renderer &&
        (property._groups === ShaderDataGroup.Renderer ||
          (renderer?._propertyValueMap[id] != null && element?._propertyValueMap[id] == null))
      ) {
        hasRendererValue = true;
      }
      field.writer.write(field.view, field.offset, value);
    }

    if (this._cacheRendererValues && hasRendererValue && owner) {
      const ranges = (this._rendererRanges ??= new RendererUniformCache(
        this._engine,
        this._binding,
        this._stride,
        this._rendererKey?.values.length
      ));
      if (ranges.bind(owner, this._staging, key)) return;
    }
    const array = this._largeMatrixArray;
    let zeroStart = 0;
    if (array) {
      const { property, offset } = array.field;
      const value = ShaderData._findValue(
        property._uniqueId,
        scene,
        camera,
        renderer,
        material,
        element,
        property._groups
      );
      zeroStart =
        value == null ? offset : value instanceof Float32Array ? Math.min(offset + value.length, array.end) : array.end;
    }
    this._bindRange(groups === ShaderDataGroup.Material, zeroStart);
  }

  release(): void {
    if (--this._references === 0) {
      this._engine._globalUniformBlocks!.delete(this._key);
      this._rendererRanges?.destroy();
      this._buffer.destroy();
    }
  }

  private _bindRange(materialOnly: boolean, zeroStart: number): void {
    const { _buffer: buffer, _staging: staging, _materialRanges: ranges, _offset: last } = this;
    const contentLost = buffer.isContentLost;
    const array = this._largeMatrixArray;
    if (
      !contentLost &&
      last >= 0 &&
      (!array ||
        (array.platform === buffer._platformBuffer && array.revision === array.platform.uniformContentRevision))
    ) {
      if (this._matches(this._previous)) {
        buffer._bindUniformRange(this._binding, last, staging.byteLength);
        return;
      }
      if (materialOnly && ranges) {
        for (let i = 0; i < ranges.length; ++i) {
          const range = ranges[i];
          if (range.offset < 0) break;
          if (this._matches(range.words)) {
            buffer._bindUniformRange(this._binding, range.offset, staging.byteLength);
            return;
          }
        }
      }
    }

    let next = last < 0 ? 0 : last + this._stride;
    const wrap = next >= buffer.byteLength;
    let discard = wrap;
    if (wrap) {
      next = 0;
      const platform = buffer._platformBuffer;
      if (platform.restartUniformArena) {
        platform.restartUniformArena();
        discard = false;
      }
    }
    if ((wrap || contentLost) && ranges) {
      // All offsets refer to the old store, even when its contents match the current values.
      for (let i = 0; i < ranges.length; ++i) ranges[i].offset = -1;
      this._nextMaterialRange = 0;
    }
    buffer._bindUniformRange(this._binding, next, staging.byteLength, staging, discard, zeroStart, array?.end);
    if (array) {
      array.platform = buffer._platformBuffer;
      array.revision = array.platform.uniformContentRevision;
    }
    this._previous.set(staging);
    this._offset = next;
    if (materialOnly && ranges) {
      const range = ranges[this._nextMaterialRange];
      range.words.set(staging);
      range.offset = next;
      this._nextMaterialRange = (this._nextMaterialRange + 1) % ranges.length;
    }
  }

  private _matches(previous: Uint32Array): boolean {
    const staging = this._staging;
    for (let i = 0; i < staging.length; ++i) {
      if (staging[i] !== previous[i]) return false;
    }
    return true;
  }
}

/** Resolved once at program link. */
interface UniformBlockField {
  property: ShaderProperty;
  overrideGroups: number;
  writer: Std140FieldWriter;
  view: Float32Array | Int32Array;
  offset: number;
}
