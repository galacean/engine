import { BuiltinShaders, createBuiltinShaders, ShaderFactory } from "@galacean/engine-core";
import * as sources from "@galacean/engine-shader";

/**
 * Built-in shader pool. Lives in the `@galacean/engine` umbrella because the
 * specific set of bundled shaders is a property of the Galacean flavor of the
 * engine — `engine-core` is a generic runtime that knows nothing about which
 * shaders ship in the box.
 *
 * @internal
 */
export class ShaderPool {
  static init(): void {
    ShaderFactory._registerBuiltinIncludes(sources.shaderLibrary);
  }

  /**
   * Register all built-in shaders from precompiled `.shaderc` sources, plus
   * configure the particle feedback pass's transform-feedback varyings.
   */
  static createShaders(): BuiltinShaders {
    return createBuiltinShaders(sources);
  }
}
