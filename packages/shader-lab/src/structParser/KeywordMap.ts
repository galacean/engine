import { EKeyword } from "../common";

export const KeywordMap = new Map([
  ["RenderQueueType", EKeyword.GS_RenderQueueType],
  ["BlendState", EKeyword.GS_BlendState],
  ["DepthState", EKeyword.GS_DepthState],
  ["StencilState", EKeyword.GS_StencilState],
  ["RasterState", EKeyword.GS_RasterState],
  ["EditorProperties", EKeyword.GS_EditorProperties],
  ["EditorMacros", EKeyword.GS_EditorMacros],
  ["Tags", EKeyword.GS_Tags],
  ["VertexShader", EKeyword.GS_VertexShader],
  ["FragmentShader", EKeyword.GS_FragmentShader],
  ["SubShader", EKeyword.GS_SubShader],
  ["Pass", EKeyword.GS_Pass],
  ["BlendFactor", EKeyword.GS_BlendState],
  ["BlendOperation", EKeyword.GS_BlendOperation],
  ["Bool", EKeyword.GS_Bool],
  ["Number", EKeyword.GS_Number],
  ["CompareFunction", EKeyword.GS_CompareFunction],
  ["StencilOperation", EKeyword.GS_StencilOperation],
  ["CullMode", EKeyword.GS_CullMode],
  ["true", EKeyword.TRUE],
  ["false", EKeyword.FALSE],
  ["UsePass", EKeyword.GS_UsePass],
  ["Color", EKeyword.GS_Color]
]);
