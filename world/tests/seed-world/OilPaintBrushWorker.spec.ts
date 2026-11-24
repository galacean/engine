import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OIL_PAINT_BRUSH_DEFAULT_SEED,
  OIL_PAINT_BRUSH_DEFAULT_SIZE,
  generateSeamlessImpastoPixels
} from "@galacean/engine-world-planning/spatial/oil-paint/OilPaintBrushGenerator";

describe("OilPaintBrush worker baking", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("generates deterministic RGBA8 impasto pixels with full height, gradient, and pigment spread", () => {
    const first = generateSeamlessImpastoPixels(128, 42);
    const second = generateSeamlessImpastoPixels(128, 42);
    expect(first.length).toBe(128 * 128 * 4);
    expect(first).toEqual(second);

    let minR = 255;
    let maxR = 0;
    let minG = 255;
    let maxG = 0;
    const pigmentValues = new Set<number>();
    for (let i = 0; i < first.length; i += 4) {
      if (first[i] < minR) minR = first[i];
      if (first[i] > maxR) maxR = first[i];
      if (first[i + 1] < minG) minG = first[i + 1];
      if (first[i + 1] > maxG) maxG = first[i + 1];
      pigmentValues.add(first[i + 3]);
    }
    expect(minR).toBeLessThanOrEqual(8);
    expect(maxR).toBeGreaterThanOrEqual(245);
    expect(maxG - minG).toBeGreaterThan(40);
    expect(pigmentValues.size).toBeGreaterThan(20);
  });

  it("bakes via module Worker, deduplicates prewarm + bake, and terminates idle Worker", async () => {
    vi.useFakeTimers();
    const spawned: { url: URL | string; options: WorkerOptions | undefined; posts: unknown[]; terminated: boolean }[] = [];

    class FakeWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      readonly record: (typeof spawned)[number];

      constructor(url: URL | string, options?: WorkerOptions) {
        this.record = { url, options, posts: [], terminated: false };
        spawned.push(this.record);
      }

      postMessage(message: { id: number; size: number; seed: number }): void {
        this.record.posts.push(message);
        const pixels = generateSeamlessImpastoPixels(message.size, message.seed);
        queueMicrotask(() => {
          this.onmessage?.({
            data: { id: message.id, size: message.size, seed: message.seed, pixels, elapsedMs: 1.5 }
          } as MessageEvent);
        });
      }

      terminate(): void {
        this.record.terminated = true;
      }
    }

    vi.stubGlobal("Worker", FakeWorker);
    const mod = await import("@galacean/engine-world-planning/spatial/oil-paint/OilPaintTextures");

    mod.prewarmOilPaintBrushTexture(64, 42);
    const [a, b] = await Promise.all([mod.bakeOilPaintBrushPixels(64, 42), mod.bakeOilPaintBrushPixels(64, 42)]);

    expect(a).toBe(b);
    expect(a.length).toBe(64 * 64 * 4);
    expect(spawned).toHaveLength(1);
    expect(String(spawned[0].url)).toContain("OilPaintBrush.worker.ts");
    expect(spawned[0].options).toEqual({ type: "module" });
    expect(spawned[0].posts).toHaveLength(1);
    expect(spawned[0].terminated).toBe(false);

    vi.advanceTimersByTime(450);
    expect(spawned[0].terminated).toBe(true);
  });

  it("falls back cleanly to CPU pixels when Worker is unavailable or errors", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      terminated = false;
      postMessage(): void {
        queueMicrotask(() => {
          this.onerror?.({ message: "worker load failed" } as ErrorEvent);
        });
      }
      terminate(): void {
        this.terminated = true;
      }
    }

    vi.stubGlobal("Worker", FailingWorker);
    const mod = await import("@galacean/engine-world-planning/spatial/oil-paint/OilPaintTextures");
    const pixels = await mod.bakeOilPaintBrushPixels(64, OIL_PAINT_BRUSH_DEFAULT_SEED);
    expect(pixels).toEqual(generateSeamlessImpastoPixels(64, OIL_PAINT_BRUSH_DEFAULT_SEED));
    expect(warnSpy).toHaveBeenCalled();

    expect(OIL_PAINT_BRUSH_DEFAULT_SIZE).toBe(512);
  });
});
