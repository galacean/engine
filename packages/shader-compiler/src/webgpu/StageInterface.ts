import type {
  IWebGPUShaderAttribute,
  IWebGPUShaderOptions,
  IWebGPUShaderTexture,
  IWebGPUShaderUniformBlock
} from "@galacean/engine-design";

export interface Declaration {
  start: number;
  end: number;
  qualifier: string;
  type: string;
  name: string;
  location?: number;
  body?: string;
  instance?: string;
  extent?: string;
}

export function tokens(source: string): string[] {
  const words: string[] =
    source
      .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|^[ \t]*#version[^\n]*/gm, " ")
      .match(
        /[A-Za-z_]\w*|0[xX][\da-fA-F]+[uU]?|(?:\d*\.\d+|\d+\.?\d*)(?:[eE][+-]?\d+)?[uUfF]?|<<=|>>=|\+\+|--|<<|>>|<=|>=|==|!=|&&|\|\||\^\^|[+\-*/%&|^]=|[^\s]/g
      ) ?? [];
  // Historical instructions and raw GLSL may share one qualifier/type across
  // several resources. Each resource needs its own binding and declaration span.
  for (let i = 0; i < words.length; i++) {
    // A baked picking or depth-only variant may return and leave its lighting code
    // in the same block. Naga cannot emit WGSL with statements after a terminator.
    if (words[i] === "return" && ["{", "}", ";", ":"].includes(words[i - 1])) {
      const endReturn = words.indexOf(";", i + 1);
      if (endReturn < 0) throw new Error("Unterminated GLSL return statement.");
      let next = endReturn + 1;
      while (next < words.length && !["}", "case", "default"].includes(words[next])) {
        if (words[next] === "{") next = matching(words, next);
        next++;
      }
      if (next > endReturn + 1) words.splice(endReturn + 1, next - endReturn - 1);
      i = endReturn;
      continue;
    }
    if (words[i] !== "uniform") continue;
    const type = /^(?:lowp|mediump|highp)$/.test(words[i + 1]) ? i + 2 : i + 1;
    if (words[type + 1] === "{") {
      i = matching(words, type + 1);
      continue;
    }
    const start = i;
    for (i = type + 1; i < words.length && words[i] !== ";"; i++) {
      if (words[i] === "[" || words[i] === "(") i = matching(words, i);
      else if (words[i] === ",") {
        const prefix = words.slice(start, type + 1);
        words.splice(i, 1, ";", ...prefix);
        i += prefix.length;
      }
    }
  }
  return words;
}

export function matching(t: string[], open: number): number {
  const close = { "(": ")", "[": "]", "{": "}" }[t[open]];
  let depth = 1;
  for (let i = open + 1; i < t.length; i++) {
    if (t[i] === t[open]) depth++;
    else if (t[i] === close && !--depth) return i;
  }
  throw new Error(`Unclosed shader token '${t[open]}'.`);
}

export function declarations(t: string[]): Declaration[] {
  const out: Declaration[] = [];
  let start = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") {
      i = matching(t, i);
      continue;
    }
    if (t[i] === "{") {
      const end = matching(t, i);
      if (t[i - 1] === ")") {
        start = end + 1;
        i = end;
        continue;
      }
      i = end;
      continue;
    }
    if (t[i] !== ";") continue;
    const text = t.slice(start, i + 1).join(" ");
    const block = /^layout\s*\([^)]*\)\s*uniform\s+(\w+)\s*\{(.*)\}\s*(\w*)\s*;$/.exec(text);
    if (block)
      out.push({
        start,
        end: i + 1,
        qualifier: "block",
        type: block[1],
        name: block[1],
        body: block[2],
        instance: block[3]
      });
    else {
      const io =
        /^(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?(?:(?:flat|smooth|centroid|invariant)\s+)*(uniform|in|out)\s+(?:(?:highp|mediump|lowp)\s+)?(\w+)\s+(\w+)(?:\s*\[(.+)\])?\s*;$/.exec(
          text
        );
      if (io)
        out.push({
          start,
          end: i + 1,
          qualifier: io[2],
          type: io[3],
          name: io[4],
          extent: io[5],
          location: io[1] === undefined ? undefined : Number(io[1])
        });
    }
    start = i + 1;
  }
  return out;
}

export function attribute(decl: Declaration, location: number): IWebGPUShaderAttribute {
  return {
    name: decl.name,
    location,
    type: /^(?:uint|uvec)/.test(decl.type) ? "uint" : /^(?:int|ivec)/.test(decl.type) ? "sint" : "float",
    components: Number(/vec([234])/.exec(decl.type)?.[1] ?? 1)
  };
}

export function resourceGroup(name: string, feedback = false): number {
  if (name.startsWith("scene_")) return 0;
  if (name.startsWith("camera_")) return 1;
  if (name.startsWith("material_") || feedback) return 2;
  return 3;
}

export function texture(
  name: string,
  type: string,
  group: number,
  binding: number,
  visibility: number,
  options: IWebGPUShaderOptions
): IWebGPUShaderTexture {
  const comparison = type.endsWith("Shadow");
  const sampleType = comparison
    ? "depth"
    : type.startsWith("isampler")
      ? "sint"
      : type.startsWith("usampler")
        ? "uint"
        : options.unfilterableTextures?.has(name)
          ? "unfilterable-float"
          : "float";
  return {
    name,
    group,
    textureBinding: binding,
    samplerBinding: binding + 1,
    visibility,
    sampleType,
    viewDimension: type.includes("Cube")
      ? "cube"
      : type.includes("3D")
        ? "3d"
        : type.includes("Array")
          ? "2d-array"
          : "2d",
    samplerType: comparison ? "comparison" : sampleType === "float" ? "filtering" : "non-filtering"
  };
}

/** Use std140 directly where WGSL has identical natural offsets. Other layouts are
 * read through aligned 16-byte words using the existing CPU reflection. */
export function uniformBlock(
  tokens: string[],
  decl: Declaration,
  block: IWebGPUShaderUniformBlock,
  ordinal: number,
  prefix: string,
  directArrays: boolean
): { source: string; initialize: string; paddedArrays?: number } {
  const header = `layout(std140,set=${block.group},binding=${block.binding}) uniform ${decl.name}`;
  const instance = decl.instance ?? "";
  if (!block.members.some((m) => m.name.includes(".") || /^(?:bool|bvec|mat(?:2$|[234]x2))/.test(m.type))) {
    const arrays = block.members.filter((m) => m.arrayLength);
    const names = new Set(arrays.map((m) => m.name));
    // Whole-array arguments need the helper parameter's ordinary array stride during GLSL overload resolution.
    if (
      !arrays.length ||
      (directArrays &&
        !tokens.some((t, i) => (i < decl.start || i >= decl.end) && names.has(t) && tokens[i + 1] !== "["))
    ) {
      const paddedArrays = arrays.filter((m) => /^(?:float|int|uint|[iu]?vec2)$/.test(m.type)).length;
      return { source: `${header} { ${decl.body} } ${instance};`, initialize: "", paddedArrays };
    }
  }
  const raw = `${prefix}data_${ordinal}`;
  const indexName = prefix + "index";
  const body = instance
    ? `struct ${prefix}value_${ordinal}{${decl.body}}; ${prefix}value_${ordinal} ${instance};`
    : decl.body!;
  const source = `${header}{uvec4 words[${Math.ceil(block.byteLength / 16)}];} ${raw};\n${body}`;
  const writes: string[] = [];
  for (const field of block.members) {
    const scalar = /^(?:bool|bvec)/.test(field.type)
      ? "bool"
      : /^(?:int|ivec)/.test(field.type)
        ? "int"
        : /^(?:uint|uvec)/.test(field.type)
          ? "uint"
          : "float";
    const matrix = /^mat([234])(?:x([234]))?$/.exec(field.type);
    const width = Number(matrix?.[2] ?? matrix?.[1] ?? /vec([234])/.exec(field.type)?.[1] ?? 1);
    function load(offset: number): string {
      const elements = Array.from({ length: width }, (_, i) => {
        const address = offset + i * 4,
          index = `${address >> 4}${field.arrayLength ? ` + ${indexName} * ${field.arrayStride >> 4}` : ""}`;
        const bits = `${raw}.words[${index}].${"xyzw"[(address >> 2) % 4]}`;
        return scalar === "float"
          ? `uintBitsToFloat(${bits})`
          : scalar === "bool"
            ? `(${bits} != 0u)`
            : scalar === "int"
              ? `int(${bits})`
              : bits;
      });
      return width === 1 ? elements[0] : `${matrix ? "vec" + width : field.type}(${elements.join(",")})`;
    }
    const value = matrix
      ? `${field.type}(${Array.from({ length: Number(matrix[1]) }, (_, i) => load(field.offset + i * field.matrixStride)).join(",")})`
      : load(field.offset);
    const target = `${instance ? instance + "." : ""}${field.name}${field.arrayLength ? "[" + indexName + "]" : ""}`;
    writes.push(
      field.arrayLength
        ? `for(int ${indexName}=0;${indexName}<${field.arrayLength};${indexName}++){${target}=${value};}`
        : `${target}=${value};`
    );
  }
  return { source, initialize: writes.join("\n") };
}

/** Scalar and two-lane std140 arrays occupy a 16-byte slot per element. Use a native
 * uniform array of four-lane vectors and project the requested element at its read.
 * Naga has already resolved GLSL names, member shadowing and array index expressions. */
export function padUniformArrays(
  source: string,
  block: IWebGPUShaderUniformBlock,
  expected: number
): string | undefined {
  const binding = new RegExp(
    `@group\\(${block.group}\\)\\s*@binding\\(${block.binding}\\)\\s*var<uniform> (\\w+): (\\w+);`
  ).exec(source);
  if (!binding) return;
  const [, variable, type] = binding;
  const declaration = new RegExp(`struct ${type} \\{([^}]*)\\}`).exec(source);
  if (!declaration || source.match(new RegExp(`\\b${type}\\b`, "g"))?.length !== 2) return;
  const fields = new Map<string, string>();
  const wide = declaration[0].replace(
    /(\w+): array<(vec2<)?([fiu]32)>?, (\d+)>/g,
    (_, name, vector, scalar, length) => {
      fields.set(name, vector ? ".xy" : ".x");
      return `${name}: array<vec4<${scalar}>, ${length}>`;
    }
  );
  if (fields.size !== expected) return;
  const insertions: { at: number; suffix: string }[] = [];
  const uses = new RegExp(`\\b${variable}\\b(?:\\.(\\w+))?`, "g");
  for (let use = uses.exec(source); use; use = uses.exec(source)) {
    if (!use[1]) {
      if (use.index < binding.index || use.index >= binding.index + binding[0].length) return;
      continue;
    }
    const suffix = fields.get(use[1]);
    if (!suffix) continue;
    let end = uses.lastIndex;
    // A whole-array value passed to a helper requires the original GLSL element type.
    if (source[end++] !== "[") return;
    for (let depth = 1; depth && end < source.length; end++) {
      if (source[end] === "[") depth++;
      else if (source[end] === "]") depth--;
    }
    insertions.push({ at: end, suffix });
  }
  // Nested indices can end in a different order from the start of their expressions.
  insertions.sort((a, b) => a.at - b.at);
  const pieces: string[] = [];
  let start = 0;
  for (const { at, suffix } of insertions) {
    pieces.push(source.slice(start, at), suffix);
    start = at;
  }
  pieces.push(source.slice(start));
  return pieces.join("").replace(declaration[0], wide);
}

/** Read exactly the instanced member a stage requests. This handles bool and
 * two-row matrices, whose natural WGSL representation differs from std140. */
export function instanceBlock(
  t: string[],
  d: Declaration,
  b: IWebGPUShaderUniformBlock,
  prefix: string
): { source: string; reads: Map<number, { end: number; text: string }> } {
  const items = /\b(\w+)\s+items\s*\[\s*(\d+)\s*\]/.exec(d.body!);
  if (!items || !d.instance) throw new Error("Invalid compiler instance uniform block.");
  const start = t.findIndex((v, i) => v === "struct" && t[i + 1] === items[1] && t[i + 2] === "{") + 2;
  const fields = t
    .slice(start + 1, matching(t, start))
    .join(" ")
    .replace(/\b(?:highp|mediump|lowp)\b/g, "");
  const raw = `${prefix}raw_${d.name}`,
    declarations = [
      `layout(std140,set=${b.group},binding=${b.binding}) uniform ${d.name} {uvec4 words[${b.byteLength / 16}];} ${raw};`
    ];
  const headers = Array.from(d.body!.matchAll(/\bmat4\s+(\w+)\s*;/g));
  const headerBytes = headers.length * 64;
  const stride = (b.byteLength - headerBytes) / Number(items[2]);
  if (!Number.isInteger(stride) || stride % 16 !== 0) throw new Error("Invalid reflected instance stride.");
  function accessor(name: string, type: string, offset: number, indexed: boolean) {
    const mat = /^mat([234])(?:x([234]))?$/.exec(type);
    const lanes = Number(mat?.[2] ?? mat?.[1] ?? /vec([234])/.exec(type)?.[1] ?? 1);
    const channel = (column: number) => {
      const values = Array.from({ length: lanes }, (_, i) => {
        const pos = offset + column * 16 + i * 4;
        const bits = `${raw}.words[${pos >> 4}${indexed ? `+ gs_index*${stride / 16}` : ""}].${"xyzw"[(pos >> 2) % 4]}`;
        if (/^(bool|bvec)/.test(type)) return `(${bits}!=0u)`;
        if (/^(int|ivec)/.test(type)) return `int(${bits})`;
        if (/^(uint|uvec)/.test(type)) return bits;
        return `uintBitsToFloat(${bits})`;
      });
      return lanes === 1 ? values[0] : `${mat ? "vec" + lanes : type}(${values.join(",")})`;
    };
    const expr = mat
      ? `${type}(${Array.from({ length: Number(mat[1]) }, (_, i) => channel(i)).join(",")})`
      : channel(0);
    declarations.push(`${type} ${raw}_${name}(${indexed ? "int gs_index" : ""}){return ${expr};}`);
  }
  headers.forEach((h, i) => accessor(h[1], "mat4", 64 * i, false));
  let offset = 0;
  for (const match of fields.matchAll(/\b(\w+)\s+(\w+)\s*;/g)) {
    const [, type, name] = match;
    const mat = /^mat([234])/.exec(type),
      lanes = Number(/vec([234])/.exec(type)?.[1] ?? 1);
    const alignment = mat || lanes >= 3 ? 16 : lanes * 4;
    offset = Math.ceil(offset / alignment) * alignment;
    accessor(name, type, headerBytes + offset, true);
    offset += mat ? Number(mat[1]) * 16 : lanes * 4;
  }
  const reads = new Map<number, { end: number; text: string }>();
  for (let i = 0; i < t.length; i++)
    if (t[i] === d.instance && t[i + 1] === ".") {
      if (t[i + 2] !== "items") {
        reads.set(i, { end: i + 3, text: `${raw}_${t[i + 2]}()` });
        continue;
      }
      const close = matching(t, i + 3);
      if (t[close + 1] !== ".") throw new Error("An instanced uniform must address a reflected field.");
      const index = t
        .slice(i + 4, close)
        .join(" ")
        .replace(/\bgl_InstanceID\b/g, "int(gl_InstanceIndex)");
      reads.set(i, { end: close + 3, text: `${raw}_${t[close + 2]}(${index})` });
    }
  return { source: declarations.join("\n"), reads };
}
