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
  Undef,
  /** Activates a declaration: [ownerId, groupId, sourceScope]. */
  Declaration,
  /** Text retained when any listed declaration is selected and reachable: [text, ...ownerIds]. */
  OwnedText,
  /** Declaration dependency: [fromOwnerId, toOwnerId]; owner zero denotes a stage root. */
  Reference
}
