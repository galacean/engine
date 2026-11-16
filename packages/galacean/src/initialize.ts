import * as CoreObjects from "@galacean/engine-core";
import { Engine, Loader, SystemInfo } from "@galacean/engine-core";
import { ShaderPool } from "./ShaderPool";

//@ts-ignore
export const version: string = `__buildVersion`;

/** @internal Register shared classes and built-in shaders once across entry points. */
export function initialize(): void {
  if (Engine._builtinShaders) return;
  for (const key in CoreObjects) {
    Loader.registerClass(key, CoreObjects[key]);
  }

  SystemInfo._initialize();
  ShaderPool.init();
  Engine._builtinShaders = ShaderPool.createShaders();
}
