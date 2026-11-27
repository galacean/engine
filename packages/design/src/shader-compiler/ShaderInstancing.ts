/** Compiler-reserved identifiers shared by the two stages of an instanced variant. */
export interface IShaderInstancingNames {
  initialize: string;
  index: string;
  block: string;
  struct: string;
  instance: string;
}

/** Byte offsets are relative to the beginning of an instance or its block header. */
export interface IShaderInstanceLayout {
  bindingName: string;
  fields: { name: string; type: string; offset: number; worldTransform?: boolean }[];
  structSize: number;
  instanceMaxCount: number;
  headerBytes: number;
  viewOffset: number;
  viewProjectionOffset: number;
}

export interface IInstanceUniform {
  name: string;
  type: string;
  arrayLength: number;
}

const matrixType = /^mat([234])(?:x([234]))?$/;
const vectorType = /^[iub]?vec([234])$/;
const scalarTypes = new Set(["float", "int", "uint", "bool"]);
const align = (bytes: number, alignment: number): number => Math.ceil(bytes / alignment) * alignment;

/** Specialize the compiler-selected declarations once, when the shader variant is linked. */
export function createShaderInstancing(
  names: IShaderInstancingNames,
  vertexFields: readonly IInstanceUniform[],
  fragmentFields: readonly IInstanceUniform[],
  maxBlockBytes: number
) {
  const fields: IShaderInstanceLayout["fields"] = [];
  const types = new Map<string, string>();
  const claimed = new Set<string>();
  let bytes = 0;
  let useModel = false;
  let useView = false;
  let useViewProjection = false;

  for (const stage of [vertexFields, fragmentFields]) {
    for (const { name, type, arrayLength } of stage) {
      if (arrayLength || (!scalarTypes.has(type) && !matrixType.test(type) && !vectorType.test(type))) continue;
      claimed.add(name);
      if (type === "mat4" || type === "mat4x4") {
        if (name === "renderer_MVMat") useView = true;
        if (name === "renderer_MVPMat") useViewProjection = true;
        if (
          name === "renderer_NormalMat" ||
          name === "renderer_ModelMat" ||
          name === "renderer_MVMat" ||
          name === "renderer_MVPMat"
        ) {
          useModel = true;
          continue;
        }
      }
      types.set(name, type);
    }
  }

  // Keep the transform separate from authored members (including an explicit block's renderer_ModelMat).
  if (useModel) {
    fields.push({ name: "renderer_ModelMat", type: "mat3x4", offset: 0, worldTransform: true });
    bytes = 48;
  }
  for (const [name, type] of types) {
    const matrix = matrixType.exec(type);
    const components = Number(vectorType.exec(type)?.[1] ?? 1);
    const offset = align(bytes, matrix || components >= 3 ? 16 : components * 4);
    fields.push({ name, type, offset });
    bytes = offset + (matrix ? Number(matrix[1]) * 16 : components * 4);
  }
  const structSize = Math.max(16, align(bytes, 16));
  const headerBytes = (Number(useView) + Number(useViewProjection)) * 64;
  const instanceMaxCount = Math.floor((maxBlockBytes - headerBytes) / structSize);
  if (instanceMaxCount < 1) {
    return undefined;
  }
  const layout: IShaderInstanceLayout = {
    bindingName: names.block,
    fields,
    structSize,
    instanceMaxCount,
    headerBytes,
    viewOffset: useView ? 0 : -1,
    viewProjectionOffset: useViewProjection ? (useView ? 64 : 0) : -1
  };
  const declarations = fields.map(
    ({ type }, i) => `${type === "bool" || type.startsWith("bvec") ? "" : "highp "}${type} f${i};`
  );
  if (!declarations.length) declarations.push("highp vec4 unused;");
  const block = `struct ${names.struct} { ${declarations.join("\n")} };
layout(std140) uniform ${names.block} {
  ${useView ? "highp mat4 view;" : ""}
  ${useViewProjection ? "highp mat4 vp;" : ""}
  ${names.struct} items[${instanceMaxCount}];
} ${names.instance};
void ${names.initialize}();
`;
  const fieldIndices = new Map(fields.map(({ name }, i) => [name, i]));
  function initializer(stage: readonly IInstanceUniform[], vertex: boolean): string {
    const lines: string[] = [];
    if (vertex) lines.push(`${names.index} = gl_InstanceID;`);
    const index = vertex ? "gl_InstanceID" : names.index;
    const item = `${names.instance}.items[${index}]`;
    const model = `transpose(mat4(${item}.f0[0], ${item}.f0[1], ${item}.f0[2], vec4(0.0, 0.0, 0.0, 1.0)))`;
    const used = new Set<string>();
    for (const { name, type } of stage) {
      if (!claimed.has(name) || used.has(name)) continue;
      used.add(name);
      let expression = `${item}.f${fieldIndices.get(name)}`;
      if (type === "mat4" || type === "mat4x4") {
        if (name === "renderer_ModelMat") expression = model;
        else if (name === "renderer_MVMat") expression = `${names.instance}.view * ${model}`;
        else if (name === "renderer_MVPMat") expression = `${names.instance}.vp * ${model}`;
        else if (name === "renderer_NormalMat") {
          // The cofactor form preserves normals for singular transforms and mirrored scale.
          lines.push(`{ mat3 m = mat3(${model}); vec3 a = cross(m[1],m[2]); vec3 b = cross(m[2],m[0]); vec3 c = cross(m[0],m[1]);
            float s = dot(m[0],a) < 0.0 ? -1.0 : 1.0; renderer_NormalMat = mat4(mat3(a*s,b*s,c*s)); }`);
          continue;
        }
      }
      lines.push(`${name} = ${expression};`);
    }
    return `\nvoid ${names.initialize}() {\n${lines.join("\n")}\n}\n`;
  }
  return {
    layout,
    claimed,
    vertexPrefix: `${block}flat out highp int ${names.index};\n`,
    fragmentPrefix: `${block}flat in highp int ${names.index};\n`,
    vertexSuffix: initializer(vertexFields, true),
    fragmentSuffix: initializer(fragmentFields, false)
  };
}
