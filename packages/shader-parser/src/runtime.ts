export * from "./common";
export { BaseToken, EMPTY_BRANCH, EOF, sameBranch } from "./common/BaseToken";
export type { BranchCondition, BranchConstraint, BranchSignature } from "./common/BaseToken";
export * from "./common/BaseLexer";
export * from "./common/PreprocessorCondition";
export * from "./common/SymbolTable";
export * from "./common/SymbolTableStack";
export * from "./common/IBaseSymbol";
export * from "./common/enums/ShaderStage";

export * from "./lexer";
export * from "./lalr";

export { ShaderTargetParser } from "./parser/ShaderTargetParser";
export { Grammar } from "./parser/Grammar";
export { getParsedShaderPassPayload, type ParsedShaderPassPayload } from "./parser/ParsedShaderPassHandle";
export { normalizeShaderIncludeMap } from "./parser/ShaderIncludePath";
export type { ParsedShaderPassData } from "./parser/ParsedShaderPass";
export * from "./parser/RuntimePassParser";
export * from "./parser/AST";
export * from "./parser/types";
export * from "./parser/GrammarSymbol";
export * from "./parser/ShaderInfo";
export * from "./parser/ICodeGenVisitor";
export * from "./parser/symbolTable";

export * from "./ir";

export * from "./sourceParser";
export * from "./sourceParser/ShaderSourceFactory";

export * from "./Preprocessor";
export * from "./PreprocessorExpression";
export * from "./ParserObjectPool";
export * from "./ParserUtils";
export * from "./GSError";
export * from "./ShaderCompilerUtils";
