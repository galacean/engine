import { Script } from "@galacean/engine";

const FRAME_SAMPLE_COUNT = 120;
const DISPLAY_UPDATE_INTERVAL_SECONDS = 1;
const METRIC_LABEL_ID = "procedural-sky-frame-p95-label";
const METRIC_VALUE_ID = "procedural-sky-frame-p95-value";

/**
 * Adds the whole-frame P95 used by the integrated Terrain demo to the official Stats overlay.
 */
export class FrameP95Stats extends Script {
  private readonly _frameTimes: number[] = [];
  private _displayElapsed = 0;
  private _label: HTMLElement | null = null;
  private _value: HTMLElement | null = null;

  override onUpdate(): void {
    const actualDeltaTime = this.engine.time.actualDeltaTime;
    const frameTime = actualDeltaTime * 1000;
    if (frameTime > 0 && frameTime < 1000) {
      this._frameTimes.push(frameTime);
      if (this._frameTimes.length > FRAME_SAMPLE_COUNT) this._frameTimes.shift();
    }

    this._displayElapsed += actualDeltaTime;
    if (this._displayElapsed < DISPLAY_UPDATE_INTERVAL_SECONDS) return;
    this._displayElapsed %= DISPLAY_UPDATE_INTERVAL_SECONDS;

    const value = this._ensureMetricRow();
    if (value) value.textContent = `${percentile95(this._frameTimes).toFixed(1)} ms`;
  }

  override onDestroy(): void {
    this._label?.remove();
    this._value?.remove();
    this._label = null;
    this._value = null;
  }

  private _ensureMetricRow(): HTMLElement | null {
    if (this._value?.isConnected) return this._value;

    const metrics = document.querySelector<HTMLDListElement>(".gl-perf dl");
    if (!metrics) return null;

    this._label = document.getElementById(METRIC_LABEL_ID);
    this._value = document.getElementById(METRIC_VALUE_ID);
    if (this._label && this._value) return this._value;

    this._label = document.createElement("dt");
    this._label.id = METRIC_LABEL_ID;
    this._label.title = "最近 120 帧中，95% 的帧耗不超过该毫秒值。";
    this._label.textContent = "Frame P95 / 帧耗";
    this._value = document.createElement("dd");
    this._value.id = METRIC_VALUE_ID;
    this._value.textContent = "—";
    metrics.append(this._label, this._value);
    return this._value;
  }
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}
