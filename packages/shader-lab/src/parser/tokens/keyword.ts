import { ValueString } from "./value";
import { createKeywordToken } from "./utils";

export const Shader = createKeywordToken("Shader", { longer_alt: ValueString });
export const EditorProperties = createKeywordToken("EditorProperties");
export const SubShader = createKeywordToken("SubShader");
export const Pass = createKeywordToken("Pass");
export const Tags = createKeywordToken("Tags");

export const BlendState = createKeywordToken("BlendState");
export const DepthState = createKeywordToken("DepthState");
export const StencilState = createKeywordToken("StencilState");
export const RasterState = createKeywordToken("RasterState");

export const Enabled = createKeywordToken("Enabled");
export const SrcColorBlendFactor = createKeywordToken("SrcColorBlendFactor");
export const DestColorBlendFactor = createKeywordToken("DestColorBlendFactor");

// tags
export const ReplacementTag = createKeywordToken("ReplacementTag");
export const PipelineStage = createKeywordToken("PipelineStage");

export const VertexShader = createKeywordToken("VertexShader");
export const FragmentShader = createKeywordToken("FragmentShader");

export const tagTokenList = [ReplacementTag, PipelineStage];

export const tokenList = [
  Shader,
  EditorProperties,
  SubShader,
  Pass,
  Tags,
  BlendState,
  DepthState,
  StencilState,
  RasterState,
  Enabled,
  DestColorBlendFactor,
  SrcColorBlendFactor,
  VertexShader,
  FragmentShader
];
