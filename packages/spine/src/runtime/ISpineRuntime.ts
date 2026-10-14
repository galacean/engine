import type { ISpineRuntime as ISpineRuntimeContract } from "@galacean/engine-design";
import type { Texture2D } from "@galacean/engine";
import type { ISpineRenderTarget } from "./ISpineRenderTarget";

/** Bind the shared backend contract to Galacean textures and rendering targets. */
export type ISpineRuntime = ISpineRuntimeContract<Texture2D, ISpineRenderTarget>;
