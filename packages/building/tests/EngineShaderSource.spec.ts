import { describe, expect, it } from "vitest";
import { engineShaderSource } from "../src/building/runtime/EngineShaderSource";

describe("engineShaderSource", () => {
  it("prunes unreferenced std140 fields and deduplicates shared uvec4 texelFetches", () => {
    const input = `#version 300 es
layout(std140) uniform MaterialData {
  float a;
  float b;
  vec2 c;
  vec4 unused_vec;
  uint flags;
  int count;
  bool enabled;
} material_data;
layout(std140) uniform UnusedBlock {
  vec4 deadField;
} unused_block;
void original_main(){
  // material_data.unused_vec mentioned only in comment must stay pruned
  float x = material_data.a + material_data.b + material_data.c.x + float(material_data.flags) + float(material_data.count) + (material_data.enabled ? 1.0 : 0.0);
}
void main(){original_main();}`;

    const { source, blocks } = engineShaderSource(input);
    expect(blocks.map((b) => b.name)).toEqual(["MaterialData", "UnusedBlock"]);

    // Unused block skips emitting a reader and initializer entirely.
    expect(source).not.toContain("read_uniform_UnusedBlock");
    // Unreferenced field is pruned even though it appeared in a comment.
    expect(source).not.toContain("material_data.unused_vec=");
    expect(source).toContain("read_uniform_MaterialData();");

    // Fields a (0), b (4), c (8..15) share texel 0; unused_vec is texel 1 (skipped);
    // flags (32), count (36), enabled (40) share texel 2.
    const fetches = source.match(/texelFetch\(uniform_MaterialData,/g) ?? [];
    expect(fetches).toHaveLength(2);
    expect(source).toContain("uvec4 es_t0=texelFetch(uniform_MaterialData,ivec2(0%es_s.x,0/es_s.x),0);");
    expect(source).toContain("uvec4 es_t2=texelFetch(uniform_MaterialData,ivec2(2%es_s.x,2/es_s.x),0);");
    expect(source).not.toContain("es_t1");
    // GLSL ES 3.00 reserves identifiers containing consecutive underscores (`__`).
    expect(source).not.toMatch(/__/);

    // Verify scalar type conversions for uint, int, bool, float, vec2.
    expect(source).toContain("material_data.a=uintBitsToFloat(es_t0.x);");
    expect(source).toContain("material_data.b=uintBitsToFloat(es_t0.y);");
    expect(source).toContain("material_data.c=vec2(uintBitsToFloat(es_t0.z),uintBitsToFloat(es_t0.w));");
    expect(source).toContain("material_data.flags=es_t2.x;");
    expect(source).toContain("material_data.count=int(es_t2.y);");
    expect(source).toContain("material_data.enabled=(es_t2.z!=0u);");
  });

  it("unpacks all fields when a uniform block variable has a bare reference", () => {
    const input = `#version 300 es
layout(std140) uniform FrameData {
  vec4 first;
  vec4 second;
} frame_data;
vec4 helper(Engine_FrameData d){ return d.first + d.second; }
void original_main(){
  vec4 v = helper(frame_data);
}
void main(){original_main();}`;

    const { source } = engineShaderSource(input);
    expect(source).toContain("frame_data.first=");
    expect(source).toContain("frame_data.second=");
  });

  it("honors row_major matrix layout and avoids shadowing local helper names", () => {
    const input = `#version 300 es
layout(std140) uniform ViewBlock {
  layout(row_major) mat4 view_to_world;
  mat2 col_mat;
} _s;
void original_main(){
  vec4 p = _s.view_to_world * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 q = _s.col_mat * p.xy;
}
void main(){original_main();}`;

    const { source } = engineShaderSource(input);
    // Uses es_s / es_tN (no reserved `__`) so block variable named _s is not shadowed.
    expect(source).toContain("ivec2 es_s=textureSize(uniform_ViewBlock,0);");
    expect(source).toContain("_s.view_to_world=mat4(");
    // Row-major mat4 column 0 reads word offsets 0, 4, 8, 12 -> texels 0.x, 1.x, 2.x, 3.x.
    expect(source).toContain(
      "_s.view_to_world=mat4(uintBitsToFloat(es_t0.x),uintBitsToFloat(es_t1.x),uintBitsToFloat(es_t2.x),uintBitsToFloat(es_t3.x),"
    );
    // Column-major mat2 starts at texel 4 (offset 64): col0 = (t4.x, t4.y), col1 = (t5.x, t5.y).
    expect(source).toContain(
      "_s.col_mat=mat2(uintBitsToFloat(es_t4.x),uintBitsToFloat(es_t4.y),uintBitsToFloat(es_t5.x),uintBitsToFloat(es_t5.y));"
    );
  });
});
