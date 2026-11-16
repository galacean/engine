import { TextureFormat } from "@galacean/engine-core";
import { Mixin, Overwrite } from "@/override";

@Mixin("BasicRenderPipeline")
export class BasicRenderPipeline {
  /** @internal */
  @Overwrite
  _getDefaultDepthOnlyFormat(): TextureFormat {
    return TextureFormat.Depth16;
  }

  /** @internal */
  @Overwrite
  _needsBackgroundColorCopy(): boolean {
    return true;
  }
}
