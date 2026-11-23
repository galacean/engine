import { snapshotEstimatedPosition, type SnapshotSurfaceProjection } from "./SnapshotSurfaceEncoding";
import { snapshotError } from "@galacean/engine-ai-chat/ai-chat/agent-snapshots";
import { EngineEventType, type Texture2D } from "@galacean/engine";
import type { ViewIdentityBuffer, ViewRef } from "./SeedWorldViewSnapshot";

export interface FrozenViewIdentityRange {
  base: number;
  count: number;
  ref: ViewRef;
  instanced: boolean;
  keys?: (string | undefined)[];
}

/** Packed identity/depth pixels, frozen camera and compact draw table for one captured frame. */
export class FrozenViewIdentityTexture implements ViewIdentityBuffer {
  readonly byteLength: number;
  private pixels?: Uint8Array;
  private disposed = false;
  private lost = false;
  private readonly onLost = () => {
    this.lost = true;
  };

  constructor(
    private readonly texture: Texture2D,
    private readonly ranges: FrozenViewIdentityRange[],
    private readonly projection: SnapshotSurfaceProjection
  ) {
    this.byteLength = texture.width * texture.height * 4;
    // The texture is no longer attached to an RT; keep it alive across resource GC.
    texture.isGCIgnored = true;
    texture.engine.on(EngineEventType.DeviceLost, this.onLost);
  }
  prepareReadback(signal?: AbortSignal): Promise<void> {
    return new Promise<Uint8Array>((resolve) => {
      const pixels = new Uint8Array(this.byteLength);
      resolve(this.texture.getPixelBufferAsync(pixels, signal).then(() => pixels));
    }).then((pixels) => {
      this.pixels = pixels;
      this.texture.destroy(true);
    });
  }
  get identityBits(): number {
    return this.projection.identityBits;
  }
  estimatedPosition(pixels: Uint8Array, offset: number, x: number, y: number): [number, number, number] | undefined {
    return snapshotEstimatedPosition(pixels, offset, x, y, this.texture.width, this.texture.height, this.projection);
  }
  read(x: number, y: number, width: number, height: number): Uint8Array {
    if (this.disposed || this.lost || (!this.pixels && this.texture.destroyed))
      throw snapshotError(
        "SNAPSHOT_EXPIRED",
        "SNAPSHOT_EXPIRED: Frozen GPU contents are unavailable; capture a new screenshot"
      );
    const pixels = new Uint8Array(width * height * 4);
    if (!this.pixels) {
      this.texture.getPixelBuffer(x, y, width, height, 0, pixels);
      return pixels;
    }
    const rowBytes = width * 4;
    for (let row = 0; row < height; row++) {
      const offset = ((y + row) * this.texture.width + x) * 4;
      pixels.set(this.pixels.subarray(offset, offset + rowBytes), row * rowBytes);
    }
    return pixels;
  }
  resolve(id: number): ViewRef | undefined {
    let lo = 0;
    for (let hi = this.ranges.length; lo < hi; ) {
      const mid = (lo + hi) >>> 1;
      if (this.ranges[mid]!.base <= id) lo = mid + 1;
      else hi = mid;
    }
    const range = this.ranges[lo - 1];
    if (!range || id >= range.base + range.count) return;
    const index = id - range.base,
      key = range.keys?.[index];
    return {
      ...range.ref,
      ...(range.instanced ? { instanceIndex: index } : {}),
      ...(key === undefined ? {} : { instanceKey: key })
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.texture.engine.off(EngineEventType.DeviceLost, this.onLost);
    if (!this.texture.destroyed) this.texture.destroy(true);
    this.pixels = undefined;
    this.ranges.length = 0;
  }
}
