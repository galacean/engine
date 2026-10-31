import type { ISpineRuntime as ISpineRuntimeContract } from "@galacean/engine-design";
import type { Texture2D } from "@galacean/engine";

/** Backend contract specialized for engine textures. */
export type ISpineRuntime = ISpineRuntimeContract<Texture2D>;
