export interface FarmClock {
  nowMs(): number;
}

export class BrowserSystemClock implements FarmClock {
  nowMs(): number {
    return Date.now();
  }
}

export class ManualFarmClock implements FarmClock {
  constructor(private currentTimeMs = 0) {
    if (!Number.isFinite(currentTimeMs) || currentTimeMs < 0)
      throw new Error("Manual farm clock requires a valid time.");
  }

  nowMs(): number {
    return this.currentTimeMs;
  }

  advanceBy(elapsedMs: number): number {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw new Error("Manual farm clock can only advance forward.");
    this.currentTimeMs += elapsedMs;
    return this.currentTimeMs;
  }

  set(timeMs: number): void {
    if (!Number.isFinite(timeMs) || timeMs < 0) throw new Error("Manual farm clock requires a valid time.");
    this.currentTimeMs = timeMs;
  }
}
