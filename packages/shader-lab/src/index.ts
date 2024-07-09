export { ShaderLab } from "./ShaderLab";

// #if _EDITOR
import { Preprocessor } from "./preprocessor";
export { Preprocessor };
// #endif

//@ts-ignore
export const version = `__buildVersion`;

console.log(`Galacean ShaderLab version: ${version}`);
