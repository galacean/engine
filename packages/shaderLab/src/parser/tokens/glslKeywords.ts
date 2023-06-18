import { createKeywordToken } from "./utils";

// built-in variable
export const GLPosition = createKeywordToken("gl_Position");
export const GLFragColor = createKeywordToken("gl_FragColor");

// function
export const Pow = createKeywordToken("pow");
export const Texture2D = createKeywordToken("texture2D");

// macro
export const M_DEFINE = createKeywordToken("#define", { name: "m_define" });
export const M_IFDEF = createKeywordToken("#ifdef", { name: "m_ifdef" });
export const M_IFNDEF = createKeywordToken("#ifndef", { name: "m_ifndef" });
export const M_ELSE = createKeywordToken("#else", { name: "m_else" });
export const M_ELIF = createKeywordToken("#elif", { name: "m_elif" });
export const M_ENDIF = createKeywordToken("#endif", { name: "m_endif" });
export const M_INCLUDE = createKeywordToken("#include", { name: "m_include" });

// other
export const Struct = createKeywordToken("struct");
export const If = createKeywordToken("if");
export const Else = createKeywordToken("else");
export const Discard = createKeywordToken("discard");
export const Void = createKeywordToken("void");
export const Return = createKeywordToken("return");

export const variableTokenList = [GLPosition, GLFragColor];
export const funcTokenList = [Texture2D, Pow];
export const macroTokenList = [M_DEFINE, M_IFDEF, M_IFNDEF, M_ELSE, M_ELIF, M_ENDIF, M_INCLUDE];
export const otherTokenList = [Struct, If, Else, Discard, Void, Return];
