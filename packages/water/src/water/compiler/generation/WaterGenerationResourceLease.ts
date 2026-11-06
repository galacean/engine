import { compareCanonicalBytes, isCanonicalSha256Hex } from "../shared/CanonicalWaterBinaryWriterV1";

export interface WaterGenerationContentResource {
  readonly contentKey: string;
  destroy(): void;
}

export interface WaterGenerationResourceLease<TResource extends WaterGenerationContentResource> {
  readonly resource: TResource;
  readonly reused: boolean;
  readonly released: boolean;
  release(): void;
}

interface ResourceEntry<TResource extends WaterGenerationContentResource> {
  readonly identityBytes: Uint8Array;
  readonly resource: TResource;
  referenceCount: number;
}

/**
 * Keeps no unleased LRU state. Active/candidate generations can share one
 * immutable resource, and the final Retire releases it deterministically.
 */
export class WaterGenerationResourceLeasePool<TResource extends WaterGenerationContentResource> {
  private readonly _entries = new Map<string, ResourceEntry<TResource>>();

  acquire(
    contentKey: string,
    identityBytes: Uint8Array,
    create: () => TResource
  ): WaterGenerationResourceLease<TResource> {
    if (!isCanonicalSha256Hex(contentKey)) throw new TypeError("Water resource content key must be SHA-256.");
    if (!(identityBytes instanceof Uint8Array) || identityBytes.byteLength === 0) {
      throw new TypeError("Water resource identity bytes must be non-empty.");
    }
    const existing = this._entries.get(contentKey);
    if (existing) {
      if (compareCanonicalBytes(existing.identityBytes, identityBytes) !== 0) {
        throw new Error(`HASH_COLLISION_DETECTED for Water resource '${contentKey}'.`);
      }
      existing.referenceCount++;
      return this._createLease(existing, true);
    }
    const resource = create();
    if (resource.contentKey !== contentKey) {
      resource.destroy();
      throw new Error("Water resource factory returned a mismatched content key.");
    }
    const entry: ResourceEntry<TResource> = {
      identityBytes: identityBytes.slice(),
      resource,
      referenceCount: 1
    };
    this._entries.set(contentKey, entry);
    return this._createLease(entry, false);
  }

  get resourceCount(): number {
    return this._entries.size;
  }

  get activeLeaseCount(): number {
    let count = 0;
    for (const entry of this._entries.values()) count += entry.referenceCount;
    return count;
  }

  private _createLease(entry: ResourceEntry<TResource>, reused: boolean): WaterGenerationResourceLease<TResource> {
    let released = false;
    return Object.freeze({
      resource: entry.resource,
      reused,
      get released() {
        return released;
      },
      release: () => {
        if (released) return;
        released = true;
        entry.referenceCount--;
        if (entry.referenceCount < 0) throw new Error("Water resource lease reference count underflow.");
        if (entry.referenceCount > 0) return;
        if (this._entries.get(entry.resource.contentKey) === entry) {
          this._entries.delete(entry.resource.contentKey);
        }
        entry.resource.destroy();
      }
    });
  }
}
