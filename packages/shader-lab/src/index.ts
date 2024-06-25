export { ShaderLab } from "./ShaderLab";

// #if _DEVELOPMENT
import Preprocessor from "./Preprocessor";
export { Logger, LoggerLevel } from "./Logger";
export { Preprocessor };
// #endif

//@ts-ignore
export const version = `__buildVersion`;

console.log(`Galacean ShaderLab version: ${version}`);
