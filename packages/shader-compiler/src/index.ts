import { Logger } from "@galacean/engine-core";

export { ShaderCompiler } from "./ShaderCompiler";

export { GSError, GSErrorName } from "@galacean/engine-shader-parser/internal";

/**
 * Version of the shader compiler package, replaced with the package version during builds.
 */
export const version = `__buildVersion`;

Logger.info(`Galacean Engine Shader Compiler Version: ${version}`);
