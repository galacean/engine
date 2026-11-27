import { type GalaceanDataType, Keyword, TypeAny } from "@galacean/engine-shader-parser/internal";

/** Normalized GLSL/ShaderLab type descriptor used during WGSL code generation. */
export interface WGSLTypeDesc {
  /** Base type name (GLSL spelling like `float`, `vec3`, `mat4`, `sampler2D`, or struct name, or `unknown`). */
  base: string;
  /** Optional array extent expression string (undefined = scalar/non-array, "" = unsized `[]`). */
  arraySize?: string;
}

export const WT_VOID: WGSLTypeDesc = { base: "void" };
export const WT_BOOL: WGSLTypeDesc = { base: "bool" };
export const WT_INT: WGSLTypeDesc = { base: "int" };
export const WT_UINT: WGSLTypeDesc = { base: "uint" };
export const WT_FLOAT: WGSLTypeDesc = { base: "float" };
export const WT_VEC2: WGSLTypeDesc = { base: "vec2" };
export const WT_VEC3: WGSLTypeDesc = { base: "vec3" };
export const WT_VEC4: WGSLTypeDesc = { base: "vec4" };
export const WT_IVEC2: WGSLTypeDesc = { base: "ivec2" };
export const WT_IVEC3: WGSLTypeDesc = { base: "ivec3" };
export const WT_IVEC4: WGSLTypeDesc = { base: "ivec4" };
export const WT_UVEC2: WGSLTypeDesc = { base: "uvec2" };
export const WT_UVEC3: WGSLTypeDesc = { base: "uvec3" };
export const WT_UVEC4: WGSLTypeDesc = { base: "uvec4" };
export const WT_UNKNOWN: WGSLTypeDesc = { base: "unknown" };

/** WGSL keywords, reserved words, and predeclared type/builtin identifiers that user identifiers must not shadow. */
export const WGSL_RESERVED = new Set(
  (
    "alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if " +
    "let loop override requires return struct switch true var while " +
    "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become binding_array " +
    "cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept " +
    "const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast " +
    "enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared " +
    "highp impl implements import inline instanceOf interface layout lowp macro macro_rules match mediump meta mod module " +
    "move mut mutable namespace new nil noexcept noinline nointerpolation noperspective null nullptr of operator package " +
    "packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref " +
    "regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static " +
    "static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef " +
    "typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with " +
    "writeonly yield " +
    "bool f16 f32 f64 i32 u32 vec2 vec3 vec4 mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 " +
    "array atomic ptr sampler sampler_comparison texture_1d texture_2d texture_2d_array texture_3d texture_cube " +
    "texture_cube_array texture_multisampled_2d texture_depth_2d texture_depth_2d_array texture_depth_cube " +
    "texture_depth_cube_array texture_depth_multisampled_2d texture_storage_1d texture_storage_2d " +
    "texture_storage_2d_array texture_storage_3d " +
    "abs acos acosh all any asin asinh atan atan2 atanh ceil clamp cos cosh cross degrees determinant distance dot " +
    "exp exp2 faceForward floor fma fract frexp inverseSqrt ldexp length log log2 max min mix modf normalize pow " +
    "quantizeToF16 radians reflect refract reverseBits round saturate sign sin sinh smoothstep sqrt step tan tanh " +
    "transpose trunc pack2x16float pack2x16snorm pack2x16unorm pack4x8snorm pack4x8unorm unpack2x16float " +
    "unpack2x16snorm unpack2x16unorm unpack4x8snorm unpack4x8unorm textureDimensions textureGather textureGatherCompare " +
    "textureLoad textureNumLayers textureNumLevels textureNumSamples textureSample textureSampleBias " +
    "textureSampleCompare textureSampleCompareLevel textureSampleGrad textureSampleLevel " +
    "textureSampleBaseClampToEdge textureStore select bitcast dpdx dpdy dpdxCoarse dpdxFine dpdyCoarse dpdyFine fwidth " +
    "workgroupBarrier storageBarrier textureBarrier atomicLoad atomicStore atomicAdd atomicSub atomicMin atomicMax " +
    "atomicAnd atomicOr atomicXor atomicExchange atomicCompareExchangeWeak " +
    "main"
  ).split(/\s+/)
);

export const GLSL_BUILTIN_INT_LIMITS: Record<string, number> = {
  gl_MaxVertexAttribs: 16,
  gl_MaxVertexUniformVectors: 256,
  gl_MaxVertexOutputVectors: 16,
  gl_MaxFragmentInputVectors: 15,
  gl_MaxVertexTextureImageUnits: 16,
  gl_MaxCombinedTextureImageUnits: 32,
  gl_MaxTextureImageUnits: 16,
  gl_MaxFragmentUniformVectors: 256,
  gl_MaxDrawBuffers: 8,
  gl_MinProgramTexelOffset: -8,
  gl_MaxProgramTexelOffset: 7
};

export const TEXTURE_BUILTINS = new Set([
  "texture",
  "texture2D",
  "textureCube",
  "textureLod",
  "texture2DLod",
  "texture2DLodEXT",
  "textureCubeLod",
  "textureCubeLodEXT",
  "textureOffset",
  "textureLodOffset",
  "textureGrad",
  "textureGradOffset",
  "textureProj",
  "textureProjLod",
  "textureProjOffset",
  "textureProjLodOffset",
  "textureProjGrad",
  "textureProjGradOffset",
  "texture2DProj",
  "texture2DGradEXT",
  "textureCubeGradEXT",
  "texture2DProjLodEXT",
  "texture2DProjGradEXT",
  "texelFetch",
  "texelFetchOffset",
  "textureSize"
]);

export const IMAGE_BUILTINS = new Set(["imageStore", "imageLoad", "imageSize"]);

export const ATOMIC_BUILTINS = new Set([
  "atomicLoad",
  "atomicStore",
  "atomicAdd",
  "atomicSub",
  "atomicMin",
  "atomicMax",
  "atomicAnd",
  "atomicOr",
  "atomicXor",
  "atomicExchange",
  "atomicCompSwap",
  "atomicCompareExchangeWeak"
]);

export const BARRIER_BUILTINS = new Set([
  "barrier",
  "workgroupBarrier",
  "storageBarrier",
  "textureBarrier",
  "memoryBarrier",
  "memoryBarrierShared",
  "memoryBarrierBuffer",
  "memoryBarrierImage"
]);

const STORAGE_FORMAT_ALIASES: Record<string, string> = {
  rgba8: "rgba8unorm",
  rgba8_snorm: "rgba8snorm",
  rgba8ui: "rgba8uint",
  rgba8i: "rgba8sint",
  rgba16f: "rgba16float",
  rgba16ui: "rgba16uint",
  rgba16i: "rgba16sint",
  rgba32f: "rgba32float",
  rgba32ui: "rgba32uint",
  rgba32i: "rgba32sint",
  r32f: "r32float",
  r32ui: "r32uint",
  r32i: "r32sint",
  rg32f: "rg32float",
  rg32ui: "rg32uint",
  rg32i: "rg32sint"
};

export function normalizeStorageFormat(format: string): string {
  return STORAGE_FORMAT_ALIASES[format] ?? format;
}

export function isImageType(base: string): boolean {
  return base === "image2D" || base === "iimage2D" || base === "uimage2D";
}

export function isAtomicType(base: string): boolean {
  return base === "atomic_uint" || base === "atomic_int";
}

/** Maps `shader-parser`'s `Keyword` enum to canonical GLSL type spelling. */
const KEYWORD_TO_GLSL: Partial<Record<Keyword, string>> = {
  [Keyword.VOID]: "void",
  [Keyword.BOOL]: "bool",
  [Keyword.INT]: "int",
  [Keyword.UINT]: "uint",
  [Keyword.FLOAT]: "float",
  [Keyword.DOUBLE]: "float",
  [Keyword.VEC2]: "vec2",
  [Keyword.VEC3]: "vec3",
  [Keyword.VEC4]: "vec4",
  [Keyword.IVEC2]: "ivec2",
  [Keyword.IVEC3]: "ivec3",
  [Keyword.IVEC4]: "ivec4",
  [Keyword.UVEC2]: "uvec2",
  [Keyword.UVEC3]: "uvec3",
  [Keyword.UVEC4]: "uvec4",
  [Keyword.BVEC2]: "bvec2",
  [Keyword.BVEC3]: "bvec3",
  [Keyword.BVEC4]: "bvec4",
  [Keyword.MAT2]: "mat2",
  [Keyword.MAT3]: "mat3",
  [Keyword.MAT4]: "mat4",
  [Keyword.MAT2X3]: "mat2x3",
  [Keyword.MAT2X4]: "mat2x4",
  [Keyword.MAT3X2]: "mat3x2",
  [Keyword.MAT3X4]: "mat3x4",
  [Keyword.MAT4X2]: "mat4x2",
  [Keyword.MAT4X3]: "mat4x3",
  [Keyword.SAMPLER2D]: "sampler2D",
  [Keyword.SAMPLER3D]: "sampler3D",
  [Keyword.SAMPLER_CUBE]: "samplerCube",
  [Keyword.SAMPLER2D_SHADOW]: "sampler2DShadow",
  [Keyword.SAMPLER_CUBE_SHADOW]: "samplerCubeShadow",
  [Keyword.SAMPLER2D_ARRAY]: "sampler2DArray",
  [Keyword.SAMPLER2D_ARRAY_SHADOW]: "sampler2DArrayShadow",
  [Keyword.I_SAMPLER2D]: "isampler2D",
  [Keyword.I_SAMPLER3D]: "isampler3D",
  [Keyword.I_SAMPLER_CUBE]: "isamplerCube",
  [Keyword.I_SAMPLER2D_ARRAY]: "isampler2DArray",
  [Keyword.U_SAMPLER2D]: "usampler2D",
  [Keyword.U_SAMPLER3D]: "usampler3D",
  [Keyword.U_SAMPLER_CUBE]: "usamplerCube",
  [Keyword.U_SAMPLER2D_ARRAY]: "usampler2DArray",
  [Keyword.IMAGE2D]: "image2D",
  [Keyword.I_IMAGE2D]: "iimage2D",
  [Keyword.U_IMAGE2D]: "uimage2D",
  [Keyword.ATOMIC_UINT]: "atomic_uint",
  [Keyword.ATOMIC_INT]: "atomic_int"
};

export function galaceanTypeToBase(t: GalaceanDataType | undefined): string {
  if (t === undefined || t === TypeAny) return "unknown";
  if (typeof t === "string") return t;
  return KEYWORD_TO_GLSL[t as Keyword] ?? "unknown";
}

export function isScalarType(t: WGSLTypeDesc): boolean {
  return (
    t.arraySize === undefined && (t.base === "float" || t.base === "int" || t.base === "uint" || t.base === "bool")
  );
}

export function scalarFamily(t: WGSLTypeDesc): "float" | "int" | "uint" | "bool" | null {
  const b = t.base;
  if (b === "float" || b === "vec2" || b === "vec3" || b === "vec4" || b.startsWith("mat")) return "float";
  if (b === "int" || b === "ivec2" || b === "ivec3" || b === "ivec4") return "int";
  if (b === "uint" || b === "uvec2" || b === "uvec3" || b === "uvec4") return "uint";
  if (b === "bool" || b === "bvec2" || b === "bvec3" || b === "bvec4") return "bool";
  return null;
}

export function isIntegerType(t: WGSLTypeDesc): boolean {
  const fam = scalarFamily(t);
  return fam === "int" || fam === "uint";
}

export function vectorSize(t: WGSLTypeDesc): number {
  if (t.arraySize !== undefined) return 0;
  const m = /^[iub]?vec([234])$/.exec(t.base);
  return m ? Number(m[1]) : 0;
}

export function matrixDims(t: WGSLTypeDesc): { cols: number; rows: number } | null {
  if (t.arraySize !== undefined) return null;
  const m = /^mat([234])(?:x([234]))?$/.exec(t.base);
  if (!m) return null;
  const cols = Number(m[1]);
  const rows = m[2] ? Number(m[2]) : cols;
  return { cols, rows };
}

export function makeVectorType(family: "float" | "int" | "uint" | "bool", size: number): WGSLTypeDesc {
  if (size === 1) return { base: family };
  const prefix = family === "float" ? "" : family === "int" ? "i" : family === "uint" ? "u" : "b";
  return { base: `${prefix}vec${size}` };
}

export function makeMatrixType(cols: number, rows: number): WGSLTypeDesc {
  return { base: cols === rows ? `mat${cols}` : `mat${cols}x${rows}` };
}

export function isSamplerType(base: string): boolean {
  return /^[iu]?sampler(?:2D|3D|Cube|2DArray)(?:Shadow)?$/.test(base);
}

export function samplerToWGSLTexture(samplerBase: string): string {
  switch (samplerBase) {
    case "sampler2D":
      return "texture_2d<f32>";
    case "sampler3D":
      return "texture_3d<f32>";
    case "samplerCube":
      return "texture_cube<f32>";
    case "sampler2DArray":
      return "texture_2d_array<f32>";
    case "isampler2D":
      return "texture_2d<i32>";
    case "isampler3D":
      return "texture_3d<i32>";
    case "isamplerCube":
      return "texture_cube<i32>";
    case "isampler2DArray":
      return "texture_2d_array<i32>";
    case "usampler2D":
      return "texture_2d<u32>";
    case "usampler3D":
      return "texture_3d<u32>";
    case "usamplerCube":
      return "texture_cube<u32>";
    case "usampler2DArray":
      return "texture_2d_array<u32>";
    case "sampler2DShadow":
      return "texture_depth_2d";
    case "samplerCubeShadow":
      return "texture_depth_cube";
    case "sampler2DArrayShadow":
      return "texture_depth_2d_array";
    default:
      return "texture_2d<f32>";
  }
}

export function samplerToWGSLSampler(samplerBase: string): string {
  return samplerBase.endsWith("Shadow") ? "sampler_comparison" : "sampler";
}

export function glslBaseToWGSL(base: string, structNameMap?: ReadonlyMap<string, string>): string {
  switch (base) {
    case "void":
      return "void";
    case "bool":
      return "bool";
    case "int":
      return "i32";
    case "uint":
      return "u32";
    case "float":
      return "f32";
    case "vec2":
      return "vec2<f32>";
    case "vec3":
      return "vec3<f32>";
    case "vec4":
      return "vec4<f32>";
    case "ivec2":
      return "vec2<i32>";
    case "ivec3":
      return "vec3<i32>";
    case "ivec4":
      return "vec4<i32>";
    case "uvec2":
      return "vec2<u32>";
    case "uvec3":
      return "vec3<u32>";
    case "uvec4":
      return "vec4<u32>";
    case "bvec2":
      return "vec2<bool>";
    case "bvec3":
      return "vec3<bool>";
    case "bvec4":
      return "vec4<bool>";
    case "mat2":
    case "mat2x2":
      return "mat2x2<f32>";
    case "mat3":
    case "mat3x3":
      return "mat3x3<f32>";
    case "mat4":
    case "mat4x4":
      return "mat4x4<f32>";
    case "mat2x3":
      return "mat2x3<f32>";
    case "mat2x4":
      return "mat2x4<f32>";
    case "mat3x2":
      return "mat3x2<f32>";
    case "mat3x4":
      return "mat3x4<f32>";
    case "mat4x2":
      return "mat4x2<f32>";
    case "mat4x3":
      return "mat4x3<f32>";
    case "atomic_uint":
      return "atomic<u32>";
    case "atomic_int":
      return "atomic<i32>";
    default:
      return structNameMap?.get(base) ?? base;
  }
}

export function glslTypeToWGSL(type: WGSLTypeDesc, structNameMap?: ReadonlyMap<string, string>): string {
  const elem = glslBaseToWGSL(type.base, structNameMap);
  if (type.arraySize !== undefined) {
    return type.arraySize ? `array<${elem}, ${type.arraySize}>` : `array<${elem}>`;
  }
  return elem;
}

export function typeKey(t: WGSLTypeDesc): string {
  const b = t.base === "mat2x2" ? "mat2" : t.base === "mat3x3" ? "mat3" : t.base === "mat4x4" ? "mat4" : t.base;
  return t.arraySize !== undefined ? `${b}[${t.arraySize}]` : b;
}

export function isValidSwizzle(s: string): boolean {
  return s.length >= 1 && s.length <= 4 && (/^[xyzw]+$/.test(s) || /^[rgba]+$/.test(s) || /^[stpq]+$/.test(s));
}

export function normalizeSwizzle(s: string): string {
  const map: Record<string, string> = {
    r: "x",
    g: "y",
    b: "z",
    a: "w",
    s: "x",
    t: "y",
    p: "z",
    q: "w"
  };
  let out = "";
  for (let i = 0; i < s.length; i++) out += map[s[i]] ?? s[i];
  return out;
}

export function formatFloatLiteral(raw: string): string {
  let s = raw.replace(/[fF]$/, "");
  if (s.startsWith(".")) s = "0" + s;
  if (s.endsWith(".")) s = s + "0";
  if (!s.includes(".") && !/[eE]/.test(s)) s += ".0";
  s = s.replace(/\.([eE])/, ".0$1");
  const num = Number(s);
  if (Number.isFinite(num) && Math.abs(num) >= 3.4028234e38) {
    return num < 0 ? "-0x1.fffffep+127f" : "0x1.fffffep+127f";
  }
  return s;
}

export function formatUintLiteral(raw: string): string {
  return raw.endsWith("U") ? raw.slice(0, -1) + "u" : raw.endsWith("u") ? raw : raw + "u";
}

export function inferBinaryType(op: string, left: WGSLTypeDesc, right: WGSLTypeDesc): WGSLTypeDesc {
  if (
    op === "&&" ||
    op === "||" ||
    op === "^^" ||
    op === "==" ||
    op === "!=" ||
    op === "<" ||
    op === ">" ||
    op === "<=" ||
    op === ">="
  ) {
    return WT_BOOL;
  }
  if (op === "<<" || op === ">>") return left;
  if (left.base === "unknown") return right;
  if (right.base === "unknown") return left;
  const ls = isScalarType(left);
  const rs = isScalarType(right);
  if (ls && !rs) return right;
  if (!ls && rs) return left;
  const lm = matrixDims(left);
  const rm = matrixDims(right);
  const lv = vectorSize(left);
  const rv = vectorSize(right);
  if (op === "*") {
    if (lm && rm) return makeMatrixType(rm.cols, lm.rows);
    if (lm && rv) return makeVectorType("float", lm.rows);
    if (lv && rm) return makeVectorType("float", rm.cols);
  }
  return left;
}

export function inferBuiltinReturnType(name: string, argTypes: WGSLTypeDesc[]): WGSLTypeDesc {
  if (/^(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?)$/.test(name)) {
    return { base: name };
  }
  if (isSamplerType(name)) {
    return { base: name };
  }
  const a0 = argTypes[0] ?? WT_UNKNOWN;
  const a1 = argTypes[1] ?? WT_UNKNOWN;
  switch (name) {
    case "length":
    case "distance":
    case "dot":
    case "determinant":
      return WT_FLOAT;
    case "cross":
      return WT_VEC3;
    case "any":
    case "all":
      return WT_BOOL;
    case "isnan":
    case "isinf": {
      const n = vectorSize(a0);
      return n ? makeVectorType("bool", n) : WT_BOOL;
    }
    case "lessThan":
    case "lessThanEqual":
    case "greaterThan":
    case "greaterThanEqual":
    case "equal":
    case "notEqual":
    case "not": {
      const n = vectorSize(a0);
      return n ? makeVectorType("bool", n) : WT_BOOL;
    }
    case "floatBitsToInt": {
      const n = vectorSize(a0);
      return n ? makeVectorType("int", n) : WT_INT;
    }
    case "floatBitsToUint": {
      const n = vectorSize(a0);
      return n ? makeVectorType("uint", n) : WT_UINT;
    }
    case "intBitsToFloat":
    case "uintBitsToFloat": {
      const n = vectorSize(a0);
      return n ? makeVectorType("float", n) : WT_FLOAT;
    }
    case "packSnorm2x16":
    case "packUnorm2x16":
    case "packHalf2x16":
      return WT_UINT;
    case "unpackSnorm2x16":
    case "unpackUnorm2x16":
    case "unpackHalf2x16":
      return WT_VEC2;
    case "transpose": {
      const m = matrixDims(a0);
      return m ? makeMatrixType(m.rows, m.cols) : a0;
    }
    case "outerProduct": {
      const r = vectorSize(a0);
      const c = vectorSize(a1);
      return r && c ? makeMatrixType(c, r) : WT_UNKNOWN;
    }
    case "step":
      return a1;
    case "smoothstep":
      return argTypes[2] ?? a0;
    case "textureSize": {
      if (a0.base.includes("3D") || a0.base.includes("Array")) return WT_IVEC3;
      return WT_IVEC2;
    }
    case "texture":
    case "texture2D":
    case "textureCube":
    case "textureLod":
    case "texture2DLod":
    case "texture2DLodEXT":
    case "textureCubeLod":
    case "textureCubeLodEXT":
    case "textureOffset":
    case "textureLodOffset":
    case "textureGrad":
    case "textureGradOffset":
    case "textureProj":
    case "textureProjLod":
    case "textureProjOffset":
    case "textureProjLodOffset":
    case "textureProjGrad":
    case "textureProjGradOffset":
    case "texture2DProj":
    case "texture2DGradEXT":
    case "textureCubeGradEXT":
    case "texture2DProjLodEXT":
    case "texture2DProjGradEXT":
    case "texelFetch":
    case "texelFetchOffset": {
      if (a0.base.endsWith("Shadow")) return WT_FLOAT;
      if (a0.base.startsWith("i")) return WT_IVEC4;
      if (a0.base.startsWith("u")) return WT_UVEC4;
      return WT_VEC4;
    }
    default:
      return a0;
  }
}
