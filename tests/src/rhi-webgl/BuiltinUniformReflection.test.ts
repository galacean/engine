import { Shader, ShaderMacro, ShaderMacroCollection, WebGLEngine } from "@galacean/engine";
import type { IPrecompiledShader } from "@galacean/engine-design";
import * as library from "@galacean/engine-shader";
import { afterAll, beforeAll, expect, it } from "vitest";

const assets = Object.entries(library).filter(
  (entry): entry is [string, IPrecompiledShader] => "subShaders" in entry[1]
);
let engine: WebGLEngine;
beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});
afterAll(() => engine.destroy());

it.each(assets)("matches driver uniform layouts for every pass of %s", (_name, asset) => {
  const shader = Shader._createFromPrecompiled(asset);
  const gl = engine._hardwareRenderer.gl;
  try {
    const macros = new ShaderMacroCollection();
    // Exercise macro-sized light arrays and the cascade matrix array in the same linked program.
    for (const [name, value] of [
      ["SCENE_DIRECT_LIGHT_COUNT", "2"],
      ["SCENE_SHADOW_CASCADED_COUNT", "4"],
      ["SCENE_SHADOW_TYPE", "2"],
      ["SCENE_FOG_MODE", "1"],
      ["RENDERER_IS_RECEIVE_SHADOWS"],
      ["RENDERER_HAS_NORMAL"],
      ["MATERIAL_NEED_WORLD_POS"],
      ["RENDERER_MODE_SPHERE_BILLBOARD"]
    ])
      macros.enable(ShaderMacro.getByName(name, value));
    for (const subShader of shader.subShaders) {
      for (const pass of subShader.passes) {
        const variant = pass["_compileShaderSource"](engine, macros, false);
        const program = pass._getShaderProgram(engine, macros);
        program.bind();
        const native: WebGLProgram = gl.getParameter(gl.CURRENT_PROGRAM);
        expect(gl.getProgramParameter(native, gl.LINK_STATUS), pass.name).toBe(true);
        const layouts = variant.uniformBlocks ?? [];
        for (let block = 0; block < gl.getProgramParameter(native, gl.ACTIVE_UNIFORM_BLOCKS); ++block) {
          const name = gl.getActiveUniformBlockName(native, block)!;
          const layout = layouts.find((entry) => (entry.bindingName ?? entry.name) === name);
          expect(layout, name).toBeDefined();
          // ANGLE Metal can report the last occupied byte (e.g. 4 for one float), excluding trailing padding.
          const requiredBytes = gl.getActiveUniformBlockParameter(native, block, gl.UNIFORM_BLOCK_DATA_SIZE);
          expect(Math.ceil(requiredBytes / 16) * 16, name).toBe(layout!.byteLength);
          const indices = Array.from<number>(
            gl.getActiveUniformBlockParameter(native, block, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES)
          );
          const offsets = gl.getActiveUniforms(native, indices, gl.UNIFORM_OFFSET);
          const strides = gl.getActiveUniforms(native, indices, gl.UNIFORM_ARRAY_STRIDE);
          const matrixStrides = gl.getActiveUniforms(native, indices, gl.UNIFORM_MATRIX_STRIDE);
          for (let j = 0; j < indices.length; ++j) {
            const info = gl.getActiveUniform(native, indices[j])!;
            let member = info.name.replace(/\[0\]$/, "");
            if (member.startsWith(name + ".")) member = member.slice(name.length + 1);
            const field = layout!.members.find((entry) => entry.name === member);
            expect(field, info.name).toMatchObject({
              offset: offsets[j],
              arrayStride: strides[j],
              matrixStride: matrixStrides[j]
            });
          }
        }
        for (let i = 0; i < gl.getProgramParameter(native, gl.ACTIVE_UNIFORMS); ++i) {
          const info = gl.getActiveUniform(native, i)!;
          if (!gl.getUniformLocation(native, info.name)) continue;
          const looseName = info.name.replace(/\[0\]$/, "");
          const field = variant.looseUniforms?.find((entry) => entry.name === looseName);
          expect(field?.type, info.name).toMatch(/sampler/i);
        }
        expect(gl.getError()).toBe(gl.NO_ERROR);
      }
    }
  } finally {
    shader.destroy(true);
  }
});
