import { EKeyword, GalaceanDataType } from "../../common";
import { EShaderStage } from "../../common/Enums";

export const BuiltinVariableTable: Map<string, BuiltinVariable> = new Map();

export class BuiltinVariable {
  type: GalaceanDataType;
  lexeme: string;
  scope: EShaderStage;

  private constructor(type: GalaceanDataType, lexeme: string, scope: EShaderStage) {
    this.type = type;
    this.lexeme = lexeme;
    this.scope = scope;
  }

  static createVariable(lexeme: string, type: GalaceanDataType, scope = EShaderStage.ALL) {
    const item = new BuiltinVariable(type, lexeme, scope);
    BuiltinVariableTable.set(lexeme, item);
  }

  static getVar(ident: string) {
    return BuiltinVariableTable.get(ident);
  }
}

BuiltinVariable.createVariable("gl_VertexID", EKeyword.INT, EShaderStage.VERTEX);
BuiltinVariable.createVariable("gl_InstanceID", EKeyword.INT, EShaderStage.VERTEX);
BuiltinVariable.createVariable("gl_Position", EKeyword.VEC4, EShaderStage.VERTEX);
BuiltinVariable.createVariable("gl_PointSize", EKeyword.FLOAT, EShaderStage.VERTEX);

BuiltinVariable.createVariable("gl_FragCoord", EKeyword.VEC4, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_FrontFacing", EKeyword.BOOL, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_FragDepth", EKeyword.FLOAT, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_PointCoord", EKeyword.VEC2, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_FragColor", EKeyword.VEC4, EShaderStage.FRAGMENT);

BuiltinVariable.createVariable("gl_MaxVertexAttribs", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxVertexUniformVectors", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxVertexOutputVectors", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxFragmentInputVectors", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxVertexTextureImageUnits", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxCombinedTextureImageUnits", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxTextureImageUnits", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxFragmentUniformVectors", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxDrawBuffers", EKeyword.INT);
BuiltinVariable.createVariable("gl_MinProgramTexelOffset", EKeyword.INT);
BuiltinVariable.createVariable("gl_MaxProgramTexelOffset", EKeyword.INT);
