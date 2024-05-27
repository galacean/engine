import Preprocessor from "./refactor/Preprocessor";

export { ShaderLab } from "./ShaderLab";
export { ShaderParser } from "./parser/ShaderParser";
export { Preprocessor as OldPp } from "./preprocessor";
export { Preprocessor };

//@ts-ignore
export const version = `__buildVersion`;

console.log(`Galacean ShaderLab version: ${version}`);
