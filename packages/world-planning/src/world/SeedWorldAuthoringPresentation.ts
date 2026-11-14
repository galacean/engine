import { Entity, Script } from "@galacean/engine";
import { WORLD_GENERATION_PRESENTATION } from "../presentation/WorldGenerationPresentation";

/** Uses the Generator's local reveal pacing on rendered Engine frames. */
export function playSeedWorldAuthoringPresentation(
  root: Entity,
  update: (progress: number) => void,
  signal?: AbortSignal,
  durationMs = WORLD_GENERATION_PRESENTATION.vegetationRevealDurationMs,
  readManualProgress?: () => number | undefined
): Promise<void> {
  signal?.throwIfAborted();
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new RangeError("Invalid presentation duration");
  return new Promise((resolve, reject) => {
    let elapsed = 0;
    let finished = false;
    let driver: SeedWorldAuthoringPresentationDriver | undefined;
    const finish = (error?: unknown): void => {
      if (finished) return;
      finished = true;
      signal?.removeEventListener("abort", abort);
      driver?.stop();
      error === undefined ? resolve() : reject(error);
    };
    const abort = (): void => finish(signal?.reason ?? new DOMException("Presentation aborted", "AbortError"));
    try {
      update(0);
      driver = root.addComponent(SeedWorldAuthoringPresentationDriver);
      driver.advance = (seconds) => {
        try {
          if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Invalid presentation frame delta");
          const manual = readManualProgress?.();
          if (manual !== undefined && (!Number.isFinite(manual) || manual < 0 || manual > 1)) {
            throw new RangeError("Manual presentation progress must be between zero and one");
          }
          elapsed = manual === undefined ? elapsed + seconds * 1000 : manual * durationMs;
          const t = Math.min(1, elapsed / durationMs);
          update(t * t * (3 - 2 * t));
          if (t === 1 && manual === undefined) finish();
        } catch (error) {
          finish(error);
        }
      };
      driver.cancel = () => finish(new Error("Presentation owner destroyed"));
      signal?.addEventListener("abort", abort, { once: true });
    } catch (error) {
      finish(error);
    }
  });
}

class SeedWorldAuthoringPresentationDriver extends Script {
  advance?: (seconds: number) => void;
  cancel?: () => void;
  private _armed = false;
  override onUpdate(seconds: number): void {
    if (!this._armed) {
      this._armed = true;
      this.advance?.(0);
      return;
    }
    this.advance?.(seconds);
  }
  stop(): void {
    this.advance = undefined;
    this.cancel = undefined;
    this.destroy();
  }
  override onDestroy(): void {
    this.cancel?.();
  }
}
