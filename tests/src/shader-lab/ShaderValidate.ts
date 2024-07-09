import { expect } from "chai";
import { ShaderLab } from "@galacean/engine-shader-lab";
import { Shader, ShaderFactory } from "@galacean/engine-core";
import { ShaderStruct, CodeGenBackEnd } from "@galacean/engine-design/src/shader-lab";

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

function validateShaderPass(
  pass: ShaderStruct["subShaders"][number]["passes"][number],
  vertexSource: string,
  fragmentSource: string
) {
  if (pass.isUsePass) {
    // builtin shader pass
    const paths = pass.name.split("/");
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

    gl.shaderSource(vs, vertexSource);
    gl.compileShader(vs);

    gl.shaderSource(fs, ShaderFactory.convertTo300(fragmentSource, true));
    gl.compileShader(fs);

    expect(
      gl.getShaderParameter(vs, gl.COMPILE_STATUS),
      `Error compiling vertex shader: ${gl.getShaderInfoLog(vs)}\n\n${addLineNum(vertexSource)}`
    ).to.be.true;
    expect(
      gl.getShaderParameter(fs, gl.COMPILE_STATUS),
      `Error compiling fragment shader: ${gl.getShaderInfoLog(fs)}\n\n${addLineNum(fragmentSource)}`
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
  for (const key in includeMap) {
    shaderLab.registerInclude(key, includeMap[key]);
  }

  const start = performance.now();
  const shader = shaderLab.parseShaderStruct(shaderSource);
  console.log("struct compilation time: ", (performance.now() - start).toFixed(2), "ms");
  expect(shader).not.be.null;
  shader.subShaders.forEach((subShader) => {
    subShader.passes.forEach((pass) => {
      if (pass.isUsePass) return;
      const compiledPass = shaderLab.parseShaderPass(
        pass.contents,
        pass.vertexEntry,
        pass.fragmentEntry,
        [],
        CodeGenBackEnd.GLES300
      );
      validateShaderPass(pass, compiledPass.vertexSource, compiledPass.fragmentSource);
    });
  });
}
