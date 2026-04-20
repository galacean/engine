import { GalaceanDataType, TypeAny } from "../../common";
import { Keyword } from "../../common/enums/Keyword";
import { EShaderStage } from "../../common/enums/ShaderStage";

export enum GenericType {
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
type BuiltinType = NonGenericGalaceanType | GenericType;

// Generic type system
//
// A generic family declares its concrete members and the dimension along which
// members vary. Matching a generic position locks an index; projecting a return
// family uses that index. Two families can only share an index if they vary
// along the same dimension
//
// Example: `texture(GSampler2D, vec2) → GVec4` against `texture(sampler2D, uv)`
//   1. Locate `sampler2D` in GSampler2D (ScalarType dimension) → index 0
//   2. Project GVec4 (ScalarType dimension) at index 0         → vec4
//
// `ivec4 = texture(isampler2D, uv)` locks index 1, projects to `ivec4`
// `min(vec3, vec3)` locks index 2 in GenType (Size dimension) and returns vec3
// `min(vec3, vec2)` fails because the second arg would need index 1 but 2 is locked

const enum GenericDimension {
  // Varies along vector size: scalar / vec2 / vec3 / vec4 (or equivalents)
  Size,
  // Varies along the underlying scalar type: float / int / uint (sometimes with bool)
  ScalarType
}

type FamilySpec = {
  readonly dimension: GenericDimension;
  readonly members: readonly NonGenericGalaceanType[];
};

const FamilyMembers: Partial<Record<GenericType, FamilySpec>> = {
  // Size-varying families: index 0 → scalar, 1 → vec2, 2 → vec3, 3 → vec4
  [GenericType.GenType]: { dimension: GenericDimension.Size, members: [Keyword.FLOAT, Keyword.VEC2, Keyword.VEC3, Keyword.VEC4] },
  [GenericType.GenIntType]: { dimension: GenericDimension.Size, members: [Keyword.INT, Keyword.IVEC2, Keyword.IVEC3, Keyword.IVEC4] },
  [GenericType.GenUintType]: {
    dimension: GenericDimension.Size,
    members: [Keyword.UINT, Keyword.UVEC2, Keyword.UVEC3, Keyword.UVEC4]
  },
  [GenericType.GenBoolType]: {
    dimension: GenericDimension.Size,
    members: [Keyword.BOOL, Keyword.BVEC2, Keyword.BVEC3, Keyword.BVEC4]
  },
  // Vec-only sub-families (no scalar): index 0 → vec2, 1 → vec3, 2 → vec4
  [GenericType.Vec]: { dimension: GenericDimension.Size, members: [Keyword.VEC2, Keyword.VEC3, Keyword.VEC4] },
  [GenericType.IntVec]: { dimension: GenericDimension.Size, members: [Keyword.IVEC2, Keyword.IVEC3, Keyword.IVEC4] },
  [GenericType.UintVec]: { dimension: GenericDimension.Size, members: [Keyword.UVEC2, Keyword.UVEC3, Keyword.UVEC4] },
  [GenericType.BoolVec]: { dimension: GenericDimension.Size, members: [Keyword.BVEC2, Keyword.BVEC3, Keyword.BVEC4] },
  [GenericType.Mat]: { dimension: GenericDimension.Size, members: [Keyword.MAT2, Keyword.MAT3, Keyword.MAT4] },

  // ScalarType-varying families: index 0 → float base, 1 → int base, 2 → uint base
  [GenericType.GSampler2D]: {
    dimension: GenericDimension.ScalarType,
    members: [Keyword.SAMPLER2D, Keyword.I_SAMPLER2D, Keyword.U_SAMPLER2D]
  },
  [GenericType.GSampler3D]: {
    dimension: GenericDimension.ScalarType,
    members: [Keyword.SAMPLER3D, Keyword.I_SAMPLER3D, Keyword.U_SAMPLER3D]
  },
  [GenericType.GSamplerCube]: {
    dimension: GenericDimension.ScalarType,
    members: [Keyword.SAMPLER_CUBE, Keyword.I_SAMPLER_CUBE, Keyword.U_SAMPLER_CUBE]
  },
  [GenericType.GSampler2DArray]: {
    dimension: GenericDimension.ScalarType,
    members: [Keyword.SAMPLER2D_ARRAY, Keyword.I_SAMPLER2D_ARRAY, Keyword.U_SAMPLER2D_ARRAY]
  },
  [GenericType.GVec4]: { dimension: GenericDimension.ScalarType, members: [Keyword.VEC4, Keyword.IVEC4, Keyword.UVEC4] }
};

// Reverse of `FamilyMembers`: given a concrete type, find its index within a family.
// Keyed by (family, type) rather than just by type because the same concrete can appear
// in multiple families at different indices (VEC4 is index 3 in GenType, index 0 in GVec4)
const FamilyMemberIndex = new Map<GenericType, Map<NonGenericGalaceanType, number>>();
for (const key in FamilyMembers) {
  const family = Number(key) as GenericType;
  const spec = FamilyMembers[family]!;
  const indexMap = new Map<NonGenericGalaceanType, number>();
  for (let i = 0; i < spec.members.length; i++) indexMap.set(spec.members[i], i);
  FamilyMemberIndex.set(family, indexMap);
}

// Locate a concrete type in a family. Returns index on hit, -1 on miss.
// The `!` is safe: callers only reach here after confirming the family is in
// `FamilyMembers`, and `FamilyMemberIndex` is built from the same key set.
function familyIndexOf(family: GenericType, type: NonGenericGalaceanType): number {
  return FamilyMemberIndex.get(family)!.get(type) ?? -1;
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

  // Overload resolution against the generic family system
  //
  // For each candidate signature: concrete positions require exact type match;
  // generic positions locate the actual arg's index within the declared family,
  // and lock an index per dimension (size / scalar-type) shared across positions.
  // The return type is resolved by projecting the appropriate lock through the
  // return family, or passed through verbatim if the return is concrete
  static resolveOverload(
    ident: string,
    parameterTypes: NonGenericGalaceanType[] | undefined
  ): BuiltinFunction | undefined {
    const list = BuiltinFunctionTable.get(ident);
    if (!list) return undefined;
    const argCount = parameterTypes?.length ?? 0;

    for (let i = 0, len = list.length; i < len; i++) {
      const fn = list[i];
      const fnArgs = fn.args;
      if (fnArgs.length !== argCount) continue;

      let sizeLock = -1;
      let scalarTypeLock = -1;
      let matched = true;

      for (let j = 0; j < argCount; j++) {
        const declared = fnArgs[j];
        const actual = parameterTypes![j];
        if (actual === TypeAny) continue;

        const family = FamilyMembers[declared as GenericType];
        if (family) {
          const idx = familyIndexOf(declared as GenericType, actual);
          if (idx === -1) {
            matched = false;
            break;
          }
          if (family.dimension === GenericDimension.Size) {
            if (sizeLock === -1) sizeLock = idx;
            else if (sizeLock !== idx) {
              matched = false;
              break;
            }
          } else {
            if (scalarTypeLock === -1) scalarTypeLock = idx;
            else if (scalarTypeLock !== idx) {
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

      const returnFamily = FamilyMembers[fn._returnType as GenericType];
      if (!returnFamily) {
        fn._realReturnType = fn._returnType as NonGenericGalaceanType;
        return fn;
      }
      const lock = returnFamily.dimension === GenericDimension.Size ? sizeLock : scalarTypeLock;
      // No argument locked the dimension (all relevant args were TypeAny): fall
      // through as TypeAny so downstream overload resolution treats the result
      // as a wildcard rather than a specific guess
      fn._realReturnType = lock === -1 ? TypeAny : returnFamily.members[lock];
      return fn;
    }

    return undefined;
  }

  static isExist(ident: string) {
    return !!BuiltinFunctionTable.get(ident);
  }
}

BuiltinFunction._create("radians", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("degrees", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("sin", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("cos", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("tan", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("asin", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("acos", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("atan", GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("atan", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("sinh", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("cosh", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("tanh", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("asinh", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("acosh", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("atanh", GenericType.GenType, GenericType.GenType);

BuiltinFunction._create("pow", GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("exp", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("log", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("exp2", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("log2", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("sqrt", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("inversesqrt", GenericType.GenType, GenericType.GenType);

BuiltinFunction._create("abs", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("abs", GenericType.GenIntType, GenericType.GenIntType);
BuiltinFunction._create("sign", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("sign", GenericType.GenIntType, GenericType.GenIntType);
BuiltinFunction._create("floor", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("trunc", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("round", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("roundEven", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("ceil", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("fract", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("mod", GenericType.GenType, GenericType.GenType, Keyword.FLOAT);
BuiltinFunction._create("mod", GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("min", GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("min", GenericType.GenType, GenericType.GenType, Keyword.FLOAT);
BuiltinFunction._create("min", GenericType.GenIntType, GenericType.GenIntType, GenericType.GenIntType);
BuiltinFunction._create("min", GenericType.GenIntType, GenericType.GenIntType, Keyword.INT);
BuiltinFunction._create("min", GenericType.GenUintType, GenericType.GenUintType, GenericType.GenUintType);
BuiltinFunction._create("min", GenericType.GenUintType, GenericType.GenUintType, Keyword.UINT);
BuiltinFunction._create("max", GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("max", GenericType.GenType, GenericType.GenType, Keyword.FLOAT);
BuiltinFunction._create("max", GenericType.GenIntType, GenericType.GenIntType, GenericType.GenIntType);
BuiltinFunction._create("max", GenericType.GenIntType, GenericType.GenIntType, Keyword.INT);
BuiltinFunction._create("clamp", GenericType.GenType, GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("clamp", GenericType.GenType, GenericType.GenType, Keyword.FLOAT, Keyword.FLOAT);
BuiltinFunction._create("clamp", GenericType.GenIntType, GenericType.GenIntType, GenericType.GenIntType, GenericType.GenIntType);
BuiltinFunction._create("clamp", GenericType.GenIntType, GenericType.GenIntType, Keyword.INT, Keyword.INT);
BuiltinFunction._create(
  "clamp",
  GenericType.GenUintType,
  GenericType.GenUintType,
  GenericType.GenUintType,
  GenericType.GenUintType
);
BuiltinFunction._create("clamp", GenericType.GenUintType, GenericType.GenUintType, Keyword.UINT, Keyword.UINT);
BuiltinFunction._create("mix", GenericType.GenType, GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("mix", GenericType.GenType, GenericType.GenType, GenericType.GenType, Keyword.FLOAT);
BuiltinFunction._create("mix", GenericType.GenType, GenericType.GenType, GenericType.GenType, GenericType.GenBoolType);
BuiltinFunction._create("step", GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("step", GenericType.GenType, Keyword.FLOAT, GenericType.GenType);
BuiltinFunction._create("smoothstep", GenericType.GenType, GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("smoothstep", GenericType.GenType, Keyword.FLOAT, Keyword.FLOAT, GenericType.GenType);
BuiltinFunction._create("isnan", GenericType.GenBoolType, GenericType.GenType);
BuiltinFunction._create("isinf", GenericType.GenBoolType, GenericType.GenType);
BuiltinFunction._create("floatBitsToInt", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("floatBitsToUint", GenericType.GenUintType, GenericType.GenType);
BuiltinFunction._create("intBitsToFloat", GenericType.GenType, GenericType.GenIntType);
BuiltinFunction._create("uintBitsToFloat", GenericType.GenType, GenericType.GenUintType);

BuiltinFunction._create("packSnorm2x16", Keyword.UINT, Keyword.VEC2);
BuiltinFunction._create("unpackSnorm2x16", Keyword.VEC2, Keyword.UINT);
BuiltinFunction._create("packUnorm2x16", Keyword.UINT, Keyword.VEC2);
BuiltinFunction._create("unpackUnorm2x16", Keyword.VEC2, Keyword.UINT);
BuiltinFunction._create("packHalf2x16", Keyword.UINT, Keyword.VEC2);
BuiltinFunction._create("unpackHalf2x16", Keyword.VEC2, Keyword.UINT);

BuiltinFunction._create("length", Keyword.FLOAT, GenericType.GenType);
BuiltinFunction._create("distance", Keyword.FLOAT, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("dot", Keyword.FLOAT, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("cross", Keyword.VEC3, Keyword.VEC3, Keyword.VEC3);
BuiltinFunction._create("normalize", GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("faceforward", GenericType.GenType, GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("reflect", GenericType.GenType, GenericType.GenType, GenericType.GenType);
BuiltinFunction._create("refract", GenericType.GenType, GenericType.GenType, GenericType.GenType, Keyword.FLOAT);
BuiltinFunction._create("matrixCompMult", GenericType.Mat, GenericType.Mat, GenericType.Mat);
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

BuiltinFunction._create("lessThan", GenericType.BoolVec, GenericType.Vec, GenericType.Vec);
BuiltinFunction._create("lessThan", GenericType.BoolVec, GenericType.IntVec, GenericType.IntVec);
BuiltinFunction._create("lessThan", GenericType.BoolVec, GenericType.UintVec, GenericType.UintVec);

BuiltinFunction._create("lessThanEqual", GenericType.BoolVec, GenericType.Vec, GenericType.Vec);
BuiltinFunction._create("lessThanEqual", GenericType.BoolVec, GenericType.IntVec, GenericType.IntVec);
BuiltinFunction._create("lessThanEqual", GenericType.BoolVec, GenericType.UintVec, GenericType.UintVec);

BuiltinFunction._create("greaterThan", GenericType.BoolVec, GenericType.Vec, GenericType.Vec);
BuiltinFunction._create("greaterThan", GenericType.BoolVec, GenericType.IntVec, GenericType.IntVec);
BuiltinFunction._create("greaterThan", GenericType.BoolVec, GenericType.UintVec, GenericType.UintVec);

BuiltinFunction._create("greaterThanEqual", GenericType.BoolVec, GenericType.Vec, GenericType.Vec);
BuiltinFunction._create("greaterThanEqual", GenericType.BoolVec, GenericType.IntVec, GenericType.IntVec);
BuiltinFunction._create("greaterThanEqual", GenericType.BoolVec, GenericType.UintVec, GenericType.UintVec);

BuiltinFunction._create("equal", GenericType.BoolVec, GenericType.Vec, GenericType.Vec);
BuiltinFunction._create("equal", GenericType.BoolVec, GenericType.IntVec, GenericType.IntVec);
BuiltinFunction._create("equal", GenericType.BoolVec, GenericType.UintVec, GenericType.UintVec);
BuiltinFunction._create("equal", GenericType.BoolVec, GenericType.BoolVec, GenericType.BoolVec);

BuiltinFunction._create("notEqual", GenericType.BoolVec, GenericType.Vec, GenericType.Vec);
BuiltinFunction._create("notEqual", GenericType.BoolVec, GenericType.IntVec, GenericType.IntVec);
BuiltinFunction._create("notEqual", GenericType.BoolVec, GenericType.UintVec, GenericType.UintVec);
BuiltinFunction._create("notEqual", GenericType.BoolVec, GenericType.BoolVec, GenericType.BoolVec);

BuiltinFunction._create("any", Keyword.BOOL, GenericType.BoolVec);
BuiltinFunction._create("all", Keyword.BOOL, GenericType.BoolVec);
BuiltinFunction._create("not", GenericType.BoolVec, GenericType.BoolVec);

BuiltinFunction._create("textureSize", Keyword.IVEC2, GenericType.GSampler2D, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC3, GenericType.GSampler3D, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC2, GenericType.GSamplerCube, Keyword.INT);

BuiltinFunction._create("textureSize", Keyword.IVEC2, Keyword.SAMPLER2D_SHADOW, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC2, Keyword.SAMPLER_CUBE_SHADOW, Keyword.INT);

BuiltinFunction._create("textureSize", Keyword.IVEC3, GenericType.GSampler2DArray, Keyword.INT);
BuiltinFunction._create("textureSize", Keyword.IVEC3, Keyword.SAMPLER2D_ARRAY_SHADOW, Keyword.INT);

BuiltinFunction._create("texture2D", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2);
BuiltinFunction._create("texture2D", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);

BuiltinFunction._create("texture", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("texture", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2);
BuiltinFunction._create("texture", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC3);

BuiltinFunction._create("texture", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3);

BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC3);

BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER_CUBE_SHADOW, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER_CUBE_SHADOW, Keyword.VEC4);

BuiltinFunction._create("texture", GenericType.GVec4, Keyword.SAMPLER2D_ARRAY, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture", GenericType.GVec4, Keyword.SAMPLER2D_ARRAY, Keyword.VEC3);

BuiltinFunction._create("texture", Keyword.FLOAT, Keyword.SAMPLER2D_ARRAY_SHADOW, Keyword.VEC4);

BuiltinFunction._create("textureProj", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureProj", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC3);
BuiltinFunction._create("textureProj", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProj", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC4);
BuiltinFunction._create("textureProj", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProj", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC4);

BuiltinFunction._create("textureProj", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProj", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC4);

BuiltinFunction._create("textureLod", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("textureLod", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureLod", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureLod", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureLod", GenericType.GVec4, GenericType.GSampler2DArray, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("texture2DLod", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("texture2DLodEXT", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2, Keyword.FLOAT);
BuiltinFunction._create("texture2DLodEXT", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC3, Keyword.FLOAT);

BuiltinFunction._create("textureCube", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3);
BuiltinFunction._create("textureCube", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureCubeLod", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureCubeLodEXT", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3, Keyword.FLOAT);

BuiltinFunction._create(
  "textureOffset",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC2,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureOffset", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2, Keyword.IVEC2);

BuiltinFunction._create(
  "textureOffset",
  GenericType.GVec4,
  GenericType.GSampler3D,
  Keyword.VEC3,
  Keyword.IVEC3,
  Keyword.FLOAT
);
BuiltinFunction._create("textureOffset", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC3, Keyword.IVEC3);

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
  GenericType.GVec4,
  GenericType.GSampler2DArray,
  Keyword.VEC3,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureOffset", GenericType.GVec4, GenericType.GSampler2DArray, Keyword.VEC3, Keyword.IVEC2);

BuiltinFunction._create("texelFetch", GenericType.GVec4, GenericType.GSampler2D, Keyword.IVEC2, Keyword.INT);
BuiltinFunction._create("texelFetch", GenericType.GVec4, GenericType.GSampler3D, Keyword.IVEC3, Keyword.INT);
BuiltinFunction._create("texelFetch", GenericType.GVec4, GenericType.GSampler2DArray, Keyword.IVEC3, Keyword.INT);

BuiltinFunction._create(
  "texelFetchOffset",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.IVEC2,
  Keyword.INT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "texelFetchOffset",
  GenericType.GVec4,
  GenericType.GSampler3D,
  Keyword.IVEC3,
  Keyword.INT,
  Keyword.IVEC3
);
BuiltinFunction._create(
  "texelFetchOffset",
  GenericType.GVec4,
  GenericType.GSampler2DArray,
  Keyword.IVEC3,
  Keyword.INT,
  Keyword.IVEC2
);

BuiltinFunction._create(
  "textureProjOffset",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC3,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC3, Keyword.IVEC2);

BuiltinFunction._create(
  "textureProjOffset",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC4,
  Keyword.IVEC2,
  Keyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC4, Keyword.IVEC2);

BuiltinFunction._create(
  "textureProjOffset",
  GenericType.GVec4,
  GenericType.GSampler3D,
  Keyword.VEC4,
  Keyword.IVEC3,
  Keyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC4, Keyword.IVEC3);

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
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC2,
  Keyword.FLOAT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureLodOffset",
  GenericType.GVec4,
  GenericType.GSampler3D,
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
  GenericType.GVec4,
  GenericType.GSampler2DArray,
  Keyword.VEC3,
  Keyword.FLOAT,
  Keyword.IVEC2
);

BuiltinFunction._create("textureProjLod", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC3, Keyword.FLOAT);
BuiltinFunction._create("textureProjLod", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProjLod", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC4, Keyword.FLOAT);
BuiltinFunction._create("textureProjLod", Keyword.FLOAT, Keyword.SAMPLER2D_SHADOW, Keyword.VEC4, Keyword.FLOAT);

BuiltinFunction._create(
  "textureProjLodOffset",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC3,
  Keyword.FLOAT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjLodOffset",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC4,
  Keyword.FLOAT,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjLodOffset",
  GenericType.GVec4,
  GenericType.GSampler3D,
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

BuiltinFunction._create("textureGrad", GenericType.GVec4, GenericType.GSampler2D, Keyword.VEC2, Keyword.VEC2, Keyword.VEC2);
BuiltinFunction._create("textureGrad", GenericType.GVec4, GenericType.GSampler3D, Keyword.VEC3, Keyword.VEC3, Keyword.VEC3);
BuiltinFunction._create("textureGrad", GenericType.GVec4, GenericType.GSamplerCube, Keyword.VEC3, Keyword.VEC3, Keyword.VEC3);

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
  GenericType.GVec4,
  GenericType.GSampler2DArray,
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
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureGradOffset",
  GenericType.GVec4,
  GenericType.GSampler3D,
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
  GenericType.GVec4,
  GenericType.GSampler2DArray,
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
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2
);
BuiltinFunction._create(
  "textureProjGrad",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC4,
  Keyword.VEC2,
  Keyword.VEC2
);
BuiltinFunction._create(
  "textureProjGrad",
  GenericType.GVec4,
  GenericType.GSampler3D,
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
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC3,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjGradOffset",
  GenericType.GVec4,
  GenericType.GSampler2D,
  Keyword.VEC4,
  Keyword.VEC2,
  Keyword.VEC2,
  Keyword.IVEC2
);
BuiltinFunction._create(
  "textureProjGradOffset",
  GenericType.GVec4,
  GenericType.GSampler3D,
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
BuiltinFunction._createWithScop("dFdx", GenericType.GenType, EShaderStage.FRAGMENT, GenericType.GenType);
BuiltinFunction._createWithScop("dFdy", GenericType.GenType, EShaderStage.FRAGMENT, GenericType.GenType);
BuiltinFunction._createWithScop("fwidth", GenericType.GenType, EShaderStage.FRAGMENT, GenericType.GenType);
