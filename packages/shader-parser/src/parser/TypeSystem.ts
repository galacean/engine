import { GalaceanDataType, TypeAny } from "../common";
import { Keyword } from "../common/enums/Keyword";

export type { GalaceanDataType } from "../common/types";

export class TypeSystem {
  /**
   * Check if type `tb` is compatible with type `ta`.
   */
  static typeCompatible(ta: GalaceanDataType, tb: GalaceanDataType | undefined) {
    if (tb == undefined || tb === TypeAny) return true;
    if (ta === Keyword.INT) {
      return ta === tb || tb === Keyword.UINT;
    }
    return ta === tb;
  }

  /**
   * GLSL ES 3.00 assignability with implicit scalar/vector conversions (spec 4.1.10):
   * `int → uint, float`; `uint → float`; `ivecN → uvecN, vecN`; `uvecN → vecN`. Returns `true`
   * when `source` may be assigned to `target`, or when either side is unknown / a struct (those
   * are skipped — not modeled here). Returns `false` only for a definite type conflict.
   */
  static isAssignable(target: GalaceanDataType | undefined, source: GalaceanDataType | undefined): boolean {
    if (target == undefined || source == undefined || target === TypeAny || source === TypeAny) return true;
    if (typeof target === "string" || typeof source === "string") return true;
    if (target === source) return true;
    switch (source) {
      case Keyword.INT:
        return target === Keyword.UINT || target === Keyword.FLOAT;
      case Keyword.UINT:
        return target === Keyword.FLOAT;
      case Keyword.IVEC2:
        return target === Keyword.UVEC2 || target === Keyword.VEC2;
      case Keyword.IVEC3:
        return target === Keyword.UVEC3 || target === Keyword.VEC3;
      case Keyword.IVEC4:
        return target === Keyword.UVEC4 || target === Keyword.VEC4;
      case Keyword.UVEC2:
        return target === Keyword.VEC2;
      case Keyword.UVEC3:
        return target === Keyword.VEC3;
      case Keyword.UVEC4:
        return target === Keyword.VEC4;
      default:
        return false;
    }
  }

  /** Human-readable GLSL name of a resolved type, for diagnostic messages. */
  static typeName(type: GalaceanDataType | undefined): string {
    if (typeof type === "string") return type;
    if (type == undefined) return "unknown";
    return (Keyword[type] ?? String(type)).toLowerCase();
  }

  /** A sampler (opaque) type — not constructible: it cannot be a function return, a local, or a value. */
  static isSamplerType(type: GalaceanDataType | undefined): boolean {
    switch (type) {
      case Keyword.SAMPLER2D:
      case Keyword.SAMPLER3D:
      case Keyword.SAMPLER_CUBE:
      case Keyword.SAMPLER2D_SHADOW:
      case Keyword.SAMPLER_CUBE_SHADOW:
      case Keyword.SAMPLER2D_ARRAY:
      case Keyword.SAMPLER2D_ARRAY_SHADOW:
      case Keyword.I_SAMPLER2D:
      case Keyword.I_SAMPLER3D:
      case Keyword.I_SAMPLER_CUBE:
      case Keyword.I_SAMPLER2D_ARRAY:
      case Keyword.U_SAMPLER2D:
      case Keyword.U_SAMPLER3D:
      case Keyword.U_SAMPLER_CUBE:
      case Keyword.U_SAMPLER2D_ARRAY:
        return true;
      default:
        return false;
    }
  }

  /** A boolean scalar/vector type. */
  static isBoolType(type: GalaceanDataType | undefined): boolean {
    return type === Keyword.BOOL || type === Keyword.BVEC2 || type === Keyword.BVEC3 || type === Keyword.BVEC4;
  }

  /** An integer scalar/vector type (signed or unsigned). */
  static isIntegerType(type: GalaceanDataType | undefined): boolean {
    switch (type) {
      case Keyword.INT:
      case Keyword.UINT:
      case Keyword.IVEC2:
      case Keyword.IVEC3:
      case Keyword.IVEC4:
      case Keyword.UVEC2:
      case Keyword.UVEC3:
      case Keyword.UVEC4:
        return true;
      default:
        return false;
    }
  }

  /**
   * True when `type` is a known type that cannot be an operand of an arithmetic operator (+, -, *, /):
   * bool, sampler, or struct. Returns false for `TypeAny`/unknown so callers skip (continue-with-unknown).
   * The numeric/vector/matrix size-compatibility rules are intentionally left to the type system.
   */
  static nonArithmeticOperand(type: GalaceanDataType | undefined): boolean {
    return (
      type != undefined &&
      type !== TypeAny &&
      (this.isBoolType(type) || this.isSamplerType(type) || typeof type === "string")
    );
  }

  /** A scalar numeric/bool type (the things a vector is built from). */
  static isScalarType(type: GalaceanDataType | undefined): boolean {
    return type === Keyword.FLOAT || type === Keyword.INT || type === Keyword.UINT || type === Keyword.BOOL;
  }

  /**
   * Result type of an arithmetic binary operator (+, -, *, /) on operands `a` and `b`, for the
   * confident GLSL cases only: same type → that type; numeric-scalar ⊙ vector/matrix → the vector/
   * matrix (component-wise / scalar broadcast). Everything ambiguous (scalar promotion like int⊙float,
   * matrix·vector, mismatched vector sizes, any non-arithmetic operand) returns `TypeAny` — leaving the
   * type unknown exactly as before, so this only ever *adds* information and never mis-deduces.
   */
  static arithmeticResultType(
    a: GalaceanDataType | undefined,
    b: GalaceanDataType | undefined
  ): GalaceanDataType | undefined {
    if (a == undefined || b == undefined || a === TypeAny || b === TypeAny) return TypeAny;
    if (this.nonArithmeticOperand(a) || this.nonArithmeticOperand(b)) return TypeAny;
    if (a === b) return a;
    const aScalar = this.isScalarType(a);
    const bScalar = this.isScalarType(b);
    if (aScalar && bScalar) return TypeAny; // different scalars: int/float promotion — stay conservative
    if (aScalar) return b; // scalar ⊙ vector/matrix
    if (bScalar) return a;
    return TypeAny; // vector·matrix, mismatched vector sizes — leave unknown
  }

  /** Component count of a vector type (2/3/4), or 0 for non-vectors. */
  static vectorComponentCount(type: GalaceanDataType | undefined): number {
    switch (type) {
      case Keyword.VEC2:
      case Keyword.IVEC2:
      case Keyword.UVEC2:
      case Keyword.BVEC2:
        return 2;
      case Keyword.VEC3:
      case Keyword.IVEC3:
      case Keyword.UVEC3:
      case Keyword.BVEC3:
        return 3;
      case Keyword.VEC4:
      case Keyword.IVEC4:
      case Keyword.UVEC4:
      case Keyword.BVEC4:
        return 4;
      default:
        return 0;
    }
  }
}
