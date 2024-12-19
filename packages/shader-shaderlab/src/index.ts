import { Shader, ShaderFactory } from "@galacean/engine";
import { PBRSource, fragmentList } from "./shaders";

let includeRegistered = false;
let shaderRegistered = false;

export function registerIncludes() {
  if (includeRegistered) return;

  for (const sourceFragment of fragmentList) {
    ShaderFactory.registerInclude(sourceFragment.includeKey, sourceFragment.source);
  }

  includeRegistered = true;
}

export function registerShader() {
  if (shaderRegistered) return;

  Shader.create(PBRSource);

  shaderRegistered = true;
}

/**
 * @internal
 */
export { fragmentList };
