import { Shader, ShaderFactory, ShaderLanguage, type ShaderPass } from "@galacean/engine";
import sceneLighting from "./ConstructionSceneLighting.glsl?raw";
import { RAW_GLSL_MACROS, rawGlslInstructions } from "./RawGlslInstructions";

type Instructions = ConstructorParameters<typeof ShaderPass>[2];
export function registerConstructionSceneLighting() {
  if (!ShaderFactory.includeMap["Masonry/SceneLighting.glsl"])
    ShaderFactory.registerInclude("Masonry/SceneLighting.glsl", sceneLighting);
}

// Compile the engine libraries normally, preserving their runtime macro
// instructions (SH/IBL, cascade count, cloud shadow, fog). Recovered ES shaders
// cannot go through ShaderLab's attribute parser, so link only this helper code
// into their raw fragment pass. Scene BSDF/sun/spot/IBL remain engine-owned;
// building point lights share distance evaluation with their existing local lobe.
export const constructionLightingBridgeSource = `Shader "Masonry/SceneLightingBridge" {
 SubShader "Default" { Pass "Forward" {
  #include "Masonry/SceneLighting.glsl"
  vec3 masonryBridgeAlbedo;
  vec3 masonryBridgeNormal;
  vec3 masonryBridgePosition;
  float masonryBridgeRoughness;
  VertexShader = BridgeVertex;
  FragmentShader = BridgeFragment;
  struct BridgeAttributes { vec4 POSITION; };
  void BridgeVertex(BridgeAttributes a) { gl_Position=a.POSITION; }
  void BridgeFragment() { gl_FragColor=vec4(masonrySceneFog(masonryResidentSceneLight(masonryBridgeAlbedo,masonryBridgeNormal,masonryBridgePosition,masonryBridgeRoughness),masonryBridgePosition),1.0); }
 } }
}`;

/** Text-only transformation preserves every instruction index/jump target. */
export function constructionLightingHelpers(instructions: Instructions): Instructions {
  let entries = 0;
  const result = instructions.map((instruction) => {
    if (instruction[0] !== 0) return instruction;
    const source = (instruction[1] as string)
      .replace(/uniform (?:vec3|float) masonryBridge\w+;\s*/g, "")
      .replace(/out vec4 GS_glFragColor;\s*/g, "")
      .replace(/void main\(\)\s*\{[^{}]*\}/g, () => {
        entries++;
        return "";
      });
    return [0, source] as Instructions[number];
  });
  if (entries !== 1) throw Error("Unexpected scene lighting compiler entry ABI");
  return result;
}
let helpers: Instructions | undefined;
export function constructionLightingInstructions(fragment: string): Instructions {
  if (!helpers) {
    registerConstructionSceneLighting();
    const shader =
      Shader.find("Masonry/SceneLightingBridge") ??
      Shader.create(constructionLightingBridgeSource, ShaderLanguage.GLSLES300);
    helpers = constructionLightingHelpers(
      (shader.subShaders[0].passes[0] as unknown as { _fragmentShaderInstructions: Instructions })
        ._fragmentShaderInstructions
    );
  }
  // Append gates AFTER the helper instructions so their absolute jumps stay valid.
  return [...helpers, ...rawGlslInstructions(RAW_GLSL_MACROS, fragment, helpers.length)];
}
