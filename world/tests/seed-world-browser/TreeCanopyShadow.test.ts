import { expect, it } from "vitest";
import { ShaderMacroProcessor } from "../../../packages/core/src/shader/ShaderMacroProcessor";
import vegetation from "../../../packages/terrain/src/data/seed-world/public/Shader/Vegetation.shaderc?raw";

const forward = JSON.parse(vegetation).subShaders[0].passes.find((pass: { name: string }) => pass.name === "Forward");

it.each([0, 1, 2, 4])("lights the canopy through the %i-cascade handoff", (cascades) => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const gl = canvas.getContext("webgl2")!;
  const macros = new Map([
    ["GRAPHICS_API_WEBGL2", ""],
    ["SCENE_DIRECT_LIGHT_COUNT", "1"],
    ["RENDERER_PROCEDURAL_PLANT_CANOPY_OCCLUSION", ""],
    ["MATERIAL_PROCEDURAL_TREE_CANOPY_OCCLUSION", ""],
    ["MATERIAL_VEGETATION_CLIMATE_LEAF", ""]
  ]);
  if (cascades) {
    macros.set("RENDERER_IS_RECEIVE_SHADOWS", "");
    macros.set("SCENE_SHADOW_TYPE", "3");
    macros.set("SCENE_SHADOW_CASCADED_COUNT", String(cascades));
  }
  const program = gl.createProgram()!;
  function attach(type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, "#version 300 es\nprecision highp float;\nprecision highp int;\n" + source);
    gl.compileShader(shader);
    expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) ?? "").toBe(true);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  try {
    const vertex = ShaderMacroProcessor.evaluate(forward.vertexShaderInstructions, new Map(macros));
    attach(
      gl.VERTEX_SHADER,
      vertex.replace(/void\s+main\s*\(/, "void vegetationVertex(") +
        "void main(){vegetationVertex();gl_Position=vec4(0,0,0,1);gl_PointSize=1.0;}"
    );
    // A white Lambertian leaf facing a white sun exposes the effective direct-light visibility.
    const source = ShaderMacroProcessor.evaluate(forward.fragmentShaderInstructions, macros);
    attach(
      gl.FRAGMENT_SHADER,
      source.replace(/void\s+main\s*\(/, "void vegetationMain(") +
        `
      uniform vec2 probe;
      void main() {
        Varyings receiver;
        receiver.positionWS = vec3(10.0 + probe.x, 0.0, 0.0);
        SurfaceData leaf;
        leaf.albedoColor = vec3(1.0);
        leaf.normal = vec3(0.0, 1.0, 0.0);
        leaf.viewDir = leaf.normal;
        leaf.dotNV = 1.0;
        leaf.IOR = 1.0;
        leaf.roughness = 1.0;
        leaf.metallic = 0.0;
        leaf.specularColor = vec3(0.0);
        leaf.specularIntensity = 0.0;
        leaf.ambientOcclusion = 0.5;
        TerrainProjectLightingResult light = evaluateTerrainProjectLightingWithShadow(receiver, leaf, probe.y);
        output_color = vec4(light.directDiffuse, 1.0);
      }`
    );
    gl.linkProgram(program);
    expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
    gl.useProgram(program);
    const location = (name: string) => gl.getUniformLocation(program, name);
    gl.uniform4i(location("renderer_Layer"), 1, 0, 0, 0);
    gl.uniform2i(location("scene_DirectLightCullingMask[0]"), 1, 0);
    gl.uniform3f(location("scene_DirectLightColor[0]"), 1, 1, 1);
    gl.uniform3f(location("scene_DirectLightDirection[0]"), 0, -1, 0);
    gl.uniform4f(location("scene_ShadowSplitSpheres[0]"), 10, 0, 0, 100 * 100);
    const fade = location("scene_ShadowInfo");
    gl.uniform4f(fade, 1, 0, 0, 0);
    function sample(radius: number, mapVisibility = 1) {
      gl.uniform2f(location("probe"), radius, mapVisibility);
      gl.drawArrays(gl.POINTS, 0, 1);
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return pixel[0] / 255;
    }
    if (cascades > 1) {
      expect(sample(85)).toBeCloseTo(1, 2);
      expect(sample(93)).toBeGreaterThan(0.6);
      expect(sample(93)).toBeLessThan(0.9);
      expect(sample(100)).toBeCloseTo(0.5, 2);
      expect(sample(180)).toBeCloseTo(0.5, 2);
      expect(sample(180, 0.2)).toBeCloseTo(0.2, 2);
    } else if (cascades === 1) {
      expect(sample(180, 0.8)).toBeCloseTo(0.8, 2);
      gl.uniform4f(fade, 1, 0, 0, 1);
      expect(sample(180, 0.8)).toBeCloseTo(0.4, 2);
    } else {
      expect(sample(10)).toBeCloseTo(0.5, 2);
      expect(sample(180)).toBeCloseTo(0.5, 2);
    }
  } finally {
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
});
