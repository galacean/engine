/**
 * Opcode constants for preprocessor instructions.
 */
export enum PreprocessorOpcode {
  Text,
  IfDef,
  IfNdef,
  IfCmp,
  IfExpr,
  Else,
  Endif,
  Define,
  DefineVal,
  DefineFunc,
  Undef
}
