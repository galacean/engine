/** Adapt the recovered ES shader's read-only std140 blocks to engine-managed
 * integer textures. All field offsets follow std140; unsupported declarations
 * reject instead of guessing. Original deformation/clipping expressions remain.
 */
export interface UniformTextureBlock {
  name: string;
  sampler: string;
  byteLength: number;
}
interface Field {
  type: string;
  name: string;
  rowMajor: boolean;
}
interface Layout {
  align: number;
  size: number;
  fields?: Array<Field & { offset: number }>;
}
export function engineShaderSource(source: string) {
  // EngineResidentScene publishes the ordinary column-vector camera transform
  // (encoded as std140 row-major bytes). Storage order does not change the
  // multiplication convention: the recovered shaders use row-vector eye reads,
  // whereas our wood-cut shaders already use column-vector reads. Normalize the
  // recovered reads here, at the Engine ABI boundary, for BOTH shader stages.
  source = source.replaceAll(
    "vec4(0.0, 0.0, 0.0, 1.0) * current_view.view_to_world",
    "current_view.view_to_world * vec4(0.0, 0.0, 0.0, 1.0)"
  );
  // Share the compiler's local spatial domain with every recovered roof material.
  // Only address lookup changes; Hole48 and the native cubic predicate do not.
  const cell = /\((v0|world)\.xz\s*\+\s*vec2\(65\.0\)\)\s*\*\s*vec2\(0\.1153846085071563720703125\)/g;
  const adapted = source.replace(cell, "(($1.xz - renderer_DormerGrid.xy) * renderer_DormerGrid.zw)");
  const dormerUniform = adapted !== source ? "uniform highp vec4 renderer_DormerGrid;\n" : "";
  source = adapted;
  const definitions = new Map<string, string>(),
    layouts = new Map<string, Layout>();
  const parse = (body: string): Field[] =>
    body
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((s) => {
        const m = /^(?:layout\(row_major\)\s*)?(\w+)\s+(\w+)$/.exec(s);
        if (!m) throw Error("Unsupported reflected uniform declaration: " + s);
        return { type: m[1], name: m[2], rowMajor: s.startsWith("layout") };
      });
  for (const m of source.matchAll(/struct (\w+)\s*\{([^}]+)\};/g)) definitions.set(m[1], m[2]);
  const round = (x: number, a: number) => Math.ceil(x / a) * a;
  function layout(type: string): Layout {
    const prior = layouts.get(type);
    if (prior) return prior;
    if (["float", "uint", "int", "bool"].includes(type)) return { align: 4, size: 4 };
    const vector = /^[uib]?vec([234])$/.exec(type);
    if (vector) {
      const n = Number(vector[1]);
      return { align: n === 2 ? 8 : 16, size: n * 4 };
    }
    const matrix = /^mat([234])$/.exec(type);
    if (matrix) return { align: 16, size: Number(matrix[1]) * 16 };
    const body = definitions.get(type);
    if (!body) throw Error("Unsupported uniform type " + type);
    let offset = 0,
      align = 16;
    const members = parse(body).map((f) => {
      const l = layout(f.type);
      align = Math.max(align, l.align);
      offset = round(offset, l.align);
      const member = { ...f, offset };
      offset += l.size;
      return member;
    });
    const result = { align, size: round(offset, align), fields: members };
    layouts.set(type, result);
    return result;
  }
  const blocks: UniformTextureBlock[] = [],
    readers: string[] = [],
    initializers: string[] = [];
  source = source.replace(/layout\(std140\) uniform (\w+)\s*\{([^}]+)\}\s*(\w+);/g, (_all, name, body, variable) => {
    const type = "Engine_" + name;
    definitions.set(type, body);
    const l = layout(type),
      sampler = "uniform_" + name;
    blocks.push({ name, sampler, byteLength: l.size });
    const word = `word_${sampler}`;
    function value(t: string, offset: number, rowMajor = false): string {
      const member = layout(t);
      if (member.fields)
        return `${t}(${member.fields.map((f) => value(f.type, offset + f.offset, f.rowMajor)).join(",")})`;
      const scalar = (i: number) => {
        const s = `${word}(${offset / 4 + i})`;
        return t === "uint" || t.startsWith("uvec")
          ? s
          : t === "int" || t.startsWith("ivec")
            ? `int(${s})`
            : t === "bool" || t.startsWith("bvec")
              ? `(${s}!=0u)`
              : `uintBitsToFloat(${s})`;
      };
      const matrix = /^mat([234])$/.exec(t);
      if (matrix) {
        const n = Number(matrix[1]);
        return `${t}(${Array.from({ length: n * n }, (_, k) => scalar(rowMajor ? (k % n) * 4 + Math.floor(k / n) : Math.floor(k / n) * 4 + (k % n))).join(",")})`;
      }
      const v = /^[uib]?vec([234])$/.exec(t);
      return v ? `${t}(${Array.from({ length: Number(v[1]) }, (_, i) => scalar(i)).join(",")})` : scalar(0);
    }
    readers.push(
      `uint ${word}(int p){ivec2 s=textureSize(${sampler},0);return texelFetch(${sampler},ivec2((p/4)%s.x,(p/4)/s.x),0)[p%4];}\n${type} read_${sampler}(){return ${value(type, 0)};}`
    );
    initializers.push(`${variable}=read_${sampler}();`);
    return `struct ${type}{${body.replace(/layout\(row_major\)\s*/g, "")}};\n${type} ${variable};\nuniform highp usampler2D ${sampler};`;
  });
  if (source.includes("layout(std140)")) throw Error("Unconverted uniform block");
  const start = source.indexOf("void original_main()");
  if (start < 0) throw Error("Missing original shader entry");
  source = source.slice(0, start) + readers.join("\n") + "\n" + source.slice(start);
  source = source.replace("void main(){", `void main(){${initializers.join("")}`);
  return { source: dormerUniform + source.replace(/^#version 300 es\s*/, ""), blocks };
}
