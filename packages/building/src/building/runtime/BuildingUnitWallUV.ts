import {
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  IndexFormat,
  VertexElement,
  VertexElementFormat,
  type Engine,
  type Material
} from "@galacean/engine";
import { restoreBuffer, restoreResource } from "@galacean/engine-project/rendering/RestorableResources";
import type { BuildingWallBakeBinding } from "./BuildingWallBakeBinding";
import { bakeUnitWallUV } from "./BuildingUnitWallUVFeedback";
import { constructionLampControlGLSL } from "./ConstructionLanternShader";
import wallBake from "./BuildingWallBake.glsl?raw";

const bufferSources = new WeakMap<Buffer, Uint8Array>();
/** Keep the same immutable input that the device-restoration recipe already owns. */
export function restoreUnitTemplateBuffer(buffer: Buffer, data: ArrayBuffer | ArrayBufferView) {
  bufferSources.set(
    buffer,
    ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data)
  );
  return restoreBuffer(buffer, data);
}
function templateBytes(buffer: Buffer) {
  const bytes = buffer.readable ? buffer.data : bufferSources.get(buffer);
  if (!bytes) throw Error("Building lightmap needs the readable native unit mesh");
  return bytes;
}

/** Static, original-ID-indexed geometry for the units inside the light footprint.
 * The native shader still deforms and shades the original template. Each lightmap UV
 * arrives directly as an ordinary vertex attribute. Culling only edits indices/fades. */
export class BuildingUnitWallUV {
  readonly mesh: BufferMesh;
  readonly baseIndexCount: number;
  byteLength = 0;
  private readonly buffers: Buffer[] = [];
  private readonly originalIndices: Uint32Array;
  private readonly vertices: number;
  private readonly offsets: Int32Array;
  private readonly ids: Int32Array;
  private readonly weights: Float32Array;
  private readonly indices: Uint32Array;
  private readonly indexBuffer: Buffer;
  private readonly fades: Float32Array;
  private readonly fadeBuffer: Buffer;

  constructor(
    engine: Engine,
    template: BufferMesh,
    source: string,
    family: string,
    material: Material,
    binding: BuildingWallBakeBinding,
    bounds: Float32Array,
    unitIDs: Uint32Array
  ) {
    const mesh = (this.mesh = new BufferMesh(engine));
    try {
      const elements = template.vertexElements.filter((e) => e.instanceStepRate === 0);
      const pos = template.vertexBufferBindings[elements[0].bindingIndex]!;
      const vertices = (this.vertices = pos.buffer.byteLength / pos.stride);
      if (!Number.isInteger(vertices) || vertices <= 0) throw Error("Invalid unit template vertex count");
      const ib = template.indexBufferBinding!;
      const bytes = templateBytes(ib.buffer),
        indexWidth = [1, 2, 4][ib.format];
      const indexView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.baseIndexCount = template.subMesh!.count;
      this.originalIndices = Uint32Array.from({ length: this.baseIndexCount }, (_, i) => {
        const j = (template.subMesh!.start + i) * indexWidth;
        return indexWidth === 1
          ? indexView.getUint8(j)
          : indexWidth === 2
            ? indexView.getUint16(j, true)
            : indexView.getUint32(j, true);
      });
      const alloc = (flag: BufferBindFlag, data: ArrayBufferView, usage = BufferUsage.Static) => {
        const buffer = new Buffer(engine, flag, data, usage, false);
        this.buffers.push(buffer);
        this.byteLength += data.byteLength;
        return restoreBuffer(buffer, data);
      };
      const copies = new Map<Buffer, Buffer>();
      const bindingIndices = new Map<number, number>();
      const attributes = elements.map((e) => {
        let index = bindingIndices.get(e.bindingIndex);
        if (index === undefined) {
          index = mesh.vertexBufferBindings.length;
          const from = template.vertexBufferBindings[e.bindingIndex]!;
          let to = copies.get(from.buffer);
          if (!to) {
            const byteLength = vertices * from.stride;
            const buffer = new Buffer(
              engine,
              BufferBindFlag.VertexBuffer,
              byteLength * unitIDs.length,
              BufferUsage.Static,
              false
            );
            this.buffers.push(buffer);
            this.byteLength += buffer.byteLength;
            const upload = () => {
              buffer.copyFromBuffer(from.buffer, 0, 0, byteLength);
              // GLES copyBufferSubData permits disjoint ranges of the same vertex buffer.
              // Double the populated prefix so initialization takes log2(unitCount) copies.
              for (let filled = byteLength; filled < buffer.byteLength; filled *= 2) {
                buffer.copyFromBuffer(buffer, 0, filled, Math.min(filled, buffer.byteLength - filled));
              }
            };
            upload();
            to = restoreResource(buffer, upload);
            copies.set(from.buffer, to);
          }
          mesh.setVertexBufferBinding(to, from.stride, index);
          bindingIndices.set(e.bindingIndex, index);
        }
        return new VertexElement(e.attribute, e.offset, e.format, index);
      });
      const count = unitIDs.length * vertices;
      const originalID = new Float32Array(count);
      this.offsets = new Int32Array(bounds.length / 4).fill(-1);
      unitIDs.forEach((id, i) => {
        originalID.fill(id, i * vertices, (i + 1) * vertices);
        this.offsets[id] = i;
      });
      const add = (name: string, buffer: Buffer, stride: number, fmt: VertexElementFormat) => {
        const index = mesh.vertexBufferBindings.length;
        mesh.setVertexBufferBinding(buffer, stride, index);
        attributes.push(new VertexElement(name, 0, fmt, index));
      };
      add("masonryUnitID", alloc(BufferBindFlag.VertexBuffer, originalID), 4, VertexElementFormat.Float);
      this.fades = new Float32Array(count).fill(1);
      this.fadeBuffer = alloc(BufferBindFlag.VertexBuffer, this.fades, BufferUsage.Dynamic);
      add("masonryUnitFade", this.fadeBuffer, 4, VertexElementFormat.Float);
      const uv = bakeUnitWallUV(engine, template, source, family, material, binding, bounds, vertices, unitIDs);
      this.buffers.push(uv);
      this.byteLength += uv.byteLength;
      add("masonryLightmapUV", uv, 8, VertexElementFormat.Vector2);
      mesh.setVertexElements(attributes);
      this.indices = new Uint32Array(unitIDs.length * this.baseIndexCount);
      this.indexBuffer = alloc(BufferBindFlag.IndexBuffer, this.indices, BufferUsage.Dynamic);
      mesh.setIndexBufferBinding(this.indexBuffer, IndexFormat.UInt32);
      mesh.addSubMesh(0, 0);
      mesh.instanceCount = 1;
      mesh.bounds.copyFrom(template.bounds);
      this.ids = new Int32Array(unitIDs.length).fill(-1);
      this.weights = new Float32Array(unitIDs.length).fill(1);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  update(ids: Uint32Array, weights: Float32Array, count: number): number {
    let first = count,
      last = -1,
      bytes = 0;
    // The original-ID slots are sorted by the partitioner; upload contiguous changed
    // fade runs. Geometry and UV buffers stay immutable when a camera moves.
    let fadeStart = -1,
      fadeEnd = -1;
    const flushFades = () => {
      if (fadeStart < 0) return;
      const start = fadeStart * this.vertices,
        length = (fadeEnd - fadeStart + 1) * this.vertices;
      this.fadeBuffer.setData(this.fades, start * 4, start, length);
      bytes += length * 4;
      fadeStart = fadeEnd = -1;
    };
    for (let i = 0; i < count; i++) {
      const id = ids[i],
        slot = this.offsets[id];
      if (slot < 0) throw Error("A wall UV unit was selected outside its lightmap partition");
      if (this.ids[i] !== id) {
        this.ids[i] = id;
        first = Math.min(first, i);
        last = i;
        const base = slot * this.vertices;
        for (let k = 0; k < this.baseIndexCount; k++)
          this.indices[i * this.baseIndexCount + k] = base + this.originalIndices[k];
      }
      const weight = weights[i];
      if (this.weights[slot] !== weight) {
        this.weights[slot] = weight;
        const offset = slot * this.vertices;
        this.fades.fill(weight, offset, offset + this.vertices);
        if (slot !== fadeEnd + 1) flushFades();
        if (fadeStart < 0) fadeStart = slot;
        fadeEnd = slot;
      }
    }
    flushFades();
    if (last >= first) {
      const start = first * this.baseIndexCount,
        length = (last - first + 1) * this.baseIndexCount;
      this.indexBuffer.setData(this.indices, start * 4, start, length);
      bytes += length * 4;
    }
    this.mesh.subMesh!.count = count * this.baseIndexCount;
    return bytes;
  }
  destroy() {
    this.mesh.destroy();
    for (const b of this.buffers) b.destroy();
  }
}

export function residentWallUvVertex(source: string, unitFamily?: string) {
  if (unitFamily) {
    // The expanded geometry carries the original source identity even after LOD reordering.
    const read = unitFamily === "brick" ? "read_material_data_instance_list" : "read_nani_instance_indirection_buffer";
    const re = new RegExp("uint " + read + "\\s*\\(int \\w+\\)\\s*\\{[^}]*\\}");
    if (!re.test(source)) throw Error("Missing native unit indirection: " + read);
    source =
      "in highp float masonryUnitID;\n" + source.replace(re, "uint " + read + "(int i){return uint(masonryUnitID);}");
  }
  return (
    `
layout(location=13) in vec2 masonryLightmapUV;
out highp vec2 v_masonryLightmapUV;
#ifdef RENDERER_MASONRY_WALL_LAYOUT
out highp vec4 v_masonryWallColorLayer;
out highp vec4 v_masonryWallBounds;
#ifdef RENDERER_MASONRY_WALL_OVERLAP
out highp vec4 v_masonryWallExtra;
#endif
${wallBake.replaceAll("texture2D(", "texture(")}
#endif
` +
    source.replace(
      "original_main();",
      `original_main();
#ifdef RENDERER_MASONRY_WALL_LAYOUT
  #ifdef RENDERER_MASONRY_WALL_OVERLAP
    v_masonryWallExtra = masonryWallProject(masonryLightmapUV,v_masonryLightmapUV,v_masonryWallColorLayer,v_masonryWallBounds);
  #else
    masonryWallProject(masonryLightmapUV,v_masonryLightmapUV,v_masonryWallColorLayer,v_masonryWallBounds);
  #endif
#else
  v_masonryLightmapUV=masonryLightmapUV;
#endif
`
    )
  );
}
export function residentWallUvFragment(source: string) {
  const wrapper = `
in highp vec2 v_masonryLightmapUV;
#ifdef RENDERER_MASONRY_WALL_LAYOUT
in highp vec4 v_masonryWallColorLayer;
in highp vec4 v_masonryWallBounds;
#ifdef RENDERER_MASONRY_WALL_OVERLAP
in highp vec4 v_masonryWallExtra;
#endif
#endif
${constructionLampControlGLSL}
${wallBake.replaceAll("texture2D(", "texture(")}
vec3 masonryWallLit(vec3 albedo, vec3 normalWS, vec3 positionWS, float roughness) {
  vec3 light = masonryResidentSceneLight(albedo, normalWS, positionWS, roughness);
#ifdef RENDERER_MASONRY_WALL_BAKE
  #ifdef RENDERER_MASONRY_WALL_LAYOUT
    vec3 baked = masonryWallSample(v_masonryLightmapUV,v_masonryWallColorLayer,v_masonryWallBounds);
    #ifdef RENDERER_MASONRY_WALL_OVERLAP
      baked += masonryWallAdditional(v_masonryWallExtra);
    #endif
    light += albedo * baked;
  #else
    light += albedo * masonryWallIrradiance(v_masonryLightmapUV);
  #endif
#endif
  return light;
}
`;
  return wrapper + source.replaceAll("masonryResidentSceneLight(", "masonryWallLit(");
}
