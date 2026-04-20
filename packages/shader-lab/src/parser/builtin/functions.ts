import { GalaceanDataType, TypeAny } from "../../common";
import { Keyword } from "../../common/enums/Keyword";
import { EShaderStage } from "../../common/enums/ShaderStage";

export enum EGenType {
  GenType = 200,
  GenIntType,
  GenUintType,
  GenBoolType,
  Mat,
  BoolVec,
  IntVec,
  UintVec,
  Vec,
  GVec4,
  GSampler2D,
  GSampler3D,
  GSamplerCube,
  GSampler2DArray
}

export type NonGenericGalaceanType = Exclude<GalaceanDataType, string>;
type BuiltinType = NonGenericGalaceanType | EGenType;

function isGenericType(t: BuiltinType) {
  return t >= EGenType.GenType && t <= EGenType.GSampler2DArray;
}

// Generic type system.
//
// A generic family declares its concrete members and the dimension along which
// members vary. Matching a generic position locks an index; projecting a return
// family uses that index. Two families can only share an index if they vary
// along the same dimension.
//
// Example: `texture(GSampler2D, vec2) → GVec4` against `texture(sampler2D, uv)`.
//   1. Locate `sampler2D` in GSampler2D (prefix dimension) → index 0
//   2. Project GVec4 (prefix dimension) at index 0         → vec4
//
// `ivec4 = texture(isampler2D, uv)` locks index 1, projects to `ivec4`.
// `min(vec3, vec3)` locks index 2 in GenType (size dimension) and returns vec3.
// `min(vec3, vec2)` fails because the second arg would need index 1 but 2 is locked.

const enum GenericDim {
  // Varies along vector size: scalar / vec2 / vec3 / vec4 (or equivalents).
  Size,
  // Varies along scalar type prefix: float / int / uint (sometimes with bool).
  Prefix
}

type FamilySpec = {
  readonly dim: GenericDim;
  readonly members: readonly NonGenericGalaceanType[];
};

const GenericFamilies: Partial<Record<EGenType, FamilySpec>> = {
  // Size-varying families: index 0 → scalar, 1 → vec2, 2 → vec3, 3 → vec4.
  [EGenType.GenType]: { dim: GenericDim.Size, members: [Keyword.FLOAT, Keyword.VEC2, Keyword.VEC3, Keyword.VEC4] },
  [EGenType.GenIntType]: { dim: GenericDim.Size, members: [Keyword.INT, Keyword.IVEC2, Keyword.IVEC3, Keyword.IVEC4] },
  [EGenType.GenUintType]: {
    dim: GenericDim.Size,
    members: [Keyword.UINT, Keyword.UVEC2, Keyword.UVEC3, Keyword.UVEC4]
  },
  [EGenType.GenBoolType]: {
    dim: GenericDim.Size,
    members: [Keyword.BOOL, Keyword.BVEC2, Keyword.BVEC3, Keyword.BVEC4]
  },
  // Vec-only sub-families (no scalar): index 0 → vec2, 1 → vec3, 2 → vec4.
  [EGenType.Vec]: { dim: GenericDim.Size, members: [Keyword.VEC2, Keyword.VEC3, Keyword.VEC4] },
  [EGenType.IntVec]: { dim: GenericDim.Size, members: [Keyword.IVEC2, Keyword.IVEC3, Keyword.IVEC4] },
  [EGenType.UintVec]: { dim: GenericDim.Size, members: [Keyword.UVEC2, Keyword.UVEC3, Keyword.UVEC4] },
  [EGenType.BoolVec]: { dim: GenericDim.Size, members: [Keyword.BVEC2, Keyword.BVEC3, Keyword.BVEC4] },
  [EGenType.Mat]: { dim: GenericDim.Size, members: [Keyword.MAT2, Keyword.MAT3, Keyword.MAT4] },

  // Prefix-varying families: index 0 → no prefix, 1 → i prefix, 2 → u prefix.
  [EGenType.GSampler2D]: {
    dim: GenericDim.Prefix,
    members: [Keyword.SAMPLER2D, Keyword.I_SAMPLER2D, Keyword.U_SAMPLER2D]
  },
  [EGenType.GSampler3D]: {
    dim: GenericDim.Prefix,
    members: [Keyword.SAMPLER3D, Keyword.I_SAMPLER3D, Keyword.U_SAMPLER3D]
  },
  [EGenType.GSamplerCube]: {
    dim: GenericDim.Prefix,
    members: [Keyword.SAMPLER_CUBE, Keyword.I_SAMPLER_CUBE, Keyword.U_SAMPLER_CUBE]
  },
  [EGenType.GSampler2DArray]: {
    dim: GenericDim.Prefix,
    members: [Keyword.SAMPLER2D_ARRAY, Keyword.I_SAMPLER2D_ARRAY, Keyword.U_SAMPLER2D_ARRAY]
  },
  [EGenType.GVec4]: { dim: GenericDim.Prefix, members: [Keyword.VEC4, Keyword.IVEC4, Keyword.UVEC4] }
};

// Reverse lookup per family: concrete → index. A single concrete (e.g. VEC4 appears in
// both GenType and GVec4) can resolve to different indices in different families, so the
// cache is keyed by (family, concrete) rather than by concrete alone.
const FamilyIndexCache = new Map<EGenType, Map<NonGenericGalaceanType, number>>();
for (const key in GenericFamilies) {
  const family = Number(key) as EGenType;
  const spec = GenericFamilies[family]!;
  const indexMap = new Map<NonGenericGalaceanType, number>();
  for (let i = 0; i < spec.members.length; i++) indexMap.set(spec.members[i], i);
  FamilyIndexCache.set(family, indexMap);
}

// Locate a concrete type in a family. Returns index on hit, -1 on miss.
function familyIndexOf(family: EGenType, type: NonGenericGalaceanType): number {
  const map = FamilyIndexCache.get(family);
  if (!map) return -1;
  const idx = map.get(type);
  return idx === undefined ? -1 : idx;
}

const BuiltinFunctionTable: Map<string, BuiltinFunction[]> = new Map();

export class BuiltinFunction {
  ident: string;
  readonly args: BuiltinType[];
  readonly scope: EShaderStage;

  private _returnType: BuiltinType;
  private _realReturnType: NonGenericGalaceanType;

  get realReturnType(): NonGenericGalaceanType {
    return this._realReturnType;
  }

  private constructor(ident: string, returnType: BuiltinType, scope: EShaderStage, ...args: BuiltinType[]) {
    this.ident = ident;
    this._returnType = returnType;
    this.args = args;
    this.scope = scope;
  }

  static getReturnType(fn: BuiltinFunction, genType?: NonGenericGalaceanType) {
    if (!isGenericType(fn._returnType)) return fn._returnType as NonGenericGalaceanType;
    return genType;
  }

  static _create(ident: string, returnType: BuiltinType, ...args: BuiltinType[]) {
    const fn = new BuiltinFunction(ident, returnType, EShaderStage.ALL, ...args);
    const list = BuiltinFunctionTable.get(ident) ?? [];
    list.push(fn);
    BuiltinFunctionTable.set(ident, list);
  }

  static _createWithScop(ident: string, returnType: BuiltinType, scope: EShaderStage, ...args: BuiltinType[]) {
    const fn = new BuiltinFunction(ident, returnType, scope, ...args);
    const list = BuiltinFunctionTable.get(ident) ?? [];
    list.push(fn);
    BuiltinFunctionTable.set(ident, list);
  }

  // Overload resolution against the generic family system.
  //
  // For each candidate signature: concrete positions require exact type match;
  // generic positions locate the actual arg's index within the declared family,
  // and lock an index per dimension (size / prefix) shared across positions.
  // The return type is resolved by projecting the appropriate lock through the
  // return family, or passed through verbatim if the return is concrete.
  static getFn(ident: string, parameterTypes: NonGenericGalaceanType[]): BuiltinFunction | undefined {
    const list = BuiltinFunctionTable.get(ident);
    if (!list) return undefined;
    const argCount = parameterTypes.length;

    for (let i = 0, len = list.length; i < len; i++) {
      const fn = list[i];
      const fnArgs = fn.args;
      if (fnArgs.length !== argCount) continue;

      let sizeLock = -1;
      let prefixLock = -1;
      let matched = true;

      for (let j = 0; j < argCount; j++) {
        const declared = fnArgs[j];
        const actual = parameterTypes[j];
        if (actual === TypeAny) continue;

        if (isGenericType(declared)) {
          const family = GenericFamilies[declared as EGenType];
          if (!family) {
            matched = false;
            break;
          }
          const idx = familyIndexOf(declared as EGenType, actual);
          if (idx === -1) {
            matched = false;
            break;
          }
          if (family.dim === GenericDim.Size) {
            if (sizeLock === -1) sizeLock = idx;
            else if (sizeLock !== idx) {
              matched = false;
              break;
            }
          } else {
            if (prefixLock === -1) prefixLock = idx;
            else if (prefixLock !== idx) {
              matched = false;
              break;
            }
          }
        } else if (declared !== actual) {
          matched = false;
          break;
        }
      }

      if (!matched) continue;

      const returnDecl = fn._returnType;
      if (!isGenericType(returnDecl)) {
        fn._realReturnType = returnDecl as NonGenericGalaceanType;
        return fn;
      }

      const returnFamily = GenericFamilies[returnDecl as EGenType];
      if (!returnFamily) continue;
      const lock = returnFamily.dim === GenericDim.Size ? sizeLock : prefixLock;
      // No argument locked the dimension (all relevant args were TypeAny): fall
      // through as TypeAny so downstream overload resolution treats the result
      // as a wildcard rather than a specific guess.
      fn._realReturnType = lock === -1 ? TypeAny : returnFamily.members[lock];
      return fn;
    }

    return undefined;
  }

  static isExist(ident: string) {
    return !!BuiltinFunctionTable.get(ident);
  }
}

BuiltinFunction._create("radians", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("degrees", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("sin", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("cos", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("tan", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("asin", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("acos", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("atan", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("atan", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("sinh", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("cosh", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("tanh", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("asinh", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("acosh", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("atanh", EGenType.GenType, EGenType.GenType);

BuiltinFunction._create("pow", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("exp", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("log", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("exp2", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("log2", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("sqrt", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("inversesqrt", EGenType.GenType, EGenType.GenType);

BuiltinFunction._create("abs", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("abs", EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("sign", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("sign", EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("floor", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("trunc", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("round", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("roundEven", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("ceil", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("fract", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("mod", EGenType.GenType, EGenType.GenType, Keyword.FLOAT);
BuiltinFunction._create("mod", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("min", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("min", EGenType.GenType, EGenType.GenType, Keyword.FLOAT);
BuiltinFunction._create("min", EGenType.GenIntType, EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("min", EGenType.GenIntType, EGenType.GenIntType, Keyword.INT);
BuiltinFunction._create("min", EGenType.GenUintType, EGenType.GenUintType, EGenType.GenUintType);
BuiltinFunction._create("min", EGenType.GenUintType, EGenType.GenUintType, Keyword.UINT);
BuiltinFunction._create("max", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("max", EGenType.GenType, EGenType.GenType, Keyword.FLOAT);
BuiltinFunction._create("max", EGenType.GenIntType, EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("max", EGenType.GenIntType, EGenType.GenIntType, Keyword.INT);
BuiltinFunction._create("clamp", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("clamp", EGenType.GenType, EGenType.GenType, Keyword.FLOAT, Keyword.FLOAT);
BuiltinFunction._create("clamp", EGenType.GenIntType, EGenType.GenIntType, EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("clamp", EGenType.GenIntType, EGenType.GenIntType, Keyword.INT, Keyword.INT);
BuiltinFunction._create(
  "clamp",
  EGenType.GenUintType,
  EGenType.GenUintType,
  EGenType.GenUintType,
  EGenType.GenUintType
);
BuiltinFunction._create("clamp", EGenType.GenUintType, EGenType.GenUintType, Keyword.UINT, Keyword.UINT);
BuiltinFunction._create("mix", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("mix", EGenType.GenType, EGenType.GenType, EGenType.GenType, Keyword.FLOAT);
BuiltinFunction._create("mix", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenBoolType);
BuiltinFunction._create("step", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("step", EGenType.GenType, Keyword.FLOAT, EGenType.GenType);
BuiltinFunction._create("smoothstep", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("smoothstep", EGenType.GenType, Keyword.FLOAT, Keyword.FLOAT, EGenType.GenType);
BuiltinFunction._create("isnan", EGenType.GenBoolType, EGenType.GenType);
BuiltinFunction._create("isinf", EGenType.GenBoolType, EGenType.GenType);
BuiltinFunction._create("floatBitsToInt", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("floatBitsToUint", EGenType.GenUintType, EGenType.GenType);
BuiltinFunction._create("intBitsToFloat", EGenType.GenType, EGenType.GenIntType);
BuiltinFunction._create("uintBitsToFloat", EGenType.GenType, EGenType.GenUintType);

BuiltinFunction._create("packSnorm2x16", Keyword.UINT, Keyword.VEC2);
BuiltinFunction._create("unpackSnorm2x16", Keyword.VEC2, Keyword.UINT);
BuiltinFunction._create("packUnorm2x16", Keyword.UINT, Keyword.VEC2);
BuiltinFunction._create("unpackUnorm2x16", Keyword.VEC2, Keyword.UINT);
BuiltinFunction._create("packHalf2x16", Keyword.UINT, Keyword.VEC2);
BuiltinFunction._create("unpackHalf2x16", Keyword.VEC2, Keyword.UINT);

BuiltinFunction._create("length", Keyword.FLOAT, EGenType.GenType);
BuiltinFunction._create("distance", Keyword.FLOAT, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("dot", Keyword.FLOAT, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("cross", Keyword.VEC3, Keyword.VEC3, Keyword.VEC3);
BuiltinFunction._create("normalize", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("faceforward", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("reflect", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("refract", EGenType.GenType, EGenType.GenType, EGenType.GenType, Keyword.FLOAT);
BuiltinFunction._create("matrixCompMult", EGenType.Mat, EGenType.Mat, EGenType.Mat);
BuiltinFunction._create("outerProduct", Keyword.MAT2, Keyword.VEC2, Keyword.VEC2);
BuiltinFunction._create("outerProduct", Keyword.MAT3, Keyword.VEC3, Keyword.VEC3);
BuiltinFunction._create("outerProduct", Keyword.MAT4, Keyword.VEC4, Keyword.VEC4);

BuiltinFunction._create("outerProduct", Keyword.MAT2X3, Keyword.VEC3, Keyword.VEC2);
BuiltinFunction._create("outerProduct", Keyword.MAT3X2, Keyword.VEC2, Keyword.VEC3);

BuiltinFunction._create("outerProduct", Keyword.MAT2X4, Keyword.VEC4, Keyword.VEC2);
BuiltinFunction._create("outerProduct", Keyword.MAT4X2, Keyword.VEC2, Keyword.VEC4);

BuiltinFunction._create("outerProduct", Keyword.MAT3X4, Keyword.VEC4, Keyword.VEC3);
BuiltinFunction._create("outerProduct", Keyword.MAT4X3, Keyword.VEC3, Keyword.VEC4);

BuiltinFunction._create("transpose", Keyword.MAT2, Keyword.MAT2);
BuiltinFunction._create("transpose", Keyword.MAT3, Keyword.MAT3);
BuiltinFunction._create("transpose", Keyword.MAT4, Keyword.MAT4);
BuiltinFunction._create("transpose", Keyword.MAT2X3, Keyword.MAT3X2);
BuiltinFunction._create("transpose", Keyword.MAT3X2, Keyword.MAT2X3);
BuiltinFunction._create("transpose", Keyword.MAT4X2, Keyword.MAT2X4);
BuiltinFunction._create("transpose", Keyword.MAT2X4, Keyword.MAT4X2);
BuiltinFunction._create("transpose", Keyword.MAT3X4, Keyword.MAT4X3);
BuiltinFunction._create("transpose", Keyword.MAT4X3, Keyword.MAT3X4);

BuiltinFunction._create("determinant", Keyword.FLOAT, Keyword.MAT2);
BuiltinFunction._create("determinant", Keyword.FLOAT, Keyword.MAT3);
BuiltinFunction._create("determinant", Keyword.FLOAT, Keyword.MAT4);

BuiltinFunction._create("inverse", Keyword.MAT2, Keyword.MAT2);
BuiltinFunction._create("inverse", Keyword.MAT3, Keyword.MAT3);
BuiltinFunction._create("inverse", Keyword.MAT4, Keyword.MAT4);

BuiltinFunction._create("lessThan", EGenType.BoolVec, EGenType.Vec, EGenType.Vec);
BuiltinFunction._create("lessThan", EGenType.BoolVec, EGenType.IntVec, EGenType.IntVec);
BuiltinFunction._create("lessThan", EGenType.BoolVec, EGenType.UintVec, EGenType.UintVec);

BuiltinFunction._create("lessThanEqual", EGenType.BoolVec, EGenType.Vec, EGenType.Vec);
BuiltinFunction._create("lessThanEqual", EGenType.BoolVec, EGenType.IntVec, EGenType.IntVec);
BuiltinFunction._create("lessThanEqual", EGenType.BoolVec, EGenType.UintVec, EGenType.UintVec);

BuiltinFunction._create("greaterThan", EGenType.BoolVec, EGenType.Vec, EGenType.Vec);
BuiltinFunction._create("greaterThan", EGenType.BoolVec, EGenType.IntVec, EGenType.IntVec);
BuiltinFunction._create("greaterThan", EGenType.BoolVec, EGenType.UintVec, EGenType.UintVec);

BuiltinFunction._create("greaterThanEqual", EGenType.BoolVec, EGenType.Vec, EGenType.Vec);
BuiltinFunction._create("greaterThanEqual", EGenType.BoolVec, EGenType.IntVec, EGenType.IntVec);
BuiltinFunction._create("greaterThanEqual", EGenType.BoolVec, EGenType.UintVec, EGenType.UintVec);

BuiltinFunction._create("equal", EGenType.BoolVec, EGenType.Vec, EGenType.Vec);
BuiltinFunction._create("equal", EGenType.BoolVec, EGenType.IntVec, EGenType.IntVec);
BuiltinFunction._create("equal", EGenType.BoolVec, EGenType.UintVec, EGenType.UintVec);
BuiltinFunction._create("equal", EGenType.BoolVec, EGenType.BoolVec, EGenType.BoolVec);

BuiltinFunction._create("notEqual", EGenType.BoolVec, EGenType.Vec, EGenType.Vec);
BuiltinFunction._create("notEqual", EGenType.BoolVec, EGenType.IntVec, EGenType.IntVec);
BuiltinFunction._create("notEqual", EGenType.BoolVec, EGenType.UintVec, EGenType.UintVec);
BuiltinFunction._create("notEqual", EGenType.BoolVec, EGenType.BoolVec, EGenType.BoolVec);

BuiltinFunction._create("any", Keyword.BOOL, EGenType.BoolVec);
BuiltinFunction._create("all", Keyword.BOOL, EGenType.BoolVec);
BuiltinFunction._create("not", EGenType.BoolVec, EGenType.BoolVec);

BuiltinFunction._create("textureSize", Keyword.IVEC2, EGenType.GSampler2D, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC3, EGenType.GSampler3D, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC2, EGenType.GSamplerCube, Keyword.INT);

BuiltinFunction._create("textureSize", Keyword.IVEC2, Keyword.SAMPLER2D_SHADOW, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC2, Keyword.SAMPLER_CUBE_SHADOW, Keyword.INT);

BuiltinFunction._create("textureSize", Keyword.IVEC3, EGenType.GSampler2DArray, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC3, Keyword.SAMPLER2D_ARRAY_SHADOW, Keyword.INT);

BuiltinFunction._create("texture2D", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2);
BuiltinFunction._create("texture2D", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);

BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC3);

BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3);

BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC3);

BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER_CUBE_SHADOW, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER_CUBE_SHADOW, Keyword.VEC4);

BuiltinFunction._create("texture", EGenType.GVec4, Keyword.SAMPLER2D_ARRAY, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, Keyword.SAMPLER2D_ARRAY, Keyword.VEC3);

BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER2D_ARRAY_SHADOW, Keyword.VEC4);

BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC3);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC4);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC4);

BuiltinFunction._create("textureProj", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProj", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC4);

BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureLod", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSampler2DArray, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture2DLod", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("texture2DLodEXT", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("texture2DLodEXT", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC3, Keyword.FLOAT);

BuiltinFunction._create("textureCube", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3);
BuiltinFunction._create("textureCube", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureCubeLod", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureCubeLodEXT", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);

BuiltinFunction._create(
  "textureOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC2,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureOffset", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2, Keyword.IVEC2);

BuiltinFunction._create(
  "textureOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.VEC3,
  Keyword.IVEC3,
  Keyword.FLOAT
);
BuiltinFunction._create("textureOffset", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC3, Keyword.IVEC3);

BuiltinFunction._create(
  "textureOffset",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC3,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureOffset", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC3, Keyword.IVEC2);
BuiltinFunction._create(
  "textureOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  Keyword.VEC3,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureOffset", EGenType.GVec4, EGenType.GSampler2DArray, Keyword.VEC3, Keyword.IVEC2);

BuiltinFunction._create("texelFetch", EGenType.GVec4, EGenType.GSampler2D, Keyword.IVEC2, Keyword.INT);
BuiltinFunction._create("texelFetch", EGenType.GVec4, EGenType.GSampler3D, Keyword.IVEC3, Keyword.INT);
BuiltinFunction._create("texelFetch", EGenType.GVec4, EGenType.GSampler2DArray, Keyword.IVEC3, Keyword.INT);

BuiltinFunction._create(
  "texelFetchOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.IVEC2,
  Keyword.INT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "texelFetchOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.IVEC3,
  Keyword.INT,
  Keyword.IVEC3
);
BuiltinFunction._create(
  "texelFetchOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  Keyword.IVEC3,
  Keyword.INT,
  Keyword.IVEC2
);

BuiltinFunction._create(
  "textureProjOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC3,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC3, Keyword.IVEC2);

BuiltinFunction._create(
  "textureProjOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC4,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC4, Keyword.IVEC2);

BuiltinFunction._create(
  "textureProjOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.VEC4,
  Keyword.IVEC3,
  Keyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC4, Keyword.IVEC3);

BuiltinFunction._create(
  "textureProjOffset",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC4,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC4, Keyword.IVEC2);

BuiltinFunction._create(
  "textureLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC2,
  Keyword.FLOAT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureLodOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.VEC3,
  Keyword.FLOAT,
  Keyword.IVEC3
);

BuiltinFunction._create(
  "textureLodOffset",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC3,
  Keyword.FLOAT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  Keyword.VEC3,
  Keyword.FLOAT,
  Keyword.IVEC2
);

BuiltinFunction._create("textureProjLod", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureProjLod", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProjLod", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProjLod", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC4, Keyword.FLOAT);

BuiltinFunction._create(
  "textureProjLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC3,
  Keyword.FLOAT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC4,
  Keyword.FLOAT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjLodOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.VEC4,
  Keyword.FLOAT,
  Keyword.IVEC3
);
BuiltinFunction._create(
  "textureProjLodOffset",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC4,
  Keyword.FLOAT,
  Keyword.IVEC2
);

BuiltinFunction._create("textureGrad", EGenType.GVec4, EGenType.GSampler2D, Keyword.VEC2, Keyword.VEC2, Keyword.VEC2);
BuiltinFunction._create("textureGrad", EGenType.GVec4, EGenType.GSampler3D, Keyword.VEC3, Keyword.VEC3, Keyword.VEC3);
BuiltinFunction._create("textureGrad", EGenType.GVec4, EGenType.GSamplerCube, Keyword.VEC3, Keyword.VEC3, Keyword.VEC3);

BuiltinFunction._create(
  "textureGrad",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2
);
BuiltinFunction._create(
  "textureGrad",
  Keyword.FLOAT,
  Keyword.SAMPLER_CUBE_SHADOW,
  Keyword.VEC4,
  Keyword.VEC3,
  Keyword.VEC3
);

BuiltinFunction._create(
  "textureGrad",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2
);
BuiltinFunction._create(
  "textureGrad",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_ARRAY_SHADOW,
  Keyword.VEC4,
  Keyword.VEC2,
  Keyword.VEC2
);

BuiltinFunction._create(
  "textureGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureGradOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.VEC3,
  Keyword.VEC3,
  Keyword.VEC3,
  Keyword.IVEC3
);
BuiltinFunction._create(
  "textureGradOffset",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureGradOffset",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_ARRAY_SHADOW,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);

BuiltinFunction._create(
  "textureProjGrad",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2
);
BuiltinFunction._create(
  "textureProjGrad",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC4,
  Keyword.VEC2,
  Keyword.VEC2
);
BuiltinFunction._create(
  "textureProjGrad",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.VEC4,
  Keyword.VEC3,
  Keyword.VEC3
);
BuiltinFunction._create(
  "textureProjGrad",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC4,
  Keyword.VEC2,
  Keyword.VEC2
);

BuiltinFunction._create(
  "textureProjGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  Keyword.VEC4,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjGradOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  Keyword.VEC4,
  Keyword.VEC3,
  Keyword.VEC3,
  Keyword.IVEC3
);
BuiltinFunction._create(
  "textureProjGradOffset",
  Keyword.FLOAT,
  Keyword.SAMPLER2D_SHADOW,
  Keyword.VEC4,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._createWithScop("dFdx", EGenType.GenType, EShaderStage.FRAGMENT, EGenType.GenType);
BuiltinFunction._createWithScop("dFdy", EGenType.GenType, EShaderStage.FRAGMENT, EGenType.GenType);
BuiltinFunction._createWithScop("fwidth", EGenType.GenType, EShaderStage.FRAGMENT, EGenType.GenType);
