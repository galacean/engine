import { type Engine, ShaderFactory, ShaderLanguage, ShaderPass } from "@galacean/engine";
import sceneLighting from "./ConstructionSceneLighting.glsl?raw";
import { RAW_GLSL_MACROS, rawGlslInstructions } from "./RawGlslInstructions";
import { buildingGLSLToShaderLab } from "./BuildingShaderLab";

type Instructions = ConstructorParameters<typeof ShaderPass>[2];
type UniformBlocks = ConstructorParameters<typeof ShaderPass>[6];
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
  // An explicit UBO bridge can put the main wrapper's opening and call in
  // consecutive instructions. Keep both positions for absolute macro jumps.
  const splitMain = instructions.findIndex((instruction, index) => {
    const next = instructions[index + 1];
    return (
      instruction[0] === 0 &&
      String(instruction[1]).trim() === "void main() {" &&
      next?.[0] === 0 &&
      String(next[1]).trim() === "BridgeFragment(); }"
    );
  });
  const result = instructions.map((instruction, index) => {
    if (splitMain >= 0 && (index === splitMain || index === splitMain + 1)) {
      if (index === splitMain) entries++;
      return [0, ""] as Instructions[number];
    }
    if (instruction[0] !== 0) return instruction;
    const source = (instruction[1] as string)
      .replace(/uniform (?:vec3|float) masonryBridge\w+;\s*/g, "")
      .replace(/(?:layout\s*\([^)]*\)\s*)?\bout\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+\w+\s*;\s*/g, "")
      // The native compiler now preserves the fragment entry as a helper.
      // Remove both entry functions, retaining only the reusable lighting code.
      .replace(/void\s+BridgeFragment\s*\(\s*\)\s*\{[^{}]*\}/g, "")
      .replace(/void main\(\)\s*\{[^{}]*\}/g, () => {
        entries++;
        return "";
      });
    return [0, source] as Instructions[number];
  });
  if (entries !== 1) throw Error("Unexpected scene lighting compiler entry ABI");
  return result;
}
type LightingCompiler = NonNullable<Engine["_shaderCompiler"]>;
interface LightingBridge {
  helpers: Instructions;
  uniformBlocks: UniformBlocks;
  helpersDeclareProjectionParams: boolean;
}
const lightingByCompiler = new WeakMap<LightingCompiler, LightingBridge>();
const CAMERA_PROJECTION_PARAMS_DECL_PATTERN =
  /(?:^|\n)[ \t]*uniform\s+(?:(?:lowp|mediump|highp)\s+)?vec4\s+camera_ProjectionParams\s*;\s*/g;
const HAS_CAMERA_PROJECTION_PARAMS_DECL_PATTERN = /\buniform\b[^;\n]*\bcamera_ProjectionParams\b\s*;/;

export function createConstructionForwardPass(
  compiler: Engine["_shaderCompiler"],
  vertex: string,
  fragment: string
): ShaderPass {
  if (!compiler) throw new Error("Construction lighting requires the engine's shader compiler");
  let bridge = lightingByCompiler.get(compiler);
  if (!bridge) {
    registerConstructionSceneLighting();
    const pass = compiler._parseShaderSource(constructionLightingBridgeSource).subShaders[0].passes[0];
    const compiled = compiler._parseShaderPass(
      pass.contents,
      pass.vertexEntry,
      pass.fragmentEntry,
      ShaderLanguage.GLSLES300,
      undefined,
      pass.contentScopeStarts
    );
    if (!compiled?.fragmentShaderInstructions) throw new Error("Construction lighting bridge failed to compile");
    const helpers = constructionLightingHelpers(compiled.fragmentShaderInstructions);
    bridge = {
      helpers,
      uniformBlocks: compiled.uniformBlocks,
      helpersDeclareProjectionParams: helpers.some(
        (instruction) =>
          instruction[0] === 0 && HAS_CAMERA_PROJECTION_PARAMS_DECL_PATTERN.test(instruction[1] as string)
      )
    };
    lightingByCompiler.set(compiler, bridge);
  }
  const { helpers, uniformBlocks, helpersDeclareProjectionParams } = bridge;
  const normalizedFragment = helpersDeclareProjectionParams
    ? fragment.replace(CAMERA_PROJECTION_PARAMS_DECL_PATTERN, "\n")
    : fragment;
  // When a WebGPU compiler is attached, also compile the converted ShaderLab source directly
  // through the single AST (`WGSLVisitor`) so WebGPU specializes macros without any GLSL parser.
  let wgsl: ConstructorParameters<typeof ShaderPass>[8];
  let wgslVertexInstructions: ConstructorParameters<typeof ShaderPass>[10];
  let wgslFragmentInstructions: ConstructorParameters<typeof ShaderPass>[11];
  let finalUniformBlocks = uniformBlocks;
  const hasWebGPU = Boolean((compiler as unknown as { webgpu?: unknown }).webgpu);
  if (hasWebGPU) {
    registerConstructionSceneLighting();
    const shaderLab = buildingGLSLToShaderLab("Masonry/Resident", vertex, normalizedFragment, {
      includeSceneLighting: true
    });
    const parsedPass = compiler._parseShaderSource(shaderLab).subShaders[0].passes[0];
    const wgslProgram = compiler._parseShaderPass(
      parsedPass.contents,
      parsedPass.vertexEntry,
      parsedPass.fragmentEntry,
      ShaderLanguage.WGSL,
      undefined,
      parsedPass.contentScopeStarts
    );
    if (!wgslProgram?.wgslVertexInstructions || !wgslProgram?.wgslFragmentInstructions) {
      throw new Error("Construction resident shader failed to compile to WGSL via ShaderLab.");
    }
    wgsl = wgslProgram.wgsl;
    wgslVertexInstructions = wgslProgram.wgslVertexInstructions;
    wgslFragmentInstructions = wgslProgram.wgslFragmentInstructions;
    finalUniformBlocks = wgslProgram.uniformBlocks ?? uniformBlocks;
  }

  // Append gates AFTER the helper instructions so their absolute jumps stay valid.
  // The explicit Scene and Camera blocks retain their compiled byte layout.
  return new ShaderPass(
    "Forward",
    rawGlslInstructions(["RENDERER_MASONRY_ENTRANCE"], vertex),
    [...helpers, ...rawGlslInstructions(RAW_GLSL_MACROS, normalizedFragment, helpers.length)],
    hasWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSLES300,
    undefined,
    undefined,
    finalUniformBlocks,
    undefined,
    wgsl,
    undefined,
    wgslVertexInstructions,
    wgslFragmentInstructions
  );
}
