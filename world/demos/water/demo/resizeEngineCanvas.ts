import type { WebGLEngine } from "@galacean/engine";

/** Keeps the render buffer aligned with one demo canvas without transferring its resize ownership to engine internals. */
export function resizeEngineCanvasByClientSize(
  engine: WebGLEngine,
  canvasId: string = "canvas",
  maximumPixelRatio: number = Number.POSITIVE_INFINITY
): void {
  const canvas = document.getElementById(canvasId);
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Water demo canvas "${canvasId}" is unavailable`);
  const requestedPixelRatio = window.devicePixelRatio || 1;
  const pixelRatio = Number.isFinite(maximumPixelRatio)
    ? Math.min(requestedPixelRatio, Math.max(1, maximumPixelRatio))
    : requestedPixelRatio;
  engine.canvas.setResolution(
    Math.max(1, Math.round(canvas.clientWidth * pixelRatio)),
    Math.max(1, Math.round(canvas.clientHeight * pixelRatio))
  );
}
