export { ShaderLab } from "./ShaderLab";

// #if _EDITOR
import { Preprocessor } from "./preprocessor";
export { Preprocessor };
// #endif

//@ts-ignore
export const version = `__buildVersion`;

let mode = "Release";
// #if _EDITOR
mode = "Editor";
// #endif

console.log(`Galacean ShaderLab version: ${version}. mode: ${mode}`);
