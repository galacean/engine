const legacyTextures: Readonly<Record<string, string>> = {
  texture2D: "texture",
  textureCube: "texture",
  texture2DProj: "textureProj",
  texture2DLodEXT: "textureLod",
  textureCubeLodEXT: "textureLod",
  texture2DGradEXT: "textureGrad",
  textureCubeGradEXT: "textureGrad",
  texture2DProjLodEXT: "textureProjLod",
  texture2DProjGradEXT: "textureProjGrad"
};

// Historical assets may store raw GLSL ES 1.00 in Text instructions, even with platformTarget = 0.
// The instruction stream is already evaluated. Normalize its stage interface before either backend consumes it.
export function upgradeLegacyShaderStage(source: string, fragment: boolean): string {
  if (!/\b(?:attribute|varying|gl_Frag(?:Color|Data|DepthEXT)|texture(?:2D|Cube)\w*)\b/.test(source)) return source;
  let outputName = "legacyFragmentOutput";
  while (source.includes(outputName)) outputName += "_";
  let color = false;
  let multiple = false;
  const text = source.replace(
    /\/\/[^\n]*|\/\*[\s\S]*?\*\/|\b(?:attribute|varying|gl_Frag(?:Color|Data|DepthEXT)|texture(?:2D|Cube)\w*)\b/g,
    (token) => {
      if (token.startsWith("/")) return token;
      switch (token) {
        case "attribute":
          return fragment ? token : "in";
        case "varying":
          return fragment ? "in" : "out";
        case "gl_FragDepthEXT":
          return "gl_FragDepth";
        case "gl_FragColor":
          color = true;
          return outputName;
        case "gl_FragData":
          multiple = true;
          return outputName;
        default:
          return legacyTextures[token] ?? token;
      }
    }
  );
  // The legacy spec forbids static writes to both gl_FragData and gl_FragColor in a single variant.
  if (multiple) return `layout(location = 0) out highp vec4 ${outputName}[gl_MaxDrawBuffers];\n${text}`;
  if (color) return `layout(location = 0) out highp vec4 ${outputName};\n${text}`;
  return text;
}
