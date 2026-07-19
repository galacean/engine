import * as LoaderObject from "./loader";
import * as RendererObject from "./renderer";
import { Loader } from "@galacean/engine";

for (const key in RendererObject) {
  Loader.registerClass(key, RendererObject[key]);
}
for (const key in LoaderObject) {
  Loader.registerClass(key, LoaderObject[key]);
}

export * from "./loader/index";
export * from "./renderer/index";
export { SpineBlendMode } from "./enums/SpineBlendMode";
export { SpineVertexStride } from "./SpineConstant";
export { registerSpineRuntime, getSpineRuntime } from "./runtime/SpineRuntimeRegistry";
export type { ISpineRuntime } from "./runtime/ISpineRuntime";
export type { ISpineRenderTarget } from "./runtime/ISpineRenderTarget";

export const version = `__buildVersion`;
console.log(`Galacean spine version: ${version}`);
