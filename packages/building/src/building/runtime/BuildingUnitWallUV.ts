import {
  Buffer,
  BufferBindFlag,
  BufferUsage,
  Vector2,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat,
  type BufferMesh,
  type Engine,
  type ShaderData
} from "@galacean/engine";
import { restoreBuffer } from "@galacean/engine-project/rendering/RestorableResources";
import { createWallUvProjector, type BuildingWallBakeBinding, type WallUvProjection } from "./BuildingWallBakeBinding";
import wallBake from "./BuildingWallBake.glsl?raw";
import { constructionLampControlGLSL } from "./ConstructionLanternShader";

const plane = "renderer_WallUnitPlane";
const face = "renderer_WallUnitFace";
const dark = "renderer_WallUnitDark";
const limits = "renderer_WallUnitBounds";
const sharedChart = "RENDERER_MASONRY_UNIT_SHARED_CHART";
const clampToChart = "RENDERER_MASONRY_UNIT_CLAMP";

interface ProjectionStream {
  buffer: Buffer;
  data: Float32Array;
  previous: (Float32Array | undefined)[];
}

/** Each native instance projects its deformed vertices into one facade chart. A
 * draw on one chart needs only uniforms; mixed charts follow the visible ID list. */
export class BuildingUnitWallUV {
  byteLength = 0;
  private readonly rows = new Map<number, Float32Array>();
  private readonly stride: number;
  private readonly shared?: Float32Array;
  private readonly streams: ProjectionStream[] = [];

  constructor(
    private readonly engine: Engine,
    binding: BuildingWallBakeBinding,
    centers: Float32Array,
    private readonly ids: Uint32Array
  ) {
    this.stride = binding.texture.unbounded ? 9 : 13;
    const projector = createWallUvProjector(binding);
    const charts = new Map<WallUvProjection, Float32Array>();
    for (const id of ids) {
      const c = 4 * id;
      if (id > 0xffffff || c + 2 >= centers.length) throw Error("Invalid wall projection instance ID");
      const chart = projector.select(centers[c], centers[c + 1], centers[c + 2], 0, 0, 0);
      let row = charts.get(chart);
      if (!row) {
        row = new Float32Array(this.stride);
        row.set([
          chart.u[0],
          chart.u[2],
          chart.u[3],
          chart.v[3],
          chart.v[1],
          chart.normal[0],
          chart.normal[2],
          ...chart.darkUV
        ]);
        if (!binding.texture.unbounded) row.set(chart.bounds, 9);
        charts.set(chart, row);
      }
      this.rows.set(id, row);
    }
    if (charts.size === 1) {
      this.shared = this.rows.get(ids[0]);
      this.rows.clear();
    }
  }

  bind(data: ShaderData) {
    if (this.stride === 13) data.enableMacro(clampToChart);
    else data.disableMacro(clampToChart);
    if (this.shared) {
      data.enableMacro(sharedChart);
      data.setVector4(plane, new Vector4().copyFromArray(this.shared));
      data.setVector3(face, new Vector3().copyFromArray(this.shared, 4));
      data.setVector2(dark, new Vector2().copyFromArray(this.shared, 7));
      if (this.stride === 13) data.setVector4(limits, new Vector4().copyFromArray(this.shared, 9));
    } else data.disableMacro(sharedChart);
  }

  attach(mesh: BufferMesh, level: number) {
    if (this.shared) return;
    const data = new Float32Array(this.ids.length * this.stride);
    const buffer = restoreBuffer(
      new Buffer(this.engine, BufferBindFlag.VertexBuffer, data, BufferUsage.Dynamic, false),
      data
    );
    this.streams[level] = { data, buffer, previous: new Array(this.ids.length) };
    this.byteLength += data.byteLength;
    const slot = mesh.vertexBufferBindings.length;
    mesh.setVertexBufferBinding(buffer, this.stride * 4, slot);
    const elements = [
      ...mesh.vertexElements,
      new VertexElement(plane, 0, VertexElementFormat.Vector4, slot, 1),
      new VertexElement(face, 16, VertexElementFormat.Vector3, slot, 1),
      new VertexElement(dark, 28, VertexElementFormat.Vector2, slot, 1)
    ];
    if (this.stride === 13) elements.push(new VertexElement(limits, 36, VertexElementFormat.Vector4, slot, 1));
    mesh.setVertexElements(elements);
  }

  update(level: number, ids: Uint32Array, count: number): number {
    if (this.shared) return 0;
    const { data, buffer, previous } = this.streams[level];
    let first = count,
      last = -1;
    for (let i = 0; i < count; i++) {
      const row = this.rows.get(ids[i]);
      if (!row) throw Error("Visible unit outside wall projection partition");
      if (previous[i] === row) continue;
      previous[i] = row;
      data.set(row, i * this.stride);
      first = Math.min(first, i);
      last = i;
    }
    if (last < first) return 0;
    const offset = first * this.stride,
      length = (last - first + 1) * this.stride;
    buffer.setData(data, offset * 4, offset, length);
    return length * 4;
  }

  destroy() {
    for (const stream of this.streams) stream?.buffer.destroy();
  }
}

export function residentWallUvVertex(source: string, unitFamily?: string) {
  let input = "layout(location=13) in vec2 masonryLightmapUV;";
  let uv = "";
  if (unitFamily) {
    // The instance stream contains original IDs even after the LOD selector reorders it.
    const read = unitFamily === "brick" ? "read_material_data_instance_list" : "read_nani_instance_indirection_buffer";
    const re = new RegExp("uint " + read + "\\s*\\(int \\w+\\)\\s*\\{[^}]*\\}");
    if (!re.test(source)) throw Error("Missing native unit indirection: " + read);
    source =
      "in highp float masonryUnitID;\n" + source.replace(re, "uint " + read + "(int i){return uint(masonryUnitID);}");
    input = `
#ifdef ${sharedChart}
  #define MASONRY_PROJECTION_INPUT uniform
#else
  #define MASONRY_PROJECTION_INPUT in
#endif
MASONRY_PROJECTION_INPUT highp vec4 ${plane};
MASONRY_PROJECTION_INPUT highp vec3 ${face};
MASONRY_PROJECTION_INPUT highp vec2 ${dark};
#ifdef ${clampToChart}
MASONRY_PROJECTION_INPUT highp vec4 ${limits};
#endif
`;
    uv = `
  highp vec3 masonryPosition = ${unitFamily === "brick" ? "v2" : "v0"};
  highp vec3 masonryNormal = normalize(v1);
  highp vec2 masonryLightmapUV = vec2(dot(${plane}.xy, masonryPosition.xz) + ${plane}.z,
                                      ${face}.x * masonryPosition.y + ${plane}.w);
  #ifdef ${clampToChart}
    masonryLightmapUV = clamp(masonryLightmapUV, ${limits}.xy, ${limits}.zw);
  #endif
  if (!(abs(masonryNormal.y) < 0.75 && dot(masonryNormal.xz, ${face}.yz) >= 0.12)) masonryLightmapUV = ${dark};
`;
  }
  return (
    `
${input}
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
${uv}
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
