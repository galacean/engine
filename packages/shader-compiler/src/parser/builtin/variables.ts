import { GalaceanDataType } from "../../common";
import { Keyword } from "../../common/enums/Keyword";
import { EShaderStage } from "../../common/enums/ShaderStage";

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

  static getVar(ident: string): BuiltinVariable {
    return BuiltinVariableTable.get(ident);
  }
}

BuiltinVariable.createVariable("gl_VertexID", Keyword.INT, EShaderStage.VERTEX);
BuiltinVariable.createVariable("gl_InstanceID", Keyword.INT, EShaderStage.VERTEX);
BuiltinVariable.createVariable("gl_Position", Keyword.VEC4, EShaderStage.VERTEX);
BuiltinVariable.createVariable("gl_PointSize", Keyword.FLOAT, EShaderStage.VERTEX);

BuiltinVariable.createVariable("gl_FragCoord", Keyword.VEC4, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_FrontFacing", Keyword.BOOL, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_FragDepth", Keyword.FLOAT, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_PointCoord", Keyword.VEC2, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_FragColor", Keyword.VEC4, EShaderStage.FRAGMENT);
BuiltinVariable.createVariable("gl_FragData", Keyword.VEC4_ARRAY, EShaderStage.FRAGMENT);

BuiltinVariable.createVariable("gl_MaxVertexAttribs", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxVertexUniformVectors", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxVertexOutputVectors", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxFragmentInputVectors", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxVertexTextureImageUnits", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxCombinedTextureImageUnits", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxTextureImageUnits", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxFragmentUniformVectors", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxDrawBuffers", Keyword.INT);
BuiltinVariable.createVariable("gl_MinProgramTexelOffset", Keyword.INT);
BuiltinVariable.createVariable("gl_MaxProgramTexelOffset", Keyword.INT);
