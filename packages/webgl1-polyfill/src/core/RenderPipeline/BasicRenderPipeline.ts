import type { BasicRenderPipeline as HostBasicRenderPipeline } from "@galacean/engine-core";
import { Mixin, Overwrite, callOriginal } from "@/override";

@Mixin("BasicRenderPipeline")
export class BasicRenderPipeline {
  @Overwrite
  render(...args: Parameters<HostBasicRenderPipeline["render"]>) {
    if (!Object.getOwnPropertyDescriptor(this, "_canUseBlitFrameBuffer")?.get) {
      Object.defineProperty(this, "_canUseBlitFrameBuffer", { configurable: true, get: () => false, set() {} });
    }
    return callOriginal(this, ...args);
  }
}
