import { ShaderFactory } from "@galacean/engine";
import { fragmentList } from "./shaders";

let includeRegistered = false;

export function registerIncludes() {
  if (includeRegistered) return;

  for (const sourceFragment of fragmentList) {
    ShaderFactory.registerInclude(sourceFragment.includeKey, sourceFragment.source);
  }

  includeRegistered = true;
}

/**
 * @internal
 */
export { fragmentList };
