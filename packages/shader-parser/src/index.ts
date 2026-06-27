// shader-parser: lexing, preprocessing, parsing, AST — the single source of truth shared by
// shader-compiler (code generation) and shader-analyzer (diagnostics).

export * from "./common";
export * from "./common/BaseToken";
export * from "./common/BaseLexer";
export * from "./common/SymbolTable";
export * from "./common/SymbolTableStack";
export * from "./common/IBaseSymbol";
export * from "./common/enums/ShaderStage";

export * from "./lexer";
export * from "./lalr";

export * from "./parser";
export * from "./parser/AST";
export * from "./parser/types";
export * from "./parser/GrammarSymbol";
export * from "./parser/ShaderInfo";
export * from "./parser/ShaderIOAnalyzer";
export * from "./parser/PassParser";
export * from "./parser/ICodeGenVisitor";
export * from "./parser/symbolTable";
export * from "./parser/builtin";
export * from "./parser/TypeSystem";

export * from "./sourceParser";
export * from "./sourceParser/ShaderSourceFactory";

export * from "./Preprocessor";
export * from "./ParserUtils";
export * from "./GSError";
export * from "./formatDiagnostic";
export * from "./DiagnosticType";
export * from "./ShaderCompilerUtils";
