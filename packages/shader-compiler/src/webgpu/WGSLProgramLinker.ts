import {
  createShaderInstancing,
  shaderConstant,
  type IShaderInstanceLayout,
  type IShaderUniformBlock,
  type IShaderUniformBlockMember,
  type IWebGPUComputeOptions,
  type IWebGPUComputeProgram,
  type IWebGPUComputeReflection,
  type IWebGPUShaderAttribute,
  type IWebGPUShaderOptions,
  type IWebGPUShaderProgram,
  type IWebGPUShaderReflection,
  type IWebGPUShaderStorageBuffer,
  type IWebGPUShaderStorageTexture,
  type IWebGPUShaderTexture,
  type IWebGPUShaderUniformBlock,
  type ShaderConstant
} from "@galacean/engine-design";
import { glslBaseToWGSL, glslTypeToWGSL, isSamplerType, WGSL_RESERVED } from "../codeGen/WGSLTypes";
import { poolSamplerBindings, removeUnusedSamplers } from "./SamplerBindings";
import { describeTextureBindings, fitTextureBindings } from "./TextureBindings";

interface StageIO {
  name: string;
  varName: string;
  glslType: string;
  flat: boolean;
  centroid: boolean;
  markerStart: number;
  markerEnd: number;
}

interface StageMRT {
  loc: number;
  varName: string;
  glslType: string;
  markerStart: number;
  markerEnd: number;
}

interface StageUBO {
  name: string;
  binding: string;
  type: string;
  byteLength: number;
  markerStart: number;
  markerEnd: number;
}

interface StageSSBO {
  name: string;
  binding: string;
  type: string;
  access: "read" | "read_write";
  markerStart: number;
  markerEnd: number;
}

interface StageStorageTexture {
  name: string;
  varName: string;
  format: string;
  wgslAccess: "read" | "write" | "read_write";
  access: "read-only" | "write-only" | "read-write";
  markerStart: number;
  markerEnd: number;
}

interface StageUniform {
  name: string;
  varName: string;
  glslType: string;
  arrayExpr?: string;
  arrayLength: number;
  markerStart: number;
  markerEnd: number;
}

interface StageSampler {
  name: string;
  samplerType: string;
  texVar: string;
  sampVar: string;
  arrayExpr?: string;
  arrayLength: number;
  markerStart: number;
  markerEnd: number;
}

interface StructFieldMeta {
  name: string;
  type: string;
  arrayExpr?: string;
  arrayLength: number;
}

interface StageStruct {
  name: string;
  wgslName: string;
  fields: StructFieldMeta[];
  markerStart: number;
  markerEnd: number;
}

interface ParsedStage {
  source: string;
  builtins: Set<string>;
  inputs: StageIO[];
  outputs: StageIO[];
  mrts: StageMRT[];
  ubos: StageUBO[];
  ssbos: StageSSBO[];
  storageTextures: StageStorageTexture[];
  uniforms: StageUniform[];
  samplers: StageSampler[];
  structs: Map<string, StageStruct>;
  constants: Map<string, ShaderConstant>;
  entryBody: string;
}

interface Std140Shape {
  alignment: number;
  size: number;
  members: IShaderUniformBlockMember[];
  hasSampler: boolean;
}

const NUMERIC_TYPE = /^(?:(?:[iub]?vec)[234]|mat[234](?:x[234])?|bool|float|int|uint)$/;
const NON_NATURAL_STD140_TYPE = /^(?:bool|bvec[234]|mat2(?:x2)?|mat[34]x2)$/;
const SUB16_ARRAY_ELEM = /^(?:float|int|uint|bool|[iub]?vec2)$/;

const roundUp = (offset: number, alignment: number): number => Math.ceil(offset / alignment) * alignment;

function safeFieldName(name: string): string {
  if (!WGSL_RESERVED.has(name) && !name.startsWith("__")) return name;
  return `gs_f_${name}`;
}

export function resourceGroup(name: string, feedback = false): number {
  if (name.startsWith("scene_")) return 0;
  if (name.startsWith("camera_")) return 1;
  if (name.startsWith("material_") || feedback) return 2;
  return 3;
}

function makeTextureReflection(
  name: string,
  samplerType: string,
  group: number,
  binding: number,
  visibility: number,
  options: IWebGPUShaderOptions,
  arrayIndex?: number
): IWebGPUShaderTexture {
  const textureKey = arrayIndex === undefined ? name : `${name}[${arrayIndex}]`;
  const comparison = samplerType.endsWith("Shadow");
  const sampleType: IWebGPUShaderTexture["sampleType"] = comparison
    ? "depth"
    : samplerType.startsWith("isampler")
      ? "sint"
      : samplerType.startsWith("usampler")
        ? "uint"
        : options.unfilterableTextures?.has(textureKey)
          ? "unfilterable-float"
          : "float";
  const result: IWebGPUShaderTexture = {
    name,
    group,
    textureBinding: binding,
    samplerBinding: binding + 1,
    visibility,
    sampleType,
    viewDimension: samplerType.includes("Cube")
      ? "cube"
      : samplerType.includes("3D")
        ? "3d"
        : samplerType.includes("Array")
          ? "2d-array"
          : "2d",
    samplerType: comparison ? "comparison" : sampleType === "float" ? "filtering" : "non-filtering"
  };
  if (arrayIndex !== undefined) result.arrayIndex = arrayIndex;
  return result;
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  const re = /(\w+)=([^\s]*)/g;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    out[m[1]] = m[2];
  }
  return out;
}

function countIdentOccurrences(source: string, ident: string): number {
  const matches = source.match(new RegExp(`\\b${ident}\\b`, "g"));
  return matches ? matches.length : 0;
}

function resolveArrayLength(
  expr: string | undefined,
  constants: Map<string, ShaderConstant>,
  resolveConstant?: (name: string) => number | undefined
): number {
  if (!expr) return 0;
  const trimmed = expr.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const resolved = shaderConstant(trimmed, (name) => {
    const c = constants.get(name);
    if (c) return c;
    const dev = resolveConstant?.(name);
    return dev !== undefined ? { type: "int", values: [dev] } : undefined;
  });
  const val = resolved?.values[0];
  if (val !== undefined && Number.isSafeInteger(val) && val > 0) return val;
  throw new Error(`Cannot resolve uniform array length '${expr}' in WGSL linker.`);
}

function parseStage(source: string, resolveConstant?: (name: string) => number | undefined): ParsedStage {
  const builtins = new Set<string>();
  const inputs: StageIO[] = [];
  const outputs: StageIO[] = [];
  const mrts: StageMRT[] = [];
  const ubos: StageUBO[] = [];
  const ssbos: StageSSBO[] = [];
  const storageTextures: StageStorageTexture[] = [];
  const uniforms: StageUniform[] = [];
  const samplers: StageSampler[] = [];
  const structs = new Map<string, StageStruct>();
  const constants = new Map<string, ShaderConstant>();

  // Collect module-scope WGSL constants (e.g. `const INDEX: i32 = 1i;`)
  for (const m of source.matchAll(/\bconst\s+([A-Za-z_]\w*)\s*:\s*(i32|u32|f32)\s*=\s*([^;]+);/g)) {
    const [, name, wType, rawExpr] = m;
    const cleaned = rawExpr.replace(/\b(\d+)[iu]\b/g, "$1").replace(/\b(\d+(?:\.\d*)?)f\b/g, "$1");
    const glslType = wType === "i32" ? "int" : wType === "u32" ? "uint" : "float";
    const val = shaderConstant(`${glslType}(${cleaned})`, (id) => {
      const existing = constants.get(id);
      if (existing) return existing;
      const dev = resolveConstant?.(id);
      return dev !== undefined ? { type: "int", values: [dev] } : undefined;
    });
    if (val) constants.set(name, val);
  }

  // Extract entry body
  let entryBody = "";
  const entryMatch = /\/\*@gs_entry_begin\*\/([\s\S]*?)\/\*@gs_entry_end\*\//.exec(source);
  if (entryMatch) {
    entryBody = entryMatch[1].trim();
  }

  // Parse all `/*@gs_...*/` declaration markers
  const markerRe = /\/\*@(gs_\w+)([^]*?)\*\//g;
  for (let m = markerRe.exec(source); m; m = markerRe.exec(source)) {
    const kind = m[1];
    const body = m[2].trim();
    const start = m.index;
    const end = start + m[0].length;
    if (kind === "gs_builtin") {
      builtins.add(body);
    } else if (kind === "gs_in" || kind === "gs_out") {
      const a = parseAttrs(body);
      const item: StageIO = {
        name: a.name,
        varName: a.var,
        glslType: a.glslType,
        flat: a.flat === "1",
        centroid: a.centroid === "1",
        markerStart: start,
        markerEnd: end
      };
      if (kind === "gs_in") {
        if (!inputs.some((x) => x.varName === item.varName)) inputs.push(item);
      } else {
        if (!outputs.some((x) => x.varName === item.varName)) outputs.push(item);
      }
    } else if (kind === "gs_mrt") {
      const a = parseAttrs(body);
      const item: StageMRT = {
        loc: Number(a.loc),
        varName: a.var,
        glslType: a.glslType,
        markerStart: start,
        markerEnd: end
      };
      if (!mrts.some((x) => x.loc === item.loc)) mrts.push(item);
    } else if (kind === "gs_ubo") {
      const a = parseAttrs(body);
      const item: StageUBO = {
        name: a.name,
        binding: a.binding,
        type: a.type,
        byteLength: Number(a.byteLength),
        markerStart: start,
        markerEnd: end
      };
      if (!ubos.some((x) => x.binding === item.binding)) ubos.push(item);
    } else if (kind === "gs_ssbo") {
      const a = parseAttrs(body);
      const access: "read" | "read_write" = a.access === "read" ? "read" : "read_write";
      const item: StageSSBO = {
        name: a.name,
        binding: a.binding,
        type: a.type,
        access,
        markerStart: start,
        markerEnd: end
      };
      if (!ssbos.some((x) => x.name === item.name)) ssbos.push(item);
    } else if (kind === "gs_stex") {
      const a = parseAttrs(body);
      const wgslAccess: "read" | "write" | "read_write" =
        a.access === "read" ? "read" : a.access === "read_write" ? "read_write" : "write";
      const access: "read-only" | "write-only" | "read-write" =
        wgslAccess === "read" ? "read-only" : wgslAccess === "read_write" ? "read-write" : "write-only";
      const item: StageStorageTexture = {
        name: a.name,
        varName: a.var,
        format: a.format || "rgba8unorm",
        wgslAccess,
        access,
        markerStart: start,
        markerEnd: end
      };
      if (!storageTextures.some((x) => x.name === item.name)) storageTextures.push(item);
    } else if (kind === "gs_uniform") {
      const a = parseAttrs(body);
      const item: StageUniform = {
        name: a.name,
        varName: a.var,
        glslType: a.glslType,
        arrayExpr: a.array,
        arrayLength: 0,
        markerStart: start,
        markerEnd: end
      };
      if (!uniforms.some((x) => x.name === item.name)) uniforms.push(item);
    } else if (kind === "gs_sampler") {
      const a = parseAttrs(body);
      const item: StageSampler = {
        name: a.name,
        samplerType: a.type,
        texVar: a.tex,
        sampVar: a.samp,
        arrayExpr: a.array,
        arrayLength: 0,
        markerStart: start,
        markerEnd: end
      };
      if (!samplers.some((x) => x.name === item.name)) samplers.push(item);
    } else if (kind === "gs_struct") {
      const a = parseAttrs(body);
      const fields: StructFieldMeta[] = [];
      if (a.fields) {
        for (const entry of a.fields.split(",")) {
          if (!entry) continue;
          const colon = entry.indexOf(":");
          if (colon < 0) continue;
          const fname = entry.slice(0, colon);
          const ftypeRaw = entry.slice(colon + 1);
          const arrMatch = /^([^[]+)\[([^\]]*)\]$/.exec(ftypeRaw);
          if (arrMatch) {
            fields.push({
              name: fname,
              type: arrMatch[1],
              arrayExpr: arrMatch[2],
              arrayLength: 0
            });
          } else {
            fields.push({ name: fname, type: ftypeRaw, arrayLength: 0 });
          }
        }
      }
      structs.set(a.name, {
        name: a.name,
        wgslName: a.wgsl,
        fields,
        markerStart: start,
        markerEnd: end
      });
    }
  }

  // Resolve array lengths for structs, uniforms, and samplers.
  // Note: `ShaderMacroProcessor.evaluate()` skips `/*...*/` comments, so macro expressions
  // like `SCENE_SHADOW_CASCADED_COUNT` are already expanded in the immediately following
  // WGSL `var<private>` / `struct` declaration — prefer that expanded expression when present.
  for (const s of structs.values()) {
    const structBodyMatch = new RegExp(`struct\\s+${s.wgslName}\\s*\\{([^}]*)\\}`).exec(source.slice(s.markerEnd));
    const structBody = structBodyMatch?.[1] ?? "";
    for (const f of s.fields) {
      if (f.arrayExpr) {
        const fMatch = new RegExp(`\\b${safeFieldName(f.name)}\\s*:\\s*array<[^,]+,\\s*([^>]+)>`).exec(structBody);
        f.arrayLength = resolveArrayLength(fMatch?.[1] ?? f.arrayExpr, constants, resolveConstant);
      }
    }
  }
  for (const u of uniforms) {
    if (u.arrayExpr) {
      const tail = source.slice(u.markerEnd, u.markerEnd + 256);
      const vMatch = new RegExp(`var<private>\\s+${u.varName}\\s*:\\s*array<[^,]+,\\s*([^>]+)>\\s*;`).exec(tail);
      u.arrayLength = resolveArrayLength(vMatch?.[1] ?? u.arrayExpr, constants, resolveConstant);
    }
  }
  for (const s of samplers) {
    if (s.arrayExpr) s.arrayLength = resolveArrayLength(s.arrayExpr, constants, resolveConstant);
  }

  return {
    source,
    builtins,
    inputs,
    outputs,
    mrts,
    ubos,
    ssbos,
    storageTextures,
    uniforms,
    samplers,
    structs,
    constants,
    entryBody
  };
}

/** Verify macro-pruned WGSL structs still contain every member accessed via typed parameters or private variables. */
function validateStageStructFields(source: string): void {
  const structs = new Map<string, Set<string>>();
  for (const m of source.matchAll(/\bstruct\s+([A-Za-z_]\w*)\s*\{([^}]*)\}/g)) {
    const fields = new Set<string>();
    for (const fm of m[2].matchAll(/\b([A-Za-z_]\w*)\s*:/g)) fields.add(fm[1]);
    structs.set(m[1], fields);
  }
  if (!structs.size) return;
  for (const fnMatch of source.matchAll(/\bfn\s+\w+\s*\(([^)]*)\)[^{]*\{/g)) {
    const paramTypes = new Map<string, string>();
    for (const p of fnMatch[1].split(",")) {
      const pm = /^\s*(?:@\w+(?:\([^)]*\))?\s*)*([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)\s*$/.exec(p);
      if (pm && structs.has(pm[2])) paramTypes.set(pm[1], pm[2]);
    }
    if (!paramTypes.size) continue;
    const open = fnMatch.index! + fnMatch[0].length - 1;
    let depth = 1;
    let close = open + 1;
    for (; close < source.length && depth > 0; close++) {
      if (source[close] === "{") depth++;
      else if (source[close] === "}") depth--;
    }
    const body = source.slice(open + 1, close - 1);
    for (const [param, structName] of paramTypes) {
      const fields = structs.get(structName)!;
      const accessRe = new RegExp(`\\b${param}\\.([A-Za-z_]\\w*)`, "g");
      for (let am = accessRe.exec(body); am; am = accessRe.exec(body)) {
        if (!fields.has(am[1])) {
          throw new Error(`Unknown struct field '${am[1]}' on '${structName}'.`);
        }
      }
    }
  }
}

function reflectStd140(
  name: string,
  type: string,
  arrayLength: number,
  structs: Map<string, StageStruct>,
  visiting = new Set<string>()
): Std140Shape | undefined {
  if (isSamplerType(type)) {
    return { alignment: 16, size: 0, members: [], hasSampler: true };
  }
  if (NUMERIC_TYPE.test(type)) {
    const matrix = /^mat([234])/.exec(type);
    const components = Number(/vec([234])$/.exec(type)?.[1] ?? 1);
    const size = matrix ? Number(matrix[1]) * 16 : components * 4;
    const arrayStride = arrayLength ? roundUp(size, 16) : 0;
    return {
      alignment: arrayLength || matrix || components >= 3 ? 16 : size,
      size: arrayLength ? arrayStride * arrayLength : size,
      members: [{ name, type, offset: 0, arrayLength, arrayStride, matrixStride: matrix ? 16 : 0 }],
      hasSampler: false
    };
  }
  const s = structs.get(type);
  if (!s || visiting.has(type)) return undefined;
  visiting.add(type);
  const leaves: IShaderUniformBlockMember[] = [];
  let end = 0;
  let hasSampler = false;
  for (const child of s.fields) {
    if (isSamplerType(child.type)) {
      hasSampler = true;
      continue;
    }
    const shape = reflectStd140(child.name, child.type, child.arrayLength, structs, visiting);
    if (!shape) continue;
    if (shape.hasSampler) hasSampler = true;
    if (!shape.members.length) continue;
    const offset = roundUp(end, shape.alignment);
    for (const member of shape.members) leaves.push({ ...member, offset: offset + member.offset });
    end = offset + shape.size;
  }
  visiting.delete(type);
  if (!leaves.length) return { alignment: 16, size: 0, members: [], hasSampler };
  const stride = roundUp(end, 16);
  const size = stride * (arrayLength || 1);
  const members: IShaderUniformBlockMember[] = [];
  for (let i = 0; i < (arrayLength || 1); i++) {
    const root = arrayLength ? `${name}[${i}].` : `${name}.`;
    for (const member of leaves) {
      members.push({ ...member, name: root + member.name, offset: i * stride + member.offset });
    }
  }
  return { alignment: 16, size, members, hasSampler };
}

function isNaturalStd140Member(m: IShaderUniformBlockMember): boolean {
  if (m.name.includes(".") || m.name.includes("[")) return false;
  if (NON_NATURAL_STD140_TYPE.test(m.type)) return false;
  if (m.arrayLength > 0 && SUB16_ARRAY_ELEM.test(m.type)) return false;
  return true;
}

function isNaturalStd140Block(members: readonly IShaderUniformBlockMember[]): boolean {
  return members.every(isNaturalStd140Member);
}

/** Generate WGSL statements that unpack std140 `words: array<vec4<u32>, N>` into a target WGSL variable/path. */
function emitUnpackStatements(
  rawVar: string,
  members: readonly IShaderUniformBlockMember[],
  targetPath: (memberName: string) => string,
  indexVar: string
): string[] {
  const stmts: string[] = [];
  for (const field of members) {
    const scalar = /^(?:bool|bvec)/.test(field.type)
      ? "bool"
      : /^(?:int|ivec)/.test(field.type)
        ? "int"
        : /^(?:uint|uvec)/.test(field.type)
          ? "uint"
          : "float";
    const matrix = /^mat([234])(?:x([234]))?$/.exec(field.type);
    const cols = matrix ? Number(matrix[1]) : 1;
    const width = Number(matrix?.[2] ?? matrix?.[1] ?? /vec([234])/.exec(field.type)?.[1] ?? 1);
    const loadLane = (offset: number): string => {
      const elements = Array.from({ length: width }, (_, i) => {
        const address = offset + i * 4;
        const wordIdx = `${address >> 4}u${field.arrayLength ? ` + u32(${indexVar}) * ${field.arrayStride >> 4}u` : ""}`;
        const bits = `${rawVar}.words[${wordIdx}].${"xyzw"[(address >> 2) % 4]}`;
        if (scalar === "float") return `bitcast<f32>(${bits})`;
        if (scalar === "bool") return `(${bits} != 0u)`;
        if (scalar === "int") return `bitcast<i32>(${bits})`;
        return bits;
      });
      if (width === 1) return elements[0];
      const vecType = matrix ? `vec${width}<f32>` : glslBaseToWGSL(field.type);
      return `${vecType}(${elements.join(", ")})`;
    };
    const expr = matrix
      ? `${glslBaseToWGSL(field.type)}(${Array.from({ length: cols }, (_, c) =>
          loadLane(field.offset + c * (field.matrixStride || 16))
        ).join(", ")})`
      : loadLane(field.offset);
    const lhsBase = targetPath(field.name);
    if (field.arrayLength) {
      stmts.push(
        `  for (var ${indexVar}: i32 = 0i; ${indexVar} < ${field.arrayLength}i; ${indexVar} += 1i) { ${lhsBase}[${indexVar}] = ${expr}; }`
      );
    } else {
      stmts.push(`  ${lhsBase} = ${expr};`);
    }
  }
  return stmts;
}

/** Generate WGSL statements that unpack one instanced field from `gs_inst_raw.words` at `instIdx`. */
function emitInstanceFieldLoad(
  rawVar: string,
  type: string,
  offsetBytes: number,
  strideWords: number,
  instIdxExpr: string | undefined
): string {
  const scalar = /^(?:bool|bvec)/.test(type)
    ? "bool"
    : /^(?:int|ivec)/.test(type)
      ? "int"
      : /^(?:uint|uvec)/.test(type)
        ? "uint"
        : "float";
  const matrix = /^mat([234])(?:x([234]))?$/.exec(type);
  const cols = matrix ? Number(matrix[1]) : 1;
  const width = Number(matrix?.[2] ?? matrix?.[1] ?? /vec([234])/.exec(type)?.[1] ?? 1);
  const loadCol = (colOffset: number): string => {
    const elems = Array.from({ length: width }, (_, i) => {
      const addr = colOffset + i * 4;
      const wordIdx = `${addr >> 4}u${instIdxExpr ? ` + u32(${instIdxExpr}) * ${strideWords}u` : ""}`;
      const bits = `${rawVar}.words[${wordIdx}].${"xyzw"[(addr >> 2) % 4]}`;
      if (scalar === "float") return `bitcast<f32>(${bits})`;
      if (scalar === "bool") return `(${bits} != 0u)`;
      if (scalar === "int") return `bitcast<i32>(${bits})`;
      return bits;
    });
    if (width === 1) return elems[0];
    const vecT = matrix ? `vec${width}<f32>` : glslBaseToWGSL(type);
    return `${vecT}(${elems.join(", ")})`;
  };
  if (matrix) {
    return `${glslBaseToWGSL(type)}(${Array.from({ length: cols }, (_, c) => loadCol(offsetBytes + c * 16)).join(", ")})`;
  }
  return loadCol(offsetBytes);
}

function attributeFromGLSL(name: string, glslType: string, location: number): IWebGPUShaderAttribute {
  return {
    name,
    location,
    type: /^(?:uint|uvec)/.test(glslType) ? "uint" : /^(?:int|ivec)/.test(glslType) ? "sint" : "float",
    components: Number(/vec([234])/.exec(glslType)?.[1] ?? 1)
  };
}

function wgslTypeForAttribute(a: IWebGPUShaderAttribute): string {
  const scalar = a.type === "uint" ? "u32" : a.type === "sint" ? "i32" : "f32";
  return a.components === 1 ? scalar : `vec${a.components}<${scalar}>`;
}

function samplerToWGSLTexType(samplerType: string): string {
  const elem = samplerType.startsWith("isampler") ? "i32" : samplerType.startsWith("usampler") ? "u32" : "f32";
  if (samplerType.endsWith("Shadow")) {
    if (samplerType.includes("2DArray")) return "texture_depth_2d_array";
    if (samplerType.includes("Cube")) return "texture_depth_cube";
    return "texture_depth_2d";
  }
  if (samplerType.includes("2DArray")) return `texture_2d_array<${elem}>`;
  if (samplerType.includes("Cube")) return `texture_cube<${elem}>`;
  if (samplerType.includes("3D")) return `texture_3d<${elem}>`;
  return `texture_2d<${elem}>`;
}

function samplerToWGSLSampType(samplerType: string): string {
  return samplerType.endsWith("Shadow") ? "sampler_comparison" : "sampler";
}

function collectOpaqueSamplerPaths(
  prefix: string,
  type: string,
  arrayLength: number,
  structs: Map<string, StageStruct>,
  out: Array<{ publicName: string; pathKey: string; samplerType: string; arrayLength: number }>,
  visiting = new Set<string>()
): void {
  if (isSamplerType(type)) {
    out.push({
      publicName: prefix,
      pathKey: prefix.replace(/\./g, "_"),
      samplerType: type,
      arrayLength
    });
    return;
  }
  const s = structs.get(type);
  if (!s || visiting.has(type)) return;
  visiting.add(type);
  for (let i = 0; i < (arrayLength || 1); i++) {
    const base = arrayLength ? `${prefix}[${i}]` : prefix;
    for (const f of s.fields) {
      collectOpaqueSamplerPaths(`${base}.${f.name}`, f.type, f.arrayLength, structs, out, visiting);
    }
  }
  visiting.delete(type);
}

/**
 * Zero-AST, zero-parser WGSL program linker.
 *
 * Links the vertex & fragment WGSL stage outputs emitted directly by `WGSLVisitor`
 * (after `ShaderMacroProcessor.evaluate()`) into a validated `IWebGPUShaderProgram`:
 * - Assigns `@group` / `@binding` and `@location` across both stages
 * - Packs loose uniforms into std140 `Auto` UBOs (direct zero-copy where natural, word-unpacked where needed)
 * - Synthesizes GPU instancing UBO & flat instance index varying when enabled
 * - Expands sampler arrays and opaque-struct sampler leaves
 * - Synthesizes `@vertex fn main(...) -> VertexOutput` and `@fragment fn main(...) -> FragmentOutput`
 * - Runs `removeUnusedSamplers`, `fitTextureBindings`, and `poolSamplerBindings`
 */
export class WGSLProgramLinker {
  link(vertexWGSL: string, fragmentWGSL: string, options: IWebGPUShaderOptions = {}): IWebGPUShaderProgram {
    const stages = [parseStage(vertexWGSL, options.resolveConstant), parseStage(fragmentWGSL, options.resolveConstant)];

    const groupBinding = [0, 0, 0, 0];
    const reflection: IWebGPUShaderReflection = {
      uniformBlocks: [],
      textures: [],
      vertexInputs: [],
      vertexOutputs: [],
      fragmentOutputs: []
    };

    const stagePrologues: [string[], string[]] = [[], []];
    const stageExtraDecls: [string[], string[]] = [[], []];
    const stageReplacements: [Array<[RegExp, string]>, Array<[RegExp, string]>] = [[], []];
    const stageRemovedPrivateVars: [Set<string>, Set<string>] = [new Set(), new Set()];
    const stageRemovedSamplerVars: [Set<string>, Set<string>] = [new Set(), new Set()];

    // -------------------------------------------------------------------------
    // 1. Expand sampler arrays & opaque-struct sampler leaves
    // -------------------------------------------------------------------------
    interface ResolvedSampler {
      publicName: string;
      arrayIndex?: number;
      samplerType: string;
      texVar: string;
      sampVar: string;
      visibility: number;
      isExpanded: boolean; // true -> needs new `@group @binding var` injected; false -> annotate existing `var`
    }
    const resolvedSamplers = new Map<string, ResolvedSampler>();

    const registerSampler = (key: string, entry: Omit<ResolvedSampler, "visibility">, stageBit: number) => {
      const existing = resolvedSamplers.get(key);
      if (existing) {
        existing.visibility |= stageBit;
        return;
      }
      resolvedSamplers.set(key, { ...entry, visibility: stageBit });
    };

    for (let s = 0; s < 2; s++) {
      const stage = stages[s];
      const bit = 1 << s;

      // Combined samplers (scalar or array)
      for (const samp of stage.samplers) {
        if (!samp.arrayLength) {
          registerSampler(
            samp.texVar,
            {
              publicName: samp.name,
              samplerType: samp.samplerType,
              texVar: samp.texVar,
              sampVar: samp.sampVar,
              isExpanded: false
            },
            bit
          );
          continue;
        }
        // Sampler array: remove the unsized placeholder decl and discover constant-indexed accesses
        stageRemovedSamplerVars[s].add(samp.texVar);
        stageRemovedSamplerVars[s].add(samp.sampVar);
        const re = new RegExp(`\\b${samp.texVar}_([A-Za-z0-9_]+)\\b`, "g");
        const seenIndices = new Set<number>();
        for (let m = re.exec(stage.source); m; m = re.exec(stage.source)) {
          const rawIdx = m[1];
          const resolvedIdx = /^\d+$/.test(rawIdx)
            ? Number(rawIdx)
            : resolveArrayLength(rawIdx, stage.constants, options.resolveConstant);
          if (resolvedIdx < 0 || resolvedIdx >= samp.arrayLength) {
            throw new Error(`Sampler array index out of bounds: ${samp.name}[${resolvedIdx}]`);
          }
          if (rawIdx !== String(resolvedIdx)) {
            stageReplacements[s].push([
              new RegExp(`\\b${samp.texVar}_${rawIdx}\\b`, "g"),
              `${samp.texVar}_${resolvedIdx}`
            ]);
            stageReplacements[s].push([
              new RegExp(`\\b${samp.sampVar}_${rawIdx}\\b`, "g"),
              `${samp.sampVar}_${resolvedIdx}`
            ]);
          }
          seenIndices.add(resolvedIdx);
        }
        for (const idx of seenIndices) {
          const texVar = `${samp.texVar}_${idx}`;
          const sampVar = `${samp.sampVar}_${idx}`;
          registerSampler(
            texVar,
            {
              publicName: samp.name,
              arrayIndex: idx,
              samplerType: samp.samplerType,
              texVar,
              sampVar,
              isExpanded: true
            },
            bit
          );
        }
      }

      // Opaque struct uniforms containing sampler leaves
      for (const u of stage.uniforms) {
        if (!stage.structs.has(u.glslType)) continue;
        const opaqueLeaves: Array<{ publicName: string; pathKey: string; samplerType: string; arrayLength: number }> =
          [];
        collectOpaqueSamplerPaths(u.name, u.glslType, u.arrayLength, stage.structs, opaqueLeaves);
        for (const leaf of opaqueLeaves) {
          const baseTex = `gs_wgpu_tex_${leaf.pathKey}`;
          const baseSamp = `gs_wgpu_samp_${leaf.pathKey}`;
          if (!leaf.arrayLength) {
            if (countIdentOccurrences(stage.source, baseTex) > 0) {
              registerSampler(
                baseTex,
                {
                  publicName: leaf.publicName,
                  samplerType: leaf.samplerType,
                  texVar: baseTex,
                  sampVar: baseSamp,
                  isExpanded: true
                },
                bit
              );
            }
          } else {
            const re = new RegExp(`\\b${baseTex}_([A-Za-z0-9_]+)\\b`, "g");
            const seenIndices = new Set<number>();
            for (let m = re.exec(stage.source); m; m = re.exec(stage.source)) {
              const rawIdx = m[1];
              const resolvedIdx = /^\d+$/.test(rawIdx)
                ? Number(rawIdx)
                : resolveArrayLength(rawIdx, stage.constants, options.resolveConstant);
              if (resolvedIdx < 0 || resolvedIdx >= leaf.arrayLength) {
                throw new Error(`Sampler array index out of bounds: ${leaf.publicName}[${resolvedIdx}]`);
              }
              if (rawIdx !== String(resolvedIdx)) {
                stageReplacements[s].push([new RegExp(`\\b${baseTex}_${rawIdx}\\b`, "g"), `${baseTex}_${resolvedIdx}`]);
                stageReplacements[s].push([
                  new RegExp(`\\b${baseSamp}_${rawIdx}\\b`, "g"),
                  `${baseSamp}_${resolvedIdx}`
                ]);
              }
              seenIndices.add(resolvedIdx);
            }
            for (const idx of seenIndices) {
              const texVar = `${baseTex}_${idx}`;
              const sampVar = `${baseSamp}_${idx}`;
              registerSampler(
                texVar,
                {
                  publicName: leaf.publicName,
                  arrayIndex: idx,
                  samplerType: leaf.samplerType,
                  texVar,
                  sampVar,
                  isExpanded: true
                },
                bit
              );
            }
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. Explicit Uniform Blocks (`/*@gs_ubo ...*/`)
    // -------------------------------------------------------------------------
    const uboBindings = new Map<string, IWebGPUShaderUniformBlock>();
    let autoBlockCount = 0;

    for (let s = 0; s < 2; s++) {
      const stage = stages[s];
      const bit = 1 << s;
      for (const ubo of stage.ubos) {
        const existing = uboBindings.get(ubo.binding);
        if (existing) {
          existing.visibility |= bit;
          continue;
        }
        const optBlock = options.uniformBlocks?.find(
          (b) => (b.bindingName ?? b.name) === ubo.binding || b.name === ubo.name
        );
        if (!optBlock) {
          throw new Error(`Missing std140 reflection for uniform block '${ubo.binding}'.`);
        }
        const blockName = optBlock.name;
        const group = blockName === "Scene" ? 0 : blockName === "Camera" ? 1 : 2;
        const physicalBinding = blockName === "Scene" ? 1 : blockName === "Camera" ? 2 : 3 + autoBlockCount++;
        const reflected: IWebGPUShaderUniformBlock = {
          name: blockName,
          group,
          binding: groupBinding[group]++,
          bindingName: ubo.binding,
          visibility: bit,
          physicalBinding,
          byteLength: optBlock.byteLength,
          members: optBlock.members
        };
        uboBindings.set(ubo.binding, reflected);
        reflection.uniformBlocks.push(reflected);
      }
    }

    // Annotate or unpack explicit UBOs per stage
    for (let s = 0; s < 2; s++) {
      for (const ubo of stages[s].ubos) {
        const reflected = uboBindings.get(ubo.binding)!;
        if (isNaturalStd140Block(reflected.members)) {
          stageReplacements[s].push([
            new RegExp(`\\bvar<uniform>\\s+${ubo.binding}\\s*:\\s*${ubo.type}\\s*;`),
            `@group(${reflected.group}) @binding(${reflected.binding}) var<uniform> ${ubo.binding}: ${ubo.type};`
          ]);
        } else {
          const wordCount = Math.max(1, Math.ceil(reflected.byteLength / 16));
          const rawVar = `${ubo.binding}_raw`;
          const rawType = `${ubo.type}_Raw`;
          stageReplacements[s].push([
            new RegExp(`\\bvar<uniform>\\s+${ubo.binding}\\s*:\\s*${ubo.type}\\s*;`),
            `struct ${rawType} { words: array<vec4<u32>, ${wordCount}> }\n` +
              `@group(${reflected.group}) @binding(${reflected.binding}) var<uniform> ${rawVar}: ${rawType};\n` +
              `var<private> ${ubo.binding}: ${ubo.type};`
          ]);
          stagePrologues[s].push(
            ...emitUnpackStatements(
              rawVar,
              reflected.members,
              (memberName) => `${ubo.binding}.${safeFieldName(memberName)}`,
              `gs_ui_${ubo.binding}`
            )
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // 3. GPU Instancing (optional) & Loose Uniform Packing into Auto UBOs
    // -------------------------------------------------------------------------
    const maxBlockBytes = options.maxUniformBlockBytes ?? 65536;
    let instanceLayout: IShaderInstanceLayout | undefined;
    let instanceClaimed = new Set<string>();
    let needsInstanceVarying = false;

    const nonSHUniforms = stages.map((st) => st.uniforms.filter((u) => u.name !== "scene_RealtimeEnvSH"));

    if (options.enableGPUInstancing) {
      const instResult = createShaderInstancing(
        {
          initialize: "gs_initInstance",
          index: "gs_inst_idx",
          block: "RendererInstanceData",
          struct: "gs_Instance",
          instance: "gs_instanceBuffer"
        },
        nonSHUniforms[0].map((u) => ({ name: u.name, type: u.glslType, arrayLength: u.arrayLength })),
        nonSHUniforms[1].map((u) => ({ name: u.name, type: u.glslType, arrayLength: u.arrayLength })),
        maxBlockBytes
      );
      if (!instResult) {
        return {
          vertex: "",
          fragment: "",
          vertexEntryPoint: "main",
          fragmentEntryPoint: "main",
          reflection,
          instanceOverflow: true
        };
      }
      instanceLayout = instResult.layout;
      instanceClaimed = instResult.claimed;
      const instByteLength = instanceLayout.headerBytes + instanceLayout.structSize * instanceLayout.instanceMaxCount;
      const instGroup = options.computeFeedback ? 2 : 3;
      const vertHasClaimed = nonSHUniforms[0].some((u) => instanceClaimed.has(u.name));
      const fragHasClaimed = nonSHUniforms[1].some((u) => instanceClaimed.has(u.name));
      const instVisibility = (vertHasClaimed ? 1 : 0) | (fragHasClaimed ? 2 : 0);
      if (instVisibility) {
        needsInstanceVarying = fragHasClaimed;
        const instBinding = groupBinding[instGroup]++;
        reflection.uniformBlocks.push({
          name: "Instance",
          group: instGroup,
          binding: instBinding,
          bindingName: instanceLayout.bindingName,
          visibility: instVisibility,
          physicalBinding: 0,
          byteLength: instByteLength,
          members: []
        });
        const wordCount = Math.max(1, Math.ceil(instByteLength / 16));
        const strideWords = instanceLayout.structSize / 16;
        const fieldByName = new Map(instanceLayout.fields.map((f) => [f.name, f]));

        for (let s = 0; s < 2; s++) {
          if (!(instVisibility & (1 << s))) continue;
          stageExtraDecls[s].push(
            `struct gs_Instance_Raw { words: array<vec4<u32>, ${wordCount}> }\n` +
              `@group(${instGroup}) @binding(${instBinding}) var<uniform> gs_inst_raw: gs_Instance_Raw;`
          );
          const idxExpr = s === 0 ? "i32(gs_in_instance_index)" : "gs_inst_idx";
          const modelField = fieldByName.get("renderer_ModelMat");
          let modelVar: string | undefined;
          const stageClaimed = nonSHUniforms[s].filter((u) => instanceClaimed.has(u.name));
          const needsModel = stageClaimed.some(
            (u) =>
              (u.glslType === "mat4" || u.glslType === "mat4x4") &&
              (u.name === "renderer_ModelMat" ||
                u.name === "renderer_MVMat" ||
                u.name === "renderer_MVPMat" ||
                u.name === "renderer_NormalMat")
          );
          if (needsModel && modelField) {
            modelVar = "gs_inst_model";
            const m34 = emitInstanceFieldLoad(
              "gs_inst_raw",
              "mat3x4",
              instanceLayout.headerBytes + modelField.offset,
              strideWords,
              idxExpr
            );
            stagePrologues[s].push(
              `  let gs_inst_m34 = ${m34};`,
              `  let ${modelVar} = transpose(mat4x4<f32>(gs_inst_m34[0], gs_inst_m34[1], gs_inst_m34[2], vec4<f32>(0.0, 0.0, 0.0, 1.0)));`
            );
          }
          for (const u of stageClaimed) {
            if ((u.glslType === "mat4" || u.glslType === "mat4x4") && modelVar) {
              if (u.name === "renderer_ModelMat") {
                stagePrologues[s].push(`  ${u.varName} = ${modelVar};`);
                continue;
              }
              if (u.name === "renderer_MVMat" && instanceLayout.viewOffset >= 0) {
                const view = emitInstanceFieldLoad("gs_inst_raw", "mat4", instanceLayout.viewOffset, 0, undefined);
                stagePrologues[s].push(`  ${u.varName} = (${view}) * ${modelVar};`);
                continue;
              }
              if (u.name === "renderer_MVPMat" && instanceLayout.viewProjectionOffset >= 0) {
                const vp = emitInstanceFieldLoad(
                  "gs_inst_raw",
                  "mat4",
                  instanceLayout.viewProjectionOffset,
                  0,
                  undefined
                );
                stagePrologues[s].push(`  ${u.varName} = (${vp}) * ${modelVar};`);
                continue;
              }
              if (u.name === "renderer_NormalMat") {
                stagePrologues[s].push(
                  `  { let m = mat3x3<f32>(${modelVar}[0].xyz, ${modelVar}[1].xyz, ${modelVar}[2].xyz);`,
                  `    let a = cross(m[1], m[2]); let b = cross(m[2], m[0]); let c = cross(m[0], m[1]);`,
                  `    let sgn = select(1.0, -1.0, dot(m[0], a) < 0.0);`,
                  `    ${u.varName} = mat4x4<f32>(vec4<f32>(a * sgn, 0.0), vec4<f32>(b * sgn, 0.0), vec4<f32>(c * sgn, 0.0), vec4<f32>(0.0, 0.0, 0.0, 1.0)); }`
                );
                continue;
              }
            }
            const field = fieldByName.get(u.name);
            if (!field) continue;
            const load = emitInstanceFieldLoad(
              "gs_inst_raw",
              field.type,
              instanceLayout.headerBytes + field.offset,
              strideWords,
              idxExpr
            );
            stagePrologues[s].push(`  ${u.varName} = ${load};`);
          }
        }
      }
    }

    // Handle `scene_RealtimeEnvSH` special external uniform block if present
    const shStages = stages.map((st) => st.uniforms.find((u) => u.name === "scene_RealtimeEnvSH"));
    const shVis = (shStages[0] ? 1 : 0) | (shStages[1] ? 2 : 0);
    if (shVis) {
      const shBinding = groupBinding[2]++;
      const shBlockName = "RealtimeIBLSphericalHarmonics";
      reflection.uniformBlocks.push({
        name: "Auto",
        group: 2,
        binding: shBinding,
        bindingName: shBlockName,
        visibility: shVis,
        physicalBinding: 3 + autoBlockCount++,
        byteLength: 144,
        members: [
          { name: "scene_RealtimeEnvSH", type: "vec4", offset: 0, arrayLength: 9, arrayStride: 16, matrixStride: 0 }
        ]
      });
      for (let s = 0; s < 2; s++) {
        const u = shStages[s];
        if (!u) continue;
        stageRemovedPrivateVars[s].add(u.varName);
        stageExtraDecls[s].push(
          `struct gs_RealtimeEnvSH_Block { scene_RealtimeEnvSH: array<vec4<f32>, 9> }\n` +
            `@group(2) @binding(${shBinding}) var<uniform> gs_RealtimeEnvSH: gs_RealtimeEnvSH_Block;`
        );
        stageReplacements[s].push([new RegExp(`\\b${u.varName}\\b`, "g"), "gs_RealtimeEnvSH.scene_RealtimeEnvSH"]);
      }
    }

    // Collect remaining loose uniforms across both stages
    interface MergedUniform {
      name: string;
      glslType: string;
      arrayLength: number;
      shape: Std140Shape;
      isNatural: boolean;
      perStage: Array<{ stageIdx: number; varName: string }>;
    }
    const mergedMap = new Map<string, MergedUniform>();
    const allStructs = new Map<string, StageStruct>();
    stages[0].structs.forEach((v, k) => allStructs.set(k, v));
    stages[1].structs.forEach((v, k) => allStructs.set(k, v));

    for (let s = 0; s < 2; s++) {
      for (const u of nonSHUniforms[s]) {
        if (instanceClaimed.has(u.name)) continue;
        const existing = mergedMap.get(u.name);
        if (existing) {
          existing.perStage.push({ stageIdx: s, varName: u.varName });
          continue;
        }
        const shape = reflectStd140(u.name, u.glslType, u.arrayLength, allStructs);
        if (!shape || !shape.members.length) {
          // Pure opaque struct (only samplers, no numeric members) -> drop unused private struct var if unreferenced
          continue;
        }
        const natural =
          !allStructs.has(u.glslType) && shape.members.length === 1 && isNaturalStd140Member(shape.members[0]);
        mergedMap.set(u.name, {
          name: u.name,
          glslType: u.glslType,
          arrayLength: u.arrayLength,
          shape,
          isNatural: natural,
          perStage: [{ stageIdx: s, varName: u.varName }]
        });
      }
    }

    // Pack merged uniforms into Auto UBOs: separate direct (zero-copy) and unpacked (std140 word-read) pages
    interface AutoPage {
      natural: boolean;
      visibility: number;
      byteLength: number;
      members: IShaderUniformBlockMember[];
      items: MergedUniform[];
    }
    const autoPages: AutoPage[] = [];
    const openPage = new Map<string, AutoPage>();

    for (const item of mergedMap.values()) {
      const vis = item.perStage.reduce((m, p) => m | (1 << p.stageIdx), 0);
      const key = `${item.isNatural ? "D" : "U"}:${vis}`;
      let page = openPage.get(key);
      let offset = page ? roundUp(page.byteLength, item.shape.alignment) : 0;
      if (!page || roundUp(offset + item.shape.size, 16) > maxBlockBytes) {
        page = { natural: item.isNatural, visibility: vis, byteLength: 0, members: [], items: [] };
        autoPages.push(page);
        openPage.set(key, page);
        offset = 0;
      }
      for (const m of item.shape.members) {
        page.members.push({ ...m, offset: offset + m.offset });
      }
      page.byteLength = offset + item.shape.size;
      page.items.push(item);
    }

    // Emit Auto UBO declarations & bindings
    let autoOrdinal = 0;
    for (const page of autoPages) {
      page.byteLength = Math.max(16, roundUp(page.byteLength, 16));
      const bindingName = `gs_Auto_${autoOrdinal++}`;
      const binding = groupBinding[2]++;
      const reflected: IWebGPUShaderUniformBlock = {
        name: "Auto",
        group: 2,
        binding,
        bindingName,
        visibility: page.visibility,
        physicalBinding: 3 + autoBlockCount++,
        byteLength: page.byteLength,
        members: page.members
      };
      reflection.uniformBlocks.push(reflected);

      if (page.natural) {
        const fields = page.items.map((item) => {
          const wgslT = glslTypeToWGSL(
            item.arrayLength ? { base: item.glslType, arraySize: String(item.arrayLength) } : { base: item.glslType }
          );
          return `  ${safeFieldName(item.name)}: ${wgslT},`;
        });
        const decl =
          `struct ${bindingName}_Block {\n${fields.join("\n")}\n}\n` +
          `@group(2) @binding(${binding}) var<uniform> ${bindingName}: ${bindingName}_Block;`;
        for (let s = 0; s < 2; s++) {
          if (!(page.visibility & (1 << s))) continue;
          stageExtraDecls[s].push(decl);
          for (const item of page.items) {
            const p = item.perStage.find((x) => x.stageIdx === s);
            if (!p) continue;
            stageRemovedPrivateVars[s].add(p.varName);
            stageReplacements[s].push([
              new RegExp(`\\b${p.varName}\\b`, "g"),
              `${bindingName}.${safeFieldName(item.name)}`
            ]);
          }
        }
      } else {
        const wordCount = Math.max(1, Math.ceil(page.byteLength / 16));
        const rawVar = `${bindingName}_raw`;
        const decl =
          `struct ${bindingName}_Raw { words: array<vec4<u32>, ${wordCount}> }\n` +
          `@group(2) @binding(${binding}) var<uniform> ${rawVar}: ${bindingName}_Raw;`;
        for (let s = 0; s < 2; s++) {
          if (!(page.visibility & (1 << s))) continue;
          stageExtraDecls[s].push(decl);
          const stageVarByRoot = new Map<string, string>();
          for (const item of page.items) {
            const p = item.perStage.find((x) => x.stageIdx === s);
            if (p) stageVarByRoot.set(item.name, p.varName);
          }
          // Only unpack members whose root uniform is actually declared in this stage
          const stageMembers = page.members.filter((m) => {
            const root = m.name.split(/[.[]/)[0];
            return stageVarByRoot.has(root);
          });
          stagePrologues[s].push(
            ...emitUnpackStatements(
              rawVar,
              stageMembers,
              (memberName) => {
                const match = /^([A-Za-z_]\w*)(.*)$/.exec(memberName)!;
                const rootVar = stageVarByRoot.get(match[1])!;
                // Safe-rename any struct field segment that collides with WGSL keywords
                const suffix = match[2].replace(/\.([A-Za-z_]\w*)/g, (_, f: string) => `.${safeFieldName(f)}`);
                return `${rootVar}${suffix}`;
              },
              `gs_au_${autoOrdinal}`
            )
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // 4. Texture & Sampler Bindings
    // -------------------------------------------------------------------------
    for (const entry of resolvedSamplers.values()) {
      const group = resourceGroup(entry.publicName, options.computeFeedback);
      const texBinding = groupBinding[group];
      groupBinding[group] += 2;
      const texRef = makeTextureReflection(
        entry.publicName,
        entry.samplerType,
        group,
        texBinding,
        entry.visibility,
        options,
        entry.arrayIndex
      );
      reflection.textures.push(texRef);

      const texType = samplerToWGSLTexType(entry.samplerType);
      const sampType = samplerToWGSLSampType(entry.samplerType);
      for (let s = 0; s < 2; s++) {
        if (!(entry.visibility & (1 << s))) continue;
        if (entry.isExpanded) {
          stageExtraDecls[s].push(
            `@group(${group}) @binding(${texBinding}) var ${entry.texVar}: ${texType};\n` +
              `@group(${group}) @binding(${texBinding + 1}) var ${entry.sampVar}: ${sampType};`
          );
        } else {
          stageReplacements[s].push([
            new RegExp(`\\bvar\\s+${entry.texVar}\\s*:\\s*${texType.replace(/[<>*]/g, "\\$&")}\\s*;`),
            `@group(${group}) @binding(${texBinding}) var ${entry.texVar}: ${texType};`
          ]);
          stageReplacements[s].push([
            new RegExp(`\\bvar\\s+${entry.sampVar}\\s*:\\s*${sampType}\\s*;`),
            `@group(${group}) @binding(${texBinding + 1}) var ${entry.sampVar}: ${sampType};`
          ]);
        }
      }
    }

    // -------------------------------------------------------------------------
    // 4b. Storage Buffers & Storage Textures (WebGPU-only in raster passes)
    // -------------------------------------------------------------------------
    const ssboBindings = new Map<string, IWebGPUShaderStorageBuffer>();
    for (let s = 0; s < 2; s++) {
      const bit = 1 << s;
      for (const ssbo of stages[s].ssbos) {
        const existing = ssboBindings.get(ssbo.name);
        if (existing) {
          existing.visibility |= bit;
          if (ssbo.access === "read_write") existing.access = "read_write";
          continue;
        }
        const group = ssbo.name.startsWith("scene_")
          ? 0
          : ssbo.name.startsWith("camera_")
            ? 1
            : ssbo.name.startsWith("renderer_")
              ? 3
              : 2;
        const binding = groupBinding[group]++;
        const reflected: IWebGPUShaderStorageBuffer = {
          name: ssbo.name,
          group,
          binding,
          visibility: bit,
          access: ssbo.access
        };
        ssboBindings.set(ssbo.name, reflected);
        (reflection.storageBuffers ??= []).push(reflected);
      }
    }
    for (let s = 0; s < 2; s++) {
      for (const ssbo of stages[s].ssbos) {
        const reflected = ssboBindings.get(ssbo.name)!;
        stageReplacements[s].push([
          new RegExp(`\\bvar<storage,\\s*(?:read|read_write)>\\s+${ssbo.binding}\\s*:\\s*${ssbo.type}\\s*;`),
          `@group(${reflected.group}) @binding(${reflected.binding}) var<storage, ${reflected.access}> ${ssbo.binding}: ${ssbo.type};`
        ]);
      }
    }

    const stexBindings = new Map<string, IWebGPUShaderStorageTexture>();
    for (let s = 0; s < 2; s++) {
      const bit = 1 << s;
      for (const stex of stages[s].storageTextures) {
        const existing = stexBindings.get(stex.name);
        if (existing) {
          existing.visibility |= bit;
          continue;
        }
        const group = stex.name.startsWith("scene_")
          ? 0
          : stex.name.startsWith("camera_")
            ? 1
            : stex.name.startsWith("renderer_")
              ? 3
              : 2;
        const binding = groupBinding[group]++;
        const reflected: IWebGPUShaderStorageTexture = {
          name: stex.name,
          group,
          binding,
          visibility: bit,
          format: stex.format,
          access: stex.access,
          viewDimension: "2d"
        };
        stexBindings.set(stex.name, reflected);
        (reflection.storageTextures ??= []).push(reflected);
      }
    }
    for (let s = 0; s < 2; s++) {
      for (const stex of stages[s].storageTextures) {
        const reflected = stexBindings.get(stex.name)!;
        stageReplacements[s].push([
          new RegExp(
            `\\bvar\\s+${stex.varName}\\s*:\\s*texture_storage_2d<${stex.format},\\s*${stex.wgslAccess}>\\s*;`
          ),
          `@group(${reflected.group}) @binding(${reflected.binding}) var ${stex.varName}: texture_storage_2d<${stex.format}, ${stex.wgslAccess}>;`
        ]);
      }
    }

    // -------------------------------------------------------------------------
    // 5. Stage IO Locations & Entry Point Synthesis
    // -------------------------------------------------------------------------
    const varyingLocations = new Map<string, number>();
    let nextVaryingLoc = 0;
    const assignVaryingLoc = (name: string): number => {
      let loc = varyingLocations.get(name);
      if (loc === undefined) {
        loc = nextVaryingLoc++;
        varyingLocations.set(name, loc);
      }
      return loc;
    };

    // Vertex inputs
    const vertInParams: string[] = [];
    const vertInInit: string[] = [];
    stages[0].inputs.forEach((inp, loc) => {
      const attr = attributeFromGLSL(inp.name, inp.glslType, loc);
      const declaredType = attr.type;
      attr.type = options.vertexInputTypes?.[inp.name] ?? declaredType;
      reflection.vertexInputs.push(attr);
      const paramName = `gs_vin_${inp.name}`;
      const paramWgslType = wgslTypeForAttribute(attr);
      const varWgslType = glslBaseToWGSL(inp.glslType);
      vertInParams.push(`@location(${loc}) ${paramName}: ${paramWgslType}`);
      if (attr.type !== declaredType) {
        vertInInit.push(`  ${inp.varName} = ${varWgslType}(${paramName});`);
      } else {
        vertInInit.push(`  ${inp.varName} = ${paramName};`);
      }
    });

    // Vertex builtins
    const vertUsesVertexIndex =
      stages[0].builtins.has("vertex_index") && countIdentOccurrences(stages[0].source, "gs_gl_VertexIndex") > 1;
    const vertUsesInstanceIndex =
      (stages[0].builtins.has("instance_index") &&
        countIdentOccurrences(stages[0].source, "gs_gl_InstanceIndex") > 1) ||
      !!instanceLayout;
    if (vertUsesVertexIndex) {
      vertInParams.push("@builtin(vertex_index) gs_in_vertex_index: u32");
      vertInInit.push("  gs_gl_VertexIndex = gs_in_vertex_index;");
    }
    if (vertUsesInstanceIndex) {
      vertInParams.push("@builtin(instance_index) gs_in_instance_index: u32");
      if (stages[0].builtins.has("instance_index")) {
        vertInInit.push("  gs_gl_InstanceIndex = gs_in_instance_index;");
      }
    }

    // Vertex outputs (and GPU instancing flat varying)
    const vertOutFields: string[] = ["  @builtin(position) position: vec4<f32>,"];
    const vertOutAssigns: string[] = ["  gs_vout.position = gs_gl_Position;"];
    for (const out of stages[0].outputs) {
      const loc = assignVaryingLoc(out.name);
      reflection.vertexOutputs.push(attributeFromGLSL(out.name, out.glslType, loc));
      const interp = out.flat ? "@interpolate(flat) " : out.centroid ? "@interpolate(perspective, centroid) " : "";
      const fieldName = safeFieldName(`v_${out.name}`);
      vertOutFields.push(`  @location(${loc}) ${interp}${fieldName}: ${glslBaseToWGSL(out.glslType)},`);
      vertOutAssigns.push(`  gs_vout.${fieldName} = ${out.varName};`);
    }
    let instVaryingLoc = -1;
    if (needsInstanceVarying) {
      instVaryingLoc = assignVaryingLoc("gs_inst_idx");
      vertOutFields.push(`  @location(${instVaryingLoc}) @interpolate(flat) gs_inst_idx: i32,`);
      vertOutAssigns.push("  gs_vout.gs_inst_idx = i32(gs_in_instance_index);");
    }

    const vertexEntryCode =
      `struct VertexOutput {\n${vertOutFields.join("\n")}\n}\n` +
      `@vertex fn main(${vertInParams.join(", ")}) -> VertexOutput {\n` +
      [
        ...vertInInit,
        ...stagePrologues[0],
        stages[0].entryBody,
        "  var gs_vout: VertexOutput;",
        ...vertOutAssigns,
        "  return gs_vout;"
      ]
        .filter(Boolean)
        .join("\n") +
      "\n}";

    // Fragment inputs & builtins
    const fragInParams: string[] = [];
    const fragInInit: string[] = [];
    for (const inp of stages[1].inputs) {
      const loc = assignVaryingLoc(inp.name);
      const interp = inp.flat ? "@interpolate(flat) " : inp.centroid ? "@interpolate(perspective, centroid) " : "";
      const paramName = `gs_fin_${inp.name}`;
      fragInParams.push(`@location(${loc}) ${interp}${paramName}: ${glslBaseToWGSL(inp.glslType)}`);
      fragInInit.push(`  ${inp.varName} = ${paramName};`);
    }
    if (needsInstanceVarying) {
      fragInParams.push(`@location(${instVaryingLoc}) @interpolate(flat) gs_inst_idx: i32`);
    }
    const fragUsesFragCoord =
      stages[1].builtins.has("frag_coord") && countIdentOccurrences(stages[1].source, "gs_gl_FragCoord") > 1;
    const fragUsesFrontFacing =
      stages[1].builtins.has("front_facing") && countIdentOccurrences(stages[1].source, "gs_gl_FrontFacing") > 1;
    const fragUsesFragDepth =
      stages[1].builtins.has("frag_depth") && countIdentOccurrences(stages[1].source, "gs_gl_FragDepth") > 1;
    if (fragUsesFragCoord) {
      fragInParams.push("@builtin(position) gs_in_frag_coord: vec4<f32>");
      fragInInit.push("  gs_gl_FragCoord = gs_in_frag_coord;");
    }
    if (fragUsesFrontFacing) {
      fragInParams.push("@builtin(front_facing) gs_in_front_facing: bool");
      fragInInit.push("  gs_gl_FrontFacing = gs_in_front_facing;");
    }

    // Fragment MRT outputs + optional depth
    const sortedMRTs = stages[1].mrts.slice().sort((a, b) => a.loc - b.loc);
    const fragOutFields: string[] = [];
    const fragOutAssigns: string[] = [];
    for (const mrt of sortedMRTs) {
      reflection.fragmentOutputs.push(mrt.loc);
      const fieldName = `out_${mrt.loc}`;
      fragOutFields.push(`  @location(${mrt.loc}) ${fieldName}: ${glslBaseToWGSL(mrt.glslType)},`);
      fragOutAssigns.push(`  gs_fout.${fieldName} = ${mrt.varName};`);
    }
    if (fragUsesFragDepth) {
      fragOutFields.push("  @builtin(frag_depth) frag_depth: f32,");
      fragOutAssigns.push("  gs_fout.frag_depth = gs_gl_FragDepth;");
    }

    const hasFragOut = fragOutFields.length > 0;
    const fragmentEntryCode = hasFragOut
      ? `struct FragmentOutput {\n${fragOutFields.join("\n")}\n}\n` +
        `@fragment fn main(${fragInParams.join(", ")}) -> FragmentOutput {\n` +
        [
          ...fragInInit,
          ...stagePrologues[1],
          stages[1].entryBody,
          "  var gs_fout: FragmentOutput;",
          ...fragOutAssigns,
          "  return gs_fout;"
        ]
          .filter(Boolean)
          .join("\n") +
        "\n}"
      : `@fragment fn main(${fragInParams.join(", ")}) {\n` +
        [...fragInInit, ...stagePrologues[1], stages[1].entryBody].filter(Boolean).join("\n") +
        "\n}";

    // -------------------------------------------------------------------------
    // 6. Assemble Final WGSL Modules
    // -------------------------------------------------------------------------
    const assemble = (stageIdx: number, entryCode: string): string => {
      let src = stages[stageIdx].source;
      // Remove replaced private uniform declarations
      for (const v of stageRemovedPrivateVars[stageIdx]) {
        src = src.replace(new RegExp(`^[ \\t]*var<private>\\s+${v}\\s*:[^;]+;[ \\t]*\\n?`, "gm"), "");
      }
      // Remove replaced unsized sampler array placeholder declarations
      for (const v of stageRemovedSamplerVars[stageIdx]) {
        src = src.replace(new RegExp(`^[ \\t]*var\\s+${v}\\s*:[^;]+;[ \\t]*\\n?`, "gm"), "");
      }
      // Apply targeted replacements (UBO bindings, direct uniform accesses, sampler bindings)
      for (const [pattern, replacement] of stageReplacements[stageIdx]) {
        src = src.replace(pattern, replacement);
      }
      // Replace entry placeholder with synthesized @vertex / @fragment entry
      if (/\/\*@gs_entry_begin\*\/[\s\S]*?\/\*@gs_entry_end\*\//.test(src)) {
        src = src.replace(/\/\*@gs_entry_begin\*\/[\s\S]*?\/\*@gs_entry_end\*\//, entryCode);
      } else {
        src = `${src}\n${entryCode}`;
      }
      // Strip all remaining `/*@gs_...*/` markers
      src = src.replace(/\/\*@gs_\w+[^]*?\*\/\n?/g, "");
      const extra = stageExtraDecls[stageIdx].join("\n");
      return `diagnostic(off, derivative_uniformity);\n${extra ? `${extra}\n` : ""}${src}`;
    };

    const rawModules = [assemble(0, vertexEntryCode), assemble(1, fragmentEntryCode)];
    for (const moduleSource of rawModules) {
      validateStageStructFields(moduleSource);
    }

    // -------------------------------------------------------------------------
    // 7. Post-Link Sampler Elision, Texture View Packing & Sampler Pooling
    // -------------------------------------------------------------------------
    const cleaned = rawModules.map((m) => removeUnusedSamplers(m));
    for (const tex of reflection.textures) {
      const key = `${tex.group}:${tex.samplerBinding}`;
      const vis = (cleaned[0].bindings.has(key) ? 1 : 0) | (cleaned[1].bindings.has(key) ? 2 : 0);
      if (vis) {
        tex.samplerVisibility = vis;
      } else {
        delete tex.samplerBinding;
        delete tex.samplerType;
        if (tex.sampleType === "float") tex.sampleType = "unfilterable-float";
      }
    }

    let modules = cleaned.map((c) => c.source);
    modules = fitTextureBindings(modules, reflection, options);

    const samplerLimit = options.maxSamplersPerStage ?? 16;
    for (const stageBit of [1, 2]) {
      if (reflection.textures.filter((t) => (t.samplerVisibility ?? 0) & stageBit).length > samplerLimit) {
        reflection.requiresSamplerKeys = true;
      }
    }
    if (reflection.requiresSamplerKeys) {
      modules = poolSamplerBindings(modules, reflection.textures, options.samplerKeys);
      for (const stageBit of [1, 2]) {
        const unique = new Set(
          reflection.textures
            .filter((t) => (t.samplerVisibility ?? 0) & stageBit)
            .map((t) => `${t.group}:${t.samplerBinding}`)
        );
        if (unique.size > samplerLimit) {
          throw new Error(
            `WebGPU ${stageBit === 1 ? "vertex" : "fragment"} stage needs ${unique.size} distinct sampler bindings, exceeding the sampler limit of ${samplerLimit}. Resources: ${describeTextureBindings(
              reflection.textures.filter((t) => (t.samplerVisibility ?? 0) & stageBit),
              options
            )}.`
          );
        }
      }
    }

    return {
      vertex: modules[0],
      fragment: modules[1],
      vertexEntryPoint: "main",
      fragmentEntryPoint: "main",
      reflection,
      instanceLayout
    };
  }

  /**
   * Link a single-AST WGSL compute stage into a runnable `IWebGPUComputeProgram`.
   * All resources (UBOs, Auto UBOs, storage buffers, sampled textures, storage textures)
   * are placed sequentially into `@group(0)` with `GPUShaderStage.COMPUTE` (4) visibility.
   */
  linkCompute(computeWGSL: string, options: IWebGPUComputeOptions = {}): IWebGPUComputeProgram {
    const COMPUTE_VISIBILITY = 4; // GPUShaderStage.COMPUTE
    const stage = parseStage(computeWGSL, options.resolveConstant);
    const workgroupSize: readonly [number, number, number] = options.workgroupSize ?? [1, 1, 1];
    const reflection: IWebGPUComputeReflection = {
      uniformBlocks: [],
      storageBuffers: [],
      textures: [],
      storageTextures: [],
      workgroupSize
    };

    let nextBinding = 0;
    const prologue: string[] = [];
    const extraDecls: string[] = [];
    const replacements: Array<[RegExp, string]> = [];
    const removedPrivateVars = new Set<string>();
    const removedSamplerVars = new Set<string>();

    // 1. Explicit Uniform Blocks
    let autoBlockCount = 0;
    for (const ubo of stage.ubos) {
      const optBlock = options.uniformBlocks?.find(
        (b) => (b.bindingName ?? b.name) === ubo.binding || b.name === ubo.name
      );
      if (!optBlock) {
        throw new Error(`Missing std140 reflection for compute uniform block '${ubo.binding}'.`);
      }
      const binding = nextBinding++;
      const reflected: IWebGPUShaderUniformBlock = {
        name: optBlock.name,
        group: 0,
        binding,
        bindingName: ubo.binding,
        visibility: COMPUTE_VISIBILITY,
        physicalBinding: autoBlockCount++,
        byteLength: optBlock.byteLength,
        members: optBlock.members
      };
      reflection.uniformBlocks.push(reflected);
      if (isNaturalStd140Block(reflected.members)) {
        replacements.push([
          new RegExp(`\\bvar<uniform>\\s+${ubo.binding}\\s*:\\s*${ubo.type}\\s*;`),
          `@group(0) @binding(${binding}) var<uniform> ${ubo.binding}: ${ubo.type};`
        ]);
      } else {
        const wordCount = Math.max(1, Math.ceil(reflected.byteLength / 16));
        const rawVar = `${ubo.binding}_raw`;
        const rawType = `${ubo.type}_Raw`;
        replacements.push([
          new RegExp(`\\bvar<uniform>\\s+${ubo.binding}\\s*:\\s*${ubo.type}\\s*;`),
          `struct ${rawType} { words: array<vec4<u32>, ${wordCount}> }\n` +
            `@group(0) @binding(${binding}) var<uniform> ${rawVar}: ${rawType};\n` +
            `var<private> ${ubo.binding}: ${ubo.type};`
        ]);
        prologue.push(
          ...emitUnpackStatements(
            rawVar,
            reflected.members,
            (memberName) => `${ubo.binding}.${safeFieldName(memberName)}`,
            `gs_ui_${ubo.binding}`
          )
        );
      }
    }

    // 2. Loose Uniforms -> std140 Auto UBOs in @group(0)
    const maxBlockBytes = options.maxUniformBlockBytes ?? 65536;
    interface ComputeAutoItem {
      name: string;
      varName: string;
      glslType: string;
      arrayLength: number;
      shape: Std140Shape;
      isNatural: boolean;
    }
    const autoItems: ComputeAutoItem[] = [];
    for (const u of stage.uniforms) {
      const shape = reflectStd140(u.name, u.glslType, u.arrayLength, stage.structs);
      if (!shape || !shape.members.length) continue;
      const isNatural =
        !stage.structs.has(u.glslType) && shape.members.length === 1 && isNaturalStd140Member(shape.members[0]);
      autoItems.push({
        name: u.name,
        varName: u.varName,
        glslType: u.glslType,
        arrayLength: u.arrayLength,
        shape,
        isNatural
      });
    }

    interface ComputeAutoPage {
      natural: boolean;
      byteLength: number;
      members: IShaderUniformBlockMember[];
      items: ComputeAutoItem[];
    }
    const autoPages: ComputeAutoPage[] = [];
    const openPage = new Map<string, ComputeAutoPage>();
    for (const item of autoItems) {
      const key = item.isNatural ? "D" : "U";
      let page = openPage.get(key);
      let offset = page ? roundUp(page.byteLength, item.shape.alignment) : 0;
      if (!page || roundUp(offset + item.shape.size, 16) > maxBlockBytes) {
        page = { natural: item.isNatural, byteLength: 0, members: [], items: [] };
        autoPages.push(page);
        openPage.set(key, page);
        offset = 0;
      }
      for (const m of item.shape.members) {
        page.members.push({ ...m, offset: offset + m.offset });
      }
      page.byteLength = offset + item.shape.size;
      page.items.push(item);
    }

    let autoOrdinal = 0;
    for (const page of autoPages) {
      page.byteLength = Math.max(16, roundUp(page.byteLength, 16));
      const bindingName = `gs_Auto_${autoOrdinal++}`;
      const binding = nextBinding++;
      reflection.uniformBlocks.push({
        name: "Auto",
        group: 0,
        binding,
        bindingName,
        visibility: COMPUTE_VISIBILITY,
        physicalBinding: autoBlockCount++,
        byteLength: page.byteLength,
        members: page.members
      });
      if (page.natural) {
        const fields = page.items.map((item) => {
          const wgslT = glslTypeToWGSL(
            item.arrayLength ? { base: item.glslType, arraySize: String(item.arrayLength) } : { base: item.glslType }
          );
          return `  ${safeFieldName(item.name)}: ${wgslT},`;
        });
        extraDecls.push(
          `struct ${bindingName}_Block {\n${fields.join("\n")}\n}\n` +
            `@group(0) @binding(${binding}) var<uniform> ${bindingName}: ${bindingName}_Block;`
        );
        for (const item of page.items) {
          removedPrivateVars.add(item.varName);
          replacements.push([new RegExp(`\\b${item.varName}\\b`, "g"), `${bindingName}.${safeFieldName(item.name)}`]);
        }
      } else {
        const wordCount = Math.max(1, Math.ceil(page.byteLength / 16));
        const rawVar = `${bindingName}_raw`;
        extraDecls.push(
          `struct ${bindingName}_Raw { words: array<vec4<u32>, ${wordCount}> }\n` +
            `@group(0) @binding(${binding}) var<uniform> ${rawVar}: ${bindingName}_Raw;`
        );
        const varByRoot = new Map(page.items.map((item) => [item.name, item.varName]));
        prologue.push(
          ...emitUnpackStatements(
            rawVar,
            page.members,
            (memberName) => {
              const match = /^([A-Za-z_]\w*)(.*)$/.exec(memberName)!;
              const rootVar = varByRoot.get(match[1])!;
              const suffix = match[2].replace(/\.([A-Za-z_]\w*)/g, (_, f: string) => `.${safeFieldName(f)}`);
              return `${rootVar}${suffix}`;
            },
            `gs_au_${autoOrdinal}`
          )
        );
      }
    }

    // 3. Storage Buffers (SSBO)
    for (const ssbo of stage.ssbos) {
      const binding = nextBinding++;
      reflection.storageBuffers.push({
        name: ssbo.name,
        group: 0,
        binding,
        visibility: COMPUTE_VISIBILITY,
        access: ssbo.access
      });
      replacements.push([
        new RegExp(`\\bvar<storage,\\s*(?:read|read_write)>\\s+${ssbo.binding}\\s*:\\s*${ssbo.type}\\s*;`),
        `@group(0) @binding(${binding}) var<storage, ${ssbo.access}> ${ssbo.binding}: ${ssbo.type};`
      ]);
    }

    // 4. Sampled Textures & Samplers
    for (const samp of stage.samplers) {
      const texType = samplerToWGSLTexType(samp.samplerType);
      const sampType = samplerToWGSLSampType(samp.samplerType);
      if (!samp.arrayLength) {
        const texBinding = nextBinding;
        nextBinding += 2;
        reflection.textures.push(
          makeTextureReflection(samp.name, samp.samplerType, 0, texBinding, COMPUTE_VISIBILITY, {
            unfilterableTextures: options.unfilterableTextures
          })
        );
        replacements.push([
          new RegExp(`\\bvar\\s+${samp.texVar}\\s*:\\s*${texType.replace(/[<>*]/g, "\\$&")}\\s*;`),
          `@group(0) @binding(${texBinding}) var ${samp.texVar}: ${texType};`
        ]);
        replacements.push([
          new RegExp(`\\bvar\\s+${samp.sampVar}\\s*:\\s*${sampType}\\s*;`),
          `@group(0) @binding(${texBinding + 1}) var ${samp.sampVar}: ${sampType};`
        ]);
      } else {
        removedSamplerVars.add(samp.texVar);
        removedSamplerVars.add(samp.sampVar);
        const re = new RegExp(`\\b${samp.texVar}_([A-Za-z0-9_]+)\\b`, "g");
        const seenIndices = new Set<number>();
        for (let m = re.exec(stage.source); m; m = re.exec(stage.source)) {
          const rawIdx = m[1];
          const resolvedIdx = /^\d+$/.test(rawIdx)
            ? Number(rawIdx)
            : resolveArrayLength(rawIdx, stage.constants, options.resolveConstant);
          if (rawIdx !== String(resolvedIdx)) {
            replacements.push([new RegExp(`\\b${samp.texVar}_${rawIdx}\\b`, "g"), `${samp.texVar}_${resolvedIdx}`]);
            replacements.push([new RegExp(`\\b${samp.sampVar}_${rawIdx}\\b`, "g"), `${samp.sampVar}_${resolvedIdx}`]);
          }
          seenIndices.add(resolvedIdx);
        }
        for (const idx of seenIndices) {
          const texBinding = nextBinding;
          nextBinding += 2;
          reflection.textures.push(
            makeTextureReflection(
              samp.name,
              samp.samplerType,
              0,
              texBinding,
              COMPUTE_VISIBILITY,
              { unfilterableTextures: options.unfilterableTextures },
              idx
            )
          );
          extraDecls.push(
            `@group(0) @binding(${texBinding}) var ${samp.texVar}_${idx}: ${texType};\n` +
              `@group(0) @binding(${texBinding + 1}) var ${samp.sampVar}_${idx}: ${sampType};`
          );
        }
      }
    }

    // 5. Storage Textures (`image2D` / `iimage2D` / `uimage2D`)
    for (const stex of stage.storageTextures) {
      const binding = nextBinding++;
      reflection.storageTextures.push({
        name: stex.name,
        group: 0,
        binding,
        visibility: COMPUTE_VISIBILITY,
        format: stex.format,
        access: stex.access,
        viewDimension: "2d"
      });
      replacements.push([
        new RegExp(`\\bvar\\s+${stex.varName}\\s*:\\s*texture_storage_2d<${stex.format},\\s*${stex.wgslAccess}>\\s*;`),
        `@group(0) @binding(${binding}) var ${stex.varName}: texture_storage_2d<${stex.format}, ${stex.wgslAccess}>;`
      ]);
    }

    // 6. Compute Entry Point Synthesis
    const inParams: string[] = [];
    const inInit: string[] = [];
    if (
      stage.builtins.has("global_invocation_id") &&
      countIdentOccurrences(stage.source, "gs_gl_GlobalInvocationID") > 1
    ) {
      inParams.push("@builtin(global_invocation_id) gs_in_global_invocation_id: vec3<u32>");
      inInit.push("  gs_gl_GlobalInvocationID = gs_in_global_invocation_id;");
    }
    if (
      stage.builtins.has("local_invocation_id") &&
      countIdentOccurrences(stage.source, "gs_gl_LocalInvocationID") > 1
    ) {
      inParams.push("@builtin(local_invocation_id) gs_in_local_invocation_id: vec3<u32>");
      inInit.push("  gs_gl_LocalInvocationID = gs_in_local_invocation_id;");
    }
    if (stage.builtins.has("workgroup_id") && countIdentOccurrences(stage.source, "gs_gl_WorkGroupID") > 1) {
      inParams.push("@builtin(workgroup_id) gs_in_workgroup_id: vec3<u32>");
      inInit.push("  gs_gl_WorkGroupID = gs_in_workgroup_id;");
    }
    if (stage.builtins.has("num_workgroups") && countIdentOccurrences(stage.source, "gs_gl_NumWorkGroups") > 1) {
      inParams.push("@builtin(num_workgroups) gs_in_num_workgroups: vec3<u32>");
      inInit.push("  gs_gl_NumWorkGroups = gs_in_num_workgroups;");
    }
    if (
      stage.builtins.has("local_invocation_index") &&
      countIdentOccurrences(stage.source, "gs_gl_LocalInvocationIndex") > 1
    ) {
      inParams.push("@builtin(local_invocation_index) gs_in_local_invocation_index: u32");
      inInit.push("  gs_gl_LocalInvocationIndex = gs_in_local_invocation_index;");
    }

    const [wx, wy, wz] = workgroupSize;
    const entryCode =
      `@compute @workgroup_size(${wx}, ${wy}, ${wz}) fn main(${inParams.join(", ")}) {\n` +
      [...inInit, ...prologue, stage.entryBody].filter(Boolean).join("\n") +
      "\n}";

    // 7. Assemble Final WGSL Module
    let src = stage.source;
    for (const v of removedPrivateVars) {
      src = src.replace(new RegExp(`^[ \\t]*var<private>\\s+${v}\\s*:[^;]+;[ \\t]*\\n?`, "gm"), "");
    }
    for (const v of removedSamplerVars) {
      src = src.replace(new RegExp(`^[ \\t]*var\\s+${v}\\s*:[^;]+;[ \\t]*\\n?`, "gm"), "");
    }
    for (const [pattern, replacement] of replacements) {
      src = src.replace(pattern, replacement);
    }
    if (/\/\*@gs_entry_begin\*\/[\s\S]*?\/\*@gs_entry_end\*\//.test(src)) {
      src = src.replace(/\/\*@gs_entry_begin\*\/[\s\S]*?\/\*@gs_entry_end\*\//, entryCode);
    } else {
      src = `${src}\n${entryCode}`;
    }
    src = src.replace(/\/\*@gs_\w+[^]*?\*\/\n?/g, "");
    const extra = extraDecls.join("\n");
    const assembled = `${extra ? `${extra}\n` : ""}${src}`;
    validateStageStructFields(assembled);

    const cleaned = removeUnusedSamplers(assembled);
    for (const tex of reflection.textures) {
      const key = `${tex.group}:${tex.samplerBinding}`;
      if (cleaned.bindings.has(key)) {
        tex.samplerVisibility = COMPUTE_VISIBILITY;
      } else {
        delete tex.samplerBinding;
        delete tex.samplerType;
        if (tex.sampleType === "float") tex.sampleType = "unfilterable-float";
      }
    }

    return {
      compute: cleaned.source,
      entryPoint: "main",
      reflection
    };
  }
}
