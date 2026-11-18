import { destroyPhotoResources } from "./SeedWorldPhotoResources";
import type { Texture2D } from "@galacean/engine";
import type { AgentViewImage } from "@galacean/engine-ai-chat/ai-chat/agent-types";
import type { ImageResourceBudget } from "@galacean/engine-ai-chat/ai-chat/image-resources";
import type { ViewAnnotation } from "./SeedWorldViewSnapshot";
import { exportPhotoImage } from "./SeedWorldPhotoGraphics";

/** Snapshot owns the immutable sRGB color texture; presentation only borrows it. */
export interface PhotoImage {
  readonly texture: Texture2D;
  readonly width: number;
  readonly height: number;
  export(marks: readonly ViewAnnotation[], signal?: AbortSignal): Promise<AgentViewImage>;
  dispose(): void;
}

export class GpuPhoto implements PhotoImage {
  private readonly release: () => void;
  private readonly abort = new AbortController();
  get width(): number {
    return this.texture.width;
  }
  get height(): number {
    return this.texture.height;
  }
  constructor(
    readonly texture: Texture2D,
    private readonly budget?: ImageResourceBudget
  ) {
    texture.isGCIgnored = true; // Snapshot ownership survives explicit resource GC until its lease expires.
    this.release = budget?.reserve("display", this.width * this.height * 4) ?? (() => {});
  }
  async export(marks: readonly ViewAnnotation[], signal?: AbortSignal): Promise<AgentViewImage> {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.aborted ? signal.reason : this.abort.signal.reason);
    signal?.addEventListener("abort", abort, { once: true });
    this.abort.signal.addEventListener("abort", abort, { once: true });
    if (signal?.aborted || this.abort.signal.aborted) abort();
    try {
      controller.signal.throwIfAborted();
      return await exportPhotoImage(this, structuredClone(marks), this.budget, controller.signal);
    } finally {
      signal?.removeEventListener("abort", abort);
      this.abort.signal.removeEventListener("abort", abort);
    }
  }
  dispose(): void {
    if (this.abort.signal.aborted) return;
    this.abort.abort(new DOMException("Snapshot disposed", "AbortError"));
    destroyPhotoResources([this.texture], this.release);
  }
}
