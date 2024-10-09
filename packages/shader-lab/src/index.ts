export { ShaderLab } from "./ShaderLab";

// #if _VERBOSE
export { Preprocessor } from "./preprocessor";
export * from "./GSError";
// #endif

//@ts-ignore
export const version = `__buildVersion`;

let mode = "Release";
// #if _VERBOSE
mode = "Verbose";
// #endif

console.log(`Galacean ShaderLab version: ${version}. mode: ${mode}`);
