import { expect } from "chai";
import { ShaderLab } from "@galacean/engine-shader-lab";

function addLineNum(str: string) {
  const lines = str.split("\n");
  const limitLength = (lines.length + 1).toString().length + 6;
  let prefix;
  return lines
    .map((line, index) => {
      prefix = `0:${index + 1}`;
      if (prefix.length >= limitLength) return prefix.substring(0, limitLength) + line;

      for (let i = 0; i < limitLength - prefix.length; i++) prefix += " ";

      return prefix + line;
    })
    .join("\n");
}

const shaderLab = new ShaderLab();

export function glslValidate(shaderSource) {
  const shader = shaderLab.parseShader(shaderSource);
  expect(shader).not.be.null;
  const pass = shader.subShaders[0].passes[0];

  const gl = document.createElement("canvas").getContext("webgl2");
  expect(!!gl, "Not support webgl").to.be.true;

  const vs = gl.createShader(gl.VERTEX_SHADER);
  const fs = gl.createShader(gl.FRAGMENT_SHADER);

  const fsPrefix = `precision mediump float;
  precision mediump int;
`;
  const fsSource = fsPrefix + pass.fragmentSource;
  const vsSource = "precision mediump float;\n" + pass.vertexSource;

  gl.shaderSource(vs, vsSource);
  gl.compileShader(vs);

  gl.shaderSource(fs, fsSource);
  gl.compileShader(fs);

  expect(
    gl.getShaderParameter(vs, gl.COMPILE_STATUS),
    `Error compiling vertex shader: ${gl.getShaderInfoLog(vs)}\n\n${addLineNum(vsSource)}`
  ).to.be.true;
  expect(
    gl.getShaderParameter(fs, gl.COMPILE_STATUS),
    `Error compiling fragment shader: ${gl.getShaderInfoLog(fs)}\n\n${addLineNum(fsSource)}`
  ).to.be.true;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);

  expect(gl.getProgramParameter(program, gl.LINK_STATUS), `Error link shader: ${gl.getProgramInfoLog(program)}`).to.be
    .true;

  return shader;
}
