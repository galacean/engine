import { ValueString } from "./Value";
import { TokenUtils } from "./TokenUtils";

export const Shader = TokenUtils.createKeywordToken("Shader", { longer_alt: ValueString });
export const SubShader = TokenUtils.createKeywordToken("SubShader");
export const Pass = TokenUtils.createKeywordToken("Pass");
export const Tags = TokenUtils.createKeywordToken("Tags");

// tags
export const ReplacementTag = TokenUtils.createKeywordToken("ReplacementTag");
export const PipelineStage = TokenUtils.createKeywordToken("PipelineStage");

export const VertexShader = TokenUtils.createKeywordToken("VertexShader");
export const FragmentShader = TokenUtils.createKeywordToken("FragmentShader");

export const UsePass = TokenUtils.createKeywordToken("UsePass");

export const ArgDecoIn = TokenUtils.createKeywordToken("in ");
export const ArgDecoOut = TokenUtils.createKeywordToken("out ");
export const ArgDecoInOut = TokenUtils.createKeywordToken("inout ");

export const ConstQualifier = TokenUtils.createKeywordToken("const ");

export const tokenList = [
  Shader,
  SubShader,
  Pass,
  Tags,
  VertexShader,
  FragmentShader,
  UsePass,
  ArgDecoIn,
  ArgDecoOut,
  ArgDecoInOut,
  ConstQualifier
];
