/**
 * Directive types for shader preprocessor instructions.
 */
export enum ShaderPreprocessorDirective {
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
