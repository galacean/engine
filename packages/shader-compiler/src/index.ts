import { Logger } from "@galacean/engine-core";

export { ShaderCompiler } from "./ShaderCompiler";
export { GLES100Visitor, GLES300Visitor } from "./codeGen";

export { GSError, GSErrorName } from "@galacean/engine-shader-parser";

export const version = `__buildVersion`;

Logger.info(`Galacean Engine Shader Compiler Version: ${version}`);
