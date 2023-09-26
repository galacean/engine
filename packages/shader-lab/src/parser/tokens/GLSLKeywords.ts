import { TokenUtils } from "./TokenUtils";

// built-in variable
// export const GLPosition = TokenUtils.createKeywordToken("gl_Position");
// export const GLFragColor = TokenUtils.createKeywordToken("gl_FragColor");

// function
export const Texture2D = TokenUtils.createKeywordToken("texture2D");

// macro
export const M_DEFINE = TokenUtils.createKeywordToken("#define", { name: "m_define" });
export const M_IF = TokenUtils.createKeywordToken("#if", { name: "m_if" });
export const M_IFDEF = TokenUtils.createKeywordToken("#ifdef", { name: "m_ifdef" });
export const M_IFNDEF = TokenUtils.createKeywordToken("#ifndef", { name: "m_ifndef" });
export const M_ELSE = TokenUtils.createKeywordToken("#else", { name: "m_else" });
export const M_ELIF = TokenUtils.createKeywordToken("#elif", { name: "m_elif" });
export const M_ENDIF = TokenUtils.createKeywordToken("#endif", { name: "m_endif" });
export const M_UNDEFINE = TokenUtils.createKeywordToken("#undef", { name: "m_undefine" });
export const M_INCLUDE = TokenUtils.createKeywordToken("#include", { name: "m_include" });

// other
export const Struct = TokenUtils.createKeywordToken("struct");
export const If = TokenUtils.createKeywordToken("if");
export const Else = TokenUtils.createKeywordToken("else");
export const Discard = TokenUtils.createKeywordToken("discard");
export const Break = TokenUtils.createKeywordToken("break");
export const Continue = TokenUtils.createKeywordToken("continue");
export const Void = TokenUtils.createKeywordToken("void");
export const Return = TokenUtils.createKeywordToken("return");
export const For = TokenUtils.createKeywordToken("for");

// export const variableTokenList = [GLPosition, GLFragColor];
export const funcTokenList = [Texture2D];
export const macroTokenList = [M_DEFINE, M_IFDEF, M_IFNDEF, M_IF, M_ELSE, M_ELIF, M_ENDIF, M_UNDEFINE, M_INCLUDE];
export const otherTokenList = [Struct, If, Else, Discard, Void, Return, For, Break, Continue];
