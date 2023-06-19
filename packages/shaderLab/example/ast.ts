import * as path from "path";
import { parseShader } from "../src";
import * as fs from "fs";

const shaderStr = fs.readFileSync(path.join(__dirname, "./demo.shader")).toString();
const shaderInfo = parseShader(shaderStr);

const outDir = path.join(__dirname, "../output");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

fs.writeFileSync(path.join(outDir, "ast.json"), JSON.stringify(shaderInfo.ast.toJson(false, true), null, 2));

// @ts-ignore
delete shaderInfo.ast;
console.dir(shaderInfo, { depth: null });

console.log("ast info written to", path.join(outDir, "ast.json"));
shaderInfo.subShaders.forEach((subShader) => {
  const shaderDirName = path.join(outDir, subShader.name);
  if (!fs.existsSync(shaderDirName)) fs.mkdirSync(shaderDirName);
  subShader.passes.forEach((pass) => {
    fs.writeFileSync(path.join(shaderDirName, `${pass.name}.vert`), pass.vert);
    fs.writeFileSync(path.join(shaderDirName, `${pass.name}.frag`), pass.frag);
  });
  console.log("glsl shader file written to", shaderDirName);
});
