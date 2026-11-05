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

/** One immutable identity/depth RGBA8 texture, frozen camera and compact draw table. */
export class FrozenViewIdentityTexture implements ViewIdentityBuffer {
  readonly byteLength: number;
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
  get identityBits(): number {
    return this.projection.identityBits;
  }
  estimatedPosition(pixels: Uint8Array, offset: number, x: number, y: number): [number, number, number] | undefined {
    return snapshotEstimatedPosition(pixels, offset, x, y, this.texture.width, this.texture.height, this.projection);
  }
  read(x: number, y: number, width: number, height: number): Uint8Array {
    if (this.disposed || this.lost || this.texture.destroyed)
      throw snapshotError(
        "SNAPSHOT_EXPIRED",
        "SNAPSHOT_EXPIRED: Frozen GPU contents are unavailable; capture a new screenshot"
      );
    const pixels = new Uint8Array(width * height * 4);
    this.texture.getPixelBuffer(x, y, width, height, 0, pixels);
    return pixels;
  }
  resolve(id: number): ViewRef | undefined {
    let lo = 0,
      hi = this.ranges.length;
    while (lo < hi) {
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
    this.texture.destroy(true);
    this.ranges.length = 0;
  }
}
