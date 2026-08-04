import { GalaceanDataType, TypeAny } from "../common";
import { Keyword } from "../common/enums/Keyword";

export type { GalaceanDataType } from "../common/types";

/** Proven reason that a binary arithmetic operation is invalid. */
export type ArithmeticFailureReason = "non-arithmetic" | "family-mismatch" | "shape-mismatch" | "integer-required";

/**
 * Shared result of arithmetic type inference and validation.
 *
 * `valid` is undefined when an operand type is unresolved. A false value is therefore proof of an
 * invalid operation, while unresolved macro-provided types remain non-blocking.
 */
export interface ArithmeticTypeResult {
  /** Inferred result type, or `TypeAny` when it cannot be determined. */
  resultType: GalaceanDataType | undefined;
  /** Whether the operation is proven valid, proven invalid, or unresolved. */
  valid: boolean | undefined;
  /** Invalidity reason when `valid` is false. */
  reason?: ArithmeticFailureReason;
}

/** Utility functions for GLSL type classification and compatibility. */
export class TypeSystem {
  /**
   * Tests whether a value type can be assigned without an implicit conversion.
   * @param target - Type of the assignment target.
   * @param source - Type of the assigned value.
   * @returns Whether the assignment is valid or cannot yet be resolved.
   */
  static isAssignable(target: GalaceanDataType | undefined, source: GalaceanDataType | undefined): boolean {
    if (target == undefined || source == undefined || target === TypeAny || source === TypeAny) return true;
    // Struct types compare by name (§4.1.8: types are equal only if they are the same struct).
    // Mixed struct-vs-primitive is a conflict; struct-vs-struct with different names is a conflict.
    if (typeof target === "string" || typeof source === "string") return target === source;
    return target === source;
  }

  /**
   * Returns a human-readable GLSL type name.
   * @param type - Type to format.
   * @returns GLSL name or `unknown` when the type is unresolved.
   */
  static typeName(type: GalaceanDataType | undefined): string {
    if (typeof type === "string") return type;
    if (type == undefined) return "unknown";
    return (Keyword[type] ?? String(type)).toLowerCase();
  }

  /**
   * Tests whether a type is an opaque GLSL sampler.
   * @param type - Type to classify.
   * @returns Whether the type is a sampler.
   */
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

  /**
   * Tests whether a type is a boolean scalar or vector.
   * @param type - Type to classify.
   * @returns Whether the type belongs to the boolean family.
   */
  static isBoolType(type: GalaceanDataType | undefined): boolean {
    return type === Keyword.BOOL || type === Keyword.BVEC2 || type === Keyword.BVEC3 || type === Keyword.BVEC4;
  }

  /**
   * Tests whether a type is a signed or unsigned integer scalar or vector.
   * @param type - Type to classify.
   * @returns Whether the type belongs to an integer family.
   */
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
   * Tests whether a resolved type cannot participate in arithmetic.
   * @param type - Type to classify.
   * @returns Whether the type is a boolean, sampler, or struct. Unresolved types return false.
   */
  static nonArithmeticOperand(type: GalaceanDataType | undefined): boolean {
    return (
      type != undefined &&
      type !== TypeAny &&
      (this.isBoolType(type) || this.isSamplerType(type) || typeof type === "string")
    );
  }

  /**
   * Tests whether a type is a numeric or boolean scalar.
   * @param type - Type to classify.
   * @returns Whether the type is a scalar.
   */
  static isScalarType(type: GalaceanDataType | undefined): boolean {
    return type === Keyword.FLOAT || type === Keyword.INT || type === Keyword.UINT || type === Keyword.BOOL;
  }

  /**
   * Infers and validates one GLSL arithmetic operation from a single rule table.
   * @param left - Left operand type.
   * @param right - Right operand type.
   * @param operator - Arithmetic operator lexeme.
   * @returns Shared inference and validity result.
   */
  static arithmeticOperation(
    left: GalaceanDataType | undefined,
    right: GalaceanDataType | undefined,
    operator: string
  ): ArithmeticTypeResult {
    if (left == undefined || right == undefined || left === TypeAny || right === TypeAny) {
      return { resultType: TypeAny, valid: undefined };
    }

    const leftFamily = this._arithmeticFamily(left);
    const rightFamily = this._arithmeticFamily(right);
    if (!leftFamily || !rightFamily) {
      return { resultType: TypeAny, valid: false, reason: "non-arithmetic" };
    }
    if (leftFamily !== rightFamily) {
      return { resultType: TypeAny, valid: false, reason: "family-mismatch" };
    }
    if (operator === "%" && leftFamily === "float") {
      return { resultType: TypeAny, valid: false, reason: "integer-required" };
    }

    const leftScalar = this.isScalarType(left);
    const rightScalar = this.isScalarType(right);
    if (leftScalar || rightScalar) {
      return { resultType: leftScalar ? right : left, valid: true };
    }

    const leftVectorSize = this.vectorComponentCount(left);
    const rightVectorSize = this.vectorComponentCount(right);
    const leftMatrix = this.matrixDimensions(left);
    const rightMatrix = this.matrixDimensions(right);

    if (leftVectorSize && rightVectorSize) {
      return leftVectorSize === rightVectorSize
        ? { resultType: left, valid: true }
        : { resultType: TypeAny, valid: false, reason: "shape-mismatch" };
    }

    if (leftMatrix && rightMatrix) {
      if (operator === "*") {
        return leftMatrix.columns === rightMatrix.rows
          ? { resultType: this._matrixType(rightMatrix.columns, leftMatrix.rows), valid: true }
          : { resultType: TypeAny, valid: false, reason: "shape-mismatch" };
      }
      return leftMatrix.columns === rightMatrix.columns && leftMatrix.rows === rightMatrix.rows
        ? { resultType: left, valid: true }
        : { resultType: TypeAny, valid: false, reason: "shape-mismatch" };
    }

    if (operator === "*" && leftMatrix && rightVectorSize) {
      return leftMatrix.columns === rightVectorSize
        ? { resultType: this._vectorType(leftMatrix.rows), valid: true }
        : { resultType: TypeAny, valid: false, reason: "shape-mismatch" };
    }
    if (operator === "*" && leftVectorSize && rightMatrix) {
      return leftVectorSize === rightMatrix.rows
        ? { resultType: this._vectorType(rightMatrix.columns), valid: true }
        : { resultType: TypeAny, valid: false, reason: "shape-mismatch" };
    }

    return { resultType: TypeAny, valid: false, reason: "shape-mismatch" };
  }

  /**
   * Result type compatibility wrapper for existing inference consumers.
   * @param a - Left operand type.
   * @param b - Right operand type.
   * @param operator - Arithmetic operator lexeme.
   * @returns Inferred type or `TypeAny` when invalid or unresolved.
   */
  static arithmeticResultType(
    a: GalaceanDataType | undefined,
    b: GalaceanDataType | undefined,
    operator = "+"
  ): GalaceanDataType | undefined {
    return this.arithmeticOperation(a, b, operator).resultType;
  }

  private static _arithmeticFamily(type: GalaceanDataType): "float" | "int" | "uint" | undefined {
    if (typeof type === "string" || this.isBoolType(type) || this.isSamplerType(type)) return undefined;
    if (this.matrixDimensions(type)) return "float";
    switch (type) {
      case Keyword.FLOAT:
      case Keyword.VEC2:
      case Keyword.VEC3:
      case Keyword.VEC4:
        return "float";
      case Keyword.INT:
      case Keyword.IVEC2:
      case Keyword.IVEC3:
      case Keyword.IVEC4:
        return "int";
      case Keyword.UINT:
      case Keyword.UVEC2:
      case Keyword.UVEC3:
      case Keyword.UVEC4:
        return "uint";
      default:
        return undefined;
    }
  }

  private static _vectorType(size: number): GalaceanDataType {
    return size === 2 ? Keyword.VEC2 : size === 3 ? Keyword.VEC3 : size === 4 ? Keyword.VEC4 : TypeAny;
  }

  private static _matrixType(columns: number, rows: number): GalaceanDataType {
    const key = `MAT${columns}${columns === rows ? "" : `X${rows}`}` as keyof typeof Keyword;
    return (Keyword[key] as GalaceanDataType | undefined) ?? TypeAny;
  }

  /**
   * Returns the component count of a vector type.
   * @param type - Type to inspect.
   * @returns Two, three, or four for vectors; otherwise zero.
   */
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

  /**
   * Returns the total component count of a matrix type.
   * @param type - Type to inspect.
   * @returns Row count multiplied by column count, or zero for non-matrix types.
   */
  static matrixComponentCount(type: GalaceanDataType | undefined): number {
    const dimensions = this.matrixDimensions(type);
    return dimensions ? dimensions.columns * dimensions.rows : 0;
  }

  /**
   * Returns the dimensions of a matrix type.
   * @param type - Type to inspect.
   * @returns Column and row counts, or `undefined` for non-matrix types.
   */
  static matrixDimensions(type: GalaceanDataType | undefined): { columns: number; rows: number } | undefined {
    switch (type) {
      case Keyword.MAT2:
        return { columns: 2, rows: 2 };
      case Keyword.MAT3:
        return { columns: 3, rows: 3 };
      case Keyword.MAT4:
        return { columns: 4, rows: 4 };
      case Keyword.MAT2X3:
        return { columns: 2, rows: 3 };
      case Keyword.MAT3X2:
        return { columns: 3, rows: 2 };
      case Keyword.MAT2X4:
        return { columns: 2, rows: 4 };
      case Keyword.MAT4X2:
        return { columns: 4, rows: 2 };
      case Keyword.MAT3X4:
        return { columns: 3, rows: 4 };
      case Keyword.MAT4X3:
        return { columns: 4, rows: 3 };
      default:
        return undefined;
    }
  }
}
