export { ShaderLab } from "./ShaderLab";

// #if _EDITOR
export { Preprocessor } from "./preprocessor";
export * from "./Error";
// #endif

//@ts-ignore
export const version = `__buildVersion`;

let mode = "Release";
// #if _EDITOR
mode = "Verbose";
// #endif

console.log(`Galacean ShaderLab version: ${version}. mode: ${mode}`);
