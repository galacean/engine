export { ShaderLab } from "./ShaderLab";

export * from "./GSError";

//@ts-ignore
export const version = `__buildVersion`;

let mode = "Release";
// #if _VERBOSE
mode = "Verbose";
// #endif

console.log(`Galacean Engine ShaderLab Version: ${version} | Mode: ${mode}`);
