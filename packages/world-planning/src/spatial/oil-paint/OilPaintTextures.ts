import {
  ContentRestorer,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  type Engine
} from "@galacean/engine";
import {
  OIL_PAINT_BRUSH_DEFAULT_SEED,
  OIL_PAINT_BRUSH_DEFAULT_SIZE,
  generateSeamlessImpastoPixels
} from "./OilPaintBrushGenerator";

interface OilPaintBrushWorkerResponse {
  id: number;
  size?: number;
  seed?: number;
  pixels?: Uint8Array;
  elapsedMs?: number;
  error?: string;
}

interface PendingBrushBake {
  size: number;
  seed: number;
  resolve: (pixels: Uint8Array) => void;
}

/**
 * Dedicated Worker client for baking the procedural seamless swirling impasto brushstroke texture
 * off the main thread, matching `PlanningRasterClient`'s prewarm, zero-copy Transferable return,
 * and idle worker release behavior.
 */
class OilPaintBrushClient {
  private worker?: Worker;
  private sequence = 0;
  private readonly pending = new Map<number, PendingBrushBake>();
  private readonly pixelTasks = new Map<string, Promise<Uint8Array>>();
  private idleReleaseTimer?: ReturnType<typeof setTimeout>;

  /** Pre-bake the brush pixels in a background Worker so bake work overlaps with world boot. */
  prewarm(size = OIL_PAINT_BRUSH_DEFAULT_SIZE, seed = OIL_PAINT_BRUSH_DEFAULT_SEED): void {
    void this.bake(size, seed).catch(() => {});
  }

  /** Returns cached or Worker-baked RGBA8 brush pixels (falls back cleanly to CPU without Worker). */
  bake(size = OIL_PAINT_BRUSH_DEFAULT_SIZE, seed = OIL_PAINT_BRUSH_DEFAULT_SEED): Promise<Uint8Array> {
    const key = `${size}:${seed}`;
    const existing = this.pixelTasks.get(key);
    if (existing) return existing;
    const task = this.bakeUncached(size, seed);
    this.pixelTasks.set(key, task);
    return task;
  }

  private bakeUncached(size: number, seed: number): Promise<Uint8Array> {
    if (typeof Worker === "undefined") {
      return Promise.resolve(generateSeamlessImpastoPixels(size, seed));
    }
    if (this.idleReleaseTimer !== undefined) {
      clearTimeout(this.idleReleaseTimer);
      this.idleReleaseTimer = undefined;
    }
    try {
      const worker = this.ensureWorker();
      const id = ++this.sequence;
      return new Promise<Uint8Array>((resolve) => {
        this.pending.set(id, { size, seed, resolve });
        worker.postMessage({ id, size, seed });
      });
    } catch (error) {
      console.warn("[oil-paint] brush worker unavailable, falling back to CPU bake", error);
      return Promise.resolve(generateSeamlessImpastoPixels(size, seed));
    }
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./OilPaintBrush.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }: MessageEvent<OilPaintBrushWorkerResponse>) => {
      const job = this.pending.get(data.id);
      if (!job) return;
      this.pending.delete(data.id);
      if (data.error || !data.pixels) {
        console.warn("[oil-paint] brush worker bake failed, falling back to CPU bake", data.error);
        job.resolve(generateSeamlessImpastoPixels(job.size, job.seed));
      } else {
        job.resolve(data.pixels);
      }
      if (this.pending.size === 0) this.scheduleIdleRelease();
    };
    worker.onerror = (event) => {
      console.warn("[oil-paint] brush worker runtime error, falling back to CPU bake", event.message || event);
      this.terminateAndFallback();
    };
    this.worker = worker;
    return worker;
  }

  private scheduleIdleRelease(): void {
    if (this.idleReleaseTimer !== undefined) clearTimeout(this.idleReleaseTimer);
    this.idleReleaseTimer = setTimeout(() => {
      this.idleReleaseTimer = undefined;
      if (this.pending.size === 0 && this.worker) {
        this.worker.terminate();
        this.worker = undefined;
      }
    }, 400);
  }

  private terminateAndFallback(): void {
    if (this.idleReleaseTimer !== undefined) {
      clearTimeout(this.idleReleaseTimer);
      this.idleReleaseTimer = undefined;
    }
    this.worker?.terminate();
    this.worker = undefined;
    const remaining = [...this.pending.values()];
    this.pending.clear();
    for (const job of remaining) {
      job.resolve(generateSeamlessImpastoPixels(job.size, job.seed));
    }
  }
}

const brushClient = new OilPaintBrushClient();
const textureCache = new WeakMap<Engine, Texture2D>();
const textureTasks = new WeakMap<Engine, Promise<Texture2D | undefined>>();

function uploadImpastoTexture(engine: Engine, pixels: Uint8Array, size: number): Texture2D {
  const texture = new Texture2D(engine, size, size, TextureFormat.R8G8B8A8_UNorm, true, false);
  texture.isGCIgnored = true;
  texture.filterMode = TextureFilterMode.Trilinear;
  texture.wrapModeU = TextureWrapMode.Repeat;
  texture.wrapModeV = TextureWrapMode.Repeat;
  texture.anisoLevel = 1;
  const upload = (target: Texture2D) => {
    target.setPixelBuffer(pixels);
    target.generateMipmaps();
  };
  upload(texture);
  engine.resourceManager.addContentRestorer(
    new (class extends ContentRestorer<Texture2D> {
      override restoreContent(): void {
        upload(this.resource);
      }
    })(texture)
  );
  return texture;
}

/** Pre-bakes the seamless swirling oil-paint brush pixels in a background Worker (best-effort, idempotent). */
export function prewarmOilPaintBrushTexture(
  size = OIL_PAINT_BRUSH_DEFAULT_SIZE,
  seed = OIL_PAINT_BRUSH_DEFAULT_SEED
): void {
  brushClient.prewarm(size, seed);
}

/** Returns Worker-baked RGBA8 pixel data for the seamless swirling impasto brush texture. */
export function bakeOilPaintBrushPixels(
  size = OIL_PAINT_BRUSH_DEFAULT_SIZE,
  seed = OIL_PAINT_BRUSH_DEFAULT_SEED
): Promise<Uint8Array> {
  return brushClient.bake(size, seed);
}

/** Returns an engine-cached procedural seamless swirling impasto texture baked in a Web Worker. */
export function getOilPaintBrushTexture(engine: Engine): Promise<Texture2D | undefined> {
  if (engine.destroyed) return Promise.resolve(undefined);
  const cached = textureCache.get(engine);
  if (cached && !cached.destroyed) {
    return Promise.resolve(cached);
  }
  const inFlight = textureTasks.get(engine);
  if (inFlight) return inFlight;

  const task = brushClient
    .bake(OIL_PAINT_BRUSH_DEFAULT_SIZE, OIL_PAINT_BRUSH_DEFAULT_SEED)
    .then((pixels) => {
      if (engine.destroyed) return undefined;
      const current = textureCache.get(engine);
      if (current && !current.destroyed) return current;
      const texture = uploadImpastoTexture(engine, pixels, OIL_PAINT_BRUSH_DEFAULT_SIZE);
      textureCache.set(engine, texture);
      return texture;
    })
    .finally(() => {
      textureTasks.delete(engine);
    });
  textureTasks.set(engine, task);
  return task;
}
