/** GLSL-to-WGSL type system, keyword escaping, and builtin signature inference. */

export interface GType {
  base: string;
  arraySize?: string; // evaluated or symbolic WGSL array length when array
}

export const T_VOID: GType = { base: "void" };
export const T_BOOL: GType = { base: "bool" };
export const T_INT: GType = { base: "int" };
export const T_UINT: GType = { base: "uint" };
export const T_FLOAT: GType = { base: "float" };
export const T_VEC2: GType = { base: "vec2" };
export const T_VEC3: GType = { base: "vec3" };
export const T_VEC4: GType = { base: "vec4" };
export const T_IVEC2: GType = { base: "ivec2" };
export const T_IVEC3: GType = { base: "ivec3" };
export const T_IVEC4: GType = { base: "ivec4" };
export const T_UVEC2: GType = { base: "uvec2" };
export const T_UVEC3: GType = { base: "uvec3" };
export const T_UVEC4: GType = { base: "uvec4" };
export const T_UNKNOWN: GType = { base: "unknown" };

/** WGSL keywords, reserved words, and predeclared type/builtin identifiers that user variables must not shadow. */
export const WGSL_RESERVED = new Set(
  (
    "alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if " +
    "let loop override requires return struct switch true var while " +
    "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become binding_array " +
    "cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept " +
    "const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast " +
    "enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared " +
    "highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module " +
    "move mut mutable namespace new nil noexcept noinline nointerpolation noperspective null nullptr of operator package " +
    "packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref " +
    "regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static " +
    "static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef " +
    "typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield " +
    "bool f16 f32 i32 u32 vec2 vec3 vec4 vec2f vec3f vec4f vec2i vec3i vec4i vec2u vec3u vec4u vec2h vec3h vec4h " +
    "mat2x2 mat2x3 mat2x4 mat3x2 mat3x3 mat3x4 mat4x2 mat4x3 mat4x4 " +
    "mat2x2f mat2x3f mat2x4f mat3x2f mat3x3f mat3x4f mat4x2f mat4x3f mat4x4f " +
    "array atomic ptr sampler sampler_comparison " +
    "texture_1d texture_2d texture_2d_array texture_3d texture_cube texture_cube_array " +
    "texture_multisampled_2d texture_depth_2d texture_depth_2d_array texture_depth_cube texture_depth_cube_array " +
    "texture_depth_multisampled_2d texture_storage_1d texture_storage_2d texture_storage_2d_array texture_storage_3d " +
    "storage uniform workgroup private function read write read_write " +
    // WGSL builtins that GLSL shaders sometimes use as local variable or field names
    "textureDimensions textureGather textureGatherCompare textureLoad textureNumLayers textureNumLevels textureNumSamples " +
    "textureSample textureSampleBias textureSampleCompare textureSampleCompareLevel textureSampleGrad textureSampleLevel " +
    "textureSampleBaseClampToEdge textureStore select bitcast dpdx dpdy dpdxCoarse dpdxFine dpdyCoarse dpdyFine fwidth " +
    "fwidthCoarse fwidthFine inverseSqrt atan2 saturate mix clamp min max abs sign floor ceil trunc round fract exp exp2 " +
    "log log2 pow sqrt sin cos tan asin acos atan sinh cosh tanh asinh acosh atanh degrees radians dot cross length " +
    "distance normalize faceForward reflect refract step smoothstep transpose determinant pack2x16float unpack2x16float " +
    "pack2x16snorm unpack2x16snorm pack2x16unorm unpack2x16unorm all any"
  ).split(" ")
);

export function isScalarType(t: GType): boolean {
  return !t.arraySize && (t.base === "float" || t.base === "int" || t.base === "uint" || t.base === "bool");
}

export function scalarFamily(t: GType): "float" | "int" | "uint" | "bool" | undefined {
  if (t.arraySize) return undefined;
  const b = t.base;
  if (b === "float" || b === "vec2" || b === "vec3" || b === "vec4" || b.startsWith("mat")) return "float";
  if (b === "int" || b === "ivec2" || b === "ivec3" || b === "ivec4") return "int";
  if (b === "uint" || b === "uvec2" || b === "uvec3" || b === "uvec4") return "uint";
  if (b === "bool" || b === "bvec2" || b === "bvec3" || b === "bvec4") return "bool";
  return undefined;
}

export function vectorSize(t: GType): number {
  if (t.arraySize) return 0;
  const m = /^[iub]?vec([234])$/.exec(t.base);
  return m ? Number(m[1]) : 0;
}

export function matrixDims(t: GType): { cols: number; rows: number } | undefined {
  if (t.arraySize) return undefined;
  const m = /^mat([234])(?:x([234]))?$/.exec(t.base);
  if (!m) return undefined;
  const cols = Number(m[1]);
  const rows = m[2] ? Number(m[2]) : cols;
  return { cols, rows };
}

export function makeVectorType(family: "float" | "int" | "uint" | "bool", size: number): GType {
  if (size <= 1) return { base: family };
  const prefix = family === "float" ? "" : family === "int" ? "i" : family === "uint" ? "u" : "b";
  return { base: `${prefix}vec${size}` };
}

export function makeMatrixType(cols: number, rows: number): GType {
  return { base: cols === rows ? `mat${cols}` : `mat${cols}x${rows}` };
}

export function isSamplerOrTextureType(base: string): boolean {
  return /^(?:[iu]?sampler|[iu]?texture)/.test(base);
}

export function glslBaseToWGSL(base: string, structNameMap?: ReadonlyMap<string, string>): string {
  switch (base) {
    case "void":
      return "";
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
    case "texture2D":
      return "texture_2d<f32>";
    case "texture3D":
      return "texture_3d<f32>";
    case "textureCube":
      return "texture_cube<f32>";
    case "texture2DArray":
      return "texture_2d_array<f32>";
    case "itexture2D":
      return "texture_2d<i32>";
    case "itexture3D":
      return "texture_3d<i32>";
    case "itextureCube":
      return "texture_cube<i32>";
    case "itexture2DArray":
      return "texture_2d_array<i32>";
    case "utexture2D":
      return "texture_2d<u32>";
    case "utexture3D":
      return "texture_3d<u32>";
    case "utextureCube":
      return "texture_cube<u32>";
    case "utexture2DArray":
      return "texture_2d_array<u32>";
    case "texture2DShadow":
      return "texture_depth_2d";
    case "textureCubeShadow":
      return "texture_depth_cube";
    case "texture2DArrayShadow":
      return "texture_depth_2d_array";
    case "sampler":
      return "sampler";
    case "samplerShadow":
      return "sampler_comparison";
    default:
      return structNameMap?.get(base) ?? base;
  }
}

export function glslTypeToWGSL(type: GType, structNameMap?: ReadonlyMap<string, string>): string {
  const elem = glslBaseToWGSL(type.base, structNameMap);
  if (type.arraySize !== undefined) {
    return type.arraySize ? `array<${elem}, ${type.arraySize}>` : `array<${elem}>`;
  }
  return elem;
}

export function typeKey(t: GType): string {
  const b = t.base === "mat2x2" ? "mat2" : t.base === "mat3x3" ? "mat3" : t.base === "mat4x4" ? "mat4" : t.base;
  return t.arraySize !== undefined ? `${b}[${t.arraySize}]` : b;
}

export function formatFloatLiteral(raw: string): string {
  let s = raw.replace(/[fF]$/, "");
  if (s.startsWith(".")) s = "0" + s;
  if (s.endsWith(".")) s = s + "0";
  // Ensure decimal or exponent is present so WGSL parses as float
  if (!s.includes(".") && !/[eE]/.test(s)) s += ".0";
  // Handle e.g. `1.e-5` -> `1.0e-5`
  s = s.replace(/\.([eE])/, ".0$1");
  // Clamp IEEE754 f32 max literal if written as huge decimal
  const num = Number(s);
  if (Number.isFinite(num) && Math.abs(num) >= 3.4028234e38) {
    return num < 0 ? "-0x1.fffffep+127f" : "0x1.fffffep+127f";
  }
  return s;
}

export function formatIntLiteral(raw: string): string {
  return raw;
}

export function formatUintLiteral(raw: string): string {
  return raw.endsWith("U") ? raw.slice(0, -1) + "u" : raw.endsWith("u") ? raw : raw + "u";
}

export function inferBinaryType(op: string, left: GType, right: GType): GType {
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
    return T_BOOL;
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

export function inferBuiltinReturnType(name: string, argTypes: GType[]): GType {
  // Type constructors
  if (/^(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?)$/.test(name)) {
    return { base: name };
  }
  if (isSamplerOrTextureType(name)) {
    return { base: name };
  }
  const a0 = argTypes[0] ?? T_UNKNOWN;
  const a1 = argTypes[1] ?? T_UNKNOWN;
  switch (name) {
    case "length":
    case "distance":
    case "dot":
    case "determinant":
      return T_FLOAT;
    case "cross":
      return T_VEC3;
    case "any":
    case "all":
      return T_BOOL;
    case "isnan":
    case "isinf": {
      const n = vectorSize(a0);
      return n ? makeVectorType("bool", n) : T_BOOL;
    }
    case "lessThan":
    case "lessThanEqual":
    case "greaterThan":
    case "greaterThanEqual":
    case "equal":
    case "notEqual":
    case "not": {
      const n = vectorSize(a0);
      return n ? makeVectorType("bool", n) : T_BOOL;
    }
    case "floatBitsToInt": {
      const n = vectorSize(a0);
      return n ? makeVectorType("int", n) : T_INT;
    }
    case "floatBitsToUint": {
      const n = vectorSize(a0);
      return n ? makeVectorType("uint", n) : T_UINT;
    }
    case "intBitsToFloat":
    case "uintBitsToFloat": {
      const n = vectorSize(a0);
      return n ? makeVectorType("float", n) : T_FLOAT;
    }
    case "packSnorm2x16":
    case "packUnorm2x16":
    case "packHalf2x16":
      return T_UINT;
    case "unpackSnorm2x16":
    case "unpackUnorm2x16":
    case "unpackHalf2x16":
      return T_VEC2;
    case "transpose": {
      const m = matrixDims(a0);
      return m ? makeMatrixType(m.rows, m.cols) : a0;
    }
    case "outerProduct": {
      const r = vectorSize(a0);
      const c = vectorSize(a1);
      return r && c ? makeMatrixType(c, r) : T_UNKNOWN;
    }
    case "step":
      return a1;
    case "smoothstep":
      return argTypes[2] ?? a0;
    case "textureSize": {
      if (a0.base.includes("3D") || a0.base.includes("Array")) return T_IVEC3;
      return T_IVEC2;
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
    case "texelFetch":
    case "texelFetchOffset": {
      if (a0.base.endsWith("Shadow")) return T_FLOAT;
      if (a0.base.startsWith("i")) return T_IVEC4;
      if (a0.base.startsWith("u")) return T_UVEC4;
      return T_VEC4;
    }
    default:
      return a0;
  }
}
