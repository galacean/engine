import { expect } from "chai";
import { ShaderLab } from "@galacean/engine-shader-lab";
import { Shader, ShaderFactory } from "@galacean/engine-core";
import { ISubShaderInfo } from "@galacean/engine-design";

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

function validateShaderPass(pass: ISubShaderInfo["passes"][number]) {
  if (typeof pass === "string") {
    // builtin shader pass
    const paths = pass.split("/");
    const shaderPass = Shader.find(paths[0])
      ?.subShaders.find((subShader) => subShader.name === paths[1])
      ?.passes.find((pass) => pass.name === paths[2]);
    expect(!!shaderPass).to.be.true;
    return shaderPass;
  } else {
    const gl = document.createElement("canvas").getContext("webgl2");
    expect(!!gl, "Not support webgl").to.be.true;

    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);

    gl.shaderSource(vs, pass.vertexSource);
    gl.compileShader(vs);

    gl.shaderSource(fs, ShaderFactory.convertTo300(pass.fragmentSource, true));
    gl.compileShader(fs);

    expect(
      gl.getShaderParameter(vs, gl.COMPILE_STATUS),
      `Error compiling vertex shader: ${gl.getShaderInfoLog(vs)}\n\n${addLineNum(pass.vertexSource)}`
    ).to.be.true;
    expect(
      gl.getShaderParameter(fs, gl.COMPILE_STATUS),
      `Error compiling fragment shader: ${gl.getShaderInfoLog(fs)}\n\n${addLineNum(pass.fragmentSource)}`
    ).to.be.true;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    expect(gl.getProgramParameter(program, gl.LINK_STATUS), `Error link shader: ${gl.getProgramInfoLog(program)}`).to.be
      .true;

    return pass;
  }
}

export function glslValidate(shaderSource, _shaderLab?: ShaderLab, includeMap = {}) {
  const shaderLab = _shaderLab ?? new ShaderLab();

  const start = performance.now();
  const shader = shaderLab.parseShader(shaderSource, [], includeMap);
  console.log("parse time: ", (performance.now() - start).toFixed(2));
  expect(shader).not.be.null;
  shader.subShaders.forEach((subShader) => {
    subShader.passes.map((pass) => validateShaderPass(pass));
  });
}
