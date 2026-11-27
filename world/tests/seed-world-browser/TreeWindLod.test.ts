import { expect, it } from "vitest";
import type { ShaderInstruction } from "@galacean/engine-design";
import { ShaderMacroProcessor } from "../../../packages/core/src/shader/ShaderMacroProcessor";
import vegetation from "../../../packages/terrain/src/data/seed-world/public/Shader/Vegetation.shaderc?raw";

const passes: { name: string; vertexShaderInstructions: ShaderInstruction[] }[] =
  JSON.parse(vegetation).subShaders[0].passes;
const degrees = Math.PI / 180;
const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// Capture the shipped pass's vertex position with an identity projection. A half-metre leaf
// points up from its hinge and rotates about X, so its tip gives the actual flutter angle.
it.each(passes)("fades leaf flutter independently of whole-tree sway in $name", (pass) => {
  const gl = document.createElement("canvas").getContext("webgl2")!;
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, "#version 300 es\n" + source);
    gl.compileShader(shader);
    expect(gl.getShaderParameter(shader, gl.COMPILE_STATUS), gl.getShaderInfoLog(shader) ?? "").toBe(true);
    return shader;
  };
  const treeX = 120;
  try {
    for (const mode of ["ordinary leaf", "instanced leaf", "instanced bough"]) {
      const instanced = mode !== "ordinary leaf";
      const groupSway = mode === "instanced bough";
      const macros = new Map(
        [
          "MATERIAL_ENABLE_WIND",
          "MATERIAL_WIND_PROCEDURAL_TREE",
          "MATERIAL_WIND_PROCEDURAL_PLANT",
          "MATERIAL_VEGETATION_CLIMATE_LEAF",
          "RENDERER_HAS_NORMAL",
          "SCENE_SURFACE_CLIMATE_DRY",
          "GRAPHICS_API_WEBGL2"
        ].map((name) => [name, ""])
      );
      if (instanced) macros.set("RENDERER_ASSET_ASSEMBLY_INSTANCE", "");
      if (groupSway) macros.set("MATERIAL_WIND_GROUP_SWAY", "");
      const program = gl.createProgram()!;
      gl.attachShader(
        program,
        compile(gl.VERTEX_SHADER, ShaderMacroProcessor.evaluate(pass.vertexShaderInstructions, macros))
      );
      gl.attachShader(
        program,
        compile(gl.FRAGMENT_SHADER, "precision highp float; out vec4 color; void main(){color=vec4(0.0);}")
      );
      gl.transformFeedbackVaryings(program, ["gl_Position"], gl.INTERLEAVED_ATTRIBS);
      gl.linkProgram(program);
      expect(gl.getProgramParameter(program, gl.LINK_STATUS), gl.getProgramInfoLog(program) ?? "").toBe(true);
      gl.useProgram(program);
      const uniform = (name: string) => gl.getUniformLocation(program, name);
      const attribute = (name: string, x: number, y: number, z: number, w = 1) => {
        const index = gl.getAttribLocation(program, name);
        if (index >= 0) gl.vertexAttrib4f(index, x, y, z, w);
      };
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const vertices = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1, 0]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "POSITION");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
      attribute("NORMAL", 0, 0, 1);
      attribute("LEAF_PIVOT", 0, 0.5, 0);
      attribute("PLANT_WIND", 1, 0, 0, 1);
      attribute("ASSEMBLY_SCALE", 1, 1, 1);
      attribute("ASSEMBLY_ROTATION", 0, 0, 0, 1);
      attribute("ASSEMBLY_POSITION", treeX, 0, 0);
      const model = identity.slice();
      model[12] = instanced ? 0 : treeX;
      gl.uniformMatrix4fv(uniform("renderer_ModelMat"), false, model);
      gl.uniformMatrix4fv(uniform("renderer_NormalMat"), false, identity);
      gl.uniformMatrix4fv(uniform("camera_VPMat"), false, identity);
      gl.uniform3f(uniform("scene_WindVelocity"), 0, 0, 6);
      gl.uniform1f(uniform("scene_WindAnimationEnabled"), 1);
      const result = gl.createBuffer();
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, result);
      gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, 16, gl.STREAM_READ);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, result);
      gl.enable(gl.RASTERIZER_DISCARD);
      const sample = (distance: number, seconds: number) => {
        gl.uniform3f(uniform("camera_Position"), treeX, 0, distance);
        gl.uniform4f(uniform("scene_WindFieldParams"), 0, 0, 0, seconds);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, 1);
        gl.endTransformFeedback();
        const tip = new Float32Array(4);
        gl.getBufferSubData(gl.TRANSFORM_FEEDBACK_BUFFER, 0, tip);
        return tip;
      };
      gl.uniform4f(uniform("material_ProceduralTreeWindParams"), 0, 0.18, 6 * degrees, 0.9);
      for (const [distance, expectedDegrees] of [
        [2, 2],
        [18, 2],
        [35, 1],
        [52, 0],
        [100, 0]
      ]) {
        const angles = Array.from({ length: 32 }, (_, i) => {
          const tip = sample(distance, i / (32 * 0.9));
          expect(tip[0]).toBeCloseTo(treeX);
          return Math.abs(Math.atan2(tip[2], tip[1] - 0.5)) / degrees;
        });
        expect(Math.max(...angles)).toBeCloseTo(groupSway ? 6 : expectedDegrees, 1);
      }
      gl.uniform4f(uniform("material_ProceduralTreeWindParams"), 3 * degrees, 0.18, 0, 0.9);
      const nearSway = sample(2, 0);
      expect(sample(100, 0)).toEqual(nearSway);
      expect(Math.abs(sample(100, 1)[2] - nearSway[2])).toBeGreaterThan(0.0001);
      expect(gl.getError()).toBe(gl.NO_ERROR);
    }
  } finally {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
});
