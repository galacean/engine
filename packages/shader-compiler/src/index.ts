export { ShaderCompiler } from "./ShaderCompiler";

export { GSError, GSErrorName } from "@galacean/engine-shader-parser";

//@ts-ignore
export const version = `__buildVersion`;

let mode = "Release";
// #if _VERBOSE
mode = "Verbose";
// #endif

console.log(`Galacean Engine Shader Compiler Version: ${version} | Mode: ${mode}`);
