import { generateSeamlessImpastoPixels } from "./OilPaintBrushGenerator";

interface OilPaintBrushWorkerRequest {
  id: number;
  size: number;
  seed: number;
}

/** Reuses the same pure impasto generator as tests and CPU fallback. No renderer or editor state. */
self.onmessage = ({ data }: MessageEvent<OilPaintBrushWorkerRequest>) => {
  try {
    const start = performance.now();
    const pixels = generateSeamlessImpastoPixels(data.size, data.seed);
    self.postMessage(
      {
        id: data.id,
        size: data.size,
        seed: data.seed,
        pixels,
        elapsedMs: performance.now() - start
      },
      [pixels.buffer]
    );
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error) });
  }
};
