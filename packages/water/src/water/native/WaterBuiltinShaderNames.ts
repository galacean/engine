/** Version the authoring contract independently of backend render variants. */
export const WATER_BUILTIN_SHADER_NAMES = Object.freeze({
  lake: "Water/Lake.v1",
  river: "Water/River.v1",
  ocean: "Water/Ocean.v1"
});

/** Keep rendering declarations; only author texture properties are hidden. */
export function waterBuiltinShaderSource(source: string, profile: keyof typeof WATER_BUILTIN_SHADER_NAMES): string {
  return source
    .replace(/\bShader\s+"[^"\n]+"/, `Shader "${WATER_BUILTIN_SHADER_NAMES[profile]}"`)
    .replace(/^\s*\w+\("[^"\n]*",\s*Texture2D\)\s*(?:=[^;]*)?;[^\S\n]*$/gm, "");
}
