/** Synchronizes one camera-owned reflection service immediately before its source Camera renders. */
import { Script, type Camera } from "@galacean/engine-core";
import type { WaterReflectionService } from "./WaterReflectionService";

export interface WaterReflectionPreRenderSynchronizerOptions {
  readonly sourceCamera: Camera;
  readonly service: Pick<WaterReflectionService, "update">;
  readonly beforeUpdate?: () => void;
  readonly afterUpdate?: () => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * Runs reflection work after camera controls finish `onLateUpdate`, while still
 * preceding the source Camera's render. Attach exactly one instance to the
 * source Camera entity so environment/SSR availability is synchronized before
 * transparent Water receivers consume it.
 */
export class WaterReflectionPreRenderSynchronizer extends Script {
  private _options?: WaterReflectionPreRenderSynchronizerOptions;

  configure(options: WaterReflectionPreRenderSynchronizerOptions): void {
    if (options.sourceCamera.entity !== this.entity) {
      throw new Error("Water reflection pre-render synchronizer must be attached to its source Camera entity.");
    }
    this._options = options;
  }

  clear(): void {
    this._options = undefined;
  }

  override onBeginRender(camera: Camera): void {
    const options = this._options;
    if (!options || camera !== options.sourceCamera) return;

    try {
      options.beforeUpdate?.();
      options.service.update();
      options.afterUpdate?.();
    } catch (error) {
      if (options.onError) {
        options.onError(error);
        return;
      }
      throw error;
    }
  }

  override onDestroy(): void {
    this.clear();
  }
}
