import { BuiltinShaders, createBuiltinShaders, ShaderFactory } from "@galacean/engine-core";
import * as sources from "@galacean/engine-shader";

/** @internal */
export class ShaderPool {
  static init(): void {
    ShaderFactory._registerBuiltinIncludes(sources.shaderLibrary);
  }

  static createShaders(): BuiltinShaders {
    return createBuiltinShaders(sources);
  }
}
