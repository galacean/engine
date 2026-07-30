import type { Engine } from "../Engine";
import { BufferReadback } from "./BufferReadback";

/**
 * Reuses idle buffer readback resources across the engine.
 * @internal
 */
export class BufferReadbackPool {
  private readonly _freeReadbacks: BufferReadback[] = [];

  constructor(private readonly _engine: Engine) {}

  allocate(byteLength: number): BufferReadback {
    const freeReadbacks = this._freeReadbacks;
    let bestIndex = -1;
    let bestByteLength = Infinity;
    let largestIndex = -1;
    let largestByteLength = -1;
    for (let i = freeReadbacks.length - 1; i >= 0; i--) {
      const candidateByteLength = freeReadbacks[i].byteLength;
      if (candidateByteLength > largestByteLength) {
        largestIndex = i;
        largestByteLength = candidateByteLength;
      }
      if (candidateByteLength >= byteLength && candidateByteLength < bestByteLength) {
        bestIndex = i;
        bestByteLength = candidateByteLength;
        if (candidateByteLength === byteLength) {
          break;
        }
      }
    }

    const selectedIndex = bestIndex >= 0 ? bestIndex : largestIndex;
    if (selectedIndex >= 0) {
      const lastIndex = freeReadbacks.length - 1;
      const readback = freeReadbacks[selectedIndex];
      freeReadbacks[selectedIndex] = freeReadbacks[lastIndex];
      freeReadbacks.length = lastIndex;
      if (bestIndex >= 0) {
        return readback;
      }
      readback.destroy();
    }
    return new BufferReadback(this._engine, byteLength);
  }

  free(readback: BufferReadback): void {
    readback.reset();
    this._freeReadbacks.push(readback);
  }

  gc(): void {
    const freeReadbacks = this._freeReadbacks;
    for (let i = 0, n = freeReadbacks.length; i < n; i++) {
      freeReadbacks[i].destroy();
    }
    freeReadbacks.length = 0;
  }
}
