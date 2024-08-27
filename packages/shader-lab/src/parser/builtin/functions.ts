import { EKeyword, GalaceanDataType, TypeAny } from "../../common";
import { EShaderStage } from "../../common/Enums";

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

const BuiltinFunctionTable: Map<string, BuiltinFunction[]> = new Map();

export class BuiltinFunction {
  private _returnType: BuiltinType;
  ident: string;
  readonly args: BuiltinType[];
  readonly scope: EShaderStage;

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

  static getFn(
    ident: string,
    ...args: BuiltinType[]
  ): { fun: BuiltinFunction; genType: Exclude<GalaceanDataType, string> } | undefined {
    const list = BuiltinFunctionTable.get(ident);
    let realType = TypeAny;
    if (list?.length) {
      const fun = list.find((item) => {
        if (item.args.length !== args.length) return false;
        let genType = 0;
        for (let i = 0; i < args.length; i++) {
          if (args[i] === TypeAny) continue;
          realType = args[i];
          if (isGenericType(item.args[i])) {
            if (genType === 0) {
              genType = args[i];
              continue;
            } else {
              realType = genType;
            }
          }
          if (args[i] === TypeAny) continue;
          if (args[i] !== realType) return false;
        }
        return true;
      });
      if (fun) return { fun, genType: realType };
    }
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
BuiltinFunction._create("mod", EGenType.GenType, EGenType.GenType, EKeyword.FLOAT);
BuiltinFunction._create("mod", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("min", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("min", EGenType.GenType, EKeyword.FLOAT);
BuiltinFunction._create("min", EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("min", EGenType.GenIntType, EKeyword.INT);
BuiltinFunction._create("min", EGenType.GenUintType, EGenType.GenUintType, EGenType.GenUintType);
BuiltinFunction._create("min", EGenType.GenUintType, EGenType.GenUintType, EKeyword.UINT);
BuiltinFunction._create("max", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("max", EGenType.GenType, EKeyword.FLOAT);
BuiltinFunction._create("max", EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("max", EGenType.GenIntType, EKeyword.INT);
BuiltinFunction._create("clamp", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("clamp", EGenType.GenType, EGenType.GenType, EKeyword.FLOAT, EKeyword.FLOAT);
BuiltinFunction._create("clamp", EGenType.GenIntType, EGenType.GenIntType, EGenType.GenIntType, EGenType.GenIntType);
BuiltinFunction._create("clamp", EGenType.GenIntType, EGenType.GenIntType, EKeyword.INT, EKeyword.INT);
BuiltinFunction._create(
  "clamp",
  EGenType.GenUintType,
  EGenType.GenUintType,
  EGenType.GenUintType,
  EGenType.GenUintType
);
BuiltinFunction._create("clamp", EGenType.GenUintType, EGenType.GenUintType, EKeyword.UINT, EKeyword.UINT);
BuiltinFunction._create("mix", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("mix", EGenType.GenType, EGenType.GenType, EGenType.GenType, EKeyword.FLOAT);
BuiltinFunction._create("mix", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenBoolType);
BuiltinFunction._create("step", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("step", EGenType.GenType, EKeyword.FLOAT, EGenType.GenType);
BuiltinFunction._create("smoothstep", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("smoothstep", EGenType.GenType, EKeyword.FLOAT, EKeyword.FLOAT, EGenType.GenType);
BuiltinFunction._create("isnan", EGenType.GenBoolType, EGenType.GenType);
BuiltinFunction._create("isinf", EGenType.GenBoolType, EGenType.GenType);
BuiltinFunction._create("floatBitsToInt", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("floatBitsToUint", EGenType.GenUintType, EGenType.GenType);
BuiltinFunction._create("intBitsToFloat", EGenType.GenType, EGenType.GenIntType);
BuiltinFunction._create("uintBitsToFloat", EGenType.GenType, EGenType.GenUintType);

BuiltinFunction._create("packSnorm2x16", EKeyword.UINT, EKeyword.VEC2);
BuiltinFunction._create("unpackSnorm2x16", EKeyword.VEC2, EKeyword.UINT);
BuiltinFunction._create("packUnorm2x16", EKeyword.UINT, EKeyword.VEC2);
BuiltinFunction._create("unpackUnorm2x16", EKeyword.VEC2, EKeyword.UINT);
BuiltinFunction._create("packHalf2x16", EKeyword.UINT, EKeyword.VEC2);
BuiltinFunction._create("unpackHalf2x16", EKeyword.VEC2, EKeyword.UINT);

BuiltinFunction._create("length", EKeyword.FLOAT, EGenType.GenType);
BuiltinFunction._create("distance", EKeyword.FLOAT, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("dot", EKeyword.FLOAT, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("cross", EKeyword.VEC3, EKeyword.VEC3, EKeyword.VEC3);
BuiltinFunction._create("normalize", EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("faceforward", EGenType.GenType, EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("reflect", EGenType.GenType, EGenType.GenType, EGenType.GenType);
BuiltinFunction._create("refract", EGenType.GenType, EGenType.GenType, EGenType.GenType, EKeyword.FLOAT);
BuiltinFunction._create("matrixCompMult", EGenType.Mat, EGenType.Mat, EGenType.Mat);
BuiltinFunction._create("outerProduct", EKeyword.MAT2, EKeyword.VEC2, EKeyword.VEC2);
BuiltinFunction._create("outerProduct", EKeyword.MAT3, EKeyword.VEC3, EKeyword.VEC3);
BuiltinFunction._create("outerProduct", EKeyword.MAT4, EKeyword.VEC4, EKeyword.VEC4);

BuiltinFunction._create("outerProduct", EKeyword.MAT2X3, EKeyword.VEC3, EKeyword.VEC2);
BuiltinFunction._create("outerProduct", EKeyword.MAT3X2, EKeyword.VEC2, EKeyword.VEC3);

BuiltinFunction._create("outerProduct", EKeyword.MAT2X4, EKeyword.VEC4, EKeyword.VEC2);
BuiltinFunction._create("outerProduct", EKeyword.MAT4X2, EKeyword.VEC2, EKeyword.VEC4);

BuiltinFunction._create("outerProduct", EKeyword.MAT3X4, EKeyword.VEC4, EKeyword.VEC3);
BuiltinFunction._create("outerProduct", EKeyword.MAT4X3, EKeyword.VEC3, EKeyword.VEC4);

BuiltinFunction._create("transpose", EKeyword.MAT2, EKeyword.MAT2);
BuiltinFunction._create("transpose", EKeyword.MAT3, EKeyword.MAT3);
BuiltinFunction._create("transpose", EKeyword.MAT4, EKeyword.MAT4);
BuiltinFunction._create("transpose", EKeyword.MAT2X3, EKeyword.MAT3X2);
BuiltinFunction._create("transpose", EKeyword.MAT3X2, EKeyword.MAT2X3);
BuiltinFunction._create("transpose", EKeyword.MAT4X2, EKeyword.MAT2X4);
BuiltinFunction._create("transpose", EKeyword.MAT2X4, EKeyword.MAT4X2);
BuiltinFunction._create("transpose", EKeyword.MAT3X4, EKeyword.MAT4X3);
BuiltinFunction._create("transpose", EKeyword.MAT4X3, EKeyword.MAT3X4);

BuiltinFunction._create("determinant", EKeyword.FLOAT, EKeyword.MAT2);
BuiltinFunction._create("determinant", EKeyword.FLOAT, EKeyword.MAT3);
BuiltinFunction._create("determinant", EKeyword.FLOAT, EKeyword.MAT4);

BuiltinFunction._create("inverse", EKeyword.MAT2, EKeyword.MAT2);
BuiltinFunction._create("inverse", EKeyword.MAT3, EKeyword.MAT3);
BuiltinFunction._create("inverse", EKeyword.MAT4, EKeyword.MAT4);

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

BuiltinFunction._create("any", EKeyword.BOOL, EGenType.BoolVec);
BuiltinFunction._create("all", EKeyword.BOOL, EGenType.BoolVec);
BuiltinFunction._create("not", EGenType.BoolVec, EGenType.BoolVec);

BuiltinFunction._create("textureSize", EKeyword.IVEC2, EGenType.GSampler2D, EKeyword.INT);
BuiltinFunction._create("textureSize", EKeyword.IVEC3, EGenType.GSampler3D, EKeyword.INT);
BuiltinFunction._create("textureSize", EKeyword.IVEC2, EGenType.GSamplerCube, EKeyword.INT);

BuiltinFunction._create("textureSize", EKeyword.IVEC2, EKeyword.SAMPLER2D_SHADOW, EKeyword.INT);
BuiltinFunction._create("textureSize", EKeyword.IVEC2, EKeyword.SAMPLER_CUBE_SHADOW, EKeyword.INT);

BuiltinFunction._create("textureSize", EKeyword.IVEC3, EGenType.GSampler2DArray, EKeyword.INT);
BuiltinFunction._create("textureSize", EKeyword.IVEC3, EKeyword.SAMPLER2D_ARRAY_SHADOW, EKeyword.INT);

BuiltinFunction._create("texture2D", EKeyword.SAMPLER2D, EKeyword.VEC2);
BuiltinFunction._create("texture2D", EKeyword.SAMPLER2D, EKeyword.VEC2, EKeyword.FLOAT);

BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC2, EKeyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC2);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC3);

BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSamplerCube, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, EGenType.GSamplerCube, EKeyword.VEC3);

BuiltinFunction._create("texture", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("texture", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC3);

BuiltinFunction._create("texture", EKeyword.FLOAT, EKeyword.SAMPLER_CUBE_SHADOW, EKeyword.VEC4, EKeyword.FLOAT);
BuiltinFunction._create("texture", EKeyword.FLOAT, EKeyword.SAMPLER_CUBE_SHADOW, EKeyword.VEC4);

BuiltinFunction._create("texture", EGenType.GVec4, EKeyword.SAMPLER2D_ARRAY, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("texture", EGenType.GVec4, EKeyword.SAMPLER2D_ARRAY, EKeyword.VEC3);

BuiltinFunction._create("texture", EKeyword.FLOAT, EKeyword.SAMPLER2D_ARRAY_SHADOW, EKeyword.VEC4);

BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC3);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC4, EKeyword.FLOAT);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC4);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC4, EKeyword.FLOAT);
BuiltinFunction._create("textureProj", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC4);

BuiltinFunction._create("textureProj", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC4, EKeyword.FLOAT);
BuiltinFunction._create("textureProj", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC4);

BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC2, EKeyword.FLOAT);
BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSamplerCube, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("textureLod", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("textureLod", EGenType.GVec4, EGenType.GSampler2DArray, EKeyword.VEC3, EKeyword.FLOAT);

BuiltinFunction._create("textureCube", EKeyword.SAMPLER_CUBE, EKeyword.VEC3);
BuiltinFunction._create("textureCube", EKeyword.SAMPLER_CUBE, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("textureCubeLod", EKeyword.SAMPLER_CUBE, EKeyword.VEC3, EKeyword.FLOAT);

BuiltinFunction._create(
  "textureOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC2,
  EKeyword.IVEC2,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureOffset", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC2, EKeyword.IVEC2);

BuiltinFunction._create(
  "textureOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC3,
  EKeyword.IVEC3,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureOffset", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC3, EKeyword.IVEC3);

BuiltinFunction._create(
  "textureOffset",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC3,
  EKeyword.IVEC2,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureOffset", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC3, EKeyword.IVEC2);
BuiltinFunction._create(
  "textureOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  EKeyword.VEC3,
  EKeyword.IVEC2,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureOffset", EGenType.GVec4, EGenType.GSampler2DArray, EKeyword.VEC3, EKeyword.IVEC2);

BuiltinFunction._create("texelFetch", EGenType.GVec4, EGenType.GSampler2D, EKeyword.IVEC2, EKeyword.INT);
BuiltinFunction._create("texelFetch", EGenType.GVec4, EGenType.GSampler3D, EKeyword.IVEC3, EKeyword.INT);
BuiltinFunction._create("texelFetch", EGenType.GVec4, EGenType.GSampler2DArray, EKeyword.IVEC3, EKeyword.INT);

BuiltinFunction._create(
  "texelFetchOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.IVEC2,
  EKeyword.INT,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "texelFetchOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.IVEC3,
  EKeyword.INT,
  EKeyword.IVEC3
);
BuiltinFunction._create(
  "texelFetchOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  EKeyword.IVEC3,
  EKeyword.INT,
  EKeyword.IVEC2
);

BuiltinFunction._create(
  "textureProjOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC3,
  EKeyword.IVEC2,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC3, EKeyword.IVEC2);

BuiltinFunction._create(
  "textureProjOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC4,
  EKeyword.IVEC2,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC4, EKeyword.IVEC2);

BuiltinFunction._create(
  "textureProjOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC4,
  EKeyword.IVEC3,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC4, EKeyword.IVEC3);

BuiltinFunction._create(
  "textureProjOffset",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC4,
  EKeyword.IVEC2,
  EKeyword.FLOAT
);
BuiltinFunction._create("textureProjOffset", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC4, EKeyword.IVEC2);

BuiltinFunction._create(
  "textureLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC2,
  EKeyword.FLOAT,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureLodOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC3,
  EKeyword.FLOAT,
  EKeyword.IVEC3
);

BuiltinFunction._create(
  "textureLodOffset",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC3,
  EKeyword.FLOAT,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  EKeyword.VEC3,
  EKeyword.FLOAT,
  EKeyword.IVEC2
);

BuiltinFunction._create("textureProjLod", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC3, EKeyword.FLOAT);
BuiltinFunction._create("textureProjLod", EGenType.GVec4, EGenType.GSampler2D, EKeyword.VEC4, EKeyword.FLOAT);
BuiltinFunction._create("textureProjLod", EGenType.GVec4, EGenType.GSampler3D, EKeyword.VEC4, EKeyword.FLOAT);
BuiltinFunction._create("textureProjLod", EKeyword.FLOAT, EKeyword.SAMPLER2D_SHADOW, EKeyword.VEC4, EKeyword.FLOAT);

BuiltinFunction._create(
  "textureProjLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC3,
  EKeyword.FLOAT,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureProjLodOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC4,
  EKeyword.FLOAT,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureProjLodOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC4,
  EKeyword.FLOAT,
  EKeyword.IVEC3
);
BuiltinFunction._create(
  "textureProjLodOffset",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC4,
  EKeyword.FLOAT,
  EKeyword.IVEC2
);

BuiltinFunction._create(
  "textureGrad",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.VEC2
);
BuiltinFunction._create(
  "textureGrad",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC3,
  EKeyword.VEC3,
  EKeyword.VEC3
);
BuiltinFunction._create(
  "textureGrad",
  EGenType.GVec4,
  EGenType.GSamplerCube,
  EKeyword.VEC3,
  EKeyword.VEC3,
  EKeyword.VEC3
);

BuiltinFunction._create(
  "textureGrad",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC3,
  EKeyword.VEC2,
  EKeyword.VEC2
);
BuiltinFunction._create(
  "textureGrad",
  EKeyword.FLOAT,
  EKeyword.SAMPLER_CUBE_SHADOW,
  EKeyword.VEC4,
  EKeyword.VEC3,
  EKeyword.VEC3
);

BuiltinFunction._create(
  "textureGrad",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  EKeyword.VEC3,
  EKeyword.VEC2,
  EKeyword.VEC2
);
BuiltinFunction._create(
  "textureGrad",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_ARRAY_SHADOW,
  EKeyword.VEC4,
  EKeyword.VEC2,
  EKeyword.VEC2
);

BuiltinFunction._create(
  "textureGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureGradOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC3,
  EKeyword.VEC3,
  EKeyword.VEC3,
  EKeyword.IVEC3
);
BuiltinFunction._create(
  "textureGradOffset",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC3,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2DArray,
  EKeyword.VEC3,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureGradOffset",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_ARRAY_SHADOW,
  EKeyword.VEC3,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.IVEC2
);

BuiltinFunction._create(
  "textureProjGrad",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC3,
  EKeyword.VEC2,
  EKeyword.VEC2
);
BuiltinFunction._create(
  "textureProjGrad",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC4,
  EKeyword.VEC2,
  EKeyword.VEC2
);
BuiltinFunction._create(
  "textureProjGrad",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC4,
  EKeyword.VEC3,
  EKeyword.VEC3
);
BuiltinFunction._create(
  "textureProjGrad",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC4,
  EKeyword.VEC2,
  EKeyword.VEC2
);

BuiltinFunction._create(
  "textureProjGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC3,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureProjGradOffset",
  EGenType.GVec4,
  EGenType.GSampler2D,
  EKeyword.VEC4,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.IVEC2
);
BuiltinFunction._create(
  "textureProjGradOffset",
  EGenType.GVec4,
  EGenType.GSampler3D,
  EKeyword.VEC4,
  EKeyword.VEC3,
  EKeyword.VEC3,
  EKeyword.IVEC3
);
BuiltinFunction._create(
  "textureProjGradOffset",
  EKeyword.FLOAT,
  EKeyword.SAMPLER2D_SHADOW,
  EKeyword.VEC4,
  EKeyword.VEC2,
  EKeyword.VEC2,
  EKeyword.IVEC2
);
BuiltinFunction._createWithScop("dFdx", EGenType.GenType, EShaderStage.FRAGMENT, EGenType.GenType);
BuiltinFunction._createWithScop("dFdy", EGenType.GenType, EShaderStage.FRAGMENT, EGenType.GenType);
BuiltinFunction._createWithScop("fwidth", EGenType.GenType, EShaderStage.FRAGMENT, EGenType.GenType);
