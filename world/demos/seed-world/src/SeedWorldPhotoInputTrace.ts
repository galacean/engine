type TraceData = Record<string, unknown>;

/** Opt-in, bounded local diagnostics. No image bytes, scene contents, or network transmission. */
export class SeedWorldPhotoInputTrace {
  readonly enabled = new URLSearchParams(location.search).get("photoInputTrace") === "1";
  private readonly records: TraceData[] = [];
  private readonly sampled = new Map<string, number>();
  private readonly abort = new AbortController();
  private readonly session = crypto.randomUUID();
  private readonly started = performance.now();
  private output?: HTMLScriptElement;
  private serial = 0;
  private lastInput = -Infinity;
  private flushTimer?: ReturnType<typeof setTimeout>;

  constructor(private readonly context: () => TraceData) {
    if (!this.enabled) return;
    // Read-only DOM snapshot lets the app's browser tools retrieve the trace without evaluating runtime internals.
    this.output = document.createElement("script");
    this.output.id = "seed-world-photo-input-trace";
    this.output.type = "application/json";
    document.body.append(this.output);
    const signal = this.abort.signal;
    for (const type of [
      "pointerdown",
      "pointermove",
      "pointerup",
      "pointercancel",
      "gotpointercapture",
      "lostpointercapture"
    ] as const) {
      window.addEventListener(
        type,
        (event) => {
          if (type !== "pointermove" || event.buttons) this.lastInput = performance.now();
          if (type === "pointermove") {
            if (event.buttons) this.sample("raw-move", this.event(event));
          } else this.record("raw-" + type, this.event(event));
        },
        { capture: true, signal }
      );
    }
    for (const type of ["mousedown", "mouseup"] as const)
      window.addEventListener(
        type,
        (event) =>
          this.record("raw-" + type, {
            x: event.clientX,
            y: event.clientY,
            button: event.button,
            buttons: event.buttons
          }),
        { capture: true, signal }
      );
    window.addEventListener(
      "error",
      (event) =>
        this.record("window-error", { message: event.message, stack: String(event.error?.stack ?? "").slice(0, 2000) }),
      { signal }
    );
    window.addEventListener(
      "unhandledrejection",
      (event) =>
        this.record("unhandled-rejection", { reason: String(event.reason?.stack ?? event.reason).slice(0, 2000) }),
      { signal }
    );
    this.record("trace-ready", { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio } });
  }
  event(event: PointerEvent): TraceData {
    return {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      primary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      pressure: event.pressure,
      x: event.clientX,
      y: event.clientY,
      trusted: event.isTrusted,
      prevented: event.defaultPrevented,
      target: event.target instanceof Element ? `${event.target.tagName}#${event.target.id}` : String(event.target)
    };
  }
  record(kind: string, detail: TraceData = {}): void {
    if (!this.enabled) return;
    const record = {
      seq: ++this.serial,
      ms: Math.round(performance.now() - this.started),
      kind,
      ...detail,
      state: this.context()
    };
    this.records.push(record);
    if (this.records.length > 600) this.records.splice(0, this.records.length - 600);
    // High-frequency samples stay in the ring; boundary events also appear in console logs.
    if (!kind.endsWith("-sample")) console.info("[PhotoInput] " + JSON.stringify(record));
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), 200);
  }
  sample(kind: string, detail: TraceData = {}): void {
    if (!this.enabled) return;
    const now = performance.now();
    if (kind === "frame" && now - this.lastInput > 1500) return;
    if (now - (this.sampled.get(kind) ?? -Infinity) < 250) return;
    this.sampled.set(kind, now);
    this.record(kind + "-sample", detail);
  }
  private flush(): void {
    this.flushTimer = undefined;
    if (this.output)
      this.output.textContent = JSON.stringify({
        schemaVersion: 1,
        session: this.session,
        capturedAt: new Date().toISOString(),
        records: this.records
      });
  }
  dispose(): void {
    this.abort.abort();
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flush();
    this.output?.remove();
  }
}
